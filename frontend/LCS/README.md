# FraudGuard Dashboard

Next.js App Router, React, TypeScript and CSS Modules. This app lives in the shared repository under `frontend/LCS`.

## Install and run

Use Node.js 22 LTS (22.13 or newer) or Node.js 24 LTS, and npm 10 or newer. `.nvmrc` records the minimum supported Node 22 version. Use the same npm lockfile; do not introduce yarn or pnpm lockfiles.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Landing page is a separate application in `../LCS_landingpage` on port 3001. Phase 1 connects real authentication and server-backed session handling through a same-origin Next.js route bridge (`src/app/api/auth/[action]/route.ts`) to `FRAUDGUARD_BACKEND_URL` (defaulting to `http://127.0.0.1:8080` outside production). Unintegrated business workflow screens display explicit unavailable states and do not load demo fixtures into authenticated sessions.

## Directory responsibilities

Enterprise users open the login page on their assigned subdomain (for example, `http://school-a.localhost:3000/login` in local development). The server uses the single subdomain label as the readable workspace key. For deployment, set `FRAUDGUARD_ENTERPRISE_DOMAIN` to the parent domain, route enterprise subdomains to the dashboard, and preserve the original Host header at the reverse proxy. Platform users sign in at `/platform/login`.

| Directory | Responsibility |
| --- | --- |
| `public/` | Files served by URL; currently reserved |
| `src/app/` | Next.js URL routes, root layout, loading/error boundaries and global CSS |
| `src/assets/` | Imported assets; reserved until needed |
| `src/components/` | Dashboard views, reusable controls, dialogs and their CSS Modules |
| `src/config/` | Shared configuration, permission matrix and bilingual translations |
| `src/context/` | Language and toast providers |
| `src/hooks/` | Shared React hooks, including accessible dialog focus |
| `src/layouts/` | Dashboard navigation/sidebar and product header |
| `src/routes/` | Shared desktop/mobile menus and role home views; not a separate router |
| `src/services/` | Approved backend API clients and same-origin server bridge handlers (Phase 1: `auth.ts`) |
| `src/types/` | Shared TypeScript domain/UI contracts |
| `src/utils/` | Detection, lifecycle, validation, import/export, permissions and enterprise scope helpers |
| `src/data/` | Demo fixtures only; access checks belong in utils |
| `tests/` | Node test runner regression scenarios |
| `docs/ui/` | UI rules and historical design references |

Git does not track empty directories. Reserved directories contain only `.gitkeep`; these files contain no implementation.

### Routing note

The reference folder structure is adapted to Next.js rather than switching frameworks. `src/app/page.tsx`, `src/app/login/page.tsx` (Enterprise Workspace sign-in), `src/app/platform/login/page.tsx` (Platform Administration sign-in) and `src/app/fraud-monitoring/page.tsx` remain the route entry points. They compose existing components. Do not add `.tsx` screens to `src/pages`: Next.js would register them as Pages Router URLs. Keep view components in `src/components` and register actual routes through `src/app`.

Use `@/types/fraudguard`, `@/context/LanguageContext`, `@/hooks/useDialogFocus` and `@/utils/...` for shared imports. CSS remains beside its owning components; moving files must not change visual behavior.

There is no `src/pages` directory. Dashboard sections still switch within `/fraud-monitoring`; `src/routes/navigation.ts` shares menu definitions between Sidebar and ProductHeader, while `src/routes/role-home.ts` selects the initial section for each role. Neither creates URL routes.

Authenticated account identity, role and mandatory password-setup state come from `/api/v1/auth/session` through `src/services/auth.ts`. Permission checks live in `src/utils/permissions.ts`; enterprise access and usage helpers live in `src/utils/enterprise.ts`. The display permission matrix is in `src/config/permissions.ts`. Enterprise and permission matrix types are in `src/types`. Frontend helpers control UI presentation only, not backend authorization.

Sidebar and ProductHeader intentionally reuse `src/components/fraudguard-dashboard/SecurityDashboard.module.css`. Their location in `layouts` does not make their styling independent of the dashboard.

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

Start with `AGENTS.md`, [UI_RULES.md](docs/ui/UI_RULES.md) and [DESIGN_SYSTEM.md](docs/ui/DESIGN_SYSTEM.md). UI_RULES covers business-facing behavior and language. DESIGN_SYSTEM covers font, header/sidebar dimensions, theme tokens, component states, responsive behavior and known legacy differences. This README owns folder and package setup. Older UI guides contain superseded examples and are historical references, not current specifications.

Before pushing, run `npm run check` and `npm run build`, then inspect `git diff` from the repository root. Commit only the intended frontend changes to a feature branch and let the team leader merge the PR.

For local workflow testing, open `/demo` and choose a sample account. The selector changes the dashboard and its local fixtures. Authentication and backend permissions use the signed-in account. Development enables the preview automatically. To enable it for a local production build, start Next.js with `FRAUDGUARD_LOCAL_DEMO=1`.
