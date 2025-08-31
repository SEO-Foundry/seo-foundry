// Simple in-memory security utilities for rate limiting and abuse prevention.
// For production, consider moving to a durable store (Redis) behind a reverse proxy.

type BucketState = {
  windowStart: number;
  count: number;
};

const buckets = new Map<string, BucketState>();

/**
 * Enforce a fixed-window rate limit for a key.
 * Returns true if allowed, false if over the limit.
 */
export function enforceFixedWindowLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now - cur.windowStart >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

/**
 * Extract best-effort client ip from headers.
 * Note: in serverless/proxy environments, this depends on platform header pass-through.
 */
export function getClientIp(headers: Headers): string {
  const xfwd = headers.get("x-forwarded-for") ?? headers.get("X-Forwarded-For");
  if (xfwd) {
    // typically "client, proxy1, proxy2"
    const first = xfwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip") ?? headers.get("X-Real-IP");
  if (real) return real.trim();
  const cf = headers.get("cf-connecting-ip") ?? headers.get("CF-Connecting-IP");
  if (cf) return cf.trim();
  // Fallback: user agent hash to at least shard buckets a bit
  const ua = headers.get("user-agent") ?? "unknown";
  return `ua:${hashString(ua)}`;
}

/**
 * Compose a limiter key for a route, considering sessionId when available.
 */
export function limiterKey(route: string, headers: Headers, sessionId?: string | null): string {
  const ip = getClientIp(headers);
  return sessionId ? `${route}:${ip}:${sessionId}` : `${route}:${ip}`;
}

/**
 * Tiny non-crypto hash for fallback keys
 */
function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return String(h >>> 0);
}

/**
 * Concurrency guard set to prevent duplicate in-flight work per session
 */
const inFlight = new Set<string>();
export function acquireLock(key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}
export function releaseLock(key: string): void {
  inFlight.delete(key);
}