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

## Workspace Integration

### Pixel Forge Package
```
packages/pixel-forge/     # Local development clone (git ignored)
├── src/                 # TypeScript source
├── dist/                # Compiled output
├── package.json         # Independent package
└── ...                  # Full pixel-forge repository
```

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