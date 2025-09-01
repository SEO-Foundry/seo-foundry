import archiver from "archiver";
import type { Archiver } from "archiver";
import { createWriteStream } from "fs";

/**
 * Creates a ZIP archive from a directory
 * @param sourceDir - Directory to archive
 * @param outputZipPath - Path where the ZIP file will be created
 * @returns Promise that resolves when ZIP creation is complete
 */
export async function createDirectoryZip(
  sourceDir: string,
  outputZipPath: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputZipPath);
    const archive: Archiver = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);
    // Add directory contents at root of archive
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}