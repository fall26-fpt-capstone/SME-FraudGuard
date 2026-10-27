# FraudGuard landing page

Landing page tiếng Việt giới thiệu FraudGuard và giải pháp giám sát giao dịch bất thường dành cho doanh nghiệp SME, xây dựng bằng Next.js App Router, React, TypeScript và CSS Modules. Phần trải nghiệm sử dụng dữ liệu mẫu đồng bộ với hệ thống `../LCS`.

## Chạy cục bộ

```powershell
npm install
npm run dev
```

Mở http://localhost:3001. Chạy dashboard trong thư mục `../LCS` bằng `node node_modules/next/dist/bin/next dev --port 3000` để nút **Mở bản demo** dẫn đến dashboard hiện có.

Đổi địa chỉ dashboard bằng biến `NEXT_PUBLIC_FRAUDGUARD_DASHBOARD_URL` trong `.env.local` rồi khởi động lại hoặc build lại. Giá trị mặc định là `http://localhost:3000/fraud-monitoring`. Khi triển khai lên hosting, cần cấu hình URL dashboard đã triển khai.

```powershell
npm run build
npm start
```

Install dependencies independently with `npm ci` using the included package-lock.json. No external dependency junction is required.
## Nội dung và tương tác

- **Hero theo cấu trúc Base Workflow**: Cột trái gồm nhãn định vị, tiêu đề 2 tông màu (navy đậm + xanh dương), CTA chính/phụ và 3 điểm nhấn cốt lõi; cột phải là khung sản phẩm (`.productWindow`) kèm 4 tab chuyển bước quy trình (`1 Tiếp nhận`, `2 Phân công`, `3 Điều tra`, `4 Kết luận`) và thanh trạng thái `01/04`. Ở bước 1, người dùng có thể bấm chọn 3 giao dịch mẫu (`TX-83912`, `TXN-20260917-002`, `TXN-20260917-004`) để xem kết quả phân loại (`Abnormal`), nguồn phát hiện (`AI`, `RULE`, `RULE_FALLBACK`) và bằng chứng.
- **01 / Kiến trúc vận hành rủi ro (`#tinh-nang`)**: Lưới 6 thẻ (`01` đến `06`) trình bày tổng quan, ngắn gọn các trụ cột vận hành của hệ thống mà không phơi bày chi tiết mã giao dịch hoặc dữ liệu nội bộ trên thẻ.
- **02 / Quản lý hồ sơ tập trung (`#ho-so`)**: Bố cục Hub-and-Spoke với hồ sơ trung tâm `CASE-FG-1023` ở giữa và 4 thẻ thông tin vây quanh (`01 Dữ liệu giao dịch`, `02 Bằng chứng kích hoạt`, `03 Báo cáo của Investigator`, `04 Quyết định & Nhật ký kiểm toán`), điều khiển qua 4 nút pill, click trực tiếp trên thẻ hoặc nút chuyển bước tiếp theo.
- **03 / Cơ chế đánh giá & dự phòng (`#co-che`)**: Sơ đồ 3 cột (`Đầu vào` -> `Engine đang chọn` -> `Đầu ra`) với 3 nút chọn nguồn đánh giá (`AI Detection`, `Dynamic Rule Engine`, `RULE_FALLBACK`).
- **04 / Phân quyền & phối hợp liên vai trò (`#vai-tro`)**: Trình xem 5 vai trò theo kiến trúc RBAC mới nhất (`Platform Admin`, `Implementation Staff`, `SME Admin`, `Operator`, `Investigator`) điều khiển trực tiếp qua thanh 5 nút pill phía trên.
- **05 / Phương án sử dụng (`#goi-su-dung`)**: Bảng so sánh 2 gói `Free` (Dynamic Rule Engine) và `Subscription` (AI Detection + Fallback) theo đặc tả.
- **06 / Câu hỏi thường gặp (`#giai-dap`)**: Khung giải đáp dạng mở rộng (`.faqCard`), đóng/mở bằng chuột hoặc bàn phím; menu mobile hỗ trợ đóng bằng phím `Escape`.

Dữ liệu mẫu lấy từ các doanh nghiệp và giao dịch mẫu của `../LCS/src/data/fraudguard-enterprises.ts` và `../LCS/src/data/fraudguard-roles.ts`. Đây là bản demo giao diện, không thực hiện phát hiện AI hoặc tiếp nhận giao dịch thật.

## Quyết định thiết kế (R-31)

- **Bảng màu (Color)**: Giữ hệ màu sáng của `LCS_landingpage` (`--bg: #ffffff`, `--panel: #f5f7fa`, `--text: #152b43`, `--muted: #526377`, `--blue: #205b9e`, `--border: #d9e1e9`, `--green: #21694f`, `--orange: #955213`) kết hợp các lớp nền pastel dịu nhẹ (`#dcebff`, `#dff4ec`, `#fcecd9`) theo yêu cầu của người dùng.
- **Kiểu chữ (Type)**: Sử dụng font `Inter` lưu cục bộ để hiển thị tiếng Việt sắc nét ở cả tiêu đề phân cấp lớn lẫn các nhãn trạng thái/mã hồ sơ mà không phụ thuộc kết nối mạng khi build.
- **Bố cục (Layout)**: Áp dụng nhịp điệu bố cục của trang sản phẩm Base Workflow (thanh điều hướng nổi bo góc, Hero 2 cột kèm 4 nút chuyển bước quy trình, lưới 6 thẻ có mini-UI, màn hình hồ sơ trung tâm 3 cột và sơ đồ đánh giá 3 cột) để dẫn dắt người xem đi từ tổng quan đến từng bước xử lý hồ sơ.
- **Khoảng trống (Space)**: Xen kẽ nền trắng và nền pastel dịu cùng khoảng cách phân vùng rộng để tách biệt rõ các nhóm nghiệp vụ.
- **Thẻ và khung (Cards)**: Tái sử dụng hệ thống class thẻ sẵn có của dự án (`.productWindow`, `.caseSheet`, `.storyPanel`, `.evidence`, `.sourceLabel`, `.finalCta`) để giữ nguyên cảm giác bề mặt và độ tương phản AA.
- **Biểu tượng (Icons)**: Chỉ sử dụng 3 biểu tượng SVG tối giản mang ngữ nghĩa rõ ràng (khiên nhận diện `Shield`, dấu kiểm `Check` cho bằng chứng/hạng mục hoàn tất, mũi tên `Arrow` cho điều hướng và chuyển bước).
- **Liveliness**: ENERGY 3 / RHYTHM 3 / MOTION 3; áp dụng hệ thống chuyển động theo tham chiếu LawShield gồm:
  - **Reload Sequence**: Thanh điều hướng trượt xuống (`translateY(-16px) -> 0`), chuỗi 5 bước xuất hiện lệch nhịp ở Hero (`cubic-bezier(0.22, 1, 0.36, 1)`) từ nhãn định vị, tiêu đề `<h1>`, mô tả, cụm nút CTA/điểm nhấn đến khung sản phẩm `.heroVisual` (`translateY(36px) scale(0.985) -> 0`), kèm 2 vùng sáng pastel trôi nhẹ nền sau (`@keyframes floatSlowA` & `floatSlowB`).
  - **6 nhóm Animation khi cuộn trang (Per-Element Scroll-Triggered Reveal trên 31 khối `[data-reveal]`)**:
    1. **Scroll-Morphing Navbar**: Khi `window.scrollY > 24`, thanh `.headerInner` thu gọn `max-width` từ `1240px` về `1080px` và tăng chiều sâu đổ bóng (`0.5s cubic-bezier(0.4, 0, 0.2, 1)`).
    2. **Section Header Blur-to-Clear Reveal (`.revealFadeBlur`)**: Mỗi tiêu đề mục (`.sectionNumber`, `<h2>`, `.centerSub`) xuất hiện từ trạng thái mờ nhòe (`opacity: 0; filter: blur(10px)`) sang sắc nét kèm độ trễ tuần tự (`0.02s`, `0.10s`, `0.20s`).
    3. **Staggered Cards & Pills Reveal**: Từng thẻ tính năng, dãy nút pill và 5 thẻ vai trò tóm tắt được quan sát riêng lẻ bởi `IntersectionObserver` để chỉ chạy hiệu ứng ngay khi phần tử đó bước vào vùng nhìn, đồng thời tự động phát lại khi cuộn ngược lên rồi cuộn xuống.
    4. **Outside-In Slide & Center Zoom (`.revealSlideLeft`, `.revealSlideRight`, `.revealZoomIn`, `.revealFadeUp`)**:
       - Khối bên trái (thẻ tính năng 01/04, `.hubColLeft`, `.detectColLeft`, `.roleIllustration`, `.planIntro`) chạy từ ngoài biên trái vào trong (`translateX(-96px) scale(0.94) + blur(6px) -> 0`).
       - Khối trung tâm (thẻ 02/05, `.hubCenter`, `.engineBox`, `.faqCard`, `.finalCta`) phóng từ tâm ra hoặc nâng từ dưới lên kèm hiệu ứng mờ tới rõ dần (`scale(0.88) + blur(9px) -> scale(1) + blur(0)`).
       - Khối bên phải (thẻ tính năng 03/06, `.hubColRight`, `.detectColRight`, `.roleDescription`, `.planTableWrap`) chạy từ ngoài biên phải vào trong (`translateX(96px) scale(0.94) + blur(6px) -> 0`).
    5. **Internal Micro-UI Animations**: Đường ánh sáng quét ngang (`@keyframes scanlineGlow`) trên đỉnh `.productWindow`, `.hubCenter`, `.detectionWindow`; các dòng `.miniRow`, thanh `.stepperTrack`, `.miniPills` và các câu hỏi FAQ (`details` trượt xen kẽ trái/phải) chuyển động khi khối cha được mở khóa `.isRevealed`.
    6. **Split Horizontal Footer Entrance**: Khi cuộn tới chân trang, khối `.footerLeft` chạy từ ngoài bên trái vào (`translateX(-96px) -> 0`) và `.footerRight` chạy từ ngoài bên phải vào (`translateX(96px) -> 0`).
  - Toàn bộ hiệu ứng tự động tắt và hiển thị tức thì khi hệ điều hành bật `prefers-reduced-motion: reduce`.

## Kiểm tra

`npm run build` kiểm tra biên dịch và TypeScript. Báo cáo kiểm tra trình duyệt tự động bằng Playwright (`node tmp/verify.cjs`) được ghi trong `QA.md`.

