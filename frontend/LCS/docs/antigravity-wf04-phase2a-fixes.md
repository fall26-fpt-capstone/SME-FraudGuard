# Prompt Antigravity: sửa sau review WF-04 Phase 2A

Sửa ba vấn đề đã tái hiện trong Phase 2A, thêm regression test và cập nhật báo cáo. Dừng trước Phase 2B. Không thiết kế lại UI hoặc triển khai soạn/duyệt báo cáo, feedback, BE hay AI service.

## 1. Đọc trước khi sửa

Đọc `AGENTS.md`, `README.md`, `docs/ui/UI_RULES.md`, `docs/ui/DESIGN_SYSTEM.md`, `docs/task.md`, `docs/antigravity-wf04-phase2a.md`, `docs/wf04-phase2a-report.md` và prompt này. Kiểm tra branch/git status; giữ nguyên thay đổi có sẵn và file untracked. Không reset, restore, stash, commit hoặc push.

Kết quả review độc lập: `npm run check` đạt 120/120 test, `npm run build` đạt. Ba tình huống dưới đây vẫn tái hiện được ngoài suite hiện tại. Không lấy số test đạt làm bằng chứng rằng các lỗi đã được xử lý.

Phạm vi chính: `src/utils/workspace-storage.ts`, `src/hooks/useInvestigationCases.ts`, các đường persist/demo trong `FraudGuardDashboard.tsx`, helper demo/migration nếu cần, test và tài liệu. Chỉ thay đổi liên quan trực tiếp; không nới guard domain WF-01/WF-04 đã review. Giữ `src/services/.gitkeep`, không thêm dependency.

Nếu chỉnh UI/copy, áp dụng skill antislop theo AGENTS; người dùng đã chọn `during` trong phiên. Giữ bố cục danh sách và giao diện hiện tại. Cập nhật vi/en cho thông báo mới nếu có.

## 2. Bước 1: validation dữ liệu khi restore

### Lỗi đã tái hiện

`isValidInvestigationCaseShape` chỉ kiểm tra `alerts`, `reports`, `history` là mảng. Một workspace v4 chứa case với `alerts: [null]` vẫn được `restoreWorkspaceSnapshot` chấp nhận với `status: ready`, `canPersist: true`. Khi lọc transactions cho Investigator được giao, code lỗi `Cannot read properties of null (reading 'transactionId')`.

`legacyCaseArchive` và `preDemoSnapshot` cũng cần kiểm tra các trường thực sự được caller sử dụng, không chỉ xác nhận là object/mảng rồi ép kiểu TypeScript.

### Yêu cầu sửa

- Viết validator runtime có thể tái sử dụng tại ranh giới restore; kiểm tra cấu trúc lồng nhau trước khi đưa vào state hoặc gọi helper nghiệp vụ.
- Case: ID/tenant/trạng thái hợp lệ; các alert link có trường bắt buộc đúng kiểu; danh sách alert ID nhất quán, không trùng; actor refs, thời điểm, báo cáo, kết luận và lịch sử đúng cấu trúc cần dùng. Kiểm tra liên kết report/version khi có trạng thái Pending Review/Closed. Không truy cập thuộc tính phần tử trước khi kiểm tra nó là object hợp lệ.
- Archive: kiểm tra transactionIds, alertIds và transactions, thông tin phạm vi/assignee nếu có, cùng các trường dùng để đọc và chặn tạo trùng. Archive được phép thiếu provenance vì mục đích chính là bảo toàn dữ liệu legacy; không áp nguyên model case mới để loại bỏ dữ liệu gốc.
- Pre-demo snapshot: kiểm tra đầy đủ các slice và users cần để khôi phục, không chấp nhận `{}` hoặc snapshot có dữ liệu con sai kiểu. Trạng thái demo active phải có snapshot khôi phục hợp lệ.
- Workspace có dữ liệu hỏng trả kết quả lỗi có kiểm soát, chặn persist để giữ nguyên raw storage. Không im lặng lọc bỏ phần tử lỗi rồi lưu đè; không tự sửa dữ liệu hỏng thành dữ liệu hợp lệ bằng cách bịa actor/time/report.
- Cập nhật validator và xử lý lỗi nhất quán cho đường restore/demo có liên quan. Không mở rộng thành viết lại toàn bộ domain.

### Regression test

1. Case có `alerts: [null]`, alert thiếu transactionId hoặc sai kiểu: restore bị chặn, raw storage không đổi, không crash.
2. Reports/history chứa null hoặc field sai kiểu: trả lỗi có kiểu; không lọt đến `.map`, đọc actor hoặc parse timestamp gây exception.
3. Alert IDs trùng/không khớp link, trạng thái không hợp lệ, tham chiếu report không tồn tại: bị xử lý có kiểm soát.
4. Archive thiếu mảng caller cần dùng hoặc có transaction null: restore không đưa vào state hoạt động.
5. `preDemoSnapshot: {}` hoặc users/slice bên trong hỏng: không bật chức năng khôi phục gây crash/ghi đè nguồn.
6. Workspace v4 hợp lệ, archive legacy hợp lệ và snapshot trước demo hợp lệ vẫn restore được. Giữ test idempotency và tenant isolation.

## 3. Bước 2: bỏ việc tự sửa thời gian thao tác

### Lỗi đã tái hiện

Trong `useInvestigationCases.ts`, `resolveMonotonicTimestampForCase` tự nâng thời gian lên sau updatedAt/history, và fallback về `Date.now()` nếu parse lỗi.

Case tạo lúc `2026-11-15T10:00:00Z`; gọi `executeSelfAssignCaseAction` với `now: () => '2026-11-15T09:00:00Z'`, không truyền `at`: kết quả vẫn thành công với event `2026-11-15T10:00:00.001Z`. Hook đã thay đầu vào để vượt guard thứ tự thời gian của Phase 1.

### Yêu cầu sửa

- Lấy timestamp từ `at` được cung cấp hoặc clock hiện tại/demo được chọn rõ ràng, truyền nguyên thời điểm đó vào domain. Có thể chuẩn hóa chuỗi tương đương cùng instant, không thay instant.
- Không tự cộng 1 ms, clamp theo history, hoặc fallback sang thời điểm khác để che timestamp không hợp lệ.
- Nếu clock đi ngược, để domain trả `TIMESTAMP_OUT_OF_ORDER`; nếu sai định dạng, trả `INVALID_TIMESTAMP`. Không tạo event/audit, không thay case hoặc persist khi command thất bại. UI giải thích lỗi phù hợp, không báo thành công.
- Giữ quy tắc domain cho phép hai thao tác cùng timestamp và xử lý offset theo thời gian tuyệt đối. Không sửa domain để cho phép lịch sử đi ngược.
- Nếu dùng clock demo, áp dụng nhất quán, có cấu hình rõ ràng và ghi trong báo cáo; không ngầm chọn thời điểm tương lai dựa vào case.

Người dùng đã xác nhận: dữ liệu vẫn giữ timestamp đầy đủ đến mili giây; UI có thể hiển thị rút gọn, ví dụ `10:00`. Danh sách cảnh báo mới nhất trước phải sort bằng timestamp đầy đủ, không sort bằng chuỗi hiển thị đã rút gọn. `.005` phải đứng trước `.001` dù cả hai hiển thị `10:00`. Đây là cách trình bày/sắp xếp, không cho phép tự sửa timestamp.

### Regression test

1. Cả assign và selfAssign với clock 09:00 trên case cập nhật 10:00 đều thất bại, không bị đổi thành 10:00:00.001.
2. Clock trả timestamp sai định dạng không fallback sang thời gian thực.
3. Clock bằng mốc trước được chấp nhận; clock sau mốc trước được ghi đúng instant đầu vào, không tự cộng thêm.
4. Offset khác nhau nhưng cùng instant được xử lý đúng.
5. Lỗi không thay state/history/audit/storage; case mở hợp lệ trước expiry vẫn xử lý được sau expiry với thời gian hợp lệ.
6. Kiểm tra sorting cảnh báo dùng timestamp đầy đủ với hai giá trị cách nhau vài ms. Nếu hiện đã đúng, giữ nguyên UI và bổ sung test phù hợp; không redesign hoặc đổi trường thời gian nghiệp vụ dùng để sort.

## 4. Bước 3: lưu/khôi phục workspace và users nhất quán

### Lỗi đã tái hiện

`mergeAndPersistWorkspaceSlice` ghi workspace trước rồi ghi users. Nếu users gặp quota lỗi, rollback workspace chỉ xảy ra khi `previousRawV4 !== null`. Khi chưa có v4, hàm trả thất bại nhưng key v4 mới vẫn tồn tại, trong khi users chưa được ghi.

Các handler bật demo/khôi phục trước demo cũng gọi persist workspace và users riêng. Cần kiểm tra trường hợp workspace ghi thành công, users thất bại, đặc biệt khi khôi phục làm mất preDemoSnapshot trong workspace trước khi toàn bộ thao tác hoàn tất.

### Yêu cầu sửa

- Có một coordinator dùng chung cho các thao tác cần lưu workspace và users cùng nhau. Rà onboarding, bật demo, khôi phục trước demo và retry; không sửa một helper nhưng để các caller tiếp tục ghi riêng gây cùng lỗi.
- Bảo toàn trạng thái trước ghi của cả hai key, kể cả trường hợp key không tồn tại. Không bắt lỗi đọc key rồi mặc định coi là chưa có dữ liệu và tiếp tục ghi.
- Khi một phần thất bại, khôi phục các phần đã ghi về đúng trạng thái ban đầu. Nếu key trước đó chưa tồn tại, rollback phải xóa đúng key vừa tạo, không xóa key/dữ liệu khác. Dùng API storage có contract rõ và cập nhật test doubles.
- localStorage không có transaction nhiều key. Nếu rollback cũng thất bại, trả lỗi thể hiện còn trạng thái không nhất quán, giữ thông tin/bản phục hồi cần thiết và có đường retry/recovery. Không tuyên bố atomic tuyệt đối khi chưa bảo đảm được.
- Không bỏ preDemoSnapshot/bản backup cuối cùng cho đến khi khôi phục cả workspace và users thành công. Nếu cần recovery journal, thiết kế tối thiểu và kiểm tra trạng thái đó khi reload trước khi ghi tiếp.
- Chọn chính sách UI nhất quán: rollback state hoặc giữ thay đổi trong bộ nhớ với trạng thái chưa lưu. Các effect autosave không được tự ghi đè rollback, xóa cảnh báo lỗi users khi chỉ workspace lưu thành công, hoặc coi khôi phục demo đã hoàn tất trong khi dữ liệu người dùng còn lệch.
- Giữ dữ liệu gốc khi storage lỗi. Không reset workspace/demo hoặc yêu cầu người dùng clear localStorage để xử lý.

### Regression test

1. Ban đầu chưa có v4: workspace ghi được, users thất bại; sau rollback v4 không còn, users/raw nguồn cũ không đổi.
2. Ban đầu có cả hai key: users thất bại thì raw workspace/users được giữ nguyên chính xác.
3. Workspace ghi thất bại: users không bị đổi và state không báo đã lưu thành công.
4. Đọc dữ liệu trước ghi bị lỗi: dừng trước khi ghi; không coi là key rỗng.
5. Rollback lỗi: báo trạng thái cần recovery, không báo thành công; retry/reload có đường phục hồi, không mất snapshot trước demo.
6. Bật demo và khôi phục demo, lỗi riêng trên users: không mất dữ liệu trước demo và không để effect autosave hợp thức hóa trạng thái ghi dở dang.
7. Retry thành công khôi phục cả hai phần, xóa cảnh báo đúng lúc; không nhân đôi case/audit và không reset dữ liệu người dùng.

Test cần bao gồm coordinator/caller hoặc hook integration phù hợp, không chỉ kiểm tra helper riêng trong khi UI vẫn đi đường khác. Giữ nguyên các kiểm tra restore JSON hỏng/version không hỗ trợ/backup thất bại của Phase 2A.

## 5. Bàn giao

1. Tái hiện regression trước sửa, xác nhận chúng thất bại đúng nguyên nhân; giữ assertion của test cũ, chỉ cập nhật input khi chữ ký thay đổi có lý do.
2. Chạy tuần tự `npm run check` và `npm run build`; ghi số test/exit code thực tế. Không chạy dev và build đồng thời cùng `.next`.
3. Kiểm thử trình duyệt phần chịu ảnh hưởng: tạo case, phân công/tự đảm nhận, reload, bật/khôi phục demo, retry lưu. Kiểm thử lỗi storage bằng môi trường demo cô lập, không sửa hoặc xóa workspace đang dùng của người dùng. Ghi rõ phần kiểm tra bằng test tự động và phần thực sự thao tác trên browser.
4. Cập nhật `docs/wf04-phase2a-report.md`: ba nguyên nhân, cách sửa, regression evidence, kết quả kiểm tra, giới hạn recovery/concurrency. Cập nhật mốc tương ứng trong `docs/task.md`, không tích Phase 2B/feedback.
5. Tóm tắt file thay đổi, lỗi đã xử lý và điểm còn cần review. Dừng trước Phase 2B, không tự mở rộng nghiệp vụ.
