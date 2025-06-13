# AI Chat Template - Development Guide

## Commands
- **Dev server**: `pnpm dev`
- **Build**: `pnpm build` (runs TypeScript compilation then Vite build)
- **Lint**: `pnpm lint` (ESLint)
- **Deploy**: `pnpm deploy` (builds and deploys with Wrangler)
- **Test**: `pnpm test` (Playwright E2E tests)
- **Test UI**: `pnpm test:ui` (Playwright test runner with UI)
- **Test headed**: `pnpm test:headed` (Run tests in visible browser)

## Code Style
- **Formatting**: Prettier with 2-space tabs, single quotes, no semicolons, 140 char line width
- **Imports**: Use `.tsx`/`.ts` extensions in imports, group by external/internal
- **Components**: React FC with explicit typing, PascalCase names
- **Hooks**: Custom hooks start with `use`, camelCase
- **Types**: Define interfaces in `src/types/index.ts`, use `type` for unions
- **Files**: Use PascalCase for components, camelCase for hooks/utilities
- **State**: Use proper TypeScript typing for all state variables
- **Error handling**: Use try/catch blocks with proper error propagation
- **Database**: IndexedDB with typed interfaces, async/await pattern
- **Styling**: Tailwind CSS classes, responsive design patterns

## Tech Stack
React 19, TypeScript, Vite, Tailwind CSS, Hono API, Cloudflare Workers, IndexedDB
