import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitPersistent, hideReview, unhideReview } from "@/lib/db";
import { isAdminRequest } from "@/lib/adminAuth";
import { getClientFingerprint, readLimitedJson } from "@/lib/requestSecurity";

export async function POST(request: NextRequest) {
  // Per-fingerprint throttle: limits any single client regardless of outcome.
  const fingerprint = getClientFingerprint(request);
  if (!(await checkRateLimitPersistent(`admin:${fingerprint}`, 20, 15 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!isAdminRequest(request)) {
    // Global failure bucket: only consumed on *failed* auth attempts.
    // Legitimate admins never touch it, so an attacker flooding bad tokens
    // cannot lock out the real moderator — they can only exhaust their own
    // per-fingerprint quota and the global failure allowance.
    if (!(await checkRateLimitPersistent("admin:failures:global", 100, 15 * 60 * 1000))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await readLimitedJson(request, 4 * 1024);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const body = parsed.data;
    const reviewId =
      typeof body.reviewId === "string" ? body.reviewId.trim() : "";
    // Require strict boolean true to hide; anything else (false, 0, null,
    // undefined, omitted) is treated as unhide. This prevents the JS coercion
    // trap where `0 !== false` evaluates to true and hides instead of unhides.
    const hidden = body.hidden === true;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId)) {
      return NextResponse.json({ error: "Invalid review ID" }, { status: 400 });
    }

    const ok = hidden ? await hideReview(reviewId) : await unhideReview(reviewId);
    if (!ok) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, hidden });
  } catch {
    return NextResponse.json({ error: "Failed to update review visibility" }, { status: 500 });
  }
}
