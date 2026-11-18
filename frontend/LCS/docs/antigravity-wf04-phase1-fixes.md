# Prompt Antigravity: sửa sau review WF-04 Phase 1

Sửa ba vấn đề đã tái hiện trong domain WF-04, bổ sung regression test, cập nhật tài liệu bàn giao rồi dừng trước Phase 2. Không triển khai UI trong đợt này.

## 1. Phạm vi và baseline

Đọc `AGENTS.md`, `README.md`, `docs/ui/UI_RULES.md`, `docs/ui/DESIGN_SYSTEM.md`, `docs/antigravity-wf04-phase1.md`, `docs/task.md` và `docs/wf04-phase1-report.md`. Kiểm tra branch, git status và code hiện tại trước khi sửa. Giữ nguyên thay đổi của người khác, kể cả untracked; không reset, restore, stash, commit hoặc push.

Đợt review độc lập đã chạy đạt `npm run check` (108/108 test) và `npm run build`. Ba lỗi dưới đây được tái hiện bằng lời gọi public functions; bộ test hiện tại chưa bắt được. Baseline đạt không có nghĩa đã đáp ứng các trường hợp này.

File được sửa:

- `src/types/investigation-case.ts`.
- `src/utils/investigation-case.ts`.
- `tests/investigation-case.test.cjs`.
- `docs/wf04-phase1-report.md`, `docs/task.md`.

Không sửa UI, CSS, translations, hooks, localStorage, fixtures đang dùng trên UI, domain WF-01 hoặc legacy `case-workflow.ts`. Giữ `src/services` chỉ có `.gitkeep`. Không thêm dependency hoặc triển khai BE/AI. Không thay các quyết định nghiệp vụ đã chốt.

## 2. Bước 1: bắt buộc nguồn case hiện có khi tạo case

Hiện `CreateInvestigationCaseInput.existingCases` là tùy chọn; hàm tạo dùng `input.existingCases ?? []`. Hai lời gọi tạo case khác ID với cùng alert, không truyền existingCases, đều thành công. Vì hàm thuần không thay đổi transaction nguồn, caller dễ tạo liên kết trùng mà không nhận lỗi.

Yêu cầu sửa:

- Đổi `existingCases` thành trường bắt buộc trong TypeScript.
- Runtime từ chối thiếu trường, undefined, null hoặc giá trị không phải mảng; không mặc định thành mảng rỗng. Trả lỗi nghiệp vụ có kiểu.
- `[]` được phép khi workspace thực sự chưa có case. Caller phải truyền danh sách case hiện tại đầy đủ để kiểm tra liên kết, gồm cả Closed; không chỉ danh sách đang hiển thị, phân trang hoặc kết quả lọc UI.
- Giữ kiểm tra ID case trùng, alert đã liên kết, liên kết legacy và tính toàn vẹn của thao tác tạo nhiều alert. Không mutate input hoặc tạo liên kết một phần khi thất bại.
- Cập nhật tất cả lời gọi domain mới trong test/ví dụ để truyền danh sách đúng. Không thêm `[]` một cách máy móc cho lời gọi đang có case trước đó.

Regression test:

1. Bỏ trường, truyền undefined/null/object đều thất bại và không sinh case/event.
2. Truyền `[]` lần đầu tạo case thành công.
3. Tạo lần hai cùng alert, truyền case lần đầu vào existingCases: bị chặn; áp dụng cả case Open và Closed.
4. Lần hai dùng ID case trùng bị chặn; lần hai chọn alert khác hợp lệ vẫn thành công.

Giới hạn phải ghi rõ: hàm thuần không thể phát hiện caller cố tình truyền `[]` hoặc state cũ. Sửa này ngăn thiếu đầu vào một cách vô ý, không phải cơ chế chống đồng thời. Phase 2 phải gọi với state mới nhất; BE sau này chịu trách nhiệm ràng buộc duy nhất và cập nhật nguyên tử.

## 3. Bước 2: khóa xác nhận vào đúng báo cáo Operator đang review

Hiện `ConfirmInvestigationCaseReportInput.reportId` và `reportVersion` đều tùy chọn. Khi không truyền, hàm tự lấy báo cáo đang pending. Nếu UI đang xem v1 nhưng state đã có v2, thao tác thiếu định danh sẽ xác nhận v2 dù người dùng chưa review v2.

Yêu cầu sửa:

- Bắt buộc cả reportId và reportVersion trên input xác nhận, tại type và runtime.
- Từ chối ID rỗng/không hợp lệ và version thiếu, không nguyên dương hoặc không hợp lệ. Không tự điền từ pending state để hợp thức hóa command thiếu dữ liệu.
- Đối chiếu cặp ID/version được yêu cầu với đúng báo cáo hiện đang Pending Review và phiên bản mới nhất. Chặn cả ID cũ, version cũ, ID/version ghép sai và báo cáo không tồn tại.
- Chỉ xác nhận thành công mới sinh conclusion/event và chuyển Closed. Lỗi giữ nguyên state và lịch sử.
- Không thay yêu cầu Operator tự điều tra được tự xác nhận; chỉ cần truyền đúng báo cáo đã xem.
- Cập nhật ví dụ bàn giao để lấy ID/version từ báo cáo được hiển thị cho người review. Không khuyên caller tự lấy phiên bản mới nhất vào lúc click nhằm bỏ qua xung đột.

Regression test:

1. Thiếu cả hai, thiếu từng trường, ID trắng, version 0/âm/lẻ/NaN bị chặn.
2. Tạo v1 → yêu cầu bổ sung → gửi v2. Dùng state v2 nhưng command mang ID/version v1 phải thất bại.
3. ID v1 + version v2, ID v2 + version v1, ID không tồn tại đều thất bại.
4. Đúng ID/version v2 thành công; conclusion tham chiếu đúng v2 và giữ kết quả riêng từng alert.
5. Cùng Operator tự điều tra vẫn gửi rồi xác nhận được qua hai bước riêng.

Không áp dụng yêu cầu ID bắt buộc này vào input gửi báo cáo mới một cách không cần thiết; lỗi được review nằm ở command xác nhận. Kiểm soát đồng thời phía server vẫn là điểm nối tương lai.

## 4. Bước 3: không cho thời gian xử lý đi ngược lịch sử

Hiện mỗi command chỉ kiểm tra timestamp đúng ISO. Review tái hiện case tạo lúc `2026-11-15T10:00:00Z` nhưng đóng lúc `2026-11-15T09:00:00Z` vẫn thành công.

Yêu cầu sửa:

- Dùng helper chung để kiểm tra thời điểm chuyển trạng thái hợp lệ và không trước `createdAt`, `updatedAt` hoặc sự kiện gần nhất trong lịch sử case. Đối chiếu bằng thời gian tuyệt đối sau parse, không so chuỗi ISO vì có offset khác nhau.
- Kiểm tra các mốc dùng để đối chiếu cũng hợp lệ; không để timestamp hỏng biến thành NaN rồi vượt guard. Nếu lịch sử/state có mốc mâu thuẫn, trả lỗi có kiểu thay vì âm thầm sửa quá khứ.
- Áp dụng cho phân công Investigator, Operator tự đảm nhận, gửi báo cáo, yêu cầu bổ sung và xác nhận/đóng.
- Cho phép hai thao tác cùng timestamp; thứ tự vẫn được biểu diễn bằng thứ tự event. Không bắt buộc chênh một millisecond.
- Không dùng `Date.now()` để sửa thời điểm, không tự tăng timestamp, không đổi quy tắc Subscription: case cũ vẫn xử lý sau expiry, case mới phải đáp ứng điều kiện mở.

Regression test:

1. Mỗi command trên đều từ chối thời điểm trước lần cập nhật trước đó; không thay input hoặc sinh event khi lỗi.
2. Đóng trước lúc tạo, gửi báo cáo trước lúc phân công, yêu cầu bổ sung trước lúc gửi đều bị chặn.
3. Thời điểm bằng và sau mốc trước được chấp nhận nếu các điều kiện nghiệp vụ khác hợp lệ.
4. Hai chuỗi ISO khác offset nhưng cùng thời điểm được xử lý như nhau; thời điểm thực sự trước mốc bị chặn dù cách viết chuỗi khác.
5. Mốc createdAt/updatedAt/history không hợp lệ bị xử lý có kiểm soát, không throw bất ngờ hoặc lọt guard.
6. Kịch bản mở case khi gói còn hiệu lực rồi gửi/bổ sung/duyệt sau expiry vẫn thành công theo thứ tự thời gian; tạo case mới sau expiry vẫn bị chặn.

## 5. Bước 4: kiểm chứng và bàn giao

- Viết regression test chứng minh từng lỗi trước sửa rồi chạy lại sau sửa. Test bằng public functions và dữ liệu WF-01 hợp lệ; không mock toàn bộ guard thành true.
- Có thể cập nhật input của test hiện có theo chữ ký mới, nhưng giữ nguyên ý nghĩa/assertion của test. Không xóa hoặc nới assertion để bộ test đạt.
- Chạy tuần tự `npm run check`, `npm run build` trong `frontend/LCS`. Ghi số test và exit code thực tế. Nếu sandbox gây `spawn EPERM`, phân biệt hạn chế môi trường với lỗi code và dùng quy trình cấp quyền của môi trường; không ghi build/test đạt nếu chưa hoàn tất.
- Cập nhật `docs/wf04-phase1-report.md`: ba vấn đề, cách sửa, chữ ký mới, ví dụ đúng, regression tests, kết quả kiểm tra và giới hạn state/concurrency còn lại.
- Cập nhật `docs/task.md` bằng mốc sửa sau review Phase 1. Không tích hoàn thành UI, migration, feedback hoặc toàn bộ WF-04.
- Kiểm tra diff, liệt kê đúng file đã sửa và xác nhận phần UI/storage/legacy không thuộc đợt này.

Dừng sau khi bàn giao; chưa bắt đầu Phase 2. Không cần hỏi lại ba quy tắc đã được người dùng chấp thuận trong đợt review này.
