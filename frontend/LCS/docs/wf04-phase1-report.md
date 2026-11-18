# Báo cáo triển khai WF-04 Phase 1 (Cập nhật sau sửa lỗi Review)

Ngày báo cáo: 15/11/2026  
Phạm vi: `frontend/LCS` (chỉ lớp domain thuần và unit test; chưa nối UI, hooks, `localStorage` hoặc dịch vụ BE/AI).  
Nhánh làm việc: `feat/FE-DashboardPage`.  
Hiện trạng git hiện tại: giữ nguyên toàn bộ 34 đường dẫn modified (`M`) và 15 đường dẫn untracked (`??`) có sẵn trên nhánh làm việc (cộng thêm `docs/antigravity-wf04-phase1-fixes.md` và `4` file mới của Phase 1 thành **`20` đường dẫn `??`**, trong đó `docs/task.md` vốn là untracked); không thêm npm dependency mới.

---

## 1. Danh sách file thay đổi, phạm vi và đối chiếu nguồn yêu cầu

### 1.1. Danh sách file Phase 1 WF-04

| Đường dẫn (`frontend/LCS/...`) | Hành động | Mục đích & Phạm vi |
|---|---|---|
| `src/types/investigation-case.ts` | Thêm mới & cập nhật sau review | Định nghĩa model domain độc lập cho WF-04: `InvestigationCaseStatus`, `InvestigationCaseAssignmentMode`, `InvestigationCaseEventType`, `InvestigationCase`, `InvestigationCaseAlertLink`, `InvestigationCaseCreationEligibility`, `InvestigationCaseReportVersion`, `InvestigationCaseAlertReportItem`, `InvestigationCaseConclusion`, `InvestigationCaseEvent`, `ConfirmedInvestigationReportView`, `InvestigationCaseReadAccess`, các input command (bắt buộc `existingCases` trên `CreateInvestigationCaseInput`, bắt buộc `reportId` + `reportVersion` trên `ConfirmInvestigationCaseReportInput`), `InvestigationCaseResult<Extra>` và 57 mã lỗi có kiểu (`InvestigationCaseErrorCode`). Tên type không xung đột với `CaseStatus`, `InvestigationReport`, `CaseDecision`, `TransactionRisk` legacy. |
| `src/utils/investigation-case.ts` | Thêm mới & cập nhật sau review | Triển khai 10 hàm thuần bất biến công khai cho WF-04: kiểm tra điều kiện mở case tái sử dụng helper WF-01 (`enterprise-lifecycle.ts`), kiểm tra quyền đọc nội bộ & báo cáo xác nhận, tạo case đa/đơn alert nguyên tử (bắt buộc truyền `existingCases`, không mặc định `[]`), phân công Investigator theo `user.id` hoặc Operator tự đảm nhận (`Open → Investigating`), gửi báo cáo đa phiên bản có kết quả/bằng chứng từng alert (`Investigating → Pending Review`), yêu cầu bổ sung kèm lý do (`Pending Review → Investigating`), xác nhận đúng phiên bản báo cáo đang hiển thị & đóng case tách riêng đối tượng kết luận (`Pending Review → Closed`), cùng các helper nội bộ `parseIsoTimestampField` / `resolveMonotonicTransitionTimestamp` chặn thời gian đi ngược lịch sử trên toàn bộ 5 command hậu tạo. |
| `tests/investigation-case.test.cjs` | Thêm mới & bổ sung regression test | 17 unit test hành vi chạy qua Node test runner (`node --test`) dùng lại pattern biên dịch TypeScript + VM từ `tests/enterprise-lifecycle.test.cjs`, bao phủ đầy đủ 14 nhóm bắt buộc tại Mục 6 của `docs/antigravity-wf04-phase1.md` cùng 3 regression test (`Tests 15–17`) cho 3 lỗi phát hiện sau review, kiểm chứng helper WF-01 thật, bất biến input/output (`deepFreeze`) và dữ liệu fixture thực tế. |
| `docs/wf04-phase1-report.md` | Thêm mới & cập nhật sau review | Tài liệu bàn giao Phase 1 WF-04, phân tích nguyên nhân/cách sửa 3 lỗi review, ma trận truy vết, phương án chuyển dữ liệu legacy và ranh giới tích hợp Phase 2 / BE-AI. |
| `docs/task.md` | Cập nhật bảo thủ | Bổ sung mốc kiểm tra Phase 1 WF-04 và mốc sửa lỗi sau review tại Mục 11, tách rõ các sub-item domain đã xong dưới các mục hỗn hợp domain+UI (giữ nguyên `[ ]` toàn bộ mục UI, Alert/Case Queue, migration, `localStorage`, Mục `7.1` feedback và tổng thể WF-04). |

**Các vùng giữ nguyên tuyệt đối trong Phase 1:**
- `src/services/` giữ nguyên chỉ có `.gitkeep` (không tạo client HTTP, endpoint giả hoặc phản hồi giả).
- Không chỉnh sửa component UI (`.tsx`, `.css`), `translations.ts`, `navigation.ts`, hooks, fixtures trong `src/data/`, `localStorage` (`fraudguard-demo-workspace-v3`).
- Không chỉnh sửa `src/utils/case-workflow.ts`, `src/utils/permissions.ts`, `src/utils/enterprise.ts`, model legacy trong `src/types/fraudguard.ts`, các file WF-01 (`src/types/enterprise-lifecycle.ts`, `src/utils/enterprise-lifecycle.ts`, `tests/enterprise-lifecycle.test.cjs`), hay các unit test hiện có (`tests/rule-sandbox.test.cjs`, v.v.).

### 1.2. Đối chiếu nguồn yêu cầu: Proposal, Dự thảo Workflow và Quyết định 15/11/2026

**Ghi chú đọc tài liệu nguồn (từ kiểm tra thực tế của nhóm nghiên cứu):**
- Trên máy hiện tại, lệnh `python` trên `PATH` mặc định trỏ tới Windows Store alias (exit `1`), trong khi Python 3.14 cài tại `C:\Users\gmt\AppData\Local\Python\pythoncore-3.14-64\python.exe`.
- Toàn bộ nội dung XML của cả hai tệp `.docx` đã được đọc sạch qua PowerShell `.NET ZipArchive` và xác minh chéo bằng Python `zipfile` + `xml.etree.ElementTree` (`C:\Users\gmt\Downloads\Phieu_FA26SE215_v3_EN.docx`: 150 đoạn văn bản; `C:\Users\gmt\Downloads\SME-FraudGuard_Du-thao-dang-ky-workflow.docx`: 110 đoạn văn bản, `word/footnotes.xml` rỗng, `word/footer1.xml`: `SME-FraudGuard | Bản dự thảo để xác nhận`). Không có đoạn văn bản nào bị lỗi đọc; nội dung `.docx` chỉ được dùng làm nguồn yêu cầu nghiệp vụ.

| Khía cạnh | Proposal (`Phieu_FA26SE215_v3_EN.docx`) | Dự thảo (`SME-FraudGuard_Du-thao-dang-ky-workflow.docx` WF-04) | Quyết định chốt 15/11/2026 (`docs/task.md` & `antigravity-wf04-phase1.md`) |
|---|---|---|---|
| **Số lượng AI Alert trên một case** | Mô tả điều tra AI Alert từ Subscription/AI Service; chưa chốt số lượng alert tối đa/tối thiểu trên một case. | Cho phép gom nhiều AI Alert liên quan thành một case điều tra chung. | Thay thế giới hạn 1 alert/1 case ngày 13/11: mỗi case có **1 hoặc nhiều (`1..N`) AI Alert** (`AI` + `Abnormal`) cùng tenant, chưa từng gắn case nào (kể cả `Closed`); không bắt buộc tối thiểu 2 alert; không tự tạo case khi AI Alert phát sinh; danh sách alert cố định sau khi tạo trong Phase 1. |
| **Actor & ranh giới truy cập** | 5 actor chính: `Platform Admin`, `Implementation Staff`, `SME Admin`, `Operator`, `Investigator`. | Liệt kê cả `SME-FraudGuard` như một actor trong luồng. | Chỉ dùng 4 role WF-04: `Operator`, `Investigator`, `SME Admin`, `Platform Admin` (không dùng `SME-FraudGuard` như một role). `Platform Admin` và `Implementation Staff` không mặc định có quyền xem hồ sơ điều tra nội bộ. |
| **Vòng đời trạng thái & kết luận** | Lưu kết luận, báo cáo và lịch sử điều tra để tham chiếu/feedback; chưa quy định tên trạng thái chi tiết. | Chuỗi `Open → Investigating → Pending Review → Closed` và `Pending Review → Investigating` giữ bản báo cáo cũ trong lịch sử. | Chốt đúng 4 trạng thái mới (bỏ bước bắt buộc `Assigned`/`Reported` kiểu legacy). Kết luận cuối cùng tách riêng khỏi trạng thái `Closed`; Phase 1 dùng chuỗi văn bản không rỗng tạm thời, không tự đặt enum kết luận cố định hay mapping nhãn AI. |
| **Operator tự điều tra** | Chưa chi tiết hóa nhánh một Operator tự đảm nhận điều tra. | Mới mô tả luồng chính `Operator` giao `Investigator` và nhận lại báo cáo để duyệt. | Cùng một `Operator` được phép tự đảm nhận (`Open → Investigating`), tự viết/gửi báo cáo (`Investigating → Pending Review`) rồi tự xác nhận/đóng case (`Pending Review → Closed`) mà không bắt buộc người duyệt thứ hai, nhưng bắt buộc qua 2 thao tác tách biệt với actor/thời điểm riêng; cấm đóng thẳng từ `Open`/`Investigating`. |
| **Hiệu lực Subscription khi hết hạn** | Gắn luồng điều tra với doanh nghiệp dùng gói Subscription. | Yêu cầu doanh nghiệp `Operating` và Subscription còn hiệu lực khi mở case; chưa nêu rõ xử lý case cũ sau khi hết hạn. | Hết hạn Subscription **chỉ chặn tạo case mới**. Case đã mở hợp lệ trước `expiresAt` tiếp tục được giao việc, điều tra, gửi/bổ sung báo cáo, xác nhận, đóng và xem lại theo đúng role/tenant mà không chạy lại guard tạo case. |
| **Cấu trúc báo cáo & kết quả từng alert** | Ghi nhận báo cáo và kết luận điều tra. | Mỗi case có báo cáo chung và lịch sử báo cáo khi yêu cầu bổ sung. | Mỗi case có một báo cáo chung gồm tổng kết chung và **kết quả + bằng chứng riêng cho từng AI Alert** (cho phép các alert trong cùng case có kết quả khác nhau). Gửi lại tạo phiên bản bất biến mới và giữ nguyên bản cũ; chặn xác nhận phiên bản đã bị thay thế. |
| **SME Admin gửi feedback** | Lưu lịch sử điều tra để tham khảo và phục vụ feedback cải thiện. | Chưa tách biệt rõ trigger đóng case với thao tác gửi feedback. | Đóng case chỉ lưu hồ sơ nội bộ, **không** tự tạo/gửi feedback và không tự retrain AI. `SME Admin` chủ động chọn gửi feedback cho `Platform Admin` ở giai đoạn sau; `Platform Admin` chỉ xem nội dung được doanh nghiệp chủ động gửi. |
| **Kịch bản dữ liệu & ngoại lệ demo** | Bài toán giám sát bất thường giao dịch/dữ liệu SME. | Đề cập ngữ cảnh dữ liệu tiêu thụ điện. | Ngữ cảnh WF-04 dùng dữ liệu tiêu thụ điện tại cơ quan/trường học; nhánh ngoại lệ demo chính là báo cáo thiếu bằng chứng -> yêu cầu bổ sung; chính sách Subscription hết hạn kiểm thử bằng kịch bản riêng. |

### 1.3. Phân tích 3 vấn đề sau Review Phase 1, tái hiện pre-fix và cách sửa

Sau khi đợt kiểm tra ban đầu đạt `108/108` test và `npm run build` exit `0`, đợt rà soát độc lập bổ sung (`docs/antigravity-wf04-phase1-fixes.md`) đã tái hiện 3 lỗ hổng hợp đồng hàm thuần qua lời gọi public functions. Cả 3 lỗ hổng được chứng minh tồn tại trước khi sửa bằng 3 regression test mới (`Tests 15–17`: `node --test tests/investigation-case.test.cjs` -> exit `1`, `14 pass, 3 fail`), sau đó được sửa dứt điểm trong `src/types/investigation-case.ts` và `src/utils/investigation-case.ts`:

1. **Vấn đề 1 — `CreateInvestigationCaseInput.existingCases` tùy chọn và tự rơi về `[]` (`Test 15`):**
   - *Nguyên nhân & tái hiện pre-fix:* Trước đây `existingCases?: readonly InvestigationCase[]` là tùy chọn và `createInvestigationCase` viết `input.existingCases ?? []`. Vì hàm thuần không mutate danh sách `alerts` nguồn, hai lời gọi bỏ qua `existingCases` trên cùng `alertId` đều thành công, dễ sinh liên kết trùng ngoài ý muốn. Pre-fix `Test 15` thất bại khi bỏ qua `existingCases` (`expected false, actual true` tại lời gọi tạo case thiếu `existingCases`).
   - *Cách sửa:* Chuyển `existingCases: readonly InvestigationCase[]` thành trường **bắt buộc** trong `CreateInvestigationCaseInput`; gỡ bỏ `?? []` trong `createInvestigationCase` và kiểm tra rõ `hasOwnProperty("existingCases")`, `undefined`, `null` -> trả `MISSING_EXISTING_CASES`, không phải mảng -> trả `INVALID_CASE`. Mảng `[]` chỉ hợp lệ khi workspace thực sự chưa có case nào; caller phải truyền **toàn bộ** danh sách case hiện có (bao gồm cả `Closed`, không chỉ danh sách đang lọc/phân trang UI), đồng thời giữ nguyên kiểm tra trùng `caseId`, alert đã gắn (`Open`..`Closed`), liên kết legacy, tính nguyên tử và bất biến input.
2. **Vấn đề 2 — `ConfirmInvestigationCaseReportInput.reportId` và `reportVersion` tùy chọn cho phép bỏ qua phiên bản đang review (`Test 16`):**
   - *Nguyên nhân & tái hiện pre-fix:* Trước đây `reportId?` và `reportVersion?` đều tùy chọn; khi không truyền, `confirmInvestigationCaseReport` tự lấy phiên bản đang `Pending Review`. Nếu UI đang hiển thị `v1` cho người review trong khi state đã cập nhật sang `v2`, thao tác thiếu định danh vẫn xác nhận `v2` mà người duyệt chưa xem. Pre-fix `Test 16` thất bại khi payload thiếu định danh báo cáo vẫn xác nhận thành công.
   - *Cách sửa:* Bắt buộc cả `reportId: string` và `reportVersion: number` trên `ConfirmInvestigationCaseReportInput` (giữ `SubmitInvestigationReportInput.reportId` là tùy chọn để không tạo ràng buộc thừa khi gửi báo cáo mới). Tại runtime, từ chối vô điều kiện thiếu/`undefined`/`null` (`MISSING_REPORT_ID`, `MISSING_REPORT_VERSION`), `reportId` rỗng/trắng (`INVALID_REPORT_ID`), và `reportVersion` là `NaN`/không hữu hạn/không nguyên/`<= 0` (`INVALID_REPORT_VERSION`), tuyệt đối không tự điền từ pending state; đối chiếu cặp `(reportId, reportVersion)` khớp đồng thời cả `pendingReport` lẫn `latestReport` trong `case.reports` (`STALE_REPORT_VERSION` cho bản cũ hoặc cặp ghép chéo `(v1 id, v2 ver)` / `(v2 id, v1 ver)`, `REPORT_NOT_FOUND`, `REPORT_VERSION_MISMATCH`). Nhánh `Operator` tự điều tra vẫn thực hiện qua 2 thao tác tách biệt (`selfAssign` → `submit` → `confirm` truyền đúng `reportId` & `reportVersion` của báo cáo đang xem).
3. **Vấn đề 3 — Thiếu guard thứ tự thời gian đơn điệu trên các command hậu tạo (`Test 17`):**
   - *Nguyên nhân & tái hiện pre-fix:* Các command sau khi tạo case trước đây chỉ kiểm tra chuỗi `at` là ISO hợp lệ, không đối chiếu với lịch sử case; case tạo lúc `2026-11-15T10:00:00Z` nhưng đóng lúc `2026-11-15T09:00:00Z` vẫn hợp lệ. Pre-fix `Test 17` thất bại khi `assignInvestigatorToCase` với `at` sớm hơn `createdAt` 1ms (`2026-11-15T09:59:59.999Z`) vẫn trả `ok: true`.
   - *Cách sửa:* Bổ sung cặp helper dùng chung `parseIsoTimestampField` và `resolveMonotonicTransitionTimestamp` trong `src/utils/investigation-case.ts`, tái sử dụng `parseStrictIsoTimestamp` (`src/utils/enterprise-lifecycle.ts`) để so sánh theo **mili-giây UTC tuyệt đối (`ms`)** thay vì so chuỗi ISO (xử lý đúng lệch múi giờ như `Z` vs `+07:00`). Áp dụng thống nhất trên toàn bộ 5 command hậu tạo (`assignInvestigatorToCase`, `selfAssignInvestigationCase`, `submitInvestigationReport`, `requestInvestigationCaseRevision`, `confirmInvestigationCaseReport`): kiểm tra `input.at` và toàn bộ mốc lưu trữ (`createdAt`, `updatedAt`, `history[i].at`, `assignedAt`, `reports[i].submittedAt`), từ chối timestamp hỏng/số `NaN`/thiếu múi giờ (`INVALID_TIMESTAMP`), cấu trúc lịch sử hỏng (`INVALID_CASE`), timeline tự mâu thuẫn (`updatedAt < createdAt`, milestone ngoài `[createdAt, updatedAt]`, `history[i].at < history[i-1].at`), và `opTs.ms < floorMs` (`TIMESTAMP_OUT_OF_ORDER`). Cho phép hai thao tác cùng thời điểm (`opTs.ms === floorMs`, thứ tự bảo toàn theo vị trí trong `history`); không dùng `Date.now()` hoặc tự tăng đồng hồ, và vẫn bảo toàn quy tắc WF-01 cho case đã mở trước `expiresAt` tiếp tục xử lý theo thứ tự thời gian sau expiry.

---

## 2. Bảng chuyển trạng thái, kiểm soát quyền và mã lỗi chính

### 2.1. Bảng chuyển trạng thái các pure commands (`src/utils/investigation-case.ts`)

| Từ trạng thái | Command | Actor hợp lệ | Điều kiện tiên quyết & Ràng buộc chính | Sang trạng thái / Kết quả (Event) | Mã lỗi chính (`InvestigationCaseErrorCode`) |
|---|---|---|---|---|---|
| `(chưa có)` | `checkInvestigationCaseCreationEligibility` | Bất kỳ (helper thuần) | `at` là ISO-8601 có múi giờ (`Z` hoặc `[+-]HH:MM`); gọi thật `checkEnterpriseOperationalEligibility(enterprise, { at, requireSubscription: true })`, `isEnterpriseOperating`, `isEnterpriseSubscriptionActive` từ WF-01 (`[startedAt, expiresAt)`). Không tin cờ `eligible` từ caller. | Trả `eligibility: InvestigationCaseCreationEligibility` đóng băng (snapshot từ dữ liệu WF-01). | `INVALID_TIMESTAMP`, `ENTERPRISE_NOT_FOUND`, `ENTERPRISE_LIFECYCLE_UNINITIALIZED`, `ENTERPRISE_NOT_OPERATING`, `MISSING_SERVICE_PLAN`, `PLAN_NOT_SUBSCRIPTION`, `SUBSCRIPTION_NOT_STARTED`, `SUBSCRIPTION_EXPIRED` |
| `(mới)` | `createInvestigationCase` | `Operator` cùng `enterpriseId` | Kiểm tra tất cả điều kiện trước khi ghi (nguyên tử): `caseId` không rỗng/không trùng `existingCases`; `existingCases` **bắt buộc phải truyền dạng mảng** (không mặc định `[]`; `[]` chỉ dùng khi chưa có case nào; phải truyền đủ cả `Closed`); `at` hợp lệ; WF-01 `Operating` + `Subscription` đang hiệu lực; `alertIds` khác rỗng, không trùng; mỗi `alertId` khớp duy nhất 1 `TransactionRisk.alertId` (không fallback `tx.id`); `scoringSource === "AI"` và `riskLevel === "Abnormal"`; ánh xạ `projectId -> enterprise.id` duy nhất qua `enterprises`/`projects`/`enterprise.projectIds`; chưa liên kết `existingCases` (`Open..Closed`) và không có dấu vết legacy `tx.caseId` / `tx.caseStatus`. | Tạo `InvestigationCase` ở trạng thái **`Open`** (`CASE_CREATED`), danh sách `alertIds`/`alerts` cố định, gắn snapshot `creationEligibility`, `reports: []`. | `MISSING_CASE_ID`, `DUPLICATE_CASE_ID`, `MISSING_EXISTING_CASES`, `INVALID_CASE`, `INVALID_ACTOR`, `FORBIDDEN_ROLE`, `FORBIDDEN_TENANT`, `EMPTY_ALERT_LIST`, `INVALID_ALERT_ID`, `DUPLICATE_ALERT_ID`, `ALERT_NOT_FOUND`, `AMBIGUOUS_ALERT_MAPPING`, `INELIGIBLE_ALERT_SOURCE`, `INELIGIBLE_ALERT_RISK_LEVEL`, `INVALID_PROJECT_MAPPING`, `CROSS_TENANT_ALERT`, `ALERT_ALREADY_LINKED`, `ALERT_LEGACY_LINKED`, cùng các mã WF-01 & `INVALID_ID` |
| `Open` | `assignInvestigatorToCase` | `Operator` cùng `enterpriseId` | Case ở `Open` (chưa `Closed`); tra cứu `assigneeId` trong `users` theo đúng `u.id` (không cấp quyền theo `name`, chặn `users` trùng ID actor/assignee); người được chọn có `role === "Investigator"` và cùng `enterpriseId`. Không yêu cầu bước `Assigned`. `resolveMonotonicTransitionTimestamp`: `at` hợp lệ theo ISO-8601 UTC ms và `>= max(createdAt, updatedAt, history, assignedAt, submittedAt)`. Không chạy lại check hết hạn Subscription. | Sang **`Investigating`** (`INVESTIGATOR_ASSIGNED`), `assignmentMode: "assigned"`, gán `assignee`, `assignedBy`, `assignedAt`. | `INVALID_CASE`, `CASE_ALREADY_CLOSED`, `INVALID_STATE`, `FORBIDDEN_ROLE`, `FORBIDDEN_TENANT`, `INVALID_TIMESTAMP`, `TIMESTAMP_OUT_OF_ORDER`, `INVALID_USER_DIRECTORY`, `AMBIGUOUS_USER`, `MISSING_ASSIGNEE_ID`, `ASSIGNEE_NOT_FOUND`, `INVALID_ASSIGNEE_ROLE`, `ASSIGNEE_TENANT_MISMATCH`, `DUPLICATE_EVENT_ID` |
| `Open` | `selfAssignInvestigationCase` | `Operator` cùng `enterpriseId` | Case ở `Open` (chưa `Closed`); `resolveMonotonicTransitionTimestamp` bảo đảm `at` hợp lệ và không sớm hơn mốc đã ghi của case. Không chạy lại check hết hạn Subscription. | Sang **`Investigating`** (`OPERATOR_SELF_ASSIGNED`), `assignmentMode: "self_investigated"`, `assignee = actor`. | `INVALID_CASE`, `CASE_ALREADY_CLOSED`, `INVALID_STATE`, `INVALID_ACTOR`, `FORBIDDEN_ROLE`, `FORBIDDEN_TENANT`, `INVALID_TIMESTAMP`, `TIMESTAMP_OUT_OF_ORDER`, `INVALID_ID`, `DUPLICATE_EVENT_ID` |
| `Investigating` | `submitInvestigationReport` | Chỉ `assignee` hiện tại (`assignee.actorId === actor.id && assignee.role === actor.role` và cùng `enterpriseId`) | Case ở `Investigating` (Operator chưa tự nhận không được viết thay Investigator; người khác không được gửi); `resolveMonotonicTransitionTimestamp` bảo đảm `at` đơn điệu theo UTC ms; `summary` không rỗng; `alertResults` phủ **chính xác 1:1** toàn bộ `case.alertIds` (không thiếu, thừa, trùng); mỗi item có `resultText` và `evidence` không rỗng (được phép khác kết quả giữa các alert); `reportId` tùy chọn (nếu truyền thì không rỗng và không trùng trong `case.reports`). | Sang **`Pending Review`** (`REPORT_SUBMITTED`), thêm `InvestigationCaseReportVersion` bất biến với `version = reports.length + 1`, cập nhật `pendingReviewReportId` & `pendingReviewReportVersion`. | `CASE_ALREADY_CLOSED`, `INVALID_STATE`, `FORBIDDEN_ROLE`, `FORBIDDEN_TENANT`, `FORBIDDEN_ASSIGNEE`, `INVALID_TIMESTAMP`, `TIMESTAMP_OUT_OF_ORDER`, `MISSING_REPORT_SUMMARY`, `INVALID_REPORT_ALERT_RESULTS`, `DUPLICATE_REPORT_ALERT`, `EXTRA_REPORT_ALERT`, `MISSING_REPORT_ALERT`, `MISSING_ALERT_RESULT`, `MISSING_ALERT_EVIDENCE`, `INVALID_REPORT_ID`, `DUPLICATE_REPORT_ID` |
| `Pending Review` | `requestInvestigationCaseRevision` | `Operator` cùng `enterpriseId` | Case ở `Pending Review` (chưa `Closed`); `resolveMonotonicTransitionTimestamp` bảo đảm `at` đơn điệu theo UTC ms; tồn tại `pendingReviewReportId`/`Version` hợp lệ trong `reports`; `reason.trim()` bắt buộc không rỗng. | Trả về **`Investigating`** (`REVISION_REQUESTED`), xóa con trỏ `pendingReviewReportId`/`Version`, **giữ nguyên toàn bộ phiên bản báo cáo cũ** trong `reports`. | `CASE_ALREADY_CLOSED`, `INVALID_STATE`, `FORBIDDEN_ROLE`, `FORBIDDEN_TENANT`, `INVALID_TIMESTAMP`, `TIMESTAMP_OUT_OF_ORDER`, `MISSING_REVISION_REASON`, `NO_PENDING_REPORT`, `DUPLICATE_EVENT_ID` |
| `Pending Review` | `confirmInvestigationCaseReport` | `Operator` cùng `enterpriseId` (gồm cả Operator tự điều tra ở bước xác nhận tách biệt) | Case ở `Pending Review` (cấm đóng `Open`/`Investigating`, cấm Investigator/SME Admin/PA/Staff/Operator khác tenant); `resolveMonotonicTransitionTimestamp` bảo đảm `at` đơn điệu theo UTC ms; `pendingReport` phải khớp báo cáo mới nhất (`reports[reports.length - 1]`); **bắt buộc truyền cả `reportId` (chuỗi không rỗng) và `reportVersion` (số nguyên dương)** và cả hai phải khớp đúng `pendingReport` (chặn bản cũ hoặc cặp ghép chéo với `STALE_REPORT_VERSION`, chặn ID/version không tồn tại với `REPORT_NOT_FOUND`/`REPORT_VERSION_MISMATCH`); `finalSummary` lấy mặc định `pendingReport.summary` nếu bỏ qua, hoặc không rỗng nếu truyền vào. **Không tạo/gửi feedback.** | Sang **`Closed`** (`REPORT_CONFIRMED_AND_CLOSED`), xóa con trỏ pending, lưu riêng `conclusion` (gắn `reportId`, `reportVersion`, `confirmedBy`, `confirmedAt`, `summary`, và mảng `alertResults` giữ nguyên kết quả từng alert), gán `closedAt`. Mọi thao tác ghi hoặc xác nhận lặp sau đó bị chặn bởi `CASE_ALREADY_CLOSED`. | `CASE_ALREADY_CLOSED`, `INVALID_STATE`, `FORBIDDEN_ROLE`, `FORBIDDEN_TENANT`, `INVALID_TIMESTAMP`, `TIMESTAMP_OUT_OF_ORDER`, `NO_PENDING_REPORT`, `MISSING_REPORT_ID`, `INVALID_REPORT_ID`, `MISSING_REPORT_VERSION`, `INVALID_REPORT_VERSION`, `REPORT_NOT_FOUND`, `REPORT_VERSION_MISMATCH`, `STALE_REPORT_VERSION`, `MISSING_CONCLUSION_SUMMARY` |

### 2.2. Ma trận phân quyền đọc (`evaluateInvestigationCaseReadAccess`, `readInternalInvestigationCase`, `readConfirmedInvestigationReport`)

| Role | Phạm vi tenant / phân công | `readInternalInvestigationCase` (`Open`, `Investigating`, `Pending Review`, `Closed`) | `readConfirmedInvestigationReport` (`Open`..`Pending Review`) | `readConfirmedInvestigationReport` (`Closed`) | Ghi chú mã lỗi khi bị chặn |
|---|---|---|---|---|---|
| `Operator` | Cùng `enterpriseId` | **Cho phép** (toàn bộ hồ sơ & `history`) | Từ chối (`REPORT_NOT_CONFIRMED`) | **Cho phép** (`ConfirmedInvestigationReportView`) | Khác tenant: `FORBIDDEN_TENANT` |
| `Investigator` | Cùng `enterpriseId` & `assignee.actorId === actor.id` | **Cho phép** | Từ chối (`REPORT_NOT_CONFIRMED`) | **Cho phép** | Chưa giao / khác user ID / trùng tên: `FORBIDDEN_ASSIGNEE`; khác tenant: `FORBIDDEN_TENANT` |
| `SME Admin` | Cùng `enterpriseId` | **Từ chối** (`FORBIDDEN_ROLE`) | Từ chối (`REPORT_NOT_CONFIRMED`) | **Cho phép** (chỉ `confirmedReport`, `conclusion`, `alerts`; không kèm `history` điều tra nội bộ) | Khác tenant: `FORBIDDEN_TENANT` |
| `Platform Admin` | Bất kỳ (kể cả trùng `enterpriseId`) | **Từ chối** (`FORBIDDEN_ROLE`) | **Từ chối** (`FORBIDDEN_ROLE`) | **Từ chối** (`FORBIDDEN_ROLE`) | Không mặc định truy cập hồ sơ điều tra nội bộ; chỉ nhận feedback ở Phase sau |
| `Implementation Staff` | Bất kỳ | **Từ chối** (`FORBIDDEN_ROLE`) | **Từ chối** (`FORBIDDEN_ROLE`) | **Từ chối** (`FORBIDDEN_ROLE`) | Không có quyền đọc hồ sơ điều tra WF-04 |
| `Viewer` | Bất kỳ | **Từ chối** (`FORBIDDEN_ROLE`) | **Từ chối** (`FORBIDDEN_ROLE`) | **Từ chối** (`FORBIDDEN_ROLE`) | Không cấp quyền hồ sơ điều tra nội bộ |

---

## 3. Domain model, chữ ký hàm công khai và ví dụ chuỗi chạy cụ thể

### 3.1. Tóm tắt Domain Model (`src/types/investigation-case.ts`)

- **Trạng thái & sự kiện:**
  - `InvestigationCaseStatus = "Open" | "Investigating" | "Pending Review" | "Closed"`
  - `InvestigationCaseAssignmentMode = "assigned" | "self_investigated"`
  - `InvestigationCaseEventType = "CASE_CREATED" | "INVESTIGATOR_ASSIGNED" | "OPERATOR_SELF_ASSIGNED" | "REPORT_SUBMITTED" | "REVISION_REQUESTED" | "REPORT_CONFIRMED_AND_CLOSED"`
- **Thực thể chính `InvestigationCase`:**
  - Định danh & liên kết bất biến (trong Phase 1): `caseId`, `enterpriseId`, `status`, `alertIds: readonly string[]`, `alerts: readonly InvestigationCaseAlertLink[]` (lưu `alertId`, `transactionId`, `transactionReference`, `projectId`, `projectName`, `transactionType`, `entityReference`, `scoringSource: "AI"`, `riskLevel: "Abnormal"`, `processedAt`, cùng metadata tùy chọn).
  - Truy vết điều kiện mở case từ WF-01: `creationEligibility: InvestigationCaseCreationEligibility` (`verifiedAt`, `operatingStatus`, `servicePlan`, `activatedAt`, `configVersion`, `subscriptionStartedAt`, `subscriptionExpiresAt`, `subscriptionDuration`).
  - Phân công & phụ trách: `createdBy`, `createdAt`, `updatedAt`, `assignmentMode?`, `assignee?`, `assignedBy?`, `assignedAt?`.
  - Phiên bản báo cáo & trạng thái chờ duyệt: `reports: readonly InvestigationCaseReportVersion[]` (mỗi bản chứa `reportId`, `version`, `submittedBy`, `submittedAt`, `summary`, `alertResults`), `pendingReviewReportId?`, `pendingReviewReportVersion?`. Trong `InvestigationCaseAlertReportItem`, trường `resultText: string` là cách biểu diễn văn bản tạm thời của frontend Phase 1, kết hợp `evidence: string`.
  - Kết luận tách biệt & lịch sử: `conclusion?: InvestigationCaseConclusion` (`reportId`, `reportVersion`, `confirmedBy`, `confirmedAt`, `summary`, `alertResults`), `closedAt?`, `history: readonly InvestigationCaseEvent[]`.
- **Hợp đồng input bắt buộc sau đợt sửa lỗi Review:**
  - `CreateInvestigationCaseInput.existingCases: readonly InvestigationCase[]` bắt buộc truyền tường minh (thiếu/`undefined`/`null` trả `MISSING_EXISTING_CASES`; không phải mảng trả `INVALID_CASE`).
  - `ConfirmInvestigationCaseReportInput` bắt buộc truyền cả `reportId: string` và `reportVersion: number` gắn chặt với bản báo cáo đang hiển thị ở trạng thái `Pending Review` (chặn thiếu/`undefined`/`null`/rỗng/sai kiểu bằng `MISSING_REPORT_ID`, `INVALID_REPORT_ID`, `MISSING_REPORT_VERSION`, `INVALID_REPORT_VERSION` và chặn sai bản bằng `STALE_REPORT_VERSION`, `REPORT_NOT_FOUND`, `REPORT_VERSION_MISMATCH`).
- **Kiểu kết quả không dùng `throw`:** `InvestigationCaseResult<Extra> = ({ readonly ok: true } & Extra) | InvestigationCaseError` (`{ ok: false, code: InvestigationCaseErrorCode, error: string }`, tổng cộng **57** mã lỗi có kiểu tĩnh).
- **Bảo đảm thuần, bất biến & thứ tự thời gian đơn điệu:** mọi đầu ra đều qua `deepFreeze(structuredClone(...))`; mọi bản ghi đọc/ghi sao chép dữ liệu độc lập nên việc caller sửa đổi object đầu vào sau khi gọi hàm không làm thay đổi snapshot báo cáo hoặc `history` đã lưu. Thời điểm và ID mang tính xác định do caller truyền (`parseStrictIsoTimestamp` từ WF-01); toàn bộ 5 command hậu-tạo case áp dụng guard thời gian đơn điệu UTC mili-giây qua `parseIsoTimestampField` và `resolveMonotonicTransitionTimestamp` trên `createdAt`, `updatedAt`, `assignedAt`, `reports[i].submittedAt` và `history[i].at`. Không gọi `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()`, `localStorage` hay `fetch`.

### 3.2. Chữ ký hàm public (`src/utils/investigation-case.ts`)

```ts
export function checkInvestigationCaseCreationEligibility(
  enterprise: Enterprise | undefined,
  at: string,
): InvestigationCaseCreationEligibilityResult;

export function evaluateInvestigationCaseReadAccess(
  investigationCase: InvestigationCase,
  actor: InvestigationCaseActorInput,
): InvestigationCaseReadAccess;

export function readInternalInvestigationCase(
  input: ReadInvestigationCaseInput,
): ReadInternalInvestigationCaseResult;

export function readConfirmedInvestigationReport(
  input: ReadInvestigationCaseInput,
): ReadConfirmedInvestigationReportResult;

export function createInvestigationCase(
  input: CreateInvestigationCaseInput,
): InvestigationCaseCommandResult;

export function assignInvestigatorToCase(
  input: AssignInvestigatorInput,
): InvestigationCaseCommandResult;

export function selfAssignInvestigationCase(
  input: SelfAssignInvestigationCaseInput,
): InvestigationCaseCommandResult;

export function submitInvestigationReport(
  input: SubmitInvestigationReportInput,
): InvestigationCaseCommandResult;

export function requestInvestigationCaseRevision(
  input: RequestInvestigationCaseRevisionInput,
): InvestigationCaseCommandResult;

export function confirmInvestigationCaseReport(
  input: ConfirmInvestigationCaseReportInput,
): InvestigationCaseCommandResult;
```

### 3.3. Ví dụ 1: Chuỗi nhiều AI Alert + phân công Investigator + yêu cầu bổ sung + tiếp tục sau khi Subscription hết hạn

```ts
// Bối cảnh: Doanh nghiệp trường học (ent-school-1) đang Operating với gói Subscription
// hiệu lực [2026-11-01T00:00:00Z, 2026-12-01T00:00:00Z).

// 1. Operator mở 1 case gom 2 AI Alert bất thường tiêu thụ điện sau giờ học:
//    (existingCases bắt buộc truyền tường minh — chỉ dùng [] khi workspace thực sự chưa có case nào;
//     Phase 2 phải truyền toàn bộ InvestigationCase[] trong state kể cả case Closed):
const created = createInvestigationCase({
  caseId: "CASE-W4-01",
  enterprise: schoolEnterprise,
  actor: operator1,
  alertIds: ["ALT-ELEC-01", "ALT-ELEC-02"],
  alerts: electricityTransactions,
  existingCases: [],
  enterprises: [schoolEnterprise],
  projects: [{ id: "proj-school-meter" }],
  at: "2026-11-15T08:00:00Z",
});
// created.ok === true -> status: "Open", history: [CASE_CREATED]

// 2. Operator phân công Investigator theo user ID (Open -> Investigating trực tiếp):
const assigned = assignInvestigatorToCase({
  investigationCase: created.investigationCase,
  actor: operator1,
  assigneeId: "usr-inv-1",
  users: directoryUsers,
  at: "2026-11-15T08:15:00Z",
});
// assigned.investigationCase.status === "Investigating"

// 3. Investigator gửi báo cáo v1 với kết quả khác nhau cho 2 alert:
const v1 = submitInvestigationReport({
  investigationCase: assigned.investigationCase,
  actor: investigator1,
  summary: "Tổng hợp kiểm tra hai điểm đo điện khu hiệu bộ và dãy lớp học.",
  alertResults: [
    {
      alertId: "ALT-ELEC-01",
      resultText: "Bất thường cần xử lý - thiết bị điều hòa khu A chạy quên tắt qua đêm.",
      evidence: "Log công tơ M-01 tăng 48 kWh từ 22:00 đến 05:00 khi trường đóng cửa.",
    },
    {
      alertId: "ALT-ELEC-02",
      resultText: "Hoạt động hợp lệ có kế hoạch - bảo trì máy bơm nước định kỳ.",
      evidence: "Phiếu bảo trì #BT-114 xác nhận chạy thử tải 21:00–22:30.",
    },
  ],
  at: "2026-11-15T10:00:00Z",
});
// v1.investigationCase.status === "Pending Review", pendingReviewReportVersion === 1
const displayedV1 = v1.investigationCase.reports[0];

// 4. Operator yêu cầu bổ sung kèm lý do (Pending Review -> Investigating, giữ nguyên v1):
const rev = requestInvestigationCaseRevision({
  investigationCase: v1.investigationCase,
  actor: operator1,
  reason: "Bổ sung ảnh chụp nhật ký vận hành công tơ M-02 và chữ ký tổ bảo trì.",
  at: "2026-11-15T11:00:00Z",
});
// rev.investigationCase.status === "Investigating", reports.length === 1

// 5. Sau khi Subscription hết hạn (2026-12-05T09:00:00Z >= expiresAt):
//    - Tạo case mới tại thời điểm này bị chặn với code "SUBSCRIPTION_EXPIRED".
//    - Case đã mở CASE-W4-01 vẫn gửi lại v2, duyệt và đóng bình thường:
const v2 = submitInvestigationReport({
  investigationCase: rev.investigationCase,
  actor: investigator1,
  summary: "Bổ sung đầy đủ chứng từ kiểm tra tại hai công tơ M-01 và M-02.",
  alertResults: [
    {
      alertId: "ALT-ELEC-01",
      resultText: "Bất thường cần xử lý - quên ngắt CB nhánh tầng 2 khu A.",
      evidence: "Log công tơ M-01 + biên bản kiểm tra ca trực tối 14/11.",
    },
    {
      alertId: "ALT-ELEC-02",
      resultText: "Hoạt động hợp lệ có kế hoạch - đã đối chiếu chữ ký tổ bảo trì.",
      evidence: "Phiếu #BT-114 kèm bản scan nhật ký ca trực có xác nhận.",
    },
  ],
  at: "2026-12-05T09:00:00Z",
});
// Gắn chặt reportId & reportVersion vào đúng snapshot báo cáo đang hiển thị cho người duyệt
// (KHÔNG tự đọc lại reports[latest] tại thời điểm bấm nút xác nhận):
const displayedPendingV2 = v2.investigationCase.reports.find(
  (r) => r.reportId === v2.investigationCase.pendingReviewReportId,
)!;

// Thử xác nhận nhầm v1 cũ đang hiển thị trên màn hình cũ -> { ok: false, code: "STALE_REPORT_VERSION" }
const stale = confirmInvestigationCaseReport({
  investigationCase: v2.investigationCase,
  actor: operator1,
  reportId: displayedV1.reportId,
  reportVersion: displayedV1.version,
  at: "2026-12-05T09:15:00Z",
});

// Xác nhận đúng phiên bản v2 đang chờ duyệt -> Closed:
const closed = confirmInvestigationCaseReport({
  investigationCase: v2.investigationCase,
  actor: operator1,
  reportId: displayedPendingV2.reportId,
  reportVersion: displayedPendingV2.version,
  finalSummary: "Xác nhận đóng hồ sơ: M-01 bất thường do vận hành, M-02 hợp lệ có phiếu bảo trì.",
  at: "2026-12-05T09:30:00Z",
});
// closed.investigationCase.status === "Closed"
// closed.investigationCase.conclusion.reportVersion === 2
// closed.investigationCase.conclusion.alertResults giữ nguyên 2 kết quả khác nhau
// SME Admin gọi readConfirmedInvestigationReport(...) -> ok: true
// SME Admin gọi readInternalInvestigationCase(...) -> ok: false (FORBIDDEN_ROLE)
// Platform Admin / Implementation Staff gọi cả 2 hàm đọc -> ok: false (FORBIDDEN_ROLE)
```

### 3.4. Ví dụ 2: Nhánh Operator tự đảm nhận điều tra (2 thao tác gửi báo cáo và xác nhận tách biệt)

```ts
const selfCreated = createInvestigationCase({
  caseId: "CASE-W4-SELF",
  enterprise: schoolEnterprise,
  actor: operator1,
  alertIds: ["ALT-ELEC-03"],
  alerts: electricityTransactions,
  existingCases: [closed.investigationCase],
  at: "2026-11-16T08:00:00Z",
});

const selfAssigned = selfAssignInvestigationCase({
  investigationCase: selfCreated.investigationCase,
  actor: operator1,
  at: "2026-11-16T08:10:00Z",
});
// event: OPERATOR_SELF_ASSIGNED, assignmentMode: "self_investigated"

const selfReported = submitInvestigationReport({
  investigationCase: selfAssigned.investigationCase,
  actor: operator1,
  summary: "Operator kiểm tra trực tiếp công tơ phòng thí nghiệm.",
  alertResults: [
    {
      alertId: "ALT-ELEC-03",
      resultText: "Bất thường do tủ lạnh bảo quản mẫu chạy công suất cao liên tục.",
      evidence: "Biểu đồ phụ tải phòng thí nghiệm + nhật ký thiết bị ngày 16/11.",
    },
  ],
  at: "2026-11-16T09:00:00Z",
});
// event: REPORT_SUBMITTED (Pending Review; không thể nhảy thẳng sang Closed trước bước này)
const displayedSelfReport = selfReported.investigationCase.reports[0];

const selfConfirmed = confirmInvestigationCaseReport({
  investigationCase: selfReported.investigationCase,
  actor: operator1,
  reportId: displayedSelfReport.reportId,
  reportVersion: displayedSelfReport.version,
  at: "2026-11-16T09:05:00Z",
});
// selfConfirmed.investigationCase.status === "Closed"
// history có đủ 4 sự kiện tách biệt: CASE_CREATED -> OPERATOR_SELF_ASSIGNED -> REPORT_SUBMITTED -> REPORT_CONFIRMED_AND_CLOSED
// Không có đối tượng feedback nào được tự động tạo hay gửi đi.
```

---

## 4. Ma trận truy vết yêu cầu -> hàm công khai -> test và kết quả kiểm tra

### 4.1. Ma trận 14 nhóm kiểm thử bắt buộc (`docs/antigravity-wf04-phase1.md` Mục 6) & 3 regression tests sửa lỗi Review

| # | Yêu cầu kiểm thử (`Mục 6` & `Phase 1 Fixes`) | Hàm công khai được kiểm thử | Test case trong `tests/investigation-case.test.cjs` |
|---|---|---|---|
| 1 | Case 1 alert & case nhiều alert tạo đúng 1 case `Open` đủ liên kết | `createInvestigationCase` | `L349`: `1. Creates one Open case for 1 AI alert and one Open case with full links for N AI alerts` |
| 2 | Chặn danh sách rỗng, alert trùng, thiếu/mập mờ, alert đã gắn case `Open`/`Closed`, legacy link, `caseId` trùng; nguyên tử không ghi dở dang | `createInvestigationCase` | `L433`: `2. Rejects empty selection, duplicates, missing/ambiguous alerts, Open/Closed linked alerts, legacy links, and duplicate case IDs atomically` |
| 3 | Chặn `RULE`, `RULE_FALLBACK`, `Normal`, `Undetermined`, trộn tenant và ánh xạ `projectId` không hợp lệ | `createInvestigationCase` | `L687`: `3. Blocks Rule, Rule Fallback, Normal, Undetermined alerts, mixed-tenant alerts, and invalid project->enterprise mappings` |
| 4 | Chặn actor sai role/tenant; chặn doanh nghiệp chưa `Operating`, thiếu lifecycle, `Free`, Subscription trước `startedAt` hoặc tại/sau `expiresAt` bằng helper WF-01 thật | `checkInvestigationCaseCreationEligibility`, `createInvestigationCase` | `L895`: `4. Enforces actor role/tenant and WF-01 Operating + Subscription boundaries using real WF-01 helpers` |
| 5 | Giao Investigator cùng tenant `Open → Investigating`; chặn sai tenant/role/ID thiếu hoặc không tồn tại; trùng tên không cấp quyền | `assignInvestigatorToCase`, `readInternalInvestigationCase` | `L1106`: `5. Assigns same-tenant Investigator Open -> Investigating by ID, rejecting wrong tenant/role/missing ID and duplicate display names` |
| 6 | Investigator được giao gửi báo cáo → `Pending Review`; chặn người khác và Operator chưa tự đảm nhận | `submitInvestigationReport` | `L1281`: `6. Assigned Investigator submits report to Pending Review; unassigned Investigator or non-self-assigned Operator blocked` |
| 7 | Cùng một Operator tự đảm nhận, gửi báo cáo, xác nhận → `Closed` với các bước tách biệt trong lịch sử | `createInvestigationCase`, `selfAssignInvestigationCase`, `submitInvestigationReport`, `confirmInvestigationCaseReport` | `L1397`: `7. Same Operator self-assigns, submits report, and confirms to Closed as distinct steps recorded separately in audit history` |
| 8 | Chặn đóng thẳng `Open`/`Investigating`; chặn Investigator, SME Admin, Platform Admin, Operator khác tenant xác nhận/yêu cầu bổ sung | `confirmInvestigationCaseReport`, `requestInvestigationCaseRevision` | `L1521`: `8. Blocks direct closing from Open/Investigating and blocks Investigator, SME Admin, Platform Admin, and cross-tenant Operator confirmation` |
| 9 | Yêu cầu bổ sung bắt buộc lý do, giữ báo cáo cũ; gửi lại tăng phiên bản; chỉ duyệt phiên bản chờ duyệt mới nhất | `requestInvestigationCaseRevision`, `submitInvestigationReport`, `confirmInvestigationCaseReport` | `L1625`: `9. Revision request requires reason, preserves prior versions, increments version on resubmit, and blocks confirming stale versions` |
| 10 | Chặn báo cáo thiếu/thừa/trùng alert hoặc rỗng tổng kết/kết quả/bằng chứng; giữ nguyên kết quả khác nhau giữa các alert qua gửi, duyệt, đóng | `submitInvestigationReport`, `confirmInvestigationCaseReport`, `readConfirmedInvestigationReport` | `L1795`: `10. Validates exact alert coverage and non-empty report fields while preserving distinct per-alert results through close` |
| 11 | Case mở trước `expiresAt` tiếp tục giao/điều tra/gửi/bổ sung/xác nhận/đóng/đọc sau khi hết hạn; mở case mới tại cùng mốc bị chặn | `createInvestigationCase`, `assignInvestigatorToCase`, `selfAssignInvestigationCase`, `submitInvestigationReport`, `requestInvestigationCaseRevision`, `confirmInvestigationCaseReport`, `readInternalInvestigationCase`, `readConfirmedInvestigationReport` | `L1978`: `11. Pre-expiry cases continue assign/investigate, submit, revision, resubmit, confirm, close, and read after expiresAt while new cases fail` |
| 12 | Phân quyền đọc theo role/tenant/người được giao qua các trạng thái; PA & Implementation Staff không có quyền mặc định | `evaluateInvestigationCaseReadAccess`, `readInternalInvestigationCase`, `readConfirmedInvestigationReport` | `L2116`: `12. Enforces strict read authorization across Open, Investigating, Pending Review, and Closed states` |
| 13 | Deep-freeze input & sửa object caller sau khi thành công không làm biến đổi snapshot/history đã lưu | Tất cả command & read functions | `L2274`: `13. Proves zero input mutation on deep-frozen inputs and isolates stored snapshots/history from post-call mutations` |
| 14 | `Closed` từ chối ghi tiếp và xác nhận lặp không sinh thêm event; đóng case không tự tạo/gửi feedback | `assignInvestigatorToCase`, `selfAssignInvestigationCase`, `submitInvestigationReport`, `requestInvestigationCaseRevision`, `confirmInvestigationCaseReport` | `L2435`: `14. Closed cases reject further writes and repeat confirmation without extra events, and closing creates no feedback` |
| 15 | Vấn đề 1 (Review): Bắt buộc truyền `existingCases` tường minh; chặn `undefined`/`null`/sai kiểu và chặn trùng liên kết `alertId`/`caseId` (`MISSING_EXISTING_CASES`, `INVALID_CASE`, `ALERT_ALREADY_LINKED`, `DUPLICATE_CASE_ID`) | `createInvestigationCase` | `L2547`: `15. Regression Step 1: createInvestigationCase requires existingCases explicitly and blocks duplicate alert/case links` |
| 16 | Vấn đề 2 (Review): Bắt buộc `reportId` + `reportVersion` gắn chặt báo cáo đang chờ duyệt; chặn thiếu/rỗng/sai kiểu/sai bản/bản cũ (`MISSING_REPORT_ID`, `INVALID_REPORT_ID`, `MISSING_REPORT_VERSION`, `INVALID_REPORT_VERSION`, `STALE_REPORT_VERSION`, `REPORT_NOT_FOUND`, `REPORT_VERSION_MISMATCH`) | `confirmInvestigationCaseReport` | `L2683`: `16. Regression Step 2: confirmInvestigationCaseReport requires explicit reportId and reportVersion bound to active Pending Review report` |
| 17 | Vấn đề 3 (Review): Toàn bộ 5 command hậu-tạo case kiểm tra timeline UTC mili-giây đơn điệu, giữ tương thích lệch múi giờ cùng thời điểm và từ chối case hỏng mốc thời gian (`TIMESTAMP_OUT_OF_ORDER`, `INVALID_TIMESTAMP`, `INVALID_CASE`) | `assignInvestigatorToCase`, `selfAssignInvestigationCase`, `submitInvestigationReport`, `requestInvestigationCaseRevision`, `confirmInvestigationCaseReport` | `L2964`: `17. Regression Step 3: post-create commands enforce monotonic UTC ms timeline and reject corrupted case timestamps` |

### 4.2. Kết quả kiểm tra thực tế (`frontend/LCS`)

**1. Baseline trước thay đổi (do `@researcher` chạy trên nhánh `feat/FE-DashboardPage`):**
- `npm run check`: **exit code `0`**
  - `eslint src --max-warnings=0`: đạt (0 lỗi, 0 cảnh báo).
  - `next typegen && tsc --noEmit`: đạt (0 lỗi).
  - `node --test tests/*.test.cjs`: **94 tests (`0` suites), 94 pass, 0 fail, 0 skipped, 0 todo**.
- `npm run build`: **exit code `0`** (Next.js `15.5.25`, compiled in `3.9s`, static pages `6/6`: `/`, `/_not-found`, `/fraud-monitoring`, `/login`).

**2. Mốc hoàn thành Phase 1 WF-04 ban đầu (do `@tester` chạy trước đợt sửa lỗi Review):**
- `npm run check`: **exit code `0`** (`0` cảnh báo lint, `0` lỗi TypeScript, **`108` tests** = `94` test hiện có + `14` test WF-04, `108` pass, `0` fail, `0` skipped, `0` todo).
- `npm run build`: **exit code `0`** (Next.js `15.5.25`, `Compiled successfully in 4.4s`, `Generating static pages (6/6)`).

**3. Tái hiện lỗi trước khi sửa ở đợt Review-Fixes (do `@tester` chạy 3 regression tests trên mã nguồn trước khi sửa):**
- `node --test tests/investigation-case.test.cjs`: **exit code `1`** (**`17` tests: `14` pass, `3` fail, `0` skipped** — đúng 3 test `#15`, `#16`, `#17` thất bại để chứng minh tái hiện 3 vấn đề trước sửa).

**4. Sau khi áp dụng cả 3 bước sửa lỗi Review và cập nhật toàn bộ suite (`@tester` chạy tuần tự trong `frontend/LCS`):**
- `node --test tests/investigation-case.test.cjs`: **exit code `0`** (**`17` tests: `17` pass, `0` fail, `0` skipped**).
- `npm run check`: **exit code `0`**
  - `npm run lint` (`eslint src --max-warnings=0`): **0 warnings, 0 errors** (exit code `0`).
  - `npm run typecheck` (`next typegen && tsc --noEmit`): **`Route types generated successfully`, 0 type errors** (exit code `0`).
  - `npm test` (`node --test tests/*.test.cjs`): **`111` tests, `111` pass, `0` fail, `0` cancelled, `0` skipped, `0` todo** (gồm **94 test hiện có** và **17 test WF-04** trong `tests/investigation-case.test.cjs`).
- `npm run build`: **exit code `0`** (Next.js `15.5.25`, `Compiled successfully in 3.0s`, `Generating static pages (6/6)`).

*(Ghi chú: toàn bộ kiểm thử Phase 1 là unit test hành vi trên Node VM đối với lớp domain thuần; chưa có UI component test hay E2E trình duyệt.)*

---

## 5. Giới hạn của Phase 1

- **Phase 1 KHÔNG hoàn thiện WF-04 trên toàn hệ thống.** Hiện mới hoàn thành phần model dữ liệu thuần, pure commands, read guards và unit test đơn vị; luồng dashboard thực tế trên trình duyệt vẫn đang chạy theo cơ chế cũ.
- **UI và browser storage vẫn là legacy:** `FraudGuardDashboard.tsx`, `AlertsView.tsx`, `CasesView.tsx`, `AlertCaseDrawer.tsx`, `ReportsView.tsx`, `MembersView.tsx`, `PlatformHealthView.tsx` và `localStorage` (`fraudguard-demo-workspace-v3`) vẫn lưu/đọc case trên từng `TransactionRisk` (`caseId`, `caseStatus`, `assignedInvestigator`, `investigationReport`, `caseDecision`).
- **Ranh giới hàm thuần đối với dữ liệu do caller truyền vào (`existingCases` và phiên bản báo cáo hiển thị):** dù Phase 1 đã bắt buộc `existingCases`, `reportId` và `reportVersion`, hàm thuần không trực tiếp đọc store/CSDL nên vẫn không thể phát hiện nếu caller ở Phase 2 cố tình truyền `[]` sai thực tế, truyền danh sách `existingCases` đã lọc/cũ thiếu case `Closed`, hoặc tự tra lại báo cáo mới nhất tại thời điểm bấm nút thay vì dùng `(reportId, reportVersion)` đang hiển thị trên UI. Toàn bộ tính toàn vẹn dữ liệu đầu vào phải được giữ ở tầng state/storage Phase 2 và đồng bộ nguyên tử phía BE.
- **Chưa có BE và AI service thật:** `src/services/` giữ nguyên `.gitkeep`; chưa kết nối API, xác thực server, đồng bộ transaction DB hay suy luận AI thực tế.
- **Chưa xây dựng luồng và UI gửi feedback:** chức năng SME Admin chọn báo cáo đã xác nhận để bổ sung nhận xét và gửi feedback cho Platform Admin chưa được triển khai trong Phase 1 (chỉ bảo đảm hàm đóng case không tự sinh feedback).
- **Biểu diễn kết luận dạng văn bản tạm thời:** `resultText` trong `InvestigationCaseAlertReportItem` và `summary` trong `InvestigationCaseConclusion` là cấu trúc tạm phía frontend; chưa chốt enum kết luận nghiệp vụ hay mapping sang nhãn đánh giá AI.
- **Chưa có trường trạng thái tài khoản trên `UserProfile`:** `UserProfile` (`src/types/fraudguard.ts`) hiện chỉ có `id`, `name`, `email`, `role`, `enterpriseId?`, chưa có cờ active/suspended để kiểm tra thêm khi phân công.

---

## 6. Phương án chuyển đổi dữ liệu legacy cho Phase 2

Khi tích hợp `InvestigationCase[]` vào state và `localStorage` ở Phase 2, migration phải chạy **có kiểm soát (không tự động hợp thức hóa hoặc che giấu dữ liệu thiếu/mâu thuẫn)**:

1. **Case cũ một alert -> danh sách liên kết một phần tử (`alertIds: [tx.alertId]`):**
   - Mỗi case legacy đơn lẻ được chuyển thành một `InvestigationCase` có đúng 1 phần tử trong `alertIds` và `alerts`; **tuyệt đối không** tự động gộp các case cũ khác nhau thành một case nhiều alert.
2. **Bảo toàn dữ liệu lịch sử đã có:**
   - Giữ nguyên `investigationNotes` cũ (lưu dạng ghi chú đối chiếu lịch sử hoặc note khởi tạo không xóa bỏ), `investigationReport` (tổng hợp thành `InvestigationCaseReportVersion` v1 nếu đủ thông tin người gửi/thời điểm/nội dung), và `caseDecision` (tách thành `InvestigationCaseConclusion` nếu case đã kết thúc hợp lệ).
3. **Ánh xạ có kiểm chứng đối với `Assigned`, `Reported` và các trạng thái kết luận cũ:**
   - `Open` -> `Open` (nếu chưa có người phụ trách và chưa có báo cáo).
   - `Assigned` -> `Investigating`: chỉ chuyển đổi sạch khi tra cứu được duy nhất một `Investigator` cùng `enterpriseId` theo `assignedInvestigatorId` (hoặc tên không trùng lặp khi thiếu ID, đồng thời ghi log/gắn cờ nếu chỉ có tên chuỗi).
   - `Reported` -> `Pending Review`: chỉ chuyển đổi khi có `investigationReport` hợp lệ (`submittedBy`, `submittedAt`, `notes`/`finding` không rỗng) và xác định được người phụ trách.
   - `Confirmed Fraud` / `False Alarm` / `Resolved` -> `Closed` + `conclusion` tách biệt: chỉ khi có `caseDecision` (`decidedBy`, `decidedAt`) và báo cáo gắn với nó; nội dung `finding` cũ (`Suspicious` / `Legitimate` / `Need More Info`) và nhãn trạng thái kết luận cũ giữ dạng văn bản mô tả tham chiếu (`resultText`), **không** tự suy diễn thành nhãn đánh giá AI.
4. **Phát hiện và gắn cờ bản ghi thiếu bằng chứng hoặc mâu thuẫn (KHÔNG tự bịa lịch sử):**
   - Trong dữ liệu demo hiện tại (`src/data/fraudguard-transactions.ts` và `src/data/fraudguard-enterprises.ts`), tồn tại nhiều trường hợp cần lọc hoặc gắn cờ rà soát khi migrate:
     - `tx-fg-1023` (`CASE-FG-1023`, `Assigned`, `assignedInvestigator: "Nguyễn Văn An"`): thiếu `assignedInvestigatorId`, thiếu `createdBy`/`createdAt` và thiếu bằng chứng mở case hợp lệ.
     - `tx-005` (`CASE-2026-0895`), `tx-011` (`CASE-2026-0887`), `tx-015` (`CASE-2026-0865`), `tx-017` (`CASE-2026-0850`): có `scoringSource: "AI"` nhưng `riskLevel: "Normal"` lại gắn `caseId`/`caseStatus`.
     - `tx-014` (`CASE-2026-0871`): `scoringSource: "RULE"` nhưng gắn `caseId`, `caseStatus: "Resolved"`, `investigationReport`.
     - `tx-021` (`CASE-2026-0720`), `tx-026` (`CASE-2026-0580`): `scoringSource: "RULE_FALLBACK"` nhưng gắn `caseId`/`caseStatus`.
     - Toàn bộ `demoEnterprises` hiện chưa có trường `lifecycle` WF-01.
   - **Nguyên tắc xử lý bắt buộc:**
     - Mọi bản ghi thiếu `actorId`/thời điểm/bằng chứng hợp lệ lúc tạo case (ví dụ thiếu WF-01 `Operating` / `Subscription` tại thời điểm mở) hoặc không phải `AI + Abnormal` phải được đánh dấu trong báo cáo/hàng đợi **"Cần xử lý / đối soát thủ công"**; **không** tự bịa `createdBy`, `approvalHistory`, lịch sử chuyển trạng thái hoặc bịa gói `Subscription` đang còn hiệu lực.
     - Nếu nhiều `TransactionRisk` có cùng `caseId` nhưng mâu thuẫn dữ liệu (khác tenant/project, khác `caseStatus`, khác người phụ trách, khác `investigationReport` hoặc `caseDecision`), **không** được tự chọn một bản ghi để ghi đè phần còn lại; phải gắn cờ mâu thuẫn để người quản trị/kỹ thuật xử lý.

---

## 7. Các điểm nối và danh sách caller cũ cần cập nhật ở Phase 2

### 7.1. Kiến trúc nối UI, State & Guards ở Phase 2

1. **State `InvestigationCase[]` độc lập & `localStorage` migration có kiểm soát:**
   - Bổ sung `cases: InvestigationCase[]` độc lập cạnh `transactions` trong state của `FraudGuardDashboard.tsx` và schema mới cho `localStorage` (`fraudguard-demo-workspace-v3` -> nâng version hoặc trường riêng có migration chạy một lần kèm danh sách bản ghi cần rà soát).
   - Khi gọi `createInvestigationCase`, UI Phase 2 bắt buộc truyền **toàn bộ mảng `InvestigationCase[]` mới nhất trong workspace** (bao gồm cả case `Closed`) vào `existingCases`; tuyệt đối không truyền mảng rỗng giả hoặc danh sách đã lọc/phân trang theo tab hay bộ lọc giao diện.
2. **Alert Queue đa chọn (`AlertsView.tsx`):**
   - Thêm chọn nhiều (multi-select checkbox) cho các giao dịch `scoringSource === "AI" && riskLevel === "Abnormal"` chưa nằm trong bất kỳ `InvestigationCase` nào (và chưa mang liên kết legacy chưa migrate).
   - Cung cấp nút chủ động tạo 1 `Open` case qua `createInvestigationCase` (không tự động tạo case khi alert phát sinh); Rule Alert chỉ hiển thị theo dõi/đánh dấu đã xem (WF-03).
   - Alert đã liên kết vẫn tra cứu được trong Alert Queue và hiển thị đúng mã `caseId` + `status` từ `InvestigationCase`.
3. **Case Queue đếm theo case (`CasesView.tsx`):**
   - Đếm và render mỗi dòng/card cho **một `InvestigationCase`**, không đếm theo số lượng `TransactionRisk` thành viên.
   - Loại bỏ tab/nhánh `Assigned` và `Reported`; dùng đúng 4 trạng thái `Open | Investigating | Pending Review | Closed`.
   - Áp dụng `readInternalInvestigationCase` để Investigator chỉ thấy case được giao theo `assignee.actorId === currentUser.id`.
4. **Chi tiết case, báo cáo chung & phiên bản (`AlertCaseDrawer.tsx`):**
   - Thay stepper 5 bước (`Open -> Assigned -> Investigating -> Reported -> Closed`) bằng 4 trạng thái WF-04 kèm nhánh `Pending Review -> Investigating`.
   - Hiển thị đầy đủ danh sách AI Alert liên kết thuộc case và tách rõ với dữ liệu giao dịch tham khảo xung quanh.
   - Phân công Investigator chọn theo `user.id` (`assignInvestigatorToCase`) hoặc Operator tự đảm nhận (`selfAssignInvestigationCase`).
   - Form báo cáo cho phép nhập `summary` chung và `resultText` + `evidence` riêng cho **từng alert** (`submitInvestigationReport`); hiển thị lịch sử toàn bộ phiên bản `reports` và lý do `REVISION_REQUESTED`; xác nhận đóng (`confirmInvestigationCaseReport`) tách 2 nút/thao tác riêng cả khi Operator tự điều tra và phải truyền đúng `reportId` + `reportVersion` của phiên bản báo cáo đang mở trên màn hình để chặn xác nhận bản cũ nếu dữ liệu vừa thay đổi (không tự đọc lại bản mới nhất lúc bấm nút).
5. **Guards ghi, quyền đọc & thứ tự thời gian:**
   - Gọi `checkInvestigationCaseCreationEligibility` / `createInvestigationCase` khi mở case mới (chặn khi chưa `Operating` hoặc không có `Subscription` còn hiệu lực).
   - Không tái sử dụng guard Subscription tạo case để khóa phân công, gửi/bổ sung báo cáo, duyệt, đóng hoặc xem các `InvestigationCase` đã mở trước khi hết hạn.
   - Truyền chuỗi thời gian ISO chuẩn có offset rõ ràng theo thứ tự không lùi cho `at` ở mọi command để không vi phạm guard đơn điệu UTC mili-giây.
   - Dùng `readInternalInvestigationCase` và `readConfirmedInvestigationReport` để khóa truy cập chéo tenant và không cấp quyền mặc định cho `Platform Admin` / `Implementation Staff`.

### 7.2. Danh sách đầy đủ caller cũ cần rà soát & thay thế ở Phase 2

| Tệp hiện có (`frontend/LCS/...`) | Hành vi legacy hiện tại | Thay đổi bắt buộc ở Phase 2 |
|---|---|---|
| `src/components/fraudguard-dashboard/MembersView.tsx` & `src/utils/permissions.ts` (`canSaveMember`, L104–115) | Khi `SME Admin` đổi vai trò thành viên, `canSaveMember` quét `enterpriseTransactions` xem có `tx.caseId` thuộc `['Assigned', 'Investigating', 'Reported']` khớp `assignedInvestigatorId` hoặc tên `assignedInvestigator` không (`MembersView.tsx` L39). | **Bắt buộc đổi busy-member check** sang quét `InvestigationCase[]` đang mở (`status` thuộc `'Open' | 'Investigating' | 'Pending Review'`) theo đúng `assignee?.actorId === previous.id` (không khớp theo tên). Đồng thời kiểm tra lại `getRolePermissions` (`permissions.ts`) để `SME Admin` chỉ xem báo cáo đã xác nhận, không mở quyền ghi/xem hồ sơ điều tra nội bộ. |
| `src/components/fraudguard-dashboard/FraudGuardDashboard.tsx` | `metrics.openAlerts` kiểm `!tx.caseId` (L310); `metrics.activeCases` gọi `isActiveInvestigation` theo transaction (L312); `handleUpdateTransaction` dùng `canUpdateCase` & ghi `localStorage` (L339–360); `MembersView` `onSave` sửa tên `tx.assignedInvestigator` (L394–406); Viewer KPI đếm theo `tx.caseStatus` (L628–653); truyền mảng tên `investigators: string[]`. | Chuyển state trung tâm sang `InvestigationCase[]`, gọi trực tiếp pure commands trong `investigation-case.ts`, cập nhật `openAlerts` / `activeCases` đếm theo case độc lập, truyền danh sách `UserProfile` (có `id`) thay vì `string[]`, sửa `MembersView` `onSave` theo `InvestigationCase[]`. |
| `src/components/fraudguard-dashboard/AlertsView.tsx` | Chỉ mở drawer từng dòng đơn (`isPendingAiCase` kiểm `!alert.caseId`), hiển thị 1 `caseId`/`caseStatus` trên transaction, chưa có multi-select tạo case. | Bổ sung multi-select AI Alert cùng tenant chưa liên kết `InvestigationCase`, action tạo `Open` case từ nhiều alert, hiển thị liên kết `InvestigationCase` tương ứng. |
| `src/components/fraudguard-dashboard/CasesView.tsx` | Lọc `transactions` có `caseId` (đếm alert thay vì đếm case); tách `Assigned` vs `Investigating` (`handleAcceptCase`); `handleQuickAssign` gán chuỗi tên vào `Assigned`; đọc 1 `tx.investigationReport.finding`. | Chuyển hoàn toàn sang danh sách `InvestigationCase[]` (1 item = 1 case); bỏ `Assigned`/`Reported`; phân công/tự đảm nhận theo `user.id`; đọc tổng kết & phiên bản báo cáo mới nhất. |
| `src/components/fraudguard-dashboard/AlertCaseDrawer.tsx` | Stepper 5 bước gồm `Assigned`/`Reported`; tạo ID bằng `Date.now()`/`crypto.randomUUID()`; gán Investigator theo tên; cho phép reassignment giữa chừng; ghi đè 1 `investigationReport`; `handleOperationDecision` cho phép đóng `Open`/`Investigating` bằng `directive` không cần báo cáo; `isViewer` gộp `SME Admin`, `Platform Admin`, `Viewer`. | Thay bằng luồng command `investigation-case.ts`; hỗ trợ danh sách nhiều alert trong drawer/detail; giữ lịch sử phiên bản báo cáo & lý do bổ sung; bắt buộc có báo cáo `Pending Review` trước khi đóng; cô lập `Platform Admin` khỏi hồ sơ nội bộ. |
| `src/components/fraudguard-dashboard/ReportsView.tsx` | Đếm số lượng theo `tx.caseStatus` từng transaction; đọc 1 `tx.investigationReport.finding` (`Suspicious`/`Legitimate`/`Need More Info`); chưa có phiên bản báo cáo, kết quả từng alert hay luồng gửi feedback. | Đếm theo `InvestigationCase` & `conclusion`; hiển thị đầy đủ phiên bản báo cáo và kết quả/bằng chứng riêng từng alert; bổ sung giao diện SME Admin chủ động gửi feedback từ báo cáo đã xác nhận. |
| `src/utils/case-workflow.ts` & `src/types/fraudguard.ts` | `canUpdateCase`, `isActiveInvestigation`, `isCaseAssignee` và `CaseStatus` legacy (`Assigned`, `Reported`, `Confirmed Fraud`, `False Alarm`, `Resolved`). | Ngừng dùng ở UI khi đã nối `investigation-case.ts`; giữ tương thích cho bước migration rồi dọn/deprecated theo kế hoạch. |
| `src/utils/enterprise.ts` (`transactionsForEnterprise` L16–21, `auditForUser` L23–32) | `transactionsForEnterprise` lọc quyền Investigator qua `tx.caseId` & fallback theo tên; `auditForUser` trả **toàn bộ `logs`** cho `Platform Admin` (lộ luôn log `CASE_STATUS_UPDATED` chứa report/decision nội bộ). | Lọc case/alert cho Investigator theo `InvestigationCase.assignee.actorId`; **cô lập log điều tra nội bộ khỏi `Platform Admin`** trong `auditForUser`. |
| `src/utils/notification-feed.ts` | Tạo feed thông báo từ `tx.caseStatus`, `tx.assignedAt`, `tx.caseDecision`, `tx.investigationReport`. | Chuyển nguồn feed sang `InvestigationCase.history` đúng tenant, đúng phân quyền (SME Admin chỉ nhận thông báo báo cáo đã xác nhận; PA không nhận log nội bộ). |
| `src/utils/platform-summary.ts` (L17) & `src/components/fraudguard-dashboard/PlatformHealthView.tsx` (L191) | Đếm `tx.caseDecision` (`Confirmed Fraud`/`False Alarm`) trực tiếp làm số kết luận/feedback phía Platform Admin. | Đổi sang chỉ đếm/hiển thị **feedback do SME Admin chủ động gửi lên Platform Admin**, không đọc trực tiếp case nội bộ của doanh nghiệp. |
| `src/components/fraudguard-dashboard/TransactionRiskTable.tsx`, `RuleDetailDrawer.tsx`, `DashboardToolbar.tsx`, `AuditTrailView.tsx`, `src/utils/export-csv.ts` | Tab `"cases"`, bộ lọc `filters.caseStatus`, thống kê rule theo `tx.caseStatus === 'False Alarm' | 'Confirmed Fraud'`, `CASE_STATUS_UPDATED`, cột CSV `Case Status`. | Đồng bộ hiển thị, lọc và xuất CSV theo `InvestigationCase` (4 trạng thái mới + kết luận tách biệt), tránh đếm sai theo số giao dịch hoặc đọc nhầm cột legacy. |

---

## 8. Các điểm chờ BE / AI Service Contract (chưa triển khai trong Phase 1)

`src/services/` hiện được giữ nguyên chỉ có `.gitkeep`. Trước khi tích hợp backend và AI service thực tế (phục vụ demo hội đồng), cần chốt 5 contract sau:

1. **Liên kết Alert–Case nguyên tử & chống trùng dưới thao tác đồng thời:**
   - Ràng buộc duy nhất phía CSDL (`UNIQUE(alert_id)` trong bảng liên kết case-alert và `UNIQUE(case_id)` trên bảng case) cùng transaction nguyên tử để BE tự kiểm chứng tính duy nhất trên nguồn dữ liệu thật, không phụ thuộc snapshot `existingCases` do client gửi lên; khi hai `Operator` chọn cùng một AI Alert đồng thời, chỉ một yêu cầu tạo case thành công và yêu cầu còn lại nhận lỗi xung đột (`409` / `ALERT_ALREADY_LINKED`).
2. **Xác thực quyền, cô lập tenant và kiểm tra lại WF-01 trên server:**
   - Server xác định `actor.id`, `actor.role`, `enterpriseId` từ phiên đăng nhập/JWT đã xác thực, không tin payload từ frontend.
   - Tại endpoint tạo case, server kiểm tra lại trạng thái `Operating` và khoảng hiệu lực `Subscription` (`[startedAt, expiresAt)`) theo thời gian máy chủ; không áp dụng lại guard hết hạn này để chặn thao tác trên các case đã mở hợp lệ trước `expiresAt`.
3. **Kiểm soát xung đột đồng thời (Optimistic Concurrency), phiên bản báo cáo & mốc thời gian phía server:**
   - Gắn `version` / ETag trên case và đối chiếu tường minh `reportId` + `reportVersion` từ client với `pendingReviewReportId` / `pendingReviewReportVersion` trên CSDL khi xác nhận đóng case (cũng như kiểm tra xung đột khi gửi báo cáo hoặc yêu cầu bổ sung) để tránh ghi đè chéo hoặc xác nhận nhầm bản cũ đã bị yêu cầu bổ sung (ánh xạ về lỗi tương đương `STALE_REPORT_VERSION` / `REPORT_VERSION_MISMATCH` / `409 Conflict`).
   - Thời gian chuyển trạng thái trên API thực tế do máy chủ ấn định và bảo đảm thứ tự đơn điệu thay vì tin hoàn toàn đồng hồ phía client.
4. **API Contract gửi & tiếp nhận Feedback (SME Admin → Platform Admin):**
   - Định nghĩa endpoint, schema payload, trạng thái xử lý feedback độc lập khỏi vòng đời `Closed` của case, liên kết bắt buộc tới `caseId`, `reportId`, `reportVersion`, và mảng kết quả từng alert theo báo cáo đã xác nhận (bảo toàn kết quả khác nhau giữa các alert; không gộp tổng kết chung thành một nhãn duy nhất). Quy định rõ `Platform Admin` chỉ truy cập dữ liệu đã gửi kèm trong feedback.
5. **Chuẩn hóa bảng kết luận nghiệp vụ & ánh xạ sang nhãn đánh giá AI:**
   - Thống nhất với đội sản phẩm và đội AI bộ enum kết luận chính thức (thay thế `resultText` văn bản tự do tạm thời ở Phase 1) cùng quy tắc ánh xạ kết quả từng alert sang nhãn đánh giá AI (đo độ chính xác mô hình/theo dõi drift), giữ nguyên nguyên tắc đóng case hay gửi feedback không tự kích hoạt retrain mô hình.
