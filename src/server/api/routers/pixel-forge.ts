import path from "path";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  createSession as createPFSess,
  ensureSession as ensurePFSess,
  saveBase64Upload,
  readProgress as readPFProgress,
  cleanupSession as cleanupPFSess,
  writeProgress as writePFProgress,
  updateMeta as updatePFMeta,
  isAllowedMime,
  cleanupExpiredSessions as cleanupExpiredPF,
  maybeCleanupExpiredSessions,
} from "@/server/lib/pixel-forge/session";
import { ensureImageEngine } from "@/server/lib/pixel-forge/deps";
import { generateAssets as pfGenerateAssets } from "pixel-forge";
import { createDirectoryZip } from "@/server/lib/shared/zip-utils";
import { promises as fsp } from "fs";
import { imageSize } from "image-size";
import {
  enforceFixedWindowLimit,
  limiterKey,
  acquireLock,
  releaseLock,
} from "@/server/lib/security";

// Minimal result type from pixel-forge programmatic API
type PixelForgeResult = {
  files: {
    favicon?: string[];
    pwa?: string[];
    social?: string[];
    web?: string[];
    seo?: string[];
    transparent?: string[];
  };
  manifest?: string;
  images?: unknown;
  metaTags: {
    html: string;
    tags: unknown;
  };
  summary?: unknown;
};

// Helper to construct a stable file URL that a future route handler will serve
function toFileUrl(
  sessionId: string,
  sessionRoot: string,
  absoluteFilePath: string,
): string {
  const rel = path.relative(sessionRoot, absoluteFilePath);
  const encodedParts = rel.split(path.sep).map(encodeURIComponent).join("/");
  return `/api/pixel-forge/files/${encodeURIComponent(sessionId)}/${encodedParts}`;
}

export const pixelForgeRouter = createTRPCRouter({
  // Create a new session explicitly. The upload procedure will also create one implicitly if omitted.
  newSession: publicProcedure.mutation(async ({ ctx }) => {
    const key = limiterKey("pf:newSession", ctx.headers);
    if (!enforceFixedWindowLimit(key, 20, 60_000)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many sessions, please slow down.",
      });
    }
    void (await maybeCleanupExpiredSessions());
    const sess = await createPFSess();
    return { sessionId: sess.id };
  }),

  // Upload a base64 image payload for processing. Accepts optional sessionId to reuse an existing session.
  uploadImage: publicProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        fileData: z.string().min(1), // raw base64 (no data URL prefix)
        mimeType: z
          .string()
          .min(1)
          .refine((m) => isAllowedMime(m), "Unsupported MIME type"),
        sessionId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateKey = limiterKey(
        "pf:upload",
        ctx.headers,
        input.sessionId ?? null,
      );
      if (!enforceFixedWindowLimit(rateKey, 30, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many uploads, please slow down.",
        });
      }
      void (await maybeCleanupExpiredSessions());
      // Ensure or create session
      const sessionId = input.sessionId ?? (await createPFSess()).id;
      const sessPaths = await ensurePFSess(sessionId);

      // Persist upload
      try {
        const { savedPath, size, originalName } = await saveBase64Upload({
          sessionId,
          fileName: input.fileName,
          base64Data: input.fileData,
          mimeType: input.mimeType,
          maxBytes: 10 * 1024 * 1024, // 10MB cap
        });

        // Build preview URL (served by route handler)
        const previewUrl = toFileUrl(sessionId, sessPaths.root, savedPath);

        return {
          sessionId,
          originalName,
          size,
          storedPath: path.relative(sessPaths.root, savedPath),
          previewUrl,
        };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            err instanceof Error
              ? err.message
              : "Upload failed due to invalid file or size limit",
          cause: err as Error,
        });
      }
    }),

  // Generate assets with pixel-forge (server-side)
  generateAssets: publicProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        // Path returned from uploadImage.storedPath (relative to session root)
        imagePath: z.string().min(1),
        options: z
          .object({
            generationTypes: z
              .array(z.enum(["favicon", "pwa", "social", "seo", "web", "all"]))
              .min(1),
            transparent: z.boolean().optional(),
            appName: z.string().optional(),
            description: z.string().optional(),
            themeColor: z.string().optional(),
            backgroundColor: z.string().optional(),
            format: z.enum(["png", "jpeg", "webp"]).optional(),
            quality: z.number().min(1).max(100).optional(),
            urlPrefix: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateKey = limiterKey("pf:generate", ctx.headers, input.sessionId);
      if (!enforceFixedWindowLimit(rateKey, 6, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many generate attempts, please slow down.",
        });
      }
      void (await maybeCleanupExpiredSessions());
      const { sessionId } = input;
      const sess = await ensurePFSess(sessionId);

      // Update meta and progress
      await updatePFMeta(sessionId, { status: "processing" });
      await writePFProgress(sessionId, {
        current: 0,
        total: 100,
        currentOperation: "Preparing generation...",
      });

      // Ensure engine availability (ImageMagick preferred, Jimp fallback)
      const engineInfo = await ensureImageEngine();
      await writePFProgress(sessionId, {
        current: 5,
        total: 100,
        currentOperation: `Engine: ${engineInfo.engine}`,
      });

      const imageAbsPath = path.join(sess.root, input.imagePath);
      const outDir = sess.generatedDir;

      // Map UI generationTypes to pixel-forge API options
      const types = new Set(input.options?.generationTypes ?? []);
      const pfOptions = {
        outputDir: outDir,
        urlPrefix: (() => {
          const base = `/api/pixel-forge/files/${encodeURIComponent(sessionId)}/generated/`;
          const req = input.options?.urlPrefix;
          return typeof req === "string" && req.startsWith(base) ? req : base;
        })(),
        format: input.options?.format,
        quality: input.options?.quality,
        all: types.has("all") ? true : undefined,
        favicon: types.has("favicon") ? true : undefined,
        pwa: types.has("pwa") ? true : undefined,
        social: types.has("social") ? true : undefined,
        web: types.has("web") ? true : undefined,
        seo: types.has("seo") ? true : undefined,
        transparent: input.options?.transparent,
        // verbose left undefined
      } as const;

      await writePFProgress(sessionId, {
        current: 10,
        total: 100,
        currentOperation: "Generating assets...",
      });

      let result: PixelForgeResult;
      try {
        result = (await pfGenerateAssets(
          imageAbsPath,
          pfOptions,
        )) as PixelForgeResult;
      } catch (err) {
        await writePFProgress(sessionId, {
          current: 100,
          total: 100,
          currentOperation: "Failed",
        });
        await updatePFMeta(sessionId, { status: "error" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Pixel Forge generation failed. Engine: ${engineInfo.engine}. ${engineInfo.note ?? "If ImageMagick is not installed, install it (e.g., 'brew install imagemagick') for best quality."}`,
          cause: err as Error,
        });
      }

      // Build asset entries with URLs pointing at our file-serving route
      const assets: Array<{
        fileName: string;
        category: string;
        downloadUrl: string;
        previewUrl?: string;
        width?: number;
        height?: number;
        bytes?: number;
      }> = [];

      const pushFiles = async (category: string, files?: string[]) => {
        if (!files) return;
        for (const f of files) {
          const abs = path.isAbsolute(f) ? f : path.join(outDir, f);
          const url = toFileUrl(sessionId, sess.root, abs);
          const st = await fsp.stat(abs).catch(() => null);
          let width: number | undefined;
          let height: number | undefined;
          try {
            const buf = await fsp.readFile(abs);
            const dims = imageSize(buf);
            width = dims.width;
            height = dims.height;
          } catch {
            // ignore dimension extraction errors
          }
          assets.push({
            fileName: path.basename(f),
            category,
            downloadUrl: url,
            previewUrl: url,
            width,
            height,
            bytes: st?.size,
          });
        }
      };

      await pushFiles("favicon", result.files.favicon);
      await pushFiles("pwa", result.files.pwa);
      await pushFiles("social", result.files.social);
      await pushFiles("web", result.files.web);
      await pushFiles("seo", result.files.seo);
      await pushFiles("transparent", result.files.transparent);

      // Meta tags and manifest URLs
      const metaTagsFileUrl = toFileUrl(
        sessionId,
        sess.root,
        path.join(outDir, "meta-tags.html"),
      );
      const manifestUrl = result.manifest
        ? toFileUrl(sessionId, sess.root, result.manifest)
        : undefined;

      await writePFProgress(sessionId, {
        current: 100,
        total: 100,
        currentOperation: "Completed",
      });
      await updatePFMeta(sessionId, { status: "completed" });

      return {
        sessionId,
        engine: engineInfo.engine,
        engineNote: engineInfo.note,
        files: result.files,
        images: result.images,
        metaTags: {
          html: result.metaTags.html,
          fileUrl: metaTagsFileUrl,
          tags: result.metaTags.tags,
        },
        manifestUrl,
        summary: result.summary,
        assets,
      };
    }),

  // Read current progress for the session with defensive rate limiting
  getGenerationProgress: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rateKey = limiterKey("pf:progress", ctx.headers, input.sessionId);
      if (!enforceFixedWindowLimit(rateKey, 60, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Polling too fast, please reduce frequency.",
        });
      }
      const progress = await readPFProgress(input.sessionId);
      return progress;
    }),

  // Create a ZIP of all generated assets (plus meta/manifest) and return a downloadable URL
  zipAssets: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rateKey = limiterKey("pf:zip", ctx.headers, input.sessionId);
      if (!enforceFixedWindowLimit(rateKey, 6, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many ZIP requests, please slow down.",
        });
      }
      void (await maybeCleanupExpiredSessions());

      const lockKey = `pf:zip:${input.sessionId}`;
      if (!acquireLock(lockKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "ZIP already in progress for this session.",
        });
      }

      try {
        const sess = await ensurePFSess(input.sessionId);
        const zipPath = path.join(sess.root, "assets.zip");

        // Build ZIP archive
        await createDirectoryZip(sess.generatedDir, zipPath);

        const stat = await fsp.stat(zipPath).catch(() => null);
        const zipUrl = toFileUrl(input.sessionId, sess.root, zipPath);
        return { zipUrl, size: stat?.size ?? 0 };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create ZIP archive",
          cause: err as Error,
        });
      } finally {
        releaseLock(lockKey);
      }
    }),

  // Cleanup expired sessions (TTL-based)
  cleanupExpired: publicProcedure.mutation(async ({ ctx }) => {
    const rateKey = limiterKey("pf:cleanupExpired", ctx.headers);
    if (!enforceFixedWindowLimit(rateKey, 2, 60_000)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many cleanup requests, please slow down.",
      });
    }
    const res = await cleanupExpiredPF();
    return res; // { removed: string[] }
  }),

  // Cleanup and remove a session's temporary files
  cleanupSession: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rateKey = limiterKey(
        "pf:cleanupSession",
        ctx.headers,
        input.sessionId,
      );
      if (!enforceFixedWindowLimit(rateKey, 10, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many cleanup requests, please slow down.",
        });
      }
      await cleanupPFSess(input.sessionId);
      return { ok: true };
    }),
});

export type PixelForgeRouter = typeof pixelForgeRouter;
