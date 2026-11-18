# FraudGuard landing page

A Vietnamese landing page introducing FraudGuard and its abnormal transaction monitoring solution for SMEs, built with Next.js App Router, React, TypeScript and CSS Modules. The interactive experience uses sample data aligned with `../LCS`.

## Local development

```powershell
npm install
npm run dev
```

Open http://localhost:3001. Run the dashboard from `../LCS` with `node node_modules/next/dist/bin/next dev --port 3000` so the **Open demo** button leads to the existing dashboard.

Change the dashboard address with `NEXT_PUBLIC_FRAUDGUARD_DASHBOARD_URL` in `.env.local`, then restart or rebuild. The default is `http://localhost:3000/fraud-monitoring`. When deploying to hosting, configure the deployed dashboard URL.

```powershell
npm run build
npm start
```

Install dependencies independently with `npm ci` using the included package-lock.json. No external dependency junction is required.
## Content and interactions

- **Hero following the Base Workflow structure**: The left column contains a positioning label, a two-tone heading (dark navy + blue), primary/secondary CTAs and 3 core highlights; the right column is a product frame (`.productWindow`) with 4 workflow tabs (`1 Intake`, `2 Assignment`, `3 Investigation`, `4 Conclusion`) and a `01/04` status indicator. In step 1, users can select 3 sample transactions (`TX-83912`, `TXN-20260917-002`, `TXN-20260917-004`) to see the classification (`Abnormal`), detection source (`AI`, `RULE`, `RULE_FALLBACK`) and evidence.
- **01 / Risk operations architecture (`#tinh-nang`)**: A grid of 6 cards (`01` to `06`) briefly introduces the system's operational pillars without exposing transaction identifiers or internal data on the cards.
- **02 / Centralized case management (`#ho-so`)**: A Hub-and-Spoke layout places case `CASE-FG-1023` in the center, surrounded by 4 information cards (`01 Transaction data`, `02 Trigger evidence`, `03 Investigator report`, `04 Decision & Audit log`), controlled by 4 pill buttons, direct card clicks or the next-step button.
- **03 / Evaluation & fallback mechanism (`#co-che`)**: A 3-column diagram (`Input` -> `Selected engine` -> `Output`) with 3 evaluation-source buttons (`AI Detection`, `Dynamic Rule Engine`, `RULE_FALLBACK`).
- **04 / Access control & cross-role coordination (`#vai-tro`)**: A viewer for the 5 roles in the latest RBAC architecture (`Platform Admin`, `Implementation Staff`, `SME Admin`, `Operator`, `Investigator`), controlled directly through the 5 pill buttons above it.
- **05 / Usage plans (`#goi-su-dung`)**: A comparison of the 2 plans, `Free` (Dynamic Rule Engine) and `Subscription` (AI Detection + Fallback), according to the specification.
- **06 / Frequently asked questions (`#giai-dap`)**: Expandable answers (`.faqCard`), opened/closed with a mouse or keyboard; the mobile menu supports closing with `Escape`.

Sample data comes from the sample enterprises and transactions in `../LCS/src/data/fraudguard-enterprises.ts` and `../LCS/src/data/fraudguard-roles.ts`. This is a UI demo; it does not perform AI detection or ingest real transactions.

## Design decisions (R-31)

- **Color**: Preserve the light palette of `LCS_landingpage` (`--bg: #ffffff`, `--panel: #f5f7fa`, `--text: #152b43`, `--muted: #526377`, `--blue: #205b9e`, `--border: #d9e1e9`, `--green: #21694f`, `--orange: #955213`) combined with soft pastel backgrounds (`#dcebff`, `#dff4ec`, `#fcecd9`), as requested by the user.
- **Type**: Use locally stored `Inter` for crisp Vietnamese rendering in both large heading hierarchies and status/case identifier labels, without requiring a network connection at build time.
- **Layout**: Apply the layout rhythm of the Base Workflow product page (rounded floating navigation, a 2-column Hero with 4 workflow buttons, a 6-card grid with mini-UIs, a 3-column central case view and a 3-column evaluation diagram) to guide viewers from the overview through each step of case handling.
- **Space**: Alternate white and soft pastel backgrounds with generous section spacing to clearly separate business groups.
- **Cards**: Reuse the project's existing card classes (`.productWindow`, `.caseSheet`, `.storyPanel`, `.evidence`, `.sourceLabel`, `.finalCta`) to preserve the surface appearance and AA contrast.
- **Icons**: Use only 3 minimal SVG icons with clear meanings (`Shield` for identity, `Check` for evidence/completed items, `Arrow` for navigation and step changes).
- **Liveliness**: ENERGY 3 / RHYTHM 3 / MOTION 3; apply the motion system based on the LawShield reference, including:
  - **Reload Sequence**: The navigation slides down (`translateY(-16px) -> 0`), followed by a 5-step staggered Hero sequence (`cubic-bezier(0.22, 1, 0.36, 1)`) from the positioning label, `<h1>`, description and CTA/highlight group to the `.heroVisual` product frame (`translateY(36px) scale(0.985) -> 0`), with 2 gently floating pastel glows behind it (`@keyframes floatSlowA` & `floatSlowB`).
  - **6 scroll animation groups (Per-Element Scroll-Triggered Reveal across 31 `[data-reveal]` blocks)**:
    1. **Scroll-Morphing Navbar**: When `window.scrollY > 24`, `.headerInner` shrinks its `max-width` from `1240px` to `1080px` and deepens its shadow (`0.5s cubic-bezier(0.4, 0, 0.2, 1)`).
    2. **Section Header Blur-to-Clear Reveal (`.revealFadeBlur`)**: Each section heading (`.sectionNumber`, `<h2>`, `.centerSub`) changes from blurred (`opacity: 0; filter: blur(10px)`) to sharp with sequential delays (`0.02s`, `0.10s`, `0.20s`).
    3. **Staggered Cards & Pills Reveal**: Each feature card, pill group and the 5 role summary cards is individually observed by `IntersectionObserver`, so the animation starts as soon as the element enters the viewport and automatically replays when scrolling up and back down.
    4. **Outside-In Slide & Center Zoom (`.revealSlideLeft`, `.revealSlideRight`, `.revealZoomIn`, `.revealFadeUp`)**:
       - Left blocks (feature cards 01/04, `.hubColLeft`, `.detectColLeft`, `.roleIllustration`, `.planIntro`) move inward from beyond the left edge (`translateX(-96px) scale(0.94) + blur(6px) -> 0`).
       - Center blocks (cards 02/05, `.hubCenter`, `.engineBox`, `.faqCard`, `.finalCta`) zoom outward from the center or rise from below with a blur-to-clear effect (`scale(0.88) + blur(9px) -> scale(1) + blur(0)`).
       - Right blocks (feature cards 03/06, `.hubColRight`, `.detectColRight`, `.roleDescription`, `.planTableWrap`) move inward from beyond the right edge (`translateX(96px) scale(0.94) + blur(6px) -> 0`).
    5. **Internal Micro-UI Animations**: A light scan (`@keyframes scanlineGlow`) across the top of `.productWindow`, `.hubCenter` and `.detectionWindow`; `.miniRow` rows, `.stepperTrack`, `.miniPills` and FAQ questions (`details` alternating left/right slides) animate when the parent block is unlocked by `.isRevealed`.
    6. **Split Horizontal Footer Entrance**: When scrolling to the footer, `.footerLeft` enters from beyond the left edge (`translateX(-96px) -> 0`) and `.footerRight` from beyond the right edge (`translateX(96px) -> 0`).
  - All effects automatically turn off and content appears immediately when the operating system enables `prefers-reduced-motion: reduce`.

## Validation

`npm run build` checks compilation and TypeScript. The automated Playwright browser validation report (`node tmp/verify.cjs`) is recorded in `QA.md`.
