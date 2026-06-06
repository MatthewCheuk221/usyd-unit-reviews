import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export function isAdminRequest(request: NextRequest): boolean {
  const configured = process.env.ADMIN_REVIEW_TOKEN;
  if (!configured) return false;

  const bearer = request.headers.get("authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (token.length === 0) return false;

  // Hash both strings to a constant 32-byte length before comparing.
  // This perfectly masks the true token length from timing side-channels.
  try {
    const a = createHash("sha256").update(token).digest();
    const b = createHash("sha256").update(configured).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
