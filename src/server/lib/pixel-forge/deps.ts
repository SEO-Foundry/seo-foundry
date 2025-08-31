import { ImageProcessor } from "pixel-forge";

/**
 * Ensure an image processing engine is selected and available.
 * - Prefers ImageMagick if present
 * - Falls back to Jimp when ImageMagick is unavailable
 *
 * Returns details about the engine decision to surface in UX/logs.
 */
export async function ensureImageEngine(): Promise<{
  engine: "magick" | "jimp";
  available: boolean; // whether ImageMagick is available
  note?: string;
}> {
  try {
    const available = await ImageProcessor.checkImageMagick();
    if (available) {
      ImageProcessor.setEngine("magick");
      return { engine: "magick", available: true, note: "Using ImageMagick engine." };
    }
    ImageProcessor.setEngine("jimp");
    return {
      engine: "jimp",
      available: false,
      note: "ImageMagick not detected. Using Jimp fallback (reduced quality/features).",
    };
  } catch (err) {
    // On unexpected error during detection, default to Jimp for safety
    ImageProcessor.setEngine("jimp");
    return {
      engine: "jimp",
      available: false,
      note:
        "ImageMagick detection error. Defaulting to Jimp fallback. " +
        (err instanceof Error ? err.message : String(err)),
    };
  }
}