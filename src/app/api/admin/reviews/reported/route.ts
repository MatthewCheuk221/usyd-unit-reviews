import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitPersistent, getReportedReviews } from "@/lib/db";
import { isAdminRequest } from "@/lib/adminAuth";
import { getClientFingerprint } from "@/lib/requestSecurity";

export async function GET(request: NextRequest) {
  // Per-fingerprint throttle: limits any single client regardless of outcome.
  const fingerprint = getClientFingerprint(request);
  if (!checkRateLimitPersistent(`admin:${fingerprint}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!isAdminRequest(request)) {
    // Global failure bucket: only consumed on *failed* auth attempts.
    // Legitimate admins never touch it, so an attacker flooding bad tokens
    // cannot lock out the real moderator — they can only exhaust their own
    // per-fingerprint quota and the global failure allowance.
    if (!checkRateLimitPersistent("admin:failures:global", 100, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "100");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 500)
    : 100;

  return NextResponse.json({
    reviews: getReportedReviews(limit),
  });
}
