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
 * Convert a single image file
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
  try {
    const outputPath = path.join(outputDir, outputFilename);

    // Create ImageProcessor instance
    const processor = new ImageProcessor(inputPath);

    // Convert using ImageProcessor save method with format conversion
    const saveOptions: {
      format: "png" | "jpeg" | "webp" | "gif" | "tiff" | "jpg" | "avif" | "tif" | "heif" | "svg" | "ico";
      quality?: number;
    } = {
      format: options.outputFormat as "png" | "jpeg" | "webp" | "gif" | "tiff" | "jpg" | "avif" | "tif" | "heif" | "svg" | "ico",
    };

    // Add quality for lossy formats
    if (options.quality && ["jpeg", "webp"].includes(options.outputFormat)) {
      saveOptions.quality = options.quality;
    }

    await processor.save(outputPath, saveOptions);

    // Clean up any temporary files
    await processor.cleanup();

    return {
      success: true,
      outputPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Convert multiple images with progress tracking
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
    throw new Error("No input files provided");
  }

  // Ensure ImageMagick engine is available
  await ensureImageEngine();

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const results: ConversionResult[] = [];
  const total = inputFiles.length;

  progressCallback?.(0, total, "Starting conversion...");

  for (let i = 0; i < inputFiles.length; i++) {
    const inputFile = inputFiles[i]!;
    const originalName = path.basename(inputFile);

    progressCallback?.(i, total, "Converting image", originalName);

    try {
      // Generate output filename
      const baseOutputName = generateOutputFilename(
        inputFile,
        options.outputFormat,
        options,
        i,
      );
      const uniqueOutputName = await ensureUniqueFilename(
        outputDir,
        baseOutputName,
      );

      // Get original file info
      const originalSize = await getFileSize(inputFile);
      const originalDimensions = await getImageDimensions(inputFile);

      // Convert the image
      const conversionResult = await convertSingleImage(
        inputFile,
        outputDir,
        uniqueOutputName,
        options,
      );

      if (conversionResult.success && conversionResult.outputPath) {
        // Get converted file info
        const convertedSize = await getFileSize(conversionResult.outputPath);
        const convertedDimensions = await getImageDimensions(
          conversionResult.outputPath,
        );

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
          error: conversionResult.error ?? "Unknown conversion error",
        });
      }
    } catch (error) {
      // Handle unexpected errors
      const originalSize = await getFileSize(inputFile);
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
    }
  }

  progressCallback?.(total, total, "Conversion complete");

  return results;
}

/**
 * Validate conversion options
 */
export function validateConversionOptions(options: ConversionOptions): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate output format
  const supportedFormats = ["jpeg", "png", "webp", "gif", "tiff", "bmp"];
  if (!supportedFormats.includes(options.outputFormat)) {
    errors.push(`Unsupported output format: ${options.outputFormat}`);
  }

  // Validate quality
  if (options.quality !== undefined) {
    if (
      typeof options.quality !== "number" ||
      options.quality < 1 ||
      options.quality > 100
    ) {
      errors.push("Quality must be a number between 1 and 100");
    }

    // Quality only applies to lossy formats
    if (!["jpeg", "webp"].includes(options.outputFormat)) {
      errors.push(
        `Quality setting not applicable for ${options.outputFormat} format`,
      );
    }
  }

  // Validate naming convention
  const supportedNaming = ["keep-original", "custom-pattern"];
  if (!supportedNaming.includes(options.namingConvention)) {
    errors.push(`Unsupported naming convention: ${options.namingConvention}`);
  }

  // Validate custom pattern
  if (options.namingConvention === "custom-pattern") {
    if (!options.customPattern && !options.prefix && !options.suffix) {
      errors.push(
        "Custom pattern, prefix, or suffix required when using custom-pattern naming",
      );
    }

    if (options.customPattern) {
      // Check for invalid characters in pattern
      const invalidChars = /[\/\\<>:"\|\?\*\x00-\x1F]/;
      if (invalidChars.test(options.customPattern)) {
        errors.push("Custom pattern contains invalid filename characters");
      }
    }
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
