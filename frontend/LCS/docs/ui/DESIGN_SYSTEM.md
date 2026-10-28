# FraudGuard Frontend Design System

Quy chuẩn thiết kế cho dashboard `frontend/LCS`, dành cho thành viên nhóm và AI trước khi code. Đối chiếu mã nguồn ngày 28/10/2026. Đây là tài liệu frontend, không phải thiết kế kiến trúc backend hoặc API. Landing page là ứng dụng riêng, không tự áp dụng toàn bộ bố cục dashboard cho landing page.

## 1. Đọc gì trước khi làm

1. Đọc `../../AGENTS.md`: phạm vi công việc và quy trình kiểm tra.
2. Đọc `../../README.md`: cấu trúc thư mục, package và lệnh chạy.
3. Đọc `UI_RULES.md`: nghiệp vụ thể hiện trên UI, vai trò, ngôn ngữ và quyền.
4. Đọc tài liệu này: font, kích thước, màu và hành vi component.
5. Đọc component cùng CSS thực tế của màn hình sắp sửa; kiểm tra cả rule ghi đè và media query cuối file.

Proposal được phê duyệt quyết định nghiệp vụ. `UI_RULES.md` quyết định cách thể hiện nghiệp vụ; tài liệu này quyết định quy chuẩn hình thức và tương tác. Nếu hai quy chuẩn hiện hành mâu thuẫn, báo rõ trước khi thay đổi. Hai file `FRAUDGUARD_UI_SYSTEM_SPEC.md` và `FRAUDGUARD_DASHBOARD_UI_GUIDE_NEXTJS.md` chỉ để tham khảo lịch sử.

Các bảng ghi **hiện tại** mô tả CSS đang có, không khẳng định mọi màn hình đều đã tuân thủ. Các mục ghi **chuẩn khi làm mới/sửa UI** là yêu cầu cho phần được giao; không tự sửa toàn ứng dụng chỉ để đồng bộ.

## 2. Nguồn triển khai

| Nguồn | Trách nhiệm |
| --- | --- |
| `src/app/layout.tsx` | Nạp Inter qua `next/font/google`, hỗ trợ latin và vietnamese |
| `src/app/globals.css` | Theme, token màu/kích thước, font nền và focus |
| `src/components/fraudguard-dashboard/SecurityDashboard.module.css` | CSS chung dashboard, sidebar, header và các màn hình |
| `src/components/auth/Login.module.css` | Bố cục đăng nhập riêng |
| `src/layouts/Sidebar.tsx`, `ProductHeader.tsx` | Khung điều hướng; vẫn dùng CSS chung dashboard |
| `src/routes/navigation.ts`, `role-home.ts` | Menu chung desktop/mobile và màn hình đầu theo vai trò |
| `src/config/translations.ts` | Nội dung tiếng Việt/Anh dùng chung |
| `src/hooks/useDialogFocus.ts` | Quản lý focus của dialog |

Các đường dẫn `src/...` tính từ thư mục LCS. Dùng CSS Modules; không thêm Tailwind, UI framework hoặc font mới để xử lý riêng một màn hình. Không tạo token giả trong tài liệu rồi dùng nó khi CSS chưa khai báo.

## 3. Font và phân cấp chữ

Font chính: **Inter**, được nạp tại root layout. CSS nền khai báo fallback `"Segoe UI", Arial, sans-serif`. Body hiện tại **14px**. Input, select và button kế thừa font; textarea mới phải khai báo kế thừa font để tránh font mặc định khác biệt.

| Vị trí | CSS hiện tại tiêu biểu | Chuẩn khi làm mới/sửa UI |
| --- | --- | --- |
| Tiêu đề trang `.pageHeading h1` | 26px, weight 600; 23px ở ≤680px | Tái sử dụng class, một h1 mỗi trang |
| Mô tả trang `.pageHeading p` | 13px | 13–14px, màu muted hoặc secondary, nội dung ngắn |
| Tiêu đề panel `.panelHeader h2` | 13px, weight 600 | Giữ variant panel hiện có; section lớn có thể dùng 16px/600 như workflow panel |
| Nội dung chính | Body 14px, nhiều control 12px | Nội dung SME ưu tiên 14px; không thu nhỏ để nhét nhiều dữ liệu |
| Label/control | Các class hiện tại thường 12–13px | 12–14px, label rõ ràng, weight 500–600 nếu cần nhấn mạnh |
| KPI `.statValue` | 31px/600, line-height 1.1 | Dùng StatCard; summary tập rule có variant 28px |
| Metadata | Một số class 11px, còn class cũ 9–10px | Tối thiểu 11px; không dùng cho hướng dẫn quan trọng |
| Bảng | Header cũ 10px/600, cell 11px | Khi sửa bảng cho SME ưu tiên 12–14px; không lấy chữ 10px làm chuẩn mới |

Weight: 400 nội dung, 500 nhãn/hành động vừa, 600 tiêu đề/giá trị, 700 nhấn mạnh ngắn. Đoạn mô tả nhiều dòng dùng line-height 1.5–1.6; đây là chuẩn khi bổ sung, không phải token line-height toàn cục đang có. Giữ nguyên dấu tiếng Việt; không viết hoa toàn đoạn. JSON/code kỹ thuật có thể dùng monospace trong vùng chi tiết riêng.

## 4. Màu và theme

Luôn dùng token thay vì sao chép mã hex vào component. Giá trị dưới đây đối chiếu `globals.css`; khi đổi token phải cập nhật tài liệu cùng thay đổi đó.

| Token | Dark | Light | Cách dùng |
| --- | --- | --- | --- |
| `--security-bg` | #17181c | #f3f4f7 | Nền trang |
| `--security-header` | #1f2025 | #ffffff | Header |
| `--security-panel` | #202126 | #ffffff | Card/panel |
| `--security-panel-hover` | #292c35 | #f8fafc | Hover hàng/card |
| `--security-control` | #292a32 | #f0f2f6 | Control |
| `--security-control-hover` | #353640 | #e2e5ec | Hover control |
| `--security-border` | #35363e | #e2e5eb | Viền phân chia |
| `--security-border-strong` | #454752 | #cbd2df | Viền control |
| `--security-text` | #e5e5ec | #0f172a | Chữ chính |
| `--security-text-secondary` | #b5b8c4 | #334155 | Chữ bổ trợ |
| `--security-muted` | #9799a7 | #64748b | Mô tả |
| `--security-subtle` | #777b8b | #64748b | Chữ phụ; kiểm tra tương phản trước khi dùng chữ nhỏ |
| `--security-blue` | #71b9f4 | #2563eb | Link, focus, lựa chọn |
| `--action-bg` / `--action-text` | #2563eb / #ffffff | #2563eb / #ffffff | Nút hành động chính |

Badge dùng bộ ba token `--critical-text/bg/border`, `--high-text/bg/border`, `--medium-text/bg/border`, `--low-text/bg/border` hiện có. Không suy ra risk score hoặc thêm mức kết luận nghiệp vụ từ tên token cũ. Trạng thái luôn có chữ, không chỉ màu. Không mặc định mọi cặp màu hiện tại đều đã đạt tương phản; mục được sửa phải kiểm tra tối thiểu 4.5:1 cho chữ thường và 3:1 cho chữ lớn.

## 5. Kích thước và bố cục

| Thành phần | Giá trị/ứng xử hiện tại |
| --- | --- |
| Header | `--product-header-height: 60px`; ≤680px được tăng chiều cao khi wrap, tối thiểu 60px |
| Sidebar mở | `--sidebar-width: 240px`; ≤1150px thành 210px; ≤900px ẩn và hiện menu mobile |
| Vùng nội dung | `--content-max-width: 1900px`; padding 24px 28px 40px; ≤1150px padding ngang 18px; ≤680px là 20px 14px 0 |
| Panel | `--panel-radius: 5px`; border 1px; phần mới thường padding 16px mobile, 20–24px desktop |
| Control | Radius 4px; nhóm control thông dụng trong `.root` min-height 40px, ≤680px min-height 44px |
| Badge | Chuẩn mới radius 3px, padding khoảng 3px 6px hoặc 4px 8px; variant cũ có 4px |
| Spacing | Chuẩn mới 4/8/12/16/20/24/28/32px; không thêm giá trị tùy hứng cho cùng loại bố cục |
| Icon | Dùng lucide-react; chuẩn mới 16px trong nút/bảng, 18–20px điều hướng, 20–24px đầu section |

Icon size không phải vùng chạm: nút icon mới cần vùng chạm tối thiểu 40px desktop, 44px mobile. Các nút header/collapse cũ nhỏ hơn vẫn tồn tại; không nhân rộng chúng làm chuẩn.

Các breakpoint là `max-width` (bao gồm giá trị biên). Ở ≤680px, toolbar chuyển dọc và nội dung cần wrap; chart về một cột. KPI thông thường về hai cột; riêng case metrics về một cột ở ≤420px. Không buộc mọi loại grid có cùng số cột. Menu mobile dùng cùng danh sách quyền với desktop và đóng sau khi chọn.

## 6. Component và tương tác

| Thành phần | Quy tắc sử dụng |
| --- | --- |
| Panel | Tái sử dụng `Panel.tsx`: title, description, action, children, className; không tự bọc panel lồng nhiều lớp |
| KPI | Tái sử dụng `StatCard.tsx`: label, value, description, tone; số liệu có phạm vi và đơn vị rõ |
| Button | Hiện tại dùng phần tử button + CSS class, chưa có component Button dùng chung. Dùng `.button`, `.btnPrimary`, `.btnSecondary` phù hợp, không import component chưa tồn tại |
| Input/select/textarea | Label luôn nhìn thấy; placeholder chỉ là ví dụ. Dùng control hiện có, lỗi cạnh trường và `aria-invalid`/`aria-describedby` khi phù hợp |
| Table | Dùng table ngữ nghĩa với th/td, vùng cuộn ngang riêng; hành động có tên rõ; empty state thay cho bảng trống khó hiểu |
| Chi tiết quy tắc | Tái sử dụng `ReadableConditions.tsx`; ưu tiên diễn giải nghiệp vụ, JSON chỉ trong phần kỹ thuật có thể mở |
| Dialog/drawer | Tái sử dụng cấu trúc hiện có và `useDialogFocus`; title, focus đầu, trap Tab, Escape, trả focus; không để nội dung vượt viewport |
| Toast | Dùng `ToastProvider`; báo kết quả sau thao tác thực sự thành công, lỗi cần hướng xử lý |
| Menu/dropdown | Giới hạn chiều cao và cuộn nội bộ; hoạt động bằng bàn phím, không che mất thao tác cuối; đóng khi chọn/đóng menu |

Trạng thái bắt buộc khi áp dụng:

- **Default/hover:** giữ cùng kích thước; dùng control-hover/panel-hover, không đổi bố cục khi rê chuột.
- **Focus:** giữ outline `2px solid var(--security-blue)`, offset 3px từ globals; không xóa outline mà không thay thế tương đương.
- **Selected:** chữ và nền thể hiện lựa chọn; thêm `aria-current`, `aria-selected` hoặc thuộc tính phù hợp ngữ nghĩa, không chỉ đổi màu.
- **Disabled:** dùng thuộc tính disabled thực sự, kèm lý do nhìn thấy khi người dùng cần biết bước tiếp theo. Opacity không phải kiểm tra quyền.
- **Loading:** ngăn thao tác gửi lặp, giữ label dễ hiểu, dùng aria-busy khi phù hợp. Không tạo loading giả cho thao tác local đồng bộ.
- **Error/empty/success:** phân biệt lỗi hệ thống, không có dữ liệu và không có kết quả lọc; cung cấp hành động phù hợp, không bịa kết quả thành công.

Các lớp overlay hiện có dùng nhiều z-index khác nhau; chưa có hệ token lớp phủ thống nhất. Reuse lớp overlay của component, kiểm tra menu/dialog/toast khi mở cùng nhau; không chữa lỗi che bằng cách thêm tùy ý `z-index: 99999`. Dashboard đã có giảm animation/transition khi `prefers-reduced-motion: reduce`.

## 7. Phân chia code để nhóm cùng làm

README là nguồn mô tả đầy đủ thư mục. Quy tắc quyết định nhanh:

- URL/layout gốc → `app`; màn hình và control → `components`; khung sidebar/header → `layouts`.
- Menu và trang đầu theo role → `routes`; không tạo router khác hoặc `pages`.
- State/provider dùng chung → `context`; logic React tái sử dụng → `hooks`.
- Kiểu dữ liệu → `types`; hàm xử lý thuần/phân quyền → `utils`; cấu hình và bản dịch → `config`.
- Dữ liệu mẫu → `data`; tài nguyên import → `assets`; file truy cập URL → `public`.
- `services` vẫn chỉ có `.gitkeep` cho đến khi nhóm chốt API contract. Không biến mock thành API giả.

Không cần package mới cho tài liệu/quy chuẩn này. Dùng npm và package-lock hiện tại; hướng dẫn Node và package trong README. UI phải giữ dễ hiểu với SME, không hiển thị tên thư mục, schema hay chi tiết triển khai vào luồng nghiệp vụ.

## 8. Khoảng lệch đã biết và checklist

Hiện còn label/badge 8–10px ở vài nơi, header control 26–34px, padding cũ 15/17px và radius một số dialog 8px. CSS còn các khai báo 34px bị override bởi `.root` ở cuối file. Đây là hiện trạng cần lưu ý, không phải chuẩn cho màn hình mới. Chưa thực hiện đợt đồng bộ UI toàn bộ trong lần viết tài liệu này.

Trước khi bàn giao thay đổi UI:

1. Kiểm tra phần được sửa trên 375px, 768px, desktop và hai theme; kiểm tra biên 900px/680px nếu sửa layout.
2. Kiểm tra tiếng Việt dài, zoom 200%, keyboard/focus, cuộn bảng, menu và dialog.
3. Kiểm tra trạng thái rỗng/lỗi/disabled/loading và vai trò/phạm vi doanh nghiệp liên quan.
4. Chạy `npm run check` và `npm run build` theo AGENTS.md; chúng không thay thế kiểm tra trực quan.
5. Ghi rõ những gì đã kiểm tra, chưa kiểm tra và ngoại lệ còn lại. Push nhánh riêng, leader review/merge.
