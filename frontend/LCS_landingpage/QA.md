# Kiểm tra landing page FraudGuard

Ngày kiểm tra: 23/10/2026. Phiên bản hiện tại tái cấu trúc bố cục theo phong cách trang sản phẩm Base Workflow, bổ sung nền pastel, hiệu ứng chuyển cảnh khi click, cùng toàn bộ chuỗi hiệu ứng khi tải lại trang (Reload Sequence) và 6 nhóm hiệu ứng khi cuộn trang (Scroll-Triggered Animations 1–6) theo tham chiếu LawShield, đồng thời thống nhất thuật ngữ trên toàn hệ thống (loại bỏ hoàn toàn thuật ngữ `risk score` / `AI scoring` / `chấm điểm`, sử dụng phân loại trực tiếp `Abnormal / Normal / Undetermined`, `AI Detection`, `Dynamic Rule Engine`, `RULE_FALLBACK`).

## Kết quả thực thi

| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| Production build và TypeScript | PASS | `npm run build` hoàn thành với mã thoát 0; trang chủ được prerender tĩnh. |
| Không dùng em dash & thuật ngữ cũ | PASS | Kiểm tra toàn bộ văn bản hiển thị (`document.body.innerText`) không chứa ký tự `—` và không chứa `scoring`, `risk score`, `chấm điểm`. |
| Responsive (R-03) | PASS | Không tràn ngang tại 11 độ rộng: 320, 360, 390, 540, 700, 768, 900, 1024, 1280, 1440, 1920px. |
| Giao dịch mẫu tại Hero | PASS | Bấm đủ 3 giao dịch (`TX-83912`, `TXN-20260917-002`, `TXN-20260917-004`); kết quả `Abnormal`, bằng chứng và nhãn nguồn `AI` / `RULE_FALLBACK` / `RULE` cập nhật đúng. |
| Chuyển bước quy trình tại Hero | PASS | Bấm đủ 4 tab bước (`1 Tiếp nhận`, `2 Phân công`, `3 Điều tra`, `4 Kết luận`) và nút chuyển tiếp; thanh trạng thái cập nhật từ `01/04` đến `04/04`. |
| Màn hình Hồ sơ trung tâm (Hub) | PASS | Bấm đủ 4 nút pill và nút chuyển bước tiếp theo/quay lại đầu; trạng thái `Open -> Assigned -> Reported -> Confirmed Fraud` và thẻ vệ tinh nổi bật đúng theo bước. |
| Nguồn đánh giá 3 cột (`#co-che`) | PASS | Bấm đủ 3 lựa chọn (`AI`, `RULE`, `RULE_FALLBACK`); cột trung tâm cập nhật màu nền pastel, tiêu đề, mô tả và tín hiệu đầu ra tương ứng. |
| Phân quyền 5 vai trò (RBAC) | PASS | Bấm đủ 5 nút pill trên thanh chuyển vai trò (`Platform Admin`, `Implementation Staff`, `SME Admin`, `Operator`, `Investigator`); vùng minh họa và danh sách nhiệm vụ cập nhật đúng. |
| Giải đáp (FAQ) | PASS | Mở đủ 4 câu bằng click chuột, đóng lại bằng phím `Enter`. |
| Điều hướng trong trang | PASS | Mọi liên kết neo (`#tinh-nang`, `#ho-so`, `#co-che`, `#vai-tro`, `#goi-su-dung`, `#giai-dap`, `#main`) có đích duy nhất và điều hướng chính xác. |
| Liên kết mở bản demo | PASS | 4 liên kết CTA trỏ đúng tới `http://localhost:3000/fraud-monitoring`. |
| Menu mobile | PASS | Mở/đóng tại viewport 390x844, tự đóng sau khi chọn mục điều hướng và đóng bằng phím `Escape`. |
| Bàn phím & Focus | PASS | Skip link hoạt động; phím `Space` chọn giao dịch; đường viền focus hiển thị rõ. |
| Phóng to 200% | PASS | Kiểm tra effective viewport 390px với `deviceScaleFactor: 2`; không tràn ngang. |
| Hiệu ứng Reload & Cuộn trang (1–6) | PASS | Kiểm tra thanh điều hướng thu gọn khi cuộn (`1240px` -> `1080px` khi `scrollY > 24`), 8/8 vùng `[data-scroll-section]` và 31/31 khối `[data-reveal]` riêng lẻ kích hoạt hiệu ứng chạy từ ngoài vào trong (`slide-left`, `slide-right`) và xuất hiện từ mờ nhòe sang rõ nét (`fade-blur`, `zoom-in`, `fade-up`) khi cuộn tới mà không gây tràn ngang. |
| Tương phản chữ (WCAG AA) | PASS | Tính luminance từ CSS trên 323 phần tử chữ hiển thị ở nền sáng/pastel; 0 phần tử vi phạm ngưỡng AA (4.5:1 cho chữ thường, 3:1 cho chữ lớn). |
| Console trình duyệt | PASS | Không có console error hoặc uncaught JavaScript error trên landing page. |
| Kiểm tra hình ảnh | PASS | Đã chụp và kiểm tra trực tiếp `tmp/desktop-hero.png`, `tmp/story.png`, `tmp/desktop-final.png`, `tmp/mobile-hero.png`, `tmp/mobile-final.png`. |

## Antislop Delivery Gate

### Hard Gate

- R-02 PASS: Không sử dụng em dash (`—`) trong văn bản giao diện.
- R-03 PASS: Kiểm tra 11 độ rộng từ 320px đến 1920px; không tràn ngang.
- R-17 PASS: Toàn bộ giao dịch, mã hồ sơ và doanh nghiệp (`ABC Fashion`, `TechPay`, `EduLearn`) được gắn nhãn dữ liệu mẫu rõ ràng.
- R-18 PASS: Không có lời chứng thực (testimonial), tên khách hàng bịa đặt hoặc logo đối tác giả.
- R-23 PASS: Bố cục theo phong cách Base Workflow kết hợp bảng màu sáng/pastel và CSS thẻ của `LCS_landingpage` theo yêu cầu người dùng.
- R-24 PASS: Tất cả liên kết trên thanh điều hướng đều dẫn tới section thực tế trên trang.
- R-25 PASS: 323 phần tử chữ hiển thị đạt chuẩn tương phản WCAG AA.
- R-26 PASS: Mọi nút bấm, tab chuyển cảnh, pill chọn vai trò và mục hỏi đáp đều có hành vi thực tế và đã được kiểm tra click-through tự động.
- R-27 PASS: Dữ liệu mẫu tĩnh nằm sẵn trong trang; không dựng trạng thái xử lý AI giả.
- R-28 PASS: Nội dung giải đáp bám sát cơ chế phân loại `Abnormal / Normal / Undetermined`, phân quyền 5 vai trò và cơ chế `RULE_FALLBACK`.
- R-32 PASS: Sử dụng phần tử HTML ngữ nghĩa (`button`, `a`, `details`, `summary`, `table`), hỗ trợ đầy đủ `Tab`, `Enter`, `Space`, `Escape` và skip link.
- R-33 PASS: Cập nhật trực tiếp mã nguồn `Landing.tsx` và `landing.module.css`.
- R-34 PASS: Giữ cố định bảng màu sáng/pastel theo yêu cầu của người dùng.
- R-35 PASS: Đã chạy `npm run build`, khởi động lại server trên cổng 3001, chạy `node tmp/verify.cjs` trên trình duyệt thực và kiểm tra ảnh chụp màn hình.
- R-36 PASS: Không thêm số liệu cam kết hiệu quả hoặc chứng chỉ bảo mật không có nguồn.
- R-37 PASS: Người dùng đã duyệt phương án thiết kế và nội dung trước khi thực hiện.
- R-38 PASS: Ghi rõ phạm vi bản demo sử dụng dữ liệu mẫu của dự án.

### Purpose Gate & Quality Locks

- R-01, R-04, R-06, R-07, R-08, R-09, R-10, R-11, R-12, R-13, R-14, R-15, R-16, R-19, R-20, R-21, R-22, R-29, R-30, R-31 PASS: Lý do thiết kế từng hạng mục được ghi rõ tại `README.md`.
