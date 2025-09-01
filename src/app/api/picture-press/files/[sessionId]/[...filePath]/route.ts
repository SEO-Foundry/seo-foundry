import { promises as fs } from "fs";
import path from "path";
import type { NextRequest } from "next/server";
import { ensurePicturePressSession } from "@/server/lib/picture-press/session";

export const runtime = "nodejs";

function makeETag(size: number, mtimeMs: number): string {
  // Weak ETag: size-mtime fingerprint
  return `W/"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

function contentTypeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".gif":
      return "image/gif";
    case ".tiff":
    case ".tif":
      return "image/tiff";
    case ".bmp":
      return "image/bmp";
    case ".ico":
      return "image/x-icon";
    case ".json":
      return "application/json; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ sessionId: string; filePath: string[] }> },
): Promise<Response> {
  const { sessionId, filePath } = await ctx.params;

  // Basic UUID shape check (avoid path traversal via malformed session)
  if (!/^[0-9a-fA-F-]{36}$/.test(sessionId)) {
    return new Response("Invalid session id", { status: 400 });
  }

  try {
    const sess = await ensurePicturePressSession(sessionId);

    // Decode each segment to prevent double-encoding issues
    const decodedSegments = filePath.map((p) => decodeURIComponent(p));
    const joined = path.join(sess.root, ...decodedSegments);
    const normalized = path.normalize(joined);

    // Ensure the resolved path stays within the session root
    if (
      !normalized.startsWith(sess.root + path.sep) &&
      normalized !== sess.root
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    const stat = await fs.stat(normalized).catch(() => null);
    if (!stat?.isFile()) {
      return new Response("Not found", { status: 404 });
    }

    const headers = new Headers();
    // Conditional GET support
    const etag = makeETag(stat.size, stat.mtimeMs);
    const ifNoneMatch = _req.headers.get("if-none-match");
    headers.set("ETag", etag);
    headers.set("Last-Modified", new Date(stat.mtimeMs).toUTCString());
    // Allow preview in browser by default; clients can still force download via link attributes
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("X-Content-Type-Options", "nosniff");

    const ct = contentTypeFor(path.extname(normalized));
    headers.set("Content-Type", ct);
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers });
    }

    const data = await fs.readFile(normalized);
    headers.set("Content-Length", String(data.byteLength));
    if (ct === "application/zip") {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${path.basename(normalized)}"`,
      );
    }

    // Buffer is not typed as BodyInit in TS; wrap as Uint8Array for Response
    const body = new Uint8Array(data);
    return new Response(body, { status: 200, headers });
  } catch (err) {
    console.error("[picture-press] file serve error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string; filePath: string[] }> },
): Promise<Response> {
  const getResponse = await GET(req, ctx);
  // Return same headers but no body for HEAD requests
  return new Response(null, {
    status: getResponse.status,
    headers: getResponse.headers,
  });
}