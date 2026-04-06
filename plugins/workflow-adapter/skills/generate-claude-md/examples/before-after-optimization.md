# Before / After CLAUDE.md Optimization Example

## BEFORE (142 lines — bloated)

```markdown
# My Web App

This is a modern web application built with Next.js 14, TypeScript, and PostgreSQL.
It provides a REST API and a React-based frontend for managing user accounts.

## Project Structure

- `src/` - Main source code
  - `app/` - Next.js app router pages
  - `components/` - React components
  - `lib/` - Utility functions and shared code
  - `api/` - API route handlers
  - `types/` - TypeScript type definitions
  - `hooks/` - Custom React hooks
  - `styles/` - CSS modules and global styles
- `prisma/` - Database schema and migrations
- `public/` - Static assets
- `tests/` - Test files
- `scripts/` - Build and deployment scripts

## Development Guidelines

### Code Style
- Use TypeScript for all new files
- Follow ESLint rules (configured in .eslintrc.js)
- Use Prettier for formatting (configured in .prettierrc)
- Use meaningful variable and function names
- Keep functions small and focused (single responsibility)
- Avoid deeply nested code

### Naming Conventions
- Components: PascalCase (e.g., UserProfile.tsx)
- Utilities: camelCase (e.g., formatDate.ts)
- Constants: UPPER_SNAKE_CASE
- CSS modules: camelCase

### Git Workflow
- Create feature branches from `main`
- Use conventional commits (feat:, fix:, chore:, etc.)
- Squash merge to main
- Always create a PR, never push directly to main

### Testing
- Write unit tests for all utility functions
- Write integration tests for API routes
- Use React Testing Library for component tests
- Aim for 80% code coverage
- Run tests before committing

### Error Handling
- Always use try-catch for async operations
- Log errors with proper context
- Return appropriate HTTP status codes
- Use custom error classes for domain errors

### Performance
- Use React.memo for expensive components
- Lazy load routes and heavy components
- Optimize images with next/image
- Use proper caching headers

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- pnpm 8+

### Installation
1. Clone the repository
2. Run `pnpm install`
3. Copy `.env.example` to `.env` and fill in values
4. Run `pnpm db:migrate` to set up the database
5. Run `pnpm dev` to start the development server

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - NextAuth.js secret
- `NEXTAUTH_URL` - Base URL of the application
- ... (15 more variables listed)

## API Documentation
(50 more lines of API endpoint descriptions...)

## Deployment
(20 more lines of deployment instructions...)
```

---

## AFTER (38 lines — optimized)

```markdown
# My Web App

Next.js 14 + TypeScript + PostgreSQL user account management app.

## Build & Test

pnpm install
cp .env.example .env  # fill in DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
pnpm db:migrate
pnpm dev              # development server on :3000
pnpm test             # unit + integration tests
pnpm lint             # eslint + prettier check

## Key Constraints

- Node.js 20+, PostgreSQL 15+, pnpm 8+ required
- Database schema lives in `prisma/schema.prisma` — run `pnpm db:migrate` after changes
- Auth uses NextAuth.js — all auth logic goes through `src/lib/auth.ts`
- API routes must return typed responses using `src/types/api.ts` interfaces

## Non-Obvious Patterns

- `src/lib/db.ts` exports a singleton Prisma client — never instantiate Prisma directly
- Integration tests require a running PostgreSQL; use `pnpm test:setup` to create test DB
- CSS modules use camelCase imports (enforced by Next.js config, not eslint)
```

---

## What Was Removed and Why

| Removed Section | Reason |
|----------------|--------|
| Project Structure | Agent can discover this from the filesystem |
| Code Style | Already enforced by ESLint + Prettier configs |
| Naming Conventions | Standard conventions for the framework |
| Git Workflow | Not relevant to coding tasks |
| Testing guidelines | Generic best practices (write tests, aim for coverage) |
| Error Handling | Standard practices any agent knows |
| Performance tips | Generic React optimization advice |
| Full env var list | `.env.example` already documents these |
| API Documentation | Lives in actual API docs/types |
| Deployment | Not relevant to coding tasks |

**Result**: 142 lines → 38 lines (73% reduction), keeping only what would cause breakage if missed.
