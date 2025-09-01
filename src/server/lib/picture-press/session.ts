import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import {
  type GenerationProgress,
  type GenerationSessionMeta,
  getTempRoot,
  readJsonSafe,
  isAllowedMime,
  cleanupSession,
  cleanupExpiredSessions,
  maybeCleanupExpiredSessions,
  writeProgress,
  readProgress,
} from "../pixel-forge/session";

// Picture Press specific types extending Pixel Forge types
export type ConversionProgress = GenerationProgress & {
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
};

export type ConversionSessionMeta = GenerationSessionMeta & {
  uploadedFiles?: Array<{
    originalName: string;
    tempPath: string;
    mimeType: string;
    size: number;
  }>;
  conversionOptions?: {
    outputFormat: string;
    quality?: number;
    namingConvention: string;
    customPattern?: string;
    prefix?: string;
    suffix?: string;
  };
};

// Re-export common utilities from Pixel Forge
export {
  getTempRoot,
  cleanupSession,
  cleanupExpiredSessions,
  maybeCleanupExpiredSessions,
  writeProgress,
  readProgress,
  isAllowedMime,
};

const DIR_NAME = "picture-press-sessions";
const UPLOADS = "uploads";
const CONVERTED = "converted";
const PROGRESS = "progress.json";
const META = "session.json";

type EnsurePicturePressSessionPaths = {
  id: string;
  root: string;
  uploadsDir: string;
  convertedDir: string;
  progressPath: string;
  metaPath: string;
};

function sanitizeFileName(name: string): string {
  // Remove path separators, control chars, and special characters
  const cleaned = name.replace(/[\/\\<>:"\|\?\*\x00-\x1F\s&!@#$%^()]/g, "_");
  // Trim to reasonable length
  return cleaned.slice(0, 200) || "file";
}

function extForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    case "image/gif":
      return ".gif";
    case "image/tiff":
      return ".tiff";
    case "image/bmp":
      return ".bmp";
    default:
      return "";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMsIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(p: string, data: unknown): Promise<void> {
  const tmp = p + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, p);
}

function getPicturePressRoot(): string {
  const custom = process.env.PP_TMP_DIR;
  if (custom && path.isAbsolute(custom)) return custom;
  return path.join(getTempRoot().replace("pixel-forge-sessions", ""), DIR_NAME);
}

export async function createPicturePressSession(
  ttlMs: number = 24 * 60 * 60 * 1000,
): Promise<EnsurePicturePressSessionPaths> {
  const id = crypto.randomUUID();
  const root = path.join(getPicturePressRoot(), id);
  const uploadsDir = path.join(root, UPLOADS);
  const convertedDir = path.join(root, CONVERTED);
  const progressPath = path.join(root, PROGRESS);
  const metaPath = path.join(root, META);

  await ensureDir(uploadsDir);
  await ensureDir(convertedDir);

  const meta: ConversionSessionMeta = {
    id,
    createdAt: nowIso(),
    expiresAt: addMsIso(ttlMs),
    status: "idle",
    uploadedFiles: [],
  };
  await writeJsonAtomic(metaPath, meta);

  // Initialize progress
  const progress: ConversionProgress = {
    current: 0,
    total: 0,
    currentOperation: "Idle",
    filesProcessed: 0,
    totalFiles: 0,
  };
  await writeJsonAtomic(progressPath, progress);

  return { id, root, uploadsDir, convertedDir, progressPath, metaPath };
}

export async function ensurePicturePressSession(
  sessionId: string,
): Promise<EnsurePicturePressSessionPaths> {
  const root = path.join(getPicturePressRoot(), sessionId);
  const uploadsDir = path.join(root, UPLOADS);
  const convertedDir = path.join(root, CONVERTED);
  const progressPath = path.join(root, PROGRESS);
  const metaPath = path.join(root, META);

  if (!(await pathExists(root))) {
    throw new Error(`Picture Press session not found: ${sessionId}`);
  }
  await ensureDir(uploadsDir);
  await ensureDir(convertedDir);
  return {
    id: sessionId,
    root,
    uploadsDir,
    convertedDir,
    progressPath,
    metaPath,
  };
}

function isPicturePressAllowedMime(mime: string): boolean {
  return [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/svg+xml",
    "image/gif",
    "image/tiff",
    "image/bmp",
  ].includes(mime.toLowerCase());
}

export async function saveMultipleUploads(params: {
  sessionId: string;
  files: Array<{
    fileName: string;
    base64Data: string;
    mimeType: string;
  }>;
  maxBytes?: number;
}): Promise<
  Array<{
    savedPath: string;
    size: number;
    originalName: string;
  }>
> {
  const { sessionId, files, maxBytes = 20 * 1024 * 1024 } = params;

  if (!files || files.length === 0) {
    throw new Error("No files provided for upload");
  }

  if (files.length > 100) {
    throw new Error("Too many files in batch (maximum 100 files allowed)");
  }

  let sess: Awaited<ReturnType<typeof ensurePicturePressSession>>;
  
  try {
    sess = await ensurePicturePressSession(sessionId);
  } catch {
    throw new Error(`Session not found or expired: ${sessionId}`);
  }

  const results: Array<{
    savedPath: string;
    size: number;
    originalName: string;
  }> = [];

  const uploadErrors: string[] = [];
  let totalSize = 0;

  // Pre-validate all files before processing any
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const { fileName, base64Data, mimeType } = file;
    const filePrefix = `File ${i + 1} (${fileName})`;

    // Validate MIME type
    if (!isPicturePressAllowedMime(mimeType)) {
      uploadErrors.push(`${filePrefix}: Unsupported file type "${mimeType}"`);
      continue;
    }

    // Validate filename
    if (!fileName || fileName.trim() === "") {
      uploadErrors.push(`${filePrefix}: Invalid or empty filename`);
      continue;
    }

    if (fileName.length > 255) {
      uploadErrors.push(`${filePrefix}: Filename too long (max 255 characters)`);
      continue;
    }

    // Check for dangerous filename patterns
    const dangerousPatterns = [
      /\.\./,  // Path traversal
      /[<>:"|?*\x00-\x1f]/,  // Invalid filename characters
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i,  // Windows reserved names
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(fileName)) {
        uploadErrors.push(`${filePrefix}: Invalid filename (contains unsafe characters or reserved names)`);
        break;
      }
    }

    // Validate base64 data
    if (!base64Data || base64Data.trim() === "") {
      uploadErrors.push(`${filePrefix}: Empty or missing file data`);
      continue;
    }

    // Enhanced base64 validation
    const base64Pattern = /^[a-zA-Z0-9+/]*={0,2}$/;
    const cleanedData = base64Data.replace(/[\r\n\s]/g, '');
    if (!base64Pattern.test(cleanedData)) {
      uploadErrors.push(`${filePrefix}: Invalid file data format`);
      continue;
    }

    // Validate base64 length (must be multiple of 4)
    if (cleanedData.length % 4 !== 0) {
      uploadErrors.push(`${filePrefix}: Corrupted file data`);
      continue;
    }

    try {
      const buf = Buffer.from(cleanedData, "base64");
      
      if (buf.byteLength === 0) {
        uploadErrors.push(`${filePrefix}: File appears to be empty`);
        continue;
      }
      
      if (buf.byteLength > maxBytes) {
        const sizeMB = (buf.byteLength / (1024 * 1024)).toFixed(1);
        const maxMB = (maxBytes / (1024 * 1024)).toFixed(1);
        uploadErrors.push(`${filePrefix}: File too large (${sizeMB}MB, max ${maxMB}MB)`);
        continue;
      }

      if (buf.byteLength < 100) {
        uploadErrors.push(`${filePrefix}: File too small (${buf.byteLength} bytes, minimum 100 bytes)`);
        continue;
      }

      totalSize += buf.byteLength;
    } catch {
      uploadErrors.push(`${filePrefix}: Failed to decode file data`);
      continue;
    }
  }

  // Check total upload size
  const maxTotalSize = 100 * 1024 * 1024; // 100MB total
  if (totalSize > maxTotalSize) {
    const totalMB = (totalSize / (1024 * 1024)).toFixed(1);
    const maxTotalMB = (maxTotalSize / (1024 * 1024)).toFixed(1);
    uploadErrors.push(`Total upload size (${totalMB}MB) exceeds limit (${maxTotalMB}MB)`);
  }

  if (uploadErrors.length > 0) {
    throw new Error(`Upload validation failed:\n${uploadErrors.join('\n')}`);
  }

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const { fileName, base64Data, mimeType } = file;

    try {
      const cleanedData = base64Data.replace(/[\r\n\s]/g, '');
      const buf = Buffer.from(cleanedData, "base64");

      const safeNameBase = sanitizeFileName(fileName.replace(/\.[^/.]+$/, ""));
      const ext = extForMime(mimeType) || path.extname(fileName) || "";
      const outPath = path.join(
        sess.uploadsDir,
        `original-${i}-${safeNameBase}${ext}`,
      );

      // Ensure the uploads directory exists
      await fs.mkdir(sess.uploadsDir, { recursive: true });

      // Write file with error handling
      try {
        await fs.writeFile(outPath, buf);
      } catch (writeError) {
        if (writeError instanceof Error) {
          if (writeError.message.includes('ENOSPC')) {
            throw new Error(`Not enough disk space to save ${fileName}`);
          } else if (writeError.message.includes('EACCES')) {
            throw new Error(`Permission denied saving ${fileName}`);
          } else {
            throw new Error(`Failed to save ${fileName}: ${writeError.message}`);
          }
        }
        throw new Error(`Failed to save ${fileName}: Unknown error`);
      }

      // Verify the file was written correctly
      try {
        const stats = await fs.stat(outPath);
        if (stats.size !== buf.byteLength) {
          throw new Error(`File ${fileName} was not saved correctly (size mismatch)`);
        }
      } catch {
        throw new Error(`Failed to verify saved file ${fileName}`);
      }

      results.push({
        savedPath: outPath,
        size: buf.byteLength,
        originalName: fileName,
      });

    } catch (err) {
      // Clean up any partially saved files
      for (const result of results) {
        try {
          await fs.unlink(result.savedPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      const errorMessage = err instanceof Error ? err.message : `Unknown error processing ${fileName}`;
      throw new Error(`Upload failed: ${errorMessage}`);
    }
  }

  // Update meta with uploaded files info
  try {
    const meta = (await readJsonSafe<ConversionSessionMeta>(sess.metaPath)) ?? {
      id: sessionId,
      createdAt: nowIso(),
      expiresAt: addMsIso(24 * 60 * 60 * 1000),
      uploadedFiles: [],
    };

    meta.uploadedFiles = results.map((result, index) => ({
      originalName: result.originalName,
      tempPath: result.savedPath,
      mimeType: files[index]!.mimeType,
      size: result.size,
    }));

    await writeJsonAtomic(sess.metaPath, meta);
  } catch (err) {
    // Clean up uploaded files if meta update fails
    for (const result of results) {
      try {
        await fs.unlink(result.savedPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    throw new Error(`Failed to update session metadata: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return results;
}

export async function writeConversionProgress(
  sessionId: string,
  progress: ConversionProgress,
): Promise<void> {
  const sess = await ensurePicturePressSession(sessionId);
  await writeJsonAtomic(sess.progressPath, progress);
}

export async function readConversionProgress(
  sessionId: string,
): Promise<ConversionProgress> {
  const sess = await ensurePicturePressSession(sessionId);
  const p = await readJsonSafe<ConversionProgress>(sess.progressPath);
  return (
    p ?? {
      current: 0,
      total: 0,
      currentOperation: "Idle",
      filesProcessed: 0,
      totalFiles: 0,
    }
  );
}

export async function readConversionMeta(
  sessionId: string,
): Promise<ConversionSessionMeta | null> {
  const sess = await ensurePicturePressSession(sessionId);
  return (await readJsonSafe<ConversionSessionMeta>(sess.metaPath)) ?? null;
}

export async function updateConversionMeta(
  sessionId: string,
  patch: Partial<ConversionSessionMeta>,
): Promise<ConversionSessionMeta> {
  const sess = await ensurePicturePressSession(sessionId);
  const cur = (await readJsonSafe<ConversionSessionMeta>(sess.metaPath)) ?? {
    id: sessionId,
    createdAt: nowIso(),
    expiresAt: addMsIso(24 * 60 * 60 * 1000),
    uploadedFiles: [],
  };
  const next = { ...cur, ...patch, id: sessionId };
  await writeJsonAtomic(sess.metaPath, next);
  return next;
}

export async function cleanupPicturePressSession(
  sessionId: string,
): Promise<void> {
  const sessRoot = path.join(getPicturePressRoot(), sessionId);
  // Best-effort recursive removal
  try {
    await fs.rm(sessRoot, { recursive: true, force: true });
  } catch (err) {
    // Log upstream; swallow to avoid UX breakage
    console.warn(`[picture-press] cleanup warning for ${sessionId}:`, err);
  }
}

export async function cleanupExpiredPicturePressessions(): Promise<{
  removed: string[];
}> {
  const root = getPicturePressRoot();
  const removed: string[] = [];
  if (!(await pathExists(root))) return { removed };

  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    const metaPath = path.join(root, id, META);
    const meta = await readJsonSafe<ConversionSessionMeta>(metaPath);
    if (!meta) continue;
    const expired = new Date(meta.expiresAt).getTime() < Date.now();
    if (expired) {
      try {
        await fs.rm(path.join(root, id), { recursive: true, force: true });
        removed.push(id);
      } catch (err) {
        console.warn(`[picture-press] TTL cleanup warning for ${id}:`, err);
      }
    }
  }
  return { removed };
}

// Opportunistic TTL cleanup guard to avoid running too often per server instance
let __pp_lastCleanupAt = 0;
/**
 * Run TTL cleanup at most once per minIntervalMs for this server instance.
 * Useful in serverless-ish environments where a real cron is not available.
 */
export async function maybeCleanupExpiredPicturePressessions(
  minIntervalMs = 60 * 60 * 1000,
): Promise<{
  ran: boolean;
  removed: string[] | null;
}> {
  const now = Date.now();
  if (now - __pp_lastCleanupAt < minIntervalMs) {
    return { ran: false, removed: null };
  }
  __pp_lastCleanupAt = now;
  try {
    const res = await cleanupExpiredPicturePressessions();
    return { ran: true, removed: res.removed };
  } catch (err) {
    console.warn("[picture-press] opportunistic TTL cleanup failed:", err);
    return { ran: true, removed: null };
  }
}


