# Bàn giao Antigravity: dọn cuối UI WF-04

## 1. Làm tiếp từ trạng thái hiện có

Làm trong `D:\SME-FraudGuard\frontend\LCS`. Người dùng yêu cầu Antigravity tiếp tục phần còn lại, không làm lại phần Codex đã hoàn thành. Đọc AGENTS.md, README.md, docs/ui/UI_RULES.md, docs/ui/DESIGN_SYSTEM.md, docs/task.md, docs/wf04-phase2c-report.md và docs/wf04-sample-data.md trước khi sửa.

Kiểm tra git status/diff trước. Workspace có nhiều thay đổi chưa commit của cả Antigravity và Codex. Không reset, restore, stash, ghi đè hoặc format hàng loạt. Không tự commit/push. Prompt này tiếp nối sau Phase 2C, thay điểm dừng cũ trong prompt Phase 2C bằng phạm vi dọn UI dưới đây.

## 2. Phần Codex đã làm: giữ nguyên, không triển khai lại

- Hoàn tất Phase 2C: SME Admin chủ động gửi bản báo cáo/kết luận đã xác nhận; Platform Admin chỉ xem snapshot đã gửi. Model, coordinator, persistence/recovery, quyền và test đã có. Xem báo cáo Phase 2C để biết chi tiết, không dựng lại luồng feedback.
- Thêm dữ liệu thử trong src/data/wf04-demo.ts: CASE-SAMPLE-CLOSED, CASE-SAMPLE-REVIEW, CASE-SAMPLE-WORKING và 4 alert liên quan. Không nhân đôi bộ mẫu hoặc làm mất case/báo cáo/feedback người dùng đã tạo. Xem docs/wf04-sample-data.md.
- Sửa lỗi bấm “Xem cảnh báo” trong popup case nhưng drawer bị case che: AlertCaseDrawer.tsx dùng thêm styles.alertInspectionOverlay và styles.alertInspectionDrawer; SecurityDashboard.module.css đặt hai lớp lần lượt z-index 52 và 53, trên builderOverlay 50. Không tăng z-index toàn bộ drawer/modal hoặc thay lại cơ chế này khi chưa có lỗi tái hiện cụ thể.
- Giữ Case modal mounted khi mở alert để không mất nháp; giữ useDialogFocus. Drawer được render sau nội dung case trong FraudGuardDashboard. Không tự đóng case để né lỗi chồng lớp.
- Loading UI nền trắng theo bố cục dashboard đã có; không làm lại.

Kết quả kiểm tra sau sửa lớp hiển thị: npm run check đạt 157/157 test, lint/typecheck đạt; npm run build đạt, 6/6 trang tĩnh. Trình duyệt desktop/light/EN đã thấy drawer ở trên case, focus nằm trong drawer (z-index 53 so với modal 51 trong overlay 50). Phiên trình duyệt bị mất giữa lượt làm việc, nên chưa xác minh xong Escape/Tab, giữ nháp và các kích thước/theme cho bản sửa này. Đó là kiểm thử hồi quy còn cần làm, không phải yêu cầu viết lại phần đã sửa. Chạy lại các lệnh trên trạng thái code thực tế của bạn, không sao chép kết quả cũ thành kết quả mới.

## 3. Bước 1: sửa thông báo sai ngữ cảnh trong AlertCaseDrawer

Hiện nhánh linkedCase && canViewLinkedCase vẫn hiển thị t.wf04Phase2a.legacy.legacyReadOnlyNotice. Vì vậy case WF-04 mới cũng bị gọi là “Hồ sơ cũ từ giai đoạn trước... Phase 2A”.

- Với case WF-04 hợp lệ: bỏ thông báo legacy, hoặc dùng câu nghiệp vụ đúng như “Xem và xử lý hồ sơ tại chi tiết hồ sơ.” Giữ nút Xem hồ sơ khi có quyền. Drawer cảnh báo vẫn không cho sửa các trường case legacy.
- Với dữ liệu cũ thực sự: giữ chế độ chỉ đọc và bảo toàn dữ liệu; nếu còn thông báo ở nơi được phép xem thì dùng câu dễ hiểu, không nhắc Phase 2A hay giai đoạn lập trình.
- Giữ trạng thái Closed và kết luận tách biệt; không bật lại đường đóng case trực tiếp trong drawer.
- Cập nhật VI/EN đồng bộ; thêm kiểm thử phân biệt case WF-04 mới với bản ghi legacy thực sự nếu phù hợp với harness hiện có.

## 4. Bước 2: gỡ phần tạm khỏi UI vận hành

Người dùng đã chốt: sau hoàn thiện WF-04 phải gỡ thanh “Kịch bản mẫu WF-04”, nút khôi phục demo đi kèm và mục “Hồ sơ lưu trữ cũ” khỏi UI vận hành chính của Operator. Không đề xuất giữ chúng trên trang chính.

- Rà soát AlertsView, CasesView, FraudGuardDashboard và các caller thực tế; bỏ thanh/banner demo, các nút nạp/bổ sung/khôi phục mẫu khỏi UI vận hành chính. Không chuyển các nút đó thành một banner mới ở trang khác.
- Người dùng vẫn cần dữ liệu ảo để thử. Giữ fixtures và helper nạp/backup/restore phục vụ kiểm thử; tách truy cập công cụ mẫu qua chế độ phát triển bật rõ ràng, mặc định tắt, có hướng dẫn trong docs/wf04-sample-data.md. Không tự nạp mẫu khi mount/reload và không tạo endpoint giả. Ưu tiên cơ chế dev-only đã có nếu phù hợp; không thêm package.
- Gỡ LegacyCaseArchiveSection khỏi UI Operator. Không xóa collection legacyCaseArchive, backup, recovery journal hay dữ liệu lưu trữ chỉ để mục đó biến mất.
- Kiểm tra không còn liên kết/menu/toast dẫn tới mục UI đã gỡ; không đổi các chỉ số case hiện đại thành số alert.

## 5. Bước 3: bảo toàn dữ liệu và dọn caller có giới hạn

- Trước thay đổi dữ liệu, xác định migration/backup hiện có và kiểm chứng bằng workspace kiểm thử. Nếu chỉ dọn UI, không chạy migration không cần thiết.
- Không xóa localStorage, không reset workspace người dùng, không sửa timestamp để qua guard. Case Closed là hồ sơ được giữ lại, không phải dữ liệu phải xóa khi hoàn tất.
- Giữ nguyên case đang xử lý, các phiên bản báo cáo, kết luận, kết quả riêng từng alert, feedback đã gửi và preDemoSnapshot.
- Rà soát caller của CaseStatus/case-workflow.ts/TransactionRisk.caseStatus. Chỉ gỡ đường UI/helper chết khi chứng minh không còn dùng. Các type/validator phục vụ đọc dữ liệu cũ phải giữ nếu vẫn cần; báo cáo rõ phần còn phụ thuộc, không ép xóa mọi trường legacy trong đợt này.
- Không thêm BE/AI service, retrain, enum nhãn AI hay API giả. src/services vẫn chỉ có .gitkeep.

## 6. Bước 4: kiểm chứng hồi quy

Chạy npm run check rồi npm run build tuần tự, tránh xung đột .next với dev server. Không hạ assertion chỉ để test xanh. Thay kỳ vọng UI cũ đã được yêu cầu bỏ nhưng giữ test migration, bảo toàn dữ liệu và quyền.

Kiểm tra trực tiếp trên trình duyệt với Operator và Investigator:

1. Mở case → Xem cảnh báo: drawer ở trên cả case và lớp nền; nội dung/nút đóng không bị che.
2. Tab/Shift+Tab nằm trong drawer; Escape và nút đóng chỉ đóng drawer, trả focus về nút Xem cảnh báo, giữ case đang mở. Mở/đóng liên tiếp không lỗi khóa cuộn.
3. Đang soạn báo cáo chưa gửi → xem alert → đóng drawer: nội dung nháp và case giữ nguyên. Không submit/discard nháp do mở alert.
4. Xem hai alert khác nhau của cùng case cho đúng nội dung; đổi actor/tenant không lộ nội dung hoặc nháp ngoài quyền.
5. Case mới không còn thông báo legacy/Phase 2A. Operator không còn banner demo hoặc mục Hồ sơ lưu trữ cũ trên UI chính.
6. Reload vẫn giữ case, báo cáo và feedback đã có trước dọn. Không phát sinh feedback khi chỉ xem hoặc đóng case.
7. Kiểm tra nhanh luồng phân công → gửi v1 → yêu cầu bổ sung có lý do → gửi v2 → xác nhận Closed; Operator tự điều tra vẫn gửi và xác nhận thành hai bước.
8. SME Admin xem bản xác nhận và chủ động gửi feedback; PA chỉ thấy bản đã gửi, tenant khác không đọc được. Case đã mở trước hết hạn vẫn tiếp tục, tạo mới khi hết hạn vẫn bị chặn.
9. VI/EN, light/dark, 375/768/1440px: drawer và modal cuộn được, không tràn ngang, không che nút thao tác. Lưu minh chứng và ghi rõ tổ hợp chưa kiểm tra.

Không gọi test Node VM/SSR là browser E2E. Nếu gặp lỗi hồi quy thật thì sửa tối thiểu và ghi nguyên nhân; không viết lại Phase 2A/2B/2C.

## 7. Bước 5: tài liệu và điểm dừng

- Cập nhật docs/task.md theo việc thực sự đã nghiệm thu. Đối soát các dòng cũ còn ghi “Sau Phase 2B / Mục 7.1” mặc dù Phase 2C đã hoàn tất; tách việc frontend đã xong khỏi việc chờ contract BE/AI.
- Tạo docs/wf04-final-cleanup-report.md: file thay đổi, phần giữ nguyên của Codex, UI đã gỡ, đường nạp mẫu dev-only, bảo toàn/migration, legacy dependency còn lại, kết quả check/build/browser và giới hạn.
- Không đánh dấu toàn bộ hệ thống/WF1–WF4 đã xong. Chỉ chốt phần frontend WF-04 có bằng chứng; các việc BE/AI và mapping nhãn còn mở.
- Dừng bàn giao để người dùng review sau đợt dọn UI, không tự chuyển sang triển khai WF khác.
