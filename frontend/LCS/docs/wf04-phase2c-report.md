# WF-04 Phase 2C — Báo cáo bàn giao

Ngày 17/11/2026. Tiếp quản phần triển khai còn dở của Antigravity theo `antigravity-wf04-phase2c.md`. Phạm vi: frontend SME Admin chủ động gửi kết quả đã xác nhận và Platform Admin xem bản đã gửi. Chưa dọn demo/legacy và chưa kết nối BE/AI.

## 1. Kết quả nghiệp vụ

SME Admin mở báo cáo Closed của doanh nghiệp mình, xem trước tổng kết, kết luận và bằng chứng/kết quả riêng cho tất cả alert. Có thể thêm nhận xét (tối đa 2.000 ký tự), hủy hoặc xác nhận gửi. Nhận xét chưa gửi nằm trong bộ nhớ; đóng khi đã nhập yêu cầu xác nhận bỏ.

Sau gửi, bản feedback chỉ đọc và có người gửi/thời điểm. Mỗi enterpriseId/caseId/reportId/reportVersion gửi một lần. Double click bị chặn bằng collection mới nhất, không chỉ khóa nút. Case vẫn Closed và không bị sửa khi gửi. Đóng case không tự tạo feedback.

PA xem danh sách trên trang Tình trạng hệ thống và chi tiết bản đã gửi. Không có quyền mở case nội bộ qua feedback. Hai alert có kết quả khác nhau được giữ riêng. Chưa có enum nhãn đánh giá, duyệt/từ chối, thu hồi, gửi lại bản thay thế hoặc retraining.

Các lựa chọn gửi toàn bộ phiên bản, nhận xét tùy chọn và một bản gửi/phiên bản là phạm vi triển khai tối thiểu trong prompt, không phải trích dẫn quy định nguyên văn của proposal.

## 2. Model và quyền

`src/types/report-feedback.ts` định nghĩa InvestigationReportFeedback cùng snapshot gồm doanh nghiệp, case/report ID và version, tổng kết báo cáo, kết luận cuối, người/thời gian xác nhận và gửi, nhận xét, kết quả/bằng chứng văn bản mỗi alert. Snapshot chỉ lấy các trường được cho phép, không lấy toàn bộ transaction/case hoặc lịch sử báo cáo.

`src/utils/report-feedback.ts` cung cấp preview, submit, read list/detail, tìm bản đã gửi và validate restore. Submit xác minh actor qua danh bạ, case Closed, đúng phiên bản được xác nhận, timestamp không trước xác nhận, và chống bản trùng. Snapshot được clone/freeze, không phụ thuộc thay đổi object nguồn.

| Role | Gửi | Xem feedback |
| --- | --- | --- |
| SME Admin | Báo cáo đã xác nhận cùng doanh nghiệp | Bản gửi của doanh nghiệp mình |
| Platform Admin | Không | Snapshot đã gửi từ doanh nghiệp |
| Operator / Investigator / Implementation Staff | Không | Không được cấp quyền đọc feedback mới |

Audit sự kiện gửi chỉ ghi metadata truy vết, không chứa toàn bộ bằng chứng. Operator cùng doanh nghiệp vẫn có thể thấy sự kiện gửi theo audit helper hiện có; điều đó không cấp quyền đọc feedback.

## 3. Các phần đã nối

Phần Antigravity đã triển khai trước tiếp quản: model/utils feedback; ReportFeedbackModal; nút gửi/xem lại trong CasesView và ReportsView; danh sách/detail trong PlatformHealthView; hook/coordinator; dashboard; workspace và demo snapshot; audit/translations/CSS/platform summary.

Phần hoàn thiện trong đợt tiếp quản:

- Sửa restore validator: người xác nhận phải là Operator thuộc đúng doanh nghiệp của feedback. Test đã tái hiện trường hợp role/tenant sai vẫn được chấp nhận trước sửa.
- Sửa nhãn tổng số trên PA: luôn dùng “phản hồi đã gửi”, kể cả khi bằng 0. Cập nhật assertion nhãn của Phase 2A; vẫn kiểm tra 0 trước khi SME gửi.
- Thêm `tests/wf04-phase2c.test.cjs` và helper Node VM/hook/storage tại `tests/helpers/wf04.cjs`.
- Kiểm tra thực tế luồng tạo case hai alert, tự điều tra/gửi/đóng, SME preview/hủy/gửi, reload và PA xem.
- Cập nhật task.md, tách mục ánh xạ nhãn AI và tích hợp dịch vụ khỏi phần frontend đã xong.

## 4. Lưu trữ và phục hồi

Feedback nằm trong collection reportFeedbacks của workspace v4, không có đường localStorage riêng. Payload v4 cũ thiếu collection được chuẩn hóa về mảng rỗng, không suy từ Closed hoặc caseDecision legacy. Payload đã có collection nhưng hỏng cấu trúc bị từ chối.

Coordinator dùng nextFeedbacks và ref mới nhất, bảo toàn qua writer khác và preDemoSnapshot. Retry chỉ lưu state, không tạo lại command/ID/timestamp/audit. Test mô phỏng quota và recovery journal pending → committed_cleanup_pending → cleanup; reload giữ bản đã commit. Khi chưa lưu được, trạng thái trong phiên và thông báo lưu lỗi tách biệt.

## 5. Kiểm thử

10 test mới đã đạt: projection/immutability và kết quả riêng, role/tenant/directory, Closed/report ID/version/time, duplicate/reload/audit, quyền đọc, nested corruption/confirming role/tenant, v4 cũ/merge/demo restore, lỗi ghi và retry, commit cleanup/reload, không thêm gate lifecycle khi gửi kết quả đã Closed, render VI/EN của modal SME.

Lỗi storage được tiêm qua StorageLike, không khẳng định đã tiêm lỗi quota trình duyệt. Test render dùng React server rendering; hook dùng harness đồng bộ, không thay thế E2E.

Nghiệm thu cuối: `npm run check` exit 0, lint không lỗi/cảnh báo, TypeScript đạt, **157/157 test** (147 cũ + 10 mới), không skip/fail. `npm run build` exit 0 (Next.js 15.5.25, 6/6 static pages). Bản production này được dùng để kiểm tra trình duyệt; sau build chỉ cập nhật tài liệu, không sửa thêm mã ứng dụng.

## 6. Kiểm tra trình duyệt

Chạy bản production ở localhost:3007, origin riêng với môi trường thường dùng. Dùng UI thật, không chèn state giả vào trình duyệt:

- Bật bộ mẫu WF-04; Operator Lê Minh Quân tạo CASE-WF04-0002 từ alert CAMPUS-01 và CAMPUS-02, tự đảm nhận, viết hai kết quả khác nhau, gửi báo cáo v1 rồi xác nhận đóng riêng.
- SME Admin Võ Thảo Vy mở preview, nhập nhận xét/hủy/xác nhận bỏ; mở lại thấy nhận xét rỗng. Nhập nhận xét mới và gửi; UI chuyển sang chỉ đọc và không còn hành động gửi trùng.
- Reload; chuyển PA Lê Hoàng Phúc: thấy đúng 1 phản hồi, đúng người/thời gian gửi, đúng hai kết quả/bằng chứng và nhận xét. Không có hành động mở hồ sơ nội bộ.
- Chuyển SME Admin Ngô Lan Chi của North Branch: trang Reports không có báo cáo của Campus.
- Xem VI/light và EN/dark. Kiểm tra detail PA ở 375x812, 768x1024, 1440x900: document scrollWidth bằng viewport width; modal cuộn dọc. Tab giữ focus trong dialog, Escape đóng và trả focus về nút mở.
- Console error/warn được browser trả về rỗng trong phiên kiểm tra cuối. Không coi đây là chứng minh mọi đường UI không lỗi.

Không kiểm tra lại mọi tổ hợp kích thước/theme của toàn dashboard. Kiểm tra responsive tập trung vào detail feedback PA; giao diện soạn/gửi SME được chạy ở desktop. Dữ liệu thử thuộc origin localhost:3007, không xóa localStorage của người dùng.

## 7. Điểm nối tiếp và giới hạn

`src/services` giữ trống bằng .gitkeep. Hiện việc PA tiếp nhận chỉ mô phỏng trên cùng workspace trình duyệt. Backend sau này phải thực thi authorization, idempotency, persist snapshot/audit và timestamp server; frontend không phải ranh giới bảo mật. Cần thống nhất contract API, quy ước nhãn đánh giá AI và phạm vi xử lý feedback với đội BE/AI trước khi nối.

Chưa gỡ banner demo hoặc mục Hồ sơ lưu trữ cũ. Đây là bước dọn cuối đã thống nhất, phải bảo toàn case/báo cáo/feedback. Tổng thể WF-04 chưa được đánh dấu hoàn tất.
