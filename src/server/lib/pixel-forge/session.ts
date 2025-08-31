import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

export type GenerationProgress = {
  current: number;
  total: number;
  currentOperation: string;
};

export type GenerationSessionMeta = {
  id: string;
  createdAt: string; // ISO
  expiresAt: string; // ISO
  uploadedFile?: {
    originalName: string;
    tempPath: string;
    mimeType: string;
    size: number;
  };
  status?: "idle" | "processing" | "completed" | "error";
};

type EnsureSessionPaths = {
  id: string;
  root: string;
  uploadsDir: string;
  generatedDir: string;
  progressPath: string;
  metaPath: string;
};

const DIR_NAME = "pixel-forge-sessions";
const UPLOADS = "uploads";
const GENERATED = "generated";
const PROGRESS = "progress.json";
const META = "session.json";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function getTempRoot(): string {
  const custom = process.env.PF_TMP_DIR;
  if (custom && path.isAbsolute(custom)) return custom;
  return path.join(os.tmpdir(), DIR_NAME);
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

function sanitizeFileName(name: string): string {
  // Remove path separators and control chars
  const cleaned = name.replace(/[\/\\<>:"\|\?\*\x00-\x1F]/g, "_");
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
    default:
      return "";
  }
}

export function isAllowedMime(mime: string): boolean {
  return ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"].includes(
    mime.toLowerCase(),
  );
}

async function writeJsonAtomic(p: string, data: unknown): Promise<void> {
  const tmp = p + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, p);
}

export async function readJsonSafe<T = unknown>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function createSession(ttlMs: number = DEFAULT_TTL_MS): Promise<EnsureSessionPaths> {
  const id = crypto.randomUUID();
  const root = path.join(getTempRoot(), id);
  const uploadsDir = path.join(root, UPLOADS);
  const generatedDir = path.join(root, GENERATED);
  const progressPath = path.join(root, PROGRESS);
  const metaPath = path.join(root, META);

  await ensureDir(uploadsDir);
  await ensureDir(generatedDir);

  const meta: GenerationSessionMeta = {
    id,
    createdAt: nowIso(),
    expiresAt: addMsIso(ttlMs),
    status: "idle",
  };
  await writeJsonAtomic(metaPath, meta);

  // Initialize progress
  const progress: GenerationProgress = { current: 0, total: 0, currentOperation: "Idle" };
  await writeJsonAtomic(progressPath, progress);

  return { id, root, uploadsDir, generatedDir, progressPath, metaPath };
}

export async function ensureSession(sessionId: string): Promise<EnsureSessionPaths> {
  const root = path.join(getTempRoot(), sessionId);
  const uploadsDir = path.join(root, UPLOADS);
  const generatedDir = path.join(root, GENERATED);
  const progressPath = path.join(root, PROGRESS);
  const metaPath = path.join(root, META);

  if (!(await pathExists(root))) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  await ensureDir(uploadsDir);
  await ensureDir(generatedDir);
  return { id: sessionId, root, uploadsDir, generatedDir, progressPath, metaPath };
}

export async function saveBase64Upload(params: {
  sessionId: string;
  fileName: string;
  base64Data: string; // raw base64 (no data URL)
  mimeType: string;
  maxBytes?: number;
}): Promise<{
  savedPath: string;
  size: number;
  originalName: string;
}> {
  const { sessionId, fileName, base64Data, mimeType, maxBytes = 20 * 1024 * 1024 } = params;

  if (!isAllowedMime(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  // Basic base64 validation
  if (!/^[a-zA-Z0-9+/=\r\n]+$/.test(base64Data)) {
    throw new Error("Invalid base64 payload");
  }

  const buf = Buffer.from(base64Data, "base64");
  if (buf.byteLength === 0) {
    throw new Error("Empty file");
  }
  if (buf.byteLength > maxBytes) {
    throw new Error(`File too large. Max ${maxBytes} bytes`);
  }

  const sess = await ensureSession(sessionId);
  const safeNameBase = sanitizeFileName(fileName.replace(/\.[^/.]+$/, ""));
  const ext = extForMime(mimeType) || path.extname(fileName) || "";
  const outPath = path.join(sess.uploadsDir, `original-${safeNameBase}${ext}`);

  await fs.writeFile(outPath, buf);

  // Update meta with uploaded file info
  const meta = (await readJsonSafe<GenerationSessionMeta>(sess.metaPath)) ?? {
    id: sessionId,
    createdAt: nowIso(),
    expiresAt: addMsIso(DEFAULT_TTL_MS),
  };
  meta.uploadedFile = {
    originalName: fileName,
    tempPath: outPath,
    mimeType,
    size: buf.byteLength,
  };
  await writeJsonAtomic(sess.metaPath, meta);

  return { savedPath: outPath, size: buf.byteLength, originalName: fileName };
}

export async function writeProgress(sessionId: string, progress: GenerationProgress): Promise<void> {
  const sess = await ensureSession(sessionId);
  await writeJsonAtomic(sess.progressPath, progress);
}

export async function readProgress(sessionId: string): Promise<GenerationProgress> {
  const sess = await ensureSession(sessionId);
  const p = await readJsonSafe<GenerationProgress>(sess.progressPath);
  return (
    p ?? {
      current: 0,
      total: 0,
      currentOperation: "Idle",
    }
  );
}

export async function readMeta(sessionId: string): Promise<GenerationSessionMeta | null> {
  const sess = await ensureSession(sessionId);
  return (await readJsonSafe<GenerationSessionMeta>(sess.metaPath)) ?? null;
}

export async function updateMeta(
  sessionId: string,
  patch: Partial<GenerationSessionMeta>,
): Promise<GenerationSessionMeta> {
  const sess = await ensureSession(sessionId);
  const cur = (await readJsonSafe<GenerationSessionMeta>(sess.metaPath)) ?? {
    id: sessionId,
    createdAt: nowIso(),
    expiresAt: addMsIso(DEFAULT_TTL_MS),
  };
  const next = { ...cur, ...patch, id: sessionId };
  await writeJsonAtomic(sess.metaPath, next);
  return next;
}

export async function cleanupSession(sessionId: string): Promise<void> {
  const sessRoot = path.join(getTempRoot(), sessionId);
  // Best-effort recursive removal
  try {
    await fs.rm(sessRoot, { recursive: true, force: true });
  } catch (err) {
    // Log upstream; swallow to avoid UX breakage
    console.warn(`[pixel-forge] cleanup warning for ${sessionId}:`, err);
  }
}
 
export async function cleanupExpiredSessions(): Promise<{ removed: string[] }> {
  const root = getTempRoot();
  const removed: string[] = [];
  if (!(await pathExists(root))) return { removed };
 
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    const metaPath = path.join(root, id, META);
    const meta = await readJsonSafe<GenerationSessionMeta>(metaPath);
    if (!meta) continue;
    const expired = new Date(meta.expiresAt).getTime() < Date.now();
    if (expired) {
      try {
        await fs.rm(path.join(root, id), { recursive: true, force: true });
        removed.push(id);
      } catch (err) {
        console.warn(`[pixel-forge] TTL cleanup warning for ${id}:`, err);
      }
    }
  }
  return { removed };
}
 
// Opportunistic TTL cleanup guard to avoid running too often per server instance
let __pf_lastCleanupAt = 0;
/**
 * Run TTL cleanup at most once per minIntervalMs for this server instance.
 * Useful in serverless-ish environments where a real cron is not available.
 */
export async function maybeCleanupExpiredSessions(minIntervalMs = 60 * 60 * 1000): Promise<{
  ran: boolean;
  removed: string[] | null;
}> {
  const now = Date.now();
  if (now - __pf_lastCleanupAt < minIntervalMs) {
    return { ran: false, removed: null };
  }
  __pf_lastCleanupAt = now;
  try {
    const res = await cleanupExpiredSessions();
    return { ran: true, removed: res.removed };
  } catch (err) {
    console.warn("[pixel-forge] opportunistic TTL cleanup failed:", err);
    return { ran: true, removed: null };
  }
}