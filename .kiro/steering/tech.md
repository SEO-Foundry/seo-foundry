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