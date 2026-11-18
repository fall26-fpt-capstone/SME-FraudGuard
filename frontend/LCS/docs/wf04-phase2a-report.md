# Báo cáo triển khai WF-04 Phase 2A: Tích hợp State, Lưu trữ Workspace v4, Chuyển đổi Dữ liệu Legacy, Alert Queue và Case Queue (Cập nhật sau hoàn tất Recovery Storage)

Ngày báo cáo: 16/11/2026  
Phạm vi: `frontend/LCS` (nối lớp domain WF-04 Phase 1 vào state frontend, lưu trữ `localStorage` schema `v4` kèm sao lưu, nhật ký phục hồi và phân biệt trạng thái commit/cleanup hai khóa, chuyển đổi dữ liệu legacy có kiểm soát, bộ dữ liệu demo WF-04 đạt chuẩn WF-01, Alert Queue đa chọn, Case Queue đếm theo case, khóa đường ghi legacy và đồng bộ các caller liên quan; dừng trước Phase 2B soạn/gửi/duyệt báo cáo và luồng SME Admin gửi feedback).  
Nhánh làm việc: `feat/FE-DashboardPage`.  
Hiện trạng git (`D:\SME-FraudGuard`): bảo toàn nguyên vẹn toàn bộ thay đổi có sẵn trên nhánh làm việc (hiện có `40` đường dẫn `M` và `31` đường dẫn `??` bao gồm các tệp mới của WF-01, WF-04 Phase 1, WF-04 Phase 2A và hai đợt hoàn thiện sau review); `src/services/` giữ nguyên chỉ có `.gitkeep`; không thêm npm dependency mới.

---

## 1. Danh sách file thay đổi, kiến trúc State / Write / Persist và khóa đường ghi Legacy

### 1.1. Danh sách file tạo mới và cập nhật trong Phase 2A

| Đường dẫn (`frontend/LCS/...`) | Hành động | Mục đích & Phạm vi |
|---|---|---|
| `src/utils/case-migration.ts` | Thêm mới (giữ nguyên trong các đợt sửa lỗi) | Triển khai hàm chuyển đổi dữ liệu cũ thuần, tất định và lũy đẳng `migrateWorkspaceLegacyCases` (`CASE_MIGRATION_VERSION = 1`), phân loại `InvestigationCase` đủ bằng chứng với `legacyCaseArchive` (`LegacyCaseArchiveEntry`), cùng hàm kiểm tra quyền xem lưu trữ cũ `canActorViewLegacyArchiveEntry` và chặn chọn cảnh báo `isAlertBlockedByCasesOrLegacy`. |
| `src/utils/workspace-storage.ts` | Thêm mới & cập nhật qua 2 đợt sửa lỗi | Quản lý `WORKSPACE_STORAGE_KEY_V4` (`"fraudguard-demo-workspace-v4"`, `WORKSPACE_SCHEMA_VERSION = 4`), `WORKSPACE_BACKUP_KEY_V3` (`"fraudguard-demo-workspace-v3-backup"`), `WORKSPACE_RECOVERY_JOURNAL_KEY_V4` (`"fraudguard-demo-workspace-v4-recovery"`), trạng thái `"recovery_required"`, các validator sâu (`isValidAlertLinkShape`, `isValidInvestigationCaseShape`, `isValidLegacyArchiveShape`, `isValidPreDemoSnapshotShape`, `validateWorkspacePayloadV4`, `isValidRecoveryJournalShape`), dấu hiệu commit + digest SHA-256 (`WorkspaceRecoveryCommitState`, `STORAGE_CLEANUP_FAILED`), `persistWorkspaceAndUsers`, `recoverWorkspaceStorage`, `restoreWorkspaceSnapshot`, `mergeAndPersistWorkspaceSlice`, `restoreEnterpriseUsers`. |
| `src/data/wf04-demo.ts` | Thêm mới & cập nhật qua 2 đợt sửa lỗi | Bộ dữ liệu demo WF-04 độc lập xây dựng qua chuỗi hàm thật của WF-01 (`rule-set-lifecycle.ts` và `enterprise-lifecycle.ts`) gồm 3 doanh nghiệp (`ent-wf04-campus`, `ent-wf04-branch`, `ent-wf04-expired`), 4 dự án, 9 người dùng có ID, 9 giao dịch điện năng và 1 case mở trước hạn (`CASE-WF04-EXP-01`), cùng `applyWf04DemoWorkspace`, `restorePreDemoWorkspace` (`isValidPreDemoSnapshotShape`), `applyAndPersistWf04Demo` và `restoreAndPersistPreDemoWorkspace` tôn trọng `committed && cleanupPending`. |
| `src/hooks/useInvestigationCases.ts` | Thêm mới & cập nhật qua 2 đợt sửa lỗi | Hook và bộ điều phối lệnh thuần (`useInvestigationCases`, `investigationCasesReducer`, `executeCreateCaseAction`, `executeAssignInvestigatorAction`, `executeSelfAssignCaseAction`), bỏ hoàn toàn `resolveMonotonicTimestampForCase` để truyền nguyên thời điểm đầu vào vào domain WF-04, theo dõi `committed` và `cleanupPending` tách biệt trên state/outcome, hỗ trợ `persistUsersWithWorkspace` và `retryPersist({ allowRecoveryOverwrite })` lũy đẳng. |
| `src/types/fraudguard.ts` | Cập nhật | Bổ sung `InvestigationAuditAction` (`"CASE_STATUS_UPDATED" | "CASE_CREATED" | "INVESTIGATOR_ASSIGNED" | "OPERATOR_SELF_ASSIGNED"`), `ExtendedAuditAction` và mở rộng `AuditAction` để ghi nhận chính xác từng bước WF-04 Phase 2A. |
| `src/utils/permissions.ts` | Cập nhật | Cập nhật `canSaveMember` nhận thêm `investigationCases` và `legacyCaseArchive` tùy chọn: chặn đổi vai trò thành viên đang phụ trách case `Investigating` hoặc `Pending Review` theo `assignee.actorId` (không chặn nhầm vì case `Open` chưa giao việc) và bảo toàn kiểm tra hồ sơ legacy chưa giải quyết. |
| `src/utils/enterprise.ts` | Cập nhật | Cập nhật `transactionsForEnterprise` (lọc theo `assignee.actorId` trên `InvestigationCase[]` và `canResolveAssigneeId` trên `legacyCaseArchive`, giữ quyền khi đổi tên hiển thị), `auditForUser` (ẩn hoàn toàn log điều tra nội bộ khỏi `Platform Admin`, `Implementation Staff`, `Investigator`, `Viewer`; chỉ cho `SME Admin` xem log của case đã `Closed`), và thêm `hasLegacyCaseFieldPatch`, `countOpenUnlinkedAlerts`, `countActiveInvestigationCases`. |
| `src/utils/notification-feed.ts` | Cập nhật | Bổ sung `buildCaseNotifications` sinh thông báo từ `InvestigationCase[]` và `legacyCaseArchive` theo đúng quyền đọc từng vai trò/tenant/người phụ trách; giữ nguyên `notificationFeed` 1 tham số cho các test cũ. |
| `src/utils/platform-summary.ts` | Cập nhật | Bổ sung tùy chọn `{ wf04Managed?: boolean }` cho `platformSummary`: khi `wf04Managed: true` trả `feedback: []` để đóng case nội bộ không tự tính thành feedback gửi `Platform Admin`. |
| `src/utils/export-csv.ts` | Cập nhật | Bổ sung `resolveTransactionCaseSummary`, tùy chọn `ExportTransactionsCSVOptions` cho `exportTransactionsCSV`, `buildInvestigationCasesCSVRows` và `exportInvestigationCasesCSV` tôn trọng read guards của WF-04. |
| `src/config/translations.ts` | Cập nhật (qua các đợt review) | Bổ sung phân mục song ngữ `vi`/`en` `wf04Phase2a` (125 khóa đối xứng, không chứa ký tự em dash), gồm 9 khóa phục hồi/lỗi timestamp (`recoveryRequired`, `recoveryBadge`, `recoveryActionBtn`, `readFailed`, `demoLoadFailed`, `demoRestoreFailed`, `rollbackNotice`, `timestampOutOfOrderError`, `invalidTimestampError`) và 3 khóa chờ dọn nhật ký (`storage.cleanupRequired`, `storage.cleanupPendingBadge`, `storage.retryCleanupBtn`). |
| `src/components/fraudguard-dashboard/AlertsView.module.css` & `SecurityDashboard.module.css` | Cập nhật | Bổ sung styles hỗ trợ Light/Dark mode, WCAG AA và mục tiêu chạm `>= 44px` cho thanh ngữ cảnh demo, cảnh báo lưu trữ, thanh chọn nhiều cảnh báo, checkbox, modal tạo/xem case, lưới 5 thẻ KPI `.caseMetricsGrid` (`display: grid; gap: 12px;`) và vùng lưu trữ hồ sơ cũ. |
| `src/components/fraudguard-dashboard/FraudGuardDashboard.tsx` | Cập nhật (qua các đợt sửa lỗi) | Nối `restoreWorkspaceSnapshot`, `persistWorkspaceAndUsers`, `recoverWorkspaceStorage`, `applyAndPersistWf04Demo`, `restoreAndPersistPreDemoWorkspace`, `useInvestigationCases` (`persistUsersWithWorkspace: true`); hợp nhất autosave thành một `useEffect` có fingerprint và bị khóa khi đang lỗi/`recovery_required`/`cleanupPending`; xử lý `committed && cleanupPending` khi khôi phục demo (không bật lại `wf04DemoActive: true`); thêm `mapCaseActionOutcome`; khóa `handleUpdateTransaction` qua `hasLegacyCaseFieldPatch`. |
| `src/components/fraudguard-dashboard/AlertsView.tsx` | Cập nhật (giữ nguyên trong các đợt sửa lỗi) | Giữ nguyên bố cục danh sách/bảng và sắp xếp cảnh báo mới nhất theo timestamp đầy đủ đến mili-giây; thêm checkbox cho cảnh báo `AI + Abnormal` đủ điều kiện, chọn tất cả trong trang hiện tại, tự xóa lựa chọn khi đổi bộ lọc/trang/người dùng/doanh nghiệp, modal xác nhận tạo case `Open`, hiển thị mã case liên kết và nút mở chi tiết case. |
| `src/components/fraudguard-dashboard/CasesView.tsx` | Cập nhật | Hiển thị 1 dòng cho mỗi `InvestigationCase`, 4 tab trạng thái WF-04 (`Open`, `Investigating`, `Pending Review`, `Closed`), giao `Investigator` theo `user.id` hoặc `Operator` tự đảm nhận (`Open -> Investigating`), lọc `Investigator` theo `assignee.actorId`, chế độ chỉ xem báo cáo đã xác nhận cho `SME Admin`, chặn truy cập nội bộ với `Platform Admin`/`Implementation Staff`/`Viewer`, modal chi tiết case và mục hồ sơ legacy chỉ đọc. |
| `src/components/fraudguard-dashboard/AlertCaseDrawer.tsx` | Cập nhật | Khi `wf04Managed` bật, ẩn và khóa toàn bộ điều khiển tạo/giao/báo cáo/đóng case kiểu cũ trên giao dịch; chỉ hiển thị chi tiết giao dịch/cảnh báo kèm tóm tắt và nút mở `InvestigationCase` hoặc thông báo hồ sơ legacy chỉ đọc. |
| `src/components/fraudguard-dashboard/ReportsView.tsx`, `AuditTrailView.tsx`, `PlatformHealthView.tsx`, `DashboardToolbar.tsx`, `TransactionRiskTable.tsx`, `NotificationCenter.tsx`, `src/layouts/ProductHeader.tsx` | Cập nhật | Đồng bộ tổng hợp 1 dòng/1 case, xuất CSV, bộ lọc hành động audit WF-04, trung tâm thông báo và tách biệt số liệu feedback trên `PlatformHealthView`. |
| `tests/wf04-phase2a.test.cjs` | Thêm mới (giữ nguyên qua 2 đợt sửa lỗi) | 9 kịch bản kiểm thử tích hợp hành vi (`L170` đến `L1605`) bao phủ toàn bộ yêu cầu tại Mục 9 của `docs/antigravity-wf04-phase2a.md`. |
| `tests/wf04-phase2a-fixes.test.cjs` | Thêm mới (giữ nguyên ở đợt recovery fix) | 9 regression test (`L241` đến `L934`) chứng minh thất bại trước sửa (1 pass / 5 fail) và kiểm chứng 3 nhóm sửa lỗi review (validation khi restore, không tự sửa timestamp + sort mili-giây, điều phối hai khóa + rollback + recovery journal + hook integration). |
| `tests/wf04-phase2a-recovery.test.cjs` | Thêm mới ở đợt hoàn tất recovery fix | 7 regression test (`L262` đến `L843`) chứng minh thất bại trước sửa (0 pass / 2 fail) và kiểm chứng đầy đủ cơ chế commit marker + cleanup journal (`STORAGE_CLEANUP_FAILED`, reload giữ bản mới, retry lũy đẳng, rollback khi lỗi commit marker, tương thích journal cũ/hỏng và hoàn tất demo restore). |
| `docs/wf04-phase2a-report.md` & `docs/task.md` | Thêm mới / Cập nhật | Báo cáo bàn giao Phase 2A (cập nhật sau các đợt sửa lỗi review) và cập nhật tiến độ Phase 2A cùng mốc kiểm tra trong `docs/task.md`. |

**Các vùng giữ nguyên không chỉnh sửa trong Phase 2A và các đợt sửa lỗi Review:**
- Giữ nguyên tuyệt đối các tệp domain Phase 1 đã duyệt: `src/types/investigation-case.ts`, `src/utils/investigation-case.ts`, `src/types/enterprise-lifecycle.ts`, `src/utils/enterprise-lifecycle.ts`, `tests/enterprise-lifecycle.test.cjs`, `tests/investigation-case.test.cjs`, `tests/rule-sandbox.test.cjs`.
- Giữ nguyên `src/utils/case-workflow.ts` (để không phá vỡ các bài test đơn vị cũ), `src/utils/case-migration.ts`, `AlertsView.tsx`, `tests/wf04-phase2a.test.cjs` và `tests/wf04-phase2a-fixes.test.cjs`.
- `src/services/` giữ nguyên chỉ có `.gitkeep`.

### 1.2. Luồng State, Write, Persist và cơ chế chống ghi đè / chống tạo trùng

1. **Nguồn dữ liệu độc lập (`InvestigationCase[]`):**
   - Hồ sơ điều tra được quản lý tập trung qua `useInvestigationCases` (`src/hooks/useInvestigationCases.ts`), hoàn toàn tách biệt khỏi mảng `transactions`.
   - `transactions` chỉ đóng vai trò nguồn cảnh báo/giao dịch đầu vào; ứng dụng không ghi ngược trạng thái mới, người phụ trách mới hay báo cáo mới vào từng phần tử `TransactionRisk`. Mọi thông tin liên kết từ cảnh báo sang hồ sơ điều tra đều được suy ra từ `investigationCases` và `legacyCaseArchive`.
2. **Thực thi lệnh thuần bên ngoài React State Updater:**
   - Các hàm `executeCreateCaseAction`, `executeAssignInvestigatorAction` và `executeSelfAssignCaseAction` lấy thông tin `actor`, `enterprises`, `projects`, `alerts`, `users` và toàn bộ `existingCases` mới nhất (bao gồm cả các case `Closed`) từ state gốc của dashboard, không tin role/tenant do component con truyền vào.
   - Mã hồ sơ (`caseId`), mã sự kiện (`eventId`), thời điểm thao tác (truyền thẳng `at` hoặc đồng hồ cấu hình `now` vào hàm domain, không tự sửa đổi instant) và đúng 1 bản ghi `AuditLogEntry` (`CASE_CREATED`, `INVESTIGATOR_ASSIGNED` hoặc `OPERATOR_SELF_ASSIGNED`) được chuẩn bị **trước** khi gọi `dispatch` của `useReducer`. Nhờ đó, React Strict Mode hoặc người dùng bấm đúp chuột liên tiếp (`latestCasesRef` được cập nhật đồng bộ ngay lập tức) không sinh 2 case trùng cho cùng một cảnh báo, không sinh 2 bản ghi audit và không gọi `localStorage.setItem` bên trong updater.
3. **Phân biệt dữ liệu trong bộ nhớ, dữ liệu đã commit chính và trạng thái dọn nhật ký:**
   - State của hook (`InvestigationCasesState`, `L140–148`) lưu tách biệt `inMemoryCases`, `lastPersistedCases`, `lastPersistedAt`, `hasUnsavedChanges`, `committed`, `cleanupPending` và `storageError`.
   - Nếu bước lưu qua bộ điều phối `persistWorkspaceAndUsers` thất bại trước khi commit (ví dụ lỗi `QuotaExceededError` trên khóa `v4` hoặc khóa `users v1` dẫn tới rollback), trạng thái hợp lệ trong phiên vẫn giữ trong `inMemoryCases` (`committed: false`, `hasUnsavedChanges: true`), khóa tự động ghi đè từ `useEffect` autosave và hiển thị banner retry.
   - Nếu hai khóa chính đã ghi xong và được đóng dấu `"committed_cleanup_pending"` nhưng chỉ thất bại ở bước xóa nhật ký phục hồi (`STORAGE_CLEANUP_FAILED`), `committed: true` và `cleanupPending: true` giúp `lastPersistedCases` phản ánh đúng bản mới đã lưu trong khi `hasUnsavedChanges: true` giữ khóa autosave cho tới khi **Thử dọn lại (`retryPersist` / `retryCleanup`)** thành công.

---

## 2. Thiết kế Schema `workspace v4`, Sao lưu an toàn và Chuyển đổi Dữ liệu Legacy

### 2.1. Schema `fraudguard-demo-workspace-v4`, điều phối hai khóa và bảo vệ toàn vẹn Storage

- **Khóa lưu trữ chính:** `WORKSPACE_STORAGE_KEY_V4 = "fraudguard-demo-workspace-v4"` với `schemaVersion: 4`, lưu trữ `{ schemaVersion: 4, rules, ruleSets, enterprises, legacyUnassigned, projects, transactions, auditLogs, investigationCases, legacyCaseArchive, migrationMeta, wf04DemoActive?, preDemoSnapshot? }`.
- **Khóa thành viên doanh nghiệp và nhật ký phục hồi:** `USERS_STORAGE_KEY_V1 = "fraudguard-demo-users-v1"` và `WORKSPACE_RECOVERY_JOURNAL_KEY_V4 = "fraudguard-demo-workspace-v4-recovery"`.
- **Sao lưu trước khi nâng cấp (`WORKSPACE_BACKUP_KEY_V3`):**
  - Khi phát hiện dữ liệu ở khóa cũ `fraudguard-demo-workspace-v3` hoặc `fraudguard-demo-workspace-v2` mà chưa có `v4`, `restoreWorkspaceSnapshot` ghi nguyên bản chuỗi JSON gốc sang khóa `fraudguard-demo-workspace-v3-backup` **trước** khi chạy migration và ghi `v4`; các khóa `v3` và `v2` gốc được giữ nguyên, không bị xóa.
  - Nếu bước ghi bản sao lưu `v3-backup` thất bại (`BACKUP_WRITE_FAILED`), hệ thống dừng ngay việc ghi `v4`, giữ nguyên khóa gốc và khóa tính năng tự động persist để tránh làm mất dữ liệu cũ.
- **Chặn ghi đè khi dữ liệu hỏng, phiên bản lạ hoặc đang chờ phục hồi/cleanup (`WorkspaceRestoreStatus`):**
  - Các trạng thái khôi phục gồm `"pending" | "ready" | "blocked_corrupt" | "blocked_unsupported_version" | "recovery_required"`.
  - Khi dữ liệu không hợp lệ hoặc phiên bản `schemaVersion` khác `4`, `canPersist` được đặt bằng `false`, hiển thị cảnh báo rõ ràng và tuyệt đối không lọc bỏ phần tử lỗi, không bịa thông tin thay thế và không ghi đè khóa lưu trữ đang có.
- **Đồng bộ tất cả các đường ghi qua `persistWorkspaceAndUsers`:**
  - Mọi điểm ghi workspace và danh sách thành viên (hook `useInvestigationCases` khi bật `persistUsersWithWorkspace: true`, 3 handler onboarding trong `FraudGuardDashboard.tsx` tại `L1043`, `L1091`, `L1123`, `applyAndPersistWf04Demo`, `restoreAndPersistPreDemoWorkspace`, `mergeAndPersistWorkspaceSlice`, `handleRetryStorage`, `recoverWorkspaceStorage` và `useEffect` autosave duy nhất tại `L341`) đều đi qua bộ điều phối chung `persistWorkspaceAndUsers`.

### 2.2. Quy tắc chuyển đổi dữ liệu cũ (`src/utils/case-migration.ts`) và Kết quả trên dữ liệu Seed

Hàm `migrateWorkspaceLegacyCases` (`CASE_MIGRATION_VERSION = 1`) xử lý các giao dịch có `caseId` hoặc `caseStatus` theo nguyên tắc **không tự bịa bằng chứng lịch sử**:

1. **Điều kiện để một hồ sơ cũ được chuyển thành `InvestigationCase` hoạt động:**
   - Mọi giao dịch có cùng `caseId` phải ánh xạ duy nhất qua `projectId` về cùng một `enterprise` đang ở trạng thái WF-01 `Operating` và có gói `Subscription` còn hiệu lực tại thời điểm mở case (`checkInvestigationCaseCreationEligibility(enterprise, createdAt)`).
   - Mọi giao dịch trong nhóm phải có `scoringSource === "AI"`, `riskLevel === "Abnormal"`, và có `alertId` hợp lệ.
   - Phải có thông tin người tạo (`createdBy` là `Operator` cùng doanh nghiệp) và thời điểm tạo `createdAt` chuẩn ISO-8601 có múi giờ (tuyệt đối không lấy `processedAt` hay thời điểm chạy migration làm `createdAt`).
   - Nếu nhiều giao dịch dùng chung một `caseId`, tất cả các trường trạng thái, người phụ trách, báo cáo, quyết định và ghi chú phải thống nhất (không chọn bừa giao dịch đầu tiên).
   - Khi ở trạng thái `Assigned` / `Investigating` / `Pending Review` / `Closed`, người phụ trách phải ánh xạ duy nhất tới một `user.id` hợp lệ cùng doanh nghiệp (`Assigned` chuyển sang `Investigating`; `Reported` chuyển sang `Pending Review` khi có báo cáo hợp lệ kèm nhãn bảo toàn `[Legacy ...]`; `Confirmed Fraud` / `False Alarm` / `Resolved` chuyển sang `Closed` khi có đủ báo cáo và quyết định xác nhận).
2. **Cách ly vào `legacyCaseArchive` khi thiếu bằng chứng hoặc mâu thuẫn:**
   - Bất kỳ bản ghi hay nhóm bản ghi nào thiếu một trong các điều kiện trên đều được giữ nguyên trạng trong `legacyCaseArchive` với `blocksAlertCreation: true` và `requiresManualReconciliation: true`, kèm mã lý do cụ thể (`MISSING_PROJECT_MAPPING`, `CROSS_TENANT_CONFLICT`, `INELIGIBLE_SOURCE_OR_RISK`, `MISSING_ALERT_ID`, `MISSING_CREATION_PROVENANCE`, `MISSING_OPERATING_SUBSCRIPTION`, `CONFLICTING_MULTI_TX_RECORDS`, `UNRESOLVED_ASSIGNEE_ID`, `INCOMPLETE_REPORT_OR_DECISION`, `UNSUPPORTED_LEGACY_STATUS`).
   - Các cảnh báo nằm trong `legacyCaseArchive` tiếp tục bị khóa không cho chọn tạo case mới (`isAlertBlockedByCasesOrLegacy`), không bị xóa `caseId`/`caseStatus`.
3. **Kết quả thực tế khi chạy trên bộ dữ liệu seed mặc định (`src/data/fraudguard-transactions.ts`):**
   - Tổng số giao dịch seed: **27 bản ghi**, trong đó có **13 bản ghi mang `caseId` legacy**.
   - **Số bản ghi chuyển thành `InvestigationCase` mới: `0`**.
   - **Số bản ghi đưa vào `legacyCaseArchive` cần đối chiếu: `13`** (do cả 5 doanh nghiệp trong `demoEnterprises` mặc định đều chưa khởi tạo `lifecycle` WF-01 và các giao dịch seed cũ không lưu `createdBy`/`createdAt` lúc mở case):
     - **6 bản ghi `AI + Abnormal` thiếu provenance mở case / thiếu WF-01 lifecycle (`MISSING_CREATION_PROVENANCE`):** `tx-fg-1023` (`CASE-FG-1023`, `Assigned`, chỉ có tên `"Nguyễn Văn An"`), `tx-003` (`CASE-2026-0899`, `Reported`, gán tên chéo tenant), `tx-008` (`CASE-2026-0891`, `Confirmed Fraud`, thiếu `caseDecision`), `tx-013` (`CASE-2026-0876`, `Investigating`, gán tên chéo tenant), `tx-022` (`CASE-2026-0690`, `Confirmed Fraud`, thiếu báo cáo và quyết định), `tx-024` (`CASE-2026-0610`, `False Alarm`, thiếu báo cáo và quyết định).
     - **4 bản ghi `AI + Normal` không đủ điều kiện mức rủi ro (`INELIGIBLE_SOURCE_OR_RISK`):** `tx-005` (`CASE-2026-0895`), `tx-011` (`CASE-2026-0887`), `tx-015` (`CASE-2026-0865`), `tx-017` (`CASE-2026-0850`).
     - **3 bản ghi nguồn `RULE` / `RULE_FALLBACK` (`INELIGIBLE_SOURCE_OR_RISK`):** `tx-014` (`CASE-2026-0871`, `RULE`), `tx-021` (`CASE-2026-0720`, `RULE_FALLBACK`), `tx-026` (`CASE-2026-0580`, `RULE_FALLBACK`).
   - Toàn bộ 13 bản ghi gốc được bảo toàn nguyên vẹn trong `transactions` và `legacyCaseArchive`; tải lại trang nhiều lần luôn giữ nguyên `0` migrated và `13` archived (lũy đẳng 100%).

---

## 3. Bộ dữ liệu Demo WF-04 đạt chuẩn WF-01 và Cách chạy Demo an toàn

Vì dữ liệu seed mặc định của ứng dụng chưa có doanh nghiệp ở trạng thái `Operating` kèm gói `Subscription` hợp lệ theo WF-01, tệp `src/data/wf04-demo.ts` cung cấp bộ dữ liệu demo WF-04 chuyên biệt được tạo bằng **chính chuỗi hàm nghiệp vụ thật của WF-01** (`snapshotRules -> testDraft -> publishSet -> handoverSet -> initializeEnterpriseLifecycle -> configureEnterpriseSubscriptionDuration -> submitEnterpriseConfigForApproval -> approveEnterpriseConfig -> activateEnterprise`):

| Doanh nghiệp Demo | Mã & Dự án | Trạng thái WF-01 & Thời hạn Subscription | Người dùng Demo (`user.id`) | Cảnh báo & Case khởi tạo |
|---|---|---|---|---|
| **Campus PowerGrid SME** | `ent-wf04-campus` (`proj-wf04-campus-main`, `proj-wf04-campus-lab`) | `Operating`, gói `Subscription` 6 tháng kích hoạt `2026-11-01T08:00:00.000Z` (hiệu lực đến `2027-05-01T08:00:00.000Z`, cố định không tự gia hạn khi reload) | `usr-wf04-op` (`Operator` Lê Minh Quân), `usr-wf04-inv-1` (`Investigator` Phạm Bảo Châu), `usr-wf04-inv-2` (`Investigator` Hoàng Gia Huy), `usr-wf04-sme` (`SME Admin` Võ Thảo Vy) | 4 cảnh báo `AI + Abnormal` chưa liên kết (`ALT-WF04-CAMPUS-01`..`04`), 1 cảnh báo `RULE + Abnormal` (`ALT-WF04-CAMPUS-RULE-05`), 1 giao dịch `AI + Normal` (`tx-wf04-campus-normal`). |
| **North Branch Utilities** | `ent-wf04-branch` (`proj-wf04-branch-meter`) | `Operating`, gói `Subscription` 6 tháng kích hoạt `2026-11-01T08:00:00.000Z` | `usr-wf04-branch-op` (`Operator` Đỗ Hải Đăng), `usr-wf04-branch-sme` (`SME Admin` Ngô Lan Chi) | 1 cảnh báo `AI + Abnormal` (`ALT-WF04-BRANCH-01`) dùng kiểm chứng cô lập chéo doanh nghiệp. |
| **Dormitory Grid Archive** | `ent-wf04-expired` (`proj-wf04-expired-meter`) | `Operating`, gói `Subscription` 1 tháng kích hoạt `2026-08-01T08:00:00.000Z`, **đã hết hạn** từ `2026-09-01T08:00:00.000Z` | `usr-wf04-exp-op` (`Operator` Trịnh Quốc Khánh), `usr-wf04-exp-inv` (`Investigator` Bùi Thu Hà), `usr-wf04-exp-sme` (`SME Admin` Phan Đức Trọng) | 1 case `Open` mở hợp lệ trước hạn (`CASE-WF04-EXP-01` gắn `ALT-WF04-EXP-PRE-01` lúc `2026-08-15T10:00:00.000Z`) + 1 cảnh báo `AI + Abnormal` phát sinh sau khi hết hạn (`ALT-WF04-EXP-NEW-02`, bị chặn tạo case mới). |

**Hướng dẫn bật và khôi phục kịch bản Demo WF-04 trên trình duyệt:**
1. Mở trang `/fraud-monitoring` (vào tab **Hàng đợi cảnh báo / Alert Queue** hoặc **Hàng đợi hồ sơ / Case Queue**).
2. Khi đang ở doanh nghiệp mặc định chưa đủ điều kiện WF-01, thanh ngữ cảnh hiển thị lý do chặn tạo case mới kèm nút **"Mở kịch bản demo WF-04" (`Load WF-04 Demo`)**.
3. Khi bấm nút này, `applyAndPersistWf04Demo` (`src/data/wf04-demo.ts:854`) gọi `applyWf04DemoWorkspace` và `persistWorkspaceAndUsers`, chụp toàn bộ trạng thái workspace và danh sách người dùng hiện tại vào `preDemoSnapshot`, hợp nhất bộ dữ liệu demo WF-04 vào workspace `v4` và đồng bộ `users v1`, rồi chuyển sang người dùng `Lê Minh Quân (Operator - Campus PowerGrid SME)`. Nếu ghi thất bại một phần, state và storage được giữ đồng bộ, không lật trạng thái demo nửa vời.
4. Bất kỳ lúc nào, người dùng có thể bấm **"Khôi phục dữ liệu trước demo" (`Restore Previous Workspace`)** để `restoreAndPersistPreDemoWorkspace` (`src/data/wf04-demo.ts:916`) hoàn trả nguyên vẹn dữ liệu trước khi mở demo; `preDemoSnapshot` được bảo vệ hai pha trong `v4` cho đến khi cả hai khóa lưu trữ ghi xong. Khi cả `v4` (`wf04DemoActive: false`, `preDemoSnapshot: undefined`) và `users v1` đã ghi xong mà chỉ lỗi xóa journal (`committed: true, cleanupPending: true`), wrapper và UI vẫn giữ nguyên trạng thái đã khôi phục (`wf04DemoActive: false`) và không kéo người dùng ngược lại chế độ demo.

---

## 4. Các bề mặt UI đã triển khai và Đồng bộ Caller liên quan

1. **Alert Queue (`src/components/fraudguard-dashboard/AlertsView.tsx`):**
   - Giữ nguyên bố cục danh sách/bảng, bộ lọc, tìm kiếm, phân trang và nút **Chi tiết (`Details`)**; sắp xếp cảnh báo mới nhất lên đầu theo timestamp đầy đủ đến mili-giây (ví dụ `.005Z` đứng trước `.001Z` dù giờ rút gọn giống nhau).
   - Chỉ bật checkbox chọn cho cảnh báo `AI + Abnormal` chưa gắn case và không vướng liên kết legacy khi người dùng hiện tại là `Operator` của doanh nghiệp đủ điều kiện `Operating + Subscription`. Các dòng không đủ điều kiện (Rule Alert, đã gắn case `Open`/`Closed`, vướng hồ sơ legacy, doanh nghiệp chưa `Operating` hoặc đã hết hạn `Subscription`) có checkbox bị vô hiệu hóa kèm giải thích rõ lý do.
   - Checkbox "Chọn tất cả" trên tiêu đề bảng chỉ chọn các cảnh báo đủ điều kiện trên **trang đang hiển thị**, tự động xóa toàn bộ lựa chọn và đóng modal tạo case ngay khi đổi bộ lọc, trang, tìm kiếm hoặc chuyển người dùng/doanh nghiệp.
   - Modal xác nhận tạo case (`useDialogFocus`, `role="dialog" aria-modal="true"`, đóng bằng `Escape`) kiểm tra lại toàn bộ lựa chọn bằng domain command trên state mới nhất (không tạo case một phần nếu có lỗi).
   - Các cảnh báo đã thuộc một `InvestigationCase` hiển thị huy hiệu mã hồ sơ + trạng thái WF-04 và nút **Mở hồ sơ (`View Case`)** cho đúng vai trò có quyền đọc.
2. **Case Queue và Chi tiết Hồ sơ (`src/components/fraudguard-dashboard/CasesView.tsx`):**
   - Hiển thị **1 dòng trên mỗi `InvestigationCase`** (không nhân bản theo số lượng cảnh báo thành viên), kèm số lượng cảnh báo liên kết, trạng thái theo đúng 4 giá trị WF-04 (`Open`, `Investigating`, `Pending Review`, `Closed`), người phụ trách tra cứu động theo `assignee.actorId` (đổi tên hiển thị của user không làm gãy liên kết), và thời gian cập nhật.
   - Đã hoàn thiện bố cục lưới 5 thẻ KPI (`.caseMetricsGrid` với `display: grid; gap: 12px;`) và đồng bộ khóa dịch tìm kiếm/mô tả KPI tiếng Việt và tiếng Anh (`wf04Phase2a.caseQueue.searchLabel`, `searchPlaceholder`, `allCasesMetricDesc`, `confirmedCasesMetricDesc`).
   - Với hồ sơ `Open`, `Operator` cùng doanh nghiệp có thể chọn `Investigator` cùng doanh nghiệp từ danh sách theo `user.id` để bấm **Giao việc (`Assign`)** hoặc bấm **Tự đảm nhận điều tra (`Self-Assign & Investigate`)**, chuyển trạng thái trực tiếp từ `Open` sang `Investigating` mà không qua bước `Assigned` trung gian.
   - Thực thi nghiêm ngặt read guards Phase 1: `Operator` (xem và điều phối trong doanh nghiệp mình), `Investigator` (chỉ thấy case giao cho `currentUser.id`, chỉ đọc trong Phase 2A), `SME Admin` (chỉ thấy báo cáo/kết luận của hồ sơ đã `Closed` qua `readConfirmedInvestigationReport`), `Platform Admin` / `Implementation Staff` / `Viewer` (`0` hồ sơ nội bộ, có thông báo phạm vi quyền).
   - Modal chi tiết hồ sơ tự đóng ngay nếu người dùng/vai trò thay đổi làm mất quyền đọc, hiển thị danh sách AI Alert thành viên, thông tin phân công, bản xem trước báo cáo/kết luận chỉ đọc và lịch sử `history`, cùng mục **Hồ sơ cũ lưu trữ chỉ đọc (`LegacyCaseArchiveSection`)**.
3. **Khóa đường ghi Legacy và đồng bộ các Caller phụ trợ (Bước F):**
   - `AlertCaseDrawer.tsx` (`wf04Managed`), `FraudGuardDashboard.tsx` (`handleUpdateTransaction` dùng `hasLegacyCaseFieldPatch`), `permissions.ts` (`canSaveMember`), `MembersView.tsx`, `ReportsView.tsx`, `AuditTrailView.tsx`, `PlatformHealthView.tsx`, `DashboardToolbar.tsx`, `TransactionRiskTable.tsx`, `NotificationCenter.tsx`, `ProductHeader.tsx`, `export-csv.ts`: khóa toàn bộ đường ghi case legacy và đồng bộ phạm vi đọc/đếm theo case.

---

## 5. Các đợt sửa lỗi sau Review Phase 2A

### 5.1. Đợt sửa lỗi Review lần 1: Validation khi restore, Timestamp trung thực và Điều phối lưu hai khóa (`docs/antigravity-wf04-phase2a-fixes.md`)

1. **Bước 1: Thiếu kiểm tra sâu cấu trúc lồng nhau khi khôi phục workspace (`src/utils/workspace-storage.ts`, `src/data/wf04-demo.ts`):**
   - *Nguyên nhân gốc rễ:* `isValidInvestigationCaseShape` trước đó chỉ kiểm tra `alerts`, `reports`, `history` là mảng bằng `Array.isArray(...)` mà không kiểm tra phần tử bên trong. Một payload v4 chứa `alerts: [null]` vẫn đi qua `restoreWorkspaceSnapshot` với `status: "ready"`, `canPersist: true`, rồi gây lỗi `TypeError: Cannot read properties of null (reading 'transactionId')` tại `src/utils/enterprise.ts:89` khi lọc giao dịch cho Investigator. Tương tự, `legacyCaseArchive`, `preDemoSnapshot: {}` và danh sách users cũng có thể lọt phần tử lỗi (`TypeError: snap.users is not iterable` trong `restorePreDemoWorkspace`).
   - *Cách sửa:* Bổ sung bộ validator runtime lồng nhau có thể tái sử dụng trong `src/utils/workspace-storage.ts`: `isValidAlertLinkShape` (`L326`), `isValidInvestigationCaseShape` (`L454`), `isValidLegacyArchiveShape` (`L601`), `isValidPreDemoSnapshotShape` (`L727`) và `validateWorkspacePayloadV4` (`L779`).
     - Kiểm tra từng `InvestigationCase`: `caseId`, `enterpriseId`, `status` hợp lệ; `alertIds` khác rỗng và không trùng; mọi phần tử `alerts` non-null có đủ `alertId`, `transactionId`, `transactionReference`, `projectId`, `scoringSource: "AI"`, `riskLevel: "Abnormal"`, `processedAt` chuẩn ISO và khớp 1-1 với `alertIds`; các actor refs, ISO timestamps, `creationEligibility`, phần tử `reports` + `alertResults`, tham chiếu báo cáo/kết luận cho `Pending Review`/`Closed`, và phần tử `history` đều đúng kiểu trước khi đưa vào state.
     - Kiểm tra `legacyCaseArchive`: bắt buộc có `archiveId`, `reasonCode`, `blocksAlertCreation: true`, `alertIds`, `transactionIds` khác rỗng và mọi phần tử `transactions` hợp lệ qua `isValidTransactionShape`, nhưng **vẫn cho phép thiếu provenance** để bảo toàn dữ liệu legacy đúng mục tiêu archive.
     - Kiểm tra `preDemoSnapshot`: từ chối `{}` hoặc slice/users sai kiểu bên trong, và bắt buộc có `preDemoSnapshot` hợp lệ khi `wf04DemoActive === true`.
     - Cập nhật `restoreEnterpriseUsers` (`parseEnterpriseUsersRaw` `L1117`) trả về lỗi `INVALID_WORKSPACE_SHAPE` hoặc `STORAGE_READ_FAILED` thay vì im lặng lọc bỏ phần tử lỗi hay tự bịa dữ liệu. Guard cả `applyWf04DemoWorkspace` và `restorePreDemoWorkspace` (`src/data/wf04-demo.ts:808–848`) bằng `isValidPreDemoSnapshotShape`. Mọi workspace hỏng trả `status: "blocked_corrupt"` (hoặc `"blocked_unsupported_version"`), `canPersist: false` và giữ nguyên raw storage.
2. **Bước 2: Hook tự cộng 1ms và fallback `Date.now()` che giấu timestamp không hợp lệ (`src/hooks/useInvestigationCases.ts`, `FraudGuardDashboard.tsx`, `AlertsView.tsx`):**
   - *Nguyên nhân gốc rễ:* `resolveMonotonicTimestampForCase` trong `src/hooks/useInvestigationCases.ts` tự cộng `+1ms` lên sau `updatedAt`/`history` khi đồng hồ truyền vào đi ngược (ví dụ ca tạo lúc `10:00Z` nhưng nhận đồng hồ `09:00Z` lại tự sửa thành `10:00:00.001Z`), đồng thời rơi về `Date.now()` nếu chuỗi timestamp sai định dạng.
   - *Cách sửa:* Gỡ bỏ hoàn toàn `resolveMonotonicTimestampForCase`. Trong `src/hooks/useInvestigationCases.ts`, `executeCreateCaseAction` (`L507`), `executeAssignInvestigatorAction` (`L586`) và `executeSelfAssignCaseAction` (`L660`) truyền trực tiếp `params.at !== undefined ? params.at : (params.now ?? defaultNowIso)()` vào hàm domain Phase 1. Khi đồng hồ đi ngược hoặc sai định dạng, domain trả `TIMESTAMP_OUT_OF_ORDER` hoặc `INVALID_TIMESTAMP`; `commitCommandResult` (`L860–862`) thoát ngay không làm thay đổi case, `history`, audit log hay storage. Trong `FraudGuardDashboard.tsx`, `mapCaseActionOutcome` (`L664`) ánh xạ hai mã lỗi này sang khóa thông báo tiếng Việt/Anh `wf04Phase2a.caseQueue.timestampOutOfOrderError` và `invalidTimestampError` (chỉ báo lỗi, không phát toast thành công). Kiểm tra xác nhận `AlertsView.tsx` đã sắp xếp danh sách cảnh báo theo timestamp đầy đủ đến mili-giây (`.005Z` đứng trước `.001Z` dù hiển thị giờ rút gọn giống nhau). Đồng thời trong demo không dùng bất kỳ cơ chế nào ngầm bịa thời điểm tương lai dựa theo case.
3. **Bước 3: Ghi rời rạc `workspace v4` và `users v1`, thiếu rollback khi chưa có key trước đó và thiếu cơ chế phục hồi (`src/utils/workspace-storage.ts`, `src/data/wf04-demo.ts`, `src/hooks/useInvestigationCases.ts`, `FraudGuardDashboard.tsx`, `src/config/translations.ts`):**
   - *Nguyên nhân gốc rễ:* Các đường ghi như `mergeAndPersistWorkspaceSlice`, bật/tắt demo và `useInvestigationCases` trước đó ghi `WORKSPACE_STORAGE_KEY_V4` và `USERS_STORAGE_KEY_V1` tách rời; hàm rollback chỉ khôi phục khi `previousRawV4 !== null` nên để sót khóa `v4` mới khi trước đó chưa tồn tại; lỗi `getItem` bị nuốt coi như key trống; và khôi phục demo có nguy cơ làm mất `preDemoSnapshot` nếu ghi `users` thất bại.
   - *Cách sửa:*
     - Tạo bộ điều phối dùng chung `persistWorkspaceAndUsers` (`src/utils/workspace-storage.ts:1871–2421`) và hàm phục hồi tường minh `recoverWorkspaceStorage` (`L2427–2441`), điều phối cả hai khóa cho toàn bộ caller (`persistWorkspaceSnapshot`, `mergeAndPersistWorkspaceSlice`, `applyAndPersistWf04Demo`, `restoreAndPersistPreDemoWorkspace`, `useInvestigationCases` với `persistUsersWithWorkspace: true`, 3 handler onboarding trong `FraudGuardDashboard.tsx` tại `L1043`, `L1091`, `L1123`, `handleRetryStorage` tại `L550` và `useEffect` autosave duy nhất tại `L340–365`).
     - Trước khi ghi, đọc trạng thái gốc của `v4`, `users v1` và `WORKSPACE_RECOVERY_JOURNAL_KEY_V4`; nếu `getItem` ném lỗi thì dừng ngay với `STORAGE_READ_FAILED` (`0` lần ghi). Nếu ghi `USERS_STORAGE_KEY_V1` thất bại, `restoreKeyToPriorState` (`L1805–1820`) khôi phục nguyên bản chuỗi cũ của `v4` hoặc gọi `removeItem` xóa khóa `v4` mới nếu trước đó khóa này chưa tồn tại (`rolledBack: true`). Nếu chính bước rollback cũng thất bại, ghi nhật ký phục hồi vào `WORKSPACE_RECOVERY_JOURNAL_KEY_V4` và trả `errorCode: "STORAGE_ROLLBACK_FAILED"`, `rollbackFailed: true`, `recoveryRequired: true`.
     - Khi khôi phục từ chế độ demo (`restoreAndPersistPreDemoWorkspace`), cơ chế hai pha `preservePreDemoSnapshotUntilCommitted` giữ `preDemoSnapshot` trong bản ghi `v4` bước 1 cho tới khi `USERS_STORAGE_KEY_V1` ghi thành công rồi mới dọn ở bước 2.
     - Hợp nhất `useEffect` autosave duy nhất có kiểm tra fingerprint `lastPersistedSnapshotRef` (`FraudGuardDashboard.tsx:340–365`), bổ sung 9 khóa song ngữ VI/EN trong `src/config/translations.ts`.

### 5.2. Đợt hoàn tất Recovery Storage sau Review: Phân biệt Commit với Cleanup Journal (`docs/antigravity-wf04-phase2a-recovery-fix.md`)

1. **Nguyên nhân lỗi đã tái hiện (`docs/antigravity-wf04-phase2a-recovery-fix.md` Mục 2):**
   - Trước đó ở cuối `persistWorkspaceAndUsers`, lỗi khi gọi `removeItem(WORKSPACE_RECOVERY_JOURNAL_KEY_V4)` bị nuốt trong `try/catch` rỗng sau khi hai khóa chính (`v4` và `users v1`) đã ghi thành công. Kết quả trả về `ok: true`, `recoveryRequired: false` trong khi journal `pending` cũ vẫn tồn tại. Khi người dùng tải lại trang (`restoreWorkspaceSnapshot`), hệ thống thấy journal chưa xóa nên ưu tiên `journal.priorWorkspaceV4Raw`, phục hồi ngược lại dữ liệu cũ trước recovery và làm mất toàn bộ hồ sơ, lịch sử và tên người dùng mới vừa lưu.
2. **Thiết kế Commit Marker và Cleanup Journal an toàn:**
   - **Kiểu trạng thái & Digest kiểm chứng (`src/utils/workspace-storage.ts`):**
     - Bổ sung `WorkspaceRecoveryCommitState = "pending" | "committed_cleanup_pending"` (`L69`), mã lỗi `STORAGE_CLEANUP_FAILED` (`L65`), và các trường trên `WorkspaceRecoveryJournal` (`L102–116`): `commitState?`, `committedV4Digest?`, `committedUsersDigest?`, `committedHasUsers?`, `committedAt?` tính bằng canonical JSON + SHA-256 đồng bộ (`sha256HexSync`, `canonicalizeJsonValue`, `computeCanonicalJsonDigestFromValue`, `computeRawJsonDigest`, `L971–1005`).
     - Duy trì tương thích ngược với các journal cũ không có `commitState`; `isValidRecoveryJournalShape` (`L1011–1068`) từ chối ngay journal có `commitState` lạ hoặc digest không hợp lệ/mâu thuẫn (`INVALID_WORKSPACE_SHAPE`).
   - **Thứ tự ghi hai pha khi có journal hiện hữu (`persistWorkspaceAndUsers`, `L1871–2421`):**
     - Ghi hai khóa chính (`v4` gồm cả hoàn tất hai pha `preDemoSnapshot` + `users v1`) -> ghi `commitState: "committed_cleanup_pending"` cùng digest SHA-256 vào `WORKSPACE_RECOVERY_JOURNAL_KEY_V4` (`L2325–2352`, giữ nguyên `priorWorkspaceV4Raw`/`priorUsersV1Raw`) -> mới gọi `cleanupRecoveryJournal` (`removeItem`, `L1822`).
     - Nếu bước ghi commit marker `"committed_cleanup_pending"` thất bại (`L2353–2400`), hệ thống hoàn tác cả hai khóa chính về trạng thái `prior*` ban đầu và trả kết quả lỗi có kiểm soát (`rolledBack: true, committed: false`, hoặc `STORAGE_ROLLBACK_FAILED` nếu rollback cũng lỗi), tuyệt đối không trả `ok: true`.
     - Nếu `removeItem` ném lỗi hoặc `storage.removeItem` không tồn tại, hàm trả `{ ok: false, committed: true, cleanupPending: true, recoveryRequired: true, rolledBack: false, rollbackFailed: false, errorCode: "STORAGE_CLEANUP_FAILED", recoveryJournal }` (không gắn `preservePreDemoSnapshot` và gỡ `pendingPreDemoSnapshot` khỏi `committedJournal` khi khôi phục demo đã hoàn tất `wf04DemoActive: false && preDemoSnapshot === undefined`).
   - **Khôi phục đúng bản đã commit khi reload (`restoreWorkspaceSnapshot`, `L1349–1470`):**
     - Khi đọc thấy `commitState === "committed_cleanup_pending"`, `restoreWorkspaceSnapshot` kiểm tra toàn vẹn và đối chiếu digest SHA-256 của `rawV4` và `rawUsers` thực tế trên storage. Nếu khớp -> nạp **dữ liệu mới đã commit** (tuyệt đối không dùng `priorWorkspaceV4Raw` và không bật lại `pendingPreDemoSnapshot`), trả `status: "recovery_required", canPersist: false, cleanupPending: true, errorCode: "STORAGE_CLEANUP_FAILED"`. Nếu thiếu `rawV4` hoặc digest lệch -> khóa ngay ở `"blocked_corrupt"`, `canPersist: false`.
     - Journal ở trạng thái `"pending"` thật (chưa ghi commit marker) hoặc trường hợp chưa commit vẫn tiếp tục khôi phục từ `priorWorkspaceV4Raw`/`priorUsersV1Raw` như thiết kế ban đầu.
   - **Retry cleanup lũy đẳng & bảo toàn hoàn tất Demo Restore (`useInvestigationCases.ts`, `wf04-demo.ts`, `FraudGuardDashboard.tsx`, `translations.ts`):**
     - Khi gọi `recoverWorkspaceStorage` (`L2427–2441`) hoặc `useInvestigationCases.retryPersist` (`L1005`) với dữ liệu trùng digest đã commit (`L2088–2105`), hệ thống **chỉ gọi lại `removeItem(journal)` với `0` lần ghi đè `v4`/`users`**, không thực thi lại command và không nhân đôi case/report/audit hay thay đổi timestamp (`createdAt`, `assignedAt`, `updatedAt`).
     - `applyAndPersistWf04Demo` (`src/data/wf04-demo.ts:882–889`) và `restoreAndPersistPreDemoWorkspace` (`L965–973`), cùng `FraudGuardDashboard.tsx` (`handleCoordinatedFailure` `L213–249`, `applyRestoredResult` `L251–322`, `handleRestorePreDemo` `L478–548`, `handleRetryStorage` `L550–630`) nhận diện `committed && cleanupPending` để giữ trạng thái demo restore đã hoàn tất (`wf04DemoActive: false`, `preDemoSnapshot: undefined`, users pre-demo), khóa autosave `useEffect` (`L342`: `cleanupPending` true -> dừng) và hiển thị banner + nút **Thử dọn lại** (`wf04Phase2a.storage.cleanupRequired`, `cleanupPendingBadge`, `retryCleanupBtn`, `translations.ts` `L799–801` và `L1719–1721`).

### 5.3. Ranh giới Recovery, Tính đồng thời và Lưu trữ nhiều khóa

- **Phạm vi đồng thời một tab:** `latestCasesRef` và `persistWorkspaceAndUsers` bảo đảm nhất quán tuần tự cho các thao tác trong **cùng một tab/phiên hiện tại**; Phase 2A không đồng bộ ghi giữa nhiều tab trình duyệt mở song song.
- **Giới hạn khi nhiều thao tác storage liên tiếp cùng thất bại (`localStorage` không có transaction nhiều khóa):** `localStorage` của trình duyệt không hỗ trợ transaction nguyên tử xuyên nhiều key (`v4`, `users v1`, `v4-recovery`).
  - Khi hai khóa chính đã ghi xong nhưng `removeItem(journal)` liên tiếp thất bại, dữ liệu mới đã commit được giữ toàn vẹn nhờ marker `"committed_cleanup_pending"` và digest SHA-256, trong khi autosave bị khóa cho tới khi retry cleanup thành công.
  - Ngược lại, nếu ở tình huống lỗi kép trước khi commit (ghi `v4` xong, ghi `users v1` hoặc ghi commit marker lỗi **và** bước rollback cả hai khóa cũng thất bại, hoặc chính `setItem` journal lỗi liên tiếp), trình duyệt không thể bảo đảm atomic tuyệt đối; hệ thống ghi nhận trạng thái không nhất quán (`recovery_required` / `STORAGE_ROLLBACK_FAILED`) và khóa autosave để ngăn mất dữ liệu âm thầm.
- **Ranh giới backend:** Tính nguyên tử CSDL (`UNIQUE(alert_id)`), kiểm soát xung đột đồng thời đa người dùng (ETag/optimistic locking) và xác thực thời gian máy chủ thuộc hợp đồng BE/AI ngoài phạm vi Phase 2A.

---

## 6. Ma trận Truy vết, Kết quả Kiểm thử Tự động và Bằng chứng Trình duyệt

### 6.1. Ma trận truy vết Phase 2A (`tests/wf04-phase2a.test.cjs`, `tests/wf04-phase2a-fixes.test.cjs` & `tests/wf04-phase2a-recovery.test.cjs`)

**A. 9 kịch bản Phase 2A cốt lõi (`tests/wf04-phase2a.test.cjs`):**

| # | Yêu cầu nghiệm thu (`antigravity-wf04-phase2a.md` Mục 9) | Hàm / Component thực thi chính | Test case (`tests/wf04-phase2a.test.cjs`) |
|---|---|---|---|
| 1 | Tạo case từ 2 alert: 1 case `Open`, đủ 2 liên kết; reload giữ nguyên; bấm lặp không tạo case thứ hai | `executeCreateCaseAction`, `useInvestigationCases`, `restoreWorkspaceSnapshot`, `AlertsView.tsx` | `L170`: `Scenario 1: Operator selects 2 eligible AI Abnormal alerts -> creates 1 Open case with both links, persists across reload, and blocks rapid double-submit` |
| 2 | Tạo case 1 alert hợp lệ; chặn trộn tenant, Rule, Normal, alert đã gắn case `Open`/`Closed` hoặc vướng legacy | `isAlertBlockedByCasesOrLegacy`, `executeCreateCaseAction`, `AlertsView.tsx` | `L334`: `Scenario 2: 1-alert valid creation; mixed-tenant, RULE, Normal, Open/Closed linked, and legacy unresolved alerts are blocked in handler and disabled in AlertsView` |
| 3 | Đổi trang/filter/user/tenant xóa selection; đổi quyền khi đang mở detail đóng ngay modal và chặn ghi | `AlertsView.tsx`, `CasesView.tsx`, `FraudGuardDashboard.tsx` (`handleSwitchUser`) | `L540`: `Scenario 3: Live role/tenant switch clears selection permissions and revokes unauthorized Case Detail Drawer view immediately` |
| 4 | Giao Investigator theo ID hoặc Operator tự đảm nhận chuyển `Open -> Investigating`; giữ qua reload và khi đổi tên user; chặn Investigator khác | `executeAssignInvestigatorAction`, `executeSelfAssignCaseAction`, `CasesView.tsx`, `transactionsForEnterprise` | `L660`: `Scenario 4: Assign Investigator by ID and Operator self-assign transition Open -> Investigating immediately, persist across reload, survive user display-name rename, and block unassigned/foreign Investigators` |
| 5 | Hết hạn Subscription: chặn tạo case mới kèm lý do; vẫn cho xem, phân công, tự đảm nhận case mở hợp lệ trước hạn | `checkInvestigationCaseCreationEligibility`, `wf04-demo.ts` (`ent-wf04-expired`, `CASE-WF04-EXP-01`), `AlertsView.tsx`, `CasesView.tsx` | `L855`: `Scenario 5: Expired WF-01 Subscription blocks creating a new case with explicit reason while pre-expiry Open case continues assignment and self-investigation` |
| 6 | Migration dữ liệu cũ: 13 seed -> `0` migrated / `13` archived; chuyển đúng dữ liệu đủ điều kiện; cách ly mâu thuẫn; lũy đẳng; lọc quyền xem archive | `migrateWorkspaceLegacyCases`, `canActorViewLegacyArchiveEntry` (`src/utils/case-migration.ts`) | `L944`: `Scenario 6: Controlled legacy migration handles default seeds, eligible single/multi-tx cases across all statuses, conflicting multi-tx, cross-tenant conflicts, missing provenance, idempotency, and archive visibility` |
| 7 | Sao lưu `v3-backup`, khóa khi JSON hỏng / `schemaVersion` lạ / lỗi backup, giữ state trong bộ nhớ + `retryPersist` khi lỗi quota, onboarding writer bảo toàn cases, bật/tắt demo an toàn | `restoreWorkspaceSnapshot`, `persistWorkspaceAndUsers`, `mergeAndPersistWorkspaceSlice`, `applyWf04DemoWorkspace`, `restorePreDemoWorkspace` | `L1238`: `Scenario 7: Workspace storage v4 backup, corrupt JSON lock, unsupported schemaVersion lock, quota failure + retry, onboarding slice writer, and demo bundle round-trip` |
| 8 | Case Queue & KPI đếm theo case; đủ 4 tab trạng thái WF-04; khóa toàn bộ đường ghi legacy trên `AlertCaseDrawer` và `handleUpdateTransaction` | `CasesView.tsx`, `AlertCaseDrawer.tsx`, `countActiveInvestigationCases`, `hasLegacyCaseFieldPatch` | `L1448`: `Scenario 8: Case Queue renders 1 row per case (never per alert), KPI counts unique active cases, status tabs cover all 4 WF-04 statuses, and AlertCaseDrawer locks out legacy mutations` |
| 9 | Guard đổi vai trò thành viên (`canSaveMember`) theo ID, cô lập log `auditForUser`, thông báo, xuất CSV, `ReportsView` và `PlatformHealthView` (`0` feedback tự động) | `canSaveMember`, `auditForUser`, `buildCaseNotifications`, `exportTransactionsCSV`, `exportInvestigationCasesCSV`, `ReportsView.tsx`, `PlatformHealthView.tsx` | `L1605`: `Scenario 9: Downstream integrations enforce WF-04 role/tenant/confirmed-only boundaries across canSaveMember, auditForUser, notifications, CSV exports, ReportsView, and PlatformHealthView` |

**B. 9 Regression test sửa lỗi Review lần 1 (`tests/wf04-phase2a-fixes.test.cjs`):**

| # | Mục kiểm thử (`antigravity-wf04-phase2a-fixes.md`) | Kết quả trước sửa (`#69`) | Test case (`tests/wf04-phase2a-fixes.test.cjs`) |
|---|---|---|---|
| 1 | `Section 2.1`: chặn `alerts: [null]` / alert thiếu `transactionId` tại restore, không crash `transactionsForEnterprise` | **FAIL** (lọt qua restore, crash `TypeError` khi đọc `transactionId`) | `L241`: `Section 2.1: Case with alerts: [null] or alert link missing transactionId/wrong type is blocked at restore boundary without crashing downstream callers` |
| 2 | `Section 2.2 & 2.3`: chặn `reports`/`history` chứa `null`, `alertIds` trùng/lệch, trạng thái sai, tham chiếu `Pending Review`/`Closed` hỏng | **FAIL** (`status: 'ready'` thay vì `'blocked_corrupt'`) | `L300`: `Section 2.2 & 2.3: Case with null/invalid reports or history, duplicate/mismatched alertIds, invalid status, or broken Pending Review/Closed report references is rejected at restore` |
| 3 | `Section 2.4–2.6`: kiểm tra `legacyCaseArchive`, `preDemoSnapshot: {}`, `wf04DemoActive: true` thiếu snapshot, nhưng vẫn chấp nhận workspace/archive/snapshot hợp lệ | **FAIL** (crash `snap.users is not iterable` trên `{}`) | `L377`: `Section 2.4, 2.5 & 2.6: Restore validates legacyCaseArchive and preDemoSnapshot while accepting valid v4 workspace, legacy archive without provenance, and valid preDemoSnapshot` |
| 4 | `Section 3.1–3.5`: `assign`/`selfAssign` không cộng `+1ms` hay fallback `Date.now()`; chấp nhận bằng mốc/offset tương đương; giữ continuation sau expiry | **FAIL** (đồng hồ `09:00` bị sửa thành `10:00:00.001Z`) | `L452`: `Section 3.1–3.5: executeAssignInvestigatorAction and executeSelfAssignCaseAction never rewrite or clamp timestamps (+1ms or Date.now() fallback)` |
| 5 | `Section 3.6`: `AlertsView` sắp xếp cảnh báo mới nhất theo timestamp đầy đủ đến mili-giây (`.005Z` trước `.001Z`) | **PASS** (logic sort hiện tại đã đúng) | `L571`: `Section 3.6: AlertsView sorts newest alerts first by full millisecond timestamp (.005Z before .001Z) even when display time is identical` |
| 6 | `Section 4.1–4.5`: xóa `v4` mới tạo khi `users` lỗi, giữ nguyên hai khóa cũ khi lỗi, dừng khi `getItem` lỗi, báo `STORAGE_ROLLBACK_FAILED` khi rollback lỗi | **FAIL** (để sót khóa `v4` mới, nuốt lỗi đọc `getItem`) | `L607`: `Section 4.1–4.5: Workspace + users persistence rolls back newly created v4 key when prior v4 was absent, aborts on prior-read error, and reports recovery state if rollback fails` |
| 7 | `Section 4.5 & 4.7`: ghi `WORKSPACE_RECOVERY_JOURNAL_KEY_V4`, khóa autosave đè, hiện `"recovery_required"` khi reload, phục hồi sạch qua `recoverWorkspaceStorage` | Bổ sung mở rộng sau sửa | `L719`: `Section 4.5 & 4.7: Rollback failure writes recovery journal, blocks automatic overwrites, surfaces recovery_required on reload, and recovers cleanly via recoverWorkspaceStorage` |
| 8 | `Section 4.6`: `applyAndPersistWf04Demo` và `restoreAndPersistPreDemoWorkspace` giữ nguyên `preDemoSnapshot` qua lỗi `users` và lỗi rollback | Bổ sung mở rộng sau sửa | `L809`: `Section 4.6: Coordinated applyAndPersistWf04Demo and restoreAndPersistPreDemoWorkspace preserve preDemoSnapshot across partial users failure and rollback failure` |
| 9 | `Section 3 & 4 Hook Integration`: `useInvestigationCases` phối hợp lưu `v4` + `users v1`, chặn clock lùi, giữ state khi rollback và phục hồi qua `retryPersist()` | Bổ sung mở rộng sau sửa | `L934`: `Section 3 & 4 Hook Integration: useInvestigationCases coordinates workspace + users writes, rejects backward/malformed clocks, rolls back v4 on users failure, and recovers via retryPersist without duplicating cases or audits` |

**C. 7 Regression test hoàn tất Recovery Cleanup (`tests/wf04-phase2a-recovery.test.cjs`):**

| # | Mục kiểm thử (`antigravity-wf04-phase2a-recovery-fix.md` Mục 4) | Kết quả trước sửa (`#87`) | Test case (`tests/wf04-phase2a-recovery.test.cjs`) |
|---|---|---|---|
| 1 | `Section 2 & 4.1–4.2 (a)`: ghi `v4` + `users` thành công nhưng `removeItem(journal)` lỗi -> không được báo `ok: true, recoveryRequired: false` | **FAIL** (`ok: true !== false`) | `L262`: `Section 2 & 4.1–4.2 (a): When v4 + users succeed but removeItem(recovery journal) fails, recoverWorkspaceStorage must NOT report ok:true / recoveryRequired:false` |
| 2 | `Section 2 & 4.1–4.2 (b)`: reload ngay sau khi đã commit hai khóa chính nhưng còn journal -> phải nạp dữ liệu mới (`CASE-WF04-COMMITTED-NEW`, operator mới), không quay về `priorWorkspaceV4Raw` | **FAIL** (tải lại bản cũ từ `priorWorkspaceV4Raw`) | `L278`: `Section 2 & 4.1–4.2 (b): Reloading after committed primary writes + journal removeItem failure must load NEW committed workspace & users (never OLD priorWorkspaceV4Raw)` |
| 3 | `Section 4.3`: autosave bị khóa khi đang chờ dọn; sau khi hết lỗi `removeItem`, `recoverWorkspaceStorage` dọn journal với `0` lần ghi đè `v4`/`users` và reload về `"ready"` | Bổ sung sau sửa | `L300`: `Section 4.3: Retrying cleanup after removeItem fault clears deletes journal without losing committed data and unlocks ready reload (blocking autosave beforehand)` |
| 4 | `Section 4.4`: `useInvestigationCases` (`persistUsersWithWorkspace: true`) giữ `committed: true, cleanupPending: true` và lặp `retryPersist` không tạo thêm case/report/audit hay đổi timestamp | Bổ sung sau sửa | `L359`: `Section 4.4: Repeated cleanup retries via useInvestigationCases.retryPersist never duplicate cases, reports, audits, or mutate timestamps` |
| 5 | `Section 4.5`: journal `pending` thật, lỗi ghi `v4`/`users` (rollback về `priorWorkspaceV4Raw`) và lỗi rollback (`STORAGE_ROLLBACK_FAILED`) vẫn đi đúng luồng recovery cũ (`committed: false`) | Bổ sung sau sửa | `L551`: `Section 4.5: True pending journal and primary/users/rollback failures continue on recovery path without being treated as committed` |
| 6 | `Section 4.6`: lỗi ghi commit marker hoàn tác cả hai khóa về raw cũ; lỗi cleanup lặp lại giữ nguyên trạng thái; tương thích journal cũ; chặn `blocked_corrupt` khi `commitState` lạ hoặc lệch digest SHA-256 | Bổ sung sau sửa | `L687`: `Section 4.6: Commit-marker write failure rolls back both primary keys, repeated cleanup errors preserve recovery state, and legacy/corrupt journals are handled safely` |
| 7 | `Section 4.7`: demo restore giữ `preDemoSnapshot` khi chưa commit; khi đã commit nhưng lỗi cleanup trả `wf04DemoActive: false, preDemoSnapshot: undefined`, reload không kéo lại demo, cùng kiểm tra 3 khóa dịch VI/EN | Bổ sung sau sửa | `L843`: `Section 4.7: Demo restore preserves preDemoSnapshot while uncommitted, finalizes on commit even if journal cleanup fails, and never pulls user back into demo mode on reload` |

### 6.2. Kết quả chạy kiểm tra tự động (`frontend/LCS`)

1. **Tái hiện lỗi trước khi sửa ở đợt Review lần 1 (`#69`):**
   - `node --test tests/wf04-phase2a-fixes.test.cjs`: **exit code `1`** (`6` tests: **`1` pass, `5` fail**).
2. **Tái hiện lỗi trước khi sửa ở đợt hoàn tất Recovery Cleanup (`#87`):**
   - `node --test tests/wf04-phase2a-recovery.test.cjs`: **exit code `1`** (`2` tests: **`0` pass, `2` fail**, tái hiện `recoverWorkspaceStorage` trả nhầm `ok: true` khi `removeItem(journal)` lỗi và `restoreWorkspaceSnapshot` nạp ngược `priorWorkspaceV4Raw`).
3. **Sau khi hoàn tất toàn bộ mã nguồn & kiểm thử (`@tester` `#95` & `@verifier` `#99` chạy tuần tự trên `.next` độc lập):**
   - `node --test tests/wf04-phase2a-recovery.test.cjs`: **exit code `0`** (**`7` tests: `7` pass, `0` fail, `0` skipped**).
   - `npm run check`: **exit code `0`**
     - `npm run lint` (`eslint src --max-warnings=0`): **0 warnings, 0 errors** (exit code `0`).
     - `npm run typecheck` (`next typegen && tsc --noEmit`): **`Route types generated successfully`, 0 lỗi TypeScript** (exit code `0`).
     - `npm test` (`node --test tests/*.test.cjs`): **`136` tests, `136` pass, `0` fail, `0` cancelled, `0` skipped, `0` todo** trên cả **6 tệp test**:
       - `tests/enterprise-lifecycle.test.cjs`: `11/11` pass.
       - `tests/investigation-case.test.cjs`: `17/17` pass.
       - `tests/rule-sandbox.test.cjs`: `83/83` pass.
       - `tests/wf04-phase2a.test.cjs`: `9/9` pass (giữ nguyên không sửa assertion).
       - `tests/wf04-phase2a-fixes.test.cjs`: `9/9` pass (giữ nguyên không sửa assertion).
       - `tests/wf04-phase2a-recovery.test.cjs`: `7/7` pass.
   - `npm run build` (`next build` chạy độc lập tuần tự, không chạy chung với dev server): **exit code `0`**
     - Next.js `15.5.25`, `Compiled successfully in 3.1s`, kiểm tra lint và kiểu tĩnh đạt, `Generating static pages (6/6)` (`/`, `/_not-found`, `/fraud-monitoring`, `/login`).

### 6.3. Tách bạch Kiểm thử Mô phỏng Lỗi Storage (`StorageLike`) và Thao tác Trực tiếp trên Trình duyệt

1. **Phần kiểm chứng bằng test tự động dùng test double `StorageLike` (`tests/wf04-phase2a-fixes.test.cjs` và `tests/wf04-phase2a-recovery.test.cjs`):**
   - Toàn bộ các tình huống lỗi storage mô phỏng gồm: hỏng `alerts: [null]` / `reports: [null]` / `legacyCaseArchive` lỗi / `preDemoSnapshot: {}`, đồng hồ đi ngược/sai định dạng, sắp xếp `.005Z` vs `.001Z`, lỗi ghi `users` khi chưa có `v4`, lỗi `getItem`, rollback thất bại tạo `WORKSPACE_RECOVERY_JOURNAL_KEY_V4`, lỗi `removeItem(journal)` sau khi đã commit hai khóa chính, reload nạp đúng bản mới đã commit, lỗi ghi commit marker, lệch digest SHA-256 và `retryPersist()` lũy đẳng trên `useInvestigationCases` đều được kiểm chứng qua `StorageLike` giả lập trong 16 regression tests (`9` + `7`) và Node VM.
   - Các kịch bản tiêm lỗi `Storage.prototype.setItem` hay chèn JSON hỏng trực tiếp qua `page.evaluate()` trên trình duyệt không thực hiện ở tầng browser do giới hạn sandbox `webview_browser`, đúng với phạm vi hướng dẫn tại `docs/antigravity-wf04-phase2a-recovery-fix.md` Mục 1.
2. **Phần đã thao tác trực tiếp trên trình duyệt (`http://localhost:3005/fraud-monitoring`) sau bản build cuối:**
   - **Độ ổn định runtime:** `0` console errors, `0` uncaught page errors.
   - **Luồng thao tác thực tế đã chạy trên UI:**
     - Mở chế độ mẫu qua **"Mở kịch bản demo WF-04"**.
     - Tạo liên tiếp hồ sơ **`CASE-WF04-0002`** và **`CASE-WF04-0003`** từ cảnh báo `AI + Abnormal`.
     - Phân công **`Phạm Bảo Châu`** (`Investigator`) và tự đảm nhận chuyển trạng thái sang **`Đang điều tra` (`Investigating`)**.
     - Thực hiện **`page.reload()`** kiểm chứng dữ liệu hồ sơ, người phụ trách và danh sách thành viên giữ nguyên sau khi tải lại trang.
     - Chuyển đổi ngôn ngữ **EN / VI** kiểm tra hiển thị song ngữ sạch.
     - Bấm **"Khôi phục dữ liệu trước demo"** hoàn trả đúng workspace trước khi bật demo.
     - Kiểm tra giao diện **Light / Dark mode** cùng hai kích thước **`1440x900`** và **`375x812`** (`0` tràn ngang cấp trang).
   - **Bằng chứng ảnh chụp màn hình đã xác nhận tồn tại trên đĩa:**
     - Đợt kiểm thử sau hoàn tất Recovery Fix (`7db9cda8-c5cb-405f-989c-86e0ac499f81/browser_sandbox/screenshots/`):
       - `C:/Users/gmt/.gemini/antigravity/brain/7db9cda8-c5cb-405f-989c-86e0ac499f81/browser_sandbox/screenshots/step_41_shot_1.png`
       - `C:/Users/gmt/.gemini/antigravity/brain/7db9cda8-c5cb-405f-989c-86e0ac499f81/browser_sandbox/screenshots/step_55_shot_1.png`
       - `C:/Users/gmt/.gemini/antigravity/brain/7db9cda8-c5cb-405f-989c-86e0ac499f81/browser_sandbox/screenshots/step_63_shot_1.png`
     - Các ảnh chụp đợt Phase 2A trước đó còn lưu trên đĩa:
       - `C:/Users/gmt/.gemini/antigravity/brain/20f42f28-2c29-4e80-95bb-a4c55280026b/browser_sandbox/screenshots/step_18_shot_1_wf04-demo-alerts-light.png`
       - `C:/Users/gmt/.gemini/antigravity/brain/eb6ff764-9cc9-4569-8c16-c4074d250f4d/browser_evidence/20f42f28-2c29-4e80-95bb-a4c55280026b/final_step_287.png`
       - `C:/Users/gmt/.gemini/antigravity/brain/0650b1a2-eb3e-437c-877f-9d7cceeab551/browser_sandbox/screenshots/step_65_shot_1_wf04-step1-cases-persisted.png`
       - `C:/Users/gmt/.gemini/antigravity/brain/eb6ff764-9cc9-4569-8c16-c4074d250f4d/browser_evidence/0650b1a2-eb3e-437c-877f-9d7cceeab551/final_step_108.png`

---

## 7. Các hạng mục còn lại cho Phase 2B, Luồng Feedback (Mục 7.1) và Điểm dừng Review

Phase 2A (kèm cả hai đợt sửa lỗi sau review) dừng đúng tại ranh giới đã quy định trong `docs/antigravity-wf04-phase2a.md`, `docs/antigravity-wf04-phase2a-fixes.md` và `docs/antigravity-wf04-phase2a-recovery-fix.md` để phục vụ review. Các phần chưa triển khai bao gồm:

1. **Hạng mục thuộc WF-04 Phase 2B (Soạn thảo, gửi, yêu cầu bổ sung và duyệt báo cáo trên UI):**
   - Giao diện dành cho `Investigator` được giao (hoặc `Operator` tự đảm nhận điều tra) xem dữ liệu điện năng đối chiếu quanh thời điểm bất thường và nhập báo cáo điều tra chung (`submitInvestigationReport`), gồm phần tổng kết chung (`summary`) và kết quả đề xuất (`resultText`) + bằng chứng (`evidence`) riêng cho **từng AI Alert** thành viên (`Investigating -> Pending Review`).
   - Giao diện gửi lại báo cáo tạo phiên bản mới (`version` tăng dần) và xem đối chiếu lịch sử đầy đủ các phiên bản báo cáo đã gửi.
   - Giao diện để `Operator` nhập lý do bắt buộc và yêu cầu bổ sung báo cáo (`requestInvestigationCaseRevision`: `Pending Review -> Investigating`, bảo toàn các phiên bản báo cáo trước đó).
   - Giao diện để `Operator` xác nhận kết luận và đóng hồ sơ (`confirmInvestigationCaseReport`: `Pending Review -> Closed`), truyền đúng cặp `(reportId, reportVersion)` của phiên bản báo cáo đang mở trên màn hình để chống duyệt nhầm bản cũ, bao gồm cả bước tự xác nhận tách biệt khi `Operator` tự điều tra.
   - Hoàn thiện hiển thị báo cáo chi tiết từng cảnh báo và kết luận xác nhận trên `ReportsView.tsx`.
2. **Hạng mục thuộc đợt riêng sau Phase 2B (Mục 7.1 - SME Admin gửi feedback cho Platform Admin):**
   - Giao diện và model để `SME Admin` chọn báo cáo/kết luận đã xác nhận của doanh nghiệp mình, bổ sung nhận xét và chủ động xác nhận gửi feedback cho `Platform Admin`.
   - Giao diện để `Platform Admin` tiếp nhận và xem đúng phạm vi dữ liệu được doanh nghiệp chủ động gửi kèm trong feedback (tách biệt hoàn toàn khỏi thao tác đóng case nội bộ).
3. **Các điểm phụ thuộc Backend / AI Service sau khi có Contract:**
   - Ràng buộc duy nhất và giao dịch nguyên tử dưới thao tác đồng thời trên server (`UNIQUE(alert_id)`, optimistic concurrency cho phiên bản báo cáo, đồng bộ đa tab/đa phiên).
   - Chuẩn hóa bộ enum kết luận nghiệp vụ và quy tắc ánh xạ kết quả từng alert sang nhãn đánh giá AI khi thống nhất xong với đội AI.
