import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  convertImages,
  validateConversionOptions,
  getSupportedFormats,
  type ConversionOptions,
} from "@/server/lib/picture-press/converter";

// Mock pixel-forge to avoid external dependencies in tests
vi.mock("pixel-forge", () => ({
  ImageProcessor: vi.fn().mockImplementation(() => ({
    save: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock the ensureImageEngine function
vi.mock("@/server/lib/pixel-forge/deps", () => ({
  ensureImageEngine: vi.fn().mockResolvedValue(undefined),
}));

// Mock ImageMagick commands
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

// Mock the dynamic import of child_process
vi.mock("util", () => ({
  promisify: vi.fn((fn) => fn),
}));

describe("Picture Press Simplified Converter", () => {
  let tempDir: string;
  let testFiles: string[];

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "picture-press-simple-"));
    
    // Create test image files (mock data)
    testFiles = [];
    for (let i = 0; i < 3; i++) {
      const testFile = path.join(tempDir, `test-image-${i}.jpg`);
      await fs.writeFile(testFile, Buffer.from("fake-image-data-" + "x".repeat(1000 * (i + 1)))); // Variable sizes
      testFiles.push(testFile);
    }
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("Sequential Processing", () => {
    it("should handle conversion function signature correctly", () => {
      // Test that the convertImages function has the correct signature
      expect(typeof convertImages).toBe("function");
      expect(convertImages.length).toBe(4); // inputFiles, outputDir, options, progressCallback
    });
  });

  describe("Validation", () => {
    it("should validate conversion options correctly", () => {
      const validOptions: ConversionOptions = {
        outputFormat: "jpeg",
        quality: 80,
        namingConvention: "keep-original",
      };

      const validation = validateConversionOptions(validOptions);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should reject invalid options", () => {
      const invalidOptions: ConversionOptions = {
        outputFormat: "invalid" as unknown,
        quality: 150, // Too high
        namingConvention: "custom-pattern",
        // Missing custom pattern
      };

      const validation = validateConversionOptions(invalidOptions);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it("should validate quality settings for appropriate formats", () => {
      // Quality should be valid for JPEG
      const jpegOptions: ConversionOptions = {
        outputFormat: "jpeg",
        quality: 80,
        namingConvention: "keep-original",
      };
      expect(validateConversionOptions(jpegOptions).valid).toBe(true);

      // Quality should not be valid for PNG
      const pngOptions: ConversionOptions = {
        outputFormat: "png",
        quality: 80,
        namingConvention: "keep-original",
      };
      expect(validateConversionOptions(pngOptions).valid).toBe(false);
    });
  });

  describe("Supported Formats", () => {
    it("should return correct supported formats", () => {
      const formats = getSupportedFormats();
      
      expect(formats).toHaveLength(6);
      expect(formats.map(f => f.format)).toEqual([
        "jpeg", "png", "webp", "gif", "tiff", "bmp"
      ]);
      
      // Check quality support
      const jpegFormat = formats.find(f => f.format === "jpeg");
      const pngFormat = formats.find(f => f.format === "png");
      
      expect(jpegFormat?.supportsQuality).toBe(true);
      expect(pngFormat?.supportsQuality).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle empty file list", async () => {
      const outputDir = path.join(tempDir, "output");
      
      const options: ConversionOptions = {
        outputFormat: "jpeg",
        namingConvention: "keep-original",
      };

      await expect(
        convertImages([], outputDir, options)
      ).rejects.toThrow("No input files provided for conversion");
    });

    it("should handle too many files", async () => {
      const outputDir = path.join(tempDir, "output");
      const tooManyFiles = Array(101).fill(testFiles[0]); // 101 files
      
      const options: ConversionOptions = {
        outputFormat: "jpeg",
        namingConvention: "keep-original",
      };

      await expect(
        convertImages(tooManyFiles, outputDir, options)
      ).rejects.toThrow("Too many files for batch conversion (maximum 100 files)");
    });

    it("should handle missing input files", async () => {
      const outputDir = path.join(tempDir, "output");
      const missingFiles = ["/nonexistent/file1.jpg", "/nonexistent/file2.jpg"];
      
      const options: ConversionOptions = {
        outputFormat: "jpeg",
        namingConvention: "keep-original",
      };

      await expect(
        convertImages(missingFiles, outputDir, options)
      ).rejects.toThrow("Input files not found or not accessible");
    });
  });
});