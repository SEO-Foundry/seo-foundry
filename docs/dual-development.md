# Dual-development guide: integrating pixel-forge locally (temporary workflow)

Goal: develop seo-foundry and pixel-forge side-by-side without publishing loops. This project uses a pnpm workspace and a local clone of pixel-forge under packages/, ignored by the parent Git repo. This gives instant linking, simple onboarding for teammates, and an easy path to switch back to a normal npm dependency later.

Contents
- Why local clone vs submodule
- Current setup summary
- Step-by-step: set up, run, verify versions
- Using pixel-forge in seo-foundry
- Teammate onboarding
- Switching back to published npm package
- Alternative: submodule workflow (optional)
- Troubleshooting

## Why local clone vs submodule

Submodules keep a separate Git history but add operational overhead (init/update, detached HEAD). For active co-development, a plain local clone that’s ignored by the parent repo is simpler. The pnpm workspace still symlinks pixel-forge into the app. Later, you can remove the clone and depend on a published version.

If you prefer submodules, see “Alternative: submodule workflow (optional)” below. Both approaches work with pnpm workspaces.

## Current setup summary

- Workspace: [pnpm-workspace.yaml](../pnpm-workspace.yaml) includes "packages/*"
- App depends on pixel-forge via "workspace:*" in [package.json](../package.json)
- Local clone (not a submodule) at [packages/pixel-forge](../packages/pixel-forge) and ignored by the parent repo via [.gitignore](../.gitignore)
- You work on pixel-forge in place, and the app sees changes immediately

Rationale for version numbers you might see:
- git describe shows the nearest tag to the current commit. If you are on main at commit f1c6f4c and the latest tag is v1.2.2, you might see v1.2.2-4-gf1c6f4c (4 commits after v1.2.2), which is expected when working ahead of the latest tag.

## Step-by-step (local clone workflow)

1) Ensure workspace config exists in repo root (already present):
- [pnpm-workspace.yaml](../pnpm-workspace.yaml)
  - packages:
    - "packages/*"

2) Clone pixel-forge into packages/:
```bash
# from repo root
mkdir -p packages
git clone git@github.com:devints47/pixel-forge.git packages/pixel-forge
```

3) Make sure the parent repo ignores the local clone (already added):
- [.gitignore](../.gitignore) contains:
  - packages/pixel-forge/

4) Install and link workspace packages:
```bash
pnpm install
```

5) Verify pixel-forge repo state and tags (optional):
```bash
cd packages/pixel-forge
git fetch origin --tags --prune
git rev-parse --abbrev-ref HEAD               # expect: main
git describe --tags --always                  # e.g. v1.2.2-4-g<sha> or v1.2.2
git tag --list | sort -V | tail -n 10        # see latest tags incl. v1.2.x
```
- If you want the exact tag v1.2.2 temporarily:
  - git checkout v1.2.2
  - Note: this puts the repo in a detached state; for daily edits, use a branch (e.g., main).

6) Run both projects:
```bash
# Terminal A (pixel-forge): ensure it rebuilds on changes (scripts depend on that repo)
pnpm --filter pixel-forge dev

# Terminal B (app):
pnpm dev
```

## Using pixel-forge in seo-foundry

- Consume the programmatic API from server code only (Node runtime). Good places:
  - tRPC: add a new router in [src/server/api/routers](../src/server/api/routers) and export from [appRouter](../src/server/api/root.ts:9).
  - HTTP route: route handlers under [src/app/api](../src/app/api) with Node runtime.
- Return URLs/bytes/metadata to the client, not Node Buffers directly.

## Teammate onboarding

1) Clone seo-foundry
2) Clone pixel-forge into packages/ (SSH access required):
```bash
mkdir -p packages
git clone git@github.com:devints47/pixel-forge.git packages/pixel-forge
```
3) Install:
```bash
pnpm install
```
4) Run:
```bash
pnpm --filter pixel-forge dev
pnpm dev
```

## Switching back to published npm package (when stable)

1) Publish pixel-forge from its repo (outside seo-foundry), creating e.g. vX.Y.Z on npm.

2) Update seo-foundry dependency in [package.json](../package.json):
- Replace "pixel-forge": "workspace:*" with "pixel-forge": "^X.Y.Z"

3) Install:
```bash
pnpm install
```

4) Remove the local clone if no longer needed:
```bash
rm -rf packages/pixel-forge
```
- Keep [pnpm-workspace.yaml](../pnpm-workspace.yaml) as it’s harmless and helpful for future packages.

## Alternative: submodule workflow (optional)

If you prefer keeping a submodule instead of a plain clone:
1) Add as submodule:
```bash
git submodule add git@github.com:devints47/pixel-forge.git packages/pixel-forge
git submodule update --init --recursive
```
2) Do not ignore packages/pixel-forge in [.gitignore](../.gitignore)
3) Keep the app dependency as "workspace:*" in [package.json](../package.json)
4) To get correct version labels from git describe:
```bash
cd packages/pixel-forge
git fetch origin --tags --prune
git checkout -B main origin/main   # or a branch you want to work on
git describe --tags --always
```
- You may see v1.2.2-4-g<sha> if you’re a few commits ahead of v1.2.2.
- To pin exactly v1.2.2: git checkout v1.2.2 (detached HEAD, not ideal for daily edits).

To remove submodule and switch back, follow standard submodule deinit + git rm steps, then optionally switch to the local-clone method above.

## Troubleshooting

- Why did I see an older version in submodule status (e.g., v1.0.11-62-…)? 
  - git describe uses the nearest available tag references. If tags weren’t fetched yet in the submodule, describe may show an older tag. After fetching tags (git fetch --tags), describe reflects the nearest correct tag (e.g., v1.2.2-4-…).

- Next.js/TypeScript can’t resolve types:
  - Ensure pixel-forge declares proper "name", "types", and "exports" in its package.json and build it. Then restart pnpm dev.

- Native/binary modules crash when called from API handlers:
  - Ensure you’re using Node runtime (not edge) in routes that call pixel-forge.

- Teammate doesn’t see pixel-forge folder:
  - Confirm they cloned it locally under packages/pixel-forge and ran pnpm install.
