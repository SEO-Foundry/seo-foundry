import path from "path";
import { promises as fs } from "fs";
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
import { createDirectoryZip } from "@/server/lib/shared/zip-utils";
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
              fileName: z.string().min(1).max(255).refine(
                (name) => {
                  // Validate filename security
                  const dangerousPatterns = [
                    /\.\./,  // Path traversal
                    /[<>:"|?*\x00-\x1f]/,  // Invalid filename characters
                    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i,  // Windows reserved names
                  ];
                  return !dangerousPatterns.some(pattern => pattern.test(name));
                },
                "Invalid filename"
              ),
              fileData: z.string().min(1).refine(
                (data) => {
                  // Validate base64 format
                  try {
                    const buffer = Buffer.from(data, 'base64');
                    return buffer.length > 0 && buffer.length <= 10 * 1024 * 1024; // 10MB limit
                  } catch {
                    return false;
                  }
                },
                "Invalid file data"
              ),
              mimeType: z
                .string()
                .min(1)
                .refine((m) => isAllowedMime(m), "Unsupported MIME type"),
            }),
          )
          .min(1, "At least one file is required")
          .max(50, "Too many files (maximum 50)"), // Limit batch size to prevent abuse
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
          message: "Too many upload requests. Please wait a moment before trying again.",
        });
      }
      void (await maybeCleanupExpiredPicturePressessions());

      // Enhanced validation before processing
      const validationErrors: string[] = [];
      
      // Validate total payload size
      const totalSize = input.files.reduce((sum, file) => {
        try {
          return sum + Buffer.from(file.fileData, 'base64').length;
        } catch {
          return sum;
        }
      }, 0);
      
      if (totalSize > 100 * 1024 * 1024) { // 100MB total limit
        validationErrors.push("Total upload size exceeds 100MB limit. Please reduce the number or size of files.");
      }

      // Validate each file in detail
      for (const [index, file] of input.files.entries()) {
        const filePrefix = `File ${index + 1} (${file.fileName})`;
        
        // Validate MIME type
        if (!isAllowedMime(file.mimeType)) {
          validationErrors.push(`${filePrefix}: Unsupported file type "${file.mimeType}". Please use JPEG, PNG, GIF, WebP, TIFF, or BMP images.`);
          continue;
        }

        // Validate filename extension matches MIME type
        const extension = file.fileName.toLowerCase().substring(file.fileName.lastIndexOf('.'));
        const mimeExtensionMap: Record<string, string[]> = {
          'image/jpeg': ['.jpg', '.jpeg'],
          'image/jpg': ['.jpg', '.jpeg'],
          'image/png': ['.png'],
          'image/gif': ['.gif'],
          'image/webp': ['.webp'],
          'image/tiff': ['.tiff', '.tif'],
          'image/bmp': ['.bmp']
        };

        const expectedExtensions = mimeExtensionMap[file.mimeType.toLowerCase()];
        if (expectedExtensions && !expectedExtensions.includes(extension)) {
          validationErrors.push(`${filePrefix}: File extension "${extension}" doesn't match MIME type "${file.mimeType}". This may indicate a security risk or corrupted file.`);
        }

        // Validate base64 data
        try {
          const buffer = Buffer.from(file.fileData, 'base64');
          if (buffer.length === 0) {
            validationErrors.push(`${filePrefix}: File appears to be empty.`);
          } else if (buffer.length > 10 * 1024 * 1024) {
            validationErrors.push(`${filePrefix}: File size (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds 10MB limit.`);
          } else if (buffer.length < 100) {
            validationErrors.push(`${filePrefix}: File size (${buffer.length} bytes) is suspiciously small. This may indicate a corrupted file.`);
          }
        } catch {
          validationErrors.push(`${filePrefix}: Invalid file data format.`);
        }
      }

      if (validationErrors.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Upload validation failed:\n${validationErrors.join('\n')}`,
        });
      }

      // Ensure or create session
      let sessionId: string;
      let sessPaths: Awaited<ReturnType<typeof ensurePicturePressSession>>;
      
      try {
        sessionId = input.sessionId ?? (await createPicturePressSession()).id;
        sessPaths = await ensurePicturePressSession(sessionId);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create or access session. Please try again.",
          cause: err as Error,
        });
      }

      // Persist uploads with enhanced error handling
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
        // Provide more specific error messages based on error type
        let errorMessage = "Upload failed due to an unexpected error.";
        
        if (err instanceof Error) {
          if (err.message.includes("ENOSPC")) {
            errorMessage = "Server storage is full. Please try again later or contact support.";
          } else if (err.message.includes("EMFILE") || err.message.includes("ENFILE")) {
            errorMessage = "Server is busy processing files. Please try again in a moment.";
          } else if (err.message.includes("EACCES")) {
            errorMessage = "Server permission error. Please contact support.";
          } else if (err.message.includes("size") || err.message.includes("large")) {
            errorMessage = "One or more files are too large. Please ensure all files are under 10MB.";
          } else if (err.message.includes("MIME") || err.message.includes("type")) {
            errorMessage = "One or more files have unsupported formats. Please use JPEG, PNG, GIF, WebP, TIFF, or BMP images.";
          } else {
            errorMessage = `Upload failed: ${err.message}`;
          }
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errorMessage,
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
          customPattern: z.string().max(200).optional(),
          prefix: z.string().max(50).optional(),
          suffix: z.string().max(50).optional(),
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
          message: "Too many conversion requests. Please wait a moment before trying again.",
        });
      }

      // Acquire concurrency lock to prevent duplicate conversions
      const lockKey = `pp:convert:${input.sessionId}`;
      if (!acquireLock(lockKey)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A conversion is already in progress for this session. Please wait for it to complete.",
        });
      }

      try {
        // Enhanced validation of conversion options
        const validation = validateConversionOptions(input.options);
        if (!validation.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid conversion settings:\n${validation.errors.join('\n')}`,
          });
        }

        // Additional security validation for naming options
        if (input.options.customPattern) {
          const dangerousPatterns = [
            /\.\./,  // Path traversal
            /[<>:"|?*\x00-\x1f]/,  // Invalid filename characters
            /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i,  // Windows reserved names
          ];
          
          for (const pattern of dangerousPatterns) {
            if (pattern.test(input.options.customPattern)) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Custom pattern contains invalid characters. Please use only letters, numbers, underscores, and hyphens.",
              });
            }
          }
        }

        // Get session paths and metadata with error handling
        let sessPaths: Awaited<ReturnType<typeof ensurePicturePressSession>>;
        let meta: Awaited<ReturnType<typeof readConversionMeta>>;
        
        try {
          sessPaths = await ensurePicturePressSession(input.sessionId);
          meta = await readConversionMeta(input.sessionId);
        } catch (err) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found or has expired. Please upload your images again.",
            cause: err as Error,
          });
        }
        
        if (!meta?.uploadedFiles || meta.uploadedFiles.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No uploaded files found in this session. Please upload images first before converting.",
          });
        }

        // Validate that uploaded files still exist
        const missingFiles: string[] = [];
        for (const file of meta.uploadedFiles) {
          try {
            await fs.access(file.tempPath);
          } catch {
            missingFiles.push(file.originalName);
          }
        }

        if (missingFiles.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Some uploaded files are no longer available: ${missingFiles.join(', ')}. Please re-upload your images.`,
          });
        }

        // Update session status and options
        try {
          await updateConversionMeta(input.sessionId, {
            status: "processing",
            conversionOptions: input.options,
          });
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update session status. Please try again.",
            cause: err as Error,
          });
        }

        // Initialize progress
        const totalFiles = meta.uploadedFiles.length;
        await writeConversionProgress(input.sessionId, {
          current: 0,
          total: totalFiles,
          currentOperation: "Preparing conversion...",
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
            // Only log critical errors, ignore common file system race conditions
            if (error instanceof Error && !error.message.includes('ENOENT')) {
              console.warn(`[picture-press] Progress update failed for ${input.sessionId}:`, error.message);
            }
          });
        };

        // Perform the conversion with enhanced error handling
        let conversionResults: ConversionResult[];
        
        try {
          conversionResults = await convertImages(
            inputFiles,
            sessPaths.convertedDir,
            input.options as ConversionOptions,
            progressCallback,
          );
        } catch (err) {
          // Update status to error
          await updateConversionMeta(input.sessionId, {
            status: "error",
          }).catch(() => {
            // Ignore meta update errors during error handling
          });
          
          await writeConversionProgress(input.sessionId, {
            current: 0,
            total: totalFiles,
            currentOperation: "Conversion failed",
            filesProcessed: 0,
            totalFiles,
          }).catch(() => {
            // Ignore progress update errors during error handling
          });

          // Provide specific error messages based on error type
          let errorMessage = "Conversion failed due to an unexpected error.";
          
          if (err instanceof Error) {
            if (err.message.includes("ImageMagick") || err.message.includes("magick")) {
              errorMessage = "Image processing engine is not available. Please try again later or contact support.";
            } else if (err.message.includes("ENOSPC")) {
              errorMessage = "Server storage is full. Please try again later or contact support.";
            } else if (err.message.includes("EMFILE") || err.message.includes("ENFILE")) {
              errorMessage = "Server is busy processing files. Please try again in a moment.";
            } else if (err.message.includes("timeout")) {
              errorMessage = "Conversion timed out. Please try with smaller files or fewer images.";
            } else if (err.message.includes("memory") || err.message.includes("Memory")) {
              errorMessage = "Not enough memory to process these images. Please try with smaller files or fewer images.";
            } else if (err.message.includes("format") || err.message.includes("corrupt")) {
              errorMessage = "One or more images appear to be corrupted or in an unsupported format.";
            } else {
              errorMessage = `Conversion failed: ${err.message}`;
            }
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: errorMessage,
            cause: err as Error,
          });
        }

        // Process results and build response
        const successfulConversions = conversionResults.filter(r => r.success);
        const failedConversions = conversionResults.filter(r => !r.success);

        // If all conversions failed, provide helpful error message
        if (successfulConversions.length === 0) {
          const commonErrors = failedConversions.map(f => f.error).filter(Boolean);
          const errorSummary = commonErrors.length > 0 
            ? `All conversions failed. Common issues: ${[...new Set(commonErrors)].join(', ')}`
            : "All conversions failed due to unknown errors.";
          
          await updateConversionMeta(input.sessionId, {
            status: "error",
          }).catch(() => {
            // Ignore meta update errors during error handling
          });

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: errorSummary + " Please check your images and try again, or contact support if the problem persists.",
          });
        }

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
        const finalStatus = failedConversions.length === 0 ? "completed" : "completed";
        
        await updateConversionMeta(input.sessionId, {
          status: finalStatus,
        }).catch(() => {
          // Ignore meta update errors at this point
        });

        // Update final progress
        await writeConversionProgress(input.sessionId, {
          current: totalFiles,
          total: totalFiles,
          currentOperation: failedConversions.length === 0 
            ? "Conversion completed successfully" 
            : `Conversion completed with ${failedConversions.length} failure${failedConversions.length === 1 ? '' : 's'}`,
          filesProcessed: totalFiles,
          totalFiles,
        }).catch(() => {
          // Ignore progress update errors at this point
        });

        // Return results with enhanced error information
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
            error: f.error ?? "Unknown error occurred during conversion",
          })),
        };

        // Log partial failures for debugging
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

  // Create ZIP archive of all converted images for bulk download
  zipConvertedImages: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rateKey = limiterKey(
        "pp:zip",
        ctx.headers,
        input.sessionId,
      );
      if (!enforceFixedWindowLimit(rateKey, 5, 60_000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many ZIP requests, please slow down.",
        });
      }

      // Acquire concurrency lock to prevent duplicate ZIP operations
      const lockKey = `pp:zip:${input.sessionId}`;
      if (!acquireLock(lockKey)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "ZIP creation already in progress for this session.",
        });
      }

      try {
        const sessPaths = await ensurePicturePressSession(input.sessionId);
        const meta = await readConversionMeta(input.sessionId);
        
        if (!meta || meta.status !== "completed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No completed conversion found. Please convert images first.",
          });
        }

        // Check if converted directory has files
        const convertedFiles = await fs.readdir(sessPaths.convertedDir).catch(() => []);
        if (convertedFiles.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No converted images found to ZIP.",
          });
        }

        // Create ZIP file
        const zipPath = path.join(sessPaths.root, "converted-images.zip");
        await createDirectoryZip(sessPaths.convertedDir, zipPath);

        // Return download URL
        const downloadUrl = toFileUrl(input.sessionId, sessPaths.root, zipPath);
        
        return {
          downloadUrl,
          fileName: "converted-images.zip",
          fileCount: convertedFiles.length,
        };

      } finally {
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