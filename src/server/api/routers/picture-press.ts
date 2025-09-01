import path from "path";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  convertImages,
  validateConversionOptions,
  type ConversionOptions,
  type ConversionResult,
} from "@/server/lib/picture-press/converter";
import {
  createPicturePressSession,
  ensurePicturePressSession,
  saveMultipleUploads,
  readConversionProgress,
  writeConversionProgress,
  readConversionMeta,
  updateConversionMeta,
  cleanupPicturePressSession,
  cleanupExpiredPicturePressessions,
  maybeCleanupExpiredPicturePressessions,
  isAllowedMime,
  type ConversionProgress,
} from "@/server/lib/picture-press/session";
import {
  enforceFixedWindowLimit,
  limiterKey,
  acquireLock,
  releaseLock,
} from "@/server/lib/security";

// Helper to construct a stable file URL that a future route handler will serve
function toFileUrl(
  sessionId: string,
  sessionRoot: string,
  absoluteFilePath: string,
): string {
  const rel = path.relative(sessionRoot, absoluteFilePath);
  const encodedParts = rel.split(path.sep).map(encodeURIComponent).join("/");
  return `/api/picture-press/files/${encodeURIComponent(sessionId)}/${encodedParts}`;
}

export const picturePressRouter = createTRPCRouter({
  // Create a new session explicitly. The uploadImages procedure will also create one implicitly if omitted.
  newSession: publicProcedure.mutation(async ({ ctx }) => {
    const key = limiterKey("pp:newSession", ctx.headers);
    if (!enforceFixedWindowLimit(key, 20, 60_000)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many sessions, please slow down.",
      });
    }
    void (await maybeCleanupExpiredPicturePressessions());
    const sess = await createPicturePressSession();
    return { sessionId: sess.id };
  }),

  // Upload multiple base64 image payloads for processing. Accepts optional sessionId to reuse an existing session.
  uploadImages: publicProcedure
    .input(
      z.object({
        files: z
          .array(
            z.object({
              fileName: z.string().min(1),
              fileData: z.string().min(1), // raw base64 (no data URL prefix)
              mimeType: z
                .string()
                .min(1)
                .refine((m) => isAllowedMime(m), "Unsupported MIME type"),
            }),
          )
          .min(1)
          .max(50), // Limit batch size to prevent abuse
        sessionId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateKey = limiterKey(
        "pp:upload",
        ctx.headers,
        input.sessionId ?? null,
      );
      if (!enforceFixedWindowLimit(rateKey, 30, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many uploads, please slow down.",
        });
      }
      void (await maybeCleanupExpiredPicturePressessions());

      // Ensure or create session
      const sessionId = input.sessionId ?? (await createPicturePressSession()).id;
      const sessPaths = await ensurePicturePressSession(sessionId);

      // Validate all files before processing any
      for (const file of input.files) {
        if (!isAllowedMime(file.mimeType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unsupported MIME type: ${file.mimeType} for file: ${file.fileName}`,
          });
        }
      }

      // Persist uploads
      try {
        const results = await saveMultipleUploads({
          sessionId,
          files: input.files.map(file => ({
            fileName: file.fileName,
            base64Data: file.fileData,
            mimeType: file.mimeType,
          })),
          maxBytes: 10 * 1024 * 1024, // 10MB cap per file
        });

        // Build preview URLs for each uploaded file
        const uploadedFiles = results.map((result) => ({
          originalName: result.originalName,
          size: result.size,
          storedPath: path.relative(sessPaths.root, result.savedPath),
          previewUrl: toFileUrl(sessionId, sessPaths.root, result.savedPath),
        }));

        return {
          sessionId,
          uploadedFiles,
          totalFiles: results.length,
          totalSize: results.reduce((sum, r) => sum + r.size, 0),
        };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            err instanceof Error
              ? err.message
              : "Upload failed due to invalid files or size limits",
          cause: err as Error,
        });
      }
    }),

  // Read current progress for the session with defensive rate limiting
  getConversionProgress: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rateKey = limiterKey("pp:progress", ctx.headers, input.sessionId);
      if (!enforceFixedWindowLimit(rateKey, 60, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Polling too fast, please reduce frequency.",
        });
      }
      const progress = await readConversionProgress(input.sessionId);
      return progress;
    }),

  // Cleanup expired sessions (TTL-based)
  cleanupExpired: publicProcedure.mutation(async ({ ctx }) => {
    const rateKey = limiterKey("pp:cleanupExpired", ctx.headers);
    if (!enforceFixedWindowLimit(rateKey, 2, 60_000)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many cleanup requests, please slow down.",
      });
    }
    const res = await cleanupExpiredPicturePressessions();
    return res; // { removed: string[] }
  }),

  // Convert uploaded images with format and naming options
  convertImages: publicProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        options: z.object({
          outputFormat: z.enum(["jpeg", "png", "webp", "gif", "tiff", "bmp"]),
          quality: z.number().min(1).max(100).optional(),
          namingConvention: z.enum(["keep-original", "custom-pattern"]),
          customPattern: z.string().optional(),
          prefix: z.string().optional(),
          suffix: z.string().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateKey = limiterKey(
        "pp:convert",
        ctx.headers,
        input.sessionId,
      );
      if (!enforceFixedWindowLimit(rateKey, 10, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many conversion requests, please slow down.",
        });
      }

      // Acquire concurrency lock to prevent duplicate conversions
      const lockKey = `pp:convert:${input.sessionId}`;
      if (!acquireLock(lockKey)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Conversion already in progress for this session.",
        });
      }

      try {
        // Validate conversion options
        const validation = validateConversionOptions(input.options);
        if (!validation.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid conversion options: ${validation.errors.join(", ")}`,
          });
        }

        // Get session paths and metadata
        const sessPaths = await ensurePicturePressSession(input.sessionId);
        const meta = await readConversionMeta(input.sessionId);
        
        if (!meta?.uploadedFiles || meta.uploadedFiles.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No uploaded files found in session. Please upload images first.",
          });
        }

        // Update session status and options
        await updateConversionMeta(input.sessionId, {
          status: "processing",
          conversionOptions: input.options,
        });

        // Initialize progress
        const totalFiles = meta.uploadedFiles.length;
        await writeConversionProgress(input.sessionId, {
          current: 0,
          total: totalFiles,
          currentOperation: "Starting conversion...",
          filesProcessed: 0,
          totalFiles,
        });

        // Prepare input files list
        const inputFiles = meta.uploadedFiles.map(file => file.tempPath);

        // Progress callback to update real-time progress
        const progressCallback = (
          current: number,
          total: number,
          operation: string,
          currentFile?: string,
        ) => {
          const progress: ConversionProgress = {
            current,
            total,
            currentOperation: operation,
            filesProcessed: current,
            totalFiles: total,
            currentFile,
          };
          
          // Fire and forget - don't await to avoid blocking conversion
          void writeConversionProgress(input.sessionId, progress).catch((error) => {
            // Log but don't fail conversion for progress update errors
            console.warn(`[picture-press] Progress update failed for ${input.sessionId}:`, error);
          });
        };

        // Perform the conversion
        let conversionResults: ConversionResult[];
        try {
          conversionResults = await convertImages(
            inputFiles,
            sessPaths.convertedDir,
            input.options as ConversionOptions,
            progressCallback,
          );
        } catch (error) {
          // Update status to error
          await updateConversionMeta(input.sessionId, {
            status: "error",
          });
          
          await writeConversionProgress(input.sessionId, {
            current: 0,
            total: totalFiles,
            currentOperation: "Conversion failed",
            filesProcessed: 0,
            totalFiles,
          });

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Conversion failed due to an unknown error",
            cause: error as Error,
          });
        }

        // Process results and build response
        const successfulConversions = conversionResults.filter(r => r.success);
        const failedConversions = conversionResults.filter(r => !r.success);

        // Build file URLs for successful conversions
        const convertedImages = successfulConversions.map((result) => ({
          originalName: result.originalName,
          convertedName: result.convertedName,
          originalSize: result.originalSize,
          convertedSize: result.convertedSize,
          width: result.width,
          height: result.height,
          compressionRatio: result.originalSize > 0 
            ? Math.round(((result.originalSize - result.convertedSize) / result.originalSize) * 100)
            : 0,
          downloadUrl: toFileUrl(input.sessionId, sessPaths.root, result.convertedFile),
          previewUrl: toFileUrl(input.sessionId, sessPaths.root, result.convertedFile),
        }));

        // Calculate totals
        const totalOriginalSize = conversionResults.reduce((sum, r) => sum + r.originalSize, 0);
        const totalConvertedSize = successfulConversions.reduce((sum, r) => sum + r.convertedSize, 0);
        const totalSavings = totalOriginalSize - totalConvertedSize;

        // Update final status
        const finalStatus = failedConversions.length === 0 ? "completed" : 
                           successfulConversions.length === 0 ? "error" : "completed";
        
        await updateConversionMeta(input.sessionId, {
          status: finalStatus,
        });

        // Update final progress
        await writeConversionProgress(input.sessionId, {
          current: totalFiles,
          total: totalFiles,
          currentOperation: failedConversions.length === 0 
            ? "Conversion completed successfully" 
            : `Conversion completed with ${failedConversions.length} failures`,
          filesProcessed: totalFiles,
          totalFiles,
        });

        // Return results with error information if any conversions failed
        const response = {
          sessionId: input.sessionId,
          convertedImages,
          totalOriginalSize,
          totalConvertedSize,
          totalSavings,
          successCount: successfulConversions.length,
          failureCount: failedConversions.length,
          failures: failedConversions.map(f => ({
            originalName: f.originalName,
            error: f.error ?? "Unknown error",
          })),
        };

        // If there were failures but some successes, include warning in response
        if (failedConversions.length > 0 && successfulConversions.length > 0) {
          console.warn(`[picture-press] Partial conversion failure for session ${input.sessionId}:`, 
            failedConversions.map(f => `${f.originalName}: ${f.error}`));
        }

        return response;

      } finally {
        // Always release the lock
        releaseLock(lockKey);
      }
    }),

  // Cleanup and remove a session's temporary files
  cleanupSession: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rateKey = limiterKey(
        "pp:cleanupSession",
        ctx.headers,
        input.sessionId,
      );
      if (!enforceFixedWindowLimit(rateKey, 10, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many cleanup requests, please slow down.",
        });
      }
      await cleanupPicturePressSession(input.sessionId);
      return { ok: true };
    }),
});

export type PicturePressRouter = typeof picturePressRouter;