# Dual Development Workflow

## Overview

SEO Foundry uses a **multi-tool dual-development setup** to co-develop the platform alongside multiple independent SEO tools simultaneously. This workspace-based approach allows for:

- **Unified Development**: Work on SEO Foundry and its integrated tools in parallel
- **Tool Independence**: Each tool maintains its own repository and can be developed separately
- **Immediate Integration**: Changes in tools are instantly available to the platform
- **Future Flexibility**: Tools can be published independently when stable

Currently integrated: `pixel-forge` (visual assets)
Planned integrations: `schema-smith` (structured data), and additional SEO tools

## Critical Guidelines for AI Assistants

### Repository Boundaries
- **PRIMARY REPO**: `seo-foundry` (this repository) - Platform and UI development
- **TOOL REPOS**: `packages/[tool-name]/` - Local clones for integration testing only
  - `packages/pixel-forge/` - Visual asset generation tool
  - `packages/schema-smith/` - Future structured data tool
  - Additional tools as they're integrated
- **NEVER modify files in `packages/[tool-name]/`** - These are separate Git repositories
- All platform development happens in the main `seo-foundry` codebase
- Tool-specific development should be done in their respective repositories

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

### Using integrated tools in seo-foundry
- **Server-side only**: Use tools in Node.js runtime contexts
- **tRPC procedures**: Create routers in `src/server/api/routers/` for tool operations
- **API routes**: Use in `src/app/api/` route handlers with Node runtime
- **Return serializable data**: URLs, base64 strings, metadata - NOT Node Buffers
- **Tool-specific pages**: Create dedicated pages like `/pixel-forge`, `/schema-smith`

### File Locations for Tool Integration
- tRPC routers: `src/server/api/routers/[tool-name].ts` (e.g., `pixel-forge.ts`, `schema-smith.ts`)
- API routes: `src/app/api/[tool-name]/route.ts`
- Tool pages: `src/app/[tool-name]/page.tsx`
- Server utilities: `src/server/utils/[tool-name]/`

## Temporary Nature

### Current State
- Multi-tool workspace for active co-development
- Immediate feedback loop between platform and tools
- No publishing required during development phase
- Each tool can be developed and tested independently

### Future Migration (Per Tool)
When individual tools stabilize:
1. Publish tool to npm registry (e.g., `pixel-forge@X.Y.Z`)
2. Update dependency to standard npm version
3. Remove local clone: `rm -rf packages/[tool-name]`
4. Continue with published dependency
5. Repeat process for each tool as they mature

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

1. **Stay in seo-foundry**: All platform UI, API, and integration logic belongs here
2. **Tools are read-only**: Don't modify files in `packages/[tool-name]/` directories
3. **Server-side integration**: Only use tools in Node.js contexts
4. **Multi-tool architecture**: Each tool follows the same integration pattern
5. **Temporary setup**: Local clones will be replaced with npm dependencies when tools stabilize