# Pixel Forge Integration Guide

This document explains the end-to-end Pixel Forge integration: data flow, key server/client components, file-storage layout, limits/locks, and operational guidance. For security specifics, see [`docs/security.md`](docs/security.md:1).

## Overview

Pixel Forge enables generating a comprehensive set of app/web/social iconography and metadata from a single uploaded image. The integration provides:

- Upload (base64 image) with MIME allow-list and size caps
- Server-side generation via Pixel Forge programmatic API
- Progress polling from the client during generation
- Secure file-serving per session for previews/downloads
- ZIP bundling of generated assets
- Meta tags HTML (with display and copy)

Key files:
- Router and endpoints: [`pixel-forgeRouter`](src/server/api/routers/pixel-forge.ts:1)
- Session storage utilities: [`session.ts`](src/server/lib/pixel-forge/session.ts:1)
- Engine detection (ImageMagick/Jimp): [`deps.ts`](src/server/lib/pixel-forge/deps.ts:1)
- TRPC client provider: [`react-client.tsx`](src/trpc/react-client.tsx:1)
- Pixel Forge UI page: [`page.tsx`](src/app/pixel-forge/page.tsx:1)
- File-serving route: [`route.ts`](src/app/api/pixel-forge/files/%5BsessionId%5D/%5B...filePath%5D/route.ts:1)

## tRPC Procedures

Implemented in [`pixel-forge.ts`](src/server/api/routers/pixel-forge.ts:1).

- `newSession() => { sessionId }`
  - Creates a temporary session to store uploads and generated files.
  - Rate-limited, opportunistic TTL cleanup invoked.

- `uploadImage({ fileName, fileData, mimeType, sessionId? }) => { sessionId, storedPath, previewUrl, size, originalName }`
  - fileData is base64 payload (no data URL prefix).
  - MIME allow-list enforced; size cap (default 10MB).
  - Returns path for later generation and a stable preview URL.

- `generateAssets({ sessionId, imagePath, options }) => { assets[], metaTags, manifestUrl, engine, engineNote, summary }`
  - Server selects engine via [`ensureImageEngine()`](src/server/lib/pixel-forge/deps.ts:1) (ImageMagick preferred; Jimp fallback).
  - Writes progress to `progress.json`. Client polls with `getGenerationProgress`.
  - Asset list includes per-file URLs (preview/download) and annotations (width/height/bytes).

- `getGenerationProgress({ sessionId }) => { current, total, currentOperation }`
  - Rate limited to avoid aggressive polling (e.g., 60/min per IP/session).

- `zipAssets({ sessionId }) => { zipUrl, size }`
  - Bundles generated assets into a single ZIP.
  - Rate-limited and concurrency-guarded per session.

- `cleanupSession({ sessionId }) => { ok: true }`
  - Removes temporary session files.

- `cleanupExpired() => { removed: string[] }`
  - Manually trigger TTL cleanup for expired sessions.

## Client Flow

Implemented UI: [`page.tsx`](src/app/pixel-forge/page.tsx:1)

1. Upload image (drag-and-drop or picker). Client converts to base64 and calls `uploadImage`.
2. Configure generation types and options in the sidebar.
3. Click Generate:
   - Client calls `generateAssets`.
   - Client polls `getGenerationProgress` to show task progression.
4. View results in a grouped grid (by category). View metadata, dimensions, and size.
5. Download:
   - Per-file “Download” buttons or
   - “Download All” (uses `zipAssets`).

Meta tags:
- A dedicated section displays `meta-tags.html` with copy and download actions.

## Session Storage

Temporary session directory layout (see [`session.ts`](src/server/lib/pixel-forge/session.ts:1)):

- `uploads/` original uploaded file
- `generated/` all output assets
- `progress.json` generation progress tracking
- `session.json` session metadata (created/expires, status, upload info)

File serving uses a per-session route: [`route.ts`](src/app/api/pixel-forge/files/%5BsessionId%5D/%5B...filePath%5D/route.ts:1)

- Validates path confinement to the session root.
- Detects content-type, serves correct headers.
- Supports ETag/Last-Modified and conditional GET.
- Adds `nosniff`, uses `Content-Disposition: attachment` for ZIP.

## Limits and Locks

Abuse-prevention logic resides in [`security.ts`](src/server/lib/security.ts:1):

- Fixed-window rate limiter keyed by IP and optional sessionId.
- Lightweight in-memory buckets for:
  - newSession, uploadImage, generateAssets, zipAssets, getGenerationProgress, cleanup*.
- Concurrency locks:
  - Generation lock: prevent concurrent `generateAssets` for the same session.
  - ZIP lock: prevent concurrent `zipAssets` for the same session.

For multi-instance production:
- Replace in-memory rate limiter and locks with a Redis-based solution.
- Optionally enforce additional rate limits at the edge (CDN/WAF).

## Engine Selection

Engine detection in [`deps.ts`](src/server/lib/pixel-forge/deps.ts:1):

- Prefers ImageMagick if available (`magick`).
- Falls back to Jimp (`jimp`) when ImageMagick is missing.
- Server returns `engine` and `engineNote`; client displays guidance when not using ImageMagick.

## Configuration and Operational Notes

- Size limits and rate limits can be tuned in [`pixel-forge.ts`](src/server/api/routers/pixel-forge.ts:1) or externalized to env vars.
- To ensure durability and scale-out:
  - Move temp storage to object storage (S3/R2).
  - Serve via signed URLs or dedicated proxy.
  - Introduce Redis-backed limits and locks.
- Ensure ImageMagick is installed on build hosts for best quality:
  - macOS: `brew install imagemagick`
  - Linux: `apt-get install imagemagick` (or equivalent)

## Troubleshooting

- “Generation failed” with Jimp engine:
  - Install ImageMagick for best quality and broader format support.
- ZIP fails:
  - Check disk space and permissions; server logs contain error trace.
- Excessive rate-limit errors:
  - Reduce polling frequency on the client (already set conservatively).
  - Increase server limits or move to shared store with higher throughput.