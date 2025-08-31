# Security and Abuse-Prevention Design

This document explains the security measures and production hardening added to the Pixel Forge integration. It covers rate limiting, concurrency control, input validation, file-serving protections, TTL cleanup, and operational considerations.

## Overview

The integration is designed to:
- Limit abusive traffic (flooded uploads/generates/ZIPs/progress-polls).
- Prevent concurrent workload duplication per session.
- Validate user inputs and file paths.
- Serve files safely with standard HTTP caching semantics.
- Proactively clean up temporary sessions and files.
- Provide actionable error messages while avoiding sensitive detail leakage.

Key implementation files:
- tRPC router and handlers: [src/server/api/routers/pixel-forge.ts](src/server/api/routers/pixel-forge.ts)
- Session storage and TTL utilities: [src/server/lib/pixel-forge/session.ts](src/server/lib/pixel-forge/session.ts)
- Engine detection: [src/server/lib/pixel-forge/deps.ts](src/server/lib/pixel-forge/deps.ts)
- In-memory rate limiting and locks: [src/server/lib/security.ts](src/server/lib/security.ts)
- File-serving route (session-scoped files): [src/app/api/pixel-forge/files/[sessionId]/[...filePath]/route.ts](src/app/api/pixel-forge/files/%5BsessionId%5D/%5B...filePath%5D/route.ts)

## Rate Limiting

A lightweight, fixed-window rate limiter caps requests by endpoint and IP/session key:
- Library: [src/server/lib/security.ts](src/server/lib/security.ts)
- Policy examples enforced in [pixel-forge.ts](src/server/api/routers/pixel-forge.ts):
  - newSession: 20/min per IP
  - uploadImage: 30/min per IP/session
  - generateAssets: 6/min per IP/session
  - zipAssets: 6/min per IP/session
  - getGenerationProgress (poll): 60/min per IP/session
  - cleanupExpired / cleanupSession: mild rate limits to deter spam

Notes:
- Keys are built from the request IP (from proxy headers) and optional sessionId.
- For multi-instance production, use a shared store (Redis) and enforce limits at the edge (CDN/WAF/Ingress) where possible.

## Concurrency Locks

To avoid duplicate computation for the same session, in-process locks are used:
- acquireLock/releaseLock in [src/server/lib/security.ts](src/server/lib/security.ts)
- Per-session locks for:
  - Generation: key `pf:gen:{sessionId}`
  - ZIP creation: key `pf:zip:{sessionId}`

Notes:
- In clustered/multi-instance deployments, replace with distributed locks (e.g., Redis Redlock).

## Input Validation and Path Safety

All inputs are validated and file system operations are scoped to the session root:
- MIME allow-list for uploads:
  - Enforced by zod refinement and validated again during persistence.
- Size cap for uploads:
  - Default 10MB maximum enforced server-side.
- Path normalization and confinement:
  - Generated file operations validate that resolved paths are within the session directory tree.
  - The imagePath provided to generation is validated to exist and be a file.

References:
- tRPC router: [src/server/api/routers/pixel-forge.ts](src/server/api/routers/pixel-forge.ts)
- Session utilities: [src/server/lib/pixel-forge/session.ts](src/server/lib/pixel-forge/session.ts)

## File-Serving Protections

The file-serving route is session-scoped and includes:
- Path traversal prevention (normalize + session-root prefix check).
- MIME detection with `mime-types` to set Content-Type.
- Cache validators with ETag and Last-Modified.
- Conditional GET support (304 Not Modified for If-None-Match).
- `X-Content-Type-Options: nosniff`.
- `Content-Disposition: attachment` for ZIPs to prevent inline execution.

Reference:
- [src/app/api/pixel-forge/files/[sessionId]/[...filePath]/route.ts](src/app/api/pixel-forge/files/%5BsessionId%5D/%5B...filePath%5D/route.ts)

## Progress Polling Controls

The progress endpoint is rate-limited (60/min per IP/session) to prevent abusive polling. The client UI also polls conservatively during active generation.

## TTL Cleanup

Temporary sessions and files are cleaned up:
- Manual cleanup API: `cleanupSession`
- Expired sessions cleanup:
  - `cleanupExpiredSessions()` removes sessions past their `expiresAt` timestamp.
  - Opportunistic guard `maybeCleanupExpiredSessions()` runs at most once per interval to keep temp storage tidy without a dedicated scheduler.

Reference:
- [src/server/lib/pixel-forge/session.ts](src/server/lib/pixel-forge/session.ts)
- Routed in: [src/server/api/routers/pixel-forge.ts](src/server/api/routers/pixel-forge.ts)

## Error Handling and Safe Messaging

Server returns structured `TRPCError` messages with:
- User-friendly summaries (e.g., “Upload failed due to invalid file or size limit”).
- Actionable guidance (e.g., suggestions to install ImageMagick if not detected).
- Avoidance of sensitive internal details.

Client UI displays:
- Error alerts and informational notes.
- Engine information (and ImageMagick recommendation when not using it).

Reference:
- Server: [src/server/api/routers/pixel-forge.ts](src/server/api/routers/pixel-forge.ts)
- Client: [src/app/pixel-forge/page.tsx](src/app/pixel-forge/page.tsx)

## Production Recommendations

For robust production deployments:
- Rate limiting:
  - Enforce at the edge (CDN/WAF/Ingress) and/or use a shared store (Redis) for limits and locks.
- Locking:
  - Replace in-process locks with a distributed lock (e.g., Redis Redlock) to coordinate across instances.
- Storage:
  - Migrate session files to object storage (S3/R2) and serve through signed URLs or tightly scoped proxy routes.
- Caching:
  - Honor ETag/Last-Modified in CDNs to reduce bandwidth for previews; tune max-age and revalidation policy.
- Observability:
  - Add request metrics (rate-limit hits, generation runtimes, failures by cause).
  - Log structured errors; redact sensitive data.
- Configuration:
  - Extract limits (upload max size, per-endpoint rates) to environment variables for easier tuning.
- Security headers:
  - Consider content security policy (CSP) and other relevant headers at the framework/proxy layer.

## Threat Model (Abbreviated)

- Abuse by excessive requests:
  - Mitigated by per-endpoint rate limits and progress polling caps.
- Duplicate workload amplification:
  - Mitigated by per-session concurrency locks.
- Path traversal or unauthorized file access:
  - Mitigated by path normalization and session-root enforcement.
- Oversized or invalid files:
  - Mitigated by MIME allow-lists and server-side size caps.
- Cache-related issues:
  - Mitigated by using ETag/Last-Modified, nosniff, and ZIP disposition attachment.

## Operational Runbook

- To purge stale sessions manually:
  - Call `pixelForge.cleanupExpired` via tRPC (admin/internal tooling).
- To investigate performance:
  - Check engine selection (ImageMagick vs Jimp) and confirm ImageMagick is installed in prod.
- To tune limits:
  - Adjust constants in [src/server/api/routers/pixel-forge.ts](src/server/api/routers/pixel-forge.ts) or externalize to env vars.
- To scale out:
  - Introduce Redis for limits/locks, switch to object storage, and configure edge/CDN caching.
