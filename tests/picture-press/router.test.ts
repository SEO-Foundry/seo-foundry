import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import {
  createPicturePressSession,
  ensurePicturePressSession,
} from "@/server/lib/picture-press/session";

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

// Mock Prisma db to avoid real database usage in tests
vi.mock("@/server/db", () => ({ db: {} }));

// Import mocked modules for test control
import { convertImages, validateConversionOptions } from "@/server/lib/picture-press/converter";
import { acquireLock, releaseLock } from "@/server/lib/security";

const mockConvertImages = vi.mocked(convertImages);
const mockValidateConversionOptions = vi.mocked(validateConversionOptions);
const mockAcquireLock = vi.mocked(acquireLock);
const mockReleaseLock = vi.mocked(releaseLock);

function headersWithIP(ip: string) {
  return new Headers([["x-forwarded-for", ip]]);
}

// Tiny white 1x1 PNG (same as used in pixel-forge tests)
const SMALL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAF0gJ/kXn7tQAAAABJRU5ErkJggg==";

// Tiny JPEG (1x1 pixel) - simplified version
const SMALL_JPEG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAF0gJ/kXn7tQAAAABJRU5ErkJggg==";

describe("picture-press router", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Default mock implementations
    mockValidateConversionOptions.mockReturnValue({
      valid: true,
      errors: [],
    });
    
    mockAcquireLock.mockReturnValue(true);
    mockReleaseLock.mockImplementation(() => {});
    
    mockConvertImages.mockResolvedValue([
      {
        originalFile: "/tmp/test/uploads/original-0-image1.png",
        convertedFile: "/tmp/test/converted/image1.jpeg",
        originalName: "image1.png",
        convertedName: "image1.jpeg",
        originalSize: 1000,
        convertedSize: 800,
        width: 100,
        height: 100,
        success: true,
      },
    ]);
  });
  it("creates a session via newSession", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.20"),
    });
    const caller = appRouter.createCaller(ctx);
    const { sessionId } = await caller.picturePress.newSession();
    expect(sessionId).toMatch(/^[0-9a-fA-F-]{36}$/);
    const sess = await ensurePicturePressSession(sessionId);
    expect(sess.root).toContain(sessionId);
  });

  it("uploads multiple images and returns upload details", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.21"),
    });
    const caller = appRouter.createCaller(ctx);

    const { sessionId } = await caller.picturePress.newSession();
    const res = await caller.picturePress.uploadImages({
      files: [
        {
          fileName: "image1.png",
          fileData: SMALL_PNG_BASE64,
          mimeType: "image/png",
        },
        {
          fileName: "image2.jpg",
          fileData: SMALL_JPEG_BASE64,
          mimeType: "image/jpeg",
        },
      ],
      sessionId,
    });

    expect(res.sessionId).toBe(sessionId);
    expect(res.uploadedFiles).toHaveLength(2);
    expect(res.totalFiles).toBe(2);
    expect(res.totalSize).toBeGreaterThan(0);

    // Check individual file details
    const file1 = res.uploadedFiles[0]!;
    expect(file1.originalName).toBe("image1.png");
    expect(file1.previewUrl).toContain(`/api/picture-press/files/${sessionId}/`);
    expect(file1.storedPath).toBeTruthy();

    const file2 = res.uploadedFiles[1]!;
    expect(file2.originalName).toBe("image2.jpg");
    expect(file2.previewUrl).toContain(`/api/picture-press/files/${sessionId}/`);
  });

  it("creates session implicitly when sessionId not provided", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.22"),
    });
    const caller = appRouter.createCaller(ctx);

    const res = await caller.picturePress.uploadImages({
      files: [
        {
          fileName: "test.png",
          fileData: SMALL_PNG_BASE64,
          mimeType: "image/png",
        },
      ],
    });

    expect(res.sessionId).toMatch(/^[0-9a-fA-F-]{36}$/);
    expect(res.uploadedFiles).toHaveLength(1);
    expect(res.totalFiles).toBe(1);
  });

  it("validates MIME types and rejects unsupported formats", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.23"),
    });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.picturePress.uploadImages({
        files: [
          {
            fileName: "document.pdf",
            fileData: "JVBERi0xLjQ=", // PDF header in base64
            mimeType: "application/pdf",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Unsupported MIME type"),
    });
  });

  it("enforces file count limits", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.24"),
    });
    const caller = appRouter.createCaller(ctx);

    // Create array with 51 files (over the 50 limit)
    const tooManyFiles = Array.from({ length: 51 }, (_, i) => ({
      fileName: `image${i}.png`,
      fileData: SMALL_PNG_BASE64,
      mimeType: "image/png",
    }));

    await expect(
      caller.picturePress.uploadImages({
        files: tooManyFiles,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("requires at least one file", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.25"),
    });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.picturePress.uploadImages({
        files: [],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rate limits upload requests", async () => {
    const headers = headersWithIP("203.0.113.26");
    const ctx = await createTRPCContext({ headers });
    const caller = appRouter.createCaller(ctx);

    const testFile = {
      fileName: "test.png",
      fileData: SMALL_PNG_BASE64,
      mimeType: "image/png",
    };

    // 30 uploads allowed per minute
    for (let i = 0; i < 30; i++) {
      const res = await caller.picturePress.uploadImages({
        files: [testFile],
      });
      expect(res.uploadedFiles).toHaveLength(1);
    }

    // 31st should be blocked
    await expect(
      caller.picturePress.uploadImages({
        files: [testFile],
      }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringContaining("Too many uploads"),
    });
  }, 15000);

  it("handles empty base64 data gracefully", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.27"),
    });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.picturePress.uploadImages({
        files: [
          {
            fileName: "empty.png",
            fileData: "",
            mimeType: "image/png",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("handles invalid base64 data", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.28"),
    });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.picturePress.uploadImages({
        files: [
          {
            fileName: "invalid.png",
            fileData: "not-valid-base64!@#$%",
            mimeType: "image/png",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("reads conversion progress", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.29"),
    });
    const caller = appRouter.createCaller(ctx);

    const { sessionId } = await caller.picturePress.newSession();
    const progress = await caller.picturePress.getConversionProgress({
      sessionId,
    });

    expect(progress).toMatchObject({
      current: 0,
      total: 0,
      currentOperation: "Idle",
      filesProcessed: 0,
      totalFiles: 0,
    });
  });

  it("rate limits progress polling", async () => {
    const headers = headersWithIP("203.0.113.30");
    const ctx = await createTRPCContext({ headers });
    const caller = appRouter.createCaller(ctx);

    const { sessionId } = await caller.picturePress.newSession();

    // 60 progress checks allowed per minute
    for (let i = 0; i < 60; i++) {
      const progress = await caller.picturePress.getConversionProgress({
        sessionId,
      });
      expect(typeof progress.current).toBe("number");
    }

    // 61st should be blocked
    await expect(
      caller.picturePress.getConversionProgress({ sessionId }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringContaining("Polling too fast"),
    });
  }, 20000);

  it("cleans up expired sessions", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.31"),
    });
    const caller = appRouter.createCaller(ctx);

    // Create a session with very short TTL
    await createPicturePressSession(1); // expires almost immediately

    // Wait a moment, then cleanup
    await new Promise((r) => setTimeout(r, 5));
    const result = await caller.picturePress.cleanupExpired();

    expect(Array.isArray(result.removed)).toBe(true);
  });

  it("cleans up individual sessions", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.32"),
    });
    const caller = appRouter.createCaller(ctx);

    const { sessionId } = await caller.picturePress.newSession();
    const result = await caller.picturePress.cleanupSession({ sessionId });

    expect(result.ok).toBe(true);
  });

  it("handles mixed valid and invalid files appropriately", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.33"),
    });
    const caller = appRouter.createCaller(ctx);

    // Mix of valid PNG and invalid PDF
    await expect(
      caller.picturePress.uploadImages({
        files: [
          {
            fileName: "valid.png",
            fileData: SMALL_PNG_BASE64,
            mimeType: "image/png",
          },
          {
            fileName: "invalid.pdf",
            fileData: "JVBERi0xLjQ=",
            mimeType: "application/pdf",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Unsupported MIME type"),
    });
  });

  describe("convertImages procedure", () => {
    it("converts uploaded images successfully", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.40"),
      });
      const caller = appRouter.createCaller(ctx);

      // First upload some images
      const { sessionId } = await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "image1.png",
            fileData: SMALL_PNG_BASE64,
            mimeType: "image/png",
          },
          {
            fileName: "image2.jpg",
            fileData: SMALL_JPEG_BASE64,
            mimeType: "image/jpeg",
          },
        ],
      });

      // Mock successful conversion
      mockConvertImages.mockResolvedValue([
        {
          originalFile: "/tmp/test/uploads/original-0-image1.png",
          convertedFile: "/tmp/test/converted/image1.webp",
          originalName: "image1.png",
          convertedName: "image1.webp",
          originalSize: 1000,
          convertedSize: 600,
          width: 100,
          height: 100,
          success: true,
        },
        {
          originalFile: "/tmp/test/uploads/original-1-image2.jpg",
          convertedFile: "/tmp/test/converted/image2.webp",
          originalName: "image2.jpg",
          convertedName: "image2.webp",
          originalSize: 1200,
          convertedSize: 700,
          width: 150,
          height: 150,
          success: true,
        },
      ]);

      // Convert to WebP
      const result = await caller.picturePress.convertImages({
        sessionId,
        options: {
          outputFormat: "webp",
          quality: 80,
          namingConvention: "keep-original",
        },
      });

      expect(result.sessionId).toBe(sessionId);
      expect(result.convertedImages).toHaveLength(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.totalOriginalSize).toBe(2200);
      expect(result.totalConvertedSize).toBe(1300);
      expect(result.totalSavings).toBe(900);

      // Check individual converted images
      const img1 = result.convertedImages[0]!;
      expect(img1.originalName).toBe("image1.png");
      expect(img1.convertedName).toBe("image1.webp");
      expect(img1.compressionRatio).toBe(40); // (1000-600)/1000 * 100
      expect(img1.downloadUrl).toContain(`/api/picture-press/files/${sessionId}/`);

      // Verify mocks were called correctly
      expect(mockAcquireLock).toHaveBeenCalledWith(`pp:convert:${sessionId}`);
      expect(mockReleaseLock).toHaveBeenCalledWith(`pp:convert:${sessionId}`);
      expect(mockValidateConversionOptions).toHaveBeenCalledWith({
        outputFormat: "webp",
        quality: 80,
        namingConvention: "keep-original",
      });
      expect(mockConvertImages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining("original-0-image1"),
          expect.stringContaining("original-1-image2"),
        ]),
        expect.stringContaining("converted"),
        {
          outputFormat: "webp",
          quality: 80,
          namingConvention: "keep-original",
        },
        expect.any(Function),
      );
    });

    it("validates conversion options and rejects invalid ones", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.41"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: SMALL_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
      });

      // Mock validation failure for custom validation logic
      mockValidateConversionOptions.mockReturnValue({
        valid: false,
        errors: ["Custom pattern required for custom-pattern naming"],
      });

      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "webp",
            quality: 80, // Valid quality
            namingConvention: "custom-pattern", // But no custom pattern provided
          },
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Invalid conversion options"),
      });

      expect(mockReleaseLock).toHaveBeenCalledWith(`pp:convert:${sessionId}`);
    });

    it("rejects invalid quality values at schema level", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.41b"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: SMALL_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
      });

      // Test Zod schema validation for quality > 100
      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "webp",
            quality: 150, // Invalid quality - exceeds max
            namingConvention: "keep-original",
          },
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("prevents concurrent conversions with lock mechanism", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.42"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: SMALL_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
      });

      // Mock lock acquisition failure (conversion already in progress)
      mockAcquireLock.mockReturnValue(false);

      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            namingConvention: "keep-original",
          },
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("Conversion already in progress"),
      });

      expect(mockAcquireLock).toHaveBeenCalledWith(`pp:convert:${sessionId}`);
      // Should not call releaseLock if lock was never acquired
      expect(mockReleaseLock).not.toHaveBeenCalled();
    });

    it("handles conversion failures gracefully", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.43"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: SMALL_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
      });

      // Mock conversion engine failure
      mockConvertImages.mockRejectedValue(new Error("ImageMagick not available"));

      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            namingConvention: "keep-original",
          },
        }),
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: expect.stringContaining("ImageMagick not available"),
      });

      // Ensure lock is released even on failure
      expect(mockReleaseLock).toHaveBeenCalledWith(`pp:convert:${sessionId}`);
    });

    it("handles partial conversion failures", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.44"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "good.png",
            fileData: SMALL_PNG_BASE64,
            mimeType: "image/png",
          },
          {
            fileName: "bad.jpg",
            fileData: SMALL_JPEG_BASE64,
            mimeType: "image/jpeg",
          },
        ],
      });

      // Mock partial failure (one success, one failure)
      mockConvertImages.mockResolvedValue([
        {
          originalFile: "/tmp/test/uploads/original-0-good.png",
          convertedFile: "/tmp/test/converted/good.webp",
          originalName: "good.png",
          convertedName: "good.webp",
          originalSize: 1000,
          convertedSize: 600,
          width: 100,
          height: 100,
          success: true,
        },
        {
          originalFile: "/tmp/test/uploads/original-1-bad.jpg",
          convertedFile: "",
          originalName: "bad.jpg",
          convertedName: "",
          originalSize: 1200,
          convertedSize: 0,
          success: false,
          error: "Corrupted image file",
        },
      ]);

      const result = await caller.picturePress.convertImages({
        sessionId,
        options: {
          outputFormat: "webp",
          namingConvention: "keep-original",
        },
      });

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.convertedImages).toHaveLength(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({
        originalName: "bad.jpg",
        error: "Corrupted image file",
      });

      // Should still calculate totals correctly
      expect(result.totalOriginalSize).toBe(2200);
      expect(result.totalConvertedSize).toBe(600);
    });

    it("requires uploaded files before conversion", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.45"),
      });
      const caller = appRouter.createCaller(ctx);

      // Create session but don't upload any files
      const { sessionId } = await caller.picturePress.newSession();

      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            namingConvention: "keep-original",
          },
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("No uploaded files found"),
      });

      expect(mockReleaseLock).toHaveBeenCalledWith(`pp:convert:${sessionId}`);
    });

    it("rate limits conversion requests", async () => {
      const headers = headersWithIP("203.0.113.46");
      const ctx = await createTRPCContext({ headers });
      const caller = appRouter.createCaller(ctx);

      // Upload files once
      const { sessionId } = await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: SMALL_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
      });

      // 10 conversions allowed per minute
      for (let i = 0; i < 10; i++) {
        const result = await caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            namingConvention: "keep-original",
          },
        });
        expect(result.sessionId).toBe(sessionId);
      }

      // 11th should be blocked
      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            namingConvention: "keep-original",
          },
        }),
      ).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
        message: expect.stringContaining("Too many conversion requests"),
      });
    }, 15000);

    it("supports custom naming patterns", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.47"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: SMALL_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
      });

      const result = await caller.picturePress.convertImages({
        sessionId,
        options: {
          outputFormat: "jpeg",
          namingConvention: "custom-pattern",
          customPattern: "converted_{name}_{index}",
          prefix: "img_",
          suffix: "_final",
        },
      });

      expect(result.convertedImages).toHaveLength(1);
      
      // Verify the conversion options were passed correctly
      expect(mockConvertImages).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.objectContaining({
          outputFormat: "jpeg",
          namingConvention: "custom-pattern",
          customPattern: "converted_{name}_{index}",
          prefix: "img_",
          suffix: "_final",
        }),
        expect.any(Function),
      );
    });

    it("handles non-existent session gracefully", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.48"),
      });
      const caller = appRouter.createCaller(ctx);

      const fakeSessionId = "00000000-0000-0000-0000-000000000000";

      await expect(
        caller.picturePress.convertImages({
          sessionId: fakeSessionId,
          options: {
            outputFormat: "jpeg",
            namingConvention: "keep-original",
          },
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining("session not found"),
      });

      expect(mockReleaseLock).toHaveBeenCalledWith(`pp:convert:${fakeSessionId}`);
    });
  });
});