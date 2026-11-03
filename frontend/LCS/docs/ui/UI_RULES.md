# FraudGuard: current UI rules

This document is for team members and AI coding assistants. Read it with `AGENTS.md` and `README.md`. The team-approved proposal governs business scope; this document guides its UI presentation. Older UI documents are historical references only and must not be used to restore removed features.

## 1. Business principles

- Transaction outcomes: Normal, Abnormal, Undetermined. Processing/error states and expected test labels are separate information.
- Do not display/calculate risk scores, risk points or score thresholds. Business thresholds such as amounts and transaction counts remain valid when specified.
- Free uses the Rule Engine. Subscription prioritizes AI and uses the Rule Engine when AI is unavailable. Show the correct source: AI, Rule or Fallback; do not invent confidence for rule results.
- Rule Alerts support monitoring and detection reasons. In-depth investigation is tied to AI Alerts; the Operator investigates directly or assigns an Investigator.
- Humans decide conclusions/actions; do not automatically block accounts, cancel transactions or assert that abnormal transactions are confirmed fraud.
- Each enterprise has one main detection configuration. When displaying projects in the demo, always limit them to the enterprise the user may access.
- Clearly distinguish drafts, test results, released versions and handed-over versions. Editing a draft must not change the active configuration.
- Do not add Rule Engine quotas. Do not infer AI billing mechanisms beyond approved requirements.

## 2. Roles and scope

| Role | UI presentation |
| --- | --- |
| Platform Admin | Administer the platform, enterprises and assignments, and track progress |
| Implementation Staff | Review specifications, configure, test, release and hand over within the assigned scope |
| SME Admin | Manage the enterprise, members/permissions and permitted integration information |
| Operator | Monitor AI alerts, investigate/assign and review results |
| Investigator | Investigate assigned cases and submit reports |

Do not add Viewer/Auditor or revert to the names Deployment Staff/Operation. Reuse permission helpers in `src/utils/permissions.ts` and enterprise scope helpers in `src/utils/enterprise.ts`; check both actions and data, rather than only hiding buttons. Dashboards, tables, details, reports and exports must use the same enterprise scope.

## 3. Language for enterprise users

- Prefer clear Vietnamese labels, with meanings such as “Enterprise”, “Rule set”, “Detection reason” and “No data yet”. Limit terms such as tenant, payload, schema and snapshot in SME workflows.
- Do not expose JSON/internal IDs in overviews; technical information should only be expanded when needed in permitted integration/detail sections.
- Use clear action verbs on buttons: “Save changes”, “View details”, “Run tests”. Disabled buttons must explain why and guide users to the next step.
- Do not show success before an action has actually been performed. Do not repeat “demo/no backend yet” banners on every page; document technical limits and explain them at the relevant action when needed.
- Label changes must update both `vi` and `en` in `src/config/translations.ts`. Preserve user-defined names.

## 4. Design and CSS

Read [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for fonts, text sizes, dimensions, the two-theme token table, component states and existing CSS exceptions. It is the current frontend design standard used alongside this document.

- Use CSS Modules and existing tokens in `src/app/globals.css`; do not add a UI framework or a new palette for a single page.
- Reuse existing `Panel`, `StatCard`, tables, badges and buttons. Shared dashboard CSS is in `src/components/fraudguard-dashboard/SecurityDashboard.module.css`; login has its own CSS Module.
- Action colors: `--action-bg: #2563eb`, text `--action-text: #ffffff`. Background/text/borders use theme-specific `--security-*` tokens. Do not use a link color as a CTA background if contrast is insufficient.
- Sidebar uses `--sidebar-width` (240px), header `--product-header-height` (60px), panel radius 5px; controls around 4px, badges around 3px. Spacing follows 4/8/12/16/20/24/28/32px.
- Standard controls are at least 40px; mobile touch targets at least 44px. Metadata text is at least 11px and must be readable in both light/dark themes.
- Page layout: title and short description → primary action → filters/summary → content → pagination or next-step guidance. One prominent primary action per task.
- Tables have readable headers and states expressed in both text and color. Do not use color as the only signal. Long content must wrap/truncate with a way to view it in full.
- Avoid inline styles for shared grids/breakpoints. Charts must explain units, data sources and empty states; detection-source proportions are not AI accuracy.

## 5. Responsive behavior and accessibility

- Below 900px, provide a mobile menu instead of the sidebar. The menu uses the same permissions as desktop and closes after navigation.
- Check at 375px, 768px and desktop. Do not obscure the logo/role labels/buttons; wide tables have their own horizontal scroll region.
- Modals/drawers use `src/hooks/useDialogFocus.ts`, an accessible title, initial focus, Tab trapping, Escape and focus restoration to the opener. Preserve unsaved data or confirm discarding it where appropriate.
- Inputs have labels, errors are associated with fields, and icon buttons have accessible names. Dropdowns have a maximum height, internal scrolling and stay within the viewport.
- Provide empty/loading/error/retry states when the task requires them. Do not add fake loading for synchronous local updates. Preserve focus-visible and respect reduced motion.

## 6. API and packages

- No backend is currently available. Keep `src/services` empty with `.gitkeep`; do not create fake APIs to fill the directory.
- Add services only after the team confirms the contract, authentication, errors and returned data. Sample data belongs in `src/data`; processing helpers belong in `src/utils`.
- Use existing packages: Next.js/React/TypeScript, CSS Modules, lucide-react, recharts and exceljs. New dependencies require a concrete need; commit package-lock with package.json.
- `src/app` registers Next.js URLs; do not create `src/pages`. Desktop/mobile menus share `src/routes/navigation.ts`; role home views use `src/routes/role-home.ts`. Dashboard sections still switch within `/fraud-monitoring`, rather than having separate URLs.
- Sidebar and ProductHeader in `src/layouts` still use shared dashboard CSS; do not copy CSS to make them independent simply because they are in a different directory.

## 7. Before handoff

1. Run `npm run check` and `npm run build`.
2. For UI changes, inspect light/dark themes, mobile/desktop and affected roles.
3. Check empty/error states, primary buttons, keyboard use, dropdowns/modals and vi/en labels.
4. Verify that SMEs cannot see another enterprise's data or internal drafts; investigation must respect permissions.
5. State the scope and validation results in the PR. The leader reviews/merges; do not merge on your own.
