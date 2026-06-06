import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import {
  checkRateLimitPersistent,
  getCachedSummary,
  getReviewsByUnit,
  setCachedSummary,
} from "@/lib/db";
import { getUnit } from "@/lib/units";
import { summarizeReviews } from "@/lib/summarizer";
import {
  getDeviceAgeSeconds,
  getSessionAgeSeconds,
  getShardedGlobalRateKey,
  getStableClientFingerprint,
} from "@/lib/requestSecurity";

const SUMMARY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const unitCode = request.nextUrl.searchParams.get("unitCode") ?? "";
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  if (!unitCode) {
    return NextResponse.json({ error: "unitCode is required" }, { status: 400 });
  }

  const unit = getUnit(unitCode);
  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  // Summarization is expensive — cap to 10 requests per minute per client.
  // Use the stable device fingerprint so session rotation can't bypass the cap.
  const fingerprint = getStableClientFingerprint(request);
  const globalShardKey = getShardedGlobalRateKey("get:summarize:global", fingerprint);
  const isDev = process.env.NODE_ENV !== "production";
  const minSessionAgeSeconds = isDev ? 0 : 3;
  const minDeviceAgeSeconds = isDev ? 0 : 20;

  if (getSessionAgeSeconds(request) < minSessionAgeSeconds) {
    return NextResponse.json(
      { error: "Please wait a few seconds before requesting a summary." },
      { status: 429 }
    );
  }
  if (getDeviceAgeSeconds(request) < minDeviceAgeSeconds) {
    return NextResponse.json(
      { error: "Please wait a short time before requesting from a new device." },
      { status: 429 }
    );
  }
  if (
    !checkRateLimitPersistent(globalShardKey, 25, 60 * 1000) ||
    !checkRateLimitPersistent(`get:summarize:${fingerprint}`, 10, 60 * 1000)
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const reviews = getReviewsByUnit(unitCode);

  if (reviews.length <= 1) {
    return NextResponse.json({
      unitCode,
      summary: null,
      reviewCount: reviews.length,
      message: "Summary available when more than 1 review is posted",
    });
  }

  const reviewHash = createHash("sha256")
    .update(reviews.map((r) => `${r.id}|${r.createdAt}|${r.content}`).join("\n"))
    .digest("hex");
  if (!forceRefresh) {
    const cached = getCachedSummary(unitCode, reviews.length, reviewHash);
    if (cached) {
      return NextResponse.json({
        unitCode,
        summary: cached.summary,
        reviewCount: reviews.length,
        generatedAt: cached.generatedAt,
        cached: true,
      });
    }
  }

  const summary = await summarizeReviews(unitCode, unit.name, reviews);
  setCachedSummary(unitCode, reviews.length, reviewHash, summary, SUMMARY_CACHE_TTL_MS);

  return NextResponse.json({
    unitCode,
    summary,
    reviewCount: reviews.length,
    generatedAt: new Date().toISOString(),
  });
}
