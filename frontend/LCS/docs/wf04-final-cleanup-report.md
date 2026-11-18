# Báo cáo bàn giao Dọn cuối UI WF-04

Ngày báo cáo: 18/11/2026  
Phạm vi: `D:\SME-FraudGuard\frontend\LCS` (tiếp nối sau `Phase 2C` của Codex theo `docs/antigravity-wf04-final-cleanup.md`: sửa thông báo sai ngữ cảnh trong `AlertCaseDrawer`, gỡ thanh ngữ cảnh demo và `LegacyCaseArchiveSection` khỏi UI vận hành chính, tách công cụ mẫu sang chế độ dev mặc định tắt, bảo toàn toàn bộ dữ liệu hiện có, giữ nguyên phần Codex đã làm và kiểm chứng hồi quy trên trình duyệt thật).  
Nhánh làm việc: `feat/FE-DashboardPage`.  
Nguyên tắc git & dịch vụ: giữ nguyên mọi thay đổi chưa commit của nhóm; không reset/restore/stash/commit/push; `src/services/` giữ nguyên chỉ có `.gitkeep`; không thêm npm dependency mới.

---

## 1. Danh sách file thay đổi

| Đường dẫn (`frontend/LCS/...`) | Đợt | Nội dung thay đổi chính |
|---|---|---|
| `src/config/translations.ts` | Wave 1 (UI) | Thêm cặp khóa đối xứng VI/EN `linkedCaseDrawerNotice` (`L861`/`L2002`) và `unlinkedAiDrawerNotice` (`L862`/`L2003`) dưới `wf04Phase2a.alertQueue`; cập nhật `legacyReadOnlyNotice` và `legacyCannotEditNotice` (`L806, L808`/`L1947, L1949`) bỏ chuỗi `"Phase 2A"`; cập nhật `emptyQueueActionHint` (`L909`/`L2050`) bỏ lời nhắc kịch bản demo. |
| `src/components/fraudguard-dashboard/AlertCaseDrawer.tsx` | Wave 1 (UI) | Giữ nguyên lớp chồng `styles.alertInspectionOverlay` (`L543`) và `styles.alertInspectionDrawer` (`L546`). Thay thông báo `legacyReadOnlyNotice` trong nhánh `linkedCase && canViewLinkedCase` bằng `t.wf04Phase2a.alertQueue.linkedCaseDrawerNotice` (`L785`), giữ nút `onOpenInvestigationCase` (`L816-826`), dùng `unlinkedAiDrawerNotice` cho AI Alert chưa liên kết (`L862`), giữ `legacyCannotEditNotice` cho bản ghi `legacyCaseArchive` (`L848, L851`) và tiếp tục khóa đóng/chỉnh sửa legacy (`wf04Managed={true}`). |
| `src/components/fraudguard-dashboard/AlertsView.tsx` | Wave 1 (UI) | Gỡ `enterpriseIneligibleContextText`, `showDemoContextBar` và banner `list.demoContextBar` khỏi UI vận hành chính (`L537-544`), đồng thời giữ tương thích prop tùy chọn và giữ nguyên kiểm tra `enterpriseEligibility` khi chọn hàng tạo case. |
| `src/components/fraudguard-dashboard/CasesView.tsx` | Wave 1 (UI) | Gỡ các nút demo (`addReviewSamplesBtn`, `restorePreviousBtn`, `loadDemoBtn`) khỏi `.pageHeading` (`L1318-1323`), gỡ `renderLegacyArchiveSection()`, cả 2 vị trí render mục `Hồ sơ lưu trữ cũ` và thẻ thống kê legacy của `SME Admin`; giữ nguyên `CaseDetailModal`, `CaseReportWorkflowPanel`, `ReportFeedbackModal` (`L1275-1285`) và bộ đếm `1` dòng/hồ sơ. |
| `src/components/fraudguard-dashboard/ReportsView.tsx` | Wave 1 (UI) | Gỡ `legacySection` và thẻ KPI lưu trữ cũ của `SME Admin`, giữ nguyên báo cáo đã xác nhận / nội bộ, `ReportFeedbackModal` (`L1005-1015`), đếm theo số hồ sơ + phiên bản báo cáo và xuất CSV. |
| `src/components/fraudguard-dashboard/FraudGuardDashboard.tsx` | Wave 1 (UI) | Gỡ banner `showMigrationNotice`, ngừng truyền props demo xuống `<AlertsView />` và `<CasesView />`; bổ sung cơ chế dev-only mặc định tắt `devSampleToolsEnabled` (`L163`, kích hoạt khi `?wf04Dev=1` hoặc `localStorage.getItem("fg_wf04_dev_tools") === "1"` tại `L594-605`, hiển thị vùng `data-testid="wf04-dev-sample-tools"` tại `L1780-1825`) và `window.__fgWf04DevTools` (`L84-94, L607-616`) kèm dọn dẹp khi unmount. |
| `tests/wf04-phase2a.test.cjs` | Wave 2 (Test) | Cập nhật `Scenario 8` (`AlertsView`/`CasesView` cho `operator` không render banner/nút demo hay `legacyArchiveTitle`; `AlertCaseDrawer` hiển thị `linkedCaseDrawerNotice` cho `CASE-WF04-QUEUE-2ALERTS` và `legacyCannotEditNotice` không chứa `Phase 2A` cho `CS-LEGACY-DRAWER-04`), giữ nguyên toàn bộ test migration (`Scenario 6`), storage/recovery, hết hạn gói và RBAC. |
| `tests/wf04-phase2b.test.cjs` | Wave 2 (Test) | Cập nhật `Section 8.9` xác nhận `ReportsView` và `CasesView` cho `operator` không còn `legacyArchiveTitle` hay `CS-LEGACY-2B-RO`, trong khi giữ đếm `1` case / `v2 (2)` phiên bản và giữ chế độ chỉ đọc của `AlertCaseDrawer` đối với `CS-LEGACY-2B-RO` (`legacyCannotEditNotice`). |
| `tests/wf04-phase2c.test.cjs` | Wave 2 (Test) | Bổ sung regression test sau dọn UI xác nhận mở `AlertCaseDrawer` từ `CasesView` giữ lớp `alertInspectionOverlay`/`alertInspectionDrawer` và `linkedCaseDrawerNotice` (không chứa `Phase 2A`) mà không làm mất hay gửi nháp `CaseReportWorkflowPanel`, cùng xác nhận `restoreWorkspaceSnapshot`, `applyWf04DemoWorkspace`, `restorePreDemoWorkspace` bảo toàn case, báo cáo, kết luận, `reportFeedbacks`, `legacyCaseArchive`, `preDemoSnapshot` và CSS class hợp lệ. |
| `docs/wf04-sample-data.md` | Wave 4 (Docs) | Viết lại hướng dẫn truy cập dữ liệu mẫu WF-04 theo đường dev-only mặc định tắt (`?wf04Dev=1`, `localStorage.setItem("fg_wf04_dev_tools", "1")`, `window.__fgWf04DevTools`) và giữ nguyên bảng tài khoản/hồ sơ `CASE-SAMPLE-*`. |
| `docs/wf04-final-cleanup-report.md` | Wave 4 (Docs) | Báo cáo bàn giao mới cho đợt dọn cuối UI WF-04 để người dùng review. |
| `docs/task.md` | Wave 4 (Docs) | Cập nhật `Checklist dọn cuối WF-04`, đối soát lại các mục ghi `"Sau Phase 2B / Mục 7.1"` đã hoàn tất ở frontend trong Phase 2C + dọn UI (tách khỏi phần chờ BE/AI hoặc WF-01..WF-03), và bổ sung mốc `18/11/2026` ở Mục 11. |

**Vùng giữ nguyên phần Codex đã hoàn thành (không triển khai lại):**
- Toàn bộ luồng `Phase 2C` gửi feedback của `SME Admin` và màn hình tiếp nhận của `Platform Admin` (`src/types/report-feedback.ts`, `src/utils/report-feedback.ts`, `ReportFeedbackModal.tsx`, `PlatformHealthView.tsx`, `useInvestigationCases.ts`, `workspace-storage.ts`, `platform-summary.ts`, `enterprise.ts`, `notification-feed.ts`, `export-csv.ts`).
- Bộ hồ sơ mẫu `CASE-SAMPLE-CLOSED`, `CASE-SAMPLE-REVIEW`, `CASE-SAMPLE-WORKING` cùng 4 cảnh báo `ALT-WF04-REVIEW-1..4` trong `src/data/wf04-demo.ts`.
- Cơ chế chồng lớp drawer trên case modal: `.alertInspectionOverlay` (`z-index: 52`, `SecurityDashboard.module.css:1251`) và `.alertInspectionDrawer` (`z-index: 53`, `SecurityDashboard.module.css:1255`) nằm trên `.builderOverlay` (`z-index: 50`, `L1566`) và `.builderModal` (`z-index: 51`, `L1577`).
- Giữ Case modal mounted cùng `useDialogFocus` (`CasesView.tsx:440`, `AlertCaseDrawer.tsx:187`) và render `<AlertCaseDrawer />` sau `<main>` trong `FraudGuardDashboard.tsx:1830-1848` để giữ nguyên nháp chưa gửi khi mở cảnh báo.
- Giữ nguyên giao diện tải nền trắng `#ffffff` của `src/app/fraud-monitoring/loading.tsx` (`L1-76`).

---

## 2. Chi tiết thay đổi UI và Truy cập công cụ mẫu dev-only

### 2.1. Sửa thông báo sai ngữ cảnh trong `AlertCaseDrawer`
- Với case WF-04 hợp lệ (`linkedCase && canViewLinkedCase`), drawer bỏ hoàn toàn thông báo hồ sơ cũ Phase 2A và hiển thị `t.wf04Phase2a.alertQueue.linkedCaseDrawerNotice` (`"Xem và xử lý hồ sơ tại chi tiết hồ sơ."` / `"View and manage this case in the case details view."`), giữ nguyên nút `Mở hồ sơ` (`viewCaseBtn`) khi có quyền xem.
- Với AI Alert chưa gắn case trong chế độ `isWf04Locked`, drawer hiển thị `t.wf04Phase2a.alertQueue.unlinkedAiDrawerNotice` hướng dẫn chọn cảnh báo tại Hàng đợi cảnh báo.
- Với bản ghi thực sự thuộc `legacyCaseArchive` (`linkedLegacyEntry`), giữ chế độ chỉ đọc và thông báo `legacyCannotEditNotice` đã loại bỏ chuỗi `"Phase 2A"`. Quét toàn bộ `src/components/` và `src/config/translations.ts` cho thấy `0` lần xuất hiện `"Phase 2A"`.

### 2.2. Gỡ UI tạm khỏi màn hình vận hành & Tách truy cập mẫu dev-only
- `AlertsView`, `CasesView`, `ReportsView` và `FraudGuardDashboard` mặc định không hiển thị `Kịch bản mẫu WF-04`, nút nạp/bổ sung/khôi phục mẫu, `LegacyCaseArchiveSection` (cả bảng lẫn KPI card legacy) hay banner `showMigrationNotice`.
- Không tự nạp mẫu khi mount hoặc reload (`0` auto-load).
- Công cụ mẫu chỉ bật khi developer/tester chủ động kích hoạt một trong hai đường trong `FraudGuardDashboard.tsx`:
  - URL query `/fraud-monitoring?wf04Dev=1` hoặc `localStorage.setItem("fg_wf04_dev_tools", "1")` + reload -> hiện thanh `data-testid="wf04-dev-sample-tools"` với nút `Mở kịch bản demo WF-04` / `Bổ sung hồ sơ mẫu` / `Khôi phục dữ liệu trước demo`.
  - Hoặc gọi console `window.__fgWf04DevTools.loadSampleData()` / `restorePreDemo()` / `isDemoActive()`. Xem hướng dẫn chi tiết tại [wf04-sample-data.md](file:///D:/SME-FraudGuard/frontend/LCS/docs/wf04-sample-data.md).

---

## 3. Chính sách bảo toàn dữ liệu và Các phần legacy còn giữ lại

- **Bảo toàn dữ liệu & không xóa `localStorage`:** Đợt dọn UI không chạy migration cưỡng bức, không reset workspace, không xóa `localStorage` và không sửa timestamp. Toàn bộ `legacyCaseArchive`, case đang xử lý và đã `Closed`, lịch sử phiên bản báo cáo, kết luận xác nhận, kết quả riêng từng alert, `reportFeedbacks`, `preDemoSnapshot`, `recoveryJournal` (`WORKSPACE_RECOVERY_JOURNAL_KEY_V4`) và `migrationMeta` được giữ nguyên vẹn.
- **Các caller `CaseStatus` / `src/utils/case-workflow.ts` / `TransactionRisk.caseStatus` / `legacyCaseArchive` còn lại (có chủ đích):**

| Thành phần | Caller / Phạm vi còn phụ thuộc | Lý do giữ lại |
|---|---|---|
| `src/utils/case-workflow.ts` | `AlertCaseDrawer.tsx:4` (`isCaseAssignee`, vô hiệu khi `isWf04Locked`), `tests/rule-sandbox.test.cjs` (`L57, L348`) | Bảo toàn bộ test hợp đồng/sandbox cũ và fallback khi không bật `wf04Managed`. |
| Schema & fixture nền | `src/types/fraudguard.ts` (`L4, L30, L67, L83`), `src/data/fraudguard-transactions.ts` (13 seed), `src/data/wf04-demo.ts` (3 tham chiếu archive/snapshot) | Đầu vào tương thích schema cũ và kịch bản kiểm thử migration. |
| Migration, storage & domain guard | `src/utils/case-migration.ts`, `src/utils/workspace-storage.ts`, `src/utils/investigation-case.ts` (`L857`) | Đọc/nâng cấp có kiểm soát dữ liệu v2/v3 -> v4, chặn tạo case trùng với `caseId`/`caseStatus` cũ và kiểm định `legacyCaseArchive`. |
| Scope, export & permission guard | `src/utils/enterprise.ts`, `src/utils/export-csv.ts`, `src/utils/notification-feed.ts`, `src/utils/permissions.ts` | Giữ rào đọc, busy-member và export trên `legacyCaseArchive` / giao dịch cũ khi chưa có `InvestigationCase` thay thế. |
| Tương thích UI/layout | `AlertCaseDrawer.tsx`, `AlertsView.tsx`, `ReportsView.tsx`, `FraudGuardDashboard.tsx`, `DashboardToolbar.tsx`, `TransactionRiskTable.tsx`, `NotificationCenter.tsx`, `ProductHeader.tsx`, `RuleDetailDrawer.tsx`, `CasesView.tsx` (prop type), `translations.ts` | Giữ lọc/badge/drawer fallback tương thích ngược (`AlertCaseDrawer` vẫn bị khóa ghi legacy bởi `wf04Managed={true}` trong dashboard). Chỉ nên gỡ triệt để khi dừng hẳn hỗ trợ đọc hồ sơ legacy trên toàn ứng dụng. |

---

## 4. Kết quả kiểm tra tự động, Build và Trình duyệt

### 4.1. `npm run check` và `npm run build` (trên toàn bộ code và test sau dọn UI, trước khi hoàn tất 3 file tài liệu)
Theo xác minh tuần tự của `@verifier` (`#152` và `#155`) và `@tester` (`#150`) tại `D:\SME-FraudGuard\frontend\LCS`:
- **`npm run check`**: thoát `0`
  - `eslint src --max-warnings=0`: `0` lỗi, `0` cảnh báo.
  - `next typegen && tsc --noEmit` (`Route types generated successfully`): `0` lỗi TypeScript.
  - `node --test tests/*.test.cjs`: **`158/158` đạt** qua 8 tệp kiểm thử (`enterprise-lifecycle.test.cjs`: 11; `investigation-case.test.cjs`: 17; `rule-sandbox.test.cjs`: 83; `wf04-phase2a.test.cjs`: 9; `wf04-phase2a-fixes.test.cjs`: 9; `wf04-phase2a-recovery.test.cjs`: 7; `wf04-phase2b.test.cjs`: 11; `wf04-phase2c.test.cjs`: 11), `fail: 0`, `cancelled: 0`, `skipped: 0`, `todo: 0` (`38537.8244ms`).
- **`npm run build`** (chạy độc lập sau khi tắt `next dev` dùng chung `.next`): thoát `0`, `Next.js 15.5.25`, **`Compiled successfully in 7.0s`**, `Generating static pages (6/6)` (`/`, `/_not-found`, `/fraud-monitoring`, `/login`).
- Lưu ý trình tự bàn giao: sau khi hoàn tất 3 tệp tài liệu Wave 4 (`wf04-sample-data.md`, `wf04-final-cleanup-report.md`, `task.md`), `@verifier` chạy kiểm tra hậu tài liệu cho `npm run check` và `npm run build` để chốt phiên bản cuối.

### 4.2. Kiểm thử trực tiếp trên trình duyệt production (`http://localhost:3008/fraud-monitoring`)
Phiên trình duyệt ghi nhận `0` console errors và `0` page errors trên bản production build. Ảnh minh họa nằm trong `C:\Users\gmt\.gemini\antigravity\brain\9c1e3c48-4c93-4a4f-8de7-6024a57c1254\browser_sandbox\screenshots\`:

- **Giao diện vận hành mặc định sạch của Operator:** không có thanh demo, nút mẫu, `LegacyCaseArchiveSection` hay banner migration (`step_10_shot_1_scenario1_operator_alerts.png`, `step_10_shot_2_scenario1_operator_cases.png`, `step_10_shot_3_scenario1_operator_reports.png`).
- **Truy cập mẫu qua `?wf04Dev=1` & kiểm tra drawer chồng trên case modal:** nạp mẫu (`CASE-SAMPLE-*`, `CASE-WF04-EXP-01`), reload trên URL sạch vẫn giữ dữ liệu trong workspace; mở `CASE-WF04-0005` -> xem Alert #1 và Alert #2 mở `AlertCaseDrawer` nằm trên modal (`step_41_shot_1.png`), hiện đúng `linkedCaseDrawerNotice` (không có chuỗi `Phase 2A`), `Tab`/`Shift+Tab` giữ focus trong drawer, `Escape` và nút đóng đều trả focus về `"Xem cảnh báo"`, giữ nguyên nháp chưa gửi và modal vẫn cuộn bình thường.
- **Vòng đời báo cáo & nhánh Operator tự điều tra:** `CASE-WF04-0005` đi đủ `v1 -> request revision -> v2 -> Closed`, `CASE-WF04-0006` hoàn tất nhánh `Operator` tự điều tra 2 bước tách biệt -> `Closed` (`step_71_shot_1.png`).
- **Phase 2C Feedback & Cô lập tenant / hết hạn gói:** đóng case không tự tạo feedback (`0` feedback trước khi gửi); `SME Admin` hủy bỏ nháp rồi xác nhận gửi -> `page.reload()` -> `Platform Admin` thấy đúng 1 bản ghi đọc chi tiết 1:1 (`step_90_shot_1_platform-admin-feedback-detail.png`); `North Branch Utilities` SME Admin không thấy hồ sơ `Campus PowerGrid SME`; `Dormitory Grid Archive` hết hạn tiếp tục hoàn tất `CASE-WF04-EXP-01` trong khi chặn tạo case mới.
- **Responsive VI/EN, Light/Dark (`1440x900`, `768x1024`, `375x812`):** kiểm chứng layout Case + Drawer và màn hình PlatformHealth feedback detail tại `step_106_shot_1_resp-1440-en-light-case-drawer.png`, `step_106_shot_2_resp-768-en-dark-case-drawer.png`, `step_106_shot_3_resp-375-en-dark-case-drawer.png`, `step_106_shot_4_resp-375-en-light-case-drawer.png`, `step_114_shot_1_ph_1440_en_light.png`, `step_114_shot_2_ph_768_en_dark.png`, `step_114_shot_3_ph_375_en_dark.png`, `step_116_shot_1_ph_375_vi_light.png`, `step_122_shot_1_verify_375_vi_light.png`.

### 4.3. Giới hạn kiểm thử đã ghi nhận trung thực
- Môi trường `webview_browser` chặn `page.evaluate`, vì vậy lời gọi console `window.__fgWf04DevTools`, khóa `localStorage.fg_wf04_dev_tools` trực tiếp bằng JS console và giá trị `getComputedStyle(...).zIndex` dạng số thực được xác minh qua mã nguồn, test Node VM/React và SSR thay vì eval JS trực tiếp trên trình duyệt.
- Khi Case modal hoặc Drawer đang mở, lớp phủ backdrop chủ đích chặn click chuột vào `RoleSwitcher` (nên kịch bản chuyển vai trò được kiểm chứng sau khi đóng modal đúng luồng sử dụng).
- Kiểm thử responsive tập trung vào tổ hợp Case modal + `AlertCaseDrawer` và màn hình chi tiết feedback của `PlatformHealthView`, chưa quét toàn bộ mọi hoán vị màn hình khác của dashboard.

---

## 5. Điểm dừng bàn giao và Các hạng mục còn mở

- **Điểm dừng:** Toàn bộ phần giao diện frontend của WF-04 (Phase 1, 2A, 2B, Loading UI, Phase 2C feedback, đợt Dọn cuối UI và bản sửa giới hạn công cụ dữ liệu mẫu ngày 18/11/2026) dừng tại đây để người dùng review; không tự chuyển sang triển khai quy trình khác.
- **Các hạng mục còn mở ngoài phạm vi đợt dọn UI:**
  1. Thống nhất và tích hợp API contract với BE/AI (`src/services/` hiện chỉ giữ `.gitkeep`).
  2. Quy ước ánh xạ kết quả văn bản của từng alert sang nhãn đánh giá AI cụ thể với đội AI.
  3. Hoàn thiện phần giao diện / E2E cho các workflow còn lại (`WF-01`, `WF-02`, `WF-03`) khi người dùng triển khai tiếp.
  4. Dọn bỏ các type/helper `CaseStatus`, `src/utils/case-workflow.ts` và fallback đọc `legacyCaseArchive` khi dự án ngừng hoàn toàn nhu cầu đọc dữ liệu legacy cũ.

---

## 6. Đợt sửa review fix: Giới hạn môi trường cho công cụ dữ liệu mẫu (`docs/antigravity-wf04-dev-tools-fix.md`)

### 6.1. Điều kiện kích hoạt thực tế & File sửa đổi
- **Điều kiện hai lớp thống nhất (cả UI bar lẫn `window.__fgWf04DevTools`):**
  1. Môi trường cho phép (`isWf04DevToolsEnvironmentAllowed`): `NODE_ENV === "development"` hoặc biến build-time `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS === "true"` (đọc tĩnh `process.env.*` và có `try/catch` an toàn). Bản `npm run build` production mặc định không đặt cờ này nên luôn trả `false`.
  2. Yêu cầu bật rõ ràng (`isWf04DevToolsExplicitlyRequested`): `?wf04Dev=1` hoặc `localStorage.getItem("fg_wf04_dev_tools") === "1"` (nếu đọc `localStorage` ném lỗi thì không crash và an toàn suy về `false` / query).
- **Quản lý vòng đời helper & chống tham chiếu cũ:** `syncWf04DevToolsWindowBinding` chỉ gán `window.__fgWf04DevTools` khi `devSampleToolsEnabled === true`, xóa ngay khi tắt hoặc unmount và khóa closure `active = false`; đồng thời `handleLoadWf04Demo` và `handleRestorePreDemo` trong `FraudGuardDashboard.tsx` kiểm tra lại `devSampleToolsActiveRef.current && isBrowserWf04DevToolsActive()` trước khi ghi dữ liệu. Không tự nạp/khôi phục khi mount/reload; tắt công cụ giữ nguyên case/report/feedback/`preDemoSnapshot`.
- **File cập nhật trong đợt review fix:**
  - `src/data/wf04-demo.ts`: thêm `WF04_DEV_TOOLS_QUERY_PARAM`, `WF04_DEV_TOOLS_STORAGE_KEY`, `FraudGuardWf04DevTools`, `isWf04DevToolsEnvironmentAllowed`, `isWf04DevToolsExplicitlyRequested`, `resolveWf04DevToolsEnabled`, `syncWf04DevToolsWindowBinding`.
  - `src/components/fraudguard-dashboard/FraudGuardDashboard.tsx`: thêm `isBrowserWf04DevToolsActive`, `devSampleToolsActiveRef`, cổng bảo vệ đầu `handleLoadWf04Demo`/`handleRestorePreDemo` và đồng bộ hiệu ứng `devSampleToolsEnabled` + `syncWf04DevToolsWindowBinding`.
  - `tests/wf04-phase2c.test.cjs`: bổ sung test hành vi `WF-04 dev sample tools gate...` kiểm chứng cả pure helpers lẫn vòng đời mount/effect/unmount thật của `FraudGuardDashboard.tsx` qua 4 bối cảnh (`production` mặc định + opt-in, `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS=true` chưa opt-in, `development` lỗi `localStorage.getItem`, `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS=true` + opt-in -> nạp thủ công -> unmount gỡ helper và vô hiệu tham chiếu cũ).
  - `docs/wf04-sample-data.md`, `docs/wf04-final-cleanup-report.md`, `docs/task.md`.

### 6.2. Kết quả kiểm thử, Build và Trình duyệt cho bản sửa giới hạn
- **`npm run check`** (trước sửa docs, sau hoàn tất code/test): thoát `0` (`eslint src --max-warnings=0`: 0 cảnh báo; `next typegen && tsc --noEmit`: 0 lỗi; `node --test tests/*.test.cjs`: **`159/159` pass**, `0` fail, `0` skipped, `66569.7373ms`).
- **Browser Check A trên bản build kiểm thử (`NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS=true`, `npm run build` 14.8s, `6/6` trang tĩnh, phục vụ tại `http://localhost:3008`):**
  - `/fraud-monitoring` (không query): `[data-testid="wf04-dev-sample-tools"]` count = `0`, `0` case mẫu tự nạp (`step_8_shot_1.png`).
  - `/fraud-monitoring?wf04Dev=1`: `[data-testid="wf04-dev-sample-tools"]` count = `1`, trước khi bấm vẫn `0` case (`step_16_shot_1.png`); sau thao tác mở & nạp mẫu xuất hiện `CASE-SAMPLE-WORKING`, `CASE-SAMPLE-REVIEW`, `CASE-SAMPLE-CLOSED`, `CASE-WF04-EXP-01` (`step_24_shot_1.png`).
  - Quay về `/fraud-monitoring` sạch: `[data-testid="wf04-dev-sample-tools"]` count = `0`, 3 case mẫu đã nạp của Campus vẫn được bảo toàn (`step_30_shot_1.png`), `0` consoleErrors / pageErrors. Đã dừng server tạm ngay sau kiểm thử.
- **Browser Check B trên bản build production mặc định (không đặt `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS`, `npm run build` 17.8s, `6/6` trang tĩnh, phục vụ tại `http://localhost:3008`):**
  - Mở `/fraud-monitoring?wf04Dev=1`: `[data-testid="wf04-dev-sample-tools"]` count = **`0`** trên mọi vai trò/màn hình kiểm tra (`Nguyễn Minh Hà`, `Đặng Tuấn Kiệt`, `Lê Minh Quân`), không hiển thị `Kịch bản mẫu WF-04` hay nút mẫu (`step_36_shot_1.png`, `step_38_shot_1.png`, `step_45_shot_2_quan_queue_viewport.png`), không thêm bản ghi trùng và giữ nguyên 3 case đã lưu trước đó; `0` consoleErrors (`0` lỗi HUD/network). Đã dừng server ngay sau kiểm thử.
- **Ảnh chụp mới xác nhận trên đĩa (`C:\Users\gmt\.gemini\antigravity\brain\7ab570a6-5a32-4e4e-a7b4-592d142ea5dc\browser_sandbox\screenshots\`):** `step_8_shot_1.png`, `step_16_shot_1.png`, `step_24_shot_1.png`, `step_30_shot_1.png`, `step_36_shot_1.png`, `step_38_shot_1.png`, `step_43_shot_1_quan_alerts.png`, `step_45_shot_1_quan_queue_full.png`, `step_45_shot_2_quan_queue_viewport.png`, cùng ảnh host `final_step_45.png`.
- **Giới hạn ghi nhận trung thực:** Do `webview_browser` chặn `page.evaluate` / truy cập `localStorage` trực tiếp, điều kiện `localStorage.getItem("fg_wf04_dev_tools") === "1"`, lỗi đọc storage (`throw SecurityError`), vòng đời gán/gỡ `window.__fgWf04DevTools` khi unmount và vô hiệu hóa callback tham chiếu cũ được kiểm chứng bằng test hành vi tự động trên `FraudGuardDashboard.tsx` (`tests/wf04-phase2c.test.cjs` test #12), còn hai bản build trên trình duyệt kiểm chứng qua URL `/fraud-monitoring` và `/fraud-monitoring?wf04Dev=1`. Bản build cuối cùng để lại trên `.next` là bản production mặc định **không bật** `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS`.
