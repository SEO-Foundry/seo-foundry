# Dual Development Workflow

## Overview

This project uses a **temporary dual-development setup** to co-develop `seo-foundry` and `pixel-forge` simultaneously without publishing loops. This is a local development convenience that will eventually be replaced with a standard npm dependency.

## Critical Guidelines for AI Assistants

### Repository Boundaries
- **PRIMARY REPO**: `seo-foundry` (this repository) - Main application development
- **SECONDARY REPO**: `packages/pixel-forge/` - Local clone for integration testing only
- **NEVER modify files in `packages/pixel-forge/`** - This is a separate Git repository
- All development should happen in the main `seo-foundry` codebase unless explicitly working on pixel-forge

### Workspace Configuration
- Uses pnpm workspaces via `pnpm-workspace.yaml`
- `pixel-forge` dependency declared as `"workspace:*"` in `package.json`
- Local clone at `packages/pixel-forge/` is **Git-ignored** by parent repo
- Changes in pixel-forge are immediately available to seo-foundry via symlink

### Development Commands
```bash
# Start both projects for development
pnpm --filter pixel-forge dev    # Terminal 1: pixel-forge watch mode
pnpm dev                         # Terminal 2: seo-foundry dev server
```

## Integration Patterns

### Using pixel-forge in seo-foundry
- **Server-side only**: Use pixel-forge in Node.js runtime contexts
- **tRPC procedures**: Create routers in `src/server/api/routers/` for pixel-forge operations
- **API routes**: Use in `src/app/api/` route handlers with Node runtime
- **Return serializable data**: URLs, base64 strings, metadata - NOT Node Buffers

### File Locations for pixel-forge Integration
- tRPC routers: `src/server/api/routers/[feature].ts`
- API routes: `src/app/api/[endpoint]/route.ts`
- Server utilities: `src/server/utils/`

## Temporary Nature

### Current State
- Local clone workflow for active co-development
- Immediate feedback loop between changes
- No publishing required during development

### Future Migration
When pixel-forge stabilizes:
1. Publish pixel-forge to npm registry
2. Update dependency to `"pixel-forge": "^X.Y.Z"`
3. Remove local clone: `rm -rf packages/pixel-forge`
4. Continue with standard npm dependency

## Troubleshooting

### Common Issues
- **Type resolution**: Ensure pixel-forge builds properly (`pnpm --filter pixel-forge build`)
- **Runtime errors**: Verify Node.js runtime in API routes calling pixel-forge
- **Missing package**: Confirm local clone exists and `pnpm install` was run

### Setup Verification
```bash
# Verify workspace linking
pnpm list pixel-forge            # Should show workspace link
ls -la packages/pixel-forge       # Should exist and contain pixel-forge repo
```

## Key Reminders

1. **Stay in seo-foundry**: All UI, API, and application logic belongs here
2. **pixel-forge is read-only**: Don't modify files in `packages/pixel-forge/`
3. **Server-side integration**: Only use pixel-forge in Node.js contexts
4. **Temporary setup**: This will be replaced with npm dependency later