import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  convertImages,
  ConversionPerformanceMonitor,
  benchmarkConversion,
  type ConversionOptions,
  type BatchProcessingOptions,
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
  execFile: vi.fn().mockImplementation(() => Promise.resolve({ stdout: "100 100" })),
}));

describe("Picture Press Performance Tests", () => {
  let tempDir: string;
  let testFiles: string[];

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "picture-press-perf-"));
    
    // Create test image files (mock data)
    testFiles = [];
    for (let i = 0; i < 5; i++) {
      const testFile = path.join(tempDir, `test-image-${i}.jpg`);
      await fs.writeFile(testFile, Buffer.from("fake-image-data-" + "x".repeat(1000 * i))); // Variable sizes
      testFiles.push(testFile);
    }

    // Clear performance metrics before each test
    ConversionPerformanceMonitor.clearMetrics();
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rmdir(tempDir, { recursive: true }).catch(() => {});
  });

  describe("Batch Processing Optimization", () => {
    it("should process files concurrently with optimal batch size", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "png",
        namingConvention: "keep-original",
      };

      const batchOptions: BatchProcessingOptions = {
        maxConcurrency: 3,
        enableMemoryMonitoring: true,
        progressGranularity: 2,
      };

      const startTime = Date.now();
      const results = await convertImages(
        testFiles,
        outputDir,
        options,
        undefined,
        batchOptions
      );

      const duration = Date.now() - startTime;

      expect(results).toHaveLength(testFiles.length);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      // Verify all files were processed
      results.forEach(result => {
        expect(result.originalFile).toBeDefined();
        expect(result.originalName).toBeDefined();
      });
    });

    it("should handle memory threshold limits", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "webp",
        quality: 80,
        namingConvention: "keep-original",
      };

      const batchOptions: BatchProcessingOptions = {
        maxConcurrency: 2,
        memoryThreshold: 100, // Very low threshold to test memory management
        enableMemoryMonitoring: true,
      };

      const results = await convertImages(
        testFiles,
        outputDir,
        options,
        undefined,
        batchOptions
      );

      expect(results).toHaveLength(testFiles.length);
      // Should still complete successfully even with low memory threshold
    });

    it("should respect timeout per file", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "jpeg",
        quality: 90,
        namingConvention: "keep-original",
      };

      const batchOptions: BatchProcessingOptions = {
        maxConcurrency: 1,
        timeoutPerFile: 1, // Very short timeout
        enableMemoryMonitoring: false,
      };

      // This should handle timeouts gracefully
      const results = await convertImages(
        testFiles,
        outputDir,
        options,
        undefined,
        batchOptions
      );

      expect(results).toHaveLength(testFiles.length);
      // Some conversions might fail due to timeout, but it shouldn't crash
    });
  });

  describe("Memory Usage Monitoring", () => {
    it("should track peak memory usage during conversion", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "png",
        namingConvention: "keep-original",
      };

      const batchOptions: BatchProcessingOptions = {
        maxConcurrency: 2,
        enableMemoryMonitoring: true,
      };

      await convertImages(
        testFiles,
        outputDir,
        options,
        undefined,
        batchOptions
      );

      const systemInfo = ConversionPerformanceMonitor.getSystemResourceInfo();
      expect(systemInfo.memoryUsage).toBeDefined();
      expect(systemInfo.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(systemInfo.uptime).toBeGreaterThan(0);
    });

    it("should provide accurate memory usage metrics", async () => {
      const memoryBefore = process.memoryUsage().heapUsed;
      
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "webp",
        quality: 75,
        namingConvention: "keep-original",
      };

      await convertImages(
        testFiles,
        outputDir,
        options,
        undefined,
        { enableMemoryMonitoring: true }
      );

      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryDiff = (memoryAfter - memoryBefore) / (1024 * 1024); // MB

      // Memory usage should be reasonable (less than 100MB for test files)
      expect(memoryDiff).toBeLessThan(100);
    });
  });

  describe("Progress Reporting Granularity", () => {
    it("should report progress at specified granularity", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "jpeg",
        quality: 85,
        namingConvention: "keep-original",
      };

      const progressUpdates: Array<{ current: number; total: number; operation: string }> = [];
      
      const progressCallback = (current: number, total: number, operation: string) => {
        progressUpdates.push({ current, total, operation });
      };

      const batchOptions: BatchProcessingOptions = {
        maxConcurrency: 2,
        progressGranularity: 2, // Report every 2 files
      };

      await convertImages(
        testFiles,
        outputDir,
        options,
        progressCallback,
        batchOptions
      );

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]?.current).toBe(0);
      expect(progressUpdates[progressUpdates.length - 1]?.current).toBe(testFiles.length);
      
      // Should have intermediate progress updates
      const intermediateUpdates = progressUpdates.filter(
        update => update.current > 0 && update.current < testFiles.length
      );
      expect(intermediateUpdates.length).toBeGreaterThan(0);
    });

    it("should optimize progress reporting frequency", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "png",
        namingConvention: "keep-original",
      };

      const progressUpdates: number[] = [];
      
      const progressCallback = (current: number) => {
        progressUpdates.push(current);
      };

      // Test with different granularities
      const granularities = [1, 2, 3];
      
      for (const granularity of granularities) {
        progressUpdates.length = 0; // Clear array
        
        await convertImages(
          testFiles,
          outputDir,
          options,
          progressCallback,
          { progressGranularity: granularity }
        );

        // Higher granularity should result in fewer progress updates
        if (granularity > 1) {
          expect(progressUpdates.length).toBeLessThanOrEqual(Math.ceil(testFiles.length / granularity) + 2);
        }
      }
    });
  });

  describe("Performance Metrics Collection", () => {
    it("should collect and store conversion metrics", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "webp",
        quality: 80,
        namingConvention: "keep-original",
      };

      await convertImages(
        testFiles,
        outputDir,
        options,
        undefined,
        { enableMemoryMonitoring: true }
      );

      const recentMetrics = ConversionPerformanceMonitor.getRecentMetrics(1);
      expect(recentMetrics).toHaveLength(1);

      const metrics = recentMetrics[0];
      expect(metrics?.startTime).toBeDefined();
      expect(metrics?.totalFiles).toBe(testFiles.length);
      expect(metrics?.filesProcessed).toBe(testFiles.length);
    });

    it("should calculate average performance metrics", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "jpeg",
        quality: 90,
        namingConvention: "keep-original",
      };

      // Run multiple conversions to get averages
      for (let i = 0; i < 3; i++) {
        await convertImages(
          testFiles.slice(0, 2), // Use subset for faster tests
          outputDir,
          options,
          undefined,
          { enableMemoryMonitoring: true }
        );
      }

      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      expect(averages.totalConversions).toBeGreaterThan(0);
      expect(averages.averageSuccessRate).toBeGreaterThanOrEqual(0);
      expect(averages.averageSuccessRate).toBeLessThanOrEqual(100);
    });

    it("should limit stored metrics to prevent memory leaks", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "png",
        namingConvention: "keep-original",
      };

      // Run many conversions to test metric storage limits
      for (let i = 0; i < 10; i++) {
        await convertImages(
          [testFiles[0]!], // Single file for speed
          outputDir,
          options,
          undefined,
          { enableMemoryMonitoring: false }
        );
      }

      const recentMetrics = ConversionPerformanceMonitor.getRecentMetrics(20);
      expect(recentMetrics.length).toBeLessThanOrEqual(10); // Should be limited
    });
  });

  describe("Benchmark Performance", () => {
    it("should benchmark different concurrency levels", async () => {
      const outputDir = path.join(tempDir, "benchmark");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "jpeg",
        quality: 85,
        namingConvention: "keep-original",
      };

      const benchmark = await benchmarkConversion(
        testFiles.slice(0, 3), // Use subset for faster benchmarking
        outputDir,
        options
      );

      expect(benchmark.concurrencyBenchmarks).toHaveLength(6); // 6 concurrency levels tested
      expect(benchmark.recommendedConcurrency).toBeGreaterThan(0);
      expect(benchmark.recommendedConcurrency).toBeLessThanOrEqual(8);

      // Verify benchmark results structure
      benchmark.concurrencyBenchmarks.forEach(result => {
        expect(result.concurrency).toBeGreaterThan(0);
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(result.memoryUsage).toBeGreaterThanOrEqual(0);
        expect(result.successRate).toBeGreaterThanOrEqual(0);
        expect(result.successRate).toBeLessThanOrEqual(100);
      });
    });

    it("should recommend optimal concurrency based on performance", async () => {
      const outputDir = path.join(tempDir, "benchmark");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "webp",
        quality: 75,
        namingConvention: "keep-original",
      };

      const benchmark = await benchmarkConversion(
        testFiles.slice(0, 2),
        outputDir,
        options
      );

      // Recommended concurrency should be reasonable
      expect(benchmark.recommendedConcurrency).toBeGreaterThanOrEqual(1);
      expect(benchmark.recommendedConcurrency).toBeLessThanOrEqual(8);

      // Should have valid benchmark data
      const validBenchmarks = benchmark.concurrencyBenchmarks.filter(
        b => b.duration !== Infinity && b.successRate > 0
      );
      expect(validBenchmarks.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should handle conversion failures gracefully in batch processing", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      // Create a mix of valid and invalid files
      const invalidFile = path.join(tempDir, "invalid.jpg");
      await fs.writeFile(invalidFile, "invalid-image-data");
      
      const mixedFiles = [...testFiles.slice(0, 2), invalidFile];

      const options: ConversionOptions = {
        outputFormat: "png",
        namingConvention: "keep-original",
      };

      const results = await convertImages(
        mixedFiles,
        outputDir,
        options,
        undefined,
        { maxConcurrency: 2 }
      );

      expect(results).toHaveLength(mixedFiles.length);
      
      // Should have both successful and failed conversions
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      expect(successful.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);
      
      // Failed conversions should have error messages
      failed.forEach(result => {
        expect(result.error).toBeDefined();
        expect(result.error).toBeTruthy();
      });
    });

    it("should recover from memory pressure", async () => {
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const options: ConversionOptions = {
        outputFormat: "jpeg",
        quality: 95,
        namingConvention: "keep-original",
      };

      // Simulate memory pressure with very low threshold
      const batchOptions: BatchProcessingOptions = {
        maxConcurrency: 4,
        memoryThreshold: 50, // Very low threshold
        enableMemoryMonitoring: true,
      };

      const results = await convertImages(
        testFiles,
        outputDir,
        options,
        undefined,
        batchOptions
      );

      // Should still complete successfully despite memory pressure
      expect(results).toHaveLength(testFiles.length);
      
      // Most conversions should succeed (batch processor should adapt)
      const successRate = results.filter(r => r.success).length / results.length;
      expect(successRate).toBeGreaterThan(0.5); // At least 50% success rate
    });
  });
});