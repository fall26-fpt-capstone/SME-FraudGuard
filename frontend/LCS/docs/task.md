# Kế hoạch hoàn thiện WF-01 đến WF-04

Ngày lập: 11/11/2026.

Cập nhật yêu cầu WF-04: 15/11/2026 theo trao đổi với người dùng. Đây là cập nhật kế hoạch, chưa xác nhận đã triển khai code.

Mục tiêu: đưa frontend SME-FraudGuard về đúng phạm vi proposal và dự thảo workflow, triển khai theo từng bước có thể kiểm thử và nghiệm thu riêng.

## Phạm vi hiện tại — Frontend-only

Theo xác nhận của người dùng: hiện chưa có BE và AI service sẵn sàng để tích hợp. Chỉ xây dựng bộ khung frontend để sau này dễ nối dịch vụ. Những phần backend có trong repository không được coi là dịch vụ đã sẵn sàng hoặc API contract đã được duyệt.

Theo kế hoạch của người dùng, khi review/demo với hội đồng sẽ có AI service thật. Giới hạn frontend-only áp dụng cho giai đoạn xây dựng hiện tại; trước demo cần nghiệm thu tích hợp thực tế theo contract đã thống nhất.

- Hoàn thiện màn hình, model dữ liệu frontend, phân quyền hiển thị/thao tác, chuyển trạng thái và nhánh ngoại lệ của WF-01 đến WF-04.
- Dùng dữ liệu demo có kiểm soát trong `src/data`; tách nguồn dữ liệu và thao tác cập nhật khỏi component trình bày qua props/callback hoặc hook để dễ thay bằng dịch vụ sau này.
- Đặt kiểu dữ liệu dùng chung trong `src/types`, quy tắc nghiệp vụ trong `src/utils`. Model frontend là đề xuất nội bộ, không phải hợp đồng API đã thống nhất với BE.
- Chuẩn bị trạng thái loading, empty, error và success bằng kịch bản demo xác định trước; không gọi HTTP giả hoặc tự đặt endpoint. Giữ `src/services` trống đến khi có contract được duyệt.
- Với AI, dùng fixture Normal/Anomaly, AI Alert và lỗi dịch vụ/fallback được đánh dấu demo. Không mô tả kết quả giả lập là suy luận AI thật, không xây dựng hay huấn luyện model.
- Email, kích hoạt tài khoản, xác thực API key, tính đồng thời và bảo mật phía server là điểm nối tương lai. Frontend có thể minh họa trạng thái tương ứng nhưng không tuyên bố đã gửi email hoặc kiểm chứng server thành công.
- Các mục dưới đây đề cập tích hợp BE/AI/email thực tế đều thuộc giai đoạn sau, không phải điều kiện hoàn thành bộ khung frontend và không chặn tiến độ hiện tại.

Tiêu chí hoàn thành giai đoạn hiện tại: chạy xuyên suốt bốn workflow bằng dữ liệu demo, đúng actor/trạng thái/nhánh lỗi; logic nghiệp vụ tách khỏi nguồn dữ liệu; có danh sách điểm nối và dữ liệu cần trao đổi khi BE/AI sẵn sàng.

## 1. Nguồn yêu cầu và nguyên tắc

- Proposal: `Phieu_FA26SE215_v3_EN.docx`.
- Workflow: `SME-FraudGuard_Du-thao-dang-ky-workflow.docx`.
- Proposal xác định phạm vi sản phẩm; dự thảo workflow bổ sung thứ tự thao tác, actor, trạng thái và nhánh ngoại lệ. Điểm chưa rõ hoặc xung đột phải được ghi nhận, không tự coi hành vi demo là yêu cầu đã duyệt.
- Phân biệt hoàn thành frontend demo với hoàn thành tích hợp end-to-end.
- Chỉ sửa frontend trong kế hoạch này. Các mục backend/AI/email bên dưới là phụ thuộc cần phối hợp, không phải cho phép tự triển khai dịch vụ khác.
- Chưa có API contract được duyệt thì giữ `src/services` trống theo AGENTS.md; không tạo endpoint hoặc phản hồi thành công giả.
- Mọi dữ liệu phải nằm trong tenant được phép truy cập. Browser storage chỉ phục vụ demo, không thay thế bảo mật server.
- Hệ thống hỗ trợ phát hiện, điều tra và báo cáo; không tự khóa tài khoản, hủy đơn hoặc từ chối giao dịch.
- Giữ dữ liệu và thay đổi hiện có; khi đổi model phải có phương án chuyển dữ liệu demo cũ.

### Quyết định WF-04 cập nhật ngày 15/11/2026

- Người dùng xác nhận quay lại workflow ban đầu: Operator có thể gom nhiều AI Alert liên quan của cùng doanh nghiệp vào một case. Quyết định này thay thế giới hạn một alert/một case đã trao đổi ngày 13/11/2026; không suy diễn rằng case bắt buộc phải có tối thiểu hai alert.
- Mỗi case có một hoặc nhiều AI Alert; mỗi alert được chọn phải đủ điều kiện và chưa liên kết với case nào. Một alert không được đồng thời thuộc nhiều case.
- Case là hồ sơ điều tra chung cho các AI Alert được chọn. Operator chủ động tạo case Open, sau đó tự đảm nhận hoặc phân công Investigator; không tự tạo case cho mọi AI Alert vừa phát sinh.
- Actors: Operator, Investigator, SME Admin, Platform Admin. Không liệt kê SME-FraudGuard như một role.
- Luồng chính: Investigator điều tra và gửi báo cáo; Operator xem xét, yêu cầu bổ sung hoặc xác nhận kết luận và đóng case. SME Admin xem báo cáo/kết luận đã xác nhận và chủ động chọn gửi feedback cho Platform Admin.
- Lưu hồ sơ sau thao tác gửi/xác nhận khác với gửi feedback. Đóng case không tự gửi feedback, không phụ thuộc việc SME Admin có gửi feedback hay không. Platform Admin tiếp nhận nội dung được doanh nghiệp gửi; không tự suy ra quyền truy cập toàn bộ hồ sơ nội bộ.
- Feedback phục vụ đánh giá/cải thiện AI; chưa mặc định cơ chế tự retrain hoặc API chuyển feedback sang AI service.
- Người dùng xác nhận: Operator tự điều tra được tự viết/gửi báo cáo, xác nhận kết luận và đóng case mình phụ trách. Vẫn lưu riêng các thao tác gửi báo cáo và xác nhận để truy vết; không yêu cầu một người duyệt khác cho nhánh này.
- Người dùng xác nhận: khi Subscription hết hạn, chặn tạo case mới nhưng vẫn cho tiếp tục điều tra, gửi/bổ sung báo cáo, xác nhận, đóng và xem lại các case đã mở khi gói còn hiệu lực.
- Người dùng xác nhận: mỗi case có một báo cáo chung, trong đó ghi kết quả và bằng chứng riêng cho từng AI Alert, cùng phần tổng kết chung. Feedback giữ đúng kết quả tương ứng từng alert; cách chuyển các kết quả này thành nhãn đánh giá AI cần thống nhất với đội AI.
- Kịch bản WF-04 hiện dùng dữ liệu tiêu thụ điện tại cơ quan/trường học theo nội dung người dùng cung cấp. Cần thống nhất fixture demo xuyên WF-02/WF-04 nếu WF-02 vẫn dùng tiệm net; không tự đổi yêu cầu WF-02.
- Nhánh ngoại lệ demo chính là báo cáo thiếu bằng chứng và yêu cầu bổ sung. Chính sách Subscription hết hạn cần có test riêng; không tự thay nhánh demo chính bằng nhánh hết hạn.

## 2. Thứ tự triển khai

1. Chốt ma trận yêu cầu và model dữ liệu frontend; ghi các điểm cần thống nhất contract sau này.
2. Hoàn thiện WF-01 và điều kiện doanh nghiệp được vận hành.
3. Hoàn thiện nhập dữ liệu dùng chung.
4. Hoàn thiện WF-03 ở frontend và xác định điểm nối backend.
5. Hoàn thiện bộ khung WF-02 bằng kết quả AI và fallback demo.
6. Hoàn thiện model case, Alert Queue và Case Queue của WF-04.
7. Hoàn thiện điều tra, duyệt, lịch sử và quyền xem kết quả.
8. Kiểm thử xuyên suốt, hoàn thiện minh chứng demo.

WF-02 và WF-04 được nối xuyên suốt bằng AI Alert demo trong giai đoạn hiện tại. Nghiệm thu tích hợp dịch vụ thật là mốc riêng sau khi BE/AI sẵn sàng.

## 3. Bước 1 — Chuẩn hóa yêu cầu và dữ liệu

- [ ] Lập bảng truy vết: yêu cầu → actor → màn hình → hàm xử lý → test → trạng thái hoàn thành.
- [x] Tách rõ trạng thái xác nhận đặc tả, trạng thái duyệt cấu hình và trạng thái vận hành doanh nghiệp.
- [ ] Chuẩn hóa vòng đời case theo WF-04: `Open → Investigating → Pending Review → Closed`.
  - [x] Phase 1 WF-04 (domain thuần): chuẩn hóa `InvestigationCaseStatus` (`Open | Investigating | Pending Review | Closed`) và chuyển trạng thái thuần (kèm `Pending Review → Investigating`) trong `src/types/investigation-case.ts` và `src/utils/investigation-case.ts`.
  - [x] Phase 2A WF-04 (state/storage/queue): nối `InvestigationCase[]`, `localStorage` (`fraudguard-demo-workspace-v4`), 4 tab trạng thái trên `CasesView.tsx`, chuyển trạng thái `Open → Investigating` (phân công theo `user.id` hoặc `Operator` tự đảm nhận) và khóa ghi legacy trên `AlertCaseDrawer.tsx`.
  - [x] Phase 2B WF-04 (UI workflow): nối thao tác gửi báo cáo (`Investigating → Pending Review`), yêu cầu bổ sung (`Pending Review → Investigating`) và xác nhận đóng case (`Pending Review → Closed`) trên `CaseReportWorkflowPanel.tsx`, `CasesView.tsx`, `ReportsView.tsx`, `AuditTrailView.tsx`, `useInvestigationCases.ts` và `FraudGuardDashboard.tsx`.
  - [ ] Dọn cuối WF-04 / legacy: hoàn tất dọn phần `CaseStatus` / `case-workflow.ts` legacy còn lại và gỡ các mục tạm khi thực hiện Checklist dọn cuối.
- [ ] Tách kết luận điều tra khỏi trạng thái case; chưa tự chốt danh sách kết luận khi tài liệu chưa quy định cụ thể.
  - [x] Phase 1 WF-04 (domain thuần): tách riêng `InvestigationCaseConclusion` khỏi trạng thái `Closed`; giữ biểu diễn văn bản tạm `resultText` cho từng alert và không tự chốt enum hay mapping nhãn AI.
  - [x] Phase 2A WF-04 (UI chỉ đọc & khóa legacy): hiển thị tách biệt trạng thái `Closed` và bản xem trước `conclusion` chỉ đọc trên `CasesView.tsx` / `ReportsView.tsx`; chặn ghi kết luận kiểu cũ trên `TransactionRisk.caseStatus`.
  - [x] Phase 2B WF-04 (UI xác nhận kết luận): nối bước xem lại và xác nhận kết luận tách biệt khi đóng case trên `CaseReportWorkflowPanel.tsx`, vẫn giữ `resultText` văn bản tạm thời.
  - [ ] Hậu Phase 2B / BE-AI contract: chốt danh sách enum kết luận nghiệp vụ và quy tắc ánh xạ nhãn đánh giá AI sau khi có contract, đồng thời dọn bỏ hẳn `TransactionRisk.caseStatus` legacy ở bước dọn cuối.
- [ ] Chốt các điểm còn mở: nội dung/trạng thái xử lý feedback, bộ kết luận điều tra và cách ánh xạ kết quả từng alert sang nhãn đánh giá AI, quyền cập nhật sau lần kích hoạt đầu tiên.
- [ ] Thiết kế dữ liệu cho thời hạn Subscription, phiên bản phê duyệt, case liên kết danh sách AI Alert, lịch sử báo cáo và feedback do SME Admin gửi.
- [ ] Lập phương án chuyển dữ liệu cũ (`Assigned`, `Reported`, các trạng thái kết luận), tránh mất người phụ trách, báo cáo và quyết định.
  - [x] Phase 2A WF-04 (migration & lưu trữ): triển khai `migrateWorkspaceLegacyCases` (`src/utils/case-migration.ts`) và sao lưu `fraudguard-demo-workspace-v3-backup` (`src/utils/workspace-storage.ts`), chuyển dữ liệu đủ bằng chứng và cách ly 13 bản ghi seed thiếu provenance vào `legacyCaseArchive` chỉ đọc mà không làm mất dữ liệu gốc.
  - [ ] Phase 2B: hoàn thiện đối soát/tương tác báo cáo và quyết định trên giao diện khi mở rộng chức năng báo cáo.
- [ ] Chuyển case cũ một alert sang danh sách liên kết một phần tử, giữ lịch sử và báo cáo; không tự động gom case đã có.
  - [x] Phase 2A WF-04 (migration): `migrateWorkspaceLegacyCases` chuyển case đơn lẻ đủ điều kiện thành mảng `alertIds` một phần tử, giữ nguyên báo cáo/lịch sử gốc và không tự động gộp các case cũ khác nhau; bản ghi thiếu bằng chứng được giữ nguyên trong `legacyCaseArchive`.
  - [ ] Phase 2B: nối đầy đủ luồng xem/xử lý báo cáo lịch sử trên giao diện Phase 2B.

Nghiệm thu: mỗi chuyển trạng thái có actor và điều kiện rõ ràng; mọi quyết định chưa có trong tài liệu được đánh dấu là cần xác nhận.

## 4. Bước 2 — WF-01 Thiết lập và bàn giao doanh nghiệp

Rà soát điểm nối: `docs/wf01-integration-review.md`. Đợt tiếp theo được chia thành Phase 2A (state/coordinator/validation và khởi tạo lifecycle cho doanh nghiệp mới), Phase 2B (UI theo actor và thay đường bàn giao cũ), sau đó nghiệm thu đầu-cuối. Prompt Phase 2A: `docs/antigravity-wf01-phase2a.md`. Đây là việc được giao tiếp, chưa đánh dấu đã triển khai.

### 2.1 Tiếp nhận và tài khoản

- [ ] Giữ chức năng Platform Admin tạo doanh nghiệp, SME Admin ban đầu và phân công Implementation Staff.
- [ ] Cho SME Admin truy cập phần thiết lập của doanh nghiệp mình để gửi đặc tả, dữ liệu mẫu và theo dõi tiến độ.
- [ ] Cho Platform Admin và Implementation Staff phụ trách tải tài liệu nhận qua kênh khác lên đúng hồ sơ.
- [ ] Tách kích hoạt tài khoản khỏi kích hoạt doanh nghiệp.
- [ ] Tích hợp email/kích hoạt tài khoản khi contract được duyệt; trước đó hiển thị rõ giới hạn demo.

### 2.2 Cấu hình và duyệt

- [ ] Giữ kiểm thử mẫu, kiểm tra schema và kiểm soát phiên bản rule hiện có.
- [ ] Thay luồng Implementation Staff tự áp dụng/bàn giao bằng gửi phiên bản đã kiểm thử cho Platform Admin duyệt.
- [ ] Platform Admin chỉ duyệt đúng phiên bản đã kiểm thử; thay đổi cấu hình phải kiểm thử lại.
- [ ] Sau duyệt, chuyển doanh nghiệp sang chờ SME Admin kích hoạt.
- [ ] SME Admin xem cấu hình được duyệt, xác nhận bàn giao và kích hoạt doanh nghiệp.
- [ ] Chỉ sau kích hoạt mới chuyển doanh nghiệp sang đang vận hành; bắt đầu thời hạn Subscription nếu đã được cấp gói.

### 2.3 Yêu cầu bổ sung trước lần kích hoạt đầu tiên

- [ ] SME Admin gửi yêu cầu sửa; đưa doanh nghiệp về đang thiết lập.
- [ ] Platform Admin nhìn thấy yêu cầu và lịch sử phê duyệt trước đó.
- [ ] Implementation Staff sửa và kiểm thử lại; Platform Admin duyệt phiên bản mới trước khi SME Admin kích hoạt.

Nghiệm thu: chạy đủ chuỗi `Đang thiết lập → Chờ Platform Admin duyệt → Chờ SME Admin kích hoạt → Đang vận hành`, gồm nhánh ánh xạ sai và duyệt lại. Không actor nào tự vượt qua bước của actor khác.

Điểm sửa chính: `useOnboardingWorkflow.ts`, `OnboardingView.tsx` và các màn hình onboarding, `RuleSetsView.tsx`, `enterprise.ts`, `rule-set-lifecycle.ts`, `permissions.ts`, `types/enterprise.ts`.

## 5. Bước 3 — Nhập và chuẩn hóa dữ liệu dùng chung

- [ ] Giữ đọc CSV/Excel hiện có và kiểm tra dữ liệu theo cấu hình doanh nghiệp.
- [ ] Trả kết quả từng dòng: hợp lệ hoặc lỗi, số dòng và lý do cụ thể.
- [ ] Cho phép lưu/xử lý các dòng hợp lệ khi file có dòng lỗi, đúng nhánh ngoại lệ WF-02.
- [ ] Không báo nhập thành công khi toàn bộ dòng lỗi; hiển thị số dòng nhận và bỏ qua.
- [ ] Giữ kiểm tra phạm vi tenant, mã giao dịch trùng và kiểu dữ liệu; xác định cách xử lý nhập lại với backend.
- [ ] Chặn ingestion khi doanh nghiệp chưa đủ điều kiện vận hành.
- [ ] Phân biệt lỗi toàn file không thể đọc với lỗi dữ liệu của từng dòng.

Nghiệm thu: file có dòng thiếu thời điểm đo vẫn xử lý các dòng hợp lệ; dòng lỗi không tạo transaction hoặc alert. Có test toàn bộ hợp lệ, hỗn hợp, toàn bộ lỗi và nhập trùng.

Điểm sửa chính: `DataIngestionModal.tsx`, `transaction-file.ts`, `transaction-import.ts`, `ingestion-validation.ts`, `FraudGuardDashboard.tsx`.

## 6. Bước 4 — WF-03 Rule-Based Detection

- [ ] Giữ logic đánh giá toàn bộ rule đang hoạt động và phù hợp phạm vi đã xác nhận.
- [ ] Khớp ít nhất một rule: một Rule Alert/giao dịch, lưu đầy đủ các rule và điều kiện khớp.
- [ ] Không khớp rule nào sau đánh giá hợp lệ: lưu Normal và không tạo alert.
- [ ] Bổ sung thao tác Operator đánh dấu Rule Alert đã xem và lưu thông tin người/thời điểm xem.
- [ ] Phân biệt trạng thái đã xem của alert với trạng thái đã đọc thông báo.
- [ ] Hiển thị lịch sử Rule Alert và tổng quan cho SME Admin.
- [ ] Nối dữ liệu REST API vào frontend khi có contract được duyệt.

Nghiệm thu: giao dịch khớp nhiều rule chỉ tạo một alert chứa tất cả lý do; giao dịch không khớp không tạo alert; API key sai bị từ chối trước khi ghi nhận giao dịch.

Phụ thuộc backend: thực thi rule đang hoạt động, chuẩn hóa dữ liệu, chống trùng và API truy vấn alert. API key interceptor hiện đã có nhưng không đồng nghĩa cả WF-03 đã hoàn thành.

Điểm sửa chính: `rule-set.ts`, `AlertsView.tsx`, `AlertCaseDrawer.tsx`, `types/fraudguard.ts`.

## 7. Bước 5 — WF-02 AI phát hiện điện bất thường

- [ ] Kiểm tra doanh nghiệp đang vận hành và Subscription còn hiệu lực.
- [ ] Đưa dữ liệu hợp lệ đã chuẩn hóa sang AI cùng dữ liệu/đặc trưng cần thiết theo contract.
- [ ] Nhận Normal/Anomaly và phiên bản model/service để truy vết.
- [ ] Chỉ tạo AI Alert cho Anomaly; hiển thị thời điểm và dữ liệu liên quan.
- [ ] Operator xem alert; SME Admin xem dashboard dữ liệu và cảnh báo điện năng.
- [ ] Chuẩn bị dữ liệu mô phỏng và kịch bản tiêu thụ cao sau giờ đóng cửa.
- [ ] Kết nối AI Alert tạo ra với đầu vào WF-04.
- [ ] Thay hành vi Subscription luôn chạy `RULE_FALLBACK` bằng xử lý AI trước; fallback khi AI không khả dụng theo contract.
- [ ] Ghi nguồn phát hiện rõ ràng; kết quả fallback không được gắn nhãn AI Alert hoặc mở điều tra như AI Alert.

Nghiệm thu: cùng luồng nhập có thể tạo kết quả Normal và AI Alert; lỗi từng dòng không chặn dòng hợp lệ; AI không khả dụng được thể hiện rõ bằng nguồn fallback.

Phụ thuộc AI/backend: dịch vụ AI thực tế, contract dữ liệu/đặc trưng, xử lý lỗi/timeout và đánh giá chất lượng model. Stub trả điểm cố định chưa đáp ứng yêu cầu này.

## 8. Bước 6 — WF-04 Tạo và quản lý case

### 6.1 Model case

- [ ] Tạo thực thể case độc lập thay vì lưu toàn bộ hồ sơ trên từng transaction.
  - [x] Phase 1 WF-04 (domain thuần): định nghĩa `InvestigationCase` độc lập trong `src/types/investigation-case.ts` và các hàm xử lý thuần trong `src/utils/investigation-case.ts`.
  - [x] Phase 2A WF-04 (UI/storage): lưu `InvestigationCase[]` độc lập trong `useInvestigationCases`, state `FraudGuardDashboard.tsx` và `localStorage` (`fraudguard-demo-workspace-v4`) thay cho các field gắn trên `TransactionRisk`.
- [ ] Case có tenant, danh sách AI Alert liên kết, trạng thái, người tạo, người phụ trách và thời gian liên quan.
  - [x] Phase 1 WF-04 (domain thuần): model `InvestigationCase` lưu `enterpriseId`, `alertIds`/`alerts`, `status`, `createdBy`/`assignee`/`assignedBy`, `createdAt`/`updatedAt`/`assignedAt`/`closedAt` và `creationEligibility` từ WF-01.
  - [x] Phase 2A WF-04 (UI/storage): đồng bộ state `InvestigationCase[]`, migration dữ liệu cũ (`legacyCaseArchive`) và hiển thị đầy đủ trên `AlertsView.tsx` / `CasesView.tsx`.
- [ ] Cho phép Operator gom nhiều AI Alert liên quan cùng doanh nghiệp vào một case; vẫn hỗ trợ case một alert và chặn một alert liên kết nhiều case.
  - [x] Phase 1 WF-04 (domain thuần): `createInvestigationCase` hỗ trợ 1 hoặc nhiều AI Alert cùng doanh nghiệp, bắt buộc truyền `existingCases` tường minh (không mặc định `[]`) và kiểm tra liên kết trên `existingCases` (gồm `Closed`) cùng `caseId`/`caseStatus` legacy.
  - [x] Phase 2A WF-04 (UI): multi-select trên `AlertsView.tsx` và nối thao tác tạo case `Open` qua `executeCreateCaseAction` / `useInvestigationCases`.
- [ ] Chỉ chọn alert đủ điều kiện, chưa liên kết case khác; kiểm tra lại khi xác nhận tạo case.
  - [x] Phase 1 WF-04 (domain thuần): kiểm tra nguyên tử toàn bộ danh sách alert (chỉ `AI` + `Abnormal`, ánh xạ project-enterprise duy nhất, chưa liên kết) trước khi tạo case.
  - [x] Phase 2A WF-04 (UI): lọc và khóa checkbox trên `AlertsView.tsx` (`isAlertBlockedByCasesOrLegacy`) và kiểm tra lại toàn bộ lựa chọn trên state mới nhất trong modal xác nhận tạo case.
- [ ] Ngăn liên kết trùng khi có thao tác đồng thời ở backend sau tích hợp.

### 6.2 Alert Queue và Case Queue

- [ ] Alert Queue hỗ trợ chọn một hoặc nhiều AI Alert đủ điều kiện và chủ động tạo một case chung ở trạng thái Open; không tự tạo case khi AI Alert phát sinh.
  - [x] Phase 2A WF-04 (UI/state): đã triển khai chọn một hoặc nhiều AI Alert đủ điều kiện trên `AlertsView.tsx` và chủ động tạo một case `Open` qua modal xác nhận.
- [ ] Rule Alert tiếp tục phục vụ theo dõi, không vào luồng investigation.
  - [x] Phase 2A WF-04 (UI/state): khóa chọn Rule Alert trên `AlertsView.tsx` kèm lý do rõ ràng và khóa thao tác tạo case trên `AlertCaseDrawer.tsx`.
- [ ] Alert đã liên kết vẫn tra cứu được và hiển thị case tương ứng.
  - [x] Phase 2A WF-04 (UI): `AlertsView.tsx` giữ hiển thị cảnh báo đã liên kết kèm huy hiệu mã case, trạng thái WF-04 và nút mở hồ sơ tương ứng.
- [ ] Case Queue hiển thị một dòng/card cho mỗi case, không đếm theo số transaction.
  - [x] Phase 2A WF-04 (UI/metrics): `CasesView.tsx` hiển thị đúng 1 dòng cho mỗi `InvestigationCase` và `countActiveInvestigationCases` đếm theo số case duy nhất.
- [ ] Case detail hiển thị đầy đủ các AI Alert liên kết, dữ liệu đối chiếu, bằng chứng, báo cáo và lịch sử xử lý; phân biệt alert thành viên với dữ liệu chỉ dùng tham khảo.
  - [x] Phase 2A WF-04 (UI chi tiết tối thiểu): modal chi tiết case trong `CasesView.tsx` hiển thị danh sách AI Alert thành viên (kèm nút mở giao dịch gốc), thông tin phụ trách, trạng thái, bản xem trước báo cáo/kết luận chỉ đọc và dòng thời gian `history`.
  - [x] Phase 2B WF-04 (UI): `CaseReportWorkflowPanel.tsx` và `CasesView.tsx` hiển thị đầy đủ dữ liệu cảnh báo thực có, bằng chứng/kết quả từng alert, các phiên bản báo cáo và lịch sử xử lý đầy đủ.
- [ ] Investigator chỉ thấy case được giao; Operator theo dõi trong doanh nghiệp; SME Admin xem theo quyền.
  - [x] Phase 1 WF-04 (domain thuần): `evaluateInvestigationCaseReadAccess`, `readInternalInvestigationCase` và `readConfirmedInvestigationReport` thực thi đúng quyền theo role, tenant và `assignee.actorId` (PA và Implementation Staff không có quyền mặc định).
  - [x] Phase 2A WF-04 (UI & callers): áp dụng read guards vào `CasesView.tsx`, `ReportsView.tsx`, `AlertCaseDrawer.tsx`, `FraudGuardDashboard.tsx`, `auditForUser`, `buildCaseNotifications` và xuất CSV.
- [ ] Kiểm tra đang vận hành và Subscription còn hiệu lực tại thời điểm mở case.
  - [x] Phase 1 WF-04 (domain thuần): `checkInvestigationCaseCreationEligibility` và `createInvestigationCase` tái sử dụng helper WF-01 (`checkEnterpriseOperationalEligibility` với `requireSubscription: true`).
  - [x] Phase 2A WF-04 (UI): nối guard tạo case lên `AlertsView.tsx`, `useInvestigationCases.ts` và `FraudGuardDashboard.tsx` (kèm bộ demo `wf04-demo.ts` đạt chuẩn WF-01).
- [ ] Khi Subscription hết hạn, chặn tạo case mới; vẫn cho người có quyền tiếp tục xử lý và xem lại case đã mở khi gói còn hiệu lực. Không dùng guard Subscription của thao tác tạo case để khóa toàn bộ các thao tác trên case cũ.
  - [x] Phase 1 WF-04 (domain thuần): hết hạn chỉ chặn `createInvestigationCase`; các command tiếp theo và hàm đọc trên case đã mở hợp lệ không gọi lại guard tạo case.
  - [x] Phase 2A WF-04 (UI/storage): khi hết hạn gói (`ent-wf04-expired`), `AlertsView.tsx` chặn chọn/tạo case mới nhưng `CasesView.tsx` và `useInvestigationCases.ts` vẫn cho phép xem, phân công Investigator và tự đảm nhận điều tra trên case đã mở trước hạn (`CASE-WF04-EXP-01`).
  - [x] Phase 2B WF-04 (UI): cho phép gửi báo cáo, yêu cầu bổ sung, xác nhận và đóng trọn vòng đời case mở trước hạn (`CASE-WF04-EXP-01`) trên giao diện.

Nghiệm thu: chọn nhiều AI Alert liên quan cùng doanh nghiệp → tạo một case Open → Queue đếm một case → detail hiển thị đủ các alert đã chọn. Case một alert vẫn hợp lệ. Chặn dùng lại alert đã liên kết, chọn trùng alert, Rule Alert và sai tenant; cảnh báo chưa đưa vào điều tra chưa có case.

## 9. Bước 7 — WF-04 Điều tra, báo cáo và kết luận

- [ ] Operator phân công Investigator lần đầu, chuyển Open sang Investigating đúng WF-04.
  - [x] Phase 1 WF-04 (domain thuần): `assignInvestigatorToCase` tra cứu theo `user.id` (không dùng tên), chuyển `Open → Investigating` (`INVESTIGATOR_ASSIGNED`).
  - [x] Phase 2A WF-04 (UI/state): chọn người nhận theo `user.id` trên `CasesView.tsx` và nối `executeAssignInvestigatorAction` chuyển ngay `Open → Investigating`.
- [ ] Không giữ bước bắt buộc tiếp nhận Assigned nếu chưa có thay đổi yêu cầu được xác nhận.
  - [x] Phase 1 WF-04 (domain thuần): bỏ bước trung gian `Assigned` trong `InvestigationCaseStatus`.
  - [x] Phase 2A WF-04 (UI/migration): bỏ tab/trạng thái `Assigned` trên `CasesView.tsx`, khóa stepper cũ trên `AlertCaseDrawer.tsx` và ánh xạ `Assigned → Investigating` có kiểm chứng trong `case-migration.ts`.
- [ ] Investigator xem dữ liệu điện năng quanh thời điểm bất thường và ghi nhận phát hiện/bằng chứng.
  - [x] Phase 2B WF-04 (UI với dữ liệu thực có): `CaseReportWorkflowPanel.tsx` hiển thị thông tin giao dịch/cảnh báo thực có và cho ghi nhận kết quả + bằng chứng văn bản từng alert (không bịa chuỗi phụ tải giả).
  - [ ] Sau tích hợp BE/AI: bổ sung chuỗi dữ liệu điện năng chi tiết quanh thời điểm bất thường và đính kèm chứng từ thực tế nếu được chốt.
- [ ] Mỗi case có một báo cáo chung, ghi kết quả/kết luận đề xuất và bằng chứng riêng cho từng AI Alert, cùng phần tổng kết chung; hỗ trợ mô tả, bảng/biểu đồ phù hợp với dữ liệu thực có. Các alert trong cùng case được phép có kết quả khác nhau.
  - [x] Phase 1 WF-04 (domain thuần): `submitInvestigationReport` yêu cầu `summary` chung và 1:1 `alertResults` (`resultText`, `evidence`) cho mọi alert trong case, cho phép kết quả khác nhau.
  - [x] Phase 2B WF-04 (UI): biểu mẫu nhập/hiển thị báo cáo từng alert trên `CaseReportWorkflowPanel.tsx` và `ReportsView.tsx`, giữ nguyên kết quả khác nhau giữa các alert.
- [ ] Gửi báo cáo tạo một phiên bản được lưu giữ; chuyển sang Pending Review.
  - [x] Phase 1 WF-04 (domain thuần): `submitInvestigationReport` tạo `InvestigationCaseReportVersion` bất biến (`version` tăng dần) và chuyển `Investigating → Pending Review`.
  - [x] Phase 2B WF-04 (UI/storage): nối nút gửi báo cáo trên `CaseReportWorkflowPanel.tsx` (`submitReport`) và lưu danh sách phiên bản báo cáo vào `fraudguard-demo-workspace-v4`.
- [ ] Operator chỉ xác nhận kết luận/đóng case sau khi đã có báo cáo chờ duyệt.
  - [x] Phase 1 WF-04 (domain thuần): `confirmInvestigationCaseReport` chỉ chấp nhận `Pending Review` với phiên bản đang chờ duyệt mới nhất và bắt buộc truyền đúng `reportId` + `reportVersion` của bản đang hiển thị (chặn `Open`/`Investigating`, thiếu định danh và phiên bản cũ).
  - [x] Phase 2A WF-04 (UI khóa đường cũ): khóa hoàn toàn đường đóng trực tiếp không qua báo cáo trong `AlertCaseDrawer.tsx` (`wf04Managed`) và chặn ghi trường case legacy trong `handleUpdateTransaction` (`hasLegacyCaseFieldPatch`).
  - [x] Phase 2B WF-04 (UI): nối thao tác Operator xem lại và xác nhận đóng case từ `Pending Review` trên `CaseReportWorkflowPanel.tsx`, truyền đúng `reportId` + `reportVersion` đang hiển thị.
- [ ] Xác nhận kết luận chuyển sang Closed; kết luận lưu riêng khỏi trạng thái.
  - [x] Phase 1 WF-04 (domain thuần): `confirmInvestigationCaseReport` chuyển `Pending Review → Closed` và lưu `InvestigationCaseConclusion` tách biệt khỏi `status`.
  - [x] Phase 2A WF-04 (UI chỉ đọc): hiển thị trạng thái `Closed` và bản xem trước kết luận tách riêng ở chế độ chỉ đọc trên `CasesView.tsx` / `ReportsView.tsx`.
  - [x] Phase 2B WF-04 (UI): nối thao tác xác nhận kết luận chuyển sang `Closed` kèm khung kết luận chỉ đọc trên `CaseReportWorkflowPanel.tsx` và `ReportsView.tsx`.
- [ ] Yêu cầu bổ sung bắt buộc có lý do, chuyển Pending Review về Investigating.
  - [x] Phase 1 WF-04 (domain thuần): `requestInvestigationCaseRevision` bắt buộc `reason` không rỗng và chuyển `Pending Review → Investigating`.
  - [x] Phase 2B WF-04 (UI): nối form nhập lý do bắt buộc và `expectedReportId` / `expectedReportVersion` trên `CaseReportWorkflowPanel.tsx` (`requestRevision`).
- [ ] Giữ nguyên báo cáo đã gửi trong lịch sử; lần gửi lại tạo phiên bản mới.
  - [x] Phase 1 WF-04 (domain thuần): `reports` bảo toàn mọi phiên bản cũ bất biến; mỗi lần gửi lại tạo bản mới (`version = reports.length + 1`).
  - [x] Phase 2B WF-04 (UI): hiển thị đối chiếu lịch sử các phiên bản báo cáo chỉ đọc và tiền điền nháp từ bản gần nhất để gửi phiên bản mới (`v2`, `v3`...) trên `CaseReportWorkflowPanel.tsx` và `ReportsView.tsx`.
- [ ] SME Admin xem được báo cáo, kết luận đã xác nhận và lịch sử của doanh nghiệp mình.
  - [x] Phase 1 WF-04 (domain thuần): `readConfirmedInvestigationReport` cho phép `SME Admin` cùng tenant xem báo cáo và kết luận đã xác nhận sau `Closed` (chặn hồ sơ nội bộ và chặn trước khi đóng).
  - [x] Phase 2A WF-04 (UI chỉ đọc): nối `readConfirmedInvestigationReport` vào `CasesView.tsx` và `ReportsView.tsx` để `SME Admin` chỉ xem báo cáo/kết luận của hồ sơ `Closed` thuộc doanh nghiệp mình.
  - [x] Phase 2B WF-04 (UI): nghiệm thu xuyên suốt màn hình `CasesView.tsx`, `ReportsView.tsx`, CSV export, `AuditTrailView.tsx` (`SME_HIDDEN_INTERNAL_WORKFLOW_ACTIONS`) và `NotificationCenter.tsx` cho `SME Admin` chỉ đọc bản đã xác nhận.
- [ ] Hỗ trợ Operator tự đảm nhận điều tra, chuyển Open sang Investigating, tự viết/gửi báo cáo sang Pending Review rồi tự xác nhận kết luận và đóng case. Lưu người thực hiện/thời điểm cho từng thao tác dù cùng một Operator; không đóng trực tiếp case chưa có báo cáo.
  - [x] Phase 1 WF-04 (domain thuần): hỗ trợ qua chuỗi `selfAssignInvestigationCase` → `submitInvestigationReport` → `confirmInvestigationCaseReport`, ghi tách biệt từng sự kiện (`OPERATOR_SELF_ASSIGNED`, `REPORT_SUBMITTED`, `REPORT_CONFIRMED_AND_CLOSED`) và chặn đóng trước khi gửi báo cáo.
  - [x] Phase 2A WF-04 (UI/storage): nối nút `Operator` tự đảm nhận điều tra (`Open → Investigating` qua `executeSelfAssignCaseAction`) trên `CasesView.tsx` và lưu bền vững vào `fraudguard-demo-workspace-v4`.
  - [x] Phase 2B WF-04 (UI): nối biểu mẫu `Operator` tự gửi báo cáo (`Investigating → Pending Review`) và bước tự xác nhận đóng case tách biệt (`Pending Review → Closed`, không gộp nút "gửi và đóng") trên `CaseReportWorkflowPanel.tsx`.
- [ ] Lưu báo cáo/kết luận trong hồ sơ doanh nghiệp sau thao tác gửi/xác nhận; không tự động gửi dữ liệu này cho Platform Admin khi đóng case.
  - [x] Phase 1 WF-04 (domain thuần): `confirmInvestigationCaseReport` chỉ trả case/event nội bộ, không tự tạo/gửi feedback, và chặn `Platform Admin` qua read guards.
  - [x] Phase 2A WF-04 (UI/storage & callers): tách `PlatformHealthView.tsx`, `platformSummary` (`wf04Managed: true` trả `0` feedback), `auditForUser` và `buildCaseNotifications` khỏi hồ sơ điều tra nội bộ của doanh nghiệp; lưu bền vững `InvestigationCase[]` trong `fraudguard-demo-workspace-v4`.
  - [x] Phase 2B WF-04 (UI/storage): lưu các phiên bản báo cáo và kết luận xác nhận từ `CaseReportWorkflowPanel.tsx` vào workspace `v4` (`persistWorkspaceAndUsers`), giữ `0` feedback tự động cho `Platform Admin`.

### 7.1 SME Admin gửi feedback cho Platform Admin

- [x] SME Admin chọn báo cáo và kết luận đã xác nhận của doanh nghiệp mình, xem nội dung gửi kèm, bổ sung nhận xét và chủ động xác nhận gửi feedback.
- [x] Model feedback liên kết case, các AI Alert liên quan và đúng phiên bản báo cáo/kết luận được gửi; lưu người gửi, thời điểm và nội dung gửi để truy vết. Giữ kết quả riêng của từng alert theo báo cáo đã xác nhận, không gán tổng kết chung thành cùng một nhãn cho tất cả alert.
- [ ] Ánh xạ sang nhãn đánh giá AI theo quy ước được thống nhất với đội AI; chưa thuộc Phase 2C frontend.
- [x] Platform Admin tiếp nhận và xem feedback cùng thông tin doanh nghiệp chủ động gửi kèm; không mặc định truy cập toàn bộ case/bằng chứng chưa được gửi.
- [x] Tách thao tác/trạng thái feedback khỏi vòng đời case. Không gửi feedback thì case vẫn Closed, báo cáo vẫn được doanh nghiệp tra cứu.
- [x] Giới hạn frontend theo prompt Phase 2C: gửi toàn bộ một báo cáo đã xác nhận, mỗi phiên bản gửi một lần, nhận xét tùy chọn, bản gửi chỉ đọc. Chưa thêm duyệt feedback hay retraining; đây là lựa chọn triển khai cần review, không khẳng định là quy định nguyên văn của proposal.
- [x] Giai đoạn frontend dùng dữ liệu demo và thao tác thuần; UI xem trước giải thích dữ liệu lưu cục bộ, chưa truyền tới máy chủ hay thiết bị khác.
- [ ] Nối BE/AI khi có contract được duyệt.

Phase 2C được tiếp quản ngày 17/11/2026 sau khi Antigravity hết quota. Chi tiết phạm vi, sửa lỗi, kiểm thử và giới hạn ở `docs/wf04-phase2c-report.md`. Checklist dọn cuối WF-04 vẫn chưa thực hiện.

Nghiệm thu: chạy trọn vòng điều tra → gửi → yêu cầu bổ sung → gửi lại → xác nhận → Closed; giữ đủ các phiên bản báo cáo. Không được đóng Open/Investigating chỉ bằng cách nhập lý do.

Nghiệm thu nhánh tự điều tra: cùng một Operator có thể tự điều tra, gửi báo cáo, xác nhận và đóng case mình phụ trách; lịch sử thể hiện đủ từng bước. Case đã mở vẫn hoàn tất được sau khi Subscription hết hạn, trong khi tạo case mới bị chặn.

Nghiệm thu feedback: đóng case không tự tạo feedback; SME Admin chủ động gửi thì Platform Admin thấy đúng nội dung được gửi; không gửi thì case vẫn Closed. Kiểm tra tenant, role, liên kết phiên bản báo cáo và kết quả riêng từng alert khi các alert có kết luận khác nhau.

Điểm sửa chính cho bước 6–7: `types/fraudguard.ts`, `case-workflow.ts`, `CasesView.tsx`, `AlertsView.tsx`, `AlertCaseDrawer.tsx`, `ReportsView.tsx`, `FraudGuardDashboard.tsx`.

### Checklist dọn cuối WF-04 (bàn giao sau Phase 2C)

- [x] Codex sửa lớp hiển thị khi mở cảnh báo từ case: `AlertCaseDrawer` dùng `alertInspectionOverlay` (52) và `alertInspectionDrawer` (53), trên overlay case (50). Check 157/157 và build đạt; trình duyệt desktop/light/EN đã xác nhận drawer nằm trên case và nhận focus.
- [x] Kiểm tra hồi quy Escape/Tab, quay lại case và giữ nháp khi đóng drawer; kiểm tra responsive/theme (18/11/2026: đã xác minh `Tab`/`Shift+Tab`, `Escape`/nút đóng trả focus về `"Xem cảnh báo"`, giữ nguyên nháp `CaseReportWorkflowPanel` khi đóng drawer và responsive VI/EN Light/Dark ở `1440x900`/`768x1024`/`375x812` qua `tests/wf04-phase2c.test.cjs` và trình duyệt `http://localhost:3008`).
- [x] Sửa thông báo legacy/Phase 2A đang hiển thị sai cho case WF-04 mới trong `AlertCaseDrawer` (18/11/2026: thay bằng `linkedCaseDrawerNotice` cho case WF-04 hợp lệ, `unlinkedAiDrawerNotice` cho AI Alert chưa liên kết, giữ `legacyCannotEditNotice` không còn chuỗi `"Phase 2A"` cho bản ghi `legacyCaseArchive`).

- [x] Khi hoàn thiện toàn bộ WF-04, gỡ bỏ thanh ngữ cảnh demo WF-04 khỏi giao diện vận hành chính của Operator (18/11/2026: gỡ `demoContextBar`, nút demo khỏi `AlertsView.tsx`/`CasesView.tsx` và banner `showMigrationNotice`; tách công cụ mẫu sang chế độ hai lớp chỉ bật khi `NODE_ENV === "development"` hoặc `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS=true` kèm `?wf04Dev=1` hoặc `localStorage.fg_wf04_dev_tools === "1"` trong `wf04-demo.ts` + `FraudGuardDashboard.tsx`, gỡ `window.__fgWf04DevTools` & vô hiệu hóa callback cũ khi tắt/unmount, `0` auto-load, tài liệu hóa ở `docs/wf04-sample-data.md`).
- [x] Gỡ bỏ mục "Hồ sơ lưu trữ cũ" (`LegacyCaseArchiveSection`) khỏi giao diện vận hành chính của Operator sau khi hoàn tất đối soát (18/11/2026: gỡ `LegacyCaseArchiveSection` và thẻ KPI lưu trữ cũ khỏi `CasesView.tsx` và `ReportsView.tsx`, vẫn bảo toàn `legacyCaseArchive` trong storage và chế độ chỉ đọc khi xem bản ghi cũ).
- [x] Trước khi gỡ bỏ giao diện demo/legacy, thực hiện sao lưu và chuyển đổi dữ liệu có kiểm soát: bảo toàn toàn bộ case và báo cáo mới tạo cùng các case đã `Closed`; tuyệt đối không tự xóa `localStorage` để dọn UI (18/11/2026: không reset/xóa `localStorage`, giữ nguyên toàn bộ case đang mở và `Closed`, phiên bản báo cáo, kết luận, kết quả từng alert, `reportFeedbacks`, `legacyCaseArchive`, `preDemoSnapshot` và recovery journal).
- [ ] Dọn bỏ các trường/helper `CaseStatus` legacy còn lại (`case-workflow.ts`, đường fallback trên giao diện) khi không còn caller phụ thuộc (còn giữ có chủ đích: `src/utils/case-workflow.ts` qua `tests/rule-sandbox.test.cjs` và nhánh fallback `!isWf04Locked` trong `AlertCaseDrawer.tsx`, cùng các caller schema/migration/archive/scope/fallback tại `types/fraudguard.ts`, `fraudguard-transactions.ts`, `case-migration.ts`, `workspace-storage.ts`, `investigation-case.ts`, `enterprise.ts`, `export-csv.ts`, `notification-feed.ts`, `permissions.ts` và các view tương thích ngược; xem `docs/wf04-final-cleanup-report.md`).

## 10. Bước 8 — Kiểm thử và minh chứng

- [ ] Viết test chuyển trạng thái theo tài liệu, không chỉ kiểm tra hành vi demo hiện có.
- [ ] Kiểm tra quyền của 5 actor và tenant isolation cho mọi thao tác ghi.
- [ ] Kiểm tra WF-01: sửa trước kích hoạt, kiểm thử lại, duyệt lại và bắt đầu Subscription.
- [ ] Kiểm tra WF-02: AI Normal/Anomaly, CSV hỗn hợp lỗi, AI không khả dụng.
- [ ] Kiểm tra WF-03: nhiều rule khớp, không khớp, key sai và đánh dấu đã xem.
- [ ] Kiểm tra WF-04: gom nhiều AI Alert/một case, case một alert, chặn alert trùng/đã liên kết/sai tenant/nguồn Rule, phân công, trả báo cáo, lịch sử phiên bản, đóng case và SME Admin xem kết quả. Kiểm tra Case Queue đếm theo case thay vì số alert.
  - [x] Phase 1 WF-04 (unit test domain): kiểm thử hành vi trên Node VM qua `tests/investigation-case.test.cjs` (tests #1–#6, #8–#10, #12–#17 — bao gồm regression bắt buộc `existingCases`, gắn chặt `reportId` + `reportVersion`, và timeline UTC ms đơn điệu).
  - [x] Phase 2A WF-04 (integration test, regression sau review & trình duyệt): kiểm thử tạo case 1 và nhiều alert, chặn alert trùng/đã liên kết/legacy/Rule/khác tenant, phân công theo `user.id`, Case Queue đếm 1 dòng/case, khóa đường ghi legacy, phân quyền đọc, validation sâu khi restore, truyền nguyên timestamp + sort mili-giây, điều phối lưu hai khóa + rollback/recovery và phân biệt commit marker / cleanup journal qua `tests/wf04-phase2a.test.cjs` (`9/9`), `tests/wf04-phase2a-fixes.test.cjs` (`9/9`), `tests/wf04-phase2a-recovery.test.cjs` (`7/7`) và thao tác trình duyệt thực tế.
  - [x] Phase 2B WF-04 (UI & Loading UI): kiểm thử soạn/trả báo cáo từng alert, lịch sử phiên bản, yêu cầu bổ sung kèm lý do, xác nhận đóng case đúng phiên bản, cô lập nháp/quyền, `ReportsView` đếm 1 case/nhiều phiên bản, `AuditTrailView`, retry storage `StorageLike` và giao diện `loading.tsx` nền trắng qua `tests/wf04-phase2b.test.cjs` (`11/11`) cùng kiểm thử trực tiếp trên trình duyệt.
- [ ] Kiểm tra cùng Operator tự điều tra, gửi báo cáo, tự xác nhận và đóng case mình phụ trách; vẫn chặn đóng khi chưa có báo cáo và lưu đầy đủ lịch sử.
  - [x] Phase 1 WF-04 (unit test domain): đã kiểm thử trong `tests/investigation-case.test.cjs` (tests #7, #8, #14, cùng ràng buộc xác nhận phiên bản báo cáo & thứ tự thời gian ở tests #16–#17).
  - [x] Phase 2A WF-04 (UI/storage): đã kiểm thử `Operator` tự đảm nhận điều tra (`Open → Investigating`), giữ qua reload và khi đổi tên hiển thị trong `tests/wf04-phase2a.test.cjs` (Scenario 4) và trên trình duyệt.
  - [x] Phase 2B WF-04 (UI/storage): đã kiểm thử `Operator` tự gửi báo cáo và tự xác nhận đóng case qua 2 thao tác tách biệt trong `tests/wf04-phase2b.test.cjs` (`Section 8.5`) và trên trình duyệt (`CASE-WF04-0003`).
- [ ] Kiểm tra Subscription hết hạn: chặn case mới, vẫn cho điều tra/gửi/bổ sung báo cáo/xác nhận/đóng/xem case đã mở khi gói còn hiệu lực, đúng role và tenant.
  - [x] Phase 1 WF-04 (unit test domain): đã kiểm thử biên hiệu lực WF-01 và tiếp tục case cũ sau `expiresAt` trong `tests/investigation-case.test.cjs` (tests #4, #11, kèm kiểm tra thứ tự thời gian hậu-tạo case ở test #17).
  - [x] Phase 2A WF-04 (UI/storage): đã kiểm thử chặn tạo case mới khi hết hạn gói (`ent-wf04-expired`) nhưng vẫn cho xem, giao việc và tự đảm nhận case mở trước hạn (`CASE-WF04-EXP-01`) trong `tests/wf04-phase2a.test.cjs` (Scenario 5) và trên trình duyệt.
  - [x] Phase 2B WF-04 (UI/storage): đã kiểm thử gửi/bổ sung/xác nhận đóng trọn vẹn case mở trước hạn (`CASE-WF04-EXP-01`) khi gói đã hết hạn trong `tests/wf04-phase2b.test.cjs` (`Section 8.7`).
- [ ] Kiểm tra báo cáo chung có kết quả/bằng chứng riêng từng alert và tổng kết case; feedback giữ đúng các kết quả khác nhau, không tự chuyển tổng kết thành nhãn chung cho mọi alert.
  - [x] Phase 1 WF-04 (unit test domain): đã kiểm thử bảo toàn kết quả/bằng chứng khác nhau giữa các alert qua gửi, xác nhận và đóng trong `tests/investigation-case.test.cjs` (test #10).
  - [x] Phase 2B WF-04 (UI): đã kiểm thử báo cáo và kết luận đóng giữ đúng kết quả khác nhau giữa các alert trên `CaseReportWorkflowPanel.tsx` và `ReportsView.tsx` trong `tests/wf04-phase2b.test.cjs` (`Section 8.1`, `Section 8.4`) và trên trình duyệt.
  - [x] Phase 2C & Dọn cuối UI WF-04 (frontend demo): đã kiểm thử luồng `SME Admin` gửi feedback giữ đúng kết quả và bằng chứng riêng từng alert qua preview, snapshot và màn hình `Platform Admin` (`tests/wf04-phase2c.test.cjs` test #3 và trình duyệt `CASE-WF04-0005`, `CASE-SAMPLE-CLOSED`).
  - [ ] Sau contract BE/AI: kiểm thử ánh xạ kết quả từng alert sang nhãn đánh giá AI theo quy ước chính thức với đội AI.
- [ ] Kiểm tra SME Admin chủ động gửi feedback, Platform Admin tiếp nhận đúng nội dung, không gửi tự động khi đóng case và không truy cập chéo tenant.
  - [x] Phase 2B WF-04 (chặn tự gửi khi đóng case): đã xác nhận đóng case không tạo feedback lên Platform Admin trong `tests/wf04-phase2b.test.cjs` (`Section 8.9`), `platformSummary` và kiểm thử trình duyệt.
  - [x] Phase 2C & Dọn cuối UI WF-04 (frontend demo): đã kiểm thử thao tác `SME Admin` chủ động xem trước/hủy/gửi feedback, `Platform Admin` tiếp nhận đọc 1:1 qua reload, cô lập tenant và chặn role ngoài quyền (`tests/wf04-phase2c.test.cjs` và trình duyệt `http://localhost:3007`, `http://localhost:3008`).
  - [ ] Tích hợp BE/AI: kiểm thử truyền/lưu feedback thật giữa các phiên tài khoản khác nhau khi có API contract.
- [ ] Rà giao diện tiếng Việt/Anh, loading, empty, error và trạng thái bị chặn thao tác.
  - [x] Phase 2B WF-04 (`loading.tsx` & màn hình WF-04): đã kiểm tra EN/VI, `loading.tsx` nền trắng (`1440x900`, `768x1024`, `375x812`) và các trạng thái empty/error/chặn thao tác WF-04.
  - [x] Phase 2C & Dọn cuối UI WF-04 (18/11/2026): đã kiểm tra VI/EN, Light/Dark và responsive (`1440x900`, `768x1024`, `375x812`) cho luồng Case modal + `AlertCaseDrawer` (Escape/Tab/giữ nháp/scroll) và chi tiết feedback `PlatformHealthView`, cùng trạng thái rỗng/chặn thao tác sau khi gỡ UI tạm.
  - [x] Bảng Lịch sử xử lý 3 cột & Modal chi tiết hồ sơ (18/11/2026): đã kiểm tra VI/EN, Light/Dark, bàn phím (`Tab`/`Enter`/`Escape`), `AlertCaseDrawer` giữ nháp trên modal mở rộng `.caseDetailModal` (`min(1060px, calc(100vw - 48px))`) và responsive (`1440x900`, `768x1024`, `375x812` với `0` tràn ngang).
  - [x] Final WF-04 UI cleanup & source-accurate alert pages (19/11/2026): removed internal/phase jargon (`phase2bScopeHint`, `"payload"`, `"snapshot"`, `"ISO-8601"`), added distinct monitoring-only subtitles/empty states/drawer messages for `AI fallback` and `Rule` alerts while hiding case-selection controls/tabs there, tightened feedback and Platform Health disclosures (content scope, explicit SME Admin confirmation, local-only storage without server/AI retraining), verified cleanly on VI/EN, Light/Dark, Desktop `1440x900` and Mobile `375x812` with Subscription/Free Operator plans (`163/163` checks passing; `npm run build` deferred while `next dev` runs on port `3000`).
  - [x] Case Detail modal section spacing & real `RULE` / `RULE_FALLBACK` drawer verification (19/11/2026): added `.caseDetailBody` (`16px` desktop gap, `12px` mobile gap at `max-width: 680px`, `.caseDetailModal .caseDetailBody > * { margin-bottom: 0 }` without modifying shared `.builderBody`) across internal and SME Admin modals, hid non-AI case headings and aligned backup Rule Engine monitoring notices in `AlertCaseDrawer.tsx`, added minimal dev-only `RULE_FALLBACK` fixture `tx-wf04-campus-fallback` (`ALT-WF04-CAMPUS-FALLBACK-06`) in `src/data/wf04-demo.ts`, verified `165/165` checks and live browser checks at `http://localhost:3000/fraud-monitoring` (`16px`/`12px` spacing across internal & SME Admin modals, draft preservation on `Escape`, real `ALT-WF04-CAMPUS-FALLBACK-06` and `ALT-WF04-CAMPUS-RULE-05` list/drawer views across VI/EN, Light/Dark, Desktop `1440x900`, Mobile `375x812`; `npm run build` deferred while `next dev` runs on port `3000`).
  - [ ] Tổng thể frontend (WF-01 đến WF-03 & tích hợp BE/AI): rà đầy đủ lại toàn bộ các luồng WF-01 đến WF-03, các tổ hợp màn hình ngoài WF-04 và tích hợp dịch vụ sau khi có contract BE/AI.
- [ ] Chạy `npm run check` và `npm run build` sau mỗi đợt thay đổi phù hợp.
- [ ] Kiểm thử thủ công toàn bộ bốn workflow và nhánh ngoại lệ trên trình duyệt.
- [ ] Bổ sung sơ đồ, test case và liên kết minh chứng cho từng workflow.

Nghiệm thu cuối giai đoạn frontend: cả 4 workflow và nhánh ngoại lệ chạy đúng tài liệu bằng dữ liệu demo; các điểm chờ BE/AI được ghi rõ và không bị coi là lỗi chưa hoàn thành của bộ khung. Chưa nghiệm thu tích hợp dịch vụ thật trong giai đoạn này.

## 11. Mốc kiểm tra ban đầu

- Ngày 11/11/2026: lint, TypeScript, 83 test hiện có và production build đều đạt.
- Các kiểm tra trên xác nhận nền tảng code hiện tại; chưa chứng minh đáp ứng đầy đủ WF-01 đến WF-04.
- Phase 1 WF-01 (model `EnterpriseLifecycle`, pure state transition trong `src/utils/enterprise-lifecycle.ts`, test kịch bản WF-01 trong `tests/enterprise-lifecycle.test.cjs` và báo cáo `docs/wf01-phase1-report.md`) đã được triển khai tách biệt lớp domain; UI/storage/hooks nối với dashboard vẫn thuộc Phase 2 nên các checkbox Bước 2 và Bước 1 còn lại giữ nguyên chưa đánh dấu.
- Đợt sửa lỗi sau review Phase 1 WF-01: đã khắc phục 2 lỗi P1 (kiểm chứng đồng nhất `ruleSet`/`ruleSets` khi kích hoạt, bắt buộc `release.schema` và `release.test` của phiên bản phát hành khớp chính xác snapshot đã duyệt và bổ sung helper `applyEnterpriseActivationCommand` cho đường command-only), bổ sung regression test nâng tổng số unit test lên 94/94 đạt cùng production build; vẫn dừng ở ranh giới trước Phase 2.
- Ngày 15/11/2026 — Phase 1 WF-04 (lớp domain thuần & unit test): đã triển khai model case độc lập (`src/types/investigation-case.ts`), các pure commands và read guards (`src/utils/investigation-case.ts`), 14 unit test hành vi bao phủ đủ 14 nhóm bắt buộc (`tests/investigation-case.test.cjs`), báo cáo bàn giao và phương án chuyển dữ liệu cũ (`docs/wf04-phase1-report.md`); `npm run check` đạt exit `0` (`eslint src --max-warnings=0` 0 cảnh báo, `tsc --noEmit` 0 lỗi, `node --test tests/*.test.cjs` 108/108 test đạt = 94 test cũ + 14 test WF-04, 0 thất bại, 0 bỏ qua) và `npm run build` đạt exit `0` (Next.js `15.5.25`, 6/6 static pages). UI (`AlertCaseDrawer.tsx`, `AlertsView.tsx`, `CasesView.tsx`, `ReportsView.tsx`, `FraudGuardDashboard.tsx`, `MembersView.tsx`, `PlatformHealthView.tsx`), `localStorage`, `case-workflow.ts`, `permissions.ts`, luồng SME Admin gửi feedback và `src/services/.gitkeep` vẫn giữ nguyên chưa nối cho Phase 2 / tích hợp BE-AI, nên các mục hỗn hợp chỉ tách phần domain đã xong và giữ nguyên `[ ]` toàn bộ phần UI, Queue, storage, feedback và tổng thể WF-04.
- Đợt sửa lỗi sau review Phase 1 WF-04: đã khắc phục 3 vấn đề sau review trên lớp domain WF-04 (1: bắt buộc `existingCases` tường minh ở `createInvestigationCase`, chặn thiếu/`undefined`/`null`/không phải mảng bằng `MISSING_EXISTING_CASES`/`INVALID_CASE`; 2: bắt buộc `reportId` và `reportVersion` gắn chặt với báo cáo `Pending Review` đang hiển thị ở `confirmInvestigationCaseReport`, chặn thiếu/rỗng/sai kiểu/sai bản/bản cũ bằng `MISSING_REPORT_ID`/`INVALID_REPORT_ID`/`MISSING_REPORT_VERSION`/`INVALID_REPORT_VERSION`/`STALE_REPORT_VERSION`/`REPORT_NOT_FOUND`/`REPORT_VERSION_MISMATCH`; 3: áp dụng guard timeline UTC mili-giây đơn điệu qua `parseIsoTimestampField` và `resolveMonotonicTransitionTimestamp` trên cả 5 command hậu-tạo case với mã `TIMESTAMP_OUT_OF_ORDER`/`INVALID_TIMESTAMP`/`INVALID_CASE`, tổng `InvestigationCaseErrorCode` gồm `57` mã); đã tái hiện 3 regression tests thất bại trước sửa (`node --test tests/investigation-case.test.cjs` exit `1`, `14` pass, `3` fail), sau đó hoàn tất `17/17` test WF-04 đạt (`exit 0`), `npm run check` đạt `exit 0` (`eslint src --max-warnings=0` `0` cảnh báo, `tsc --noEmit` `0` lỗi, `111/111` test đạt = `94` test cũ + `17` test WF-04, `0` fail, `0` skipped) và `npm run build` đạt `exit 0` (Next.js `15.5.25`, compiled in `3.0s`, `6/6` static pages) theo kết quả chạy của `@tester`; toàn bộ phần UI, chuyển dữ liệu cũ, Alert/Case Queue, `localStorage`, luồng SME Admin gửi feedback (mục `7.1`) và tổng thể WF-04 vẫn giữ nguyên `[ ]` chờ Phase 2.
- Ngày 15/11/2026 - Phase 2A WF-04 (nối state, lưu trữ workspace v4, chuyển dữ liệu cũ có kiểm soát, bộ dữ liệu demo WF-04, Alert Queue, Case Queue và khóa đường ghi legacy): đã triển khai `src/utils/case-migration.ts` (`13` bản ghi `caseId` seed mặc định -> `0` migrated, `13` archived trong `legacyCaseArchive`, không tự bịa provenance), `src/utils/workspace-storage.ts` (`fraudguard-demo-workspace-v4` kèm sao lưu `fraudguard-demo-workspace-v3-backup`, khóa ghi khi JSON hỏng/phiên bản lạ/lỗi backup, giữ state trong bộ nhớ kèm `retryPersist` khi lỗi quota, đồng bộ các writer onboarding qua `mergeAndPersistWorkspaceSlice`), `src/data/wf04-demo.ts` (`3` doanh nghiệp tạo qua chuỗi hàm thật WF-01 gồm `ent-wf04-campus`, `ent-wf04-branch`, `ent-wf04-expired` có sẵn `CASE-WF04-EXP-01`, bật/khôi phục không phá dữ liệu), `src/hooks/useInvestigationCases.ts`, cập nhật `AlertsView.tsx` (đa chọn cảnh báo hợp lệ, tạo case `Open`), `CasesView.tsx` (`1` dòng/case, `4` trạng thái WF-04, giao `Investigator` theo `user.id` hoặc `Operator` tự đảm nhận `Open -> Investigating`, sửa lưới `.caseMetricsGrid` và khóa dịch tìm kiếm/KPI), khóa ghi legacy trên `AlertCaseDrawer.tsx` và `handleUpdateTransaction`, đồng bộ `permissions.ts` (`canSaveMember`), `enterprise.ts` (`auditForUser`, `transactionsForEnterprise`), `notification-feed.ts`, `platform-summary.ts`, `export-csv.ts`, `ReportsView.tsx`, `AuditTrailView.tsx`, `PlatformHealthView.tsx`, bổ sung `9` kịch bản tích hợp trong `tests/wf04-phase2a.test.cjs` và báo cáo `docs/wf04-phase2a-report.md`. Kiểm tra tuần tự đạt `npm run check` exit `0` (`eslint` `0` cảnh báo, `tsc --noEmit` `0` lỗi, `120/120` test đạt = `111` test trước + `9` test Phase 2A) và `npm run build` exit `0` (Next.js `15.5.25`, `6/6` static pages), cùng kiểm thử trực tiếp trên trình duyệt tại `/fraud-monitoring` (`0` lỗi console/page, đạt Light/Dark và `3` kích thước `1440x900`, `768x1024`, `375x812`). Dừng tại ranh giới Phase 2A để review; các mục Phase 2B (soạn/gửi/bổ sung/xác nhận báo cáo trên UI), mục `7.1` (`SME Admin` gửi feedback) và tổng thể WF-04 vẫn giữ nguyên `[ ]`.
- Ngày 16/11/2026 - Đợt sửa lỗi sau review Phase 2A WF-04: đã khắc phục 3 vấn đề sau review (`docs/antigravity-wf04-phase2a-fixes.md`): (1) bổ sung validator sâu khi restore trong `src/utils/workspace-storage.ts` (`isValidInvestigationCaseShape`, `isValidLegacyArchiveShape`, `isValidPreDemoSnapshotShape`, `validateWorkspacePayloadV4`) và `src/data/wf04-demo.ts` chặn mảng lồng hỏng như `alerts: [null]`, `reports: [null]`, `preDemoSnapshot: {}`, lỗi `legacyCaseArchive` và user không hợp lệ (`blocked_corrupt`, `canPersist: false`) mà không im lặng lọc bỏ hay tự bịa dữ liệu; (2) gỡ bỏ hoàn toàn `resolveMonotonicTimestampForCase` trong `src/hooks/useInvestigationCases.ts` để không tự cộng `+1ms` hay fallback `Date.now()`, trả nguyên `TIMESTAMP_OUT_OF_ORDER`/`INVALID_TIMESTAMP` về `mapCaseActionOutcome` (`FraudGuardDashboard.tsx`) và giữ sort cảnh báo theo mili-giây đầy đủ (`.005Z` trước `.001Z`) trên `AlertsView.tsx`; (3) chuẩn hóa bộ điều phối hai khóa `persistWorkspaceAndUsers` + `recoverWorkspaceStorage` dùng `WORKSPACE_RECOVERY_JOURNAL_KEY_V4` (`fraudguard-demo-workspace-v4-recovery`), xóa khóa `v4` mới tạo khi `users` lỗi nếu trước đó chưa tồn tại (`restoreKeyToPriorState`), dừng ngay khi `getItem` lỗi (`STORAGE_READ_FAILED`), bảo vệ hai pha `preservePreDemoSnapshotUntilCommitted` khi khôi phục demo, hợp nhất autosave duy nhất kèm `lastPersistedSnapshotRef` bị khóa khi lỗi/`recovery_required` trên `FraudGuardDashboard.tsx`, và bổ sung 9 khóa VI/EN trong `src/config/translations.ts`. Đã tái hiện `node --test tests/wf04-phase2a-fixes.test.cjs` thất bại trước sửa (`exit 1`, `1` pass / `5` fail), sau sửa đạt `9/9` (`exit 0`), `npm run check` đạt `exit 0` (`eslint src --max-warnings=0` `0` cảnh báo, `tsc --noEmit` `0` lỗi, `129/129` test đạt qua 5 tệp gồm `11` WF-01 + `17` WF-04 Phase 1 + `83` test cũ + `9` Phase 2A + `9` regression fixes) và `npm run build` đạt `exit 0` (Next.js `15.5.25`, compiled `3.0s`, `6/6` static pages); trình duyệt cô lập `/fraud-monitoring` (`0` consoleErrors/`0` pageErrors, Light/Dark `1440x900` & `375x812`) xác nhận trực tiếp mở demo, tạo 3 case `CASE-WF04-0002`..`0004`, phân công/tự nhận `Đang điều tra`, `page.reload()` và khôi phục trước demo (còn kịch bản tiêm lỗi `Storage.prototype.setItem`/`localStorage` từ `page.evaluate()` bị chặn bởi sandbox `webview_browser` nên được xác minh bằng test tự động và build/UI). Toàn bộ các mục Phase 2B, chuyển dữ liệu cũ chờ Phase 2B, mục `7.1` (`SME Admin` gửi feedback) và tổng thể WF-04 vẫn giữ nguyên `[ ]`.
- Ngày 16/11/2026 - Đợt hoàn tất Recovery Cleanup Phase 2A WF-04 (`docs/antigravity-wf04-phase2a-recovery-fix.md`): đã khắc phục lỗi nuốt thất bại `removeItem(WORKSPACE_RECOVERY_JOURNAL_KEY_V4)` cuối `persistWorkspaceAndUsers` bằng cách bổ sung `WorkspaceRecoveryCommitState` (`"pending" | "committed_cleanup_pending"`), canonical SHA-256 digests (`committedV4Digest`, `committedUsersDigest`, `committedHasUsers`, `committedAt`), mã lỗi `STORAGE_CLEANUP_FAILED`, thứ tự ghi chính -> commit marker (rollback nếu lỗi marker) -> xóa journal trong `src/utils/workspace-storage.ts`, khôi phục đúng bản mới đã commit khi reload (`restoreWorkspaceSnapshot`), retry cleanup lũy đẳng (`0` lần ghi đè `v4`/`users`, không nhân đôi case/audit/timestamp), giữ nguyên `wf04DemoActive: false` khi demo restore đã commit (`src/data/wf04-demo.ts`, `src/hooks/useInvestigationCases.ts`, `FraudGuardDashboard.tsx`) và thêm 3 khóa VI/EN `cleanupRequired`/`cleanupPendingBadge`/`retryCleanupBtn` (`src/config/translations.ts`). Đã tái hiện `node --test tests/wf04-phase2a-recovery.test.cjs` thất bại trước sửa (`exit 1`, `0` pass / `2` fail), sau sửa đạt `7/7` (`exit 0`), `npm run check` đạt `exit 0` (`eslint` `0` cảnh báo, `tsc --noEmit` `0` lỗi, `136/136` test đạt qua 6 tệp gồm `11` WF-01 + `17` WF-04 Phase 1 + `83` test cũ + `9` Phase 2A + `9` Phase 2A fixes + `7` Phase 2A recovery fixes) và `npm run build` đạt `exit 0` (Next.js `15.5.25`, compiled `3.1s`, `6/6` static pages); trình duyệt `/fraud-monitoring` xác nhận trực tiếp mở demo, tạo `CASE-WF04-0002` & `CASE-WF04-0003`, phân công `Phạm Bảo Châu` & tự nhận `Đang điều tra`, `page.reload()`, đổi EN/VI, khôi phục trước demo, Light/Dark `1440x900` & `375x812` với `0` lỗi console/page (`step_41_shot_1.png`, `step_55_shot_1.png`, `step_63_shot_1.png`), còn các lỗi storage mô phỏng được kiểm chứng qua `StorageLike` test double. Toàn bộ mục Phase 2B, chuyển dữ liệu cũ chờ Phase 2B, mục `7.1` (`SME Admin` gửi feedback) và tổng thể WF-04 giữ nguyên `[ ]`.
- Ngày 16/11/2026 - Phase 2B WF-04 & Giao diện Loading (`docs/antigravity-wf04-phase2b.md`): đã nối hoàn chỉnh `submitInvestigationReport`, `requestInvestigationCaseRevision` (gắn `expectedReportId`/`expectedReportVersion`), `confirmInvestigationCaseReport` (gắn `reportId`/`reportVersion`), 3 action audit mới (`REPORT_SUBMITTED`, `REVISION_REQUESTED`, `REPORT_CONFIRMED_AND_CLOSED`) và tách UI qua `CaseReportWorkflowPanel.tsx`, `CasesView.tsx`, `ReportsView.tsx`, `AuditTrailView.tsx`, `FraudGuardDashboard.tsx`, `useInvestigationCases.ts`, `enterprise.ts` (`SME_HIDDEN_INTERNAL_WORKFLOW_ACTIONS`), `notification-feed.ts`, `export-csv.ts`, `translations.ts` (`115` khóa `wf04Phase2b` VI/EN), cùng giao diện `src/app/fraud-monitoring/loading.tsx` nền trắng giữ nguyên dark mode của dashboard (`SecurityDashboard.module.css` L5151-5390) và `11` kịch bản kiểm thử trong `tests/wf04-phase2b.test.cjs` + báo cáo `docs/wf04-phase2b-report.md`. Kiểm tra tuần tự đạt `npm run check` exit `0` (`eslint src --max-warnings=0` `0` cảnh báo, `next typegen && tsc --noEmit` `0` lỗi, `147/147` test đạt qua 7 tệp) và `npm run build` exit `0` trên `.next` độc lập (`Compiled successfully in 4.6s`, `6/6` static pages); kiểm thử trình duyệt trực tiếp trên `http://localhost:3005/fraud-monitoring` (`0` console/page errors, `CASE-WF04-0002` v1 -> revision -> v2 -> `Closed`, `CASE-WF04-0003` Operator tự điều tra 2 bước -> `Closed`, reload, `ReportsView` `2` Closed / `3` versions, `AuditTrailView`, cô lập `SME Admin`/`PA`/`Investigator`, đổi role đóng modal ngay, EN/VI, Dark `375x812`, khôi phục demo) và preview cô lập `loading.tsx` tại `http://127.0.0.1:3006` (`#ffffff`, `0` focusable, `0` tràn ngang trên `1440x900`/`768x1024`/`375x812`), còn lỗi quota storage kiểm chứng qua `StorageLike` (`Test 8.8`). Dừng để review trước khi triển khai mục `7.1` (`SME Admin` gửi feedback), chuyển đổi/dọn cuối theo `Checklist dọn cuối WF-04` và tích hợp BE/AI; toàn bộ mục tổng thể WF-04 giữ nguyên `[ ]`.
- Ngày 18/11/2026 - Đợt dọn cuối UI WF-04 (`docs/antigravity-wf04-final-cleanup.md`, tiếp nối sau Phase 2C `docs/wf04-phase2c-report.md`): giữ nguyên phần Codex đã hoàn thiện (Phase 2C gửi/xem feedback `ReportFeedbackModal.tsx` + `PlatformHealthView.tsx`, fixture `CASE-SAMPLE-*`, lớp chồng `alertInspectionOverlay`/`alertInspectionDrawer` `z-index 52/53` trên `builderOverlay`/`builderModal` `50/51`, Case modal giữ mounted + `useDialogFocus` và `loading.tsx` nền trắng); cập nhật `src/config/translations.ts` và `AlertCaseDrawer.tsx` dùng `linkedCaseDrawerNotice` / `unlinkedAiDrawerNotice` và loại bỏ `"Phase 2A"` khỏi thông báo người dùng; gỡ thanh ngữ cảnh demo, nút mẫu, `LegacyCaseArchiveSection`, thẻ KPI lưu trữ cũ và banner `showMigrationNotice` khỏi UI vận hành chính (`AlertsView.tsx`, `CasesView.tsx`, `ReportsView.tsx`, `FraudGuardDashboard.tsx`) trong khi bảo toàn toàn bộ `localStorage`, `legacyCaseArchive`, case đang mở/`Closed`, báo cáo, kết luận, `reportFeedbacks`, `preDemoSnapshot`, `recoveryJournal` và `src/services/.gitkeep`; cập nhật `tests/wf04-phase2a.test.cjs`, `tests/wf04-phase2b.test.cjs`, `tests/wf04-phase2c.test.cjs` cùng tài liệu `docs/wf04-sample-data.md` và `docs/wf04-final-cleanup-report.md`. Kiểm tra sau sửa code/test đạt `npm run check` exit `0` (`eslint src --max-warnings=0` `0` cảnh báo, `next typegen && tsc --noEmit` `0` lỗi, `node --test tests/*.test.cjs` `158/158` đạt qua `8` tệp, `0` thất bại/bỏ qua) và `npm run build` độc lập exit `0` (`Next.js 15.5.25`, compiled in `7.0s`, `6/6` static pages); trình duyệt production `http://localhost:3008/fraud-monitoring` (`0` console/page errors) xác nhận giao diện Operator mặc định sạch, mở/đóng `AlertCaseDrawer` bằng `Tab`/`Shift+Tab`/`Escape`/nút đóng trả focus về `"Xem cảnh báo"` và giữ nguyên nháp, vòng đời `CASE-WF04-0005` (`v1 -> revision -> v2 -> Closed`) và `CASE-WF04-0006` (Operator tự điều tra 2 bước), `SME Admin` gửi feedback -> `page.reload()` -> `Platform Admin` đọc chi tiết 1:1, cô lập `North Branch Utilities`, `Dormitory Grid Archive` hết hạn tiếp tục `CASE-WF04-EXP-01`, responsive `1440x900`/`768x1024`/`375x812` VI/EN Light/Dark (kèm giới hạn `webview_browser` chặn `page.evaluate`); vẫn giữ `[ ]` cho phần dọn `CaseStatus`/`case-workflow.ts`/`legacyCaseArchive` còn lại, ánh xạ nhãn AI, hợp đồng BE/AI và các workflow `WF-01..WF-03` chờ review tiếp theo.
- Ngày 18/11/2026 - Review Fix giới hạn công cụ dữ liệu mẫu WF-04 (`docs/antigravity-wf04-dev-tools-fix.md`): bổ sung cổng môi trường + yêu cầu bật rõ ràng thống nhất trong `src/data/wf04-demo.ts` (`isWf04DevToolsEnvironmentAllowed`, `isWf04DevToolsExplicitlyRequested`, `resolveWf04DevToolsEnabled`, `syncWf04DevToolsWindowBinding`) và `src/components/fraudguard-dashboard/FraudGuardDashboard.tsx` (`isBrowserWf04DevToolsActive`, `devSampleToolsActiveRef`, khóa `handleLoadWf04Demo`/`handleRestorePreDemo`), bảo đảm production mặc định không có `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS=true` luôn ẩn `wf04-dev-sample-tools` và không đăng ký `window.__fgWf04DevTools` bất kể query/localStorage, dọn helper & vô hiệu hóa callback cũ khi tắt/unmount, không crash khi đọc storage lỗi và bảo toàn dữ liệu hiện có; bổ sung test hành vi #12 trong `tests/wf04-phase2c.test.cjs` nâng tổng lên `159/159` đạt (`npm run check` exit `0`), kiểm chứng trình duyệt trên cả bản build có cờ `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS=true` (`0` -> `1` với `?wf04Dev=1` -> `0` về URL sạch giữ nguyên case mẫu) và bản production mặc định không cờ (`0` công cụ mẫu dù truy cập `?wf04Dev=1`), cập nhật `docs/wf04-sample-data.md` và Mục 6 của `docs/wf04-final-cleanup-report.md`. Dừng để review sau bản sửa này.
- Ngày 18/11/2026 - Bảng Lịch sử Xử lý 5 cột & Chiều rộng Modal Chi tiết Hồ sơ (`docs/antigravity-wf04-processing-history-table.md`): tách riêng `.caseDetailModal` (`width: min(1060px, calc(100vw - 48px))`, giữ nguyên `.builderModal` `min(720px, 100%)` cho các modal khác) trên cả 2 biến thể modal trong `CasesView.tsx`; thay danh sách `caseTimelineList` bằng bảng ngữ nghĩa 5 cột (đã cập nhật ngay sau đó sang bố cục 3 cột theo `docs/antigravity-wf04-processing-history-three-columns.md`, xem mốc bên dưới).
- Ngày 18/11/2026 - Cập nhật Bảng Lịch sử Xử lý sang 3 cột (`docs/antigravity-wf04-processing-history-three-columns.md`, thay thế bố cục 5 cột trước đó): rút gọn bảng Lịch sử xử lý trong `CasesView.tsx` còn đúng 3 cột (`Sự kiện`, `Thực hiện bởi`, `Ngày/giờ` / `Event`, `Performed by`, `Date/time`); bỏ cột `Người đảm nhận`, `Trạng thái sau sự kiện`, `Ngày`/`Giờ` tách rời và bỏ dòng phụ `Thực hiện bởi:` dưới tên sự kiện; `buildCaseProcessingHistoryRows` (`L168-231`) lấy `actorName` từ `evt.actor` (tuyệt đối không dùng `evt.assignee`/`case.assignee`), giữ nguyên phiên bản báo cáo trong tên sự kiện (`v1`/`v2`), gộp ngày và giờ theo locale (`DD/MM/YYYY HH:MM:SS` không dính `.001`), giữ sort mili-giây `Date.parse(evt.at)` & ổn định thứ tự gốc khi trùng thời điểm, giữ `<details>` truy cập bàn phím cho nội dung `> 140` ký tự và giữ thông tin người phụ trách + trạng thái hiện tại ở phần Thông tin hồ sơ; cập nhật 5 khóa VI/EN tại `src/config/translations.ts`, CSS bảng & `@media (max-width: 680px)` tại `SecurityDashboard.module.css` (`0` cuộn ngang không cần thiết trên `375px`/`768px`/`1440px`), test #13 trong `tests/wf04-phase2c.test.cjs` và báo cáo `docs/wf04-processing-history-table-report.md`. `npm run check` đạt `exit 0` (`eslint` 0 cảnh báo, `next typegen && tsc --noEmit` 0 lỗi, `160/160` test đạt); trình duyệt `http://localhost:3000/fraud-monitoring?wf04Dev=1` xác nhận `CASE-SAMPLE-REVIEW` (`v1 -> revision > 140 ký tự -> v2 -> Đã đóng`), `CASE-WF04-0005` (`Tự đảm nhận điều tra`), `CASE-SAMPLE-WORKING` (`AlertCaseDrawer` nổi trên modal giữ nguyên nháp), `VI/EN`, `Light/Dark`, `1440x900`/`768x1024`/`375x812` (`0` tràn trang và `0` cuộn ngang bảng ở `375px`, giữ nguyên `next dev` `PID 21196/26160` nên chưa chạy `npm run build` vào `.next`). Dừng để review; chưa thực hiện TechPay hay WF-01.
- November 19, 2026 - Final WF-04 UI cleanup & source-accurate alert views (on `codex/operator-alert-navigation`, preserving Codex's operator alert navigation, `My Cases` preview removal, 3-column Processing History table, and dev-only sample gate): updated VI/EN copy in `src/config/translations.ts` (removed dead `phase2bScopeHint`, replaced `uninitializedLifecycleReason`, `assignInvestigatorLabel`, `evidenceScopeNote`, `invalidInput`, `invalidTimestamp`, tightened `smeFeedback` and `platformHealth` disclosures to remove duplicated notices and `"snapshot"`/`"bản chụp"` wording while keeping shared-content, explicit-confirmation, read-only, local-only, and non-retraining notes, and added `aiSubtitle`, `fallbackSubtitle`, `ruleSubtitle`, `noAiAlerts`, `noFallbackAlerts`, `noRuleAlerts`, `filterSummaryEmptyMonitoring`, `disabledFallbackAlertReason`); updated `src/components/fraudguard-dashboard/AlertsView.tsx` and `AlertCaseDrawer.tsx` so `AI fallback` (rule engine backup when AI service is unavailable) and `Rule` views display accurate monitoring-only titles, subtitles, empty states, and drawer guidance without case-creation checkboxes or case triage tabs, while `AI` keeps unlinked priority and full-timestamp ordering; tightened `ReportFeedbackModal.tsx` and `PlatformHealthView.tsx` to remove repeated banners; added source-separation and monitoring-only regression assertions in `tests/operator-alert-navigation.test.cjs`. Post-edit `npm run check` passed (`eslint src --max-warnings=0`, `next typegen && tsc --noEmit`, `163/163` tests pass); live browser verification on clean `http://localhost:3000/fraud-monitoring` confirmed zero demo/legacy/Phase 2 strings, Subscription vs Free Operator menus (desktop & mobile `375x812`), source-accurate AI/Fallback/Rule views, Investigator `My Cases` without row previews, 3-column case history + `AlertCaseDrawer` stacking with draft preservation, tightened SME Admin / Platform Admin feedback views in VI/EN & Light/Dark with zero horizontal overflow; `npm run build` was not run against `.next` to avoid colliding with the user's running `next dev` server (`PID 22552`/`23308`).
- November 19, 2026 - Case Detail modal spacing & real `RULE` / `RULE_FALLBACK` verification (on `codex/operator-alert-navigation`): added dedicated `.caseDetailBody` (`16px` desktop section gap, `12px` mobile gap at `max-width: 680px`, `.caseDetailModal .caseDetailBody > * { min-width: 0; margin-bottom: 0; }`) in `SecurityDashboard.module.css` without altering shared `.builderBody`, applied `.caseDetailBody` to both SME Admin and internal Case Detail modal bodies in `CasesView.tsx`, and removed redundant `style={{ marginBottom: 14 }}` on direct modal banner children in `CasesView.tsx` and `CaseReportWorkflowPanel.tsx`. In `AlertCaseDrawer.tsx`, unified `nonAiMonitoringNotice` (accurate backup Rule Engine description for `RULE_FALLBACK` vs monitoring-only notice for `RULE`) across locked and legacy modes and hid `"Thông tin hồ sơ"` / `"Case Summary"` heading on non-AI alerts; kept case-creation gating in `AlertsView.tsx` (`getRowSelectionState`) and `src/utils/investigation-case.ts` (`createInvestigationCase`) intact. Added minimal dev-only `RULE_FALLBACK` fixture `tx-wf04-campus-fallback` (`ALT-WF04-CAMPUS-FALLBACK-06`) in `src/data/wf04-demo.ts` (merged non-destructively only when dev sample tools `?wf04Dev=1` are invoked; never auto-loaded into operational UI). Added regression tests in `tests/operator-alert-navigation.test.cjs`; post-edit `npm run check` passed (`eslint src --max-warnings=0`, `next typegen && tsc --noEmit`, `165/165` tests pass). Live browser verification at `http://localhost:3000/fraud-monitoring` (`0` console/page errors, clean URL hides dev tools) confirmed uniform `16px` desktop (`1440x900`) and `12px` mobile (`375x812`) gaps across internal Operator/Investigator (`CASE-SAMPLE-REVIEW`, `CASE-SAMPLE-WORKING`) and SME Admin (`CASE-SAMPLE-CLOSED`) modals, draft preservation when closing `AlertCaseDrawer` with `Escape` plus focus return, and real `ALT-WF04-CAMPUS-FALLBACK-06` (`RULE_FALLBACK` on `Subscription`) and `ALT-WF04-CAMPUS-RULE-05` (`RULE` on `Free`) rows and drawers with zero checkboxes, triage tabs, or case-creation controls before restoring `Campus PowerGrid SME` to `Subscription`. `npm run build` was not run against `.next` because the user's `next dev` process (`PID 22552`/`23308`) remained active on port `3000`.

### Backend authentication integration (24 November 2026)

- [x] Verify Platform Admin authentication through the production frontend, Spring Boot and isolated PostgreSQL. Chrome completed login, mandatory password setup, reload, current password change and logout. Direct access after logout redirected to login. A separate browser check confirmed visible failure when the backend was unavailable.
- [x] Verify the current frontend with `npm run check` (170 tests passed) and `npm run build`. Backend `.\mvnw.cmd clean verify` succeeded with a temporary JDK 21 (19 tests passed, 20 Docker-dependent tests skipped).
- [ ] Verify enterprise sign-in with a provisioned enterprise test account. The live account used above was a Platform Admin.
