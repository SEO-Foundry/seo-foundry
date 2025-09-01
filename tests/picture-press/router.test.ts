import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

// Mock the converter module to avoid actual ImageMagick dependency in tests
vi.mock("@/server/lib/picture-press/converter", () => ({
  convertImages: vi.fn(),
  validateConversionOptions: vi.fn(),
}));

// Mock the security module
vi.mock("@/server/lib/security", () => ({
  enforceFixedWindowLimit: vi.fn(),
  getClientIp: vi.fn(),
  limiterKey: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));

// Mock Prisma db
vi.mock("@/server/db", () => ({ db: {} }));

// Mock ZIP utility
vi.mock("@/server/lib/shared/zip-utils", () => ({
  createDirectoryZip: vi.fn(),
}));

import {
  convertImages,
  validateConversionOptions,
} from "@/server/lib/picture-press/converter";
import {
  acquireLock,
  releaseLock,
  enforceFixedWindowLimit,
  limiterKey,
} from "@/server/lib/security";
import { createDirectoryZip } from "@/server/lib/shared/zip-utils";

const mockConvertImages = vi.mocked(convertImages);
const mockValidateConversionOptions = vi.mocked(validateConversionOptions);
const mockAcquireLock = vi.mocked(acquireLock);
const mockReleaseLock = vi.mocked(releaseLock);
const mockEnforceFixedWindowLimit = vi.mocked(enforceFixedWindowLimit);
const mockLimiterKey = vi.mocked(limiterKey);
const mockCreateDirectoryZip = vi.mocked(createDirectoryZip);

function headersWithIP(ip: string) {
  return new Headers([["x-forwarded-for", ip]]);
}

// Large base64 string that decodes to >100 bytes (random data)
const VALID_PNG_BASE64 =
  "UEsDBBQAAAAIAGRlbGV0ZSB0aGlzIGZpbGUgYWZ0ZXIgdGVzdGluZyBpcyBkb25lLiBUaGlzIGlzIGp1c3QgZHVtbXkgZGF0YSB0byBtYWtlIGEgbGFyZ2VyIGJhc2U2NCBzdHJpbmcgdGhhdCB3aWxsIGRlY29kZSB0byBtb3JlIHRoYW4gMTAwIGJ5dGVzIGZvciB0ZXN0aW5nIHB1cnBvc2VzLiBUaGlzIGlzIG5vdCBhIHJlYWwgaW1hZ2UgZmlsZSBidXQgaXQgd2lsbCBwYXNzIHRoZSBzaXplIHZhbGlkYXRpb24u";

describe("picture-press router", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock rate limiting to always allow requests
    mockEnforceFixedWindowLimit.mockReturnValue(true);
    mockLimiterKey.mockReturnValue("test-key");

    mockValidateConversionOptions.mockReturnValue({
      valid: true,
      errors: [],
    });

    mockAcquireLock.mockReturnValue(true);
    mockReleaseLock.mockImplementation(() => {
      // Mock implementation for releaseLock
    });

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

    mockCreateDirectoryZip.mockResolvedValue();
  });

  it("creates a session and uploads images", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.20"),
    });
    const caller = appRouter.createCaller(ctx);

    // Create session
    const { sessionId } = await caller.picturePress.newSession();
    expect(sessionId).toMatch(/^[0-9a-fA-F-]{36}$/);

    // Upload images
    const res = await caller.picturePress.uploadImages({
      files: [
        {
          fileName: "test.png",
          fileData: VALID_PNG_BASE64,
          mimeType: "image/png",
        },
      ],
      sessionId,
    });

    expect(res.sessionId).toBe(sessionId);
    expect(res.uploadedFiles).toHaveLength(1);
    expect(res.totalFiles).toBe(1);
  });

  it("converts uploaded images", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.21"),
    });
    const caller = appRouter.createCaller(ctx);

    // Create session and upload
    const { sessionId } = await caller.picturePress.newSession();
    await caller.picturePress.uploadImages({
      files: [
        {
          fileName: "test.png",
          fileData: VALID_PNG_BASE64,
          mimeType: "image/png",
        },
      ],
      sessionId,
    });

    // Convert images
    const result = await caller.picturePress.convertImages({
      sessionId,
      options: {
        outputFormat: "jpeg",
        quality: 90,
        namingConvention: "keep-original",
      },
    });

    expect(result.convertedImages).toHaveLength(1);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(mockConvertImages).toHaveBeenCalled();
  });

  it("handles validation errors", async () => {
    const ctx = await createTRPCContext({
      headers: headersWithIP("203.0.113.22"),
    });
    const caller = appRouter.createCaller(ctx);

    // Test with invalid file (too small)
    await expect(
      caller.picturePress.uploadImages({
        files: [
          {
            fileName: "tiny.png",
            fileData: "dGVzdA==", // "test" in base64 (4 bytes, too small)
            mimeType: "image/png",
          },
        ],
      }),
    ).rejects.toThrow("Upload validation failed");
  });

  describe("security and rate limiting", () => {
    it("enforces rate limits on newSession", async () => {
      mockEnforceFixedWindowLimit.mockReturnValue(false);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.100"),
      });
      const caller = appRouter.createCaller(ctx);

      await expect(caller.picturePress.newSession()).rejects.toThrow(
        "Too many sessions, please slow down.",
      );

      expect(mockLimiterKey).toHaveBeenCalledWith(
        "pp:newSession",
        expect.any(Headers),
      );
      expect(mockEnforceFixedWindowLimit).toHaveBeenCalledWith(
        "test-key",
        20,
        60_000,
      );
    });

    it("enforces rate limits on uploadImages", async () => {
      mockEnforceFixedWindowLimit.mockReturnValue(false);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.101"),
      });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.picturePress.uploadImages({
          files: [
            {
              fileName: "test.png",
              fileData: VALID_PNG_BASE64,
              mimeType: "image/png",
            },
          ],
        }),
      ).rejects.toThrow("Too many upload requests");

      expect(mockLimiterKey).toHaveBeenCalledWith(
        "pp:upload",
        expect.any(Headers),
        null,
      );
    });

    it("enforces rate limits on convertImages", async () => {
      // First allow session creation and upload
      mockEnforceFixedWindowLimit.mockReturnValue(true);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.102"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.newSession();
      await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: VALID_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
        sessionId,
      });

      // Now block conversion requests
      mockEnforceFixedWindowLimit.mockReturnValue(false);

      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            quality: 90,
            namingConvention: "keep-original",
          },
        }),
      ).rejects.toThrow("Too many conversion requests");

      expect(mockLimiterKey).toHaveBeenCalledWith(
        "pp:convert",
        expect.any(Headers),
        sessionId,
      );
    });

    it("enforces rate limits on getConversionProgress", async () => {
      mockEnforceFixedWindowLimit.mockReturnValue(false);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.103"),
      });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.picturePress.getConversionProgress({
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        }),
      ).rejects.toThrow("Polling too fast");

      expect(mockLimiterKey).toHaveBeenCalledWith(
        "pp:progress",
        expect.any(Headers),
        "550e8400-e29b-41d4-a716-446655440000",
      );
    });

    it("enforces rate limits on zipConvertedImages", async () => {
      mockEnforceFixedWindowLimit.mockReturnValue(false);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.104"),
      });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.picturePress.zipConvertedImages({
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        }),
      ).rejects.toThrow("Too many ZIP requests");

      expect(mockLimiterKey).toHaveBeenCalledWith(
        "pp:zip",
        expect.any(Headers),
        "550e8400-e29b-41d4-a716-446655440000",
      );
    });

    it("enforces rate limits on cleanupSession", async () => {
      mockEnforceFixedWindowLimit.mockReturnValue(false);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.105"),
      });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.picturePress.cleanupSession({
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        }),
      ).rejects.toThrow("Too many cleanup requests");

      expect(mockLimiterKey).toHaveBeenCalledWith(
        "pp:cleanupSession",
        expect.any(Headers),
        "550e8400-e29b-41d4-a716-446655440000",
      );
    });

    it("enforces rate limits on cleanupExpired", async () => {
      mockEnforceFixedWindowLimit.mockReturnValue(false);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.106"),
      });
      const caller = appRouter.createCaller(ctx);

      await expect(caller.picturePress.cleanupExpired()).rejects.toThrow(
        "Too many cleanup requests",
      );

      expect(mockLimiterKey).toHaveBeenCalledWith(
        "pp:cleanupExpired",
        expect.any(Headers),
      );
    });

    it("uses concurrency locks for convertImages", async () => {
      // Allow rate limiting but block concurrency lock
      mockEnforceFixedWindowLimit.mockReturnValue(true);
      mockAcquireLock.mockReturnValue(false);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.107"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.newSession();
      await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: VALID_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
        sessionId,
      });

      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            quality: 90,
            namingConvention: "keep-original",
          },
        }),
      ).rejects.toThrow("A conversion is already in progress");

      expect(mockAcquireLock).toHaveBeenCalledWith(`pp:convert:${sessionId}`);
    });

    it("uses concurrency locks for zipConvertedImages", async () => {
      // Allow rate limiting but block concurrency lock
      mockEnforceFixedWindowLimit.mockReturnValue(true);
      mockAcquireLock.mockReturnValue(false);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.108"),
      });
      const caller = appRouter.createCaller(ctx);

      const sessionId = "550e8400-e29b-41d4-a716-446655440000";

      await expect(
        caller.picturePress.zipConvertedImages({ sessionId }),
      ).rejects.toThrow("ZIP creation already in progress");

      expect(mockAcquireLock).toHaveBeenCalledWith(`pp:zip:${sessionId}`);
    });

    it("releases locks after convertImages completion", async () => {
      mockEnforceFixedWindowLimit.mockReturnValue(true);
      mockAcquireLock.mockReturnValue(true);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.109"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.newSession();
      await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: VALID_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
        sessionId,
      });

      await caller.picturePress.convertImages({
        sessionId,
        options: {
          outputFormat: "jpeg",
          quality: 90,
          namingConvention: "keep-original",
        },
      });

      expect(mockReleaseLock).toHaveBeenCalledWith(`pp:convert:${sessionId}`);
    });

    it("releases locks after convertImages error", async () => {
      mockEnforceFixedWindowLimit.mockReturnValue(true);
      mockAcquireLock.mockReturnValue(true);
      mockConvertImages.mockRejectedValue(new Error("Conversion failed"));

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.110"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.newSession();
      await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: VALID_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
        sessionId,
      });

      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            quality: 90,
            namingConvention: "keep-original",
          },
        }),
      ).rejects.toThrow();

      expect(mockReleaseLock).toHaveBeenCalledWith(`pp:convert:${sessionId}`);
    });

    it("validates file security patterns", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.111"),
      });
      const caller = appRouter.createCaller(ctx);

      // Test path traversal in filename
      await expect(
        caller.picturePress.uploadImages({
          files: [
            {
              fileName: "../../../etc/passwd",
              fileData: VALID_PNG_BASE64,
              mimeType: "image/png",
            },
          ],
        }),
      ).rejects.toThrow("Invalid filename");

      // Test Windows reserved names
      await expect(
        caller.picturePress.uploadImages({
          files: [
            {
              fileName: "CON.png",
              fileData: VALID_PNG_BASE64,
              mimeType: "image/png",
            },
          ],
        }),
      ).rejects.toThrow("Invalid filename");

      // Test invalid characters
      await expect(
        caller.picturePress.uploadImages({
          files: [
            {
              fileName: "test<script>.png",
              fileData: VALID_PNG_BASE64,
              mimeType: "image/png",
            },
          ],
        }),
      ).rejects.toThrow("Invalid filename");
    });

    it("validates custom pattern security", async () => {
      mockEnforceFixedWindowLimit.mockReturnValue(true);
      mockAcquireLock.mockReturnValue(true);

      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.112"),
      });
      const caller = appRouter.createCaller(ctx);

      const { sessionId } = await caller.picturePress.newSession();
      await caller.picturePress.uploadImages({
        files: [
          {
            fileName: "test.png",
            fileData: VALID_PNG_BASE64,
            mimeType: "image/png",
          },
        ],
        sessionId,
      });

      // Test path traversal in custom pattern
      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            quality: 90,
            namingConvention: "custom-pattern",
            customPattern: "../../../malicious",
          },
        }),
      ).rejects.toThrow("Custom pattern contains invalid characters");

      // Test Windows reserved names in pattern
      await expect(
        caller.picturePress.convertImages({
          sessionId,
          options: {
            outputFormat: "jpeg",
            quality: 90,
            namingConvention: "custom-pattern",
            customPattern: "CON",
          },
        }),
      ).rejects.toThrow("Custom pattern contains invalid characters");
    });

    it("enforces file size limits", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.113"),
      });
      const caller = appRouter.createCaller(ctx);

      // Create a valid base64 string that represents > 10MB when decoded
      // We need to create actual base64 data, not just repeat 'A'
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, "A"); // 11MB buffer
      const largeBase64 = largeBuffer.toString("base64");

      await expect(
        caller.picturePress.uploadImages({
          files: [
            {
              fileName: "large.png",
              fileData: largeBase64,
              mimeType: "image/png",
            },
          ],
        }),
      ).rejects.toThrow("Invalid file data");
    });

    it("enforces batch size limits", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.114"),
      });
      const caller = appRouter.createCaller(ctx);

      // Create array with more than 50 files
      const tooManyFiles = Array.from({ length: 51 }, (_, i) => ({
        fileName: `test${i}.png`,
        fileData: VALID_PNG_BASE64,
        mimeType: "image/png",
      }));

      await expect(
        caller.picturePress.uploadImages({
          files: tooManyFiles,
        }),
      ).rejects.toThrow("Too many files (maximum 50)");
    });

    it("validates MIME type and extension matching", async () => {
      const ctx = await createTRPCContext({
        headers: headersWithIP("203.0.113.115"),
      });
      const caller = appRouter.createCaller(ctx);

      // Test mismatched MIME type and extension
      await expect(
        caller.picturePress.uploadImages({
          files: [
            {
              fileName: "test.png",
              fileData: VALID_PNG_BASE64,
              mimeType: "image/jpeg", // MIME says JPEG but filename says PNG
            },
          ],
        }),
      ).rejects.toThrow("Upload validation failed");
    });
  });
});
