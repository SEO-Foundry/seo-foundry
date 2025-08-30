# seo-foundry

Project scaffolded with create-t3-app and selected: Next.js App Router, TypeScript, tRPC, Prisma (PostgreSQL), Tailwind CSS, ESLint/Prettier.

T3 Stack scaffold:
- Next.js App Router (v15)
- TypeScript
- tRPC v11
- Prisma ORM v6 (PostgreSQL)
- Tailwind CSS v4.1
- ESLint + Prettier
- pnpm

Key files and entry points:
- App Router root: [src/app/page.tsx](src/app/page.tsx)
- tRPC HTTP handler: [src/app/api/trpc/[trpc]/route.ts](src/app/api/trpc/%5Btrpc%5D/route.ts)
- Server API root: [appRouter](src/server/api/root.ts:9) and type [AppRouter](src/server/api/root.ts:14)
- tRPC plumbing: [createTRPCContext()](src/server/api/trpc.ts:27), [createTRPCRouter](src/server/api/trpc.ts:74), [publicProcedure](src/server/api/trpc.ts:106)
- Example router and procedures: [postRouter](src/server/api/routers/post.ts:5), [hello](src/server/api/routers/post.ts:6), [create](src/server/api/routers/post.ts:14), [getLatest](src/server/api/routers/post.ts:24)
- React tRPC client/provider: [api](src/trpc/react.tsx:25), [TRPCReactProvider()](src/trpc/react.tsx:41), [getBaseUrl()](src/trpc/react.tsx:74)
- Prisma schema: [prisma/schema.prisma](prisma/schema.prisma) (model [Post](prisma/schema.prisma:13))
- Environment validation: [src/env.js](src/env.js)
- Database helper: [src/server/db.ts](src/server/db.ts)
- Styling entry: [src/styles/globals.css](src/styles/globals.css)
- Local DB helper script: [start-database.sh](start-database.sh)
- Import alias: "@" (see [tsconfig.json](tsconfig.json))


## Prerequisites

- Node.js 18.18+ (LTS) or 20+
- pnpm 10 (project sets "packageManager": pnpm@10.x in [package.json](package.json))
- Docker Desktop or Podman (for local PostgreSQL via [start-database.sh](start-database.sh))
- macOS/Linux/WSL recommended for shell script usage


## 1) Initial setup

- Install dependencies:
  ```bash
  pnpm install
  ```
- Prepare your env file:
  ```bash
  cp .env.example .env
  # then edit .env and set DATABASE_URL
  ```
- Start a local PostgreSQL with Docker using the helper script (uses DATABASE_URL from .env):
  ```bash
  chmod +x ./start-database.sh   # first time only
  ./start-database.sh
  ```
- Apply the already-committed Prisma migrations to your local database (no schema init needed):
  ```bash
  pnpm db:migrate   # no-op if your DB is already up-to-date
  ```
- Run the dev server:
  ```bash
  pnpm dev
  # http://localhost:3000
  ```


## 2) Environment variables

- Copy example and edit (if you didn’t in step 1):
  ```bash
  cp .env.example .env
  ```
- Required:
  - Update the PostgreSQL password in the .env
  - [DATABASE_URL](.env.example:14): format `postgresql://USER:PASSWORD@HOST:PORT/DB_NAME`
- Validation is enforced in [src/env.js](src/env.js). If you add more env vars, update this file accordingly.


## 3) Local database (PostgreSQL)

Option A: Start a local container using the helper script:
```bash
# make executable once
chmod +x ./start-database.sh

# start DB using DATABASE_URL from .env
./start-database.sh
```
Notes about [start-database.sh](start-database.sh):
- Parses user, password, port, and DB name from your `DATABASE_URL`.
- Names the container as "<DB_NAME>-postgres".
- If your password is the default "password", the script can generate a random one and in-place update `.env`.
- Requires Docker or Podman daemon running. On Windows, run it from WSL.

Option B: Bring your own PostgreSQL and ensure [DATABASE_URL](.env.example:14) points to it.


## 4) Prisma status (already initialized)

- I’ve already initialized the database and committed migrations.
- You do NOT need to run `prisma db push` or create new migrations to get started.
- To sync your local database to the committed state, run:
  ```bash
  pnpm db:migrate    # applies committed migrations
  ```
- Explore data (optional):
  ```bash
  pnpm db:studio
  ```
- For future schema changes (maintainers only): update [prisma/schema.prisma](prisma/schema.prisma) and create a migration with:
  ```bash
  pnpm db:generate   # prisma migrate dev (generates & applies a new migration)
  ```


## 5) Running the app

- Development server:
  ```bash
  pnpm dev
  # http://localhost:3000
  ```
- Type check:
  ```bash
  pnpm typecheck
  ```
- Lint & format:
  ```bash
  pnpm lint
  pnpm lint:fix
  pnpm format:check
  pnpm format:write
  ```
- Production preview:
  ```bash
  pnpm preview
  # builds then starts production server
  ```


## 6) tRPC usage overview

Server:
- Root router: [appRouter](src/server/api/root.ts:9)
- Context: [createTRPCContext()](src/server/api/trpc.ts:27) exposes DB via [src/server/db.ts](src/server/db.ts)
- Public procedure base: [publicProcedure](src/server/api/trpc.ts:106)
- Example router: [postRouter](src/server/api/routers/post.ts:5) with [hello](src/server/api/routers/post.ts:6), [create](src/server/api/routers/post.ts:14), [getLatest](src/server/api/routers/post.ts:24)
- HTTP handler bound in App Router: [src/app/api/trpc/[trpc]/route.ts](src/app/api/trpc/%5Btrpc%5D/route.ts)

Client:
- React Query + tRPC client/provider: [TRPCReactProvider()](src/trpc/react.tsx:41), client instance [api](src/trpc/react.tsx:25)
- Base URL resolution: [getBaseUrl()](src/trpc/react.tsx:74) (uses `window.location`, `VERCEL_URL`, or `localhost:PORT`)
- Example server component usage of tRPC RSC helpers: [src/app/page.tsx](src/app/page.tsx)
- Example hydrated component showing the latest post: [src/app/_components/post.tsx](src/app/_components/post.tsx)


## 7) Tailwind CSS

- Tailwind v4.1 is preconfigured; global styles live in [src/styles/globals.css](src/styles/globals.css).
- Add utility classes directly to components in [src/app](src/app).
- Prettier plugin for Tailwind sorting is enabled via dev dependency.

Useful scripts:
```bash
pnpm format:check
pnpm format:write
```


## 8) Import alias "@"

- Import alias "@" maps to `src/`. See [tsconfig.json](tsconfig.json).
- Example: `import { db } from "@/server/db"` resolves to [src/server/db.ts](src/server/db.ts).


## 9) Deployment (Vercel recommended)

- Set environment variables (at minimum `DATABASE_URL`) in your hosting provider.
- Ensure migrations run in your deployment pipeline:
  - Option 1 (managed): run `pnpm db:migrate` as a deploy step.
  - Option 2 (manual): apply migrations from your CI before starting the app.
- `postinstall` runs `prisma generate` automatically, as defined in [package.json](package.json).
- The tRPC base URL logic [getBaseUrl()](src/trpc/react.tsx:74) respects `VERCEL_URL` in serverless environments.


## 10) Troubleshooting

- Port already in use when starting DB:
  - Adjust the port in [DATABASE_URL](.env.example:14) and re-run [start-database.sh](start-database.sh).
- Permission denied for the DB script:
  ```bash
  chmod +x ./start-database.sh
  ```
- Docker/Podman daemon not running:
  - Start Docker Desktop/Podman Desktop and retry.
- Prisma schema changes not reflected:
  ```bash
  pnpm db:migrate        # apply committed migrations
  # maintainers: use pnpm db:generate to create a new migration after editing schema.prisma
  ```


## 11) Scripts reference

Defined in [package.json](package.json):

- build: `next build`
- dev: `next dev --turbo`
- preview: `next build && next start`
- start: `next start`
- check: `next lint && tsc --noEmit`
- typecheck: `tsc --noEmit`
- lint / lint:fix
- format:check / format:write
- db:push / db:generate / db:migrate / db:studio


## 12) Project structure (selected)

- App Router pages and UI: [src/app](src/app)
- tRPC server: [src/server/api](src/server/api)
- tRPC client: [src/trpc](src/trpc)
- Prisma schema: [prisma/schema.prisma](prisma/schema.prisma)
- Global styles: [src/styles/globals.css](src/styles/globals.css)
- Environment schema: [src/env.js](src/env.js)
- DB helper: [src/server/db.ts](src/server/db.ts)
- Local DB script: [start-database.sh](start-database.sh)
