import { createHash } from "crypto";
import type { NextRequest } from "next/server";

const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

function normalizeAllowedHost(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  try {
    // Support entries like "https://example.com" as well as "example.com".
    return new URL(value).host.toLowerCase();
  } catch {
    return value;
  }
}

function getAllowedOrigins(): Set<string> {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(normalizeAllowedHost)
    .filter((s): s is string => Boolean(s));

  // Developer-friendly defaults for local runs. Production remains strict and
  // requires explicit ALLOWED_ORIGINS configuration.
  if (process.env.NODE_ENV !== "production") {
    fromEnv.push("127.0.0.1:3000", "localhost:3000", "127.0.0.1", "localhost");
  }

  return new Set(fromEnv);
}

function hostFromUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeIp(raw: string | null): string {
  if (!raw) return "unknown";
  // HTTP proxies append IPs to the right. The last element is the most
  // trustworthy IP (the one that connected to the closest proxy).
  const parts = raw.split(",");
  const candidate = parts[parts.length - 1]?.trim().toLowerCase() || "unknown";
  if (/^[0-9a-f:.]+$/i.test(candidate) || /^[0-9.]+$/.test(candidate)) {
    return candidate;
  }
  return "unknown";
}

function extractClientIpFromForwarded(
  forwardedFor: string | null,
  trustedProxyCount: number
): string {
  if (!forwardedFor || trustedProxyCount <= 0) return "unknown";
  const chain = forwardedFor
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (chain.length === 0) return "unknown";

  // Each trusted proxy appends one entry to XFF (the IP of whoever connected
  // to it). With N trusted proxies the rightmost N entries are trustworthy;
  // everything to the left could have been injected by the client.
  //
  // Correct algorithm: take only the rightmost (N+1) entries, then read the
  // leftmost of that slice. This is immune to the client prepending fake IPs.
  //
  // Old formula (chain.length - 1 - N) is WRONG: an attacker who prepends N-1
  // fake entries shifts the target index left onto their forged value.
  const startIndex = Math.max(0, chain.length - (trustedProxyCount + 1));
  const trustedChain = chain.slice(startIndex);
  return normalizeIp(trustedChain[0] ?? null);
}

function getTrustedProxyCount(): number {
  const n = parseInt(process.env.TRUSTED_PROXY_COUNT ?? "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function resolveClientIp(request: NextRequest): string {
  const trustedProxyCount = getTrustedProxyCount();
  if (trustedProxyCount <= 0) return "unknown";

  // Only derive client IP from X-Forwarded-For using the trusted-proxy count.
  // We intentionally ignore cf-connecting-ip and x-real-ip: both are freely
  // settable by any client that connects to the server without going through
  // Cloudflare or Nginx respectively. Trusting them without gating on a
  // deployment-type flag would allow trivial IP spoofing.
  return extractClientIpFromForwarded(
    request.headers.get("x-forwarded-for"),
    trustedProxyCount
  );
}

export function getClientFingerprint(request: NextRequest): string {
  // Forwarding headers (x-forwarded-for, cf-connecting-ip, etc.) are freely
  // settable by any client that connects directly to this server. Only trust
  // them when TRUSTED_PROXY_COUNT > 0, meaning a verified edge proxy (e.g.
  // Nginx, Cloudflare) sits in front and normalises those headers.
  const ip = resolveClientIp(request);
  const ua = request.headers.get("user-agent") || "unknown";
  const lang = request.headers.get("accept-language") || "unknown";
  // The session ID is injected by middleware to prevent legitimate users sharing
  // the same UA and Lang from rate-limiting each other if the IP is unknown.
  const session = request.headers.get("x-session-id") || "unknown";
  const raw = `${ip}|${ua}|${lang}|${session}`;
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Stable client key for anti-abuse controls that should survive session churn.
 * Uses a signed device ID injected by middleware instead of the session ID.
 */
export function getStableClientFingerprint(request: NextRequest): string {
  const ip = resolveClientIp(request);
  const ua = request.headers.get("user-agent") || "unknown";
  const lang = request.headers.get("accept-language") || "unknown";
  const device = request.headers.get("x-device-id") || "unknown";
  const raw = `${ip}|${ua}|${lang}|${device}`;
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * A session-independent hash for use as the report deduplication key.
 * Unlike getClientFingerprint, this excludes the signed session ID so that
 * clearing cookies (and therefore rotating to a new session) does not allow
 * the same physical client to report the same review a second time.
 */
export function getStableReporterHash(request: NextRequest): string {
  // Prefix with "reporter:" so the hash space is distinct from fingerprints.
  const stable = getStableClientFingerprint(request);
  return createHash("sha256").update(`reporter:${stable}`).digest("hex");
}

export function getSessionAgeSeconds(request: NextRequest): number {
  const raw = request.headers.get("x-session-age") ?? "";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function getDeviceAgeSeconds(request: NextRequest): number {
  const raw = request.headers.get("x-device-age") ?? "";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function getShardedGlobalRateKey(
  baseKey: string,
  fingerprint: string,
  shardCount = 16
): string {
  const safeShardCount = Math.max(1, Math.floor(shardCount));
  const byte = Number.parseInt(fingerprint.slice(0, 2), 16);
  const shard = Number.isFinite(byte) ? byte % safeShardCount : 0;
  return `${baseKey}:shard:${shard}`;
}

export function assertAllowedOrigin(request: NextRequest): {
  ok: boolean;
  error?: string;
} {
  const requestHost = (request.headers.get("host") || "").toLowerCase();
  const originHost = hostFromUrl(request.headers.get("origin"));
  const refererHost = hostFromUrl(request.headers.get("referer"));
  const allowed = getAllowedOrigins();

  // Prevent DNS rebinding by asserting the requested Host is in our allowed list
  // before we trust it as a "sameHost" fallback.
  if (!allowed.has(requestHost)) {
    return { ok: false, error: "Host header is not allowed" };
  }

  const sameHost =
    (originHost && originHost === requestHost) ||
    (refererHost && refererHost === requestHost);

  if (sameHost) return { ok: true };
  if (originHost && allowed.has(originHost)) return { ok: true };
  if (refererHost && allowed.has(refererHost)) return { ok: true };

  return {
    ok: false,
    error: "Request origin is not allowed",
  };
}

// Maximum time allowed to receive the complete request body.
// Prevents Slowloris-style attacks where a client sends data one byte at a time.
const BODY_READ_TIMEOUT_MS = 10_000;

/**
 * Reads the request body as text, enforces a byte limit on the *actual* body
 * (not just the Content-Length declaration which can be omitted or spoofed),
 * applies a wall-clock timeout to prevent Slowloris DoS, then parses it as
 * JSON. Returns the parsed value or an error descriptor.
 */
export async function readLimitedJson<T = Record<string, unknown>>(
  request: NextRequest,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  if (!request.body) {
    return { ok: false, error: "Empty request body", status: 400 };
  }

  let text = "";
  let totalBytes = 0;

  // A single timed-out promise races every read chunk. If the client stalls
  // beyond BODY_READ_TIMEOUT_MS, the race rejects and we return 408.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), BODY_READ_TIMEOUT_MS)
  );

  try {
    const reader = request.body.getReader();
    const decoder = new TextDecoder("utf8");

    while (true) {
      const result = await Promise.race([reader.read(), timeout]);
      if (result.done) break;

      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        reader.releaseLock();
        return { ok: false, error: "Request payload too large", status: 413 };
      }

      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode(); // flush
  } catch (err) {
    if (err instanceof Error && err.message === "timeout") {
      return { ok: false, error: "Request body read timed out", status: 408 };
    }
    return { ok: false, error: "Failed to read request body", status: 400 };
  }

  try {
    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "Invalid JSON format", status: 400 };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
}
