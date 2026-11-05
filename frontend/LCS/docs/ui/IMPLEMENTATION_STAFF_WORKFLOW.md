# SME-FraudGuard — Thiết Kế UI/UX: Luồng Triển Khai Cho Implementation Staff (Bản Hoàn Thiện v3.0)

**Dự án:** SME-FraudGuard: Nền tảng SaaS đa tenant hỗ trợ phát hiện bất thường trong giao dịch dành cho doanh nghiệp vừa và nhỏ  
**Mã đề tài:** FA26SE297 | **Nhóm thực hiện:** GFA26SE97  
**Phân hệ phụ trách:** `frontend/LCS` — Thiết kế giao diện & trải nghiệm người dùng (UI/UX)  
**Người phụ trách chuyển tiếp & phê duyệt:** Huy  
**Tình trạng tài liệu:** Antigravity (UI/UX) và Codex (Nghiệp vụ & Logic) cập nhật theo 10 điểm phản hồi — **Đang trình Huy xem xét duyệt**  
**Ngày cập nhật:** 30/10/2026  

---

## MỤC LỤC
1. [Phần 1: Phân định 3 Cấp độ Yêu cầu & Quyết định thiết kế](#phần-1-phân-định-3-cấp-độ-yêu-cầu--quyết-định-thiết-kế)
2. [Phần 2: Tiến trình tổng thể 7 chặng của Implementation Staff](#phần-2-tiến-trình-tổng-thể-7-chặng-của-implementation-staff)
3. [Phần 3: Vòng đời trạng thái và Ma trận trách nhiệm](#phần-3-vòng-đời-trạng-thái-và-ma-trận-trách-nhiệm)
4. [Phần 4: Bảng điều kiện phát hiện và Nguồn dữ liệu đầu vào](#phần-4-bảng-điều-kiện-phát-hiện-và-nguồn-dữ-liệu-đầu-vào)
5. [Phần 5: Phác thảo chi tiết 4 Màn hình (Doanh nghiệp An Phúc xuyên suốt)](#phần-5-phác-thảo-chi-tiết-4-màn-hình-doanh-nghiệp-an-phúc-xuyên-suốt)
   - [Màn hình 1: Danh sách doanh nghiệp được phân công](#màn-hình-1-danh-sách-doanh-nghiệp-được-phân-công)
   - [Màn hình 2: Hồ sơ doanh nghiệp An Phúc & Tiếp nhận yêu cầu](#màn-hình-2-hồ-sơ-doanh-nghiệp-an-phúc--tiếp-nhận-yêu-cầu)
   - [Màn hình 3: Làm rõ yêu cầu (4 khía cạnh) & Chuẩn bị bản tổng hợp](#màn-hình-3-làm-rõ-yêu-cầu-4-khía-cạnh--chuẩn-bị-bản-tổng-hợp)
   - [Màn hình 4: Chờ doanh nghiệp xác nhận (Hai nhánh thực tế: Đồng ý & Yêu cầu sửa)](#màn-hình-4-chờ-doanh-nghiệp-xác-nhận-hai-nhánh-thực-tế-đồng-ý--yêu-cầu-sửa)
6. [Phần 6: Tiêu chuẩn Kiểm thử đạt, Tính bất biến và Bàn giao Workspace](#phần-6-tiêu-chuẩn-kiểm-thử-đạt-tính-bất-biến-và-bàn-giao-workspace)

---

## PHẦN 1: PHÂN ĐỊNH 3 CẤP ĐỘ YÊU CẦU & QUYẾT ĐỊNH THIẾT KẾ

Tài liệu phân loại rành mạch giữa 3 nguồn thông tin:

### Cấp độ 1: Yêu cầu chính thức trong Proposal (FA26SE297)
- **Quyền hạn vai trò:** Platform Admin tạo workspace và chỉ định Implementation Staff. Staff phụ trách làm rõ đặc tả, thiết lập cấu hình và kiểm thử ban đầu trong phạm vi doanh nghiệp được phân công.
- **Tiếp nhận yêu cầu:** Thu thập yêu cầu kinh doanh, mô tả trường dữ liệu, tình huống bất thường đã biết và dữ liệu mẫu (JSON/CSV).
- **Trước thời điểm bàn giao:** Doanh nghiệp **chưa** nhận bàn giao workspace; hệ thống chưa chạy đánh giá trên dữ liệu thực tế của doanh nghiệp.
- **Không tự can thiệp hệ thống:** FraudGuard đóng vai trò giám sát, đưa ra thông báo cảnh báo và hồ sơ điều tra; **không bao giờ tự động chặn thanh toán, khóa tài khoản hoặc hủy đơn hàng** (Tuân thủ giới hạn LI-01 và loại trừ EX-01).
- **Phân biệt vai trò SME:** SME Admin quản lý người dùng và phân quyền trong doanh nghiệp; Operator trực tiếp giám sát cảnh báo và điều phối hồ sơ.

### Cấp độ 2: Quyết định thiết kế đã được Huy xác nhận
- **Bố cục giao diện:** Ưu tiên trang chi tiết riêng biệt cho từng doanh nghiệp (`/onboarding/[id]`) thay vì dồn tất cả vào một bảng chung để tránh nhầm lẫn.
- **Phương thức xác nhận:** Xác nhận thông qua trao đổi thực tế (email / biên bản họp bên ngoài) và được Staff ghi nhận chính thức vào hệ thống kèm bằng chứng.
- **Khu vực tài liệu đính kèm:** Thiết kế khu vực quản lý file đính kèm phục vụ việc lưu trữ tài liệu yêu cầu, dữ liệu mẫu và biên bản đối soát.

### Cấp độ 3: Đề xuất thiết kế bổ sung từ Antigravity & Codex (Đang chờ Huy duyệt)
- **Thanh ngữ cảnh cố định (Context Sticky Banner):** Luôn ghim tên doanh nghiệp, tenant ID, người đại diện và gói dịch vụ ở đầu màn hình.
- **Tách 2 trạng thái ban đầu:** Phân biệt rõ giữa *Chờ doanh nghiệp gửi yêu cầu* (ST-01A) và *Đã nhận, chờ nhân viên kiểm tra* (ST-01B).
- **Quy chuẩn 4 khía cạnh làm rõ:** Mở rộng từ "làm rõ trường" thành "làm rõ yêu cầu" bao gồm: (1) Nghiệp vụ, (2) Điều kiện phát hiện kèm nguồn dữ liệu, (3) Ngoại lệ/Danh sách tin cậy, (4) Cấu hình trường dữ liệu (Schema).
- **Thao tác ghi nhận trao đổi ngoại tuyến:** Sử dụng nút *Ghi nhận đã gửi bản tổng hợp* và *Ghi nhận đã gửi lại bản tổng hợp cập nhật*, không tạo cảm giác hệ thống tự gửi email qua SMTP.
- **Nút "Hoàn tất xác nhận":** Yêu cầu điền đầy đủ 4 trường bắt buộc (Người xác nhận, Thời điểm, Hình thức, File bằng chứng) mới cho phép kích hoạt. Bản đã xác nhận được đóng băng bất biến; thay đổi phát sinh sau này bắt buộc tạo bản cập nhật mới (`v1.1`, `v1.2`).

---

## PHẦN 2: TIẾN TRÌNH TỔNG THỂ 7 CHẶNG CỦA IMPLEMENTATION STAFF

```text
[Chặng 1: Tiếp nhận yêu cầu] (ST-01A ──> ST-01B)
       │
       ▼
[Chặng 2: Làm rõ yêu cầu - 4 Khía cạnh] (ST-02)
       │
       ▼
[Chặng 3: Xác nhận đặc tả hai chiều] (ST-03A, ST-03B, ST-04)
       │ (Khóa đóng băng bản đặc tả đã xác nhận)
       ▼
[Chặng 4: Thiết lập quy tắc phát hiện] (Rule Authoring)
       │
       ▼
[Chặng 5: Kiểm thử an toàn Sandbox] (Sandbox Testing)
       │
       ▼
[Chặng 6: Review kết quả kiểm thử cùng SME] (Test Results Review)
       │
       ▼
[Chặng 7: Bàn giao Workspace chính thức cho SME] (Handover & Go-Live)
```

---

## PHẦN 3: VÒNG ĐỜI TRẠNG THÁI VÀ MA TRẬN TRÁCH NHIỆM

| Mã | Tên trạng thái tiếng Việt | Bên cần phản hồi / Thao tác | Mô tả nghiệp vụ | Hành động tiếp theo |
| :---: | :--- | :---: | :--- | :--- |
| `ST-01A` | **Chờ doanh nghiệp gửi yêu cầu** | Đại diện SME | Doanh nghiệp mới tạo trên hệ thống, chưa nạp tài liệu yêu cầu hoặc dữ liệu mẫu. | Staff đôn đốc SME; tải file lên khi nhận qua email. |
| `ST-01B` | **Đã nhận, chờ nhân viên kiểm tra** | Implementation Staff | Doanh nghiệp đã gửi tài liệu/tệp mẫu; Staff cần rà soát tính đầy đủ và cấu trúc tệp. | Bấm nút: **[Bắt đầu làm rõ yêu cầu ──>]** |
| `ST-02` | **Đang làm rõ yêu cầu** | Staff & Đại diện SME | Staff bóc tách 4 khía cạnh: Nghiệp vụ, Điều kiện, Ngoại lệ, Dữ liệu Schema. | Bấm nút: **[Ghi nhận đã gửi bản tổng hợp cho SME]** |
| `ST-03A` | **Chờ doanh nghiệp xác nhận** | Đại diện SME | Bản tổng hợp đã gửi đi bên ngoài; đang chờ đại diện SME xem xét và phản hồi. | Chờ SME phản hồi; Staff chuẩn bị ghi nhận theo thực tế. |
| `ST-03B` | **Cần điều chỉnh theo phản hồi** | Implementation Staff | SME phản hồi yêu cầu sửa (ví dụ: đổi ngưỡng COD); Staff tạo bản thảo cập nhật v1.1. | Bấm nút: **[Ghi nhận đã gửi lại bản tổng hợp cập nhật]** |
| `ST-04` | **Đã xác nhận đặc tả (Đóng băng)** | Implementation Staff | SME đã đồng thuận. Staff ghi nhận đủ người, giờ, bằng chứng và khóa bản đặc tả. | Bấm nút: **[Chuyển sang Thiết lập quy tắc ──>]** |
| `ST-05` | **Thiết lập quy tắc & Chạy thử Sandbox** | Implementation Staff | Cấu hình các rule theo đúng đặc tả đã khóa, chạy thử trên tập giao dịch mẫu. | Chạy kiểm thử cho đến khi đạt 100% tiêu chuẩn. |
| `ST-06` | **Review kết quả kiểm thử** | Staff & Đại diện SME | Hai bên rà soát tỷ lệ cảnh báo sai và trường hợp bỏ sót trong bộ mẫu. | Bấm nút: **[Phê duyệt kết quả kiểm thử]** |
| `ST-07` | **Đã bàn giao Workspace** | SME Admin & Operator | Bàn giao quyền quản trị cho SME Admin và quyền giám sát vận hành cho Operator. | Bàn giao hoàn tất (Go-Live). |

---

## PHẦN 4: BẢNG ĐIỀU KIỆN PHÁT HIỆN VÀ NGUỒN DỮ LIỆU ĐẦU VÀO

Nhằm tránh tình trạng điều kiện phát hiện bị thiếu dữ liệu hoặc không khả thi trong thực tế, mọi điều kiện trong đặc tả bắt buộc phải chỉ rõ dữ liệu cần dùng và nguồn gốc:

| Tên điều kiện phát hiện | Mô tả nghiệp vụ | Dữ liệu đầu vào cần dùng | Nguồn dữ liệu |
| :--- | :--- | :--- | :--- |
| **Đơn COD giá trị cao** | Phát hiện các đơn hàng giao COD vượt hạn mức thanh toán thông thường, có nguy cơ bùng hàng hoặc mất vốn lưu động. | - `amount` (Giá trị đơn hàng)<br>- `payment_method` (Phương thức thanh toán) | **Doanh nghiệp gửi trực tiếp** (trong tệp giao dịch hoặc gọi API/Webhook). |
| **Tần suất đặt hàng bất thường** | Phát hiện một khách hàng hoặc thiết bị đặt dồn dập nhiều đơn hàng trong khoảng thời gian ngắn. | - `customer_phone` (Số điện thoại nhận)<br>- `device_id` (Mã nhận diện thiết bị)<br>- `timestamp` (Thời điểm giao dịch) | **Hệ thống FraudGuard tự tính toán** dựa trên lịch sử giao dịch trong 60 phút qua của cùng số điện thoại/thiết bị (`velocity_count_60m`). |
| **Giao hỏa tốc đến địa chỉ rủi ro** | Phát hiện đơn hàng chọn gói vận chuyển hỏa tốc nhưng địa chỉ nhận thuộc danh mục vùng xa, hải đảo có chi phí vận chuyển cao. | - `shipping_city` (Tỉnh/Thành phố nhận)<br>- `shipping_tier` (Gói vận chuyển: Chuẩn / Hỏa tốc) | - `shipping_city`, `shipping_tier`: **Doanh nghiệp gửi trực tiếp**.<br>- Danh mục vùng xa: **Quy tắc cấu hình nội bộ** của FraudGuard đối soát. |

---

## PHẦN 5: PHÁC THẢO CHI TIẾT 4 MÀN HÌNH (DOANH NGHIỆP AN PHÚC XUYÊN SUỐT)

---

### MÀN HÌNH 1: DANH SÁCH DOANH NGHIỆP ĐƯỢC PHÂN CÔNG
- **Đường dẫn đề xuất:** `/onboarding-prototype` (hoặc `/onboarding`)
- **Mục tiêu:** Giúp nhân viên triển khai (Nguyễn Minh Hà) quản lý danh sách doanh nghiệp phụ trách, nhận diện việc khẩn và phân định rõ trạng thái từng đơn vị.

```text
+----------------------------------------------------------------------------------------------------+
| FraudGuard / Thiết lập doanh nghiệp                                         [Nguyễn Minh Hà - Staff]|
+----------------------------------------------------------------------------------------------------+
| TIÊU ĐỀ: Doanh nghiệp được phân công triển khai                                                    |
| Mô tả: Tiếp nhận yêu cầu, làm rõ đặc tả, thiết lập quy tắc và chuẩn bị bàn giao workspace cho SME. |
|                                                                                                    |
| [ Thẻ 1: 03 Doanh nghiệp phụ trách ]  [ Thẻ 2: 02 Cần xử lý ngay ]   [ Thẻ 3: 01 Đang thử nghiệm ] |
|                                                                                                    |
| BẢNG DOANH NGHIỆP PHỤ TRÁCH:                                                                       |
| +------------------------------------------------------------------------------------------------+ |
| | Doanh nghiệp          | Đại diện SME       | Trạng thái hiện tại    | Đang chờ ai  | Thao tác   | |
| +------------------------------------------------------------------------------------------------+ |
| | Bán lẻ An Phúc        | Nguyễn Văn Phúc    | Đã nhận, chờ kiểm tra  | Staff (Hà)   | [Mở hồ sơ] | |
| | TechPay Solution JSC  | Trần Mai Anh       | Chờ DN xác nhận (v1.0) | SME (Phúc)   | [Mở hồ sơ] | |
| | FastRetail Commerce   | Lê Hữu Nam         | Chờ DN gửi yêu cầu     | SME (Nam)    | [Mở hồ sơ] | |
| +------------------------------------------------------------------------------------------------+ |
| * Dòng "Bán lẻ An Phúc" có huy hiệu cam nổi bật: "Đã nhận tệp mẫu và yêu cầu mới từ khách hàng"  |
+----------------------------------------------------------------------------------------------------+
```
- **Tên doanh nghiệp:** Công ty Cổ phần Bán lẻ An Phúc (`tenant-anphuc`).
- **Trạng thái:** `Đã nhận yêu cầu, chờ nhân viên kiểm tra` (`ST-01B`).
- **Đang chờ:** Nguyễn Minh Hà (Implementation Staff).
- **Hành động chính:** Bấm nút **[Mở hồ sơ]** để vào trang làm việc riêng của An Phúc.

---

### MÀN HÌNH 2: HỒ SƠ DOANH NGHIỆP AN PHÚC & TIẾP NHẬN YÊU CẦU
- **Đường dẫn đề xuất:** `/onboarding-prototype/anphuc/intake`
- **Mục tiêu:** Quản lý thông tin doanh nghiệp An Phúc, tiếp nhận tài liệu đính kèm, phân biệt rõ giữa lúc chờ khách hàng gửi và lúc đã nhận chờ nhân viên duyệt.

```text
+----------------------------------------------------------------------------------------------------+
| FraudGuard / Thiết lập doanh nghiệp / Bán lẻ An Phúc                       [Nguyễn Minh Hà - Staff]|
+----------------------------------------------------------------------------------------------------+
| [STICKY BANNER]: Công ty Cổ phần Bán lẻ An Phúc (tenant-anphuc) | Đại diện: Nguyễn Văn Phúc        |
| Gói dịch vụ: Gói Cơ bản (Miễn phí)  |  Kênh tích hợp chính: Đơn COD & Bán hàng Website             |
+----------------------------------------------------------------------------------------------------+
| TIẾN TRÌNH: [1. Tiếp nhận: ĐANG XỬ LÝ] ===> [2. Làm rõ] ===> [3. Xác nhận] ===> [4. Thiết lập quy tắc] |
+----------------------------------------------------------------------------------------------------+
| [CARD 3 ĐIỂM TỰA]:                                                                                 |
| - Trạng thái: Đã nhận yêu cầu, chờ nhân viên kiểm tra (ST-01B)                                     |
| - Đang chờ: Nguyễn Minh Hà (Staff) xem xét tài liệu mô tả và kiểm tra tính hợp lệ của tệp mẫu     |
| - Hành động chính: Bấm nút "Bắt đầu làm rõ yêu cầu ──>" sau khi kiểm tra tệp                       |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
| PHẦN A: THÔNG TIN DOANH NGHIỆP & ĐẠI DIỆN LIÊN HỆ                                                  |
| - Tên pháp nhân: Công ty Cổ phần Bán lẻ An Phúc (An Phuc Retail JSC)                               |
| - Người liên hệ chính: Ông Nguyễn Văn Phúc - Giám đốc Vận hành (phuc.nv@anphuc.vn | 0918xxxxxx)    |
| - SME Admin (Quản trị tài khoản tương lai): Bà Trần Thị Mai (mai.tt@anphuc.vn)                    |
| - Operator (Giám sát vận hành tương lai): Ông Nguyễn Văn Phúc (phuc.nv@anphuc.vn)                  |
| - Mô hình kinh doanh: Chuỗi 12 cửa hàng thời trang bán lẻ và kênh giao hàng thu tiền tận nơi (COD) |
|                                                                                                    |
| PHẦN B: KHU VỰC TÀI LIỆU ĐÍNH KÈM & TỆP MẪU TỪ DOANH NGHIỆP                                       |
| +------------------------------------------------------------------------------------------------+ |
| | Tên tài liệu / Tệp mẫu              | Dung lượng | Thời điểm nhận     | Nguồn nhận   | Thao tác | |
| +------------------------------------------------------------------------------------------------+ |
| | YeuCau_KiemSoatCOD_AnPhuc_v1.docx   | 420 KB     | 29/10/2026 10:15   | Email gửi tới| [Tải về] | |
| | DanhSachDonHang_Mau_150gd.csv       | 185 KB     | 29/10/2026 10:20   | Upload trực tiếp|[Xem trước]|
| +------------------------------------------------------------------------------------------------+ |
| [+ Tải thêm tài liệu bổ sung / biên bản trao đổi]                                                  |
|                                                                                                    |
| [NÚT PHỤ: Yêu cầu DN bổ sung file]                 [NÚT CHÍNH: BẮT ĐẦU LÀM RÕ YÊU CẦU ──>]         |
+----------------------------------------------------------------------------------------------------+
```
- **Tên doanh nghiệp:** Bán lẻ An Phúc.
- **Trạng thái:** `Đã nhận yêu cầu, chờ nhân viên kiểm tra` (`ST-01B`).
- **Đang chờ:** Nguyễn Minh Hà (Implementation Staff).
- **Hành động chính:** Bấm nút **[Bắt đầu làm rõ yêu cầu ──>]** để chuyển sang bước bóc tách 4 khía cạnh đặc tả.

---

### MÀN HÌNH 3: LÀM RÕ YÊU CẦU (4 KHÍA CẠNH) & CHUẨN BỊ BẢN TỔNG HỢP
- **Đường dẫn đề xuất:** `/onboarding-prototype/anphuc/specification`
- **Mục tiêu:** Bóc tách đủ 4 khía cạnh nghiệp vụ, chỉ rõ nguồn dữ liệu, xuất file xem trước và ghi nhận đã gửi bản tổng hợp cho An Phúc.

```text
+----------------------------------------------------------------------------------------------------+
| FraudGuard / Thiết lập doanh nghiệp / Bán lẻ An Phúc                       [Nguyễn Minh Hà - Staff]|
+----------------------------------------------------------------------------------------------------+
| [STICKY BANNER]: Công ty Cổ phần Bán lẻ An Phúc (tenant-anphuc) | Phiên bản soạn thảo: Draft v1.0   |
+----------------------------------------------------------------------------------------------------+
| TIẾN TRÌNH: [1. Đã tiếp nhận] ===> [2. Làm rõ yêu cầu: ĐANG XỬ LÝ] ===> [3. Xác nhận đặc tả] ===> ...|
+----------------------------------------------------------------------------------------------------+
| [CARD 3 ĐIỂM TỰA]:                                                                                 |
| - Trạng thái: Đang làm rõ yêu cầu (Soạn thảo Bản tổng hợp đặc tả v1.0)                             |
| - Đang chờ: Nguyễn Minh Hà hoàn thiện cấu hình 4 khía cạnh và kiểm tra mẫu dữ liệu                |
| - Hành động chính: Bấm nút "Ghi nhận đã gửi bản tổng hợp cho An Phúc"                              |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
| 4 KHÍA CẠNH LÀM RÕ ĐẶC TẢ:                                                                         |
|                                                                                                    |
| 1. NGHIỆP VỤ (Business Context):                                                                   |
|    - Kênh giao dịch: Website bán hàng kết nối đối tác giao vận COD (GHTK, ViettelPost).             |
|    - Giá trị đơn hàng trung bình: 450.000 VNĐ. Phần lớn khách mua lẻ từ 1 đến 2 sản phẩm/đơn.      |
|                                                                                                    |
| 2. ĐIỀU KIỆN PHÁT HIỆN BẤT THƯỜNG (KÈM NGUỒN DỮ LIỆU ĐẦU VÀO):                                    |
|    - Điều kiện 1: Đơn giao COD có giá trị thanh toán lớn hơn 5.000.000 VNĐ.                         |
|      * Dữ liệu: `amount`, `payment_method` (Nguồn: Doanh nghiệp gửi trực tiếp).                    |
|    - Điều kiện 2: Cùng một số điện thoại hoặc thiết bị đặt trên 3 đơn hàng trong vòng 60 phút.      |
|      * Dữ liệu: `customer_phone`, `device_id` (Nguồn: Hệ thống FraudGuard tự tính tần suất).        |
|    - Điều kiện 3: Địa chỉ giao hàng thuộc khu vực vùng xa nhưng chọn dịch vụ vận chuyển hỏa tốc.   |
|      * Dữ liệu: `shipping_city`, `shipping_tier` (Nguồn: Doanh nghiệp gửi đối soát danh mục).      |
|                                                                                                    |
| 3. NGOẠI LỆ / DANH SÁCH TIN CẬY (Whitelists & Exceptions):                                         |
|    - Khách hàng sỉ / Đại lý liên kết (danh sách 45 mã đối tác của An Phúc) được miễn kiểm tra COD. |
|    - Đơn hàng nội bộ do nhân viên chăm sóc khách hàng đặt thay có gắn cờ `is_staff_assisted = true`|
|                                                                                                    |
| 4. CẤU HÌNH DỮ LIỆU ĐÁNH GIÁ (Data Schema - 05 trường dữ liệu):                                    |
|    + transaction_id     | Văn bản (Text) | Bắt buộc [x] | Mã định danh đơn hàng (Doanh nghiệp gửi)|
|    + amount             | Số (Number)    | Bắt buộc [x] | Giá trị thanh toán VNĐ (Doanh nghiệp gửi)|
|    + payment_method     | Văn bản (Text) | Bắt buộc [x] | Hình thức thanh toán: COD, Chuyển khoản |
|    + customer_phone     | Văn bản (Text) | Bắt buộc [x] | Số điện thoại nhận hàng                 |
|    + is_wholesale_agent | Đúng/Sai (Bool)| Bắt buộc [ ] | Đánh dấu đại lý mua sỉ uy tín          |
|    [+ Thêm trường dữ liệu mới]                                                                     |
|                                                                                                    |
| VÙNG XEM TRƯỚC BẢN TỔNG HỢP:                                                                       |
| [ File tài liệu tổng hợp: `BanTongHop_DacTa_AnPhuc_v1.0.pdf` (Tự động tạo từ 4 mục trên) ]         |
|                                                                                                    |
| [Lưu bản nháp]                         [GHI NHẬN ĐÃ GỬI BẢN TỔNG HỢP CHO AN PHÚC (NÚT CHÍNH)]     |
+----------------------------------------------------------------------------------------------------+
```
- **Tên doanh nghiệp:** Bán lẻ An Phúc.
- **Trạng thái:** `Đang làm rõ yêu cầu` (`ST-02`, Bản tổng hợp v1.0).
- **Đang chờ:** Nguyễn Minh Hà (Staff) rà soát 4 khía cạnh.
- **Hành động chính:** Bấm nút **[Ghi nhận đã gửi bản tổng hợp cho An Phúc]** để chuyển sang trạng thái chờ khách hàng phản hồi.

---

### MÀN HÌNH 4: CHỜ DOANH NGHIỆP XÁC NHẬN (HAI NHÁNH THỰC TẾ: ĐỒNG Ý & YÊU CẦU SỬA)
- **Đường dẫn đề xuất:** `/onboarding-prototype/anphuc/confirmation`
- **Mục tiêu:** Theo dõi trạng thái phản hồi của An Phúc. Cung cấp 2 nhánh xử lý thực tế ngang hàng: (4A) Khách hàng yêu cầu sửa $\rightarrow$ điều chỉnh và gửi lại; (4B) Khách hàng đồng thuận $\rightarrow$ hoàn tất xác nhận và đóng băng đặc tả.

```text
+----------------------------------------------------------------------------------------------------+
| FraudGuard / Thiết lập doanh nghiệp / Bán lẻ An Phúc                       [Nguyễn Minh Hà - Staff]|
+----------------------------------------------------------------------------------------------------+
| [STICKY BANNER]: Công ty Cổ phần Bán lẻ An Phúc (tenant-anphuc) | Bản gửi duyệt: Bản tổng hợp v1.0 |
+----------------------------------------------------------------------------------------------------+
| TIẾN TRÌNH: [1. Tiếp nhận] ===> [2. Đã làm rõ] ===> [3. Xác nhận đặc tả: CHỜ PHẢN HỒI] ===> ...    |
+----------------------------------------------------------------------------------------------------+
| [CARD 3 ĐIỂM TỰA]:                                                                                 |
| - Trạng thái: Đang chờ doanh nghiệp xác nhận (ST-03A, Ghi nhận gửi lúc: 29/10/2026 14:00)          |
| - Đang chờ: Ông Nguyễn Văn Phúc (Đại diện An Phúc) phản hồi qua email hoặc biên bản họp            |
| - Hành động chính: Chọn 1 trong 2 nút bên dưới tùy theo kết quả làm việc thực tế với khách hàng    |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
| THÔNG TIN BẢN TỔNG HỢP ĐANG CHỜ PHÊ DUYỆT:                                                         |
| - Tài liệu đã gửi: `BanTongHop_DacTa_AnPhuc_v1.0.pdf`                                              |
| - Nội dung tóm tắt: 03 điều kiện phát hiện | 02 nhóm ngoại lệ | 05 trường dữ liệu đánh giá         |
|                                                                                                    |
| -------------------------------------------------------------------------------------------------- |
| NHÁNH THỰC TẾ A: NẾU AN PHÚC YÊU CẦU ĐIỀU CHỈNH / BỔ SUNG                                         |
| Bấm nút: [GHI NHẬN YÊU CẦU SỬA ĐỔI TỪ DOANH NGHIỆP]                                                |
| -> Mở form ghi nhận phản hồi từ ông Phúc:                                                          |
|    "An Phúc muốn nâng ngưỡng COD từ 5 triệu lên 7 triệu cho dịp khuyến mãi cuối năm và bổ sung     |
|     thêm trường mã bưu cục giao nhận (shipping_hub_id)."                                           |
| -> Hệ thống chuyển trạng thái sang: "Cần điều chỉnh theo phản hồi" (ST-03B), tạo Bản nháp v1.1.    |
| -> Nhân viên cập nhật xong bấm: [GHI NHẬN ĐÃ GỬI LẠI BẢN TỔNG HỢP CẬP NHẬT (v1.1)]                |
|                                                                                                    |
| -------------------------------------------------------------------------------------------------- |
| NHÁNH THỰC TẾ B: NẾU AN PHÚC ĐỒNG THUẬN XÁC NHẬN                                                  |
| Bấm nút: [GHI NHẬN DOANH NGHIỆP ĐÃ XÁC NHẬN]                                                       |
| -> Mở form xác nhận chính thức (Yêu cầu nhập đủ 4 mục bắt buộc):                                   |
|    + Người xác nhận phía SME: [ Nguyễn Văn Phúc                  ] (Giám đốc Vận hành An Phúc)     |
|    + Hình thức xác nhận:      (o) Email chính thức  ( ) Biên bản họp ký tay  ( ) Ký số             |
|    + Thời điểm xác nhận:      [ 29/10/2026 16:30              ]                                    |
|    + Đính kèm file bằng chứng:[ Upload: `Email_DongY_AnPhuc_2910.pdf` ] (Bắt buộc)                 |
|    + Phiên bản chốt:          Bản tổng hợp đặc tả v1.0 (hoặc v1.1 nếu đã qua chỉnh sửa)            |
|                                                                                                    |
| [NÚT BẤM HOÀN TẤT]: [HOÀN TẤT XÁC NHẬN]                                                            |
| => HỆ THỐNG: Đóng băng bản đặc tả (Không thể sửa đè). Chuyển sang Bước 4: "Thiết lập quy tắc".    |
+----------------------------------------------------------------------------------------------------+
```
- **Tên doanh nghiệp:** Bán lẻ An Phúc.
- **Trạng thái:** `Chờ doanh nghiệp xác nhận` (ST-03A) $\rightarrow$ `Cần điều chỉnh theo phản hồi` (ST-03B) HOẶC `Đã xác nhận đặc tả` (ST-04).
- **Đang chờ:** Đại diện SME phản hồi $\rightarrow$ Staff ghi nhận kết quả.
- **Hành động chính:** Bấm **[Hoàn tất xác nhận]** (Chỉ kích hoạt khi đủ 4 mục: người, giờ, bằng chứng file, phiên bản).

---

## PHẦN 6: TIÊU CHUẨN KIỂM THỬ ĐẠT, TÍNH BẤT BIẾN VÀ BÀN GIAO WORKSPACE

1. **Định nghĩa rõ "Kiểm thử đạt (Passed)":**
   - Đạt kiểm thử Sandbox khi:
     - Toàn bộ 150 giao dịch trong bộ mẫu được hệ thống xử lý đầy đủ, không phát sinh lỗi dữ liệu.
     - Kết quả phân loại (`Abnormal`, `Normal`, `Undetermined`) và các điều kiện vi phạm khớp 100% với nhãn kỳ vọng đã thống nhất trong bản đặc tả.
     - **Nguyên tắc an toàn:** Mọi mẫu giao dịch phát sinh chưa có nhãn kỳ vọng trước đó bắt buộc phải đưa vào danh mục "Cần review", tuyệt đối không được tự động tính là đạt.
   - **Review kết quả kiểm thử:** Hai bên đối soát tỷ lệ cảnh báo sai (false alarms) và các trường hợp bỏ sót (false negatives) trên tập dữ liệu mẫu. FraudGuard tuyệt đối không tự động chặn giao dịch khách hàng.
2. **Tính bất biến & Quản lý phiên bản đặc tả:**
   - Khi đã bấm *Hoàn tất xác nhận*, phiên bản đặc tả đó (ví dụ `v1.0`) được chuyển sang chế độ **Đóng băng (Frozen / Locked)**.
   - Không ai được sửa đè nội dung của phiên bản đã xác nhận. Mọi yêu cầu thay đổi về sau đều phải bấm *Tạo bản cập nhật mới (`v1.1`, `v1.2`)* và lặp lại quy trình làm rõ - xác nhận để lưu vết kiểm toán đầy đủ.
3. **Phân quyền bàn giao Workspace:**
   - Workspace chỉ được bàn giao sau khi thỏa mãn đủ 4 điều kiện:
     1. Đặc tả nghiệp vụ ở trạng thái `Đã xác nhận đặc tả`.
     2. Đã hoàn tất bước `Thiết lập quy tắc` theo đúng đặc tả.
     3. Đã chạy `Kiểm thử Sandbox` đạt 100% tiêu chuẩn.
     4. Đã hoàn thành bước `Review kết quả kiểm thử` cùng đại diện SME.
   - Khi bàn giao:
     - **SME Admin (Bà Trần Thị Mai):** Nhận quyền quản trị thành viên, cấu hình API Key, kết nối webhook và xem báo cáo điều hành.
     - **Operator (Ông Nguyễn Văn Phúc):** Nhận quyền giám sát cảnh báo hàng ngày, điều phối hồ sơ cho điều tra viên và duyệt kết luận xử lý.
