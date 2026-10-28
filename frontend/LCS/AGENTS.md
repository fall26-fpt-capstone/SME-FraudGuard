# Instructions for contributors and coding assistants

Read `README.md`, `docs/ui/UI_RULES.md` and `docs/ui/DESIGN_SYSTEM.md` before changing this application.
The approved proposal in the team's documentation governs product scope. If it conflicts with current demo behavior, report the conflict before expanding the implementation.

- Work inside `frontend/LCS` for dashboard tasks. Change the landing page or other services only when explicitly requested.
- This is a Next.js App Router application. Keep URL entry points in `src/app`. Do not introduce a second router or put React screens in `src/pages`.
- Follow the directory responsibilities in README. Use `@/` imports across groups and relative imports within one group. Preserve named exports and existing business behavior during moves.
- Read `docs/ui/UI_RULES.md` as the current UI contract. Earlier design documents are historical references and do not override it.
- Read `docs/ui/DESIGN_SYSTEM.md` for typography, dimensions, tokens, component states and known legacy differences. Inspect the component CSS including later overrides before editing. Do not treat legacy values as the standard or claim every screen already complies. Keep this document aligned when changing shared design values.
- Reuse CSS variables, existing components and `useDialogFocus`. Enterprise-facing text must be understandable without technical knowledge. Update both Vietnamese and English translations.
- Preserve enterprise isolation and role checks. Do not add risk scores, automatic blocking, new roles, new packages or backend assumptions without a requirement.
- API contracts are not implemented yet. Keep `src/services` empty until a contract is approved. Do not create fake endpoints, placeholder HTTP clients or fabricated success responses.
- Keep demo data in `src/data`. Browser storage is not a security boundary. Never commit credentials or local environment files.
- Keep permission/enterprise helpers in `src/utils`, shared contracts in `src/types`, and the display permission matrix in `src/config`. Share menus through `src/routes/navigation.ts` and role home views through `src/routes/role-home.ts`; do not duplicate menus in layouts.
- Avoid broad refactors and unrelated formatting. Do not overwrite teammates' work.
- Use npm and the committed package-lock.json. For a package change, update and commit both manifests; explain why the dependency is necessary.
- Before handing off, run `npm run check` and `npm run build`. Report failures honestly. These checks are complementary; lint currently covers Next.js rules, typecheck covers TypeScript, and tests cover existing business scenarios.
- Work on a feature branch. Push only the requested branch. The team leader reviews and merges the PR; do not merge or push directly to main.
