# WF-04: bảng lịch sử xử lý trong modal case

## Yêu cầu người dùng

“List nhỏ” nghĩa là bảng gọn có các field: sự kiện, tên người đảm nhận, trạng thái, ngày và giờ. Bản Codex vừa đổi các thẻ thành dòng có đường phân cách chưa đúng bố cục mong muốn. Hãy thay phần Processing History/Lịch sử xử lý trong popup chi tiết case thành bảng cột rõ ràng. Có thể tăng chiều rộng modal để vừa bảng.

Làm trong D:/SME-FraudGuard/frontend/LCS. Đọc AGENTS.md, README.md, docs/ui/UI_RULES.md, docs/ui/DESIGN_SYSTEM.md và code hiện tại. Kiểm tra git status/diff; bảo toàn thay đổi của người dùng và Codex. Không reset/restore/stash, không tự commit/push, không thêm dependency.

## 1. Cấu trúc bảng

Tái sử dụng dữ liệu c.history và helper hiện có trong CasesView.tsx. Dùng table/thead/tbody/th có ngữ nghĩa, mỗi sự kiện một hàng. Cột theo thứ tự:

1. **Sự kiện / Event**: tên nghiệp vụ đã dịch, ví dụ tạo hồ sơ, phân công, gửi báo cáo v1, yêu cầu bổ sung, xác nhận và đóng.
2. **Người đảm nhận / Assignee**: người phụ trách tại thời điểm sự kiện. Tái dựng từ lịch sử phân công trước đó; khi phân công dùng evt.assignee, nhánh Operator tự đảm nhận dùng dữ liệu sự kiện tương ứng. Nếu chưa có người phụ trách hoặc không đủ dữ liệu thì hiển thị “Chưa phân công” hoặc “—”, không đoán và không lấy assignee hiện tại áp cho toàn bộ lịch sử.
3. **Trạng thái sau sự kiện / Status after event**: trạng thái đúng tại mốc đó. Dùng dữ liệu trạng thái lịch sử nếu có; nếu không, ánh xạ từ loại sự kiện theo state machine thật: tạo → Open, phân công/tự đảm nhận → Investigating, gửi báo cáo → Pending Review, yêu cầu bổ sung → Investigating, xác nhận đóng → Closed. Với loại sự kiện khác, kiểm tra domain, không mặc định Closed hoặc đoán. Không ghi trạng thái hiện tại của case lên mọi hàng cũ.
4. **Ngày / Date**: ngày của evt.at, hiển thị theo locale hiện tại.
5. **Giờ / Time**: giờ của evt.at, hiển thị dễ đọc (giờ:phút:giây), không hiện mili giây trong bảng.

Người thực hiện evt.actor có thể khác người đảm nhận, ví dụ Operator yêu cầu bổ sung cho Investigator. Giữ thông tin này bằng dòng phụ “Thực hiện bởi: …” dưới tên sự kiện để không mất khả năng truy vết. Không gán nhầm Operator thành Investigator phụ trách.

Trạng thái hiện tại của toàn case vẫn được hiển thị trong phần thông tin hồ sơ phía trên bảng. Nhãn “Trạng thái sau sự kiện” giúp tránh nhầm trạng thái lịch sử với trạng thái hiện tại.

Giữ lý do yêu cầu bổ sung và ghi chú. Nội dung dài có thể đặt trong hàng chi tiết bên dưới hoặc mục mở rộng ngay tại hàng, có nút/summary rõ ràng và dùng được bằng bàn phím; không bỏ dữ liệu và không ép thành tooltip chỉ xem được bằng chuột.

Giữ thứ tự lịch sử theo timestamp đầy đủ và quy ước domain; không cắt mili giây trước khi sort. Sự kiện trùng thời điểm giữ thứ tự ổn định theo lịch sử gốc. Không sửa timestamp nguồn chỉ để hiển thị đẹp.

## 2. Bố cục modal

- Tăng chiều rộng riêng modal chi tiết case, đề xuất tối đa khoảng 1000–1100px trên desktop, giới hạn theo viewport. Không đổi builderModal chung khiến mọi popup khác rộng theo.
- Bảng gọn với header, hàng phân cách mảnh, tên và nội dung tự xuống dòng. Không tiếp tục render từng sự kiện thành card riêng.
- Mobile/tablet: modal vừa viewport, bảng có vùng cuộn ngang riêng khi cần; không làm trang tràn ngang. Cuộn dọc trong modal, nút đóng luôn có thể tiếp cận.
- Dùng CSS Modules/token hiện có, VI/EN, light/dark. Không thêm thư viện bảng.
- Giữ useDialogFocus, Escape, trả focus và cảnh báo nháp chưa lưu.
- Giữ sửa chồng lớp alertInspectionOverlay (52)/alertInspectionDrawer (53) trên case overlay (50). Mở “Xem cảnh báo” phải nằm trên modal dù modal được tăng rộng; đóng drawer trở về case và giữ nháp.

## 3. Giới hạn thay đổi

Chỉ thay cách trình bày lịch sử xử lý và chiều rộng modal case liên quan. Không thay state machine, quyền/tenant, storage, report/feedback hoặc dữ liệu mẫu. Nếu cần helper tạo hàng hiển thị từ lịch sử, dùng projection thuần có test phù hợp; không tạo model lưu trữ mới.

Giữ chỉnh sửa Codex đã làm: danh sách My Cases của Investigator không hiện preview version/báo cáo dưới mã case; lịch sử báo cáo trong popup vẫn còn. Không làm lại Phase 2C, công cụ mẫu, loading UI hoặc dọn UI đã xong.

Không xử lý TechPay/Checkout Gateway/Mobile Wallet hay triển khai WF-01 trong đợt này.

## 4. Kiểm chứng và bàn giao

- Case Open chưa phân công, case do Investigator thực hiện, case Operator tự điều tra, case bị trả v1 rồi gửi v2, case Closed: mỗi hàng có đúng người đảm nhận và trạng thái lịch sử; phân biệt actor và assignee.
- Tên dài, ghi chú/lý do dài, lịch sử rỗng, timestamp có mili giây và các sự kiện trùng thời điểm không phá bố cục hoặc sai thứ tự.
- Browser: VI/EN, light/dark, 375/768/1440px, bàn phím; mở/đóng drawer từ case và giữ nháp. Lưu screenshot bảng trên desktop và mobile để người dùng review.
- Chạy npm run check rồi npm run build tuần tự. Lượt trước build gặp lỗi thiếu .next/types khi dev server dùng chung .next đang chạy; kiểm tra và tránh xung đột, không tự tắt dev server của người dùng hoặc xóa dữ liệu. Ghi đúng giới hạn nếu không chạy được build/browser.
- Tạo docs/wf04-processing-history-table-report.md: file sửa, các cột thực tế, cách xác định actor/assignee/status, kết quả test/build/browser và ảnh minh chứng. Dừng để review sau đợt này.
