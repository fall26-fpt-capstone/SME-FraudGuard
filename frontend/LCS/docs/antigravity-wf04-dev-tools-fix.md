# Sửa giới hạn công cụ dữ liệu mẫu WF-04

Làm trong D:\SME-FraudGuard\frontend\LCS. Đọc AGENTS.md, README.md, docs/ui/UI_RULES.md, docs/ui/DESIGN_SYSTEM.md và docs/wf04-final-cleanup-report.md. Kiểm tra git status/diff, bảo toàn mọi thay đổi của nhóm; không reset/restore/stash/commit/push.

## Vấn đề cần sửa

FraudGuardDashboard.tsx hiện cho query `?wf04Dev=1` hoặc khóa localStorage `fg_wf04_dev_tools=1` bật UI mẫu trên mọi môi trường. Effect đăng ký `window.__fgWf04DevTools` luôn chạy dù chế độ mẫu chưa bật. Vì vậy công cụ chưa thực sự dev-only/mặc định tắt như báo cáo.

## Phạm vi thực hiện

1. Thêm điều kiện môi trường thống nhất cho công cụ mẫu: cho phép trong development; bản build chạy kiểm thử chỉ cho phép khi có cấu hình build rõ ràng, ví dụ `NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS=true`. Production bình thường, không bật cấu hình này, phải luôn vô hiệu hóa công cụ bất kể query/localStorage. Không tự bật cờ cho mọi production build hoặc sửa npm build để bật mặc định.
2. Điều kiện kích hoạt cuối cùng phải gồm cả môi trường được phép VÀ yêu cầu bật rõ ràng qua query/localStorage. Chỉ dùng một cách tính chung cho UI và việc đăng ký helper, tránh hai điều kiện khác nhau.
3. Chỉ đăng ký `window.__fgWf04DevTools` khi chế độ mẫu thực sự bật; xóa helper khi tắt hoặc unmount. Khi vô hiệu hóa, không để lại helper callable. Rà soát callback nạp/khôi phục để tham chiếu cũ không thực hiện thay đổi sau khi chế độ bị tắt/unmount. Không thêm đường gọi bypass điều kiện.
4. Không tự nạp hoặc khôi phục dữ liệu khi mount/reload/bật/tắt chế độ. Tắt công cụ chỉ ẩn công cụ, không xóa dữ liệu đã tạo. Giữ nguyên coordinator, recovery, preDemoSnapshot, case, report và feedback.
5. Cập nhật docs/wf04-sample-data.md với cách dùng development và cách bật rõ ràng cho bản build kiểm thử. Giải thích cờ NEXT_PUBLIC là cấu hình lúc build nếu dùng cách này. Không mô tả query/localStorage là ranh giới bảo mật hay quyền backend.

## Không làm lại

Giữ nguyên Phase 2C feedback, fixtures CASE-SAMPLE-*, sửa chồng lớp alertInspectionOverlay/alertInspectionDrawer, useDialogFocus, giữ nháp case, loading UI trắng và phần dọn UI đã hoàn tất. Không thêm BE/AI service, dependency hoặc mở rộng sang workflow khác. src/services chỉ có .gitkeep.

## Kiểm chứng

- Production không có cờ cho phép: query và khóa localStorage không bật UI, không đăng ký helper và không gây ghi dữ liệu.
- Development hoặc build kiểm thử có cờ cho phép, nhưng không có yêu cầu bật: UI ẩn và helper không tồn tại.
- Môi trường được phép + yêu cầu bật: UI và helper có mặt; chỉ nạp khi người dùng thao tác, nạp lại không nhân đôi/ghi đè dữ liệu hiện có.
- Tắt chế độ/unmount: helper được gỡ; callback cũ không thực hiện nạp/khôi phục; dữ liệu vẫn giữ nguyên.
- Bao phủ cả query và localStorage; đọc storage lỗi không làm crash ứng dụng.
- Dùng test hành vi phù hợp, không chỉ kiểm tra chuỗi source. Chạy npm run check rồi npm run build tuần tự. Kiểm tra trình duyệt bản production mặc định và chế độ kiểm thử được bật; ghi rõ phần chưa kiểm tra nếu có.
- Nếu build tạm với cờ bật công cụ, cuối cùng build lại mặc định không có cờ; không để bản build công cụ mẫu bị hiểu nhầm là bản production thông thường. Không ảnh hưởng dev server của người dùng.

## Bàn giao

Cập nhật docs/task.md và bổ sung kết quả review fix vào docs/wf04-final-cleanup-report.md: điều kiện thực tế, file sửa, kết quả test/build/browser, giới hạn. Không ghi kết quả cũ thành kết quả kiểm tra mới. Dừng để review sau bản sửa này.
