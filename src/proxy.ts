import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "session_id";
const DEVICE_COOKIE = "device_id";
const SESSION_PARTS = 3;
const DEVICE_PARTS = 3;
const LEGACY_DEVICE_PARTS = 2;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

// In development, generate one random ephemeral secret per process start so
// the fallback is never guessable even without a .env file. Sessions will
// be invalidated on each server restart, which is acceptable in dev.
// In production we MUST have RATE_LIMIT_COOKIE_SECRET configured.
const DEV_EPHEMERAL_SECRET = (() => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
})();

function getSessionSecret(): string {
  // Only RATE_LIMIT_COOKIE_SECRET is accepted — intentionally NOT falling back
  // to ADMIN_REVIEW_TOKEN. The two secrets serve different purposes; sharing
  // them would double the blast-radius of either key being compromised.
  const configured = process.env.RATE_LIMIT_COOKIE_SECRET;

  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    // Fail-closed: do NOT serve traffic without a real secret in production.
    throw new Error(
      "RATE_LIMIT_COOKIE_SECRET environment variable must be set in production. " +
        "Generate one with: openssl rand -hex 32"
    );
  }

  // Development-only: warn once and use the per-process ephemeral secret.
  console.warn(
    "[proxy] RATE_LIMIT_COOKIE_SECRET is not set. " +
      "Using an ephemeral per-process secret (sessions reset on restart). " +
      "Set RATE_LIMIT_COOKIE_SECRET in .env for stable sessions."
  );
  return DEV_EPHEMERAL_SECRET;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function signSession(id: string, issuedAtSec: number): Promise<string> {
  const payload = `${id}.${issuedAtSec}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return bytesToHex(new Uint8Array(signature));
}

async function signValue(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  return bytesToHex(new Uint8Array(signature));
}

async function parseAndVerifySession(raw: string | undefined): Promise<{
  id: string;
  issuedAtSec: number;
} | null> {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== SESSION_PARTS) return null;

  const [id, issuedAtRaw, sig] = parts;
  const issuedAtSec = Number(issuedAtRaw);
  if (!id || !Number.isFinite(issuedAtSec) || !sig) return null;

  const expectedSig = await signSession(id, issuedAtSec);
  if (!constantTimeEqual(sig, expectedSig)) {
    return null;
  }

  return { id, issuedAtSec };
}

async function parseAndVerifyDevice(
  raw: string | undefined
): Promise<{ id: string; issuedAtSec: number } | null> {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length === DEVICE_PARTS) {
    const [id, issuedAtRaw, sig] = parts;
    const issuedAtSec = Number(issuedAtRaw);
    if (!id || !Number.isFinite(issuedAtSec) || !sig) return null;
    const expectedSig = await signSession(id, issuedAtSec);
    if (!constantTimeEqual(sig, expectedSig)) return null;
    return { id, issuedAtSec };
  }

  // Backward compatibility with the previous 2-part format: id.sig
  if (parts.length === LEGACY_DEVICE_PARTS) {
    const [id, sig] = parts;
    if (!id || !sig) return null;
    const expectedSig = await signValue(id);
    if (!constantTimeEqual(sig, expectedSig)) return null;
    // Treat legacy devices as new so they get re-issued in the modern format.
    return { id, issuedAtSec: Math.floor(Date.now() / 1000) };
  }

  return null;
}

export async function proxy(request: NextRequest) {
  // Generate a fresh per-request nonce. This allows us to drop
  // 'unsafe-inline' from script-src while still letting Next.js
  // inject its own hydration scripts.
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}'`;
  const connectSrc = isDev
    ? "connect-src 'self' ws: wss:"
    : "connect-src 'self'";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    scriptSrc,
    // Tailwind outputs a linked stylesheet; keep unsafe-inline only for
    // styles because some browsers need it for React-injected style attrs.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    connectSrc,
    // Explicitly block plugin content (<object>, <embed>, <applet>).
    // Without this, default-src 'self' would permit same-origin plugins,
    // leaving a legacy plugin execution path open.
    "object-src 'none'",
  ].join("; ");

  // Ensure every client has a signed session cookie for rate-limiting fallback.
  // Signing prevents attackers from forging arbitrary session IDs at will.
  const nowSec = Math.floor(Date.now() / 1000);
  const parsed = await parseAndVerifySession(
    request.cookies.get(SESSION_COOKIE)?.value
  );
  const sessionId = parsed?.id ?? crypto.randomUUID();
  const issuedAtSec = parsed?.issuedAtSec ?? nowSec;
  const sessionAgeSec = Math.max(0, nowSec - issuedAtSec);
  const signature = await signSession(sessionId, issuedAtSec);
  const signedSession = `${sessionId}.${issuedAtSec}.${signature}`;

  // Stable signed device ID for abuse controls that must survive session resets.
  const parsedDevice = await parseAndVerifyDevice(
    request.cookies.get(DEVICE_COOKIE)?.value
  );
  const deviceId = parsedDevice?.id ?? crypto.randomUUID();
  const deviceIssuedAtSec = parsedDevice?.issuedAtSec ?? nowSec;
  const deviceAgeSec = Math.max(0, nowSec - deviceIssuedAtSec);
  const deviceSig = await signSession(deviceId, deviceIssuedAtSec);
  const signedDevice = `${deviceId}.${deviceIssuedAtSec}.${deviceSig}`;

  // Forward the nonce and session ID to server components via request headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-session-id", sessionId);
  requestHeaders.set("x-session-age", String(sessionAgeSec));
  requestHeaders.set("x-device-id", deviceId);
  requestHeaders.set("x-device-age", String(deviceAgeSec));

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set the session cookie.
  response.cookies.set(SESSION_COOKIE, signedSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  response.cookies.set(DEVICE_COOKIE, signedDevice, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  // Set all security headers on the response.
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  // Restrict all browser features this app never uses.
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  );

  return response;
}

// Run on every route except static assets, where a nonce is not meaningful.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
