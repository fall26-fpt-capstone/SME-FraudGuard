# Chỉnh My Cases và rà soát TechPay trước WF-01

Tạm dừng triển khai prompt WF-01 Phase 2A. Làm trong frontend/LCS, đọc AGENTS.md, README.md, docs/ui/UI_RULES.md và docs/ui/DESIGN_SYSTEM.md. Giữ mọi thay đổi chưa commit, không reset/restore/stash/commit/push. Không làm lại WF-04, feedback, công cụ mẫu hay loading UI đã hoàn tất.

## 1. My Cases của Investigator

Người dùng muốn bỏ phần version/review và phần “Xử lý tiếp theo” khỏi danh sách My Cases. Chỉ làm gọn danh sách, không xóa dữ liệu phiên bản hoặc lịch sử báo cáo và không xóa hành động xử lý trong chi tiết hồ sơ.

Code được rà hiện tại: CasesView.tsx hiển thị v{latestRep.version} và rowSummary dưới mã case trong bảng dùng chung. Không thấy cột riêng tên “Xử lý tiếp theo” trong bảng này. Trước sửa, đối chiếu trang Investigator thực tế, nhãn VI/EN và caller đang chạy. Nếu nhãn đó không tồn tại, ghi rõ trong báo cáo, không tự dựng rồi xóa hoặc bỏ nhầm cột Actions/Xem chi tiết.

- Với Investigator: bỏ version/review summary khỏi hàng danh sách; bỏ cột/nội dung “Xử lý tiếp theo” nếu có trên màn hình thực tế.
- Giữ mã case, trạng thái, số alert và thông tin còn lại theo bố cục hiện có; giữ nút Xem chi tiết để mở case.
- Không tự thay đổi bảng Operator hoặc báo cáo SME Admin khi chỉ yêu cầu My Cases.
- Phiên bản báo cáo, xem lại báo cáo, gửi/yêu cầu bổ sung/xác nhận vẫn nằm trong chi tiết theo quyền hiện có.

## 2. Processing history trong popup case

CasesView.tsx hiện dùng caseTimelineList/caseTimelineItem cho c.history nhưng mỗi item được trình bày như một khối riêng. Đổi thành danh sách dòng nhỏ gọn:

- Một sự kiện là một dòng: hành động, người thực hiện, thời gian; thông tin phân công hiển thị người nhận nếu có.
- Dùng khoảng cách nhỏ và đường phân cách nhẹ, không nền/viền/bo góc riêng thành từng card lớn.
- Lý do yêu cầu bổ sung và ghi chú vẫn đọc được dưới dòng tương ứng; nội dung dài xuống dòng, không mất dữ liệu.
- Giữ thứ tự lịch sử hiện tại, ID sự kiện, timestamp đầy đủ và nhãn VI/EN. Không gộp hay xóa sự kiện để danh sách trông ngắn hơn.
- Responsive 375/768/1440px, light/dark; sửa CSS có phạm vi đúng, kiểm tra mọi caller dùng chung class trước khi thay.
- Giữ nguyên focus, draft, cuộn và lớp drawer cảnh báo phía trên case modal.

## 3. TechPay Admin demo: rà soát, chưa tự gộp/xóa nguồn

Người dùng yêu cầu kiểm tra xử lý của hệ thống vì “Dự án và tích hợp” vẫn có Checkout Gateway và Mobile Wallet.

Bằng chứng ban đầu:
- src/data/fraudguard-enterprises.ts: TechPay projectIds gồm proj-wallet và proj-checkout; deploymentScopeNote mô tả một workspace/phạm vi triển khai và một bộ cấu hình.
- src/data/fraudguard-projects.ts: hai bản ghi riêng Checkout Gateway và Mobile Wallet, đều environment Production; đây là hai project/nguồn mẫu, không phải hai environment khác nhau.
- FraudGuardDashboard case projects lọc initialProjects theo enterprise.projectIds, ProjectsView render từng bản ghi và thống kê theo số project.

Đọc proposal và dự thảo workflow tại C:/Users/gmt/Downloads. Proposal nói mỗi doanh nghiệp có một phạm vi triển khai chính và một bộ cấu hình phát hiện; không tự suy ra rằng tài liệu yêu cầu xóa mọi nguồn dữ liệu phụ. Phân biệt yêu cầu tài liệu với mô hình demo đã tự chọn.

Rà lại TechPay từ seed đến persisted workspace: enterprise/project mapping, rule set chính, schema, điều kiện vận hành, API key/webhook hiển thị, counters và quyền SME Admin. Xác định hai nguồn có dùng cùng bộ cấu hình doanh nghiệp hay đang bị trình bày/xử lý thành hai phạm vi cấu hình độc lập. Kiểm tra dữ liệu cũ được restore có giữ seed cũ hay không; không kết luận chỉ từ fixture.

Lập bảng: yêu cầu tài liệu, hành vi UI/code, đúng/chưa đúng/chưa có căn cứ, đề xuất. Không tự xóa/merge project IDs, transaction, API key hoặc localStorage. Nếu cần đổi thành một phạm vi triển khai hiển thị chung hoặc gom nguồn, mô tả phương án và ảnh hưởng dữ liệu để người dùng chốt trước đợt riêng.

## 4. Nghiệm thu và bàn giao

Chạy npm run check rồi npm run build tuần tự. Không hạ kiểm thử nghiệp vụ vì thay UI. Kiểm tra Investigator My Cases và popup thật, mở alert rồi quay lại không mất nháp; kiểm tra Operator/SME không bị thay đổi ngoài phạm vi. Viết test cần thiết cho khác biệt hiển thị theo role, không snapshot toàn bộ giao diện chỉ để khóa CSS.

Tạo docs/wf04-my-cases-techpay-review-report.md: phần UI đã sửa, ảnh kiểm chứng, kết quả check/build, bảng rà TechPay và điểm cần người dùng quyết định. Cập nhật task.md đúng trạng thái, không đánh dấu TechPay đã chuẩn hóa nếu mới rà soát. Dừng review trước khi tiếp tục WF-01.
