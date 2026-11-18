# Dữ liệu mẫu để thử WF-04 (chỉ bật trong môi trường cho phép + yêu cầu rõ ràng)

Sau đợt dọn cuối UI WF-04 và bản sửa điều kiện bật công cụ mẫu ngày 18/11/2026, giao diện vận hành chính (`AlertsView`, `CasesView`, `ReportsView`) **không hiển thị** thanh công cụ mẫu (`Kịch bản mẫu WF-04`), các nút nạp/bổ sung/khôi phục mẫu hay mục `Hồ sơ lưu trữ cũ`, và cũng **không tự động nạp dữ liệu mẫu** khi mở hoặc tải lại trang (`0` auto-load).

Trong bản build production thông thường (không đặt cờ cho phép lúc build), công cụ dữ liệu mẫu và helper `window.__fgWf04DevTools` **luôn bị vô hiệu hóa**, bất kể URL query hay khóa `localStorage`.

## 1. Điều kiện hai lớp để mở công cụ mẫu (`resolveWf04DevToolsEnabled`)

`src/data/wf04-demo.ts` và `src/components/fraudguard-dashboard/FraudGuardDashboard.tsx` dùng chung một điều kiện kích hoạt thống nhất cho cả UI bar (`data-testid="wf04-dev-sample-tools"`) lẫn helper `window.__fgWf04DevTools`:

1. **Điều kiện môi trường được phép (`isWf04DevToolsEnvironmentAllowed`):**
   - Chạy ở chế độ phát triển (`NODE_ENV === "development"`, ví dụ `npm run dev`), **hoặc**
   - Bản build chạy kiểm thử được cấu hình rõ ràng lúc build với `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS=true` trước khi chạy `next build`.
   - *Lưu ý cấu hình Next.js:* `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS` là biến cấu hình tại **thời điểm build** được Next.js gộp vào bundle client. Bản production bình thường không bật biến này trong `npm run build`; nếu từng build thử với biến môi trường bật, phải build lại bản mặc định không có biến trước khi phát hành.
2. **Yêu cầu bật rõ ràng trên trình duyệt (`isWf04DevToolsExplicitlyRequested`):**
   - Mở đường dẫn kèm query parameter: `/fraud-monitoring?wf04Dev=1` (chỉ có hiệu lực khi URL đang chứa `?wf04Dev=1`), **hoặc**
   - Trong môi trường được phép ở bước 1, chạy `localStorage.setItem("fg_wf04_dev_tools", "1")` trong DevTools Console rồi tải lại trang.

*Giới hạn bảo mật:* Query `?wf04Dev=1` và khóa `localStorage` chỉ là **công tắc bật/tắt UI thử nghiệm ở phía client**, tuyệt đối **không phải** ranh giới bảo mật hay cơ chế phân quyền backend (`src/services/` hiện vẫn chỉ giữ `.gitkeep`).

## 2. Thao tác bật/tắt UI mẫu và helper `window.__fgWf04DevTools`

- **Qua thanh công cụ mẫu (`data-testid="wf04-dev-sample-tools"`):** khi cả 2 điều kiện ở Mục 1 đều đúng, phía trên vùng nội dung chính hiển thị nút **Mở kịch bản demo WF-04** (`loadDemoBtn`); khi đã kích hoạt (`wf04DemoActive`), thanh này hiển thị **Bổ sung hồ sơ mẫu** (`addReviewSamplesBtn`) và **Khôi phục dữ liệu trước demo** (`restorePreviousBtn`).
- **Qua DevTools Console (`window.__fgWf04DevTools`):** helper chỉ được đăng ký khi công cụ mẫu thực sự bật (`syncWf04DevToolsWindowBinding`), gồm `loadSampleData()`, `restorePreDemo()` và `isDemoActive()`. Khi tắt chế độ hoặc unmount component, helper bị xóa khỏi `window` và mọi tham chiếu callback cũ bị vô hiệu hóa.
- **Tắt công cụ:** bỏ `?wf04Dev=1` khỏi URL và chạy `localStorage.removeItem("fg_wf04_dev_tools")` rồi tải lại trang. Việc tắt công cụ chỉ ẩn thanh điều khiển và gỡ `window.__fgWf04DevTools`, **không xóa** dữ liệu case, báo cáo, feedback hay `preDemoSnapshot` đã tạo.

## 3. Bộ tài khoản và hồ sơ mẫu (`CASE-SAMPLE-*`)

Chuyển tài khoản qua menu chọn người dùng ở đầu trang (`ProductHeader`) để kiểm thử theo từng vai trò:

| Tài khoản | Vai trò | Hồ sơ / thao tác thử |
| --- | --- | --- |
| Lê Minh Quân | Operator | `CASE-SAMPLE-REVIEW`: duyệt hoặc yêu cầu bổ sung báo cáo |
| Phạm Bảo Châu | Investigator | `CASE-SAMPLE-WORKING`: nhập kết quả, bằng chứng và gửi báo cáo |
| Võ Thảo Vy | SME Admin | Báo cáo & Hiệu suất -> `CASE-SAMPLE-CLOSED` -> Gửi phản hồi |
| Lê Hoàng Phúc | Platform Admin | Tình trạng hệ thống -> xem feedback sau khi SME Admin gửi |

Chi tiết bộ dữ liệu mẫu trong `src/data/wf04-demo.ts`:

- Toàn bộ `CASE-SAMPLE-*` thuộc doanh nghiệp `Campus PowerGrid SME` (`ent-wf04-campus`).
- `CASE-SAMPLE-CLOSED` liên kết 2 AI Alert (`ALT-WF04-REVIEW-1`: `Bơm nước khu A chạy ban đêm` theo bảo trì hợp lệ; `ALT-WF04-REVIEW-2`: `HVAC khu A vượt lịch vận hành` ngoài lịch) với 2 kết quả và bằng chứng khác nhau. Hồ sơ đã có sẵn báo cáo `v1` và kết luận xác nhận nhưng chưa có feedback, giúp SME Admin tự xem trước, thêm nhận xét tùy chọn và xác nhận gửi.
- `CASE-SAMPLE-REVIEW` liên kết `ALT-WF04-REVIEW-3` (`Điện phòng máy tăng cuối tuần`, trạng thái `Pending Review`) và `CASE-SAMPLE-WORKING` liên kết `ALT-WF04-REVIEW-4` (`Chiếu sáng thư viện ngoài giờ`, trạng thái `Investigating`).
- Gói demo cũng bao gồm tenant `North Branch Utilities` (`ent-wf04-branch`, kiểm tra cô lập tenant) và `Dormitory Grid Archive` (`ent-wf04-expired` hết hạn Subscription kèm `CASE-WF04-EXP-01` để kiểm thử case mở trước hạn vẫn xử lý được trong khi tạo case mới bị chặn).

## 4. Chính sách bảo toàn dữ liệu và lưu ý giả lập

- Các hồ sơ mẫu được tạo qua hàm domain thật (`createInvestigationCase`, `assignInvestigatorToCase`, `submitInvestigationReport`, `confirmInvestigationCaseReport`), dùng mã định danh riêng và có đầy đủ lịch sử xử lý.
- Thao tác nạp lại chỉ bổ sung các ID chưa tồn tại (`mergeUniqueBy`, `mergeUniqueFeedbacks`), không ghi đè case, phiên bản báo cáo, kết luận hay `reportFeedbacks` người dùng đã tạo/thay đổi, và giữ nguyên `legacyCaseArchive`, recovery journal cùng `preDemoSnapshot` (tuyệt đối không xóa `localStorage`).
- Toàn bộ tài khoản, giao dịch điện năng, cảnh báo, hồ sơ và phản hồi đều là **dữ liệu giả lập cục bộ trên trình duyệt**, không phải suy luận AI thật hay kết quả điều tra thực tế.
