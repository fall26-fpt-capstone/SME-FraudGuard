# Prompt Antigravity: WF-04 Phase 2B và giao diện loading

Nối luồng soạn/gửi báo cáo, yêu cầu bổ sung, xác nhận và đóng case vào domain WF-04 hiện có. Đồng thời chỉnh màn hình loading theo yêu cầu UI đã xác nhận. Hoàn tất kiểm chứng, cập nhật tài liệu và dừng để review; chưa làm feedback hoặc bước dọn cuối.

## 1. Nguồn yêu cầu và phạm vi

Đọc AGENTS.md, README.md, docs/ui/UI_RULES.md, docs/ui/DESIGN_SYSTEM.md, docs/task.md, docs/wf04-phase1-report.md, docs/wf04-phase2a-report.md và các prompt Phase 1/2A cùng đợt fixes. Kiểm tra branch/git status, giữ thay đổi hiện có và untracked; không reset, restore, stash, commit hoặc push.

Mốc review độc lập trước đợt này: 136/136 test và production build đạt. Lỗi recovery cleanup đã được sửa: reload giữ bản mới đã commit, retry không quay lại bản cũ. Không viết lại hoặc bỏ cơ chế này khi thêm báo cáo.

Đọc code thực tế:

- `src/types/investigation-case.ts`, `src/utils/investigation-case.ts`.
- `src/hooks/useInvestigationCases.ts`, `src/utils/workspace-storage.ts`, `src/utils/case-migration.ts`.
- `FraudGuardDashboard.tsx`, `CasesView.tsx`, `ReportsView.tsx`, `AlertCaseDrawer.tsx`.
- Helpers permissions/enterprise/notification/export/platform-summary, translations và tests liên quan.
- `src/app/fraud-monitoring/loading.tsx`, các class routeState/loadingGrid/loadingBlock/loadingTable và `.skeleton` trong globals.css, layout Sidebar/ProductHeader hiện tại.

Chỉ làm frontend. Giữ `src/services/.gitkeep`, không tạo API giả, endpoint, AI service hoặc retraining. Không thêm dependency. Domain frontend không phải API contract đã duyệt.

Giữ thiết kế dashboard hiện tại, không redesign queue hoặc shell. Áp dụng antislop tại đường dẫn AGENTS chỉ định; mode during đã được người dùng chọn, không hỏi lại. Hướng thiết kế: dashboard nghiệp vụ hiện có, ENERGY 1 / RHYTHM 1 / MOTION 1; ưu tiên nội dung cảnh báo, bằng chứng và hành động rõ ràng. Dùng component/token/focus hook hiện có và cập nhật vi/en.

## 2. Nghiệp vụ phải giữ

- Một case có một hoặc nhiều AI Alert cùng doanh nghiệp, danh sách thành viên cố định trong phạm vi hiện tại. Không merge/split, thêm/bớt alert, đổi người phụ trách giữa chừng hoặc reopen Closed.
- Case Investigating: chỉ Investigator được giao hoặc Operator tự đảm nhận được soạn/gửi báo cáo. Xác định bằng user ID và tenant, không bằng tên hiển thị.
- Một báo cáo chung có tổng kết cùng kết quả và bằng chứng riêng cho từng alert. Các alert có thể có kết quả khác nhau. Không áp một kết luận chung thành cùng nhãn cho tất cả alert.
- Gửi báo cáo lưu phiên bản bất biến, chuyển Pending Review. Operator cùng doanh nghiệp có thể yêu cầu bổ sung kèm lý do, đưa về Investigating; gửi lại tạo phiên bản mới.
- Operator xác nhận đúng report ID/version đang review để Closed. Không đóng Open/Investigating khi chưa có báo cáo chờ duyệt.
- Operator tự điều tra được tự gửi báo cáo rồi tự xác nhận và đóng; vẫn hai thao tác riêng, có actor/time/event riêng.
- Subscription hết hạn không chặn xử lý case đã mở hợp lệ, gồm soạn/gửi/bổ sung/duyệt/đóng/xem. Tạo case mới vẫn theo guard hiện có.
- SME Admin xem báo cáo và kết luận đã xác nhận của doanh nghiệp mình. Không được soạn/duyệt hoặc xem bản nháp/báo cáo đang chờ duyệt qua đường khác. Investigator chỉ thấy case được giao. PA/Implementation Staff không có quyền nội bộ mặc định.
- Closed chỉ đọc. Đóng case không tạo feedback hoặc tự gửi nội dung lên Platform Admin. Feedback thuộc đợt sau.
- Giữ resultText dạng văn bản hiện tại, chưa tự thêm enum kết luận, nhãn AI, risk score hoặc confidence giả.

## 3. Bước A: nối commands và state

Mở rộng coordinator/hook để gọi đúng ba public functions hiện có:

1. `submitInvestigationReport`.
2. `requestInvestigationCaseRevision`.
3. `confirmInvestigationCaseReport`.

Handler nhận caseId và nội dung thao tác, tra case/actor/users mới nhất từ state. Không nhận object case đã chỉnh từ component để ghi đè toàn hồ sơ. Recheck quyền tại handler, không chỉ ẩn nút. Giữ một nguồn ghi case độc lập với transaction.

ID/time sinh bên ngoài domain và React updater. Truyền nguyên instant của clock/at; không cộng mili giây, clamp theo history hoặc đổi đồng hồ để vượt guard. UI có thể rút gọn giờ, lịch sử vẫn giữ timestamp đầy đủ.

Gửi/duyệt lặp từ double click hoặc callback cũ không sinh phiên bản/event/audit trùng. Callback review phải mang report ID/version thực sự được người dùng xem, không tự lấy bản mới nhất lúc click để che xung đột. Nếu phiên bản đã đổi, báo yêu cầu mở lại báo cáo mới.

Yêu cầu bổ sung cũng phải gắn với báo cáo đang xem tại tầng coordinator; nếu state đã chuyển sang phiên bản khác, từ chối thao tác cũ. Chưa cần đổi domain signature nếu có thể kiểm tra an toàn tại coordinator trên state mới nhất.

Mỗi command thành công ghi đúng một audit theo tenant/actor/case/report version. Thất bại nghiệp vụ không đổi state, không persist và không toast thành công.

Tất cả lưu/retry tiếp tục đi qua coordinator workspace/users hiện có. Lỗi storage phải giữ khả năng thử lại mà không gửi command lần nữa. Phân biệt đã cập nhật trong phiên, đã commit và còn chờ cleanup; không báo đã lưu khi chưa lưu được. Giữ draft/nội dung vừa nhập khi cần để phục hồi.

## 4. Bước B: form báo cáo trong case detail

- Dùng detail hiện tại hoặc tách component nhỏ để tránh làm CasesView quá lớn; giữ bố cục/thẩm mỹ đã có.
- Phần đầu hiển thị case và danh sách alert. Người phụ trách xem từng alert, dữ liệu nguồn thực có và viết kết quả/bằng chứng riêng; phần cuối có tổng kết chung.
- Trường bắt buộc theo domain: tổng kết, resultText và evidence cho đủ từng alert. Hiển thị lỗi gắn đúng trường, không chỉ một toast chung. Giữ nội dung khi validation thất bại.
- Evidence hiện là văn bản. Chưa triển khai upload file hoặc mô tả file đã gửi tới server. Không bịa dữ liệu tiêu thụ điện theo thời gian nếu source chỉ có bản ghi đơn lẻ; bảng/biểu đồ chỉ dùng dữ liệu thực có trong fixture và có đơn vị/nguồn rõ ràng.
- Gửi báo cáo là hành động chủ động, không tự gửi khi đóng modal. Sau thành công chuyển Pending Review, hiển thị bản đã gửi chỉ đọc và phiên bản tương ứng.
- Khi yêu cầu bổ sung, cho người phụ trách bắt đầu từ nội dung bản gần nhất để chỉnh, nhưng không mutate bản đã gửi. Hiển thị lý do bổ sung; lần gửi tiếp theo tạo version mới.
- Báo cáo nháp tách khỏi snapshot đã gửi. Phạm vi tối thiểu dùng draft trong bộ nhớ theo caseId, actorId và base report version. Nếu đóng/navigate sẽ mất draft thì hỏi xác nhận bỏ; không âm thầm xóa. Không tự thêm persist nháp vào workspace nếu không cần. Ghi rõ giới hạn reload của draft và không tuyên bố tự lưu nháp khi chưa có.
- Đổi user/tenant hoặc mất quyền khi form đang mở: lập tức ẩn nội dung không còn được phép và chặn submit. Draft của người trước không được đưa cho người sau; không hiển thị lại nội dung để hỏi xác nhận trong ngữ cảnh đã mất quyền.

## 5. Bước C: review, bổ sung và xác nhận

- Operator xem tổng kết, kết quả/bằng chứng từng alert và report version đang được review. Có hành động yêu cầu bổ sung và xác nhận/đóng rõ ràng.
- Yêu cầu bổ sung bắt buộc lý do không trắng. Pending Review → Investigating; giữ báo cáo cũ nguyên trạng trong history.
- Xác nhận có bước xem lại nội dung/phiên bản trước khi đóng. Truyền bắt buộc đúng reportId/reportVersion của bản đang hiển thị. Có thể dùng finalSummary theo domain; giữ kết quả từng alert từ báo cáo được xác nhận, không cho sửa ngầm các kết quả trong bước duyệt.
- Nếu không đồng ý kết quả một alert, Operator yêu cầu bổ sung/chỉnh báo cáo, không âm thầm ghi đè phiên bản đã gửi.
- Operator tự điều tra thấy nút gửi khi Investigating, sau khi gửi mới thấy nút xác nhận khi Pending Review. Không gộp thành nút “gửi và đóng”.
- Closed hiển thị người/thời điểm xác nhận, report version, tổng kết cuối và kết quả từng alert. Không có nút sửa/reopen.
- Lịch sử phân biệt gửi báo cáo, yêu cầu bổ sung và xác nhận. Người được phép xem history có thể mở phiên bản cũ chỉ đọc. Không đồng nhất phiên bản cũ với bản đang chờ duyệt.

## 6. Bước D: ReportsView và các đường đọc liên quan

- ReportsView lấy dữ liệu từ InvestigationCase và public read guards, không tiếp tục dùng `tx.investigationReport`/`tx.caseDecision` làm nguồn hiện hành cho case mới.
- Operator xem báo cáo theo tenant; Investigator theo case được giao; SME Admin chỉ bản đã xác nhận. Không đưa history nội bộ vào view SME nếu read contract không cho phép.
- Đếm theo case/report đúng nghĩa: một case ba alert vẫn là một case; một case hai phiên bản báo cáo không thành hai case. Ghi rõ thống kê nào đếm report version nếu thực sự có.
- Case Queue cập nhật trạng thái/KPI và nội dung latest report khi gửi/bổ sung/đóng. Khi có quyền xem history, các bản cũ phải còn tra cứu được.
- Đồng bộ busy-member guard, notification feed, audit, CSV/export và các badge liên quan. Thêm event/action mới vào bộ lọc quyền; tránh chỉ lọc các action cũ rồi làm lộ báo cáo cho PA hoặc tenant khác.
- Không coi kết luận đã xác nhận là feedback đã gửi. Platform summary không được đếm case Closed thành feedback.
- Legacy archive tiếp tục chỉ đọc trong đợt này, không cho thao tác Phase 2B “hợp thức hóa” hồ sơ thiếu provenance. Không thay đổi dữ liệu cũ để làm demo dễ hơn.

## 7. Bước E: giao diện loading theo yêu cầu người dùng

Trang hiện tại là `src/app/fraud-monitoring/loading.tsx`, đang dùng `.routeState`, bốn `.loadingBlock`, một `.loadingTable` trên nền tối.

Yêu cầu đã chốt:

- Đổi riêng màn hình loading sang nền trắng, chữ tối, skeleton xám nhạt.
- Bố cục giống khung dashboard: Sidebar bên trái, header phía trên, vùng nội dung căn đúng khoảng cách/kích thước dashboard.
- Trong vùng nội dung giữ bốn ô skeleton nhỏ phía trên và một khối lớn phía dưới; responsive theo breakpoint thực tế, không cố giữ bốn cột trên mobile.
- Loading dùng nền trắng như người dùng yêu cầu kể cả trước khi theme được khôi phục. Không ép toàn dashboard sang light hoặc thay màu shared token khiến dark mode chính bị hỏng.
- Nếu route loading chưa biết role/user, Sidebar là khung skeleton trung tính, không render menu đặc quyền hoặc thông tin user giả. Không gọi logic dashboard có side effect chỉ để dựng shell.
- Tái sử dụng token kích thước/header/sidebar hoặc component trình bày nhẹ thích hợp, không tạo một bộ layout độc lập với kích thước tùy ý. Không để sidebar/header nhân đôi khi route hoàn tất.
- Có `aria-busy`/status rõ ràng, skeleton trang trí `aria-hidden`, tôn trọng reduced motion. Không đưa focus vào nút/menu giả. Không thêm delay tải giả để người dùng thấy skeleton lâu hơn.
- Nội dung loading theo ngôn ngữ hiện có khi khả dụng; không buộc import provider chưa tồn tại tại route fallback gây lỗi. Giữ nhãn fallback hợp lý và mô tả cách xử lý trong báo cáo.

Nghiệm thu bằng ảnh/loading thật hoặc preview kiểm thử tách biệt: desktop, 768px, 375px, không tràn ngang, không nhảy bố cục lớn khi chuyển sang dashboard. Kiểm tra dashboard light/dark sau tải vẫn bình thường.

## 8. Test và nghiệm thu

Giữ test Phase 1/2A/recovery và bổ sung test integration thật qua handler/hook/component phù hợp, không chỉ chụp source code hoặc gọi lại hàm domain.

1. Investigator được giao soạn đủ kết quả cho case nhiều alert, gửi v1 → Pending Review; reload giữ bản v1 và một audit/event.
2. Báo cáo thiếu tổng kết/kết quả/evidence hoặc alert thiếu/thừa/trùng bị chặn; form không mất nội dung.
3. Operator yêu cầu bổ sung có lý do → Investigating; Investigator sửa gửi v2; v1 nguyên vẹn, reason còn trong history.
4. Operator review đúng v2 → Closed; conclusion giữ kết quả khác nhau giữa các alert. ID/version v1, callback cũ hoặc payload thiếu phiên bản bị chặn.
5. Cùng Operator tự điều tra → gửi → tự xác nhận thành công qua hai thao tác, không đóng trực tiếp.
6. Chặn người không được giao, sai tenant/role; đổi role/user lúc modal mở không lộ draft/report hoặc cho ghi. SME Admin chỉ đọc báo cáo Closed; PA không thấy báo cáo qua log/feed/export.
7. Hết Subscription vẫn hoàn tất case mở hợp lệ; case mới sau expiry tiếp tục bị chặn.
8. Double-submit/retry storage không nhân đôi version/event/audit. Lỗi quota/recovery/cleanup giữ đúng trạng thái và bản đã commit qua reload, không gửi lại command khi chỉ thử lưu.
9. Closed từ chối mọi ghi; đóng không tạo feedback. Reports/KPI đếm đúng khi case nhiều alert hoặc nhiều phiên bản.
10. Rời form có nội dung chưa gửi được xử lý rõ; draft không lẫn giữa case/user hoặc bị khôi phục trên bản đã hết hiệu lực.
11. Loading trắng đúng khung dashboard, responsive/focus/reduced-motion phù hợp; không ảnh hưởng theme các trang khác.

Chạy tuần tự `npm run check` rồi `npm run build`. Không chạy dev và build cùng `.next` đồng thời. Kiểm thử browser cô lập luồng chính, nhánh bổ sung, tự điều tra, reload, đổi role, vi/en, light/dark và mobile. Mô phỏng lỗi storage qua StorageLike nếu browser tool không cho chèn lỗi; phân biệt bằng chứng test và browser, không tuyên bố thao tác chưa làm.

## 9. Bước dọn cuối đã thống nhất, chưa thực hiện trong Phase 2B

Người dùng đã chốt: khi hoàn thiện, bỏ thanh demo WF-04 và mục “Hồ sơ lưu trữ cũ” khỏi giao diện Operator. Không đề xuất giữ các mục này trong luồng sử dụng chính.

Trong đợt này ghi hai việc đó thành checklist dọn cuối trong task.md, kèm yêu cầu sao lưu/chuyển đổi dữ liệu cần giữ trước khi bỏ. Không xóa case/báo cáo mới hoặc case Closed. Không tự xóa localStorage để dọn UI. Việc tạm giữ công cụ demo lúc kiểm thử không thay đổi quyết định bỏ ở bước hoàn thiện.

## 10. Bàn giao

Tạo `docs/wf04-phase2b-report.md` gồm file thay đổi, commands/handler/UI mapping, quyền từng actor, cách giữ draft/version, persistence/retry, nội dung loading đã sửa, test/build và bằng chứng browser. Liệt kê giới hạn còn lại, không gọi feedback là đã hoàn thành.

Cập nhật docs/task.md đúng phần đã nghiệm thu; không tích toàn WF-04 khi feedback/dọn cuối còn chờ. Thêm checklist dọn cuối theo mục 9 nếu chưa có.

Dừng sau Phase 2B và loading để review. Không tự làm feedback, retraining, tích hợp BE/AI hoặc bước xóa các mục demo/legacy khỏi UI.
