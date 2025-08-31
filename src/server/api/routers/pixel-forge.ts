import path from "path";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  createSession as createPFSess,
  ensureSession as ensurePFSess,
  saveBase64Upload,
  readProgress as readPFProgress,
  cleanupSession as cleanupPFSess,
  writeProgress as writePFProgress,
  updateMeta as updatePFMeta,
} from "@/server/lib/pixel-forge/session";
import { ensureImageEngine } from "@/server/lib/pixel-forge/deps";
import { generateAssets as pfGenerateAssets } from "pixel-forge";
import archiver from "archiver";
import type { Archiver } from "archiver";
import { createWriteStream } from "fs";
import { promises as fsp } from "fs";

// Helper to construct a stable file URL that a future route handler will serve
function toFileUrl(sessionId: string, sessionRoot: string, absoluteFilePath: string): string {
  const rel = path.relative(sessionRoot, absoluteFilePath);
  const encodedParts = rel.split(path.sep).map(encodeURIComponent).join("/");
  return `/api/pixel-forge/files/${encodeURIComponent(sessionId)}/${encodedParts}`;
}

export const pixelForgeRouter = createTRPCRouter({
  // Create a new session explicitly. The upload procedure will also create one implicitly if omitted.
  newSession: publicProcedure.mutation(async () => {
    const sess = await createPFSess();
    return { sessionId: sess.id };
  }),

  // Upload a base64 image payload for processing. Accepts optional sessionId to reuse an existing session.
  uploadImage: publicProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        fileData: z.string().min(1), // raw base64 (no data URL prefix)
        mimeType: z.string().min(1),
        sessionId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Ensure or create session
      const sessionId = input.sessionId ?? (await createPFSess()).id;
      const sessPaths = await ensurePFSess(sessionId);

      // Persist upload
      const { savedPath, size, originalName } = await saveBase64Upload({
        sessionId,
        fileName: input.fileName,
        base64Data: input.fileData,
        mimeType: input.mimeType,
      });

      // Build preview URL (served by future file route handler)
      const previewUrl = toFileUrl(sessionId, sessPaths.root, savedPath);

      return {
        sessionId,
        originalName,
        size,
        storedPath: path.relative(sessPaths.root, savedPath),
        previewUrl,
      };
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
    .mutation(async ({ input }) => {
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
        urlPrefix:
          input.options?.urlPrefix ??
          `/api/pixel-forge/files/${encodeURIComponent(sessionId)}/generated/`,
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

      const result = await pfGenerateAssets(imageAbsPath, pfOptions);

      // Build asset entries with URLs pointing at our file-serving route
      const assets: Array<{
        fileName: string;
        category: string;
        downloadUrl: string;
        previewUrl?: string;
      }> = [];

      const pushFiles = (category: string, files?: string[]) => {
        if (!files) return;
        for (const f of files) {
          const abs = path.isAbsolute(f) ? f : path.join(outDir, f);
          const url = toFileUrl(sessionId, sess.root, abs);
          assets.push({
            fileName: path.basename(f),
            category,
            downloadUrl: url,
            previewUrl: url,
          });
        }
      };

      pushFiles("favicon", result.files.favicon);
      pushFiles("pwa", result.files.pwa);
      pushFiles("social", result.files.social);
      pushFiles("web", result.files.web);
      pushFiles("seo", result.files.seo);
      pushFiles("transparent", result.files.transparent);

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

  // Read current progress for the session (stub-ready; will be updated when generation wiring lands)
  getGenerationProgress: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input }) => {
      const progress = await readPFProgress(input.sessionId);
      return progress;
    }),

  // Create a ZIP of all generated assets (plus meta/manifest) and return a downloadable URL
  zipAssets: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const sess = await ensurePFSess(input.sessionId);
      const zipPath = path.join(sess.root, "assets.zip");

      // Build ZIP archive
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive: Archiver = archiver("zip", { zlib: { level: 9 } });

        output.on("close", resolve);
        archive.on("error", reject);

        archive.pipe(output);
        // Add generated directory contents at root of archive
        archive.directory(sess.generatedDir, false);
        void archive.finalize();
      });

      const stat = await fsp.stat(zipPath).catch(() => null);
      const zipUrl = toFileUrl(input.sessionId, sess.root, zipPath);
      return { zipUrl, size: stat?.size ?? 0 };
    }),

  // Cleanup and remove a session's temporary files
  cleanupSession: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await cleanupPFSess(input.sessionId);
      return { ok: true };
    }),
});

export type PixelForgeRouter = typeof pixelForgeRouter;