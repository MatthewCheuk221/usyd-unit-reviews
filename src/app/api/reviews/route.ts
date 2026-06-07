import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimitPersistent,
  createReview,
  getReviewsByUnit,
} from "@/lib/db";
import { getUnit } from "@/lib/units";
import {
  assertAllowedOrigin,
  getDeviceAgeSeconds,
  getSessionAgeSeconds,
  readLimitedJson,
  resolveClientIp,
  getStableClientFingerprint,
  getShardedGlobalRateKey,
} from "@/lib/requestSecurity";
import { verifyTurnstileToken } from "@/lib/captcha";
import type { Grade, PublicReview, ReviewInput } from "@/lib/types";
import { GRADES, YEARS } from "@/lib/types";

const VALID_GRADES = new Set<string>(GRADES);
const REVIEW_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const REVIEW_PER_UNIT_WINDOW_MS = 10 * 60 * 1000;
const REVIEW_GLOBAL_SHARD_LIMIT = 60;
const REVIEW_PER_FINGERPRINT_LIMIT = 12;
const REVIEW_PER_UNIT_LIMIT = 5;
const MIN_SESSION_AGE_SECONDS = 2;
const MIN_DEVICE_AGE_SECONDS = 8;

function cleanText(value: unknown, maxLength: number): string {
  const str = typeof value === "string" ? value : String(value ?? "");
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // ASCII control characters (preserving \t, \n, \r)
    .replace(/[\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/g, "") // Unicode BiDi overrides, zero-width chars, BOM
    .trim()
    .slice(0, maxLength);
}

function validateRating(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return null;
  }
  return n;
}

export async function GET(request: NextRequest) {
  const unitCode = request.nextUrl.searchParams.get("unitCode") ?? "";
  if (!unitCode) {
    return NextResponse.json({ error: "unitCode is required" }, { status: 400 });
  }

  // Validate the unit code exists — prevents probing arbitrary strings
  if (!getUnit(unitCode)) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  // Light rate limiting to prevent bulk enumeration / scraping
  const fingerprint = getStableClientFingerprint(request);
  const shardKey = getShardedGlobalRateKey("get:reviews:global", fingerprint);
  if (
    !(await checkRateLimitPersistent(shardKey, 120, 60 * 1000)) ||
    !(await checkRateLimitPersistent(`get:reviews:${fingerprint}`, 60, 60 * 1000))
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const reviews = await getReviewsByUnit(unitCode);
  const safe: PublicReview[] = reviews.map(({ reportedCount, ...rest }) => {
    void reportedCount;
    return rest;
  });
  return NextResponse.json(safe);
}

export async function POST(request: NextRequest) {
  try {
    const originCheck = assertAllowedOrigin(request);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const parsed = await readLimitedJson(request, 16 * 1024);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const body = parsed.data;

    const ratingContent = validateRating(body.ratingContent);
    const ratingWorkload = validateRating(body.ratingWorkload);
    const ratingExamDifficulty = validateRating(body.ratingExamDifficulty);
    const ratingFinalResult = validateRating(body.ratingFinalResult);

    const year = Number(body.year);
    const currentYear = new Date().getFullYear();
    if (!YEARS.includes(year) || year > currentYear) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    // Validate that the unit actually exists
    const unitCode = cleanText(body.unitCode, 20);
    if (!getUnit(unitCode)) {
      return NextResponse.json({ error: "Invalid unit code" }, { status: 400 });
    }

    // Rate limiting — use stable device fingerprint throughout so that session
    // rotation cannot bypass the per-user or global caps. The device-age warmup
    // below provides the corresponding identity-churn deterrent.
    const stableKey = getStableClientFingerprint(request);
    const globalKey = `review:global:${stableKey}`;
    const unitKey = `review:unit:${stableKey}:${unitCode}`;
    const globalShardKey = getShardedGlobalRateKey("review:global", stableKey);

    // Prevent rapid session rotation abuse by requiring a short warm-up age.
    if (getSessionAgeSeconds(request) < MIN_SESSION_AGE_SECONDS) {
      return NextResponse.json(
        { error: "Please wait a few seconds before submitting your first review." },
        { status: 429 }
      );
    }
    if (getDeviceAgeSeconds(request) < MIN_DEVICE_AGE_SECONDS) {
      return NextResponse.json(
        { error: "Please wait a short time before submitting from a new device." },
        { status: 429 }
      );
    }

    if (
      !(await checkRateLimitPersistent(globalShardKey, REVIEW_GLOBAL_SHARD_LIMIT, REVIEW_RATE_LIMIT_WINDOW_MS)) || // sharded global cap
      !(await checkRateLimitPersistent(globalKey, REVIEW_PER_FINGERPRINT_LIMIT, REVIEW_RATE_LIMIT_WINDOW_MS)) || // per-device cap
      !(await checkRateLimitPersistent(unitKey, REVIEW_PER_UNIT_LIMIT, REVIEW_PER_UNIT_WINDOW_MS)) // per-unit cap
    ) {
      return NextResponse.json(
        { error: "You are submitting reviews too quickly. Please wait and try again." },
        { status: 429 }
      );
    }

    if (process.env.TURNSTILE_SECRET_KEY) {
      const turnstileToken =
        typeof body.turnstileToken === "string" ? body.turnstileToken : "";
      const captchaOk = await verifyTurnstileToken(
        turnstileToken,
        resolveClientIp(request)
      );
      if (!captchaOk) {
        return NextResponse.json(
          { error: "CAPTCHA verification failed. Please try again." },
          { status: 400 }
        );
      }
    }

    // Sanitize and enforce lengths
    const title = cleanText(body.title, 200);
    const coordinatorName = cleanText(body.coordinatorName, 120);
    const lecturerName = cleanText(body.lecturerName, 120);
    const tutorName = cleanText(body.tutorName, 120);
    const content = cleanText(body.content, 4000);

    const grade = typeof body.grade === "string" ? body.grade : "";

    if (title.length < 3) {
      return NextResponse.json(
        { error: "Review title must be at least 3 characters." },
        { status: 400 }
      );
    }
    if (coordinatorName.length < 1) {
      return NextResponse.json(
        { error: "Coordinator name is required." },
        { status: 400 }
      );
    }
    if (lecturerName.length < 1) {
      return NextResponse.json(
        { error: "Lecturer name is required." },
        { status: 400 }
      );
    }
    if (content.length < 10) {
      return NextResponse.json(
        { error: "Review content must be at least 10 words." },
        { status: 400 }
      );
    }
    if (!VALID_GRADES.has(grade)) {
      return NextResponse.json({ error: "Invalid grade value." }, { status: 400 });
    }
    if (ratingContent === null) {
      return NextResponse.json({ error: "Unit Content rating is required." }, { status: 400 });
    }
    if (ratingWorkload === null) {
      return NextResponse.json(
        { error: "Overall Workload rating is required." },
        { status: 400 }
      );
    }
    if (ratingExamDifficulty === null) {
      return NextResponse.json(
        { error: "Exam Difficulty rating is required." },
        { status: 400 }
      );
    }
    if (ratingFinalResult === null) {
      return NextResponse.json({ error: "Final Result rating is required." }, { status: 400 });
    }

    const input: ReviewInput = {
      unitCode,
      title,
      coordinatorName,
      lecturerName,
      tutorName,
      year,
      content,
      grade: grade as Grade,
      ratingContent,
      ratingWorkload,
      ratingExamDifficulty,
      ratingFinalResult,
    };

    const review = await createReview(input);
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    console.error("Failed to create review:", error);
    const message =
      error instanceof Error && error.message.includes("TURSO_DATABASE_URL")
        ? "Database is not configured for production hosting."
        : "Failed to create review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
