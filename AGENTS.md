# Hướng dẫn chung cho coding agent

Áp dụng cho toàn bộ repo SME-FraudGuard, đồ án phát hiện gian lận giao dịch cho SME của nhóm 4 thành viên. Mỗi thành viên chịu trách nhiệm hiểu, kiểm tra và giải thích được thay đổi do agent hỗ trợ.

## Trước khi làm

- Đọc yêu cầu, `README.md` ở gốc và README của phần sắp sửa. Đọc thêm `AGENTS.md` trong thư mục liên quan; hướng dẫn ở thư mục con bổ sung quy định riêng cho phạm vi đó.
- Kiểm tra nhánh và `git status` trước khi sửa. Thay đổi có sẵn có thể là công việc của thành viên khác; không ghi đè, hoàn tác hoặc xóa nếu chưa được yêu cầu.
- Xác định phạm vi: phần nào cần sửa, nơi gọi, hợp đồng API, dữ liệu và kiểm thử bị ảnh hưởng. Chỉ đọc thêm tài liệu cần cho công việc hiện tại.
- Bám theo phạm vi nghiệp vụ đã được nhóm thống nhất. Nếu yêu cầu mâu thuẫn với tài liệu hoặc cần đổi hợp đồng dùng chung, nêu rõ để nhóm thống nhất trước khi thực hiện phần phụ thuộc.

## Cấu trúc và ranh giới

- `backend/`: Java 21, Spring Boot, Maven Wrapper; giữ kiến trúc modular monolith và ranh giới `api` / `internal` theo `backend/README.md`.
- `frontend/LCS/`: dashboard Next.js; tuân thủ `frontend/LCS/AGENTS.md` và tài liệu UI mà file đó chỉ định.
- `frontend/LCS_landingpage/`: ứng dụng landing page độc lập; dùng README và package scripts riêng.
- `ai-service/`, `database/`, `infra/`: kiểm tra nội dung thực tế trước khi làm; không tự giả định đã có triển khai hay hợp đồng tích hợp.
- `docs/`: tài liệu đồ án; tuân thủ `docs/README.md`. Phân biệt tính năng đã chạy với kế hoạch, stub và dữ liệu demo khi viết tài liệu.

## Cách thay đổi code

- Làm thay đổi nhỏ nhất giải quyết đầy đủ yêu cầu. Tái sử dụng helper, component, thư viện và cách tổ chức sẵn có.
- Không tự mở rộng tính năng, thêm dependency, đổi kiến trúc, refactor diện rộng hoặc format file không liên quan.
- Khi sửa lỗi, tìm các nơi gọi và sửa nguyên nhân ở chỗ dùng chung. Khi đổi hợp đồng, cập nhật đầy đủ bên sử dụng và kiểm thử liên quan trong phạm vi đã thống nhất.
- Giữ kiểm tra đầu vào, xử lý lỗi, phân quyền và cô lập tenant. Không coi dữ liệu phía trình duyệt là bằng chứng xác thực hay quyền truy cập.
- Không đưa mật khẩu, token, API key, file môi trường cá nhân hoặc dữ liệu khách hàng thật lên Git hay vào log.
- Không sửa migration đã được áp dụng trên môi trường dùng chung; thêm migration mới. Không xóa dữ liệu, reset database hay chạy lệnh phá hủy nếu chưa được cho phép cụ thể.
- Với logic mới hoặc sửa hành vi, thêm hoặc cập nhật kiểm thử phù hợp. Thay đổi tài liệu thuần túy không cần chạy toàn bộ ứng dụng.

## Git và phối hợp nhóm

- Mỗi công việc dùng một nhánh riêng, theo quy ước tên nhánh của nhóm; chưa có quy ước thì dùng `feat/`, `fix/` hoặc `docs/` kèm tên việc.
- Không triển khai thay đổi trực tiếp trên `main`. Không tự commit, push, merge PR hoặc force-push nếu chưa được yêu cầu; trưởng nhóm review và merge vào `main`.
- Trước khi sửa hợp đồng API, schema hoặc file dùng chung, nêu phạm vi ảnh hưởng để thành viên phụ trách phối hợp. Nhánh riêng vẫn có thể xung đột khi cùng sửa một file.
- Không tự stash, reset, clean hoặc giải quyết xung đột bằng cách bỏ thay đổi của người khác. Nếu không xác định được ý định của hai bên, dừng phần xung đột và báo lại.
- Giữ diff đúng phạm vi công việc. Chỉ cập nhật lockfile khi thay đổi dependency có liên quan.

## Context và tài liệu của agent

- `AGENTS.md` gốc chứa quy ước chung, không chứa nhật ký phiên làm việc, tiến độ cá nhân hoặc danh sách việc tạm.
- Không tự tạo thêm file memory, context, plan, handoff, báo cáo phiên hoặc bản sao hướng dẫn trong repo. Chỉ tạo khi được yêu cầu hoặc công việc cần một tài liệu bàn giao cụ thể.
- Nếu cần ghi nhớ riêng, dùng nơi lưu cá nhân ngoài repo hoặc thư mục local đã được Git bỏ qua. Kiểm tra ignore thực tế trước khi lưu; có thể dùng `.git/info/exclude` cho quy tắc chỉ áp dụng trên máy cá nhân.
- Tài liệu dùng chung phải có ích cho nhóm: hướng dẫn chạy, quyết định thiết kế, hợp đồng, kiểm thử. Cập nhật tài liệu hiện có trước khi tạo file mới.
- Không tự sửa hướng dẫn chung để hợp thức hóa cách làm trong một tác vụ. Thay đổi quy ước phải được nhóm review như code.

## Kiểm tra và bàn giao

Chạy lệnh trong đúng thư mục của phần đã thay đổi:

| Phần | Kiểm tra |
| --- | --- |
| Backend | Trong `backend/`: `./mvnw.cmd clean verify` trên Windows hoặc `./mvnw clean verify` trên Unix; integration test cần Docker. |
| Dashboard | Trong `frontend/LCS/`: `npm run check` và `npm run build`. |
| Landing page | Trong `frontend/LCS_landingpage/`: `npm run typecheck` và `npm run build`. |
| Phần khác | Theo README và công cụ kiểm tra hiện có của phần đó. |

- Dùng npm với lockfile đã commit cho frontend; khi cần cài dependency, dùng `npm ci`.
- Báo chính xác lệnh đã chạy, kết quả, kiểm thử bị bỏ qua và hạn chế môi trường. Không khẳng định đã kiểm chứng nếu chưa chạy; build thành công không thay thế kiểm thử nghiệp vụ.
- Khi bàn giao, tóm tắt đã đổi gì, lý do, cách kiểm tra và rủi ro còn lại bằng lời dễ hiểu để thành viên phụ trách review và giải thích khi bảo vệ.
