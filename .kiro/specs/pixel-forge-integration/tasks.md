# Implementation Plan

- [x] 0. Platform setup, dependencies, and runtime constraints
  - Ensure Node runtime for all heavy routes/procedures (pixel-forge requires Node APIs)
    - Export `export const runtime = "nodejs"` in any Next.js route handlers used for file serving (if applicable)
  - Add dependencies:
    - ZIP creation: `archiver`
    - MIME helpers (if needed by file routes): `mime-types`
  - Implement an ImageMagick availability check utility (magick/convert) and a fallback decision (use Jimp fallback if unavailable)
  - Document required system deps (ImageMagick) and configure temp root via env (e.g., `PF_TMP_DIR`)

- [x] 1. Set up tRPC router and basic file handling infrastructure
  - Create `src/server/api/routers/pixel-forge.ts` router skeleton
  - Implement session management utilities (generate `sessionId`, per-session temp roots, TTL metadata)
  - Implement `uploadImage` mutation (accept base64, validate MIME/size, store under `/tmp/pixel-forge-sessions/[sessionId]/uploads`)
  - Implement `cleanupSession` mutation (delete session tree; safe error handling)
  - _Requirements: 1.1, 1.3, 1.4, 9.1, 9.4_

- [x] 2. Implement core pixel-forge integration procedure
  - Create `generateAssets` mutation using pixel-forge programmatic API (`generate(...)`)
  - Map UI selections to pixel-forge options (generationTypes, `transparent`, metadata fields)
  - Organize outputs into `/generated` folders; return structured metadata + server URLs
  - On missing ImageMagick, switch `ImageProcessor.setEngine('jimp')` and warn in result
  - _Requirements: 3.1, 3.2, 5.2, 5.3, 5.4_

- [ ] 3. Update SidebarOptions for pixel-forge generation types
  - Replace mock options (sizes/styles/formats) with: favicon, pwa, social, seo, web, all + supplemental `transparent`
  - Add “Generate All” control (selects all types)
  - Show dynamic expected file counts per selection (computed in client or fetched from server)
  - _Requirements: 2.1, 2.2, 2.3, 8.1_

- [ ] 4. Add metadata customization fields
  - Add optional appName, description, themeColor, backgroundColor
  - Validate color hex values; provide defaults
  - Add output options: format (png/jpeg/webp), quality slider, urlPrefix
  - Show expected file counts summary
  - _Requirements: 2.5, 5.1, 5.2, 5.5, 6.5_

- [-] 5. Wire pixel-forge page to tRPC procedures
  - Replace mock `generate()` with `generateAssets` mutation
  - Replace client-only upload with tRPC `uploadImage` (base64 path or future route handler)
  - Update local state to consume real `PixelForgeResult`
  - Maintain UI/UX (loading, disabled states, error banners)
  - _Requirements: 1.1, 1.5, 3.1, 9.3_

- [ ] 6. Implement progress tracking system
  - Add a server-side progress module: write per-session `progress.json` or keep progress in memory keyed by session
  - Create `getGenerationProgress` query to read progress info
  - Update the existing progress indicator to poll/subscribe, display current operation and percentage
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 7. Update ResultGrid for real assets
  - Render real file info (dimensions, file size, purpose/category)
  - Group assets by category (favicon, pwa, social, seo, transparent, meta)
  - Wire single-file Download to real URLs
  - Provide lightbox preview on click
  - _Requirements: 4.1, 4.2, 4.3, 6.1, 6.2, 6.4, 6.6_

- [ ] 8. Meta tags display and copy
  - Add a dedicated section for `meta-tags.html` content
  - Provide copy-to-clipboard and minimal formatting (no external highlighter needed)
  - Include short instructions on usage
  - _Requirements: 4.5, 6.3_

- [ ] 9. “Download All” as ZIP
  - Create a `zipAssets` tRPC mutation (or Next route) that zips session’s `/generated` directory
  - Include `meta-tags.html` and `manifest.json` when present
  - Provide simple progress (optional) or a disabled state until ready
  - _Requirements: 4.4_

- [ ] 10. Error handling and user feedback
  - Validate input image MIME/size; return helpful messages
  - Display pixel-forge errors with remediations (e.g., unsupported format)
  - Detect ImageMagick absence and show installation guidance in UI
  - Log server-side errors with structured details; show user-friendly messages
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 11. Session cleanup and file lifecycle
  - Implement TTL cleanup (24h) job/endpoint
  - Manual clear triggers filesystem cleanup and client reset
  - Ensure no orphaned files; handle partial failures gracefully
  - _Requirements: 9.1, 9.2, 9.4, 9.5_

- [x] 12. File serving for generated assets
  - Create a Next.js route handler for streaming files:
    - `/api/pixel-forge/files/[sessionId]/[...path]/route.ts`
    - Validate session access; set correct MIME; `runtime = "nodejs"`
  - Generate stable preview/download URLs consumed by ResultGrid
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 13. Tests
  - Unit tests for tRPC (upload, generate, progress, zip, cleanup) with pixel-forge mocked
  - Integration: upload → generate → download → zip → cleanup
  - Error paths: invalid MIME/size, missing ImageMagick, pixel-forge failures
  - _Requirements: All requirements validation_

- [ ] 14. Production hardening
  - File size limits & MIME allowlist
  - Rate limiting for generation
  - Memory/CPU guardrails; observe for Jimp fallback usage
  - Logging/monitoring hooks
  - _Requirements: 1.4, 7.1, 7.4_
