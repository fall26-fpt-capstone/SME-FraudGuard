# Báo cáo triển khai WF-04 Phase 2B và Giao diện Loading

Ngày báo cáo: 16/11/2026  
Phạm vi: `frontend/LCS` (nối trọn vòng đời báo cáo, yêu cầu bổ sung, xác nhận và đóng hồ sơ của WF-04 Phase 1 vào giao diện, hook, quyền đọc/ghi và thông báo; đồng thời thiết kế lại màn hình tải `src/app/fraud-monitoring/loading.tsx` nền trắng giữ nguyên dark mode của dashboard; dừng để review trước khi làm luồng SME Admin gửi feedback hoặc bước dọn cuối WF-04).  
Nhánh làm việc: `feat/FE-DashboardPage`.  
Hiện trạng git (`D:\SME-FraudGuard`): bảo toàn nguyên vẹn toàn bộ thay đổi có sẵn trên nhánh làm việc (hiện có `41` đường dẫn `M` gồm thêm `src/app/fraud-monitoring/loading.tsx`, và `35` đường dẫn `??` gồm thêm `docs/antigravity-wf04-phase2b.md`, `CaseReportWorkflowPanel.tsx`, `tests/wf04-phase2b.test.cjs` và `docs/wf04-phase2b-report.md`, trong khi `docs/task.md` vốn là untracked); `src/services/` giữ nguyên chỉ có `.gitkeep`; không thêm npm dependency mới.

---

## 1. Danh sách file thay đổi và Vùng giữ nguyên

### 1.1. Danh sách file tạo mới và cập nhật trong Phase 2B & Loading UI

| Đường dẫn (`frontend/LCS/...`) | Hành động | Mục đích & Phạm vi |
|---|---|---|
| `src/types/fraudguard.ts` | Cập nhật | Bổ sung `"REPORT_SUBMITTED"`, `"REVISION_REQUESTED"`, `"REPORT_CONFIRMED_AND_CLOSED"` vào `InvestigationAuditAction` (tự động mở rộng `AuditAction` và `ExtendedAuditAction`). |
| `src/hooks/useInvestigationCases.ts` | Cập nhật | Bổ sung 3 tham số đầu vào (`SubmitInvestigationReportCommandArgs`, `RequestInvestigationRevisionCommandArgs`, `ConfirmInvestigationReportCommandArgs`), 3 pure command executors (`executeSubmitInvestigationReportAction`, `executeRequestInvestigationRevisionAction`, `executeConfirmInvestigationCaseReportAction`), và 3 phương thức trên `useInvestigationCases` (`submitReport`, `requestRevision`, `confirmAndCloseReport`). Giữ nguyên `latestCasesRef`, đồng hồ truyền nguyên instant và cơ chế `persistUsersWithWorkspace: true` / `retryPersist` / `committed` & `cleanupPending`. |
| `src/utils/enterprise.ts` | Cập nhật | Bổ sung 3 hành động mới vào `INTERNAL_CASE_AUDIT_ACTIONS` và thêm `SME_HIDDEN_INTERNAL_WORKFLOW_ACTIONS` (`"REPORT_SUBMITTED"`, `"REVISION_REQUESTED"`) trong `auditForUser`: ẩn hoàn toàn log điều tra nội bộ khỏi `Platform Admin`, `Implementation Staff`, `Investigator`, `Viewer` và tenant khác; `SME Admin` chỉ xem được `REPORT_CONFIRMED_AND_CLOSED` (và kết thúc hợp lệ) của hồ sơ đã `Closed` có cặp `(reportId, version)` khớp trong `reports`, tuyệt đối không thấy log bản nháp hay lý do yêu cầu bổ sung. |
| `src/utils/notification-feed.ts` | Cập nhật | Mở rộng `buildCaseNotifications`: thông báo `Pending Review` ("Đã gửi báo cáo v{n} chờ duyệt" -> `Operator` cùng tenant & `Investigator` được giao), `Investigating` sau `REVISION_REQUESTED` ("Yêu cầu bổ sung báo cáo điều tra" -> `Investigator` được giao & `Operator` cùng tenant), và `Closed` ("Đã xác nhận báo cáo v{n} và đóng hồ sơ" -> `Operator`, `SME Admin` và `Investigator` được giao), chặn mọi rò rỉ tới PA/Staff/Viewer/Investigator khác. |
| `src/utils/permissions.ts`, `src/utils/platform-summary.ts`, `src/utils/export-csv.ts` | Cập nhật | Bảo đảm `canSaveMember` chặn đổi vai trò thành viên giữ case `Investigating` (kể cả sau khi bị trả về bổ sung) hoặc `Pending Review` và cho phép sau `Closed`; `platformSummary(..., { wf04Managed: true })` tiếp tục trả `feedback: []`; `export-csv.ts` xác thực `conclusion` khớp `(reportId, reportVersion)` và chỉ cho `SME Admin` xuất tóm tắt/kết luận đã đóng `Closed` (không kèm lý do bổ sung, bản nháp hay người phụ trách nội bộ). |
| `src/components/fraudguard-dashboard/CaseReportWorkflowPanel.tsx` | Thêm mới | Thành phần UI chuyên biệt xử lý toàn bộ bước soạn thảo báo cáo từng AI Alert (`resultText`, `evidence`, `summary`), validation gắn từng trường, khôi phục nội dung phiên bản trước khi bị trả về mà không sửa `reports[]`, cảnh báo bỏ nháp khi đóng/chuyển case, review phiên bản đang `Pending Review`, yêu cầu bổ sung bắt buộc lý do, xác nhận/đóng case tách 2 bước (kể cả `Operator` tự điều tra) và lịch sử các phiên bản báo cáo chỉ đọc. |
| `src/components/fraudguard-dashboard/CasesView.tsx` | Cập nhật | Nối `CaseReportWorkflowPanel.tsx` và 3 handler Phase 2B; quản lý nháp trong bộ nhớ theo khóa `(caseId, actorId, baseReportVersion)`, tự xóa sạch nháp & đóng modal ngay khi chuyển vai trò/người dùng/doanh nghiệp làm mất quyền mà không hiện hộp thoại xác nhận bỏ nháp trong ngữ cảnh trái phép; giữ bảng Queue đúng `1` dòng trên mỗi `InvestigationCase`. |
| `src/components/fraudguard-dashboard/ReportsView.tsx` | Cập nhật | Đọc dữ liệu trực tiếp từ `InvestigationCase[]` qua `readInternalInvestigationCase` (`Operator`, `Investigator` được giao) và `readConfirmedInvestigationReport` (`SME Admin`); đếm `1` dòng & `1` chỉ số cho mỗi case (tách riêng `totalReportVersions` / `reportVersionsCountLabel`); bổ sung bảng xem chi tiết từng cảnh báo và chọn phiên bản báo cáo chỉ đọc (`SME Admin` chỉ xem kết luận đã xác nhận). |
| `src/components/fraudguard-dashboard/AuditTrailView.tsx` | Cập nhật | Đồng bộ 3 action Phase 2B vào `CASE_AUDIT_ACTIONS`, `ACTION_CLASSES`, `ACTION_KEY_MAP` và `WF04_PHASE2B_ACTION_KEY_MAP` (`t.wf04Phase2b.auditActions`). |
| `src/components/fraudguard-dashboard/FraudGuardDashboard.tsx` | Cập nhật | Bổ sung `handleSubmitInvestigationReport`, `handleRequestInvestigationRevision`, `handleConfirmInvestigationCaseReport`, mở rộng `mapCaseActionOutcome` cho các mã lỗi phiên bản/trường báo cáo Phase 2B và nối callback xuống `CasesView`. |
| `src/app/fraud-monitoring/loading.tsx` | Cập nhật | Thiết kế lại màn hình loading tách biệt hoàn toàn trên nền trắng (`#ffffff`), chữ tối (`#0f172a`/`#334155`), skeleton xám nhạt (`#f3f4f6`/`#e5e7eb`) giữ nguyên khung Sidebar + ProductHeader + 4 khối KPI + 1 khối bảng mà không làm thay đổi token Dark mode của dashboard chính. |
| `src/components/fraudguard-dashboard/SecurityDashboard.module.css` | Cập nhật | Bổ sung class cho form báo cáo, lỗi từng trường, cảnh báo bỏ nháp, bước xác nhận đóng case, danh sách phiên bản báo cáo (`reportVersionList`, `confirmReviewPanel`, `discardConfirmPanel`, v.v.) và bộ class `.loadingShell` / `.loadingSidebar` / `.loadingHeader` / `.loadingGrid` / `.loadingBlock` / `.loadingTable` với breakpoint `900px`, `680px`, `420px` và `prefers-reduced-motion`. |
| `src/config/translations.ts` | Cập nhật | Bổ sung phân mục `wf04Phase2b` (`115` khóa VI/EN đối xứng hoàn toàn, không chứa em dash) cho `auditActions`, `reportForm`, `revisionForm`, `confirmClose`, `versionViewer`, `reportsView` và `errors`. |
| `tests/wf04-phase2b.test.cjs` | Thêm mới | 11 kịch bản kiểm thử tích hợp hành vi (`L533` đến `L2124`) bao phủ toàn bộ 11 mục nghiệm thu tại Mục 8 của `docs/antigravity-wf04-phase2b.md`. |
| `docs/wf04-phase2b-report.md` & `docs/task.md` | Thêm mới / Cập nhật | Báo cáo bàn giao Phase 2B + Loading UI, cập nhật tiến độ Phase 2B, thêm **Checklist dọn cuối WF-04** theo Mục 9 và mốc kiểm tra `16/11/2026`. |

**Các vùng giữ nguyên tuyệt đối không chỉnh sửa trong Phase 2B:**
- `src/services/` tiếp tục chỉ chứa `.gitkeep` (không tạo endpoint, HTTP client, AI service giả hay tự động retrain).
- Giữ nguyên domain WF-01 (`src/types/enterprise-lifecycle.ts`, `src/utils/enterprise-lifecycle.ts`, `tests/enterprise-lifecycle.test.cjs`) và domain WF-04 Phase 1 (`src/types/investigation-case.ts`, `src/utils/investigation-case.ts`, `tests/investigation-case.test.cjs`).
- Giữ nguyên `src/utils/case-workflow.ts` (`git diff` = 0), `src/utils/case-migration.ts`, `src/utils/workspace-storage.ts`, `src/data/wf04-demo.ts`, `src/app/globals.css`, `AlertsView.tsx`, `AlertCaseDrawer.tsx`, `PlatformHealthView.tsx` và toàn bộ 6 tệp `.test.cjs` trước đó (`rule-sandbox.test.cjs`, `enterprise-lifecycle.test.cjs`, `investigation-case.test.cjs`, `wf04-phase2a.test.cjs`, `wf04-phase2a-fixes.test.cjs`, `wf04-phase2a-recovery.test.cjs`).

---

## 2. Ánh xạ Commands, Coordinator, Handlers và Giao diện

Mọi thao tác ghi trong Phase 2B tiếp tục thực hiện qua nguồn sự thật duy nhất `useInvestigationCases` (`latestCasesRef`) ở bên ngoài React updater, chỉ nhận ID/dữ liệu đầu vào từ UI rồi tự tra `case`, `actor` và `users` mới nhất từ state hiện hành, truyền nguyên thời điểm `at` / `now()` vào hàm domain Phase 1 (không cộng `+1ms`, không clamp và không fallback `Date.now()`):

| Thao tác nghiệp vụ | Pure Command (`src/utils/investigation-case.ts`) | Coordinator / Hook (`src/hooks/useInvestigationCases.ts`) | Handler Dashboard & UI (`FraudGuardDashboard.tsx` / `CaseReportWorkflowPanel.tsx`) | Audit Action & Chuyển trạng thái |
|---|---|---|---|---|
| **Gửi / gửi lại báo cáo** | `submitInvestigationReport` | `executeSubmitInvestigationReportAction` (`L819`), `submitReport` (`L1405`) | `handleSubmitInvestigationReport` (`FraudGuardDashboard.tsx:752`) <- form `CaseReportWorkflowPanel.tsx`: gửi `expectedStatus: "Investigating"` & `expectedBaseVersion` (chặn gửi trùng/bản nền cũ với `STALE_REPORT_VERSION` / `INVALID_STATE`), giữ nguyên nội dung nháp nếu validation thất bại. | `REPORT_SUBMITTED`: `Investigating -> Pending Review`, tạo `InvestigationCaseReportVersion` mới (`version = reports.length + 1`), lưu bản cũ nguyên vẹn. |
| **Yêu cầu bổ sung báo cáo** | `requestInvestigationCaseRevision` | `executeRequestInvestigationRevisionAction` (`L909`), `requestRevision` (`L1411`) | `handleRequestInvestigationRevision` <- panel duyệt `Pending Review`: truyền bắt buộc `reason` không trắng cùng `expectedReportId` + `expectedReportVersion` của bản đang hiển thị; coordinator kiểm tra khớp `pendingReviewReportId` / `pendingReviewReportVersion` và `latestReport` trước khi gọi domain (từ chối callback cũ với `STALE_REPORT_VERSION` / `REPORT_VERSION_MISMATCH` / `REPORT_NOT_FOUND`). | `REVISION_REQUESTED`: `Pending Review -> Investigating`, xóa con trỏ pending, giữ nguyên mọi phiên bản cũ và lưu `reason` vào `history`. |
| **Xác nhận kết luận & đóng case** | `confirmInvestigationCaseReport` | `executeConfirmInvestigationCaseReportAction` (`L1086`), `confirmAndCloseReport` (`L1417`) | `handleConfirmInvestigationCaseReport` <- panel xác nhận bước 2 (`confirmReviewPanel`): hiển thị lại `summary`, phiên bản đang duyệt và kết quả khóa từng alert trước khi xác nhận; bắt buộc truyền đúng `reportId` + `reportVersion` của phiên bản đang xem (kèm `finalSummary` tùy chọn); Operator tự điều tra phải đi qua 2 bước tách biệt (gửi -> `Pending Review` -> xác nhận đóng), không gộp nút "gửi và đóng". | `REPORT_CONFIRMED_AND_CLOSED`: `Pending Review -> Closed`, ghi riêng `conclusion` (giữ kết quả khác nhau giữa các alert), khóa toàn bộ ghi về sau (`CASE_ALREADY_CLOSED`) và không tự tạo feedback. |

---

## 3. Ma trận Phân quyền Actor và Giới hạn Truy cập

| Actor / Bối cảnh | `CasesView` & `CaseReportWorkflowPanel` | `ReportsView` & CSV (`exportInvestigationCasesCSV`) | `auditForUser` & `NotificationCenter` | Hết hạn gói Subscription (`ent-wf04-expired`, `CASE-WF04-EXP-01`) |
|---|---|---|---|---|
| **`Operator` (cùng doanh nghiệp)** | Xem tất cả `InvestigationCase` của doanh nghiệp mình; ở `Pending Review` được yêu cầu bổ sung hoặc xác nhận đóng case; nếu đã tự đảm nhận (`assignee.actorId === actor.id` khi `Investigating`) được soạn/gửi báo cáo rồi xác nhận đóng qua 2 thao tác tách biệt; khi `Closed` chỉ đọc toàn bộ phiên bản và kết luận. | Xem toàn bộ case của doanh nghiệp mình (`readInternalInvestigationCase`), số phiên bản báo cáo và chi tiết từng alert; xuất CSV theo phạm vi doanh nghiệp. | Thấy đủ `CASE_CREATED`, `INVESTIGATOR_ASSIGNED`, `OPERATOR_SELF_ASSIGNED`, `REPORT_SUBMITTED`, `REVISION_REQUESTED`, `REPORT_CONFIRMED_AND_CLOSED` của doanh nghiệp mình qua `auditForUser` và thông báo `Pending Review` / `REVISION_REQUESTED` / `Closed`. | **Tiếp tục hoạt động bình thường** trên case đã mở hợp lệ trước `expiresAt` (xem, tự đảm nhận, gửi/bổ sung/xác nhận đóng); chỉ chặn mở case mới ở Alert Queue. |
| **`Investigator` được giao (`assignee.actorId === actor.id`, cùng doanh nghiệp)** | Chỉ thấy các case được giao cho đúng `user.id` (bền vững qua đổi tên); khi `Investigating` được soạn/gửi/gửi lại báo cáo từng alert; khi `Pending Review` hoặc `Closed` chỉ đọc các phiên bản báo cáo và kết luận, không có nút duyệt/đóng/yêu cầu bổ sung. | Chỉ xem và xuất CSV cho các case được giao theo đúng `assignee.actorId` (`readInternalInvestigationCase`). | Nhận thông báo `Pending Review` / `REVISION_REQUESTED` / `Closed` cho đúng case mình phụ trách; `auditForUser` giữ chế độ không cấp log hệ thống cho Investigator (`0` bản ghi audit). | **Tiếp tục soạn, gửi và gửi lại báo cáo** cho case mở trước hạn đã được giao. |
| **`Investigator` không được giao / khác doanh nghiệp** | Không thấy case trong danh sách, bị chặn mở/ghi bằng `FORBIDDEN_ASSIGNEE` hoặc `FORBIDDEN_TENANT`; nếu đang mở case mà chuyển sang người không được giao, modal tự đóng và nháp bị xóa sạch. | Không thấy hồ sơ hoặc bị chặn (`0` dòng). | `0` thông báo và `0` log audit cho case không được giao hoặc khác doanh nghiệp. | Bị chặn theo quyền phân công/tenant. |
| **`SME Admin` (cùng doanh nghiệp)** | Chỉ xem được danh sách báo cáo/kết luận của hồ sơ đã **`Closed`** qua `readConfirmedInvestigationReport`; không thấy hồ sơ `Open`/`Investigating`/`Pending Review`, không thấy lý do yêu cầu bổ sung nội bộ, bản nháp cũ hay nút thao tác ghi. | Chỉ hiển thị báo cáo và kết luận của các hồ sơ `Closed` đã xác nhận (`conclusion` khớp `(reportId, reportVersion)`); xuất CSV chỉ xuất tóm tắt/kết luận xác nhận, không xuất lịch sử sửa đổi nội bộ hay `assignee`. | `auditForUser` dùng `SME_HIDDEN_INTERNAL_WORKFLOW_ACTIONS` loại bỏ hoàn toàn `REPORT_SUBMITTED` và `REVISION_REQUESTED` kể cả sau khi case đã đóng `Closed`, chỉ giữ `REPORT_CONFIRMED_AND_CLOSED` của case `Closed`; `NotificationCenter` chỉ báo khi case đã `Closed`. | Xem bình thường các báo cáo đã xác nhận của doanh nghiệp mình. |
| **`Platform Admin`, `Implementation Staff`, `Viewer`** | `0` hồ sơ nội bộ; hiển thị thông báo phạm vi quyền hạn; đóng case không tự sinh feedback lên Platform Admin. | `0` hồ sơ nội bộ và `0` kết luận trong CSV. | `INTERNAL_CASE_AUDIT_ACTIONS` (gồm cả 3 action Phase 2B) bị lọc bỏ hoàn toàn khỏi `Platform Admin`, `Implementation Staff` và `Viewer`; `0` thông báo nội bộ. | Không có quyền nội bộ mặc định. |

---

## 4. Quản lý Bản nháp (`Draft`), Phiên bản Báo cáo Bất biến và Trạng thái Lưu trữ

### 4.1. Cách ly bản nháp trong bộ nhớ và tính bất biến của phiên bản báo cáo

- **Khóa phạm vi bản nháp `(caseId, actorId, baseReportVersion)`:**
  - `buildReportDraftScopeKey` (`src/components/fraudguard-dashboard/CaseReportWorkflowPanel.tsx:47–53`) tách biệt hoàn toàn dữ liệu đang nhập dở theo từng cặp `(caseId, actorId, baseReportVersion)`. Nháp của Investigator A không bao giờ hiển thị hoặc ghi sang Investigator B, Operator khác hay phiên bản nền khác.
  - Khi đổi `effectiveActor.id`, `effectiveActor.role` hoặc `effectiveActor.enterpriseId` (`CasesView.tsx:373–377`), toàn bộ `draftsByScopeKey`, `pendingLeaveAction` và `actionError` được xóa sạch ngay lập tức; nếu người dùng mới không còn quyền xem hoặc soạn thảo (`!authorizedDetail` hoặc `!isAuthorableActiveCase`), modal lập tức đóng/tắt quyền và tuyệt đối **không hiện hộp thoại xác nhận bỏ nháp** để tránh làm lộ sự tồn tại hoặc nội dung nháp trong ngữ cảnh trái phép.
- **Xác nhận bỏ nháp khi đang còn quyền hợp lệ (`isActiveDraftDirty`):**
  - Khi người phụ trách hợp lệ đã chỉnh sửa khác với baseline (`buildReportDraftBaseline`) và bấm đóng modal (`Escape` / nút đóng) hoặc chuyển sang case khác, `CasesView.tsx` (`L398–436`) mở `discardConfirmPanel` để người dùng chọn **Tiếp tục chỉnh sửa (`keepEditingBtn`)** hoặc **Bỏ bản nháp (`discardDraftConfirmBtn`)**; không âm thầm xóa mất công sức nhập liệu.
- **Giới hạn lưu trữ của bản nháp (không tự lưu qua tải lại trang):**
  - Các bản nháp báo cáo chưa gửi được lưu **thuần trong bộ nhớ React (`useState` trong phiên hiện tại)**, không ghi tự động vào `localStorage` (`fraudguard-demo-workspace-v4`). Nếu người dùng tải lại toàn bộ trang trình duyệt (`page.reload()`) trước khi bấm **Gửi báo cáo**, nội dung nháp chưa gửi sẽ bị mất đúng như chú thích `draftInMemoryNote` trên giao diện; ứng dụng không tuyên bố tự động lưu nháp qua reload.
- **Bất biến phiên bản báo cáo & tiền điền khi bổ sung:**
  - Mỗi lần gửi thành công tạo một `InvestigationCaseReportVersion` đóng băng bất biến (`reports: readonly InvestigationCaseReportVersion[]`) trong `InvestigationCase`.
  - Khi `Operator` yêu cầu bổ sung kèm lý do (`Pending Review -> Investigating`), phiên bản cũ vẫn giữ nguyên trong `reports[]` và có thể mở xem lại ở chế độ chỉ đọc; form soạn thảo hiển thị callout lý do bổ sung mới nhất và dùng `buildReportDraftBaseline` tiền điền nội dung phiên bản gần nhất để người phụ trách chỉnh sửa mà không mutate bản đã gửi, gửi lại sẽ tạo phiên bản mới (`v2`, `v3`, ...).

### 4.2. Persistence, Retry/Recovery và Bảo đảm Không Tự động Tạo Feedback

- Toàn bộ 3 lệnh Phase 2B đi qua `useInvestigationCases` (`persistUsersWithWorkspace: true`) -> `persistWorkspaceAndUsers` (`src/utils/workspace-storage.ts`), thừa hưởng nguyên vẹn cơ chế rollback hai khóa, `WORKSPACE_RECOVERY_JOURNAL_KEY_V4`, `"committed_cleanup_pending"` + SHA-256 digests và `retryPersist` lũy đẳng (`0` lần lặp command, `0` trùng version/event/audit).
- Khi đóng case (`confirmInvestigationCaseReport` / `handleConfirmInvestigationCaseReport`), trạng thái chuyển sang `Closed` với `conclusion` tách biệt nhưng tuyệt đối không tạo hay gửi feedback lên `Platform Admin`; `platformSummary(transactions, { wf04Managed: true })` tiếp tục trả về `feedback: []`.

---

## 5. Thiết kế lại Giao diện Loading (`src/app/fraud-monitoring/loading.tsx`)

Màn hình tải route `src/app/fraud-monitoring/loading.tsx` (`L1–76`) và bộ class tương ứng trong `src/components/fraudguard-dashboard/SecurityDashboard.module.css` (`L5151–5390`) được thiết kế đáp ứng đầy đủ các yêu cầu đã chốt:

1. **Nền trắng tách biệt hoàn toàn khỏi Dark Mode của Dashboard chính:**
   - `.loadingShell`, `.loadingSidebar`, `.loadingWorkspace`, `.loadingHeader` sử dụng cố định nền `#ffffff`, chữ tiêu đề `#0f172a`, văn bản trạng thái `#334155`, đường viền `#e5e7eb` và khối skeleton `#f3f4f6` / `#e5e7eb`, kể cả khi `<html data-theme="dark">` chưa hydrate hay đang bật chế độ tối, mà **không** sửa đổi các biến `:root` / `[data-theme="light"]` trong `src/app/globals.css`.
2. **Tái sử dụng kích thước Shell thực tế & Sidebar/Header trung tính:**
   - Áp dụng đúng biến bố cục của dashboard (`--sidebar-width: 240px`, `--product-header-height: 60px`, `--content-max-width: 1900px`, `--panel-radius: 5px`).
   - Thanh Sidebar bên trái (`.loadingSidebar`) và Header phía trên (`.loadingHeader`) chỉ hiển thị khung skeleton trung tính (không render menu đặc quyền, thông tin người dùng giả hay gọi hook phụ thuộc ngữ cảnh). Nội dung chính hiển thị tiêu đề + trạng thái, lưới `.loadingGrid` gồm **4 khối `.loadingBlock`** ở trên và **1 khối `.loadingTable`** lớn ở dưới.
3. **Trợ năng, Responsive & Chính sách ngôn ngữ an toàn cho Route Fallback:**
   - **Trợ năng & chuyển động:** vùng bao ngoài gắn `aria-busy="true"`, phần khung trang trí gắn `aria-hidden="true"`, thẻ `<p role="status">` thông báo trạng thái tải, **`0` phần tử có thể nhận focus** (`0` button/link giả), tôn trọng `@media (prefers-reduced-motion: reduce)` (`animation: none; background: #f3f4f6;`) và `0` độ trễ nhân tạo.
   - **Responsive:** Desktop giữ lưới 4 cột (`repeat(4, minmax(0, 1fr))`), Tablet `<= 900px` (bao gồm `768px`) ẩn sidebar, hiện `.loadingMobileMenuStub` và chuyển lưới thành 2x2 (`repeat(2, minmax(0, 1fr))`), Mobile `<= 420px` (bao gồm `375px`) co thành 1 cột dọc và giữ `overflow-x: clip` (`0` tràn ngang).
   - **Cách xử lý ngôn ngữ không cần Client Provider:** do Next.js `loading.tsx` là route fallback tĩnh/server không bảo đảm `LanguageProvider` tồn tại trước khi hydrate, thành phần không import `useLanguage()` hay provider phía client để tránh lỗi runtime/hydration; thay vào đó hiển thị chuỗi song ngữ tĩnh an toàn `"Đang tải dữ liệu bảng điều khiển... / Loading dashboard data..."` trên nhãn `<p role="status">`.

---

## 6. Kết quả Kiểm thử Tự động và Bằng chứng Kiểm thử Trình duyệt

### 6.1. Ma trận 11 kịch bản kiểm thử tích hợp Phase 2B (`tests/wf04-phase2b.test.cjs`)

| # | Nhóm nghiệm thu (`antigravity-wf04-phase2b.md` Mục 8) | Thành phần / Hàm được kiểm chứng | Test case (`tests/wf04-phase2b.test.cjs`) |
|---|---|---|---|
| 1 | `8.1`: Investigator soạn đủ từng alert cho case nhiều alert, gửi v1 -> `Pending Review`; reload giữ nguyên v1 + 1 audit | `executeSubmitInvestigationReportAction`, `useInvestigationCases`, `CaseReportWorkflowPanel.tsx`, `restoreWorkspaceSnapshot` | `L533`: `Section 8.1: Assigned Investigator authors distinct per-alert findings on multi-alert case, submits v1 via coordinator + UI panel -> Pending Review, and preserves v1 + single audit across reload` |
| 2 | `8.2`: Báo cáo thiếu tổng kết/kết quả/bằng chứng hoặc thiếu/thừa/trùng alert bị chặn; UI giữ nguyên nháp | `executeSubmitInvestigationReportAction`, `CaseReportWorkflowPanel.tsx` | `L654`: `Section 8.2: Missing summary/result/evidence or missing/extra/duplicate alert items are rejected without mutating state/storage or wiping UI draft` |
| 3 | `8.3`: Operator yêu cầu bổ sung kèm lý do -> `Investigating`; Investigator sửa gửi v2; v1 bất biến, giữ `reason` | `executeRequestInvestigationRevisionAction`, `executeSubmitInvestigationReportAction`, `CaseReportWorkflowPanel.tsx` | `L786`: `Section 8.3: Revision request with mandatory reason returns Pending Review -> Investigating, preserves immutable v1 + reason callout, and resubmit creates v2` |
| 4 | `8.4`: Operator duyệt đúng `reportId`/`reportVersion` v2 -> `Closed`; giữ kết quả khác nhau; chặn callback/ID/version v1 | `executeRequestInvestigationRevisionAction`, `executeConfirmInvestigationCaseReportAction`, `CaseReportWorkflowPanel.tsx` | `L924`: `Section 8.4: Confirm & Close accepts only active v2 reportId/reportVersion, preserves distinct per-alert results, and rejects stale/missing v1 callbacks in both revision and confirm` |
| 5 | `8.5`: Operator tự đảm nhận -> gửi -> xác nhận đóng qua 2 bước tách biệt (4 sự kiện audit tuần tự) | `executeSelfAssignCaseAction`, `executeSubmitInvestigationReportAction`, `executeConfirmInvestigationCaseReportAction`, `CaseReportWorkflowPanel.tsx` | `L1094`: `Section 8.5: Same Operator self-investigates, submits report, and confirms/closes as two distinct steps without direct closing or combined button` |
| 6 | `8.6`: Phân quyền đọc/ghi và đổi vai trò trực tiếp: SME Admin chỉ thấy `Closed`, PA không thấy qua log/feed/CSV, đổi user xóa modal/nháp | `CasesView.tsx`, `ReportsView.tsx`, `auditForUser`, `buildCaseNotifications`, `exportInvestigationCasesCSV` | `L1206`: `Section 8.6: Enforces role/tenant/assignee/SME-confirmed boundaries and drops unauthorized UI modal/drafts immediately on live actor switch` |
| 7 | `8.7`: Subscription hết hạn (`CASE-WF04-EXP-01`) vẫn cho gửi/bổ sung/xác nhận đóng hết vòng đời; chặn case mới | `ent-wf04-expired`, `CASE-WF04-EXP-01`, `executeCreateCaseAction`, `submitReport`, `requestRevision`, `confirmAndCloseReport` | `L1549`: `Section 8.7: Expired WF-01 Subscription allows full Phase 2B completion on pre-expiry CASE-WF04-EXP-01 while blocking new case creation` |
| 8 | `8.8`: Bấm đúp & lỗi storage quota/cleanup giữ bản báo cáo đã commit qua reload và `retryPersist` không tạo bản trùng | `useInvestigationCases`, `persistWorkspaceAndUsers`, `restoreWorkspaceSnapshot`, `StorageLike` | `L1636`: `Section 8.8: Double-submit and storage quota/cleanup failures keep committed report state across reload and retry without duplicating versions, audits, or timestamps` |
| 9 | `8.9`: `Closed` từ chối mọi thao tác ghi, không tạo feedback (`wf04Managed`), đếm `1` case cho đa alert/đa version, nhãn Audit VI/EN | `ReportsView.tsx`, `AuditTrailView.tsx`, `platformSummary`, `legacyCaseArchive` | `L1807`: `Section 8.9: Closed cases reject mutations, emit zero feedback, count 1 case per multi-alert/multi-version case in ReportsView/KPIs/AuditTrailView, and keep legacyCaseArchive read-only` |
| 10 | `8.10`: Cô lập nháp theo `(caseId, actorId, baseReportVersion)`, hỏi xác nhận bỏ nháp khi đóng/chuyển hợp lệ, hủy nháp quá hạn | `buildReportDraftScopeKey`, `CasesView.tsx`, `CaseReportWorkflowPanel.tsx` | `L2007`: `Section 8.10: Draft scoping isolates unsent drafts per (caseId, actorId, baseReportVersion), prompts discard confirm on dirty close/switch, and invalidates stale draft scopes` |
| 11 | `8.11`: `loading.tsx` nền trắng giữ nguyên token tối của dashboard, `aria-busy`/`role="status"`, breakpoint `900px`/`420px`/`prefers-reduced-motion` | `src/app/fraud-monitoring/loading.tsx`, `SecurityDashboard.module.css`, `globals.css` | `L2124`: `Section 8.11: Fraud Monitoring loading.tsx renders an isolated light-background dashboard shell with accessible status, responsive CSS breakpoints, and untouched dashboard dark tokens` |

### 6.2. Kết quả chạy kiểm tra tự động sau chỉnh sửa (`frontend/LCS`)

Chạy tuần tự sau khi hoàn tất mã nguồn và unit/integration test (`#117`, `#118`, `#120`):

1. **`node --test tests/wf04-phase2b.test.cjs` (`#117`):** **exit code `0`** (**`11` tests: `11` pass, `0` fail, `0` skipped**, `27204.56ms`).
2. **`npm run check` (`#118`):** **exit code `0`**
   - `npm run lint` (`eslint src --max-warnings=0`): **0 warnings, 0 errors** (exit code `0`).
   - `npm run typecheck` (`next typegen && tsc --noEmit`): **`Route types generated successfully`, 0 lỗi TypeScript** (exit code `0`).
   - `npm test` (`node --test tests/*.test.cjs`): **`147` tests, `147` pass, `0` fail, `0` cancelled, `0` skipped, `0` todo** trên cả **7 tệp test** (`33368.0287ms`):
     - `tests/enterprise-lifecycle.test.cjs`: `11/11` pass.
     - `tests/investigation-case.test.cjs`: `17/17` pass.
     - `tests/rule-sandbox.test.cjs`: `83/83` pass.
     - `tests/wf04-phase2a.test.cjs`: `9/9` pass.
     - `tests/wf04-phase2a-fixes.test.cjs`: `9/9` pass.
     - `tests/wf04-phase2a-recovery.test.cjs`: `7/7` pass.
     - `tests/wf04-phase2b.test.cjs`: `11/11` pass.
3. **`npm run build` (`next build` chạy độc lập trên `.next` sạch, không có dev server song song, `#120`):** **exit code `0`**
   - `Compiled successfully in 4.6s` (lượt chạy của `@verifier` ở `#118` đạt `4.3s`), **`Generating static pages (6/6)`** (`/`, `/_not-found`, `/fraud-monitoring`, `/login`).

*(Ghi chú: các kịch bản lỗi lưu trữ như quota failure hoặc cleanup retry trong mục `8.8` được kiểm chứng qua `StorageLike` test double trong `tests/wf04-phase2b.test.cjs` chứ không tiêm lỗi vào `Storage.prototype` trực tiếp trên trình duyệt.)*

### 6.3. Bằng chứng Kiểm thử Trình duyệt Thực tế (Luồng Phase 2B & Preview Loading UI tách biệt)

1. **Kiểm thử luồng WF-04 Phase 2B trực tiếp trên `http://localhost:3005/fraud-monitoring`:**
   - **Độ ổn định:** `0` `consoleErrors`, `0` `pageErrors`, `0` tràn ngang trên cả 3 kích thước `1440x900`, `768x1024` và `375x812`.
   - **Kịch bản đã thao tác trọn vẹn từ đầu tới cuối:**
     - Mở kịch bản demo WF-04; tạo **`CASE-WF04-0002`** (gồm 2 AI Alert) và **`CASE-WF04-0003`** (gồm 1 AI Alert).
     - Giao `CASE-WF04-0002` cho `Investigator` (`Phạm Bảo Châu`): kiểm tra validation báo cáo rỗng giữ nguyên nội dung, kiểm tra xác nhận bỏ nháp khi đóng form có dữ liệu chưa gửi, soạn kết quả/bằng chứng khác nhau cho 2 alert và gửi **`v1`** (`Investigating -> Pending Review`).
     - Chuyển sang `Operator`: kiểm tra chặn lý do bổ sung rỗng, gửi yêu cầu bổ sung hợp lệ (`Pending Review -> Investigating`), kiểm tra `Investigator` mở lại thấy banner lý do và nội dung `v1` được tiền điền rồi gửi **`v2`** (`Pending Review`).
     - `Operator` mở bước review `v2` và xác nhận đóng hồ sơ qua 2 bước tách biệt (`Pending Review -> Closed`).
     - Thực hiện luồng `Operator` tự đảm nhận điều tra trên `CASE-WF04-0003`: tự nhận (`Open -> Investigating`), gửi báo cáo và xác nhận đóng qua 2 thao tác tách biệt (`Closed`).
     - Chạy `page.reload()` xác nhận cả 2 case `Closed` giữ nguyên qua tải lại trang; kiểm tra `ReportsView` đếm đúng **`2` case `Closed` và `3` phiên bản báo cáo** (không nhân số case theo số alert hay số phiên bản); kiểm tra `AuditTrailView` ghi đủ các action Phase 2B.
     - Kiểm tra cô lập quyền: `SME Admin` chỉ thấy báo cáo đã đóng xác nhận (không thấy nháp/bản cũ/lý do bổ sung), `Investigator` không được giao không thấy hồ sơ, `Platform Admin` không thấy hồ sơ nội bộ và có `0` mục feedback tự động; thử đổi vai trò trực tiếp trên header khi đang mở modal xác nhận modal tự đóng ngay lập tức.
     - Kiểm tra chuyển đổi ngôn ngữ **EN / VI**, bật **Dark mode** và kích thước **`375x812`**, rồi bấm khôi phục dữ liệu trước demo sạch sẽ.
   - **Ảnh chụp bằng chứng Phase 2B đã xác nhận tồn tại trên đĩa:**
     - `C:/Users/gmt/.gemini/antigravity/brain/1e11268c-fb98-470c-857b-f30c607339c3/browser_sandbox/screenshots/step_86_shot_1_wf04-phase2b-v2-pending.png`
     - `C:/Users/gmt/.gemini/antigravity/brain/1e11268c-fb98-470c-857b-f30c607339c3/browser_sandbox/screenshots/step_88_shot_1_wf04-phase2b-closed-v2.png`
     - `C:/Users/gmt/.gemini/antigravity/brain/1e11268c-fb98-470c-857b-f30c607339c3/browser_sandbox/screenshots/step_94_shot_1_wf04-phase2b-reports.png`
     - `C:/Users/gmt/.gemini/antigravity/brain/1e11268c-fb98-470c-857b-f30c607339c3/browser_sandbox/screenshots/step_127_shot_1_wf04-phase2b-dark-375.png`
     - Ảnh tổng hợp trên máy host: `C:/Users/gmt/.gemini/antigravity/brain/eb6ff764-9cc9-4569-8c16-c4074d250f4d/browser_evidence/1e11268c-fb98-470c-857b-f30c607339c3/final_step_131.png`
2. **Kiểm thử preview cô lập của `loading.tsx` đã biên dịch (`http://127.0.0.1:3006` nạp CSS từ `.next/static/css/*.css`):**
   - Xác nhận nền trắng `#ffffff` (kể cả khi ép `<html data-theme="dark">`), chữ tối `#0f172a` / `#334155`, khung sidebar 240px và header 60px trung tính, 4 ô KPI phía trên + 1 bảng lớn phía dưới, `0` phần tử nhận focus, `0` tràn ngang trên cả 3 kích thước `1440x900` (4 cột), `768x1024` (lưới 2x2) và `375x812` (1 cột).
   - **Ảnh chụp bằng chứng Loading UI đã xác nhận tồn tại trên đĩa:**
     - `C:/Users/gmt/.gemini/antigravity/brain/ca870555-1ff9-4342-a05f-176307127566/browser_sandbox/screenshots/step_71_shot_1.png`
     - `C:/Users/gmt/.gemini/antigravity/brain/ca870555-1ff9-4342-a05f-176307127566/browser_sandbox/screenshots/step_71_shot_2.png`
     - `C:/Users/gmt/.gemini/antigravity/brain/ca870555-1ff9-4342-a05f-176307127566/browser_sandbox/screenshots/step_71_shot_3.png`
     - `C:/Users/gmt/.gemini/antigravity/brain/ca870555-1ff9-4342-a05f-176307127566/browser_sandbox/screenshots/step_71_shot_4.png`
     - Ảnh tổng hợp trên máy host: `C:/Users/gmt/.gemini/antigravity/brain/eb6ff764-9cc9-4569-8c16-c4074d250f4d/browser_evidence/ca870555-1ff9-4342-a05f-176307127566/final_step_79.png`

---

## 7. Giới hạn còn lại và Phạm vi Chờ Sau Phase 2B

Phase 2B và màn hình loading dừng lại tại mốc nghiệm thu frontend để phục vụ review. Các phần chưa triển khai và tiếp tục giữ ở trạng thái chờ gồm:

1. **Luồng SME Admin gửi feedback cho Platform Admin (`docs/task.md` Mục `7.1`):**
   - Chưa xây dựng giao diện và state để `SME Admin` chọn báo cáo/kết luận đã xác nhận của doanh nghiệp mình, bổ sung nhận xét và chủ động xác nhận gửi feedback lên `Platform Admin`, cũng như màn hình tiếp nhận feedback riêng cho `Platform Admin`. Đóng case trong Phase 2B chỉ hoàn tất hồ sơ nội bộ và không tự động tạo feedback.
2. **Checklist dọn cuối WF-04 (`docs/antigravity-wf04-phase2b.md` Mục 9):**
   - Thanh kịch bản demo WF-04 và mục "Hồ sơ lưu trữ cũ" (`LegacyCaseArchiveSection`) hiện vẫn tạm giữ lại trong Phase 2B để phục vụ đối chiếu và kiểm thử; sẽ chỉ được gỡ bỏ khỏi giao diện vận hành chính của `Operator` ở bước dọn cuối cùng **sau khi** chạy sao lưu và chuyển đổi bảo toàn toàn bộ case/báo cáo mới và case `Closed` (không tự xóa `localStorage` để làm sạch UI).
3. **Dữ liệu điện năng đối chiếu thời gian thực & Hợp đồng BE / AI Service:**
   - Giao diện chi tiết cảnh báo trong `CaseReportWorkflowPanel.tsx` chỉ hiển thị đúng các trường thực có từ bản ghi `InvestigationCaseAlertLink` / `TransactionRisk` (`processedAt`, `amount`, `modelVersion`, `explanation`), không bịa biểu đồ chuỗi phụ tải theo giờ khi nguồn dữ liệu chỉ có giao dịch đơn lẻ; `resultText` vẫn là văn bản tạm thời chưa gắn enum hay nhãn đánh giá AI cố định.
   - `src/services/` giữ nguyên `.gitkeep`; chưa kết nối API thực tế, khóa đồng thời đa người dùng trên server (`UNIQUE(alert_id)`, ETag/version conflict phía BE), gửi feedback lên AI service hoặc bất kỳ cơ chế retrain AI nào.
