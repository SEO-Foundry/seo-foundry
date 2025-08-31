import { describe, it, expect } from "vitest";
import {
  enforceFixedWindowLimit,
  limiterKey,
  acquireLock,
  releaseLock,
} from "@/server/lib/security";

describe("security: rate limiter", () => {
  it("allows first N requests and blocks after limit within window", () => {
    const key = "test:rl:1";
    // fresh window
    const allowed = Array.from({ length: 5 }, () => enforceFixedWindowLimit(key, 5, 10_000));
    expect(allowed.every(Boolean)).toBe(true);
    // next one should be blocked
    expect(enforceFixedWindowLimit(key, 5, 10_000)).toBe(false);
  });

  it("resets after window passes", async () => {
    const key = "test:rl:2";
    expect(enforceFixedWindowLimit(key, 1, 10)).toBe(true);
    expect(enforceFixedWindowLimit(key, 1, 10)).toBe(false);
    // wait for 2ms to exceed window
    await new Promise((r) => setTimeout(r, 20));
    expect(enforceFixedWindowLimit(key, 1, 10)).toBe(true);
  });

  it("limiterKey respects route/ip/session", () => {
    const headers = new Headers([["x-forwarded-for", "203.0.113.5"]]);
    const k1 = limiterKey("routeA", headers);
    const k2 = limiterKey("routeA", headers, "session-1");
    const k3 = limiterKey("routeB", headers, "session-1");

    expect(k1).toContain("routeA");
    expect(k2).toContain("routeA");
    expect(k2).toContain("session-1");
    expect(k3).toContain("routeB");
    expect(k2).not.toBe(k3);
  });
});

describe("security: concurrency locks", () => {
  it("prevents concurrent acquisition for same key", () => {
    const key = "lock:test";
    expect(acquireLock(key)).toBe(true);
    expect(acquireLock(key)).toBe(false);
    releaseLock(key);
    expect(acquireLock(key)).toBe(true);
    releaseLock(key);
  });
});