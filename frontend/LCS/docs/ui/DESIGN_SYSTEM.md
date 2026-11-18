# FraudGuard Frontend Design System

Design standards for the `frontend/LCS` dashboard, for team members and AI to read before coding. Checked against source code on 28/10/2026. This is frontend documentation, not a backend architecture or API design. The landing page is a separate application; do not automatically apply the entire dashboard layout to it.

## 1. What to read before starting

1. Read `../../AGENTS.md`: task scope and validation workflow.
2. Read `../../README.md`: directory structure, packages and run commands.
3. Read `UI_RULES.md`: business presentation in the UI, roles, language and permissions.
4. Read this document: fonts, dimensions, colors and component behavior.
5. Read the actual component and CSS for the screen you will change; also check overrides and media queries at the end of the file.

The approved proposal governs business scope. `UI_RULES.md` governs business presentation; this document governs appearance and interaction standards. If the two current standards conflict, report it before making changes. `FRAUDGUARD_UI_SYSTEM_SPEC.md` and `FRAUDGUARD_DASHBOARD_UI_GUIDE_NEXTJS.md` are historical references only.

Tables marked **current** describe existing CSS, without asserting that every screen already complies. Sections marked **standard for new/modified UI** are requirements for the assigned work; do not update the entire application merely for consistency.

## 2. Implementation sources

| Source | Responsibility |
| --- | --- |
| `src/app/layout.tsx` | Loads Inter through `next/font/google`, with latin and vietnamese support |
| `src/app/globals.css` | Themes, color/dimension tokens, base font and focus |
| `src/components/fraudguard-dashboard/SecurityDashboard.module.css` | Shared CSS for the dashboard, sidebar, header and screens |
| `src/components/auth/Login.module.css` | Separate login layout |
| `src/layouts/Sidebar.tsx`, `ProductHeader.tsx` | Navigation shell; still uses shared dashboard CSS |
| `src/routes/navigation.ts`, `role-home.ts` | Shared desktop/mobile menus and role home views |
| `src/config/translations.ts` | Shared Vietnamese/English content |
| `src/hooks/useDialogFocus.ts` | Dialog focus management |

`src/...` paths are relative to the LCS directory. Use CSS Modules; do not add Tailwind, a UI framework or a new font for a single screen. Do not invent tokens in documentation and then use them before they exist in CSS.

## 3. Fonts and typography hierarchy

Primary font: **Inter**, loaded in the root layout. Base CSS declares the fallback `"Segoe UI", Arial, sans-serif`. The current body size is **14px**. Inputs, selects and buttons inherit the font; new textareas must explicitly inherit it to avoid a different default font.

| Location | Representative current CSS | Standard for new/modified UI |
| --- | --- | --- |
| Page heading `.pageHeading h1` | 26px, weight 600; 23px at ≤680px | Reuse the class, one h1 per page |
| Page description `.pageHeading p` | 13px | 13–14px, muted or secondary color, short content |
| Panel heading `.panelHeader h2` | 13px, weight 600 | Preserve existing panel variants; large sections may use 16px/600 as in the workflow panel |
| Main content | Body 14px, many controls 12px | Prefer 14px for SME content; do not shrink it to fit more data |
| Label/control | Existing classes are usually 12–13px | 12–14px, clear labels, weight 500–600 when emphasis is needed |
| KPI `.statValue` | 31px/600, line-height 1.1 | Use StatCard; rule-set summaries have a 28px variant |
| Metadata | Some classes are 11px; legacy classes remain at 9–10px | At least 11px; do not use for important instructions |
| Table | Legacy headers 10px/600, cells 11px | Prefer 12–14px when modifying SME tables; do not establish 10px text as a new standard |

Weights: 400 for content, 500 for labels/moderate action emphasis, 600 for headings/values, 700 for brief emphasis. Multiline descriptions use line-height 1.5–1.6; this is a standard for additions, not an existing global line-height token. Preserve Vietnamese diacritics; do not uppercase entire paragraphs. Technical JSON/code may use monospace in a separate detail area.

## 4. Colors and themes

Always use tokens instead of copying hex values into components. The values below were checked against `globals.css`; update the documentation when changing tokens.

| Token | Dark | Light | Usage |
| --- | --- | --- | --- |
| `--security-bg` | #17181c | #f3f4f7 | Page background |
| `--security-header` | #1f2025 | #ffffff | Header |
| `--security-panel` | #202126 | #ffffff | Card/panel |
| `--security-panel-hover` | #292c35 | #f8fafc | Row/card hover |
| `--security-control` | #292a32 | #f0f2f6 | Control |
| `--security-control-hover` | #353640 | #e2e5ec | Control hover |
| `--security-border` | #35363e | #e2e5eb | Separators |
| `--security-border-strong` | #454752 | #cbd2df | Control borders |
| `--security-text` | #e5e5ec | #0f172a | Primary text |
| `--security-text-secondary` | #b5b8c4 | #334155 | Supporting text |
| `--security-muted` | #9799a7 | #64748b | Descriptions |
| `--security-subtle` | #777b8b | #64748b | Subtle text; check contrast before using small text |
| `--security-blue` | #71b9f4 | #2563eb | Links, focus, selection |
| `--action-bg` / `--action-text` | #2563eb / #ffffff | #2563eb / #ffffff | Primary action buttons |

Badges use the existing token trios `--critical-text/bg/border`, `--high-text/bg/border`, `--medium-text/bg/border`, `--low-text/bg/border`. Do not infer risk scores or add business outcome levels from legacy token names. States always have text, not only color. Do not assume every current color pair meets contrast requirements; changed areas must be checked for at least 4.5:1 for normal text and 3:1 for large text.

## 5. Dimensions and layout

| Element | Current value/behavior |
| --- | --- |
| Header | `--product-header-height: 60px`; at ≤680px its height may grow when wrapping, with a 60px minimum |
| Expanded sidebar | `--sidebar-width: 240px`; 210px at ≤1150px; hidden at ≤900px and replaced by a mobile menu |
| Content area | `--content-max-width: 1900px`; padding 24px 28px 40px; horizontal padding 18px at ≤1150px; 20px 14px 0 at ≤680px |
| Panel | `--panel-radius: 5px`; 1px border; new areas usually use 16px padding on mobile, 20–24px on desktop |
| Control | Radius 4px; common control groups in `.root` have min-height 40px, min-height 44px at ≤680px |
| Badge | New standard: radius 3px, padding around 3px 6px or 4px 8px; legacy variants use 4px |
| Spacing | New standard: 4/8/12/16/20/24/28/32px; do not add arbitrary values for the same kind of layout |
| Icon | Use lucide-react; new standard: 16px in buttons/tables, 18–20px for navigation, 20–24px at section starts |

Icon size is not touch-target size: new icon buttons need at least 40px on desktop, 44px on mobile. Smaller legacy header/collapse buttons still exist; do not propagate them as the standard.

Breakpoints use `max-width` (including the boundary). At ≤680px, toolbars stack vertically and content must wrap; charts become a single column. Standard KPIs become two columns; case metrics specifically become one column at ≤420px. Do not force all grid types to have the same number of columns. The mobile menu uses the same permission list as desktop and closes after selection.

## 6. Components and interactions

| Element | Usage rules |
| --- | --- |
| Panel | Reuse `Panel.tsx`: title, description, action, children, className; do not add multiple nested panel wrappers |
| KPI | Reuse `StatCard.tsx`: label, value, description, tone; metrics have clear scopes and units |
| Button | Currently uses button elements + CSS classes; no shared Button component exists yet. Use `.button`, `.btnPrimary`, `.btnSecondary` as appropriate; do not import nonexistent components |
| Input/select/textarea | Always-visible labels; placeholders are examples only. Use existing controls, errors next to fields and `aria-invalid`/`aria-describedby` where appropriate |
| Table | Use semantic tables with th/td and a separate horizontal scroll area; clearly named actions; an empty state instead of a confusing blank table |
| Rule details | Reuse `ReadableConditions.tsx`; prioritize business explanations, with JSON only in an expandable technical section |
| Dialog/drawer | Reuse existing structure and `useDialogFocus`; title, initial focus, Tab trapping, Escape, focus restoration; keep content within the viewport |
| Toast | Use `ToastProvider`; report results only after actual success, and give guidance for errors |
| Menu/dropdown | Limit height and scroll internally; keyboard-operable, without hiding the last action; close on selection/menu dismissal |

Required states where applicable:

- **Default/hover:** keep dimensions stable; use control-hover/panel-hover without changing layout on hover.
- **Focus:** preserve the globals outline `2px solid var(--security-blue)`, offset 3px; do not remove it without an equivalent replacement.
- **Selected:** text and background indicate selection; add `aria-current`, `aria-selected` or the semantically appropriate attribute, rather than only changing color.
- **Disabled:** use the actual disabled attribute, with a visible reason when users need to know the next step. Opacity is not an authorization check.
- **Loading:** prevent duplicate submissions, keep labels understandable, and use aria-busy where appropriate. Do not create fake loading for synchronous local actions.
- **Error/empty/success:** distinguish system errors, no data and no filter results; provide appropriate actions without fabricating success.

Existing overlays use several z-index values; there is no unified overlay token system yet. Reuse the component's overlay layer and check menus/dialogs/toasts when open together; do not fix overlap by arbitrarily adding `z-index: 99999`. The dashboard already reduces animations/transitions for `prefers-reduced-motion: reduce`.

## 7. Code organization for team collaboration

README is the complete source for directory descriptions. Quick decision rules:

- Root URLs/layouts → `app`; screens and controls → `components`; sidebar/header shell → `layouts`.
- Menus and role home views → `routes`; do not create another router or `pages`.
- Shared state/providers → `context`; reusable React logic → `hooks`.
- Data types → `types`; pure processing/permission functions → `utils`; configuration and translations → `config`.
- Sample data → `data`; imported assets → `assets`; URL-accessible files → `public`.
- `services` still contains only `.gitkeep` until the team finalizes the API contract. Do not turn mocks into fake APIs.

No new package is needed for this documentation/standard. Use npm and the current package-lock; Node and package guidance is in README. The UI must remain understandable to SMEs; do not expose directory names, schemas or implementation details in business workflows.

## 8. Known differences and checklist

Some areas still have 8–10px labels/badges, 26–34px header controls, legacy 15/17px padding and 8px radius on some dialogs. CSS still contains 34px declarations overridden by `.root` near the end of the file. These are existing conditions to be aware of, not standards for new screens. No application-wide UI alignment was performed when writing this document.

Before handing off UI changes:

1. Check the changed area at 375px, 768px, desktop and in both themes; check the 900px/680px boundaries when changing layouts.
2. Check long Vietnamese text, 200% zoom, keyboard/focus, table scrolling, menus and dialogs.
3. Check empty/error/disabled/loading states and relevant roles/enterprise scopes.
4. Run `npm run check` and `npm run build` as required by AGENTS.md; they do not replace visual inspection.
5. State what was checked, what was not checked and remaining exceptions. Push a separate branch; the leader reviews/merges.
