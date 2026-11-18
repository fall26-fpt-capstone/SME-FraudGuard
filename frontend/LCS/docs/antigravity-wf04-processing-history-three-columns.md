# Chỉnh bảng lịch sử xử lý còn ba cột

Yêu cầu mới nhất của người dùng thay thế cấu trúc năm cột trong docs/antigravity-wf04-processing-history-table.md. Thực hiện trên bảng Lịch sử xử lý trong modal chi tiết case hiện có, không xây lại bảng hoặc workflow.

Làm trong D:/SME-FraudGuard/frontend/LCS. Đọc AGENTS.md và quy chuẩn UI hiện hành; kiểm tra git status/diff, bảo toàn mọi thay đổi của nhóm. Không reset/restore/stash, không tự commit/push hoặc thêm dependency.

## Bố cục chính xác

Bảng chỉ có ba cột theo thứ tự:

| Tiếng Việt | Tiếng Anh | Nội dung |
| --- | --- | --- |
| Sự kiện | Event | Tên sự kiện nghiệp vụ, giữ phiên bản nếu thuộc tên sự kiện như “Gửi báo cáo v1”. |
| Thực hiện bởi | Performed by | Người trực tiếp thực hiện sự kiện, lấy từ evt.actor qua helper hiển thị hiện có. |
| Ngày/giờ | Date/time | Gộp ngày và giờ của evt.at trong một ô, ví dụ 16/11/2026 09:10:00; định dạng theo locale đang chọn. |

- Bỏ cột “Người đảm nhận” và “Trạng thái sau sự kiện” khỏi bảng này.
- Chuyển dòng phụ “Thực hiện bởi: …” đang nằm dưới tên sự kiện sang cột riêng, không hiển thị lặp lại.
- Tuyệt đối không dùng evt.assignee hoặc người phụ trách hiện tại thay cho evt.actor. Ví dụ phân công do Lê Minh Quân thực hiện cho Phạm Bảo Châu thì cột Thực hiện bởi phải là Lê Minh Quân; gửi báo cáo do Phạm Bảo Châu thực hiện thì hiển thị Phạm Bảo Châu.
- Gộp hai cột Ngày và Giờ thành một cột Ngày/giờ. Không thêm cột thời lượng. Không hiện mili giây, nhưng giữ timestamp đầy đủ khi sắp xếp; giữ thứ tự ổn định khi trùng thời điểm.
- Giữ ghi chú/lý do bổ sung khi có. Nếu dùng hàng chi tiết trải rộng bảng thì sửa colSpan thành 3. Không để hàng trống hoặc khoảng trống từ cột đã xóa.
- Giữ thông tin người phụ trách và trạng thái hiện tại tại phần thông tin hồ sơ hiện có; chỉ bỏ khỏi bảng lịch sử, không xóa dữ liệu lịch sử/domain/storage.

## Giao diện và phạm vi

Giữ bảng gọn, đường phân cách hiện tại và chiều rộng modal đã được chỉnh. Cột sự kiện ưu tiên không gian; tên người và ngày/giờ dễ đọc, xuống dòng khi cần. Điều chỉnh CSS/min-width của bảng năm cột cũ để bảng ba cột không còn cuộn ngang không cần thiết. Kiểm tra 375/768/1440px, VI/EN, light/dark; nếu cần cuộn ngang thì chỉ cuộn trong vùng bảng, không tràn cả trang.

Giữ useDialogFocus, nút đóng, nháp báo cáo và lớp chồng AlertCaseDrawer. Không sửa quyền, vòng đời case, báo cáo, feedback, dữ liệu mẫu, TechPay hoặc WF-01. Không khôi phục preview version trong danh sách My Cases của Investigator.

## Kiểm chứng và bàn giao

- Kiểm tra header có đúng ba cột; hàng dữ liệu căn đúng cột, không lặp người thực hiện dưới sự kiện.
- Kiểm tra tạo case, phân công, Operator tự điều tra, gửi báo cáo, yêu cầu bổ sung và đóng case: cột người thực hiện lấy actor đúng, không nhầm assignee.
- Kiểm tra ghi chú dài, tên dài, lịch sử rỗng và ngày/giờ. Cập nhật test UI/projection hiện có nếu kỳ vọng thay đổi; giữ nguyên test domain và lưu trữ.
- Chạy npm run check rồi npm run build tuần tự, tránh xung đột .next với dev server của người dùng. Không tự tắt server của người dùng.
- Kiểm tra trình duyệt và chụp bảng sau sửa để review. Báo rõ phần chưa kiểm chứng nếu có, không gọi Node/SSR test là browser E2E.
- Cập nhật docs/wf04-processing-history-table-report.md theo cấu trúc ba cột mới và kết quả thực tế. Dừng để review.
