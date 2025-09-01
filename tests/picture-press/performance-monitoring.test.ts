import { describe, it, expect, beforeEach } from "vitest";
import {
  ConversionPerformanceMonitor,
  type ConversionMetrics,
} from "@/server/lib/picture-press/converter";

describe("Picture Press Performance Monitoring", () => {
  beforeEach(() => {
    // Clear metrics before each test
    ConversionPerformanceMonitor.clearMetrics();
  });

  describe("ConversionPerformanceMonitor", () => {
    it("should record and retrieve metrics", () => {
      const testMetrics: ConversionMetrics = {
        startTime: Date.now() - 5000,
        endTime: Date.now(),
        totalDuration: 5000,
        filesProcessed: 10,
        totalFiles: 10,
        averageTimePerFile: 500,
        peakMemoryUsage: 256,
        totalOriginalSize: 1024 * 1024 * 10, // 10MB
        totalConvertedSize: 1024 * 1024 * 8, // 8MB
        compressionRatio: 20,
        errors: 0,
        engineUsed: "ImageMagick",
      };

      ConversionPerformanceMonitor.recordMetrics(testMetrics);

      const recentMetrics = ConversionPerformanceMonitor.getRecentMetrics(1);
      expect(recentMetrics).toHaveLength(1);
      expect(recentMetrics[0]).toEqual(testMetrics);
    });

    it("should calculate average metrics correctly", () => {
      const metrics1: ConversionMetrics = {
        startTime: Date.now() - 10000,
        endTime: Date.now() - 5000,
        totalDuration: 5000,
        filesProcessed: 5,
        totalFiles: 5,
        averageTimePerFile: 1000,
        peakMemoryUsage: 200,
        totalOriginalSize: 1024 * 1024 * 5,
        totalConvertedSize: 1024 * 1024 * 4,
        compressionRatio: 20,
        errors: 0,
        engineUsed: "ImageMagick",
      };

      const metrics2: ConversionMetrics = {
        startTime: Date.now() - 5000,
        endTime: Date.now(),
        totalDuration: 3000,
        filesProcessed: 3,
        totalFiles: 3,
        averageTimePerFile: 1000,
        peakMemoryUsage: 300,
        totalOriginalSize: 1024 * 1024 * 3,
        totalConvertedSize: 1024 * 1024 * 2,
        compressionRatio: 33.33,
        errors: 1,
        engineUsed: "ImageMagick",
      };

      ConversionPerformanceMonitor.recordMetrics(metrics1);
      ConversionPerformanceMonitor.recordMetrics(metrics2);

      const averages = ConversionPerformanceMonitor.getAverageMetrics();

      expect(averages.totalConversions).toBe(8); // 5 + 3
      expect(averages.averageDuration).toBe(4000); // (5000 + 3000) / 2
      expect(averages.averageTimePerFile).toBe(1000); // (1000 + 1000) / 2
      expect(averages.averageMemoryUsage).toBe(250); // (200 + 300) / 2
      expect(averages.averageCompressionRatio).toBeCloseTo(26.67, 1); // (20 + 33.33) / 2
      expect(averages.averageSuccessRate).toBe(87.5); // 7 successful out of 8 total
    });

    it("should limit stored metrics to prevent memory leaks", () => {
      // Record more than the maximum allowed metrics
      for (let i = 0; i < 150; i++) {
        const metrics: ConversionMetrics = {
          startTime: Date.now() - 1000,
          endTime: Date.now(),
          totalDuration: 1000,
          filesProcessed: 1,
          totalFiles: 1,
          averageTimePerFile: 1000,
          totalOriginalSize: 1024,
          totalConvertedSize: 512,
          errors: 0,
        };
        ConversionPerformanceMonitor.recordMetrics(metrics);
      }

      const recentMetrics = ConversionPerformanceMonitor.getRecentMetrics(200);
      expect(recentMetrics.length).toBeLessThanOrEqual(100); // Should be limited to MAX_STORED_METRICS
    });

    it("should handle empty metrics gracefully", () => {
      const averages = ConversionPerformanceMonitor.getAverageMetrics();

      expect(averages.totalConversions).toBe(0);
      expect(averages.averageDuration).toBe(0);
      expect(averages.averageTimePerFile).toBe(0);
      expect(averages.averageMemoryUsage).toBe(0);
      expect(averages.averageCompressionRatio).toBe(0);
      expect(averages.averageSuccessRate).toBe(0);
    });

    it("should provide system resource information", () => {
      const systemInfo = ConversionPerformanceMonitor.getSystemResourceInfo();

      expect(systemInfo.memoryUsage).toBeDefined();
      expect(systemInfo.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(systemInfo.memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(systemInfo.uptime).toBeGreaterThan(0);
      expect(systemInfo.cpuUsage).toBeDefined();
    });

    it("should retrieve recent metrics with specified count", () => {
      // Record 5 metrics
      for (let i = 0; i < 5; i++) {
        const metrics: ConversionMetrics = {
          startTime: Date.now() - 1000,
          endTime: Date.now(),
          totalDuration: 1000,
          filesProcessed: i + 1,
          totalFiles: i + 1,
          averageTimePerFile: 1000,
          totalOriginalSize: 1024,
          totalConvertedSize: 512,
          errors: 0,
        };
        ConversionPerformanceMonitor.recordMetrics(metrics);
      }

      const recent3 = ConversionPerformanceMonitor.getRecentMetrics(3);
      expect(recent3).toHaveLength(3);
      
      // Should return the most recent 3 metrics
      expect(recent3[0]?.filesProcessed).toBe(3);
      expect(recent3[1]?.filesProcessed).toBe(4);
      expect(recent3[2]?.filesProcessed).toBe(5);
    });

    it("should clear all metrics", () => {
      // Record some metrics
      const metrics: ConversionMetrics = {
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        totalDuration: 1000,
        filesProcessed: 1,
        totalFiles: 1,
        averageTimePerFile: 1000,
        totalOriginalSize: 1024,
        totalConvertedSize: 512,
        errors: 0,
      };
      ConversionPerformanceMonitor.recordMetrics(metrics);

      expect(ConversionPerformanceMonitor.getRecentMetrics(10)).toHaveLength(1);

      ConversionPerformanceMonitor.clearMetrics();

      expect(ConversionPerformanceMonitor.getRecentMetrics(10)).toHaveLength(0);
      
      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      expect(averages.totalConversions).toBe(0);
    });
  });

  describe("Performance Metrics Validation", () => {
    it("should handle metrics with missing optional fields", () => {
      const minimalMetrics: ConversionMetrics = {
        startTime: Date.now() - 1000,
        filesProcessed: 1,
        totalFiles: 1,
        totalOriginalSize: 1024,
        totalConvertedSize: 512,
        errors: 0,
      };

      ConversionPerformanceMonitor.recordMetrics(minimalMetrics);

      const recentMetrics = ConversionPerformanceMonitor.getRecentMetrics(1);
      expect(recentMetrics).toHaveLength(1);
      expect(recentMetrics[0]).toEqual(minimalMetrics);
    });

    it("should calculate compression ratio correctly", () => {
      const metrics: ConversionMetrics = {
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        totalDuration: 1000,
        filesProcessed: 2,
        totalFiles: 2,
        averageTimePerFile: 500,
        totalOriginalSize: 1000,
        totalConvertedSize: 750, // 25% compression
        compressionRatio: 25,
        errors: 0,
      };

      ConversionPerformanceMonitor.recordMetrics(metrics);

      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      expect(averages.averageCompressionRatio).toBe(25);
    });

    it("should handle zero original size gracefully", () => {
      const metrics: ConversionMetrics = {
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        totalDuration: 1000,
        filesProcessed: 1,
        totalFiles: 1,
        averageTimePerFile: 1000,
        totalOriginalSize: 0,
        totalConvertedSize: 0,
        errors: 1, // Failed conversion
      };

      ConversionPerformanceMonitor.recordMetrics(metrics);

      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      expect(averages.averageCompressionRatio).toBe(0);
      expect(averages.averageSuccessRate).toBe(0); // 0 successful out of 1 total
    });
  });

  describe("Performance Benchmarking", () => {
    it("should track performance trends over time", () => {
      const baseTime = Date.now();
      
      // Simulate performance degradation over time
      for (let i = 0; i < 5; i++) {
        const metrics: ConversionMetrics = {
          startTime: baseTime - (5 - i) * 10000,
          endTime: baseTime - (5 - i) * 10000 + (1000 + i * 200), // Increasing duration
          totalDuration: 1000 + i * 200,
          filesProcessed: 3,
          totalFiles: 3,
          averageTimePerFile: (1000 + i * 200) / 3,
          peakMemoryUsage: 200 + i * 50, // Increasing memory usage
          totalOriginalSize: 1024 * 1024,
          totalConvertedSize: 1024 * 1024 * 0.8,
          compressionRatio: 20,
          errors: 0,
        };
        ConversionPerformanceMonitor.recordMetrics(metrics);
      }

      const recentMetrics = ConversionPerformanceMonitor.getRecentMetrics(5);
      expect(recentMetrics).toHaveLength(5);

      // Verify performance degradation trend
      expect(recentMetrics[0]?.totalDuration).toBeLessThan(recentMetrics[4]?.totalDuration!);
      expect(recentMetrics[0]?.peakMemoryUsage).toBeLessThan(recentMetrics[4]?.peakMemoryUsage!);

      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      expect(averages.averageDuration).toBe(1400); // Average of 1000, 1200, 1400, 1600, 1800
      expect(averages.averageMemoryUsage).toBe(300); // Average of 200, 250, 300, 350, 400
    });

    it("should identify performance bottlenecks", () => {
      // Record metrics with different error rates
      const goodMetrics: ConversionMetrics = {
        startTime: Date.now() - 2000,
        endTime: Date.now() - 1000,
        totalDuration: 1000,
        filesProcessed: 10,
        totalFiles: 10,
        averageTimePerFile: 100,
        totalOriginalSize: 1024 * 1024 * 10,
        totalConvertedSize: 1024 * 1024 * 8,
        errors: 0, // No errors
      };

      const badMetrics: ConversionMetrics = {
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        totalDuration: 1000,
        filesProcessed: 5,
        totalFiles: 10,
        averageTimePerFile: 200,
        totalOriginalSize: 1024 * 1024 * 10,
        totalConvertedSize: 1024 * 1024 * 4,
        errors: 5, // 50% error rate
      };

      ConversionPerformanceMonitor.recordMetrics(goodMetrics);
      ConversionPerformanceMonitor.recordMetrics(badMetrics);

      const averages = ConversionPerformanceMonitor.getAverageMetrics();
      expect(averages.averageSuccessRate).toBe(75); // 15 successful out of 20 total
      expect(averages.totalConversions).toBe(20);
    });
  });
});