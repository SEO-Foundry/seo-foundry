# Project Structure

## Root Configuration
- `package.json` - Main project dependencies and scripts
- `pnpm-workspace.yaml` - Workspace configuration for monorepo
- `tsconfig.json` - TypeScript configuration with "@/*" alias mapping to "src/*"
- `eslint.config.js` - ESLint configuration with TypeScript rules
- `prettier.config.js` - Code formatting configuration
- `next.config.js` - Next.js configuration
- `postcss.config.js` - PostCSS configuration for Tailwind

## Environment & Database
- `.env` / `.env.example` - Environment variables (DATABASE_URL required)
- `src/env.js` - Environment validation schema using @t3-oss/env-nextjs
- `prisma/schema.prisma` - Database schema definition
- `start-database.sh` - Local PostgreSQL setup script

## Application Structure

### Frontend (src/app/)
```
src/app/
├── layout.tsx              # Root layout with providers
├── page.tsx               # Homepage
├── _components/           # Shared UI components
│   ├── Header.tsx
│   ├── UploadArea.tsx
│   ├── SidebarOptions.tsx
│   ├── ResultGrid.tsx
│   └── post.tsx          # Example tRPC usage
├── pixel-forge/          # Asset generation pages
│   └── page.tsx
└── api/                  # API routes
    └── trpc/[trpc]/      # tRPC HTTP handler
        └── route.ts
```

### Backend (src/server/)
```
src/server/
├── db.ts                 # Prisma client instance
└── api/
    ├── root.ts           # Main tRPC router (appRouter)
    ├── trpc.ts           # tRPC configuration & context
    └── routers/          # Feature-specific routers
        └── [feature].ts  # Individual tRPC routers
```

### Client-side tRPC (src/trpc/)
```
src/trpc/
├── react.tsx            # React Query + tRPC provider
├── server.ts            # Server-side tRPC helpers
└── query-client.ts      # React Query configuration
```

### Styling
- `src/styles/globals.css` - Global styles and Tailwind imports

## Workspace Integration (Multi-Tool Architecture)

SEO Foundry uses a workspace-based architecture to integrate multiple independent SEO tools:

### Current Tool Integrations
```
packages/
├── pixel-forge/         # Visual asset generation tool
│   ├── src/            # TypeScript source
│   ├── dist/           # Compiled output
│   ├── package.json    # Independent package
│   └── ...             # Full pixel-forge repository
└── [future-tools]/     # Additional SEO tools (schema-smith, etc.)
```

### Integration Pattern
- Each tool maintains its own Git repository
- Local clones in `packages/` for dual-development
- Workspace dependencies (`"workspace:*"`) for immediate linking
- Tools are Git-ignored by parent repo during development
- Eventually published as independent npm packages

## Key Conventions

### Import Patterns
- Use `@/` alias for all src/ imports: `import { db } from "@/server/db"`
- Server-only imports: Use `"server-only"` package in server code
- Type imports: Use inline type imports `import { type User } from "..."`

### File Organization
- Components in `_components/` folders (Next.js convention)
- tRPC routers grouped by feature in `src/server/api/routers/`
- Pages follow Next.js App Router file-based routing
- Shared utilities and types co-located with usage

### Naming Conventions
- React components: PascalCase files (Header.tsx)
- API routes: kebab-case folders, lowercase files
- Database models: PascalCase in Prisma schema
- Environment variables: SCREAMING_SNAKE_CASE

### Architecture Patterns
- **Server Components**: Default for pages, use tRPC server helpers
- **Client Components**: Mark with `"use client"`, use tRPC React hooks
- **API Layer**: All data access through tRPC procedures
- **Database**: Single Prisma client instance exported from `src/server/db.ts`
- **Type Safety**: End-to-end types from database to frontend via tRPC

---

## Pixel Forge Integration Highlights

This section enumerates the concrete files, routes, and structure that make up the Pixel Forge feature to help orient dual-development and onboarding.

### Key Server Files
- Router: [pixel-forge.ts](src/server/api/routers/pixel-forge.ts:1)
  - Exposes procedures: newSession, uploadImage, generateAssets, getGenerationProgress, zipAssets, cleanupSession, cleanupExpired
  - Enforces rate limits and per-session locks via [security.ts](src/server/lib/security.ts:1)
  - Annotates asset metadata (dimensions/bytes) and returns safe URLs under our file-serving route
- Engine detection: [deps.ts](src/server/lib/pixel-forge/deps.ts:1)
  - [ensureImageEngine()](src/server/lib/pixel-forge/deps.ts:10) prefers ImageMagick, falls back to Jimp
- Session management & FS layout: [session.ts](src/server/lib/pixel-forge/session.ts:1)
  - Creates per-session root with directories/files:
    - uploads/
    - generated/
    - progress.json
    - session.json
  - Provides helpers for upload (MIME allow-list, size caps), progress/meta read/write, TTL cleanup
- Security utilities: [security.ts](src/server/lib/security.ts:1)
  - [enforceFixedWindowLimit()](src/server/lib/security.ts:15), [limiterKey()](src/server/lib/security.ts:54)
  - [acquireLock()](src/server/lib/security.ts:75)/[releaseLock()](src/server/lib/security.ts:80) for per-session concurrency

### File-Serving Route (Node runtime)
- Route handler: [route.ts](src/app/api/pixel-forge/files/[sessionId]/[...filePath]/route.ts:1)
  - Confines paths to the per-session root; blocks traversal
  - Adds ETag/Last-Modified, 304 support, nosniff, and ZIP attachment headers
  - Serves only files generated/owned by the current session

### UI Surface
- Feature page: [page.tsx](src/app/pixel-forge/page.tsx:1)
  - Uploads via tRPC, triggers generation, polls progress, displays results, offers ZIP download
- Components:
  - [SidebarOptions.tsx](src/app/_components/SidebarOptions.tsx:1) — generation toggles, metadata, output options
  - [ResultGrid.tsx](src/app/_components/ResultGrid.tsx:1) — grouped assets, previews, dimensions/bytes, lightbox

### Testing Artifacts
- Vitest config & alias:
  - [vitest.config.defineConfig()](vitest.config.ts:4) — Node env, @ → src alias, excludes .d.ts from collection
  - Tests tsconfig: [tests/tsconfig.json](tests/tsconfig.json:1)
- Suites:
  - Router and integration paths: [router.test.ts](tests/pixel-forge/router.test.ts:1)
    - Mocks `pixel-forge` (ImageProcessor + generateAssets) for deterministic runs
  - Security utilities: [security.test.ts](tests/pixel-forge/security.test.ts:1)

### Routing & Data Flow Summary
1. Client invokes tRPC procedures on [pixel-forge.ts](src/server/api/routers/pixel-forge.ts:1)
2. Router coordinates session, engine, generation, and progress updates
3. Generated files are read back through [route.ts](src/app/api/pixel-forge/files/[sessionId]/[...filePath]/route.ts:1) with safe headers and confinement
4. UI renders assets/metadata and exposes ZIP bundling via router
