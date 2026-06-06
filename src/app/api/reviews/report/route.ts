import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitPersistent, reportReviewWithHash } from "@/lib/db";
import {
  assertAllowedOrigin,
  getDeviceAgeSeconds,
  getSessionAgeSeconds,
  readLimitedJson,
  getStableClientFingerprint,
  getStableReporterHash,
  getShardedGlobalRateKey,
} from "@/lib/requestSecurity";

export async function POST(request: NextRequest) {
  try {
    const originCheck = assertAllowedOrigin(request);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const parsed = await readLimitedJson(request, 8 * 1024);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const body = parsed.data;
    const reviewId =
      typeof body.reviewId === "string" ? body.reviewId.trim() : "";

    // Basic UUID v4-ish format check (reviews use crypto.randomUUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId)) {
      return NextResponse.json({ error: "Invalid review ID" }, { status: 400 });
    }

    // Light rate limiting on reports to prevent abuse.
    // Stable device-based keys prevent bypass via session churn.
    const rateLimitKey = getStableClientFingerprint(request);
    const reporterHash = getStableReporterHash(request);
    const globalShardKey = getShardedGlobalRateKey("report:global", rateLimitKey);

    if (getSessionAgeSeconds(request) < 5) {
      return NextResponse.json(
        { error: "Please wait a few seconds before reporting." },
        { status: 429 }
      );
    }
    if (getDeviceAgeSeconds(request) < 60) {
      return NextResponse.json(
        { error: "Please wait a short time before reporting from a new device." },
        { status: 429 }
      );
    }

    if (
      !(await checkRateLimitPersistent(globalShardKey, 40, 10 * 60 * 1000)) ||
      !(await checkRateLimitPersistent(`report:${rateLimitKey}`, 10, 10 * 60 * 1000))
    ) {
      return NextResponse.json(
        { error: "Too many reports. Please try again later." },
        { status: 429 }
      );
    }

    // Window check and insert are now atomic inside reportReviewWithHash,
    // eliminating the previous TOCTOU race between a separate check and insert.
    const result = await reportReviewWithHash(reviewId, reporterHash);

    if (result.windowExceeded) {
      return NextResponse.json(
        { error: "This review has reached the report limit for now." },
        { status: 429 }
      );
    }

    if (!result.ok) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, alreadyReported: result.alreadyReported });
  } catch {
    return NextResponse.json({ error: "Failed to report review" }, { status: 500 });
  }
}
