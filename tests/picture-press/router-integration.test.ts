import { describe, it, expect, vi } from "vitest";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import type { AppRouter } from "@/server/api/root";

// Mock Prisma db to avoid real database usage in tests
vi.mock("@/server/db", () => ({ db: {} }));

// Mock the converter module to avoid actual ImageMagick dependency in tests
vi.mock("@/server/lib/picture-press/converter", () => ({
  convertImages: vi.fn(),
  validateConversionOptions: vi.fn(),
}));

// Mock the security module to control lock behavior in tests
vi.mock("@/server/lib/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/lib/security")>();
  return {
    ...actual,
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
  };
});

describe("Picture Press router integration", () => {
  it("should be properly registered in the main tRPC router", () => {
    // Verify that picturePress is available on the appRouter
    expect(appRouter.picturePress).toBeDefined();
    expect(typeof appRouter.picturePress).toBe("object");
  });

  it("should expose all expected procedures", () => {
    const procedures = [
      "newSession",
      "uploadImages", 
      "getConversionProgress",
      "cleanupExpired",
      "convertImages",
      "zipConvertedImages",
      "cleanupSession",
    ];

    procedures.forEach((procedure) => {
      expect(appRouter.picturePress[procedure as keyof typeof appRouter.picturePress]).toBeDefined();
    });
  });

  it("should have proper TypeScript types exported", () => {
    // This test ensures the AppRouter type includes picturePress
    type PicturePressRouter = AppRouter["picturePress"];
    
    // If this compiles, the types are properly exported
    const _typeCheck: PicturePressRouter = appRouter.picturePress;
    expect(_typeCheck).toBeDefined();
  });

  it("should be callable through the main router", async () => {
    const ctx = await createTRPCContext({
      headers: new Headers([["x-forwarded-for", "203.0.113.100"]]),
    });
    const caller = appRouter.createCaller(ctx);

    // Test that we can call a Picture Press procedure through the main router
    const result = await caller.picturePress.newSession();
    expect(result.sessionId).toMatch(/^[0-9a-fA-F-]{36}$/);
  });

  it("should maintain proper procedure isolation", async () => {
    const ctx = await createTRPCContext({
      headers: new Headers([["x-forwarded-for", "203.0.113.101"]]),
    });
    const caller = appRouter.createCaller(ctx);

    // Verify that Picture Press procedures don't interfere with other routers
    const ppSession = await caller.picturePress.newSession();
    const pfSession = await caller.pixelForge.newSession();

    expect(ppSession.sessionId).not.toBe(pfSession.sessionId);
    expect(ppSession.sessionId).toMatch(/^[0-9a-fA-F-]{36}$/);
    expect(pfSession.sessionId).toMatch(/^[0-9a-fA-F-]{36}$/);
  });
});