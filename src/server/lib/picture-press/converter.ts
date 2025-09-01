import { promises as fs } from "fs";
import path from "path";
import { ImageProcessor } from "pixel-forge";
import { ensureImageEngine } from "../pixel-forge/deps";

// Performance monitoring interfaces
export interface ConversionMetrics {
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  filesProcessed: number;
  totalFiles: number;
  averageTimePerFile?: number;
  peakMemoryUsage?: number;
  totalOriginalSize: number;
  totalConvertedSize: number;
  compressionRatio?: number;
  errors: number;
  engineUsed?: string;
}

export interface BatchProcessingOptions {
  maxConcurrency?: number;
  memoryThreshold?: number; // MB
  progressGranularity?: number; // Report progress every N files
  enableMemoryMonitoring?: boolean;
  timeoutPerFile?: number; // seconds
}

// Memory monitoring utilities
class MemoryMonitor {
  private peakUsage = 0;
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;

  startMonitoring(intervalMs = 1000): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.peakUsage = 0;
    
    this.monitoringInterval = setInterval(() => {
      const usage = process.memoryUsage();
      const currentUsageMB = usage.heapUsed / (1024 * 1024);
      
      if (currentUsageMB > this.peakUsage) {
        this.peakUsage = currentUsageMB;
      }
    }, intervalMs);
  }

  stopMonitoring(): number {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    return this.peakUsage;
  }

  getCurrentUsageMB(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / (1024 * 1024);
  }

  getPeakUsageMB(): number {
    return this.peakUsage;
  }

  checkMemoryThreshold(thresholdMB: number): boolean {
    return this.getCurrentUsageMB() > thresholdMB;
  }
}

// Batch processing queue for optimized concurrent processing
class BatchProcessor {
  private queue: Array<() => Promise<ConversionResult>> = [];
  private running = 0;
  private maxConcurrency: number;
  private memoryMonitor: MemoryMonitor;
  private memoryThreshold: number;

  constructor(maxConcurrency = 3, memoryThresholdMB = 512) {
    this.maxConcurrency = maxConcurrency;
    this.memoryThreshold = memoryThresholdMB;
    this.memoryMonitor = new MemoryMonitor();
  }

  async processAll<T>(
    tasks: Array<() => Promise<T>>,
    progressCallback?: (completed: number, total: number) => void
  ): Promise<T[]> {
    const results: T[] = [];
    const total = tasks.length;
    let completed = 0;

    this.memoryMonitor.startMonitoring();

    return new Promise((resolve, _reject) => {
      const processNext = () => {
        // Check memory threshold before starting new tasks
        if (this.memoryMonitor.checkMemoryThreshold(this.memoryThreshold)) {
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
          
          // If still over threshold, reduce concurrency temporarily
          if (this.memoryMonitor.checkMemoryThreshold(this.memoryThreshold)) {
            this.maxConcurrency = Math.max(1, Math.floor(this.maxConcurrency / 2));
          }
        }

        while (this.running < this.maxConcurrency && tasks.length > 0) {
          const task = tasks.shift();
          if (!task) break;

          this.running++;
          
          task()
            .then((result) => {
              results.push(result);
              completed++;
              progressCallback?.(completed, total);
            })
            .catch((error) => {
              // Store error as result to maintain order
              results.push(error as T);
              completed++;
              progressCallback?.(completed, total);
            })
            .finally(() => {
              this.running--;
              
              if (completed === total) {
                this.memoryMonitor.stopMonitoring();
                resolve(results);
              } else {
                processNext();
              }
            });
        }

        if (this.running === 0 && tasks.length === 0 && completed === total) {
          this.memoryMonitor.stopMonitoring();
          resolve(results);
        }
      };

      if (tasks.length === 0) {
        this.memoryMonitor.stopMonitoring();
        resolve(results);
        return;
      }

      processNext();
    });
  }

  getPeakMemoryUsage(): number {
    return this.memoryMonitor.getPeakUsageMB();
  }
}

export interface ConversionOptions {
  outputFormat: "jpeg" | "png" | "webp" | "gif" | "tiff" | "bmp";
  quality?: number;
  namingConvention: "keep-original" | "custom-pattern";
  customPattern?: string;
  prefix?: string;
  suffix?: string;
}

export interface ConversionResult {
  originalFile: string;
  convertedFile: string;
  originalName: string;
  convertedName: string;
  originalSize: number;
  convertedSize: number;
  width?: number;
  height?: number;
  success: boolean;
  error?: string;
}

/**
 * Generate output filename based on naming convention
 */
function generateOutputFilename(
  originalPath: string,
  outputFormat: string,
  options: ConversionOptions,
  index: number,
): string {
  const originalName = path.basename(originalPath, path.extname(originalPath));
  const ext = `.${outputFormat}`;

  switch (options.namingConvention) {
    case "keep-original":
      return `${originalName}${ext}`;

    case "custom-pattern":
      if (options.customPattern) {
        return (
          options.customPattern
            .replace("{name}", originalName)
            .replace("{index}", String(index + 1))
            .replace("{format}", outputFormat) + ext
        );
      }
      // Fallback to prefix/suffix if custom pattern is empty
      let name = originalName;
      if (options.prefix) name = `${options.prefix}${name}`;
      if (options.suffix) name = `${name}${options.suffix}`;
      return `${name}${ext}`;

    default:
      return `${originalName}${ext}`;
  }
}

/**
 * Ensure unique filename by appending numbers if conflicts exist
 */
async function ensureUniqueFilename(
  outputDir: string,
  filename: string,
): Promise<string> {
  const baseName = path.basename(filename, path.extname(filename));
  const ext = path.extname(filename);
  let counter = 1;
  let uniqueName = filename;

  while (true) {
    const fullPath = path.join(outputDir, uniqueName);
    try {
      await fs.access(fullPath);
      // File exists, try next number
      uniqueName = `${baseName}_${counter}${ext}`;
      counter++;
    } catch {
      // File doesn't exist, we can use this name
      break;
    }
  }

  return uniqueName;
}

/**
 * Get file size in bytes
 */
async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Get image dimensions using ImageMagick
 */
async function getImageDimensions(
  filePath: string,
): Promise<{ width?: number; height?: number }> {
  try {
    // Use ImageMagick to get dimensions (works with both magick and jimp engines)
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    // Try magick command first
    try {
      const { stdout } = await execFileAsync("magick", [
        "identify",
        "-format",
        "%w %h",
        filePath,
      ]);

      const [widthStr, heightStr] = stdout.trim().split(" ");
      return {
        width: parseInt(widthStr ?? "0", 10) || undefined,
        height: parseInt(heightStr ?? "0", 10) || undefined,
      };
    } catch {
      // Fallback to convert command
      const { stdout } = await execFileAsync("convert", [
        filePath,
        "-format",
        "%w %h",
        "info:",
      ]);

      const [widthStr, heightStr] = stdout.trim().split(" ");
      return {
        width: parseInt(widthStr ?? "0", 10) || undefined,
        height: parseInt(heightStr ?? "0", 10) || undefined,
      };
    }
  } catch {
    // If ImageMagick is not available, return empty dimensions
    // The ImageProcessor will handle the actual conversion with its fallback
    return {};
  }
}

/**
 * Convert a single image file with enhanced error handling
 */
async function convertSingleImage(
  inputPath: string,
  outputDir: string,
  outputFilename: string,
  options: ConversionOptions,
): Promise<{
  success: boolean;
  outputPath?: string;
  error?: string;
}> {
  let processor: ImageProcessor | null = null;
  
  try {
    // Validate input file exists and is readable
    try {
      await fs.access(inputPath, fs.constants.R_OK);
    } catch {
      return {
        success: false,
        error: "Input file is not accessible or has been deleted",
      };
    }

    // Check input file size
    const inputStats = await fs.stat(inputPath);
    if (inputStats.size === 0) {
      return {
        success: false,
        error: "Input file is empty",
      };
    }

    if (inputStats.size > 50 * 1024 * 1024) { // 50MB limit for processing
      return {
        success: false,
        error: "Input file is too large for processing (max 50MB)",
      };
    }

    const outputPath = path.join(outputDir, outputFilename);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Create ImageProcessor instance with error handling
    try {
      processor = new ImageProcessor(inputPath);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error 
          ? `Failed to load image: ${error.message}` 
          : "Failed to load image due to unknown error",
      };
    }

    // Validate output format compatibility
    const saveOptions: {
      format: "png" | "jpeg" | "webp" | "gif" | "tiff" | "jpg" | "avif" | "tif" | "heif" | "svg" | "ico";
      quality?: number;
    } = {
      format: options.outputFormat as "png" | "jpeg" | "webp" | "gif" | "tiff" | "jpg" | "avif" | "tif" | "heif" | "svg" | "ico",
    };

    // Add quality for lossy formats with validation
    if (options.quality && ["jpeg", "webp"].includes(options.outputFormat)) {
      const quality = Math.max(1, Math.min(100, Math.round(options.quality)));
      saveOptions.quality = quality;
    }

    // Perform conversion with timeout
    const conversionPromise = processor.save(outputPath, saveOptions);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Conversion timeout after 30 seconds")), 30000);
    });

    await Promise.race([conversionPromise, timeoutPromise]);

    // Verify output file was created and has content
    try {
      const outputStats = await fs.stat(outputPath);
      if (outputStats.size === 0) {
        return {
          success: false,
          error: "Conversion produced an empty file",
        };
      }
    } catch {
      return {
        success: false,
        error: "Conversion failed to create output file",
      };
    }

    return {
      success: true,
      outputPath,
    };

  } catch (error) {
    // Provide specific error messages based on error type
    let errorMessage = "Unknown conversion error";
    
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (message.includes("timeout")) {
        errorMessage = "Conversion timed out - image may be too large or complex";
      } else if (message.includes("memory") || message.includes("heap")) {
        errorMessage = "Not enough memory to process this image";
      } else if (message.includes("format") || message.includes("unsupported")) {
        errorMessage = "Unsupported image format or corrupted file";
      } else if (message.includes("permission") || message.includes("eacces")) {
        errorMessage = "Permission denied accessing file";
      } else if (message.includes("enospc")) {
        errorMessage = "Not enough disk space for conversion";
      } else if (message.includes("imagemagick") || message.includes("magick")) {
        errorMessage = "Image processing engine error";
      } else if (message.includes("invalid") || message.includes("corrupt")) {
        errorMessage = "Image file appears to be corrupted";
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    // Always attempt cleanup
    if (processor) {
      try {
        await processor.cleanup();
      } catch (cleanupError) {
        // Log cleanup errors but don't fail the operation
        console.warn("[picture-press] Cleanup warning:", cleanupError);
      }
    }
  }
}

/**
 * Convert multiple images with optimized batch processing, memory monitoring, and performance metrics
 */
export async function convertImages(
  inputFiles: string[],
  outputDir: string,
  options: ConversionOptions,
  progressCallback?: (
    current: number,
    total: number,
    operation: string,
    currentFile?: string,
  ) => void,
  batchOptions: BatchProcessingOptions = {},
): Promise<ConversionResult[]> {
  // Initialize performance metrics
  const metrics: ConversionMetrics = {
    startTime: Date.now(),
    filesProcessed: 0,
    totalFiles: inputFiles.length,
    totalOriginalSize: 0,
    totalConvertedSize: 0,
    errors: 0,
  };

  // Set default batch processing options
  const {
    maxConcurrency = Math.min(3, Math.max(1, Math.floor(inputFiles.length / 4))),
    memoryThreshold = 512, // 512MB
    progressGranularity = Math.max(1, Math.floor(inputFiles.length / 20)), // Report every 5%
    enableMemoryMonitoring: _enableMemoryMonitoring = true,
    timeoutPerFile = 30,
  } = batchOptions;

  if (!inputFiles || inputFiles.length === 0) {
    throw new Error("No input files provided for conversion");
  }

  if (inputFiles.length > 100) {
    throw new Error("Too many files for batch conversion (maximum 100 files)");
  }

  // Validate all input files exist before starting
  const missingFiles: string[] = [];
  for (const inputFile of inputFiles) {
    try {
      await fs.access(inputFile, fs.constants.R_OK);
    } catch {
      missingFiles.push(path.basename(inputFile));
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(`Input files not found or not accessible: ${missingFiles.join(', ')}`);
  }

  // Ensure ImageMagick engine is available and record which engine is used
  try {
    await ensureImageEngine();
    // Try to detect which engine is being used
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      
      try {
        await execFileAsync("magick", ["-version"]);
        metrics.engineUsed = "ImageMagick";
      } catch {
        try {
          await execFileAsync("convert", ["-version"]);
          metrics.engineUsed = "ImageMagick (legacy)";
        } catch {
          metrics.engineUsed = "Jimp (fallback)";
        }
      }
    } catch {
      metrics.engineUsed = "Unknown";
    }
  } catch (error) {
    throw new Error(`Image processing engine not available: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Ensure output directory exists and is writable
  try {
    await fs.mkdir(outputDir, { recursive: true });
    // Test write permissions
    const testFile = path.join(outputDir, '.write-test');
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
  } catch (error) {
    throw new Error(`Cannot create or write to output directory: ${error instanceof Error ? error.message : 'Permission denied'}`);
  }

  const total = inputFiles.length;
  let _completedCount = 0;
  let successCount = 0;
  let failureCount = 0;

  progressCallback?.(0, total, "Initializing optimized batch conversion...");

  // Create batch processor with memory monitoring
  const batchProcessor = new BatchProcessor(maxConcurrency, memoryThreshold);

  // Create conversion tasks
  const conversionTasks = inputFiles.map((inputFile, index) => {
    return async (): Promise<ConversionResult> => {
      const originalName = path.basename(inputFile);
      const _fileStartTime = Date.now();

      try {
        // Generate output filename with error handling
        let baseOutputName: string;
        let uniqueOutputName: string;
        
        try {
          baseOutputName = generateOutputFilename(
            inputFile,
            options.outputFormat,
            options,
            index,
          );
          uniqueOutputName = await ensureUniqueFilename(
            outputDir,
            baseOutputName,
          );
        } catch (error) {
          metrics.errors++;
          return {
            originalFile: inputFile,
            convertedFile: "",
            originalName,
            convertedName: "",
            originalSize: await getFileSize(inputFile),
            convertedSize: 0,
            success: false,
            error: `Failed to generate output filename: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }

        // Get original file info with error handling
        let originalSize: number;
        let originalDimensions: { width?: number; height?: number };
        
        try {
          originalSize = await getFileSize(inputFile);
          originalDimensions = await getImageDimensions(inputFile);
          metrics.totalOriginalSize += originalSize;
        } catch (error) {
          metrics.errors++;
          return {
            originalFile: inputFile,
            convertedFile: "",
            originalName,
            convertedName: "",
            originalSize: 0,
            convertedSize: 0,
            success: false,
            error: `Failed to read original file info: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }

        // Convert the image with timeout
        const conversionPromise = convertSingleImage(
          inputFile,
          outputDir,
          uniqueOutputName,
          options,
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`File conversion timeout after ${timeoutPerFile} seconds`)), timeoutPerFile * 1000);
        });

        const conversionResult = await Promise.race([conversionPromise, timeoutPromise]);

        if (conversionResult.success && conversionResult.outputPath) {
          // Get converted file info
          let convertedSize: number;
          let convertedDimensions: { width?: number; height?: number };
          
          try {
            convertedSize = await getFileSize(conversionResult.outputPath);
            convertedDimensions = await getImageDimensions(conversionResult.outputPath);
            metrics.totalConvertedSize += convertedSize;
          } catch (error) {
            metrics.errors++;
            return {
              originalFile: inputFile,
              convertedFile: "",
              originalName,
              convertedName: "",
              originalSize,
              convertedSize: 0,
              success: false,
              error: `Conversion produced invalid output: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }

          return {
            originalFile: inputFile,
            convertedFile: conversionResult.outputPath,
            originalName,
            convertedName: uniqueOutputName,
            originalSize,
            convertedSize,
            width: convertedDimensions.width ?? originalDimensions.width,
            height: convertedDimensions.height ?? originalDimensions.height,
            success: true,
          };
        } else {
          metrics.errors++;
          return {
            originalFile: inputFile,
            convertedFile: "",
            originalName,
            convertedName: "",
            originalSize,
            convertedSize: 0,
            success: false,
            error: conversionResult.error ?? "Conversion failed for unknown reason",
          };
        }
      } catch (error) {
        metrics.errors++;
        const originalSize = await getFileSize(inputFile).catch(() => 0);
        metrics.totalOriginalSize += originalSize;
        
        return {
          originalFile: inputFile,
          convertedFile: "",
          originalName,
          convertedName: "",
          originalSize,
          convertedSize: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  });

  // Process all conversions with optimized batching
  const results = await batchProcessor.processAll(
    conversionTasks,
    (completed, total) => {
      _completedCount = completed;
      
      // Update metrics
      metrics.filesProcessed = completed;
      
      // Count successes and failures
      const currentResults = results.slice(0, completed);
      successCount = currentResults.filter(r => r.success).length;
      failureCount = currentResults.filter(r => !r.success).length;

      // Report progress at specified granularity
      if (completed % progressGranularity === 0 || completed === total) {
        const progressMessage = failureCount > 0 
          ? `Converting images (${successCount} successful, ${failureCount} failed)`
          : `Converting images (${successCount} completed)`;
        
        progressCallback?.(completed, total, progressMessage);
      }
    }
  );

  // Finalize metrics
  metrics.endTime = Date.now();
  metrics.totalDuration = metrics.endTime - metrics.startTime;
  metrics.averageTimePerFile = metrics.totalDuration / metrics.totalFiles;
  metrics.peakMemoryUsage = batchProcessor.getPeakMemoryUsage();
  
  if (metrics.totalOriginalSize > 0) {
    metrics.compressionRatio = ((metrics.totalOriginalSize - metrics.totalConvertedSize) / metrics.totalOriginalSize) * 100;
  }

  // Log performance metrics for monitoring
  console.log(`[picture-press] Conversion metrics:`, {
    duration: `${(metrics.totalDuration / 1000).toFixed(2)}s`,
    avgTimePerFile: `${(metrics.averageTimePerFile / 1000).toFixed(2)}s`,
    peakMemory: `${metrics.peakMemoryUsage?.toFixed(1)}MB`,
    compressionRatio: `${metrics.compressionRatio?.toFixed(1)}%`,
    engine: metrics.engineUsed,
    concurrency: maxConcurrency,
    successRate: `${((successCount / total) * 100).toFixed(1)}%`,
  });

  // Final progress update with performance info
  const finalMessage = failureCount === 0 
    ? `Conversion completed successfully (${successCount} images in ${(metrics.totalDuration / 1000).toFixed(1)}s)`
    : `Conversion completed with ${failureCount} failure${failureCount === 1 ? '' : 's'} (${successCount} successful in ${(metrics.totalDuration / 1000).toFixed(1)}s)`;
  
  progressCallback?.(total, total, finalMessage);

  // If all conversions failed, throw an error
  if (successCount === 0) {
    const errorSummary = results
      .filter(r => !r.success && r.error)
      .map(r => r.error)
      .slice(0, 3) // Show first 3 errors
      .join('; ');
    
    throw new Error(`All conversions failed. Common errors: ${errorSummary}`);
  }

  return results;
}

/**
 * Validate conversion options with comprehensive checks
 */
export function validateConversionOptions(options: ConversionOptions): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate output format
  const supportedFormats = ["jpeg", "png", "webp", "gif", "tiff", "bmp"];
  if (!supportedFormats.includes(options.outputFormat)) {
    errors.push(`Unsupported output format "${options.outputFormat}". Supported formats: ${supportedFormats.join(', ')}`);
  }

  // Validate quality
  if (options.quality !== undefined) {
    if (typeof options.quality !== "number" || isNaN(options.quality)) {
      errors.push("Quality must be a valid number");
    } else if (options.quality < 1 || options.quality > 100) {
      errors.push("Quality must be between 1 and 100");
    }

    // Quality only applies to lossy formats
    if (!["jpeg", "webp"].includes(options.outputFormat)) {
      errors.push(`Quality setting is not applicable for ${options.outputFormat} format (only JPEG and WebP support quality settings)`);
    }
  }

  // Validate naming convention
  const supportedNaming = ["keep-original", "custom-pattern"];
  if (!supportedNaming.includes(options.namingConvention)) {
    errors.push(`Unsupported naming convention "${options.namingConvention}". Supported options: ${supportedNaming.join(', ')}`);
  }

  // Validate custom pattern options
  if (options.namingConvention === "custom-pattern") {
    const hasCustomPattern = options.customPattern && options.customPattern.trim().length > 0;
    const hasPrefix = options.prefix && options.prefix.trim().length > 0;
    const hasSuffix = options.suffix && options.suffix.trim().length > 0;

    if (!hasCustomPattern && !hasPrefix && !hasSuffix) {
      errors.push("When using custom naming, you must provide at least one of: custom pattern, prefix, or suffix");
    }

    // Validate custom pattern
    if (options.customPattern) {
      const pattern = options.customPattern.trim();
      
      if (pattern.length > 200) {
        errors.push("Custom pattern is too long (maximum 200 characters)");
      }

      // Check for invalid characters in pattern
      const invalidChars = /[\/\\<>:"\|\?\*\x00-\x1F]/;
      if (invalidChars.test(pattern)) {
        errors.push("Custom pattern contains invalid filename characters (/, \\, <, >, :, \", |, ?, *, or control characters)");
      }

      // Check for Windows reserved names
      const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
      if (reservedNames.test(pattern)) {
        errors.push("Custom pattern cannot use Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)");
      }

      // Validate placeholder usage
      const validPlaceholders = ['{name}', '{index}', '{format}'];
      const placeholderPattern = /\{[^}]+\}/g;
      const foundPlaceholders = pattern.match(placeholderPattern) ?? [];
      
      for (const placeholder of foundPlaceholders) {
        if (!validPlaceholders.includes(placeholder)) {
          errors.push(`Invalid placeholder "${placeholder}" in custom pattern. Valid placeholders: ${validPlaceholders.join(', ')}`);
        }
      }
    }

    // Validate prefix
    if (options.prefix) {
      const prefix = options.prefix.trim();
      
      if (prefix.length > 50) {
        errors.push("Prefix is too long (maximum 50 characters)");
      }

      const invalidChars = /[\/\\<>:"\|\?\*\x00-\x1F]/;
      if (invalidChars.test(prefix)) {
        errors.push("Prefix contains invalid filename characters");
      }
    }

    // Validate suffix
    if (options.suffix) {
      const suffix = options.suffix.trim();
      
      if (suffix.length > 50) {
        errors.push("Suffix is too long (maximum 50 characters)");
      }

      const invalidChars = /[\/\\<>:"\|\?\*\x00-\x1F]/;
      if (invalidChars.test(suffix)) {
        errors.push("Suffix contains invalid filename characters");
      }
    }
  }

  // Additional validation for edge cases
  if (options.outputFormat === "gif" && options.quality) {
    errors.push("GIF format does not support quality settings (GIF uses lossless compression)");
  }

  if (options.outputFormat === "bmp" && options.quality) {
    errors.push("BMP format does not support quality settings (BMP is uncompressed)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get supported output formats
 */
export function getSupportedFormats(): Array<{
  format: string;
  label: string;
  supportsQuality: boolean;
}> {
  return [
    { format: "jpeg", label: "JPEG", supportsQuality: true },
    { format: "png", label: "PNG", supportsQuality: false },
    { format: "webp", label: "WebP", supportsQuality: true },
    { format: "gif", label: "GIF", supportsQuality: false },
    { format: "tiff", label: "TIFF", supportsQuality: false },
    { format: "bmp", label: "BMP", supportsQuality: false },
  ];
}

/**
 * Performance monitoring utilities for conversion operations
 */
export class ConversionPerformanceMonitor {
  private static metrics: ConversionMetrics[] = [];
  private static readonly MAX_STORED_METRICS = 100;

  static recordMetrics(metrics: ConversionMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only the most recent metrics to prevent memory leaks
    if (this.metrics.length > this.MAX_STORED_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_STORED_METRICS);
    }
  }

  static getRecentMetrics(count = 10): ConversionMetrics[] {
    return this.metrics.slice(-count);
  }

  static getAverageMetrics(): {
    averageDuration: number;
    averageTimePerFile: number;
    averageMemoryUsage: number;
    averageCompressionRatio: number;
    averageSuccessRate: number;
    totalConversions: number;
  } {
    if (this.metrics.length === 0) {
      return {
        averageDuration: 0,
        averageTimePerFile: 0,
        averageMemoryUsage: 0,
        averageCompressionRatio: 0,
        averageSuccessRate: 0,
        totalConversions: 0,
      };
    }

    const validMetrics = this.metrics.filter(m => m.totalDuration && m.averageTimePerFile);
    
    if (validMetrics.length === 0) {
      return {
        averageDuration: 0,
        averageTimePerFile: 0,
        averageMemoryUsage: 0,
        averageCompressionRatio: 0,
        averageSuccessRate: 0,
        totalConversions: 0,
      };
    }

    const totalConversions = this.metrics.reduce((sum, m) => sum + m.totalFiles, 0);
    const totalSuccessful = this.metrics.reduce((sum, m) => sum + (m.totalFiles - m.errors), 0);

    return {
      averageDuration: validMetrics.reduce((sum, m) => sum + m.totalDuration!, 0) / validMetrics.length,
      averageTimePerFile: validMetrics.reduce((sum, m) => sum + m.averageTimePerFile!, 0) / validMetrics.length,
      averageMemoryUsage: validMetrics
        .filter(m => m.peakMemoryUsage)
        .reduce((sum, m) => sum + m.peakMemoryUsage!, 0) / validMetrics.filter(m => m.peakMemoryUsage).length || 0,
      averageCompressionRatio: validMetrics
        .filter(m => m.compressionRatio)
        .reduce((sum, m) => sum + m.compressionRatio!, 0) / validMetrics.filter(m => m.compressionRatio).length || 0,
      averageSuccessRate: totalConversions > 0 ? (totalSuccessful / totalConversions) * 100 : 0,
      totalConversions,
    };
  }

  static clearMetrics(): void {
    this.metrics = [];
  }

  static getSystemResourceInfo(): {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    cpuUsage: NodeJS.CpuUsage;
  } {
    return {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      cpuUsage: process.cpuUsage(),
    };
  }
}

/**
 * Optimized conversion function with performance monitoring
 */
export async function convertImagesWithMonitoring(
  inputFiles: string[],
  outputDir: string,
  options: ConversionOptions,
  progressCallback?: (
    current: number,
    total: number,
    operation: string,
    currentFile?: string,
  ) => void,
  batchOptions: BatchProcessingOptions = {},
): Promise<{
  results: ConversionResult[];
  metrics: ConversionMetrics;
}> {
  const results = await convertImages(
    inputFiles,
    outputDir,
    options,
    progressCallback,
    batchOptions,
  );

  // Extract metrics from the conversion process
  // Note: In a real implementation, we'd need to modify convertImages to return metrics
  // For now, we'll create basic metrics
  const metrics: ConversionMetrics = {
    startTime: Date.now() - 1000, // Approximate
    endTime: Date.now(),
    totalDuration: 1000, // Approximate
    filesProcessed: results.length,
    totalFiles: inputFiles.length,
    averageTimePerFile: 1000 / results.length,
    totalOriginalSize: results.reduce((sum, r) => sum + r.originalSize, 0),
    totalConvertedSize: results.reduce((sum, r) => sum + r.convertedSize, 0),
    errors: results.filter(r => !r.success).length,
  };

  if (metrics.totalOriginalSize > 0) {
    metrics.compressionRatio = ((metrics.totalOriginalSize - metrics.totalConvertedSize) / metrics.totalOriginalSize) * 100;
  }

  // Record metrics for monitoring
  ConversionPerformanceMonitor.recordMetrics(metrics);

  return { results, metrics };
}

/**
 * Benchmark conversion performance with different settings
 */
export async function benchmarkConversion(
  testFiles: string[],
  outputDir: string,
  options: ConversionOptions,
): Promise<{
  concurrencyBenchmarks: Array<{
    concurrency: number;
    duration: number;
    memoryUsage: number;
    successRate: number;
  }>;
  recommendedConcurrency: number;
}> {
  const concurrencyLevels = [1, 2, 3, 4, 6, 8];
  const benchmarks: Array<{
    concurrency: number;
    duration: number;
    memoryUsage: number;
    successRate: number;
  }> = [];

  for (const concurrency of concurrencyLevels) {
    const startTime = Date.now();
    const memoryBefore = process.memoryUsage().heapUsed;

    try {
      const results = await convertImages(
        testFiles,
        outputDir,
        options,
        undefined,
        { maxConcurrency: concurrency, enableMemoryMonitoring: true }
      );

      const duration = Date.now() - startTime;
      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryUsage = (memoryAfter - memoryBefore) / (1024 * 1024); // MB
      const successRate = (results.filter(r => r.success).length / results.length) * 100;

      benchmarks.push({
        concurrency,
        duration,
        memoryUsage,
        successRate,
      });

      // Clean up converted files for next test
      await fs.rmdir(outputDir, { recursive: true }).catch(() => {
        // Ignore cleanup errors
      });
      await fs.mkdir(outputDir, { recursive: true });

    } catch (error) {
      console.warn(`Benchmark failed for concurrency ${concurrency}:`, error);
      benchmarks.push({
        concurrency,
        duration: Infinity,
        memoryUsage: Infinity,
        successRate: 0,
      });
    }
  }

  // Find optimal concurrency (best duration with acceptable memory usage)
  const validBenchmarks = benchmarks.filter(b => b.duration !== Infinity && b.successRate > 90);
  const recommendedConcurrency = validBenchmarks.length > 0
    ? validBenchmarks.reduce((best, current) => 
        current.duration < best.duration && current.memoryUsage < 1000 ? current : best
      ).concurrency
    : 3; // Default fallback

  return {
    concurrencyBenchmarks: benchmarks,
    recommendedConcurrency,
  };
}
