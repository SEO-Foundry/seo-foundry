# Product Overview

SEO Foundry is a **unified platform and homebase** for independent SEO-related tools, serving as a one-stop shop for web developers. Rather than building monolithic features, SEO Foundry acts as a sophisticated front-end that integrates multiple specialized tools into a cohesive user experience.

## Platform Architecture

- **Homebase Concept**: Central hub that orchestrates multiple independent SEO tools
- **Tool Integration**: Each tool maintains its own repository and can be developed independently
- **Unified Interface**: Single web application providing consistent UX across all tools
- **Modular Approach**: Tools can be added, updated, or removed without affecting the core platform

## Current Tool Integrations

### pixel-forge

- **Purpose**: Visual asset generation (favicons, Open Graph images, social media cards)
- **Platforms**: Facebook, Twitter, LinkedIn, Instagram, TikTok, PWA icons
- **Status**: Active integration via workspace dependency

#### User Flow
- Upload source image in the Pixel Forge page, then trigger server-side generation via tRPC.
- tRPC router orchestrates session lifecycle, engine detection, generation, metadata, and progress:
  - [pixel-forge.ts](src/server/api/routers/pixel-forge.ts)
- Files are served securely per-session through a dedicated Node runtime route:
  - [route.ts](src/app/api/pixel-forge/files/[sessionId]/[...filePath]/route.ts)
- UI wiring under /pixel-forge consumes the API and displays results (grid, previews, download-all ZIP).

#### Safety & Limits (user-facing)
- Rate-limited requests (per-IP and per-session) for upload, generate, progress, and zip operations:
  - [security.ts](src/server/lib/security.ts)
- Concurrency locks prevent duplicate in-flight generation/zip for the same session.
- Path traversal is blocked; only session-scoped files are readable.
- All file responses include nosniff and cache validators; ZIPs have attachment Content-Disposition.

#### Test Coverage (confidence)
- Router-level unit tests with a mocked pixel-forge ensure core happy paths and limits:
  - [router.test.ts](tests/pixel-forge/router.test.ts)
- Security utilities verified independently:
  - [security.test.ts](tests/pixel-forge/security.test.ts)
- Vitest config enables @ alias and excludes .d.ts from test collection:
  - [vitest.config.ts](vitest.config.ts)

### schema-smith (Planned)

- **Purpose**: Structured data and schema markup generation
- **Focus**: JSON-LD, microdata, and SEO schema optimization
- **Status**: Future integration

### Additional Tools (Pipeline)

- More specialized SEO tools will be integrated following the same pattern
- Each tool remains independently maintainable and publishable

## Core Value Proposition

- **Developer Efficiency**: Single interface for multiple SEO workflows
- **Consistent Experience**: Unified design and interaction patterns
- **Tool Ecosystem**: Best-in-class specialized tools working together
- **Simplified Deployment**: One application to deploy and maintain

## Target Users

- **Primary**: Web developers needing comprehensive SEO tooling
- **Secondary**: SEO specialists, content creators, and digital marketers
- **Use Case**: Teams wanting integrated SEO workflows without tool-switching overhead
