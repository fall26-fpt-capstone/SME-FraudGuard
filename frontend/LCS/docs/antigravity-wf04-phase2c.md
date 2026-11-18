# Prompt Antigravity: WF-04 Phase 2C — SME Admin gửi feedback

Triển khai frontend cho SME Admin chủ động gửi feedback từ báo cáo đã xác nhận tới Platform Admin. Làm theo từng bước dưới đây, kiểm chứng và bàn giao để review trước bước dọn cuối WF-04.

## 1. Đọc trước khi làm

Đọc AGENTS.md, README.md, docs/ui/UI_RULES.md, docs/ui/DESIGN_SYSTEM.md, docs/task.md mục 7.1, docs/antigravity-wf04-phase2b.md và docs/wf04-phase2b-report.md. Kiểm tra code thực tế, không chỉ dựa vào báo cáo. Mốc review độc lập Phase 2B: npm run check đạt 147/147 test và npm run build đạt.

Kiểm tra git status; giữ nguyên toàn bộ thay đổi đang có. Làm trên feature branch hiện tại phù hợp, không reset, restore, stash, commit, push hoặc merge. Phạm vi frontend/LCS; không sửa landing page. Không thêm dependency.

Đọc các nhóm code:

- Types/utils investigation-case và readConfirmedInvestigationReport.
- useInvestigationCases, workspace-storage, wf04-demo và mọi writer workspace/users.
- ReportsView, CasesView, CaseReportWorkflowPanel, FraudGuardDashboard, PlatformHealthView.
- Permissions, enterprise scope, platform-summary, notification-feed, export-csv, translations, tests.

Áp dụng UI hiện hành và antislop tại đường dẫn AGENTS chỉ định; mode during theo lựa chọn phiên hiện tại. Giữ hướng dashboard nghiệp vụ: ENERGY 1 / RHYTHM 1 / MOTION 1. Tái sử dụng bảng, dialog, token và useDialogFocus; không redesign shell, queue hoặc loading đã nghiệm thu.

## 2. Phân biệt yêu cầu đã thống nhất và lựa chọn triển khai

Đã thống nhất với người dùng:

- SME Admin chủ động chọn kết quả đã xác nhận của doanh nghiệp mình để gửi feedback cho Platform Admin.
- Đóng case không tự gửi feedback; không gửi thì case vẫn Closed.
- Một case có thể gồm nhiều AI Alert với kết quả khác nhau; giữ kết quả riêng từng alert.
- Platform Admin chỉ thấy nội dung doanh nghiệp đã gửi, không được mở toàn bộ hồ sơ nội bộ.
- Hiện tại làm frontend, chưa có BE hoặc AI service. Sau này mới nối dịch vụ thật theo contract.

Phạm vi tối thiểu được đề xuất cho đợt này, không được ghi là quy định có sẵn trong proposal:

- Gửi toàn bộ kết quả của đúng một phiên bản báo cáo đã được xác nhận trong một lần, chưa chọn gửi riêng từng alert.
- Cho SME Admin thêm nhận xét tùy chọn, không sửa kết luận hoặc bằng chứng đã xác nhận.
- Một bản gửi cho mỗi bộ enterpriseId/caseId/reportId/reportVersion; gửi lặp trả về bản đã có hoặc lỗi rõ ràng, không tạo bản trùng. Chưa có sửa, thu hồi hay gửi bản thay thế.
- Chỉ có hành động gửi và xem bản đã gửi; chưa thêm quy trình Pending/Approved/Rejected, phản hồi của PA hoặc trạng thái đã dùng huấn luyện.
- Không thêm điều kiện Subscription mới cho việc gửi kết quả của case đã hoàn tất; giữ nguyên điều kiện mở case hiện tại.

Ghi rõ các lựa chọn này trong báo cáo bàn giao để review. Nếu tài liệu yêu cầu có mâu thuẫn thực sự, nêu cụ thể nguồn và điểm mâu thuẫn trước khi mở rộng nghiệp vụ.

## 3. Bước A — Model và quyền

Thiết kế type feedback riêng, không nhét trạng thái feedback vào lifecycle của case. Có ID, doanh nghiệp nguồn, người gửi bằng ID, thời điểm, caseId, reportId/version, nhận xét và bản nội dung bất biến đã gửi.

Nội dung gửi tối thiểu gồm:

- Tên doanh nghiệp, mã case, tên/mã từng alert và nguồn AI; chỉ lấy metadata thực có cần để hiểu báo cáo.
- Tổng kết của báo cáo được xác nhận; kết luận cuối cùng của Operator.
- Kết quả và bằng chứng dạng văn bản riêng cho từng alert trong chính phiên bản đó.
- Phiên bản báo cáo, thông tin xác nhận cần truy vết và thời điểm gửi.

Tạo projection theo danh sách trường cho phép, không spread toàn bộ case/transaction/user vào feedback. Không kèm bản nháp, báo cáo cũ bị trả lại, toàn bộ lịch sử nội bộ, dữ liệu giao dịch thô, thông tin tích hợp, credentials hoặc dữ liệu không hiển thị trong bước xem trước. Không tạo file đính kèm giả. Không tự ánh xạ resultText thành nhãn AI hoặc tính accuracy/confidence.

Tách hàm thuần tạo feedback và hàm đọc theo quyền. Hàm ghi phải tra actor/case/report mới nhất, xác minh SME Admin cùng doanh nghiệp, case Closed có xác nhận đúng reportId/version. Không tin object snapshot do component truyền vào. Callback gửi mang ID/version thực sự được xem trước; sai phiên bản phải từ chối và yêu cầu mở lại.

Platform Admin đọc projection đã gửi, không gọi readInternalInvestigationCase để lấy thêm dữ liệu. SME Admin chỉ đọc feedback của doanh nghiệp mình. Operator, Investigator, Implementation Staff không được gửi hoặc có quyền đọc feedback mới mặc định. Kiểm tra tại handler/read helper, không chỉ ẩn nút.

Giữ báo cáo và case gốc bất biến. Sự thay đổi đối tượng nguồn sau gửi không được thay đổi bản đã gửi. ID/time được truyền vào domain; không sửa timestamp để qua guard.

## 4. Bước B — State và lưu trữ

Nối feedback vào nguồn state và coordinator workspace hiện tại. Không tạo một đường ghi localStorage độc lập bỏ qua recovery journal. Kiểm tra tất cả writer onboarding/case/users để không ghi mất feedback khi cập nhật phần khác.

Đảm bảo tương thích workspace hiện có: payload hợp lệ trước đợt này chưa có feedback được nâng cấp có kiểm soát thành danh sách rỗng, không suy ra feedback từ case Closed hoặc caseDecision legacy. Nếu cần đổi version storage, có migration/backup rõ ràng; không đổi version chỉ vì tiện. Payload đã có feedback nhưng sai cấu trúc phải báo lỗi theo chính sách restore hiện tại, không âm thầm lọc mất dữ liệu.

Mở rộng validate sâu cho feedback, cả danh sách lồng và liên kết ID/version. Tích hợp backup/restore demo, preDemoSnapshot và recovery để không làm mất feedback thật khi bật/tắt demo. Fixtures vẫn ở src/data; không tạo feedback trước thao tác gửi trong kịch bản nghiệm thu chính.

Chống double click và callback cũ trên state mới nhất. Mỗi lần gửi hợp lệ sinh đúng một feedback và audit tương ứng. Retry persistence không chạy lại command hoặc tạo ID/time/audit mới.

Giữ cơ chế pending/committed_cleanup_pending đã sửa: lỗi trước commit, commit thành công nhưng cleanup lỗi và reload phải giữ đúng dữ liệu. Không báo lưu thành công khi chưa lưu được. Cho thử lại theo coordinator hiện có.

Giữ src/services chỉ có .gitkeep. Không tạo endpoint, HTTP client giả hoặc giả thông báo đã gửi tới máy chủ. UI giải thích ngắn tại bước xác nhận rằng bản gửi hiện lưu trong bản chạy thử; tài liệu ghi rõ chuyển role trong cùng workspace chỉ mô phỏng việc PA tiếp nhận, chưa truyền giữa thiết bị/tài khoản thật. Không rải banner kỹ thuật trên mọi trang.

## 5. Bước C — SME Admin gửi

Tại báo cáo đã xác nhận của SME Admin, thêm hành động “Gửi phản hồi” phù hợp bố cục hiện có.

1. Mở dialog xem trước chính xác nội dung PA sẽ nhận.
2. Hiển thị rõ báo cáo/phiên bản và kết quả từng alert, không gộp kết quả khác nhau thành một nhãn chung.
3. Cho thêm nhận xét tùy chọn; giải thích nội dung bằng chứng hiển thị cũng sẽ được gửi.
4. Người dùng chủ động bấm xác nhận gửi; mở dialog hoặc xem báo cáo không gây ghi dữ liệu.
5. Sau gửi, hiển thị thời điểm/người gửi và cho xem lại bản đã gửi. Đã gửi thì không có nút tạo bản trùng.

Nháp nhận xét chưa gửi chỉ cần bộ nhớ; có xác nhận bỏ khi đóng nếu đã sửa. Đổi actor/tenant phải loại bỏ nội dung không còn quyền. Không tuyên bố autosave qua reload. Các trạng thái rỗng, sai quyền, stale report và lưu lỗi cần thông báo rõ, giữ nội dung khi có thể thử lại.

## 6. Bước D — Platform Admin tiếp nhận

Tái sử dụng khu vực feedback phù hợp trên PlatformHealthView hoặc component con; không tạo thêm menu khi không cần. Danh sách gồm doanh nghiệp gửi, mã case, phiên bản, người gửi, thời gian và Xem chi tiết. Sort theo timestamp đầy đủ, hiển thị thời gian dễ đọc.

Chi tiết chỉ đọc bản đã gửi. Không có nút mở case nội bộ hoặc đường lấy thêm transaction/bằng chứng chưa gửi. Không có duyệt/từ chối/retrain/download toàn bộ dữ liệu nếu chưa được yêu cầu.

Thay nguồn đếm feedback tại platform-summary bằng collection đã gửi rõ ràng. Tuyệt đối không khôi phục cách đếm caseDecision hoặc toàn bộ Closed thành feedback. Các phần thống kê AI khác giữ nguyên ý nghĩa; số feedback không phải độ chính xác AI.

Audit, notification và export hiện có nếu chịu ảnh hưởng phải giữ cùng quyền. Audit không được làm lộ nội dung chưa gửi; đường export cũ không được trở thành cách đọc case nội bộ cho PA. Không thêm export mới nếu không cần.

## 7. Bước E — Kiểm chứng

Viết test hành vi cần thiết, tối thiểu:

1. Đóng case không tạo feedback; không gửi thì PA không thấy báo cáo.
2. SME Admin gửi case Closed của mình, snapshot đúng reportId/version và đúng nội dung xem trước.
3. Case nhiều alert có kết quả khác nhau được bảo toàn; không copy kết luận chung thành nhãn riêng.
4. Chặn sai role, sai tenant, case chưa Closed, thiếu/sai xác nhận, stale callback và nội dung snapshot giả từ UI.
5. Gửi trùng/double click/retry không nhân đôi feedback hoặc audit.
6. PA chỉ thấy snapshot đã gửi; không thấy nháp, bản bị trả lại, case khác chưa gửi qua detail/notification/export.
7. Nhận xét không sửa report/case; snapshot bất biến khi nguồn thay đổi.
8. Reload giữ feedback; workspace cũ chưa có collection vẫn đọc được; nested payload hỏng bị chặn.
9. Lỗi storage trước commit và sau commit/cleanup có phục hồi đúng; writer khác và demo backup/restore không làm mất feedback.
10. Gửi kết quả case đã hoàn tất sau khi Subscription hết hạn vẫn hoạt động; tạo case mới vẫn bị chặn.

Chạy npm run check rồi npm run build tuần tự, không xung đột tiến trình dev dùng chung .next. Không xóa/hạ assertion cũ để suite xanh; chỉ thay kỳ vọng 0 feedback sau thao tác gửi rõ ràng, vẫn giữ 0 trước gửi.

Kiểm tra trình duyệt: hoàn tất một case nhiều alert, SME xem trước/hủy rồi gửi, đổi PA thấy đúng một bản, reload, đổi SME khác không thấy, kiểm tra role không có quyền. Kiểm tra VI/EN, light/dark, 375/768/1440px, bàn phím/focus và dữ liệu dài. Nếu không chạy được phần nào, ghi rõ giới hạn, không gọi test source/VM là browser E2E.

## 8. Bàn giao và điểm dừng

Tạo docs/wf04-phase2c-report.md gồm file thay đổi, model/projection thực tế, bảng quyền, luồng gửi/đọc, lựa chọn triển khai, lưu trữ/migration, kết quả test/build/browser và điểm nối BE/AI sau này. Ghi rõ feedback mới là nguồn thông tin để đánh giá AI, chưa chứng minh AI đã học hoặc cải thiện.

Cập nhật đúng các mục đã hoàn thành trong docs/task.md. Không đánh dấu toàn bộ WF-04 hoàn tất khi checklist dọn cuối chưa làm.

Dừng sau Phase 2C để review. Bước tiếp theo đã được người dùng yêu cầu là gỡ banner demo WF-04 và mục “Hồ sơ lưu trữ cũ” khỏi UI Operator sau khi hoàn thiện; giữ checklist này, không đề xuất giữ lại trên UI chính. Đợt này chưa dọn legacy hoặc xóa dữ liệu. Khi dọn phải bảo toàn case/báo cáo/feedback, không xóa localStorage để làm UI sạch.
