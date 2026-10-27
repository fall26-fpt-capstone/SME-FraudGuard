# FraudGuard: quy tắc UI hiện hành

Tài liệu dành cho thành viên nhóm và AI hỗ trợ code. Đọc cùng `AGENTS.md` và `README.md`. Proposal được nhóm phê duyệt quyết định nghiệp vụ; tài liệu này hướng dẫn cách thể hiện UI. Các tài liệu UI cũ chỉ là tham khảo lịch sử, không được dùng để khôi phục tính năng đã bỏ.

## 1. Nguyên tắc nghiệp vụ

- Kết quả giao dịch: Bình thường, Bất thường, Chưa thể kết luận. Trạng thái xử lý/lỗi và nhãn kỳ vọng kiểm thử là thông tin riêng.
- Không hiển thị/tính risk score, risk point hoặc ngưỡng điểm. Ngưỡng nghiệp vụ như số tiền, số giao dịch vẫn hợp lệ khi có trong đặc tả.
- Free dùng Rule Engine. Subscription ưu tiên AI và dùng Rule Engine khi AI không khả dụng. Hiển thị đúng nguồn AI, Rule hoặc Fallback; không tự tạo confidence cho kết quả rule.
- Rule Alert phục vụ theo dõi và lý do phát hiện. Luồng điều tra sâu gắn với AI Alert; Operator tự điều tra hoặc phân công Investigator.
- Con người quyết định kết luận/xử lý; không tự khóa tài khoản, hủy giao dịch hoặc khẳng định giao dịch bất thường là gian lận đã xác nhận.
- Mỗi doanh nghiệp có một tập cấu hình phát hiện chính. Khi hiển thị dự án trong demo, luôn giới hạn trong doanh nghiệp được phép truy cập.
- Bản nháp, kết quả kiểm thử, phiên bản phát hành và phiên bản bàn giao phải phân biệt rõ. Không để chỉnh draft làm thay đổi cấu hình đang chạy.
- Không thêm quota cho Rule Engine. Không tự suy diễn cơ chế tính phí AI ngoài yêu cầu được duyệt.

## 2. Vai trò và phạm vi

| Vai trò | Cách thể hiện UI |
| --- | --- |
| Platform Admin | Quản trị nền tảng, doanh nghiệp, phân công và theo dõi tiến độ |
| Implementation Staff | Review đặc tả, cấu hình, kiểm thử, phát hành và bàn giao trong phạm vi được giao |
| SME Admin | Quản lý doanh nghiệp, thành viên/quyền và thông tin tích hợp được cho phép |
| Operator | Theo dõi cảnh báo AI, điều tra/phân công và xem xét kết quả |
| Investigator | Điều tra hồ sơ được giao và gửi báo cáo |

Không tạo thêm Viewer/Auditor hay đổi lại tên Deployment Staff/Operation. Reuse các hàm phân quyền trong `src/data/fraudguard-roles.ts` và kiểm tra cả thao tác lẫn dữ liệu; không chỉ ẩn nút. Dashboard, bảng, chi tiết, báo cáo và export phải dùng cùng phạm vi doanh nghiệp.

## 3. Ngôn ngữ cho doanh nghiệp

- Nhãn ưu tiên tiếng Việt dễ hiểu: “Doanh nghiệp”, “Tập quy tắc”, “Lý do phát hiện”, “Chưa có dữ liệu”. Hạn chế tenant, payload, schema, snapshot trong luồng SME.
- Không đưa JSON/ID nội bộ lên phần tổng quan; thông tin kỹ thuật chỉ mở khi cần trong phần tích hợp/chi tiết được phép.
- Nút dùng động từ rõ: “Lưu thay đổi”, “Xem chi tiết”, “Chạy kiểm thử”. Nút bị khóa phải có lý do và hướng dẫn bước tiếp theo.
- Không hiển thị thành công khi thao tác chưa được thực hiện. Không thêm banner “demo/chưa backend” lặp lại trên mọi trang; giới hạn kỹ thuật ghi trong tài liệu, giải thích tại thao tác khi cần.
- Chỉnh nhãn phải cập nhật cả `vi` và `en` trong `src/config/translations.ts`. Giữ nguyên tên do người dùng đặt.

## 4. Thiết kế và CSS

- Dùng CSS Modules và token hiện có trong `src/app/globals.css`; không thêm UI framework hay bộ màu mới chỉ cho một trang.
- Tái sử dụng `Panel`, `StatCard`, bảng, badge và nút hiện có. Shared dashboard CSS ở `src/components/fraudguard-dashboard/SecurityDashboard.module.css`; login có CSS Module riêng.
- Màu hành động: `--action-bg: #2563eb`, chữ `--action-text: #ffffff`. Nền/chữ/viền dùng `--security-*` theo theme. Không lấy màu link làm nền CTA nếu thiếu tương phản.
- Sidebar dùng `--sidebar-width` (240px), header `--product-header-height` (60px), panel radius 5px; control khoảng 4px, badge khoảng 3px. Khoảng cách theo 4/8/12/16/20/24/28/32px.
- Control thường tối thiểu 40px, vùng chạm mobile tối thiểu 44px. Text metadata tối thiểu 11px và phải đọc được trong cả light/dark.
- Bố cục trang: tiêu đề và mô tả ngắn → hành động chính → filter/tóm tắt → nội dung → phân trang hoặc hướng dẫn tiếp theo. Một hành động chính nổi bật cho từng tác vụ.
- Bảng có header dễ đọc, trạng thái bằng cả chữ và màu. Không dùng màu làm tín hiệu duy nhất. Nội dung dài phải wrap/truncate có cách xem đầy đủ.
- Tránh inline style cho grid/breakpoint dùng chung. Chart phải giải thích đơn vị, nguồn dữ liệu và trạng thái rỗng; tỷ lệ nguồn phát hiện không phải độ chính xác AI.

## 5. Responsive và khả năng truy cập

- Dưới 900px có menu mobile thay cho sidebar. Menu cùng quyền với desktop và đóng sau điều hướng.
- Kiểm tra màn hình 375px, 768px và desktop. Không che logo/nhãn role/nút; bảng rộng có vùng cuộn ngang riêng.
- Modal/drawer dùng `src/hooks/useDialogFocus.ts`, accessible title, focus ban đầu, trap Tab, Escape và trả focus về nút mở. Dữ liệu chưa lưu phải được giữ hoặc có xác nhận bỏ khi phù hợp.
- Input có label, lỗi gắn với trường, nút icon có tên truy cập. Dropdown có chiều cao tối đa, cuộn nội bộ và không tràn viewport.
- Có empty/loading/error/retry khi tác vụ cần. Không thêm loading giả cho cập nhật local đồng bộ. Giữ focus-visible và tôn trọng reduced motion.

## 6. API và package

- Hiện tại chưa có backend. `src/services` giữ trống bằng `.gitkeep`; không dựng API giả để lấp thư mục.
- Chỉ thêm service khi nhóm xác nhận contract, authentication, lỗi và dữ liệu trả về. Dữ liệu mẫu ở `src/data`; helper xử lý ở `src/utils`.
- Dùng package đang có: Next.js/React/TypeScript, CSS Modules, lucide-react, recharts và exceljs. Thêm dependency cần có nhu cầu cụ thể; commit package-lock cùng package.json.
- `src/app` là nơi đăng ký URL của Next.js. Các thư mục còn lại không thay thế App Router; `src/pages` chỉ giữ chỗ, chưa chứa route.

## 7. Trước khi bàn giao

1. Chạy `npm run check` và `npm run build`.
2. Với thay đổi UI, xem light/dark, mobile/desktop và role bị ảnh hưởng.
3. Kiểm tra empty/error, nút chính, bàn phím, dropdown/modal và nhãn vi/en.
4. Kiểm tra SME không thấy dữ liệu doanh nghiệp khác hoặc draft nội bộ; điều tra tuân thủ phân quyền.
5. Ghi rõ phạm vi và kết quả kiểm tra trong PR. Leader review/merge; không tự merge.
