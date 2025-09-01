import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  createPicturePressSession,
  ensurePicturePressSession,
  saveMultipleUploads,
  readConversionMeta,
  updateConversionMeta,
  writeConversionProgress,
  readConversionProgress,
  cleanupPicturePressSession,
  type ConversionSessionMeta,
  type ConversionProgress,
} from "@/server/lib/picture-press/session";

// Mock environment variable for consistent test paths
const TEST_TMP_DIR = path.join(os.tmpdir(), "picture-press-test-sessions");

beforeEach(() => {
  vi.stubEnv("PP_TMP_DIR", TEST_TMP_DIR);
});

afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(TEST_TMP_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  vi.unstubAllEnvs();
});

describe("Picture Press Session Management", () => {
  describe("createPicturePressSession", () => {
    it("should create a new session with proper directory structure", async () => {
      const session = await createPicturePressSession();

      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(session.root).toContain(session.id);
      expect(session.uploadsDir).toContain("uploads");
      expect(session.convertedDir).toContain("converted");
      expect(session.progressPath).toContain("progress.json");
      expect(session.metaPath).toContain("session.json");

      // Verify directories exist
      await expect(fs.access(session.uploadsDir)).resolves.toBeUndefined();
      await expect(fs.access(session.convertedDir)).resolves.toBeUndefined();

      // Verify initial files exist
      await expect(fs.access(session.progressPath)).resolves.toBeUndefined();
      await expect(fs.access(session.metaPath)).resolves.toBeUndefined();

      // Verify initial meta content
      const metaContent = await fs.readFile(session.metaPath, "utf8");
      const meta = JSON.parse(metaContent) as ConversionSessionMeta;
      expect(meta.id).toBe(session.id);
      expect(meta.status).toBe("idle");
      expect(meta.uploadedFiles).toEqual([]);
      expect(meta.createdAt).toBeDefined();
      expect(meta.expiresAt).toBeDefined();

      // Verify initial progress content
      const progressContent = await fs.readFile(session.progressPath, "utf8");
      const progress = JSON.parse(progressContent) as ConversionProgress;
      expect(progress.current).toBe(0);
      expect(progress.total).toBe(0);
      expect(progress.currentOperation).toBe("Idle");
      expect(progress.filesProcessed).toBe(0);
      expect(progress.totalFiles).toBe(0);
    });

    it("should create session with custom TTL", async () => {
      const customTtl = 60 * 60 * 1000; // 1 hour
      const session = await createPicturePressSession(customTtl);

      const metaContent = await fs.readFile(session.metaPath, "utf8");
      const meta = JSON.parse(metaContent) as ConversionSessionMeta;

      const createdAt = new Date(meta.createdAt).getTime();
      const expiresAt = new Date(meta.expiresAt).getTime();
      const actualTtl = expiresAt - createdAt;

      expect(actualTtl).toBe(customTtl);
    });
  });

  describe("ensurePicturePressSession", () => {
    it("should return existing session paths", async () => {
      const originalSession = await createPicturePressSession();
      const ensuredSession = await ensurePicturePressSession(
        originalSession.id,
      );

      expect(ensuredSession.id).toBe(originalSession.id);
      expect(ensuredSession.root).toBe(originalSession.root);
      expect(ensuredSession.uploadsDir).toBe(originalSession.uploadsDir);
      expect(ensuredSession.convertedDir).toBe(originalSession.convertedDir);
    });

    it("should throw error for non-existent session", async () => {
      const fakeSessionId = "00000000-0000-0000-0000-000000000000";

      await expect(ensurePicturePressSession(fakeSessionId)).rejects.toThrow(
        `Picture Press session not found: ${fakeSessionId}`,
      );
    });
  });

  describe("saveMultipleUploads", () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await createPicturePressSession();
      sessionId = session.id;
    });

    it("should save multiple valid image files", async () => {
      // Create test base64 data for a 1x1 PNG
      const pngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAF0gJ/kXn7tQAAAABJRU5ErkJggg==";

      const files = [
        {
          fileName: "test1.png",
          base64Data: pngBase64,
          mimeType: "image/png",
        },
        {
          fileName: "test2.jpg",
          base64Data: pngBase64, // Using PNG data but with JPG extension for testing
          mimeType: "image/jpeg",
        },
      ];

      const results = await saveMultipleUploads({ sessionId, files });

      expect(results).toHaveLength(2);
      expect(results[0]!.originalName).toBe("test1.png");
      expect(results[1]!.originalName).toBe("test2.jpg");
      expect(results[0]!.size).toBeGreaterThan(0);
      expect(results[1]!.size).toBeGreaterThan(0);

      // Verify files were actually saved
      await expect(fs.access(results[0]!.savedPath)).resolves.toBeUndefined();
      await expect(fs.access(results[1]!.savedPath)).resolves.toBeUndefined();

      // Verify meta was updated
      const meta = await readConversionMeta(sessionId);
      expect(meta?.uploadedFiles).toHaveLength(2);
      expect(meta?.uploadedFiles?.[0]?.originalName).toBe("test1.png");
      expect(meta?.uploadedFiles?.[1]?.originalName).toBe("test2.jpg");
    });

    it("should reject unsupported MIME types", async () => {
      const files = [
        {
          fileName: "test.txt",
          base64Data: "dGVzdA==", // "test" in base64
          mimeType: "text/plain",
        },
      ];

      await expect(saveMultipleUploads({ sessionId, files })).rejects.toThrow(
        "Unsupported MIME type: text/plain for file: test.txt",
      );
    });

    it("should reject invalid base64 data", async () => {
      const files = [
        {
          fileName: "test.png",
          base64Data: "invalid-base64-data!@#$%",
          mimeType: "image/png",
        },
      ];

      await expect(saveMultipleUploads({ sessionId, files })).rejects.toThrow(
        "Invalid base64 payload for file: test.png",
      );
    });

    it("should reject empty files", async () => {
      const files = [
        {
          fileName: "empty.png",
          base64Data: "",
          mimeType: "image/png",
        },
      ];

      await expect(saveMultipleUploads({ sessionId, files })).rejects.toThrow(
        "Empty file: empty.png",
      );
    });

    it("should reject files exceeding size limit", async () => {
      const files = [
        {
          fileName: "large.png",
          base64Data:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAF0gJ/kXn7tQAAAABJRU5ErkJggg==",
          mimeType: "image/png",
        },
      ];

      await expect(
        saveMultipleUploads({
          sessionId,
          files,
          maxBytes: 10, // Very small limit
        }),
      ).rejects.toThrow("File too large: large.png. Max 10 bytes");
    });

    it("should throw error when no files provided", async () => {
      await expect(
        saveMultipleUploads({ sessionId, files: [] }),
      ).rejects.toThrow("No files provided");
    });

    it("should handle files with special characters in names", async () => {
      const pngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAF0gJ/kXn7tQAAAABJRU5ErkJggg==";

      const files = [
        {
          fileName: "test file with spaces & symbols!@#.png",
          base64Data: pngBase64,
          mimeType: "image/png",
        },
      ];

      const results = await saveMultipleUploads({ sessionId, files });

      expect(results).toHaveLength(1);
      expect(results[0]!.originalName).toBe(
        "test file with spaces & symbols!@#.png",
      );

      // Verify the saved path has sanitized filename
      expect(results[0]!.savedPath).toMatch(
        /original-0-test_file_with_spaces___symbols___\.png$/,
      );
    });

    it("should support additional image formats (GIF, TIFF, BMP)", async () => {
      const pngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAF0gJ/kXn7tQAAAABJRU5ErkJggg==";

      const files = [
        {
          fileName: "test.gif",
          base64Data: pngBase64,
          mimeType: "image/gif",
        },
        {
          fileName: "test.tiff",
          base64Data: pngBase64,
          mimeType: "image/tiff",
        },
        {
          fileName: "test.bmp",
          base64Data: pngBase64,
          mimeType: "image/bmp",
        },
      ];

      const results = await saveMultipleUploads({ sessionId, files });

      expect(results).toHaveLength(3);
      expect(results[0]!.originalName).toBe("test.gif");
      expect(results[1]!.originalName).toBe("test.tiff");
      expect(results[2]!.originalName).toBe("test.bmp");

      // Verify files were saved with correct extensions
      expect(results[0]!.savedPath).toMatch(/\.gif$/);
      expect(results[1]!.savedPath).toMatch(/\.tiff$/);
      expect(results[2]!.savedPath).toMatch(/\.bmp$/);
    });
  });

  describe("progress and meta operations", () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await createPicturePressSession();
      sessionId = session.id;
    });

    it("should write and read conversion progress", async () => {
      const progress: ConversionProgress = {
        current: 5,
        total: 10,
        currentOperation: "Converting images",
        filesProcessed: 2,
        totalFiles: 5,
        currentFile: "test.png",
      };

      await writeConversionProgress(sessionId, progress);
      const readProgress = await readConversionProgress(sessionId);

      expect(readProgress).toEqual(progress);
    });

    it("should return default progress for new session", async () => {
      const progress = await readConversionProgress(sessionId);

      expect(progress.current).toBe(0);
      expect(progress.total).toBe(0);
      expect(progress.currentOperation).toBe("Idle");
      expect(progress.filesProcessed).toBe(0);
      expect(progress.totalFiles).toBe(0);
    });

    it("should update conversion meta", async () => {
      const metaUpdate: Partial<ConversionSessionMeta> = {
        status: "processing",
        conversionOptions: {
          outputFormat: "webp",
          quality: 80,
          namingConvention: "keep-original",
        },
      };

      const updatedMeta = await updateConversionMeta(sessionId, metaUpdate);

      expect(updatedMeta.status).toBe("processing");
      expect(updatedMeta.conversionOptions?.outputFormat).toBe("webp");
      expect(updatedMeta.conversionOptions?.quality).toBe(80);
      expect(updatedMeta.id).toBe(sessionId);

      // Verify it was persisted
      const readMeta = await readConversionMeta(sessionId);
      expect(readMeta?.status).toBe("processing");
      expect(readMeta?.conversionOptions?.outputFormat).toBe("webp");
    });
  });

  describe("cleanup operations", () => {
    it("should cleanup session directory", async () => {
      const session = await createPicturePressSession();

      // Verify session exists
      await expect(fs.access(session.root)).resolves.toBeUndefined();

      // Cleanup session
      await cleanupPicturePressSession(session.id);

      // Verify session directory is removed
      await expect(fs.access(session.root)).rejects.toThrow();
    });

    it("should handle cleanup of non-existent session gracefully", async () => {
      const fakeSessionId = "00000000-0000-0000-0000-000000000000";

      // Should not throw error
      await expect(
        cleanupPicturePressSession(fakeSessionId),
      ).resolves.toBeUndefined();
    });
  });
});
