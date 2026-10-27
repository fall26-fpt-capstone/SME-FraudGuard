# FraudGuard Dashboard

Next.js App Router, React, TypeScript and CSS Modules. This app lives in the shared repository under `frontend/LCS`.

## Install and run

Use Node.js 22 LTS (22.13 or newer) or Node.js 24 LTS, and npm 10 or newer. `.nvmrc` records the minimum supported Node 22 version. Use the same npm lockfile; do not introduce yarn or pnpm lockfiles.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Landing page is a separate application in `../LCS_landingpage` on port 3001. The dashboard currently uses demo data and browser storage; no backend/API connection is provided by this setup.

## Directory responsibilities

| Directory | Responsibility |
| --- | --- |
| `public/` | Files served by URL; currently reserved |
| `src/app/` | Next.js URL routes, root layout, loading/error boundaries and global CSS |
| `src/assets/` | Imported assets; reserved until needed |
| `src/components/` | Dashboard views, reusable controls, dialogs and their CSS Modules |
| `src/config/` | Shared configuration and bilingual translation dictionaries |
| `src/context/` | Language and toast providers |
| `src/hooks/` | Shared React hooks, including accessible dialog focus |
| `src/layouts/` | Dashboard navigation/sidebar and product header |
| `src/pages/` | Reserved placeholder only; see routing note below |
| `src/routes/` | Reserved for shared navigation metadata; not a separate router |
| `src/services/` | Reserved for future approved API integration; currently empty |
| `src/types/` | Shared TypeScript domain/UI contracts |
| `src/utils/` | Detection, lifecycle, validation, import/export and other business helpers |
| `src/data/` | Existing demo fixtures and local access helpers |
| `tests/` | Node test runner regression scenarios |
| `docs/ui/` | UI rules and historical design references |

Git does not track empty directories. Reserved directories contain only `.gitkeep`; these files contain no implementation.

### Routing note

The reference folder structure is adapted to Next.js rather than switching frameworks. `src/app/page.tsx`, `src/app/login/page.tsx` and `src/app/fraud-monitoring/page.tsx` remain the route entry points. They compose existing components. Do not add `.tsx` screens to `src/pages`: Next.js would register them as Pages Router URLs. Keep view components in `src/components` and register actual routes through `src/app`.

Use `@/types/fraudguard`, `@/context/LanguageContext`, `@/hooks/useDialogFocus` and `@/utils/...` for shared imports. CSS remains beside its owning components; moving files must not change visual behavior.

## Shared commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server, port 3000 |
| `npm run lint` | Next.js framework lint rules, zero warnings |
| `npm run typecheck` | Generate route types and validate TypeScript |
| `npm test` | Existing rule, access, import/export and workflow tests |
| `npm run check` | Lint, typecheck and tests |
| `npm run build` | Production compilation and route generation |
| `npm start` | Serve the completed production build |

The build currently downloads Inter through `next/font/google`, so it requires network access. Dependencies are installed per app, not through a machine-specific junction. The ESLint configuration deliberately starts with Next.js rules; it does not claim full accessibility or business validation. The parser and plugin it imports are declared directly in package.json.

## UI and AI collaboration

Start with `AGENTS.md` and [UI_RULES.md](docs/ui/UI_RULES.md). They explain current UI behavior, roles, terminology, tokens, responsive design and review checks. Older UI guides contain superseded examples and are not the current business specification.

Before pushing, run `npm run check` and `npm run build`, then inspect `git diff` from the repository root. Commit only the intended frontend changes to a feature branch and let the team leader merge the PR.
