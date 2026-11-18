# Prompt Antigravity: hoàn tất recovery Phase 2A

Sửa một lỗi còn lại sau review recovery storage. Giữ phạm vi nhỏ, bổ sung regression test, cập nhật báo cáo rồi dừng trước Phase 2B.

## 1. Bối cảnh và phạm vi

Đọc AGENTS.md, README.md, docs/ui/UI_RULES.md, docs/ui/DESIGN_SYSTEM.md, docs/antigravity-wf04-phase2a-fixes.md và docs/wf04-phase2a-report.md. Kiểm tra git status, giữ thay đổi hiện có và file untracked. Không reset, restore, stash, commit hoặc push.

Review độc lập đã xác nhận `npm run check` đạt 129/129 test và production build đạt. Hai sửa lỗi validation dữ liệu và timestamp đã đạt phạm vi review. Không sửa lại domain, UI queue, nghiệp vụ hoặc mở rộng feedback/Phase 2B.

Giữ cơ chế recovery journal; chưa cần thêm lựa chọn hủy. Dùng test StorageLike mô phỏng lỗi kết hợp kiểm tra browser luồng thật là phù hợp. Không cần vượt giới hạn sandbox để chèn lỗi vào trình duyệt.

## 2. Lỗi đã tái hiện

Trong `src/utils/workspace-storage.ts`, cuối `persistWorkspaceAndUsers`, lỗi xóa `WORKSPACE_RECOVERY_JOURNAL_KEY_V4` bị bỏ qua sau khi hai key chính đã ghi thành công. Hàm trả `ok: true`, `recoveryRequired: false` trong khi journal cũ vẫn còn.

Khi reload, `restoreWorkspaceSnapshot` thấy journal và ưu tiên `priorWorkspaceV4Raw`, dẫn đến nạp dữ liệu trước recovery thay vì dữ liệu mới vừa lưu. Người dùng có thể mất thay đổi mới nếu tiếp tục lưu bản cũ.

Kịch bản đã kiểm chứng:

1. Có workspace/users cũ và recovery journal chứa raw của bản cũ.
2. Gọi `recoverWorkspaceStorage` với workspace mới có nội dung khác rõ ràng.
3. Storage cho phép ghi hai key chính nhưng ném lỗi khi `removeItem` journal.
4. Hàm trả thành công, storage chứa bản mới, journal vẫn còn.
5. Reload trả `recovery_required` và nạp nội dung cũ từ journal.

## 3. Yêu cầu sửa

- Phân biệt rõ thao tác chưa commit và thao tác đã commit dữ liệu chính nhưng còn chờ dọn journal. Không chỉ đổi thông báo lỗi mà để reload vẫn lấy sai bản.
- Dùng trạng thái/marker commit hoặc cơ chế tương đương có thể kiểm chứng khi reload. Thiết kế tối thiểu phù hợp cấu trúc hiện tại; không xây framework transaction mới.
- Khi journal không xóa được sau commit, reload phải xác định đúng bản đã commit và không phục hồi nhầm raw cũ. Không nhận định mọi journal đều đã commit: giữ khả năng phục hồi đúng cho thao tác thực sự thất bại trước đó.
- Kiểm tra thứ tự ghi marker, dữ liệu và dọn journal. Nếu ghi marker cũng lỗi, phải bảo toàn thông tin để reload phân biệt trạng thái hoặc rollback có kiểm soát; không bịa thành công. Ghi rõ giới hạn khi nhiều thao tác storage liên tiếp cùng thất bại.
- Kết quả trả về và UI phải phản ánh đúng trạng thái: chưa hoàn tất thì không báo hoàn tất; đã commit nhưng chờ cleanup thì không khôi phục bản cũ. Không để autosave xóa dấu vết recovery chưa giải quyết.
- Retry cleanup/recovery phải idempotent, không nhân đôi case/audit và không làm mất thay đổi đã commit.
- Giữ tương thích với journal hiện có. Với journal không xác định/không hợp lệ, chặn ghi và báo lỗi có kiểm soát thay vì mặc định dùng bản cũ hoặc mới.
- Rà caller trong dashboard/hook nếu result type thay đổi. Chỉ sửa thông báo cần thiết, cả vi/en; giữ bố cục hiện tại. Nếu sửa UI/copy, áp dụng antislop theo AGENTS với mode during đã chọn trong phiên.

## 4. Regression test bắt buộc

1. Tái hiện đúng kịch bản mục 2 trước sửa: hai key ghi được, chỉ remove journal lỗi, reload lấy nhầm bản cũ.
2. Sau sửa, cùng kịch bản không làm mất bản mới; trạng thái trả về và reload phù hợp với kết quả commit/cleanup thực tế.
3. Retry sau khi bỏ lỗi remove dọn xong journal; reload ready, nội dung vẫn là bản đã commit.
4. Lặp retry không tạo thêm case/report/audit hoặc thay đổi timestamp nghiệp vụ.
5. Lỗi ghi workspace, lỗi users, rollback lỗi và journal pending thật vẫn đi đúng đường recovery cũ; không bị coi nhầm là commit thành công.
6. Lỗi ghi marker commit (nếu có), lỗi cleanup lặp lại và journal cũ được xử lý có kiểm soát; kiểm tra dữ liệu còn giữ được sau reload.
7. Demo restore giữ preDemoSnapshot khi chưa commit, chỉ dọn khi đủ điều kiện; cleanup thất bại không làm mất đường phục hồi hoặc kéo người dùng về dữ liệu cũ sai thời điểm.

Kiểm tra qua public storage functions và ít nhất đường caller/retry liên quan nếu thay đổi kết quả trả về. Giữ assertion test cũ, không nới validation để test đạt.

## 5. Bàn giao

- Chạy tuần tự `npm run check` rồi `npm run build`, ghi số test và exit code thực tế.
- Nếu có thay đổi UI/trạng thái lỗi, kiểm tra thông báo và nút retry; phân biệt test mô phỏng lỗi với thao tác browser thực tế.
- Cập nhật `docs/wf04-phase2a-report.md`: nguyên nhân, thiết kế commit/cleanup, bằng chứng reload/retry và giới hạn storage còn lại.
- Cập nhật mốc sửa trong `docs/task.md`. Không tích hoàn thành Phase 2B/feedback.
- Tóm tắt file thay đổi và kết quả kiểm chứng. Dừng để review trước Phase 2B.
