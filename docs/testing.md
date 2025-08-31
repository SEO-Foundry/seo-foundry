# Testing Suite

This project uses Vitest for unit tests with a lightweight, deterministic setup designed to validate the Pixel Forge integration, core API behavior, and security measures without requiring heavy external dependencies or system tools.

## Contents

- What is covered
- How to run
- Project configuration overview
- Pixel Forge test strategy and mocks
- Security utilities test strategy
- Conventions and tips for contributors
- Troubleshooting

---

## What is covered

- Pixel Forge router procedures (tRPC):
  - newSession
  - uploadImage
  - generateAssets (with engine detection and safe urlPrefix enforcement)
  - getGenerationProgress (polling with rate limits)
  - zipAssets (with per-session concurrency lock)
  - cleanupExpired
- Security utilities:
  - Fixed-window rate limiter
  - Concurrency locks
  - Limiter key composition

The focus is on:
- Functional correctness of the API surface
- Security measures (rate limits and concurrency locks)
- Paths/URLs and returned artifacts metadata

Heavy image processing is NOT exercised in tests; the Pixel Forge engine is mocked for speed and determinism.

---

## How to run

- Run all tests:
  - `pnpm test` (non-watch, CI style)
  - `pnpm test:watch` (watch mode)
- Type checking (main project):
  - `pnpm typecheck`
- Type checking (tests project-only):
  - `pnpm typecheck:test`

Coverage is enabled in CI via `pnpm test:ci`.

---

## Project configuration overview

- Vitest configuration: [vitest.config.defineConfig()](vitest.config.ts:4)
  - Node environment, globals enabled
  - Includes `tests/**/*.test.ts(x)` and `tests/**/*.spec.ts(x)`
  - Excludes `**/*.d.ts` so type definition helpers do not run as suites
  - Alias `@` → `src` for clean imports

- TypeScript: [tsconfig.json](tsconfig.json)
  - `types`: `["vitest", "vitest/globals", "node"]`
  - `paths`: `{"@/*": ["./src/*"]}`
  - `include`: includes `tests/**/*.ts(x)` and `vitest.config.ts`

- TypeScript (tests only): [tests/tsconfig.json](tests/tsconfig.json)
  - Extends the root tsconfig and explicitly adds Vitest + Node types
  - Ensures VSCode/TS Server resolves `@/*` alias and Vitest globals in test files

- ESLint: [eslint.config.js](eslint.config.js)
  - ESLint 9 flat config, without Next lint wrapper or rushstack patch
  - Type-aware `typescript-eslint` rules for both app and tests
  - Tests are more lenient on unused vars to reduce noise from mocks

---

## Pixel Forge test strategy and mocks

- File: [router.test.ts](tests/pixel-forge/router.test.ts)
- Router under test: [pixelForgeRouter](src/server/api/routers/pixel-forge.ts:57)
- Engine detection dependency: [ensureImageEngine](src/server/lib/pixel-forge/deps.ts:10)

Key points:
- Prisma DB import is mocked:
  - `vi.mock("@/server/db", () => ({ db: {} }))`
- The `pixel-forge` module is mocked to avoid heavy image work and to avoid requiring ImageMagick:
  - Provides a minimal `ImageProcessor` with `checkImageMagick()` always returning `false`
  - Provides a lightweight `generateAssets()` which writes tiny PNGs and a small manifest into the requested `outputDir`
- Tests cover:
  - Session creation (`newSession`)
  - Upload flow (`uploadImage`) returning server-hosted preview URLs
  - Generation (`generateAssets`) returning assets with dimensions/bytes (via `image-size`) and enforcing safe `urlPrefix`
  - Rate limit behavior for `generateAssets` (6/min per IP per session)
  - ZIP bundling (`zipAssets`) returning a download URL and non-zero size
  - Cleanup of expired sessions
  - Progress polling rate limit (60/min per IP per session)

Timeouts:
- The progress polling test executes enough calls to hit the limiter, so the test timeout is increased to avoid flakiness.

---

## Security utilities test strategy

- File: [security.test.ts](tests/pixel-forge/security.test.ts)
- Library under test: [security](src/server/lib/security.ts)

Covers:
- Fixed-window limiter allows the first N calls and blocks subsequent calls
- The limiter resets correctly after the window elapses (using small windows and sleeps)
- `limiterKey(route, headers, sessionId?)` composes a key from route, best-effort IP, and session ID
- Concurrency lock (`acquireLock`/`releaseLock`) prevents overlapping work for the same key

---

## Conventions and tips for contributors

- File locations:
  - Place new tests under `tests/` and group by feature area (e.g., `tests/pixel-forge/*`)
- Mocks:
  - Keep mocks local in the test file using `vi.mock()` to minimize global side-effects
  - For server helpers importing external modules, prefer partial or inlined mocks that return deterministic values
- Paths and URLs:
  - Use the `@` alias to import from `src/` in tests (e.g., `@/server/api/root`)
- Headers and rate limiting:
  - The rate limiter uses best-effort client IP from headers; construct headers with `x-forwarded-for` for deterministic testing
- Avoid heavy work:
  - Do not shell out to system tools (e.g., ImageMagick) or rely on network/durable stores
  - Keep everything scoped to the session filesystem layout used by the router
- Time-based tests:
  - Use small windows with short sleeps where possible to avoid flakiness
  - When a test intentionally performs many calls (e.g., polling), increase Jest/Vitest test timeout for that case

---

## Troubleshooting

- Editor shows "Cannot find module 'vitest' or types":
  - Ensure the root [tsconfig.json](tsconfig.json) includes `"types": ["vitest", "vitest/globals", "node"]`
  - Ensure `tests/tsconfig.json` exists and VSCode picks it up for test files
- Editor shows path alias resolution errors (`@/`):
  - Check `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }` in [tsconfig.json](tsconfig.json)
  - Ensure `vitest.config.ts` has the alias configured
- Type definitions file runs as a test suite:
  - Confirm that `vitest.config.ts` has `exclude: ["**/*.d.ts"]`
- Rate limit tests flake:
  - Increase sleeps slightly (a few extra milliseconds) or enlarge the window to balance timing accuracy

---

## Commands

- Quick test run: `pnpm test`
- Watch mode: `pnpm test:watch`
- Coverage (CI): `pnpm test:ci`
- Type check (project): `pnpm typecheck`
- Type check (tests): `pnpm typecheck:test`
