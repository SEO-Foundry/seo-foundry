# Technology Stack

## Framework & Runtime
- **Next.js 15** with App Router - React framework for production
- **React 19** - UI library
- **TypeScript** - Type-safe JavaScript with strict configuration
- **Node.js 18.18+** - Runtime environment

## Backend & Database
- **tRPC v11** - End-to-end typesafe APIs
- **Prisma ORM v6** - Database toolkit with PostgreSQL
- **PostgreSQL** - Primary database
- **Zod** - Runtime type validation

## Styling & UI
- **Tailwind CSS v4.1** - Utility-first CSS framework
- **Headless UI** - Unstyled, accessible UI components
- **Heroicons** - Icon library

## Development Tools
- **pnpm** - Package manager (required: pnpm@10.x)
- **ESLint** - Code linting with TypeScript rules
- **Prettier** - Code formatting with Tailwind plugin
- **TypeScript ESLint** - Strict TypeScript linting rules

## Key Libraries
- **@tanstack/react-query** - Server state management
- **@t3-oss/env-nextjs** - Environment variable validation
- **superjson** - JSON serialization for tRPC

## Integrated SEO Tools (Workspace Dependencies)
- **pixel-forge** - Visual asset generation (favicons, social cards, PWA icons)
- **schema-smith** - Structured data and schema markup (planned)
- **Additional tools** - Future SEO utilities following same integration pattern

## Common Commands

### Development
```bash
pnpm dev              # Start development server with Turbo
pnpm typecheck        # Type checking without emit
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix ESLint issues
```

### Database
```bash
pnpm db:migrate       # Apply Prisma migrations
pnpm db:push          # Push schema changes
pnpm db:studio        # Open Prisma Studio
pnpm db:generate      # Generate new migration
```

### Formatting
```bash
pnpm format:check     # Check code formatting
pnpm format:write     # Format code with Prettier
```

### Production
```bash
pnpm build            # Build for production
pnpm preview          # Build and start production server
pnpm start            # Start production server
```

### Database Setup
```bash
chmod +x ./start-database.sh  # Make script executable
./start-database.sh           # Start local PostgreSQL container
```

## Build System
- **Turbo** - Fast development builds
- **PostCSS** - CSS processing
- **Next.js build** - Production optimization
- **Prisma generate** - Automatic client generation on install

---

## Pixel Forge Integration – Technical Notes

- Server-only integration
  - All Pixel Forge calls run on the server; do not use in client components.
  - Entry points:
    - tRPC router: [pixel-forge.ts](src/server/api/routers/pixel-forge.ts:1) exposing newSession, uploadImage, generateAssets, getGenerationProgress, zipAssets, cleanupSession, cleanupExpired.
    - File-serving route: [route.ts](src/app/api/pixel-forge/files/[sessionId]/[...filePath]/route.ts:1) (Node runtime) for secure per-session file access.

- Engine detection
  - Preferred engine is ImageMagick with fallback to Jimp.
  - Detector: [ensureImageEngine()](src/server/lib/pixel-forge/deps.ts:10) which sets engine using the tool’s ImageProcessor.
  - Developer guidance: install ImageMagick locally for best output quality (e.g., brew install imagemagick).

- Session-scoped filesystem
  - Each session has a root containing:
    - uploads/ (source images)
    - generated/ (all derived assets)
    - progress.json + session.json
  - Helpers live in [session.ts](src/server/lib/pixel-forge/session.ts:1) for creation, uploads (MIME allow-list and size caps), progress/meta read/write, and TTL cleanup.

- Security and abuse mitigation
  - Fixed-window rate limits and per-session concurrency locks in [security.ts](src/server/lib/security.ts:1):
    - [enforceFixedWindowLimit()](src/server/lib/security.ts:15)
    - [limiterKey()](src/server/lib/security.ts:54)
    - [acquireLock()](src/server/lib/security.ts:75) / [releaseLock()](src/server/lib/security.ts:80)
  - Router-level enforcement for newSession/upload/generate/progress/zip/cleanup.
  - urlPrefix is guarded; only server-generated base prefixes are allowed.
  - File route includes path traversal confinement, ETag/Last-Modified for 304 support, nosniff, and ZIP attachment headers.

- Asset packaging and metadata
  - ZIP creation via archiver includes generated assets plus meta-tags and manifest.
  - Dimensions and byte sizes annotated server-side using image-size before returning to the UI.

- Testing setup
  - Vitest configuration with @ alias, excluding .d.ts from collection:
    - [vitest.config.defineConfig()](vitest.config.ts:4)
  - Test-only TS config to ensure IDE type awareness and alias resolution:
    - [tests/tsconfig.json](tests/tsconfig.json:1)
  - Suites:
    - Router/API/security integration (with mocked pixel-forge engine + generation): [router.test.ts](tests/pixel-forge/router.test.ts:1)
    - Rate limiter and concurrency lock unit tests: [security.test.ts](tests/pixel-forge/security.test.ts:1)
  - Commands:
    - pnpm test
    - pnpm test:watch
    - pnpm test:ci
    - pnpm typecheck
    - tsc -p tests/tsconfig.json --noEmit
