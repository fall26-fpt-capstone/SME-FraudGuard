# TechPay Admin demo: Dự án và tích hợp

Ngày kiểm tra: 18/11/2026. Rà soát mã nguồn, chưa nghiệm thu trình duyệt hoặc kết nối thật.

- `src/data/fraudguard-enterprises.ts`: tenant-techpay liên kết hai projectIds proj-wallet và proj-checkout.
- `src/data/fraudguard-projects.ts`: Mobile Wallet và Checkout Gateway là hai ProjectItem riêng, cả hai có environment Production. Chúng không phải hai môi trường Production/Staging.
- `FraudGuardDashboard.tsx`, nhánh projects: lọc dự án theo projectIds của doanh nghiệp đang được phép xem. Vì TechPay có hai ID nên trang hiển thị hai mục; không phải UI tự tạo thêm nguồn.
- `ProjectsView.tsx`: đã chặn tạo thêm phạm vi nếu doanh nghiệp có projectIds, nhưng vẫn render hướng dẫn tích hợp cho từng dự án cũ, đếm cả hai vào KPI và hiển thị các bản ghi riêng. Có dòng giải thích dự án cũ được giữ để đối chiếu, nhưng chưa có cách thể hiện một phạm vi triển khai chính thống nhất.
- Mỗi ProjectItem mẫu có API key và webhook riêng. Đây là cấu hình giả lập frontend, không chứng minh có hai tích hợp backend đang chạy.
- Giao dịch mẫu vẫn tham chiếu cả hai ID trong fraudguard-transactions.ts. Không được xóa/gộp ID tùy tiện hoặc xóa localStorage để trang chỉ còn một mục.

## Điểm cần xử lý tiếp

Proposal quy định một phạm vi triển khai chính và một bộ cấu hình phát hiện cho mỗi doanh nghiệp. Hai hệ thống nguồn không tự động đồng nghĩa hai bộ cấu hình, nhưng UI hiện vẫn trình bày theo hai dự án riêng và giữ hướng dẫn tích hợp riêng. Cần chốt cách biểu diễn phạm vi chính TechPay và các tham chiếu nguồn cũ trước khi chuyển đổi dữ liệu.

Đề xuất: phần chính trình bày một phạm vi triển khai của TechPay; các nguồn/ID cũ giữ để truy vết giao dịch, không xem như hai phạm vi mới. Việc hợp nhất key, endpoint, mapping và dữ liệu lưu cần phương án riêng khi contract được chốt; không giả định chỉ đổi tên hoặc ẩn một thẻ là đã hoàn tất.

Đợt này chỉ kiểm tra TechPay theo yêu cầu, chưa thay dữ liệu/cấu hình tích hợp. Các chỉnh sửa UI cùng đợt chỉ gồm ẩn preview phiên bản báo cáo trong danh sách My Cases của Investigator và rút gọn lịch sử xử lý trong popup case.
