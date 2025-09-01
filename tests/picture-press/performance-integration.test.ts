import { describe, it, expect, beforeEach } from "vitest";
import { ConversionPerformanceMonitor, type ConversionMetrics } from "@/server/lib/picture-press/converter";

// Mock environment variables for testing
vi.mock("@/src/env.js", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NEXT_PUBLIC_API_BASE_URL: "http://localhost:3000",
  },
}));

// Mock Prisma client
vi.mock("@/server/db", () => ({
  db: {
    // Mock any database operations if needed
  },
}));

// Mock the security module to avoid rate limiting in tests
vi.mock("@/server/lib/security", () => ({
  enforceFixedWindowLimit: vi.fn().mockReturnValue(true),
  limiterKey: vi.fn().mockReturnValue("test-key"),
  acquireLock: vi.fn().mockReturnValue(true),
  releaseLock: vi.fn().mockReturnValue(undefined),
}));

// Mock picture press session functions
vi.mock("@/server/lib/picture-press/session", () => ({
  createPicturePressSession: vi.fn().mockResolvedValue({ id: "test-session" }),
  ensurePicturePressSession: vi.fn().mockResolvedValue({
    root: "/tmp/test",
    convertedDir: "/tmp/test/converted",
  }),
  readConversionProgress: vi.fn().mockResolvedValue({
    current: 0,
    total: 0,
    currentOperation: "idle",
    filesProcessed: 0,
    totalFiles: 0,
  }),
  writeConversionProgress: vi.fn().mockResolvedValue(undefined),
  readConversionMeta: vi.fn().mockResolvedValue({
    status: "idle",
    uploadedFiles: [],
  }),
  updateConversionMeta: vi.fn().mockResolvedValue(undefined),
  cleanupPicturePressSession: vi.fn().mockResolvedValue(undefined),
  cleanupExpiredPicturePressessions: vi.fn().mockResolvedValue({ removed: [] }),
  maybeCleanupExpiredPicturePressessions: vi.fn().mockResolvedValue(undefined),
  isAllowedMime: vi.fn().mockReturnValue(true),
  saveMultipleUploads: vi.fn().mockResolvedValue([]),
}));

describe("Picture Press Performance Integration", () => {
  beforeEach(() => {
    // Clear metrics before each test
    ConversionPerformanceMonitor.clearMetrics();
  });

  describe("Performance Monitoring Integration", () => {
    it("should integrate with performance monitoring system", () => {
      // Record some test metrics
      const testMetrics: ConversionMetrics = {
        startTime: Date.now() - 5000,
        endTime: Date.now(),
        totalDuration: 5000,
        filesProcessed: 5,
        totalFiles: 5,
        averageTimePerFile: 1000,
        peakMemoryUsage: 256,
        totalOriginalSize: 1024 * 1024 * 5,
        totalConvertedSize: 1024 * 1024 * 4,
        compressionRatio: 20,
        errors: 0,
        engineUsed: "ImageMagick",
      };

      ConversionPerformanceMonitor.recordMetrics(testMetrics);

      const recent = ConversionPerformanceMonitor.getRecentMetrics(1);
      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      const systemInfo = ConversionPerformanceMonitor.getSystemResourceInfo();

      expect(recent).toHaveLength(1);
      expect(recent[0]).toEqual(testMetrics);
      
      expect(averages.totalConversions).toBe(5);
      expect(averages.averageSuccessRate).toBe(100);
      
      expect(systemInfo.memoryUsage).toBeDefined();
      expect(systemInfo.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(systemInfo.uptime).toBeGreaterThan(0);
    });

    it("should handle empty metrics state", () => {
      const recent = ConversionPerformanceMonitor.getRecentMetrics(10);
      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      const systemInfo = ConversionPerformanceMonitor.getSystemResourceInfo();

      expect(recent).toHaveLength(0);
      expect(averages.totalConversions).toBe(0);
      expect(averages.averageSuccessRate).toBe(0);
      expect(systemInfo.memoryUsage.heapUsed).toBeGreaterThan(0);
    });

    it("should maintain metrics ordering", () => {
      // Record multiple metrics with different timestamps
      const baseTime = Date.now();
      
      for (let i = 0; i < 3; i++) {
        const metrics: ConversionMetrics = {
          startTime: baseTime - (3 - i) * 1000,
          endTime: baseTime - (3 - i) * 1000 + 500,
          totalDuration: 500,
          filesProcessed: i + 1,
          totalFiles: i + 1,
          averageTimePerFile: 500,
          totalOriginalSize: 1024,
          totalConvertedSize: 512,
          errors: 0,
        };
        ConversionPerformanceMonitor.recordMetrics(metrics);
      }

      const recent = ConversionPerformanceMonitor.getRecentMetrics(3);

      expect(recent).toHaveLength(3);
      // Should be ordered from oldest to newest (as returned by getRecentMetrics)
      expect(recent[0]?.filesProcessed).toBe(1);
      expect(recent[1]?.filesProcessed).toBe(2);
      expect(recent[2]?.filesProcessed).toBe(3);
    });

    it("should calculate system resource information correctly", () => {
      const systemInfo = ConversionPerformanceMonitor.getSystemResourceInfo();

      expect(systemInfo.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(systemInfo.memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(systemInfo.memoryUsage.external).toBeGreaterThanOrEqual(0);
      
      // Memory values should be reasonable (less than 10GB)
      expect(systemInfo.memoryUsage.heapUsed).toBeLessThan(10 * 1024 * 1024 * 1024);
      expect(systemInfo.memoryUsage.heapTotal).toBeLessThan(10 * 1024 * 1024 * 1024);

      expect(systemInfo.uptime).toBeGreaterThanOrEqual(0);
      expect(systemInfo.cpuUsage).toBeDefined();
      expect(typeof systemInfo.cpuUsage.user).toBe("number");
      expect(typeof systemInfo.cpuUsage.system).toBe("number");
    });

    it("should format metrics for API consumption", () => {
      const testMetrics: ConversionMetrics = {
        startTime: Date.now() - 2000,
        endTime: Date.now(),
        totalDuration: 2000,
        filesProcessed: 3,
        totalFiles: 3,
        averageTimePerFile: 667,
        peakMemoryUsage: 128,
        totalOriginalSize: 1024 * 1024,
        totalConvertedSize: 1024 * 1024 * 0.8,
        compressionRatio: 20,
        errors: 0,
        engineUsed: "ImageMagick",
      };

      ConversionPerformanceMonitor.recordMetrics(testMetrics);

      const recent = ConversionPerformanceMonitor.getRecentMetrics(5);
      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      const systemInfo = ConversionPerformanceMonitor.getSystemResourceInfo();

      // Simulate API response format
      const apiResponse = {
        recent,
        averages,
        system: {
          memoryUsage: {
            used: Math.round(systemInfo.memoryUsage.heapUsed / (1024 * 1024)), // MB
            total: Math.round(systemInfo.memoryUsage.heapTotal / (1024 * 1024)), // MB
            external: Math.round(systemInfo.memoryUsage.external / (1024 * 1024)), // MB
          },
          uptime: Math.round(systemInfo.uptime / 3600), // hours
          cpuUsage: systemInfo.cpuUsage,
        },
      };

      expect(apiResponse.recent).toHaveLength(1);
      expect(apiResponse.averages.totalConversions).toBe(3);
      expect(apiResponse.system.memoryUsage.used).toBeGreaterThan(0);
      expect(apiResponse.system.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Performance Metrics with Different Scenarios", () => {
    it("should handle metrics with mixed success rates", () => {
      // Record metrics with different error rates
      const successfulMetrics: ConversionMetrics = {
        startTime: Date.now() - 2000,
        endTime: Date.now() - 1000,
        totalDuration: 1000,
        filesProcessed: 10,
        totalFiles: 10,
        averageTimePerFile: 100,
        totalOriginalSize: 1024 * 1024,
        totalConvertedSize: 1024 * 1024 * 0.8,
        errors: 0,
      };

      const partialFailureMetrics: ConversionMetrics = {
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        totalDuration: 1000,
        filesProcessed: 7,
        totalFiles: 10,
        averageTimePerFile: 143,
        totalOriginalSize: 1024 * 1024,
        totalConvertedSize: 1024 * 1024 * 0.7,
        errors: 3,
      };

      ConversionPerformanceMonitor.recordMetrics(successfulMetrics);
      ConversionPerformanceMonitor.recordMetrics(partialFailureMetrics);

      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      const recent = ConversionPerformanceMonitor.getRecentMetrics(2);

      expect(averages.totalConversions).toBe(20);
      expect(averages.averageSuccessRate).toBe(85); // 17 successful out of 20 total
      expect(recent).toHaveLength(2);
    });

    it("should handle metrics with different engines", () => {
      const imageMagickMetrics: ConversionMetrics = {
        startTime: Date.now() - 2000,
        endTime: Date.now() - 1000,
        totalDuration: 800,
        filesProcessed: 5,
        totalFiles: 5,
        averageTimePerFile: 160,
        totalOriginalSize: 1024 * 1024,
        totalConvertedSize: 1024 * 1024 * 0.8,
        errors: 0,
        engineUsed: "ImageMagick",
      };

      const jimpMetrics: ConversionMetrics = {
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        totalDuration: 1200,
        filesProcessed: 3,
        totalFiles: 3,
        averageTimePerFile: 400,
        totalOriginalSize: 1024 * 1024,
        totalConvertedSize: 1024 * 1024 * 0.9,
        errors: 0,
        engineUsed: "Jimp (fallback)",
      };

      ConversionPerformanceMonitor.recordMetrics(imageMagickMetrics);
      ConversionPerformanceMonitor.recordMetrics(jimpMetrics);

      const recent = ConversionPerformanceMonitor.getRecentMetrics(2);
      const averages = ConversionPerformanceMonitor.getAverageMetrics();

      expect(recent).toHaveLength(2);
      expect(recent[0]?.engineUsed).toBe("ImageMagick");
      expect(recent[1]?.engineUsed).toBe("Jimp (fallback)");
      expect(averages.averageDuration).toBe(1000); // (800 + 1200) / 2
    });

    it("should handle metrics with varying memory usage", () => {
      const lowMemoryMetrics: ConversionMetrics = {
        startTime: Date.now() - 2000,
        endTime: Date.now() - 1000,
        totalDuration: 1000,
        filesProcessed: 2,
        totalFiles: 2,
        averageTimePerFile: 500,
        peakMemoryUsage: 128,
        totalOriginalSize: 1024 * 1024,
        totalConvertedSize: 1024 * 1024 * 0.8,
        errors: 0,
      };

      const highMemoryMetrics: ConversionMetrics = {
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        totalDuration: 1000,
        filesProcessed: 8,
        totalFiles: 8,
        averageTimePerFile: 125,
        peakMemoryUsage: 512,
        totalOriginalSize: 1024 * 1024 * 8,
        totalConvertedSize: 1024 * 1024 * 6,
        errors: 0,
      };

      ConversionPerformanceMonitor.recordMetrics(lowMemoryMetrics);
      ConversionPerformanceMonitor.recordMetrics(highMemoryMetrics);

      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      const recent = ConversionPerformanceMonitor.getRecentMetrics(2);

      expect(averages.averageMemoryUsage).toBe(320); // (128 + 512) / 2
      expect(recent[0]?.peakMemoryUsage).toBe(128);
      expect(recent[1]?.peakMemoryUsage).toBe(512);
    });
  });
});