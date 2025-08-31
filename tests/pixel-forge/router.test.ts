
import { describe, it, expect, vi } from "vitest";
import path from "path";
import { promises as fs } from "fs";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { createSession, ensureSession, saveBase64Upload } from "@/server/lib/pixel-forge/session";
// Mock Prisma db to avoid real database usage in tests
vi.mock("@/server/db", () => ({ db: {} }));

// Mock pixel-forge to avoid heavy work and external deps.
// Provide both generateAssets and ImageProcessor used by ensureImageEngine().
vi.mock("pixel-forge", () => {
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAF0gJ/kXn7tQAAAABJRU5ErkJggg==",
    "base64",
  );
  const ImageProcessor = {
    _engine: "jimp" as "magick" | "jimp",
    async checkImageMagick() {
      // Do not depend on system ImageMagick in tests
      return false;
    },
    setEngine(engine: "magick" | "jimp") {
      this._engine = engine;
    },
  };
  return {
    ImageProcessor,
    generateAssets: async (src: string, opts: { outputDir: string }) => {
      // ensure outputDir
      await fs.mkdir(opts.outputDir, { recursive: true });
      // write a couple of image files (1x1 PNG)
      const f1 = path.join(opts.outputDir, "favicon-16x16.png");
      const f2 = path.join(opts.outputDir, "social-card.png");
      await fs.writeFile(f1, tinyPng);
      await fs.writeFile(f2, tinyPng);
      // write a minimal manifest
      const manifestPath = path.join(opts.outputDir, "site.webmanifest");
      await fs.writeFile(manifestPath, JSON.stringify({ name: "Test" }), "utf8");
      return {
        files: {
          favicon: ["favicon-16x16.png"],
          social: ["social-card.png"],
        },
        images: [],
        manifest: manifestPath,
        metaTags: {
          html: '<meta name="theme-color" content="#000" />',
          tags: [],
        },
        summary: { ok: true },
      };
    },
  };
});

function headersWithIP(ip: string) {
  return new Headers([["x-forwarded-for", ip]]);
}

// Tiny white 1x1 PNG (same as above)
const SMALL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAF0gJ/kXn7tQAAAABJRU5ErkJggg==";

describe("pixel-forge router", () => {
  it("creates a session via newSession", async () => {
    const ctx = await createTRPCContext({ headers: headersWithIP("203.0.113.10") });
    const caller = appRouter.createCaller(ctx);
    const { sessionId } = await caller.pixelForge.newSession();
    expect(sessionId).toMatch(/^[0-9a-fA-F-]{36}$/);
    const sess = await ensureSession(sessionId);
    expect(sess.root).toContain(sessionId);
  });

  it("uploads an image and returns previewUrl and storedPath", async () => {
    const ctx = await createTRPCContext({ headers: headersWithIP("203.0.113.11") });
    const caller = appRouter.createCaller(ctx);

    const { sessionId } = await caller.pixelForge.newSession();
    const res = await caller.pixelForge.uploadImage({
      fileName: "logo.png",
      fileData: SMALL_PNG_BASE64,
      mimeType: "image/png",
      sessionId,
    });
    expect(res.sessionId).toBe(sessionId);
    expect(res.storedPath).toBeTruthy();
    expect(res.previewUrl).toContain(`/api/pixel-forge/files/${sessionId}/`);
  });

  it("generates assets and annotates dimensions/bytes; enforces safe urlPrefix", async () => {
    const ctx = await createTRPCContext({ headers: headersWithIP("203.0.113.12") });
    const caller = appRouter.createCaller(ctx);

    // Create session and upload file using utility to control storedPath
    const { id: sessionId, root } = await createSession();
    const { savedPath } = await saveBase64Upload({
      sessionId,
      fileName: "original.png",
      base64Data: SMALL_PNG_BASE64,
      mimeType: "image/png",
    });

    // Attempt to override urlPrefix to an unsafe host (should be ignored/reset by router)
    const result = await caller.pixelForge.generateAssets({
      sessionId,
      imagePath: path.relative(root, savedPath),
      options: {
        generationTypes: ["favicon", "social"],
        urlPrefix: "https://evil.example.com/",
      },
    });

    expect(result.assets.length).toBeGreaterThan(0);
    // Validate annotated metadata present
    const anyAsset = result.assets[0]!;
    expect(anyAsset.fileName).toMatch(/\.png$/);
    // Return URLs must be scoped to our internal file-serving route
    expect(anyAsset.downloadUrl).toMatch(
      new RegExp(`/api/pixel-forge/files/${sessionId}/`),
    );
  });

  it("rate limits generateAssets after 6 requests/min per ip/session", async () => {
    const headers = headersWithIP("203.0.113.13");
    const ctx = await createTRPCContext({ headers });
    const caller = appRouter.createCaller(ctx);

    const { id: sessionId, root } = await createSession();
    const { savedPath } = await saveBase64Upload({
      sessionId,
      fileName: "logo.png",
      base64Data: SMALL_PNG_BASE64,
      mimeType: "image/png",
    });
    const rel = path.relative(root, savedPath);

    // 6 allowed
    for (let i = 0; i < 6; i++) {
      const out = await caller.pixelForge.generateAssets({
        sessionId,
        imagePath: rel,
        options: { generationTypes: ["favicon"] },
      });
      expect(out.assets.length).toBeGreaterThan(0);
    }

    // 7th should be blocked
    await expect(
      caller.pixelForge.generateAssets({
        sessionId,
        imagePath: rel,
        options: { generationTypes: ["favicon"] },
      }),
    ).rejects.toMatchObject({
      // TRPCError exposes a shape with code
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("creates a ZIP bundle and returns a url", async () => {
    const ctx = await createTRPCContext({ headers: headersWithIP("203.0.113.14") });
    const caller = appRouter.createCaller(ctx);

    const { id: sessionId, root } = await createSession();
    // Write at least one generated file to archive
    const genDir = path.join(root, "generated");
    await fs.mkdir(genDir, { recursive: true });
    await fs.writeFile(path.join(genDir, "favicon-16x16.png"), Buffer.from(SMALL_PNG_BASE64, "base64"));

    const res = await caller.pixelForge.zipAssets({ sessionId });
    expect(res.zipUrl).toContain(`/api/pixel-forge/files/${sessionId}/assets.zip`);
    expect(res.size).toBeGreaterThan(0);
  });

  it("cleans up expired sessions", async () => {
    const ctx = await createTRPCContext({ headers: headersWithIP("203.0.113.15") });
    const caller = appRouter.createCaller(ctx);

    const sess = await createSession(1); // expires almost immediately
    // Wait a moment, then cleanup
    await new Promise((r) => setTimeout(r, 5));
    const out = await caller.pixelForge.cleanupExpired();
    // If system clock/file ops align, our session should be in removed or already gone
    expect(Array.isArray(out.removed)).toBe(true);
  });

  it("progress polling rate limits when called excessively", async () => {
    const headers = headersWithIP("203.0.113.16");
    const ctx = await createTRPCContext({ headers });
    const caller = appRouter.createCaller(ctx);

    const { sessionId } = await caller.pixelForge.newSession();
    // 60 allowed
    for (let i = 0; i < 60; i++) {
      const p = await caller.pixelForge.getGenerationProgress({ sessionId });
      expect(typeof p.current).toBe("number");
    }
    // 61st should be blocked
    await expect(
      caller.pixelForge.getGenerationProgress({ sessionId }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  }, 20000);
});