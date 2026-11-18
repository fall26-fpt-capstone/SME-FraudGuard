# FraudGuard landing page validation

Validation date: 23/10/2026. The current version restructures the layout in the style of the Base Workflow product page, adds pastel backgrounds, click transitions, the full Reload Sequence and 6 Scroll-Triggered Animation groups (1–6) based on the LawShield reference, and standardizes terminology across the system (fully removing the terms `risk score` / `AI scoring` / scoring in Vietnamese, using direct classification `Abnormal / Normal / Undetermined`, `AI Detection`, `Dynamic Rule Engine`, `RULE_FALLBACK`).

## Execution results

| Check | Result | Evidence |
|---|---|---|
| Production build and TypeScript | PASS | `npm run build` completed with exit code 0; the home page was statically prerendered. |
| No em dashes or obsolete terminology | PASS | All visible text (`document.body.innerText`) was checked for absence of `—`, `scoring`, `risk score` and the Vietnamese term for scoring. |
| Responsive (R-03) | PASS | No horizontal overflow at 11 widths: 320, 360, 390, 540, 700, 768, 900, 1024, 1280, 1440, 1920px. |
| Hero sample transactions | PASS | All 3 transactions (`TX-83912`, `TXN-20260917-002`, `TXN-20260917-004`) were clicked; the `Abnormal` result, evidence and `AI` / `RULE_FALLBACK` / `RULE` source labels updated correctly. |
| Hero workflow steps | PASS | All 4 step tabs (`1 Intake`, `2 Assignment`, `3 Investigation`, `4 Conclusion`) and the next button were clicked; the status indicator updated from `01/04` to `04/04`. |
| Central case view (Hub) | PASS | All 4 pill buttons and the next-step/return-to-start buttons were clicked; the `Open -> Assigned -> Reported -> Confirmed Fraud` state and highlighted satellite cards matched each step. |
| 3-column evaluation source (`#co-che`) | PASS | All 3 options (`AI`, `RULE`, `RULE_FALLBACK`) were clicked; the center column updated its pastel background, title, description and corresponding output signal. |
| 5-role access control (RBAC) | PASS | All 5 pills on the role switcher (`Platform Admin`, `Implementation Staff`, `SME Admin`, `Operator`, `Investigator`) were clicked; the illustration and task list updated correctly. |
| Frequently asked questions (FAQ) | PASS | All 4 questions were opened by mouse click and closed with `Enter`. |
| In-page navigation | PASS | Every anchor link (`#tinh-nang`, `#ho-so`, `#co-che`, `#vai-tro`, `#goi-su-dung`, `#giai-dap`, `#main`) had a unique target and navigated correctly. |
| Open-demo links | PASS | 4 CTA links correctly pointed to `http://localhost:3000/fraud-monitoring`. |
| Mobile menu | PASS | Opened/closed at viewport 390x844, closed automatically after a navigation selection and closed with `Escape`. |
| Keyboard & Focus | PASS | The skip link worked; `Space` selected a transaction; the focus outline was clearly visible. |
| 200% zoom | PASS | Checked an effective viewport of 390px with `deviceScaleFactor: 2`; no horizontal overflow. |
| Reload & scroll effects (1–6) | PASS | Checked the navigation shrinking on scroll (`1240px` -> `1080px` when `scrollY > 24`), 8/8 `[data-scroll-section]` regions and 31/31 individual `[data-reveal]` blocks triggering outside-in (`slide-left`, `slide-right`) and blur-to-clear (`fade-blur`, `zoom-in`, `fade-up`) animations on scroll without horizontal overflow. |
| Text contrast (WCAG AA) | PASS | Computed luminance from CSS for 323 visible text elements on light/pastel backgrounds; 0 elements violated AA thresholds (4.5:1 for normal text, 3:1 for large text). |
| Browser console | PASS | No console errors or uncaught JavaScript errors on the landing page. |
| Visual inspection | PASS | Captured and directly inspected `tmp/desktop-hero.png`, `tmp/story.png`, `tmp/desktop-final.png`, `tmp/mobile-hero.png`, `tmp/mobile-final.png`. |

## Antislop Delivery Gate

### Hard Gate

- R-02 PASS: No em dash (`—`) in interface text.
- R-03 PASS: Checked 11 widths from 320px to 1920px; no horizontal overflow.
- R-17 PASS: All transactions, case identifiers and enterprises (`ABC Fashion`, `TechPay`, `EduLearn`) were clearly labeled as sample data.
- R-18 PASS: No fabricated testimonials, customer names or partner logos.
- R-23 PASS: Base Workflow-style layout combined with the light/pastel palette and card CSS of `LCS_landingpage`, as requested by the user.
- R-24 PASS: All navigation links led to actual page sections.
- R-25 PASS: 323 visible text elements met WCAG AA contrast requirements.
- R-26 PASS: Every button, transition tab, role pill and FAQ item had actual behavior and was checked by automated click-through.
- R-27 PASS: Static sample data was already present on the page; no fake AI processing states were created.
- R-28 PASS: FAQ content followed `Abnormal / Normal / Undetermined` classification, 5-role access control and the `RULE_FALLBACK` mechanism.
- R-32 PASS: Semantic HTML elements (`button`, `a`, `details`, `summary`, `table`), full support for `Tab`, `Enter`, `Space`, `Escape` and a skip link.
- R-33 PASS: Updated `Landing.tsx` and `landing.module.css` source code directly.
- R-34 PASS: Preserved the fixed light/pastel palette requested by the user.
- R-35 PASS: Ran `npm run build`, restarted the server on port 3001, ran `node tmp/verify.cjs` in a real browser and inspected screenshots.
- R-36 PASS: No unsourced performance promises or security certifications were added.
- R-37 PASS: The user approved the design and content before implementation.
- R-38 PASS: Clearly stated the demo's scope and use of project sample data.

### Purpose Gate & Quality Locks

- R-01, R-04, R-06, R-07, R-08, R-09, R-10, R-11, R-12, R-13, R-14, R-15, R-16, R-19, R-20, R-21, R-22, R-29, R-30, R-31 PASS: Design rationale for each item was documented in `README.md`.
