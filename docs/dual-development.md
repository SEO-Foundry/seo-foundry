# Dual-development guide: integrating pixel-forge locally (temporary workflow)

This document describes a clean, reversible workflow to develop seo-foundry while simultaneously iterating on the external library pixel-forge without publish/bump loops. It uses:
- pnpm workspaces for instant linking
- a Git submodule for pixel-forge to keep its own repository/history
- a workspace dependency ("workspace:*") to consume pixel-forge from the app

When pixel-forge is stable for the app, you’ll switch the app back to a normal npm dependency and remove the submodule.

## Summary

- Add pixel-forge to this repo as a Git submodule at packages/pixel-forge
- Depend on pixel-forge via "workspace:*" in the app’s package.json
- Develop both repos side-by-side; no publishing required during daily iteration
- Later, replace the workspace dependency with a published semver and remove the submodule

## Prerequisites

- SSH access to pixel-forge repo (you will use git@github.com:devints47/pixel-forge.git)
- Node 18.18+ or 20+
- pnpm 10.x
- Git

## 1) Prepare workspace

Ensure there is a workspace manifest at the repo root (already added in this project):

pnpm-workspace.yaml:
```yaml
packages:
  - "packages/*"
```

Create the packages/ directory if it doesn’t exist:
```bash
mkdir -p packages
```

## 2) Add pixel-forge as a Git submodule

Clone pixel-forge into this repo under packages/ via submodule:
```bash
git submodule add git@github.com:devints47/pixel-forge.git packages/pixel-forge
git submodule update --init --recursive
```

Commit the submodule pointer and .gitmodules file:
```bash
git add .gitmodules packages/pixel-forge
git commit -m "chore: add pixel-forge as submodule"
```

Notes:
- Do not add packages/pixel-forge to .gitignore. The submodule directory itself must be tracked by Git in the parent repo via .gitmodules. The submodule’s contents are tracked by its own repository.
- Build artifacts inside pixel-forge should be controlled by pixel-forge’s own .gitignore.

## 3) Link the app to pixel-forge via workspace

In seo-foundry’s package.json, add a dependency:
```json
{
  "dependencies": {
    "pixel-forge": "workspace:*"
  }
}
```

Install:
```bash
pnpm install
```

This symlinks packages/pixel-forge into the app using pnpm’s workspace resolution. No publishing required.

## 4) Develop with watch/build loops

Within packages/pixel-forge, ensure you have scripts to watch or build (e.g., using tsup or tsc):
```json
{
  "scripts": {
    "dev": "tsup --watch",
    "build": "tsup"
  }
}
```
Or:
```json
{
  "scripts": {
    "dev": "tsc -b --watch",
    "build": "tsc -b"
  }
}
```

Run both projects:
```bash
# Terminal A: rebuild pixel-forge on changes
pnpm --filter pixel-forge dev

# Terminal B: run the Next.js app
pnpm dev
```

## 5) Integrate pixel-forge in the app (server-side)

- Use pixel-forge’s programmatic API from the server only (tRPC procedures or /app/api route handlers).
- Good entry points:
  - Create a router under src/server/api/routers/* and export from src/server/api/root.ts
  - The HTTP layer is provided by src/app/api/trpc/[trpc]/route.ts
- If pixel-forge relies on Node-only APIs (sharp, fs, native bindings), ensure the runtime is Node.js (not edge) for any Next.js API routes or tRPC calls that invoke it.

## 6) Onboarding for other developers

When a collaborator clones seo-foundry:
```bash
git clone <seo-foundry-repo>
cd seo-foundry

# initialize and fetch the submodule
git submodule update --init --recursive

pnpm install

# optional: open two terminals
pnpm --filter pixel-forge dev
pnpm dev
```

To update the submodule to a newer commit/branch:
```bash
cd packages/pixel-forge
git fetch
git checkout main
git pull

# back in the root repo, record the new submodule commit
cd ../..
git add packages/pixel-forge
git commit -m "chore: bump pixel-forge submodule pointer"
```

## 7) Removing the submodule and switching back to npm

When pixel-forge is stable and ready to consume as a normal dependency:

1) Publish pixel-forge to npm (from its own repo)
```bash
# inside packages/pixel-forge (or its standalone repo)
pnpm build
pnpm publish
```

2) Update seo-foundry’s dependency to the published version
```json
{
  "dependencies": {
    "pixel-forge": "^X.Y.Z"
  }
}
```
Then:
```bash
pnpm install
```

3) Remove the submodule:
```bash
git submodule deinit -f packages/pixel-forge
git rm -f packages/pixel-forge
rm -rf .git/modules/packages/pixel-forge

git commit -m "chore: remove pixel-forge submodule (now using npm package)"
```

Optional:
- Keep pnpm-workspace.yaml. It is harmless and can be reused if you add other temporary workspaces.
- If you plan no more local packages, you can remove the workspace entry, but it’s not required.

## 8) Alternative temporary linking (not recommended here)

- file: protocol dependency (e.g., "pixel-forge": "file:../pixel-forge") can work locally but is brittle for teammates and CI. Submodule + workspace is more reproducible and shares the same source across the team.

## 9) Troubleshooting

- Submodule appears empty or missing
  - Run:
    ```bash
    git submodule update --init --recursive
    ```
- Next.js/TypeScript cannot resolve types from pixel-forge
  - Ensure pixel-forge’s package.json declares "name": "pixel-forge" and has proper "exports"/"types" fields. Rebuild pixel-forge and restart the dev server.
- Native modules crash in route handlers
  - Use Node runtime (not edge). Keep the transformations within tRPC procedures or Node runtime route handlers.
