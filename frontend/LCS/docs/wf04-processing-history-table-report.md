# Báo cáo bàn giao Bảng Lịch sử Xử lý 3 cột & Chiều rộng Modal Chi tiết Hồ sơ (WF-04)

Ngày báo cáo: 18/11/2026  
Phạm vi: `D:\SME-FraudGuard\frontend\LCS` (chuyển bảng Lịch sử xử lý trong modal chi tiết hồ sơ sang bố cục **3 cột** theo `docs/antigravity-wf04-processing-history-three-columns.md`, thay thế cấu trúc 5 cột trước đó và giữ nguyên chiều rộng modal mở rộng `.caseDetailModal`; chưa thực hiện TechPay hay WF-01).  
Nhánh làm việc: `feat/FE-DashboardPage`.  
Nguyên tắc git & dịch vụ: giữ nguyên mọi thay đổi hiện có của nhóm; không reset/restore/stash/commit/push; `src/services/` giữ nguyên chỉ có `.gitkeep`; không thêm npm dependency mới.

---

## 1. Danh sách file thay đổi

| Đường dẫn (`frontend/LCS/...`) | Thay đổi chính |
|---|---|
| `src/config/translations.ts` | Cập nhật 5 cặp khóa đối xứng VI (`L903-907`) / EN (`L2049-2053`) dưới `wf04Phase2a.caseQueue`: `timelineColEvent` (`"Sự kiện"` / `"Event"`), `timelineColPerformedBy` (`"Thực hiện bởi"` / `"Performed by"`), `timelineColDateTime` (`"Ngày/giờ"` / `"Date/time"`), `timelineNoteLabel` (`"Ghi chú"` / `"Note"`), `timelineExpandDetailsLabel` (`"Xem nội dung chi tiết"` / `"View full details"`); bỏ 5 khóa thừa của bố cục 5 cột (`timelineColAssignee`, `timelineColStatusAfter`, `timelineColDate`, `timelineColTime`, `timelinePerformedByLabel`). |
| `src/components/fraudguard-dashboard/CasesView.tsx` | Cập nhật `CaseProcessingHistoryRow` và `buildCaseProcessingHistoryRows` (`L168-231`): sắp xếp tăng dần theo mili-giây `Date.parse(evt.at)` (giữ nguyên thứ tự ban đầu `originalIndex` khi trùng thời điểm), lấy `actorName` trực tiếp từ `evt.actor` qua `resolveActorDisplayName` (tuyệt đối không lấy từ `evt.assignee` hay `case.assignee`), gộp ngày/giờ cục bộ thành một trường `dateTimeText` (`DD/MM/YYYY HH:MM:SS` theo `dateLocale`, không in `.001`), bỏ suy diễn người đảm nhận/trạng thái trong bảng lịch sử; cập nhật JSX bảng 3 cột (`L1134-1195`) bỏ dòng phụ `Thực hiện bởi:` dưới tên sự kiện, giữ nguyên hiển thị `styles.caseDetailModal` cùng thông tin người phụ trách và trạng thái hiện tại ở phần thông tin hồ sơ bên trên. |
| `src/components/fraudguard-dashboard/SecurityDashboard.module.css` | Giữ nguyên `.builderModal` (`width: min(720px, 100%)`) và `.caseDetailModal` (`width: min(1060px, calc(100vw - 48px))`, responsive tại `900px` và `680px`); điều chỉnh CSS bảng 3 cột (`L4738-4837`): ưu tiên chiều rộng cho cột sự kiện (`.caseHistoryEventCell` `56%` trên desktop, `44%` ở `max-width: 680px`), `.caseHistoryActorCell` (`24%` / `26%`), `.caseHistoryDateTimeCell` (`20%` / `30%`, `tabular-nums`, cho phép xuống dòng ngày và giờ trên màn hình `<= 680px`), cho phép header bảng xuống dòng gọn ở `<= 680px` để loại bỏ cuộn ngang không cần thiết trên mobile `375px`. |
| `tests/wf04-phase2c.test.cjs` | Cập nhật bài kiểm thử #13 (`L1209-1515`) xác minh cấu trúc 3 cột (`Sự kiện`, `Thực hiện bởi`, `Ngày/giờ` / `Event`, `Performed by`, `Date/time`), không lặp `Thực hiện bởi:` dưới tên sự kiện, không còn cột cũ (`Người đảm nhận`, `Trạng thái sau sự kiện`, `Ngày`, `Giờ`), giữ nguyên người phụ trách & trạng thái ở phần thông tin hồ sơ, giữ đúng `evt.actor` (phân công `Phạm Bảo Châu` do `Lê Minh Quân` thực hiện hiển thị `Lê Minh Quân`), bảo toàn phiên bản báo cáo (`v1`, `v2`), gộp ngày/giờ không dính `.001`/`.005`, giữ sort mili-giây & ổn định khi trùng thời điểm, tên actor dài, `<details>` cho lý do `> 140` ký tự và lịch sử rỗng. |
| `docs/wf04-processing-history-table-report.md` | Cập nhật báo cáo bàn giao theo bố cục 3 cột mới và kết quả kiểm chứng thực tế. |
| `docs/task.md` | Cập nhật mục `8. Bước 8` (`Mục 10`) và bổ sung mốc kiểm tra ngày `18/11/2026` ở `Mục 11` theo bố cục 3 cột mới. |

**Phạm vi giữ nguyên không thay đổi:**
- Toàn bộ state machine, RBAC/cô lập tenant, storage v4, recovery journal, luồng feedback Phase 2C, bộ mẫu `CASE-SAMPLE-*`, cơ chế cổng dev-only (`?wf04Dev=1` / `fg_wf04_dev_tools`), lớp chồng `AlertCaseDrawer` (`z-index: 52/53`) trên modal (`50/51`), `useDialogFocus`, cơ chế giữ nháp báo cáo khi mở cảnh báo, `loading.tsx` nền trắng và phần ẩn preview ở `My Cases` của Codex (`!isInvestigator && latestRep`).
- Không động tới TechPay / Checkout Gateway / Mobile Wallet hoặc WF-01.

---

## 2. Thiết kế Bảng Lịch sử Xử lý 3 cột

- Bảng sử dụng `<div className={styles.caseHistoryTableWrap}><table className={styles.caseHistoryTable}>` với đúng 3 `<th scope="col">` theo thứ tự:
  1. `Sự kiện` (`Event`): tên sự kiện nghiệp vụ giữ nguyên phiên bản (như `Gửi báo cáo v1`, `Yêu cầu bổ sung cho báo cáo v1`, `Gửi báo cáo v2`, `Xác nhận báo cáo v2 và đóng hồ sơ`); kèm nội dung lý do/ghi chú khi có (`<= 140` ký tự hiển thị trực tiếp trong `.caseHistoryDetailBox`; `> 140` ký tự thu gọn trong `<details className={styles.caseHistoryDetails}><summary className={styles.caseHistorySummary}>` truy cập bàn phím chuẩn). Không lặp lại dòng phụ `Thực hiện bởi: ...` dưới tên sự kiện.
  2. `Thực hiện bởi` (`Performed by`): người trực tiếp thực hiện sự kiện, lấy từ `evt.actor` qua `resolveActorDisplayName` (ví dụ khi `Lê Minh Quân` phân công `Phạm Bảo Châu`, cột này hiển thị `Lê Minh Quân`; khi `Phạm Bảo Châu` gửi báo cáo, hiển thị `Phạm Bảo Châu`).
  3. `Ngày/giờ` (`Date/time`): gộp ngày và giờ của `evt.at` vào một ô duy nhất theo locale đang chọn (`16/11/2026 09:10:00` ở VI, `11/16/2026 09:10:00` ở EN), không hiển thị mili-giây `.001`, vẫn giữ timestamp đầy đủ khi sắp xếp và giữ nguyên thứ tự gốc khi trùng thời điểm.
- Thông tin người phụ trách hiện tại (`Phạm Bảo Châu` / `Lê Minh Quân`) và trạng thái hiện tại (`Mở` / `Đang điều tra` / `Chờ duyệt` / `Đã đóng`) vẫn được giữ nguyên trong phần Thông tin hồ sơ & Phân công xử lý bên trên bảng lịch sử.

---

## 3. Kết quả kiểm tra tự động & Trình duyệt thực tế

### 3.1. Kiểm tra tự động (`npm run check`, chạy sau lần chỉnh sửa cuối cùng)
Chạy tại `D:\SME-FraudGuard\frontend\LCS` (thoát mã `0`):
- `npm run lint` (`eslint src --max-warnings=0`): đạt, `0` lỗi, `0` cảnh báo.
- `npm run typecheck` (`next typegen && tsc --noEmit`): đạt, `0` lỗi TypeScript.
- `npm test` (`node --test tests/*.test.cjs`): **`160/160` bài kiểm thử đạt**, `0` thất bại, `0` hủy, `0` bỏ qua (bao gồm bài #13 cập nhật theo bảng 3 cột trong `tests/wf04-phase2c.test.cjs`).
- Lưu ý phân biệt nguồn kiểm chứng: `node --test tests/*.test.cjs` là Node/SSR test cho logic projection, render markup và hợp đồng UI; hành vi trình duyệt thực tế được kiểm chứng riêng ở Mục 3.3 bên dưới.

### 3.2. Ghi chú về `npm run build` và `next dev` đang chạy
- Máy chủ phát triển `next dev` của người dùng hiện đang chạy trên cổng `3000` (`PID 21196` / `PID 26160`) và dùng chung thư mục `.next`.
- Theo đúng quy tắc giữ nguyên server đang chạy của người dùng và tránh xung đột `.next`, **chưa chạy `npm run build`** đè lên `.next` trong khi `next dev` đang mở. Sau khi người dùng dừng `next dev`, có thể chạy `npm run build` tuần tự sau `npm run check` để xác nhận production build.

### 3.3. Kiểm thử trình duyệt thực tế (`http://localhost:3000/fraud-monitoring?wf04Dev=1`)
Kiểm thử trực tiếp trên `next dev` đang chạy với dữ liệu hồ sơ giữ nguyên qua reload (`0` xóa `localStorage`):
- **Desktop `1440x900` (Light & Dark, VI & EN)**:
  - Trên `CASE-SAMPLE-REVIEW` (`v1 -> bổ sung > 140 ký tự -> v2 -> Đã đóng`): header có đúng 3 cột `["Sự kiện", "Thực hiện bởi", "Ngày/giờ"]` (EN: `["Event", "Performed by", "Date/time"]`), `0` lặp `Thực hiện bởi:` dưới tên sự kiện; dòng `Phân công điều tra viên` hiển thị `Lê Minh Quân`, `Gửi báo cáo v1`/`v2` hiển thị `Phạm Bảo Châu`, `Yêu cầu bổ sung cho báo cáo v1` và `Xác nhận báo cáo v2 và đóng hồ sơ` hiển thị `Lê Minh Quân`; ô `Ngày/giờ` gộp gọn `16/11/2026 09:00:00`..`18/11/2026 14:07:10`; `<details>` mở/đóng bình thường bằng phím `Enter`; bảng rộng `830.4px` trong vùng bọc `832px` (`0` thanh cuộn ngang).
  - Trên `CASE-WF04-0005` (`Tạo hồ sơ điều tra` -> `Tự đảm nhận điều tra`): cả hai dòng đều ghi đúng `Lê Minh Quân` tại cột `Thực hiện bởi`, phần Thông tin hồ sơ bên trên giữ nguyên người phụ trách và trạng thái hiện tại.
  - Chồng lớp `AlertCaseDrawer` (từ `CASE-SAMPLE-WORKING` dưới vai trò Điều tra viên `Phạm Bảo Châu`): sau khi nhập nháp `"Unsent draft text for verification: kiểm tra công tơ MTR-WORKING-2"` và bấm `Xem cảnh báo`, `AlertCaseDrawer` nổi trên modal `.caseDetailModal`; nhấn `Escape` đóng drawer mà vẫn giữ nguyên nháp báo cáo; `Tab` và hộp thoại xác nhận bỏ nháp khi đóng modal hoạt động đầy đủ.
- **Tablet `768x1024`**:
  - `body` rộng `768px` (`0` tràn ngang trang), modal rộng `720px`, vùng `.caseHistoryTableWrap` rộng `633.6px` chứa bảng `632px` (`0` cuộn ngang, các cột `Sự kiện: 323.91px`, `Thực hiện bởi: 146.21px`, `Ngày/giờ: 161.88px`), nút `Đóng` `74.61 x 44px` dễ bấm.
- **Mobile `375x812` (Light & Dark, kiểm chứng lại sau chỉnh CSS `@media (max-width: 680px)`)**:
  - `body` rộng `375.2px` (`0` tràn ngang trang), modal rộng `327.2px`, vùng `.caseHistoryTableWrap` rộng `244.8px` chứa bảng `243.2px` (`table <= wrap`, **`0` thanh cuộn ngang** ngay cả trong vùng bảng), bề rộng 3 cột ưu tiên cột Sự kiện (`Sự kiện: 100.80px`, `Thực hiện bởi: 59.49px`, `Ngày/giờ: 82.91px`), tên người thực hiện và ngày/giờ tự xuống dòng gọn trong Light Mode lẫn Dark Mode, nút `Đóng` (`74.61 x 44px`) hiển thị đủ ở cuối modal.
- **Ảnh minh chứng đã kiểm chứng trực quan**:
  - Desktop `1440x900` Light Mode (VI, bảng 3 cột & `<details>` mở): [step_10_shot_1_desktop_1440_light_vi.png](file:///C:/Users/gmt/.gemini/antigravity/brain/2a11e2a2-2e17-45db-8fc0-97ee52b211f0/browser_sandbox/screenshots/step_10_shot_1_desktop_1440_light_vi.png)
  - Desktop `1440x900` Dark Mode (VI, bảng 3 cột): [step_14_shot_1_desktop_1440_dark_vi.png](file:///C:/Users/gmt/.gemini/antigravity/brain/2a11e2a2-2e17-45db-8fc0-97ee52b211f0/browser_sandbox/screenshots/step_14_shot_1_desktop_1440_dark_vi.png)
  - Mobile `375x812` Light Mode (modal đang mở, bảng 3 cột vừa khung & nút `Đóng`): [step_36.png](file:///C:/Users/gmt/.gemini/antigravity/brain/2a11e2a2-2e17-45db-8fc0-97ee52b211f0/browser_sandbox/screenshots/step_36.png)
  - Mobile `375x812` Dark Mode (modal đang mở, bảng 3 cột vừa khung & nút `Đóng`): [step_38_shot_1_mobile_375_dark_vi_refined.png](file:///C:/Users/gmt/.gemini/antigravity/brain/2a11e2a2-2e17-45db-8fc0-97ee52b211f0/browser_sandbox/screenshots/step_38_shot_1_mobile_375_dark_vi_refined.png)
