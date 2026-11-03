# Đặc tả nghiệp vụ phần mềm SME-FraudGuard v1

Ngày tổng hợp: 02/11/2026. Trạng thái: bản tổng hợp để nhóm review, làm đầu vào cho SRS, SDD, ERD và phân chia công việc. Tài liệu mô tả hành vi mục tiêu, không xác nhận code hiện tại đã triển khai các hành vi này.

## 1. Nguồn phạm vi và cách sử dụng

- Nguồn chuẩn về đề tài và phạm vi là [Registration kèm BM03](../01_Registration/SWP490_FA26SE215_R2_Registration.pdf). [BM03 bản Word](../01_Registration/SWP490_R2_BM03_Record_of_Changes_1.docx) giải thích các thay đổi của proposal.
- Tài liệu này tổng hợp các quyết định nghiệp vụ đã trao đổi với trưởng nhóm, bổ sung chi tiết triển khai phần mềm. Không thay thế hoặc tự sửa proposal, không xác nhận các thay đổi đã được hội đồng phê duyệt.
- Các mục ghi **đã chốt** là quyết định đã được xác nhận trong trao đổi. Các mục ghi **đề xuất** hoặc **chờ chốt** chưa được tự chuyển thành yêu cầu chính thức khi coding.
- Nếu khác proposal, phải ghi nhận và thống nhất với nhóm trước khi cập nhật báo cáo chính thức. Code/demo hiện tại không phải nguồn để tự mở rộng phạm vi.
- Coding agent đọc tài liệu này cùng [hướng dẫn chung](../../AGENTS.md), README và hướng dẫn của module liên quan. Tài liệu này là đặc tả sản phẩm, không phải nhật ký hay bộ nhớ cá nhân của agent.

## 2. Mục tiêu và giới hạn v1

**Đã chốt:** SME-FraudGuard là giải pháp B2B SaaS đa tenant hỗ trợ phát hiện bất thường trong giao dịch thanh toán online của SME ở nhiều lĩnh vực. Nền tảng nhận dữ liệu, chuẩn hóa, phát hiện, cảnh báo và hỗ trợ điều tra; quyết định xử lý nghiệp vụ thuộc doanh nghiệp.

| Trong v1 | Ngoài v1 hoặc chờ xác nhận |
| --- | --- |
| Một doanh nghiệp, một workspace, một bộ rule đang hoạt động | Nhiều project hoặc nhiều bộ cấu hình nghiệp vụ độc lập trong workspace |
| REST API, Webhook, CSV/Excel với mapping riêng | Nhiều định dạng đầu vào hoạt động đồng thời trong cùng một kênh |
| Rule động trên field chuẩn và field riêng, xét từng giao dịch | Rule tổng hợp lịch sử, cửa sổ thời gian; cân nhắc cho v2 |
| Free và Subscription, quản trị gói thủ công | Thanh toán online, QR và tự động đối soát |
| Workflow AI Alert và điều tra, có thể test bằng AI giả lập | Thuật toán, dữ liệu, hợp đồng AI và quy trình huấn luyện lại chưa chốt |
| Kiểm soát quyền bằng backend; bảo vệ dữ liệu nhạy cảm | Không cam kết nền tảng hoàn toàn không có khả năng giải mã |

- Không có cơ chế risk score chung 0–100. Không tự thêm severity Low/Medium/High; hiện không có yêu cầu này. Các đầu ra AI bổ sung đang chờ review tại mục 10.
- Không tự khóa tài khoản khách hàng, hủy đơn, từ chối thanh toán hoặc thực thi biện pháp trong hệ thống khách hàng.
- V1 chưa đặt hạn mức thương mại về tài khoản, rule, giao dịch hoặc lưu trữ. Điều này không đồng nghĩa bỏ giới hạn kỹ thuật bảo vệ dịch vụ; các giới hạn đó cần được xác định trong NFR.
- Nhóm ưu tiên hoàn thành software trước, tích hợp model sau. AI giả lập chỉ phục vụ kiểm thử/demo có ghi nhãn rõ; không được trình bày là kết quả model thật.
- Demo dự kiến dùng một website bán hàng do nhóm xây để sinh sự kiện thanh toán. Chưa có kết quả thực nghiệm chứng minh AI vượt rule.

## 3. Thuật ngữ

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Workspace / tenant | Phạm vi dữ liệu và vận hành của một doanh nghiệp |
| Field nội bộ | Field có ý nghĩa, kiểu dữ liệu thống nhất bên trong workspace, dùng để cấu hình rule |
| Mapping | Ánh xạ field đầu vào của một kênh sang field nội bộ, kèm quy tắc chuyển đổi |
| Transaction | Giao dịch thanh toán online; không phải sự kiện Webhook hay lượt upload |
| Detection result | Kết quả một lần đánh giá giao dịch, có nguồn và thông tin phiên bản liên quan |
| Rule Alert | Cảnh báo một giao dịch khớp một hoặc nhiều rule |
| AI Alert | Cảnh báo AI phát hiện giao dịch bất thường |
| Case | Hồ sơ điều tra do Operator chủ động mở từ AI Alert |
| Import batch | Một lượt upload và xử lý file; có tiến độ và kết quả riêng |
| Plan | Định nghĩa gói dịch vụ, thông tin giới thiệu, giá và trạng thái cung cấp |
| Subscription của workspace | Quyền dùng gói có thời hạn của một workspace; khác với định nghĩa plan |
| Platform Admin / SME Admin | Quản trị nền tảng / quản trị doanh nghiệp; không dùng chung tên “Admin” khi viết yêu cầu |

## 4. Tài khoản, workspace và vai trò

### 4.1 Quy tắc đã chốt

- ACC-01: Một doanh nghiệp có một workspace; dự kiến có subdomain riêng như `nhanhoa.fraudguard.vn`. Tên miền là ví dụ, chưa xác nhận đã sở hữu hoặc triển khai DNS.
- ACC-02: Tài khoản doanh nghiệp do nền tảng cấp, thuộc một workspace và một role; không đăng nhập workspace khác. Không dùng đăng nhập Google/Facebook/GitHub trong phạm vi đã trao đổi.
- ACC-03: Tên đăng nhập dạng `username@workspace.fg`, ví dụ `admin@nhanhoa.fg`. Đây là định danh nội bộ, không mặc định là hộp thư thật. Email cá nhân/địa chỉ liên hệ nhận thông tin tài khoản được lưu riêng.
- ACC-04: Lần đăng nhập đầu tiên phải đổi mật khẩu trước khi sử dụng. Cách gửi thông tin kích hoạt an toàn, hết hạn và khôi phục tài khoản cần thiết kế riêng; chưa chốt gửi mật khẩu bản rõ qua email.
- ACC-05: Backend kiểm tra danh tính, workspace, role, gói và phạm vi đối tượng. Không suy quyền từ đuôi username, subdomain hoặc trạng thái nút trên UI.
- ACC-06: Tài khoản Platform Admin và Staff thuộc phía nền tảng. Không suy từ quy tắc tài khoản SME rằng mỗi người phải có tài khoản riêng trong workspace khách hàng; Staff làm việc tại portal nền tảng.

### 4.2 Ma trận quyền nghiệp vụ đã xác nhận

“Chờ chốt” không phải quyền mặc định. SRS phải cụ thể hóa quyền đọc/ghi theo từng đối tượng trước khi triển khai phần liên quan.

| Hoạt động | Platform Admin | Implementation Staff | SME Admin | Operator | Investigator |
| --- | --- | --- | --- | --- | --- |
| Quản lý doanh nghiệp, workspace, phân công Staff | Quản trị | Xem phần được giao | Workspace của mình | Không | Không |
| Quản lý danh mục plan, giá, kỳ hạn doanh nghiệp | Quản trị | Không | Xem gói của mình | Không quản trị | Không quản trị |
| Upload đặc tả onboarding | Có | Có, theo phân công | Có, workspace của mình | Chờ chốt | Không |
| Phân tích, mapping, cấu hình rule, chạy test | Theo dõi tiến độ, không triển khai trực tiếp | Thực hiện theo phân công | Phối hợp xác nhận; không tự cấu hình | Không | Không |
| Đề nghị / xác nhận bàn giao | Theo dõi | Đề nghị | Xác nhận tiếp nhận | Không | Không |
| Quản lý thành viên doanh nghiệp | Phạm vi quản trị chi tiết chờ chốt | Không | Có | Không | Không |
| Xem dữ liệu production và báo cáo điều tra | Không | Không | Tổng quan/báo cáo theo quyền | Vận hành theo workspace | Chỉ dữ liệu liên quan case được giao |
| Mở case, tự điều tra hoặc phân công | Không | Không | Không tham gia xử lý | Có, theo quyền gói | Không mở/phân công; nhận case được giao |
| Lập báo cáo điều tra | Không | Không | Xem báo cáo | Có, nếu tự điều tra | Có, case được giao |
| Xác nhận kết luận cuối cùng | Không | Không | Không | Có | Không |
| Xem bản rõ field nhạy cảm | Không | Không | Chờ chốt riêng | Theo quyền và đối tượng | Theo quyền và case được giao |

Platform Admin có toàn quyền CRUD trong phạm vi quản trị nền tảng, không đồng nghĩa có quyền đọc/sửa giao dịch hay báo cáo điều tra của doanh nghiệp. Quyền xóa doanh nghiệp, workspace, tài khoản đã có lịch sử cần chính sách vòng đời riêng; không suy ra được phép xóa dây chuyền dữ liệu.

## 5. Onboarding và bàn giao

### 5.1 Workflow đã chốt

1. Khách hàng liên hệ từ landing page, thể hiện gói quan tâm; sau tư vấn vẫn có thể đổi nhu cầu.
2. Platform Admin tạo thông tin doanh nghiệp, workspace và tài khoản SME Admin; gửi thông tin truy cập qua email liên hệ.
3. SME Admin đổi mật khẩu lần đầu, vào thẳng UI onboarding, thấy workspace đang triển khai. Được upload đặc tả và theo dõi tiến độ; chưa được vận hành production.
4. Platform Admin phân công Staff. Staff thao tác trên đối tượng workspace tại portal nền tảng, không đăng nhập subdomain khách hàng.
5. Staff và doanh nghiệp xác nhận đặc tả, field, mapping, điều kiện phát hiện; tài liệu có thể được nhận ngoài hệ thống rồi Admin/Staff upload giúp. File đặc tả là tài liệu để con người đọc/phân tích, không mặc định có tự động phân tích bằng AI.
6. Staff dùng mẫu khách hàng cung cấp hoặc tự tạo mẫu để kiểm tra mapping và detection.
7. Con người đánh giá cấu hình đạt; Staff đề nghị bàn giao.
8. SME Admin xác nhận tiếp nhận thì workspace chuyển sang vận hành. Nếu chưa đạt, SME Admin ghi yêu cầu bổ sung để Staff xử lý rồi đề nghị lại.
9. Staff tiếp tục hỗ trợ thay đổi cấu hình sau bàn giao; doanh nghiệp không có chức năng tự chỉnh mapping/rule.

- ONB-01: Lưu người thực hiện, thời điểm và ý kiến ở các bước bàn giao.
- ONB-02: Subscription cấp trong onboarding chỉ bắt đầu tính hạn khi SME Admin xác nhận bàn giao và workspace chuyển sang vận hành.
- ONB-03: Onboarding và gói là hai điều kiện độc lập; được cấp Subscription không vượt qua điều kiện bàn giao.
- ONB-04: Staff được xử lý đặc tả/mẫu phục vụ onboarding, không được xem giao dịch production.

### 5.2 Trạng thái đề xuất để đưa vào SRS/SDD

`Đang triển khai → Chờ xác nhận bàn giao → Đang vận hành`.

SME Admin yêu cầu bổ sung: `Chờ xác nhận bàn giao → Đang triển khai`. Đây là cách đặt trạng thái đề xuất; chưa chốt enum, việc tạm ngừng workspace hay quy trình phát hành thay đổi cấu hình sau bàn giao.

## 6. Field, mapping và ba kênh tiếp nhận

### 6.1 Quy tắc đã chốt

- ING-01: Hỗ trợ REST API + API key, Webhook và CSV/Excel. V1 có một cấu hình định dạng hoạt động cho mỗi kênh, chưa hỗ trợ nhiều định dạng đồng thời trong cùng kênh.
- ING-02: Có thể upload nhiều file theo định dạng đã cấu hình. CSV và Excel thuộc cùng kênh import; không mặc định hai định dạng có hai mapping độc lập.
- ING-03: Tên field giữa ba kênh có thể khác nhau. Staff khai báo/mapping về cùng bộ field nội bộ trước khi cấu hình rule.
- ING-04: Hỗ trợ field riêng theo domain doanh nghiệp. Mỗi field có tên, kiểu dữ liệu, tính bắt buộc và phân loại nhạy cảm. Rule chỉ chọn field đã khai báo.
- ING-05: Tài liệu mô tả chung các field giao dịch theo cấu hình workspace, gồm kiểu dữ liệu, tính bắt buộc và cách chuyển đổi. Nhóm chưa chốt danh sách field chuẩn bắt buộc hoặc format ngày giờ chung; không đưa field mẫu kiểm thử thành hợp đồng dữ liệu của sản phẩm.
- ING-06: Mapping phải xác định cách chuyển đổi dữ liệu theo kiểu, ví dụ cách đọc số tiền, ngày giờ. Thiếu field bắt buộc hoặc sai kiểu thì báo lỗi và không detection.
- ING-07: API/Webhook tiếp nhận theo sự kiện; file xử lý batch theo từng dòng. Các kênh dùng chung logic nghiệp vụ sau chuẩn hóa, không có bộ rule riêng theo kênh.
- ING-08: Cùng dữ liệu chuẩn hóa và cùng ngữ cảnh/phiên bản detection phải được đánh giá nhất quán. Không yêu cầu AI tạo kết quả giống nhau qua các lần chạy nếu hợp đồng model chưa bảo đảm điều đó.
- ING-09: File không đọc được hoặc thiếu cột bắt buộc thì từ chối trước khi xử lý. Nếu lỗi theo dòng, xử lý các dòng hợp lệ và báo rõ dòng lỗi; có tiến độ, số dòng và kết quả theo lượt import.

Ví dụ minh họa, không phải API contract:

| Field nội bộ | REST API | Webhook | CSV/Excel |
| --- | --- | --- | --- |
| Mã giao dịch | `payment_id` | `data.txn_id` | `Mã thanh toán` |
| Số tiền | `total` | `data.amount` | `Tổng tiền` |
| Thời gian giao dịch | `paid_at` | `data.timestamp` | `Ngày thanh toán` |
| Loại thiết bị, field riêng | `device_type` | `data.device` | `Thiết bị` |

### 6.2 Trùng giao dịch và xung đột

**Đã chốt:** mã giao dịch được kiểm tra trong phạm vi workspace và xuyên ba kênh. Không tạo thêm giao dịch/cảnh báo chỉ vì gửi lại cùng giao dịch qua kênh khác. Phải xử lý cả hai request đến đồng thời; chỉ kiểm tra tại UI không đủ.

| Tình huống | Hành vi mục tiêu |
| --- | --- |
| ID mới | Tiếp nhận và detection theo gói |
| ID cũ, dữ liệu chuẩn hóa tương đương | Ghi nhận gửi trùng; không tạo thêm giao dịch hoặc lần detection chỉ vì gửi lại |
| ID cũ, nội dung khác | Báo xung đột; không âm thầm ghi đè hoặc coi bản mới là giao dịch độc lập |

**Đề xuất cần xác nhận rõ:** Operator được chọn từng bản xung đột để “Chạy thử bản gửi lại”, xem khác biệt field và kết quả detection, không thay thế bản gốc hay tạo alert/case production. Cần lưu tạm bản xung đột được bảo vệ nếu muốn quay lại chạy; thời gian giữ, quyền và quyền dùng AI cho thao tác này chưa chốt.

- Định nghĩa “tương đương” sau chuẩn hóa, tập field so sánh và quan hệ với thay đổi mapping cần thiết kế. Không lấy kênh gửi/thời điểm nhận làm khác biệt nội dung giao dịch.
- Chạy lại sau AI fallback là một lần xử lý của giao dịch đã lưu, không phải giao dịch mới; không bị chặn chỉ vì cùng ID.
- Chưa có luồng sửa giao dịch đã tiếp nhận. Trường hợp hai nguồn cấp cùng ID cho hai giao dịch khác nhau phải được giải quyết trong hợp đồng mã giao dịch, không tự bỏ qua.

## 7. Rule Engine

**Đã chốt:** v1 xét điều kiện trên từng giao dịch, hỗ trợ field chuẩn và field riêng; không cho chạy mã tùy ý. Staff cấu hình tên, mô tả, điều kiện, bật/tắt rule. Transaction được đánh giá qua toàn bộ rule đang hoạt động của workspace.

| Kiểu / trường hợp | Phép toán v1 |
| --- | --- |
| Số, ngày giờ | Bằng, khác, lớn hơn, nhỏ hơn, lớn hơn hoặc bằng, nhỏ hơn hoặc bằng |
| Chuỗi | Bằng, khác, thuộc danh sách, không thuộc danh sách |
| Boolean | Đúng / sai |
| Giá trị trống | Có giá trị / không có giá trị |
| Nhiều điều kiện | AND hoặc OR trong một rule, chưa lồng nhiều tầng |

- RUL-01: Field tùy chọn bị trống làm các phép so sánh thông thường trả về không khớp, kể cả “khác” và “không thuộc danh sách”. Muốn phát hiện trống phải dùng điều kiện riêng.
- RUL-02: Một giao dịch khớp nhiều rule tạo một Rule Alert, chứa toàn bộ rule/lý do khớp, không tạo một alert cho mỗi rule.
- RUL-03: Rule explanation gồm tên, mô tả và điều kiện thực tế đã khớp; không tiết lộ field nhạy cảm trái quyền.
- RUL-04: Rule Alert phục vụ xem, đánh dấu theo dõi và tra cứu lịch sử; không mở case điều tra từ Rule Alert.
- RUL-05: Không tự gán rủi ro hoặc severity cho rule. Quy tắc theo tần suất/lịch sử không thuộc v1 và cũng không mặc định đã được AI hỗ trợ.

Cần bổ sung trong SRS: so sánh chuỗi có phân biệt hoa/thường không, định nghĩa trống, múi giờ/độ chính xác số và cách quản lý phiên bản rule/mapping. Không tự chọn mặc định làm thay đổi ý nghĩa nghiệp vụ.

## 8. Chạy thử cấu hình

### 8.1 Đã chốt

- TST-01: Platform Staff được phân công chạy test; JSON cho API/Webhook và CSV/Excel cho kênh file.
- TST-02: Dùng cùng logic mapping, validation và Rule Engine như production. Test không đồng nghĩa bỏ các kiểm tra dữ liệu.
- TST-03: Hiển thị lỗi hoặc bình thường/bất thường, cùng rule đã khớp, điều kiện và mô tả.
- TST-04: Không tạo transaction, alert, case, feedback huấn luyện hay thống kê production.
- TST-05: Không lưu lâu dài file/payload test. Dữ liệu chỉ xử lý tạm, dọn sau xử lý, không ghi bản rõ vào log.
- TST-06: Chỉ lưu dấu vết: người chạy, thời điểm, phiên bản cấu hình và số kết quả/lỗi; không lưu nội dung giao dịch mẫu trong dấu vết.
- TST-07: Con người tự đánh giá đạt/chưa đạt; không tự bàn giao chỉ vì test chạy xong.

### 8.2 Cần thiết kế

Thời gian dọn file tạm, xử lý khi job lỗi, dung lượng file, timeout, định dạng kết quả và cách tham chiếu phiên bản cấu hình. Tài liệu đặc tả khách hàng cần lưu phục vụ onboarding khác với file mẫu dùng chạy test; không áp dụng nhầm quy tắc xóa file test cho toàn bộ tài liệu đặc tả.

## 9. Free, Subscription và danh mục gói

### 9.1 Quyền và vòng đời đã chốt

| Quy tắc | Free | Subscription |
| --- | --- | --- |
| Thời hạn | Không thời hạn | 1 tháng hoặc 1 năm |
| Detection giao dịch mới | Rule Engine | AI; khi AI lỗi dùng rule fallback |
| Cảnh báo | Rule Alert | AI Alert hoặc Rule Alert khi fallback |
| Mở case từ AI Alert | Không | Operator quyết định mở |
| Cấu hình mapping/rule | Staff hỗ trợ | Staff hỗ trợ |
| Thanh toán v1 | Không | Platform Admin cấp/gia hạn thủ công |

- PLN-01: Gói áp dụng theo workspace; role và phạm vi đối tượng vẫn được kiểm tra riêng.
- PLN-02: Lựa chọn ở landing page là nhu cầu ban đầu. Platform Admin có thể đổi gói theo thỏa thuận, kích hoạt, gia hạn và điều chỉnh thời hạn.
- PLN-03: Cấp Subscription khi onboarding thì bắt đầu tính hạn lúc SME Admin xác nhận bàn giao. Nâng cấp workspace đã vận hành thì bắt đầu khi kích hoạt thành công.
- PLN-04: Gia hạn còn hiệu lực cộng vào ngày hết hạn hiện tại; đã hết hạn tính từ lúc kích hoạt lại. Tính theo tháng/năm lịch; nếu ngày tương ứng không tồn tại lấy ngày cuối tháng.
- PLN-05: Hết hạn hoặc bị Admin hạ về Free trước hạn: giao dịch mới chạy rule, không mở case mới kể cả từ AI Alert cũ. Case đã mở tiếp tục được điều tra và hoàn tất; lịch sử/báo cáo cũ được giữ để truy cập theo quyền.
- PLN-06: AI không khả dụng không làm doanh nghiệp mất Subscription. Dùng fallback và lưu nguồn detection.
- PLN-07: Quyền phải được chặn ở backend và luồng xử lý, không chỉ ẩn UI. Free gọi API mở case trực tiếp vẫn bị từ chối.
- PLN-08: SME Admin tự mua/chọn kỳ hạn/thanh toán là hướng sau v1, chưa tạo workflow thanh toán giả trong production.

### 9.2 Quản trị danh mục gói đã chốt

- Platform Admin tạo/xem/sửa thông tin gói, tên, mô tả, giá tháng/năm và trạng thái cung cấp.
- V1 giữ hai bộ quyền Free/Subscription cố định. Tạo bản ghi gói không tạo thêm loại quyền mới. Sửa mô tả tính năng không được tự thay đổi quyền backend.
- Giá mới áp dụng cho lần cấp/gia hạn tiếp theo; lưu giá tại thời điểm cấp/gia hạn để không thay đổi lịch sử. Chưa chốt giá cụ thể, tiền tệ hay thuế; không lấy giá trong ảnh tham khảo làm giá sản phẩm.
- Gói chưa được sử dụng có thể xóa; gói đã có lịch sử sử dụng chỉ ngừng cung cấp. Khi ngừng, người đang dùng giữ quyền đến hết hạn, không cấp mới hoặc gia hạn gói đó.
- Lưu ai thay đổi gì và khi nào. Platform Admin vẫn không có quyền xem dữ liệu điều tra khách hàng.
- UI phía doanh nghiệp có thẻ so sánh gói, giá theo kỳ và trạng thái “Gói đang dùng”; chưa có bước thanh toán online.

Cần thiết kế: mốc hết hạn chính xác/múi giờ, request đang chạy lúc hạ gói, cấp trùng/gia hạn đồng thời, gói ngừng cung cấp trong onboarding và việc Admin điều chỉnh thủ công. Không mặc định các ngoại lệ đều được phép vượt trạng thái ngừng cung cấp.

## 10. AI, fallback và feedback

### 10.1 Đã chốt

- AIM-01: Mục tiêu phân loại là bình thường/bất thường, không đồng nghĩa hợp lệ/gian lận.
- AIM-02: Subscription chạy AI chính, không chạy rule đồng thời trong điều kiện bình thường; rule dùng khi AI không khả dụng.
- AIM-03: Có bất thường thì tạo AI Alert. Không tự tạo case; Operator xem rồi quyết định mở.
- AIM-04: Giao dịch xử lý bằng rule fallback khi AI lỗi được phân tích lại sau khi AI phục hồi nếu thời điểm giao dịch thuộc thời gian Subscription còn hiệu lực. Vẫn được phân tích lại khi gói hiện tại đã hết hạn; phải phân biệt các lần xử lý, không ghi đè nguồn/kết quả cũ và không bỏ qua điều kiện mở case mới.
- AIM-05: Kết quả nghiệp vụ “bất thường nhưng hợp lệ” không tự coi là AI sai. Kết luận nghiệp vụ và nhãn đánh giá model cần phân biệt.
- AIM-06: Giữ kết quả điều tra làm nguồn feedback tiềm năng. Chưa cam kết xác nhận xong là tự huấn luyện lại hoặc đưa model mới vào production.

### 10.2 Chờ nhóm AI

- Dataset, feature, thuật toán, metric và bằng chứng phát hiện các tình huống rule bỏ sót.
- Hợp đồng request/response, feature và thông tin model/service version. Đầu ra đã chốt là Normal/Anomaly kèm version; không yêu cầu confidence, explanation/evidence hay risk score.
- Timeout, retry, dấu hiệu kích hoạt fallback và batch inference.
- Chính sách phân tích bù còn cần chốt: lịch/cơ chế chạy lại, tạo/đối chiếu AI Alert sau Rule Alert fallback và tránh cảnh báo lặp. Quyền theo thời điểm giao dịch đã chốt tại AIM-04, không phụ thuộc việc gói hiện tại đã hết hạn.
- Cách dùng field nhạy cảm và chuyển kết luận thành nhãn đánh giá/huấn luyện.

Không cần chờ model để kiểm thử quyền gói và workflow bằng adapter giả lập có kiểm soát. Hợp đồng chung cần được thống nhất trước khi frontend/backend tích hợp AI thật; không tự dựng endpoint hay giả định schema ở phía consumer.

## 11. Alert, case và điều tra

### 11.1 Đã chốt

- CAS-01: Rule Alert chỉ theo dõi/đánh dấu/tra cứu, không điều tra. AI Alert do Operator xem xét để mở case.
- CAS-02: Case có thể xử lý một hoặc nhiều alert/giao dịch liên quan trong workspace; chi tiết liên kết và điều kiện gom còn cần thiết kế.
- CAS-03: Operator tự điều tra, lập báo cáo và xác nhận được; doanh nghiệp ít nhân lực không bắt buộc phải có người thứ hai.
- CAS-04: Operator có thể giao Investigator. Investigator chỉ tiếp cận case được giao và dữ liệu cần cho case, nộp báo cáo; Operator xác nhận cuối cùng.
- CAS-05: SME Admin xem tổng quan/báo cáo, không trực tiếp tham gia xử lý. Mọi bước xử lý cần có lịch sử để doanh nghiệp tra cứu.
- CAS-06: Khi mất Subscription, cho hoàn tất case đã mở theo PLN-05; không cho mở case mới bằng cách đổi tên thao tác.

### 11.2 Đề xuất, chưa chốt toàn bộ

- Trạng thái: `Đang điều tra → Chờ Operator xác nhận → Đã đóng`. Operator yêu cầu bổ sung thì quay về điều tra; phân công là thuộc tính/lịch sử riêng, không cần thêm trạng thái cho mọi lần chuyển người.
- Cho Operator mở lại case đã đóng, bắt buộc lý do; giữ nguyên báo cáo/kết luận cũ và thêm lịch sử mới. Cần chốt quyền mở lại sau hết hạn Subscription.
- Kết luận gợi ý: xác nhận gian lận, bất thường nhưng hợp lệ, cảnh báo sai, chưa đủ bằng chứng. Cần định nghĩa và enum chính thức; chưa đủ bằng chứng không tự dùng làm nhãn huấn luyện.
- Khi case có nhiều giao dịch, cần kết quả xác minh từng giao dịch để tạo feedback chính xác; không áp một nhãn chung cho tất cả chỉ vì cùng case.
- Chưa chốt một alert có thể thuộc nhiều case hay không; chưa có nghiệp vụ gộp/tách hai case đang tồn tại. Không suy từ “gom alert vào case” thành các chức năng này.

## 12. API key và Webhook

### 12.1 API key đã chốt

- KEY-01: Nền tảng cấp key cho hệ thống khách hàng gửi dữ liệu, khác tài khoản đăng nhập.
- KEY-02: Staff được phân công cấp key, SME Admin nhận và chuyển cho người phụ trách tích hợp. Key gắn cố định workspace và quyền gửi, không cấp quyền đọc dữ liệu hoặc điều tra.
- KEY-03: Chỉ hiển thị đầy đủ một lần khi cấp; lưu thông tin kiểm chứng, không có chức năng xem lại key cũ. Không đưa key vào log hoặc repo.
- KEY-04: Thu hồi làm key ngừng được chấp nhận ngay. Khi thay: cấp mới, khách cập nhật/kiểm tra, thu hồi cũ; cho phép hai key trong giai đoạn chuyển đổi.

### 12.2 Hướng Webhook đề xuất để xác nhận trong hợp đồng tích hợp

Người dùng đồng ý đi theo đề xuất của nhóm phát triển; chi tiết dưới đây là thiết kế đề xuất, chưa phải contract đã được hai bên ký duyệt:

- HTTPS và secret riêng cho kết nối, tách REST API key.
- HMAC-SHA256 bao phủ event ID, timestamp và raw body; xác thực trước mapping/processing. Secret dùng kiểm tra HMAC phải được bảo vệ bằng cơ chế quản lý secret; không áp nhầm cách chỉ lưu hash của REST API key vì server cần secret để tính HMAC.
- Kiểm tra timestamp trong cửa sổ cho phép và event ID theo kết nối để hạn chế replay; event ID khác transaction ID. Cần ký cả timestamp và event ID, không tin header chưa được xác thực.
- Gửi lại hợp lệ không xử lý thành công lần hai; lần trước thất bại vẫn phải có đường retry an toàn. Không đánh dấu hoàn tất chỉ vì đã nhận request.
- Lưu tiếp nhận bền vững trước khi xác nhận thành công theo contract; cơ chế cụ thể chưa chốt. Sau xác thực vẫn áp dụng chống trùng transaction xuyên kênh.
- Nếu tích hợp trực tiếp nhà cung cấp thứ ba phải hỗ trợ chữ ký của họ, không mặc định họ dùng contract FraudGuard.

Tham khảo thiết kế: [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md), [GitHub về xác thực chữ ký](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries). Thời gian chống replay, lưu event ID, retry/backoff, phản hồi lỗi và thay secret chưa chốt.

## 13. Bảo vệ dữ liệu nhạy cảm

### 13.1 Yêu cầu đã xác nhận

- SEC-01: Field chuẩn và field riêng đều có thể nhạy cảm. Không chỉ che trên UI; API danh sách/chi tiết mặc định không trả bản rõ nhạy cảm.
- SEC-02: Xem bản rõ là thao tác riêng, backend kiểm tra workspace, role và quyền trên đối tượng/case, rồi chỉ trả field được phép; ghi lịch sử truy cập không chứa giá trị đã giải mã.
- SEC-03: Platform Admin và Staff không có quyền xem bản rõ production. Investigator chỉ xem theo case được giao. Quyền xem bản rõ của SME Admin cần chốt riêng, không suy từ quyền quản lý.
- SEC-04: Áp dụng chính sách bảo vệ cả dữ liệu sau mapping, payload/file gốc, dữ liệu test, lỗi, log, thông báo và export. Không để bản rõ tồn tại ở nơi khác trong khi chỉ bảo vệ bảng chính.
- SEC-05: Khách hàng gửi dữ liệu cần cho detection qua HTTPS. Che trước khi gửi sẽ mất thông tin; masking trên API trả ra khác với bảo vệ đường truyền ingestion.

### 13.2 Phương án kỹ thuật đề xuất

Yêu cầu ban đầu là hash; sau đó được làm rõ là cần xem lại phục vụ điều tra. Vì hash không đảo ngược được, đề xuất mã hóa phía backend cho field cần khôi phục, kèm phân quyền giải mã. Thảo luận tiếp theo đã xác nhận chặn dữ liệu ở API; lựa chọn thư viện, quản lý khóa và quyền chi tiết cần review khi làm SDD.

- Dùng mã hóa có xác thực như AES-GCM qua thư viện chuẩn; khóa dữ liệu theo workspace và có phiên bản, khóa bảo vệ tách khỏi database/repo, quản lý bằng dịch vụ khóa phù hợp khi triển khai production.
- Có thể thêm HMAC cho định danh cần đối chiếu. Không hash số tiền/thời gian rồi kỳ vọng vẫn tính toán và so sánh được. Việc dùng HMAC không tự làm dữ liệu hoàn toàn vô danh.
- Mật khẩu tài khoản dùng cơ chế băm mật khẩu chuyên dụng; không dùng cùng cơ chế với mã hóa dữ liệu nghiệp vụ.
- Có vòng đời khóa, thay khóa, backup/khôi phục và xử lý mất khóa. Không tự phát minh thuật toán.
- Cam kết chính xác: chỉ người dùng doanh nghiệp có quyền mới được xem bản rõ qua ứng dụng. Backend xử lý detection vẫn có khả năng giải mã về kỹ thuật; không gọi đây là kiến trúc mà nền tảng không thể giải mã.

Tham khảo: [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html), [OWASP Key Management](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet), [Google Cloud về giả danh hóa](https://docs.cloud.google.com/sensitive-data-protection/docs/pseudonymization).

## 14. Tiêu chí nghiệm thu để phát triển thành test case

Đây là hành vi mục tiêu, không phải kết quả test đã chạy. Mỗi test cần dữ liệu seed, tiền điều kiện, bước chạy và kết quả pass/fail cụ thể khi đưa vào Test Plan.

| ID | Tình huống | Kết quả cần kiểm tra | Quy tắc |
| --- | --- | --- | --- |
| AC-01 | Tài khoản workspace A truy cập workspace B bằng API trực tiếp | Bị từ chối, không lộ dữ liệu B | ACC-02, ACC-05 |
| AC-02 | Tài khoản chưa đổi mật khẩu lần đầu gọi chức năng vận hành | Bị chặn cho đến khi hoàn tất đổi mật khẩu | ACC-04 |
| AC-03 | Workspace chưa bàn giao đã có Subscription | Chưa vận hành production, chưa tính kỳ hạn onboarding | ONB-02, ONB-03 |
| AC-04 | Staff đề nghị bàn giao, SME Admin yêu cầu bổ sung rồi xác nhận lần sau | Lưu lịch sử; chỉ xác nhận tiếp nhận mới mở vận hành | Mục 5 |
| AC-05 | Cùng giao dịch hợp lệ đi qua từng mapping tương ứng | Chuẩn hóa về cùng ý nghĩa; kiểm thử riêng từng kênh không bị nhiễu bởi dữ liệu trùng | ING-03, ING-07 |
| AC-06 | Hai kênh đồng thời gửi cùng ID và nội dung | Một giao dịch chính thức; không nhân đôi detection/alert do tiếp nhận lặp | Mục 6.2 |
| AC-07 | Thiếu field bắt buộc / sai kiểu | Báo rõ lỗi, không detection dữ liệu lỗi | ING-06 |
| AC-08 | File có dòng hợp lệ và dòng lỗi | Dòng hợp lệ xử lý; lỗi được chỉ ra theo dòng | ING-09 |
| AC-09 | File thiếu cột bắt buộc | Từ chối file trước xử lý | ING-09 |
| AC-10 | Field tùy chọn trống với điều kiện “khác X” | Không khớp; “không có giá trị” mới khớp | RUL-01 |
| AC-11 | Một giao dịch khớp 5 rule, một rule khác đã tắt | Một Rule Alert chứa 5 lý do; rule tắt không tham gia | RUL-02, mục 7 |
| AC-12 | Staff chạy test trên mẫu có thể gây cảnh báo | Có kết quả/lý do; không sinh dữ liệu production; dấu vết không chứa mẫu | TST-01..07 |
| AC-13 | Free gọi trực tiếp API mở case | Backend từ chối dù tự sửa UI/request | PLN-07 |
| AC-14 | Subscription nhận AI Alert | Không tự mở case; Operator được quyết định | AIM-03 |
| AC-15 | Investigator truy cập case không được giao | Từ chối, kể cả workspace có Subscription | CAS-04 |
| AC-16 | Hết hạn hoặc Admin hạ gói trước hạn | Rule cho giao dịch mới; không mở case mới; hoàn tất case cũ và xem lịch sử theo quyền | PLN-05 |
| AC-17 | Gia hạn trước/sau hết hạn, ngày cuối tháng | Mốc tính đúng theo PLN-03/04; kiểm thử múi giờ sau khi chốt | PLN-03, PLN-04 |
| AC-18 | Admin sửa giá hoặc ngừng cung cấp gói đã có người dùng | Lịch sử giá không đổi; quyền còn hạn giữ nguyên; không gia hạn gói ngừng | Mục 9.2 |
| AC-19 | AI lỗi rồi phục hồi | Fallback có nguồn, phân tích bù không tạo giao dịch mới; kết quả cũ không bị ghi đè | AIM-02, AIM-04 |
| AC-20 | Key bị thu hồi hoặc gửi sang workspace khác | Từ chối; key mới đúng workspace hoạt động trong giai đoạn chuyển đổi | KEY-02..04 |
| AC-21 | API mặc định trả giao dịch có field nhạy cảm | Response không chứa bản rõ, kể cả field ẩn trên UI | SEC-01 |
| AC-22 | Người không đủ quyền gọi API xem bản rõ | Từ chối; người đủ quyền chỉ xem đúng đối tượng và có dấu vết | SEC-02, SEC-03 |

Các ca kiểm thử xung đột/chạy thử bản mới, mở lại case và Webhook cần bổ sung sau khi chốt thiết kế tương ứng; không đánh dấu chúng đã được nghiệm thu.

## 15. Đầu vào cho ERD, SRS và SDD

### 15.1 Khái niệm dữ liệu cần xem xét

Đây là danh sách khái niệm nghiệp vụ, không phải yêu cầu tạo một bảng cho mỗi dòng hay schema đã duyệt:

| Nhóm | Khái niệm / quan hệ cần thể hiện |
| --- | --- |
| Khách hàng | Doanh nghiệp, workspace, tài khoản/role; phân biệt tài khoản nền tảng với tài khoản SME |
| Triển khai | Phân công Staff, đặc tả, tiến độ, đề nghị bàn giao, xác nhận/yêu cầu bổ sung |
| Cấu hình | Field nội bộ, phân loại nhạy cảm, mapping theo kênh, bộ rule, điều kiện, tham chiếu phiên bản |
| Test | Lượt chạy và số liệu/dấu vết; không lưu mẫu lâu dài |
| Ingestion | Giao dịch, định danh nghiệp vụ theo workspace, kênh/lượt tiếp nhận, batch và lỗi theo dòng |
| Detection | Một giao dịch có thể có nhiều lần xử lý như fallback rồi AI; nguồn và phiên bản không bị mất |
| Điều tra | Alert, case, liên kết alert/giao dịch, phân công, báo cáo, kết luận, lịch sử; nhãn feedback cần chốt |
| Gói | Danh mục gói, giá kỳ hạn, quyền gói cố định v1, lần cấp/gia hạn và lịch sử điều chỉnh |
| Tích hợp/bảo mật | API key, kết nối Webhook, trạng thái xử lý event, tham chiếu khóa mã hóa, audit |

### 15.2 Công việc tài liệu tiếp theo

1. SRS: chuyển quy tắc thành FR theo actor, tiền điều kiện, luồng chính/ngoại lệ và tiêu chí nghiệm thu; xác định các NFR có metric/ngưỡng/cách đo.
2. ERD: thống nhất định danh, cardinality, tenant scope, lịch sử và retention; không tự thêm entity từ danh sách đề xuất khi chưa cần.
3. SDD: mô tả ranh giới module, API contract, transaction boundary, xử lý đồng thời, background jobs, idempotency và quản lý khóa.
4. Test Plan: nối FR → workflow → test case; bao gồm quyền gọi API trực tiếp, lỗi kênh gửi, hết hạn gói và bảo vệ response.
5. Phân công: nhóm đã có chia workflow nhưng chi tiết chưa được cung cấp trong trao đổi; không tự gán tên thành viên/owner. Mỗi workflow cần một owner được nhóm xác nhận.

Không tự nhận các quy tắc mới trong tài liệu đã khớp code. Cần thực hiện một lượt đối chiếu riêng, ghi rõ đã có, thiếu, khác và phần nào mới là demo/stub.

## 16. Các quyết định còn mở

| ID | Nội dung cần chốt | Ảnh hưởng |
| --- | --- | --- |
| OPEN-01 | Danh sách field bắt buộc; định nghĩa trống, kiểu/format, múi giờ, mã giao dịch duy nhất | Mapping, validation, ERD |
| OPEN-02 | Phát hành/phiên bản mapping và rule; dữ liệu cũ sau đổi cấu hình | Truy vết, consistency |
| OPEN-03 | Chạy thử bản xung đột, quyền, lưu tạm/retention và so sánh | Ingestion, UI, bảo mật |
| OPEN-04 | Trạng thái case, mở lại, gom alert, kết luận từng giao dịch | ERD, phân quyền, feedback |
| OPEN-05 | Đầu ra/đầu vào AI, dataset/feature, timeout, phân tích bù và nhãn | Tích hợp và đánh giá AI |
| OPEN-06 | Xác thực Webhook cụ thể, cửa sổ timestamp, retry, retention event, thay secret | Contract và vận hành |
| OPEN-07 | Danh sách field nhạy cảm, người được xem bản rõ, khóa/backup/retention | SDD bảo mật |
| OPEN-08 | Kích hoạt/khôi phục tài khoản, khóa tài khoản và chính sách xóa dữ liệu quản trị | IAM và vòng đời dữ liệu |
| OPEN-09 | Hiệu năng realtime/batch, giới hạn upload, tải hệ thống, lưu trữ, backup/khôi phục | NFR đo được |
| OPEN-10 | Chi tiết dashboard, báo cáo, export, in-app/email và giám sát nền tảng | Proposal có yêu cầu, chưa được phân tích chi tiết |
| OPEN-11 | Ranh giới hết hạn chính xác, request đang chạy, cấp/gia hạn đồng thời và ngoại lệ plan | Vòng đời Subscription |

## 17. Đối chiếu với proposal trước khi phát hành tài liệu chính thức

| Chủ đề | Cách xử lý |
| --- | --- |
| Risk Score Gateway và điểm 0–100 | BM03 đã mô tả bỏ cơ chế chung; không đưa ngược lại vào software |
| Confidence, explanation/evidence AI | Proposal còn yêu cầu; đang chờ AI review, chưa xác nhận loại bỏ |
| Dynamic rule, onboarding và cấu hình | Chi tiết hóa trong SRS, không mặc định toàn bộ UI demo đều là yêu cầu đã duyệt |
| Plan/pricing, subdomain, quyền xem dữ liệu và bàn giao | Là các quyết định chi tiết từ trao đổi; cần trace về FR và review với nhóm |
| Phân tích bù AI, chạy thử xung đột, mở lại case | Phân biệt đã chốt và đề xuất theo từng mục; xem xét ảnh hưởng phạm vi |
| AI phát hiện case rule bỏ sót | Mục tiêu cần bằng chứng thực nghiệm, không phải kết quả đã được chứng minh |

Proposal gốc và các biểu mẫu review không được sửa trong lần tổng hợp này. Tài liệu không thay thế lượt tự review BM02 theo prompt chuẩn hoặc chứng minh repo đã sẵn sàng gắn tag review-2.
