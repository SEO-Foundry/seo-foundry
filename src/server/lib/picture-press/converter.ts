import { promises as fs } from "fs";
import path from "path";
import { ImageProcessor } from "pixel-forge";
import { ensureImageEngine } from "../pixel-forge/deps";

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
 * Convert multiple images with enhanced progress tracking and error handling
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
): Promise<ConversionResult[]> {
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

  // Ensure ImageMagick engine is available
  try {
    await ensureImageEngine();
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

  const results: ConversionResult[] = [];
  const total = inputFiles.length;
  let successCount = 0;
  let failureCount = 0;

  progressCallback?.(0, total, "Initializing conversion...");

  for (let i = 0; i < inputFiles.length; i++) {
    const inputFile = inputFiles[i]!;
    const originalName = path.basename(inputFile);

    progressCallback?.(i, total, "Converting image", originalName);

    try {
      // Generate output filename with error handling
      let baseOutputName: string;
      let uniqueOutputName: string;
      
      try {
        baseOutputName = generateOutputFilename(
          inputFile,
          options.outputFormat,
          options,
          i,
        );
        uniqueOutputName = await ensureUniqueFilename(
          outputDir,
          baseOutputName,
        );
      } catch (error) {
        results.push({
          originalFile: inputFile,
          convertedFile: "",
          originalName,
          convertedName: "",
          originalSize: await getFileSize(inputFile),
          convertedSize: 0,
          success: false,
          error: `Failed to generate output filename: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        failureCount++;
        continue;
      }

      // Get original file info with error handling
      let originalSize: number;
      let originalDimensions: { width?: number; height?: number };
      
      try {
        originalSize = await getFileSize(inputFile);
        originalDimensions = await getImageDimensions(inputFile);
      } catch (error) {
        results.push({
          originalFile: inputFile,
          convertedFile: "",
          originalName,
          convertedName: "",
          originalSize: 0,
          convertedSize: 0,
          success: false,
          error: `Failed to read original file info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        failureCount++;
        continue;
      }

      // Convert the image
      const conversionResult = await convertSingleImage(
        inputFile,
        outputDir,
        uniqueOutputName,
        options,
      );

      if (conversionResult.success && conversionResult.outputPath) {
        // Get converted file info
        let convertedSize: number;
        let convertedDimensions: { width?: number; height?: number };
        
        try {
          convertedSize = await getFileSize(conversionResult.outputPath);
          convertedDimensions = await getImageDimensions(conversionResult.outputPath);
        } catch (error) {
          // If we can't get info about the converted file, it's likely corrupted
          results.push({
            originalFile: inputFile,
            convertedFile: "",
            originalName,
            convertedName: "",
            originalSize,
            convertedSize: 0,
            success: false,
            error: `Conversion produced invalid output: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
          failureCount++;
          continue;
        }

        results.push({
          originalFile: inputFile,
          convertedFile: conversionResult.outputPath,
          originalName,
          convertedName: uniqueOutputName,
          originalSize,
          convertedSize,
          width: convertedDimensions.width ?? originalDimensions.width,
          height: convertedDimensions.height ?? originalDimensions.height,
          success: true,
        });
        successCount++;
      } else {
        // Conversion failed
        results.push({
          originalFile: inputFile,
          convertedFile: "",
          originalName,
          convertedName: "",
          originalSize,
          convertedSize: 0,
          success: false,
          error: conversionResult.error ?? "Conversion failed for unknown reason",
        });
        failureCount++;
      }
    } catch (error) {
      // Handle unexpected errors
      const originalSize = await getFileSize(inputFile).catch(() => 0);
      results.push({
        originalFile: inputFile,
        convertedFile: "",
        originalName,
        convertedName: "",
        originalSize,
        convertedSize: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      failureCount++;
    }

    // Update progress with current status
    const progressMessage = failureCount > 0 
      ? `Converting images (${successCount} successful, ${failureCount} failed)`
      : `Converting images (${successCount} completed)`;
    
    progressCallback?.(i + 1, total, progressMessage);
  }

  // Final progress update
  const finalMessage = failureCount === 0 
    ? `Conversion completed successfully (${successCount} images)`
    : `Conversion completed with ${failureCount} failure${failureCount === 1 ? '' : 's'} (${successCount} successful)`;
  
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
