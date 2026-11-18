# Prompt Antigravity: WF-04 Phase 2A

Nối domain WF-04 đã review vào state frontend, lưu dữ liệu demo, Alert Queue và Case Queue. Hoàn thành từng bước, kiểm tra và bàn giao trước khi làm Phase 2B (soạn/gửi/duyệt báo cáo) hoặc feedback.

## 1. Nguồn yêu cầu và ranh giới

Đọc `AGENTS.md`, `README.md`, `docs/ui/UI_RULES.md`, `docs/ui/DESIGN_SYSTEM.md`, `docs/task.md`, `docs/antigravity-wf04-phase1.md`, `docs/antigravity-wf04-phase1-fixes.md` và `docs/wf04-phase1-report.md`.

Phase 1 cùng ba sửa lỗi đã được review độc lập: `npm run check` đạt 111/111 test, production build đạt. Không thay đổi quy tắc đã chốt để thuận tiện nối UI:

- Operator chọn một hoặc nhiều AI Alert liên quan cùng doanh nghiệp tạo một case Open; mỗi alert chỉ thuộc một case, kể cả case đã Closed.
- Chỉ AI + Abnormal đủ điều kiện. Rule/Fallback không vào WF-04.
- Tạo case cần Operating và Subscription còn hiệu lực theo WF-01. Case mở hợp lệ được tiếp tục xử lý khi gói hết hạn.
- Operator phân công Investigator cùng tenant hoặc tự đảm nhận, chuyển Open thẳng Investigating.
- Vòng đời đủ là Open → Investigating → Pending Review → Closed; Phase 2A chỉ nối thao tác tạo và phân công/tự đảm nhận. Các trạng thái còn lại vẫn phải hiển thị đúng nếu có dữ liệu hợp lệ.
- Operator tự điều tra được tự gửi báo cáo rồi tự xác nhận ở Phase 2B. Báo cáo chung giữ kết quả riêng từng alert.
- SME Admin xem báo cáo đã xác nhận; Platform Admin không tự có quyền hồ sơ nội bộ. Feedback là thao tác chủ động của SME Admin ở đợt sau, không phát sinh khi đóng case.

Hiện chỉ làm frontend demo. Không tạo API, endpoint, HTTP client hoặc AI service; `src/services` giữ `.gitkeep`. Không thêm dependency. Kiểm tra git status/branch, giữ mọi thay đổi có sẵn và untracked. Không reset, restore, stash, commit, push. Không đổi landing page hoặc backend.

Đọc code thực tế, không chỉ dựa vào báo cáo cũ. Các điểm cần rà:

- `FraudGuardDashboard.tsx`: workspace v3/v2, effect restore/persist, các handler onboarding còn tự ghi workspace, state transactions/users, metrics và `handleUpdateTransaction`.
- `AlertsView.tsx`, `AlertsView.module.css`, `CasesView.tsx`, `AlertCaseDrawer.tsx`, `ReportsView.tsx`, `MembersView.tsx`.
- `src/utils/investigation-case.ts`, `src/types/investigation-case.ts`, `enterprise-lifecycle.ts`, `permissions.ts`, `enterprise.ts`, `notification-feed.ts`, `platform-summary.ts`, export và các caller legacy.

Không sửa domain WF-01 hoặc nới guard WF-04 để dữ liệu cũ qua được. Nếu gặp lỗi domain mới ngoài phạm vi, tái hiện và báo trong bàn giao.

## 2. Hướng UI đã xác nhận

Giữ thiết kế hiện tại do người dùng đã chỉnh. Alert Queue tiếp tục dạng danh sách; giữ trường thông tin, tìm kiếm, bộ lọc, phân trang và nút Details. Không quay lại dạng card, không thiết kế lại sidebar/header hoặc toàn trang.

Đọc skill antislop tại đường dẫn AGENTS quy định; mode `during` đã được người dùng chọn trong phiên, không hỏi lại. Hướng thiết kế là dashboard nghiệp vụ hiện có, ưu tiên đọc danh sách và hành động rõ ràng; ENERGY 1 / RHYTHM 1 / MOTION 1. Chỉ thêm checkbox, hành động tạo case và thông tin liên kết cần thiết. Không thêm asset, font, thư viện icon hoặc navigation mới. Dùng tokens/component hiện tại; sửa cả vi/en. Ghi bằng chứng kiểm tra UI trong báo cáo, không coi check/build thay cho kiểm thử trình duyệt.

## 3. Bước A: state case độc lập và lưu workspace

1. Thêm nguồn state `InvestigationCase[]` độc lập với transactions. Có thể dùng `useInvestigationCases` và reducer/helper thuần phù hợp; tránh chia một nghiệp vụ thành các state cập nhật rời rạc làm mất tính nhất quán.
2. Transactions vẫn là dữ liệu nguồn; không sao chép toàn bộ báo cáo/trạng thái case mới về từng transaction để làm nguồn ghi thứ hai. Liên kết alert → case và danh sách case hiển thị được suy ra từ state case.
3. Handler tạo/phân công/tự đảm nhận gọi public commands Phase 1. Actor, enterprise và user directory lấy từ state hiện tại, không tin tenant/role do component con tự truyền. Component gửi lựa chọn ID, không gửi object case đã sửa để ghi đè tùy ý.
4. Tạo case luôn truyền đầy đủ `existingCases` mới nhất của workspace, gồm Closed; không truyền mảng đã lọc theo page/search/assignee. Dùng đầy đủ nguồn alert và ánh xạ project/enterprise để kiểm tra tenant.
5. Xử lý hai click liên tiếp hoặc callback dùng state cũ bằng reducer/update theo state mới nhất. Một alert chỉ tạo được một case. ID/thời gian sinh ngoài domain; không toast, ghi storage hoặc tạo ID trong updater có thể chạy lặp bởi React Strict Mode. Audit của một command chỉ ghi một lần.
6. Sau phân công, cập nhật state một lần; user được chọn bằng ID, không bằng tên. Đổi tên user không làm mất liên kết người phụ trách.
7. Thêm schema version cho workspace và lưu cả case/metadata chuyển đổi. Chọn nâng workspace v4 hoặc một phương án tương đương có giải thích; không tách storage tùy tiện làm các bản ghi liên quan lệch nhau.
8. Rà tất cả writer workspace, kể cả các handler onboarding đang trực tiếp `setItem`. Không để writer cũ ghi mất cases/metadata hoặc các trường rules/ruleSets/enterprises/projects/transactions/auditLogs sau khi đã nâng version. Giữ hành vi WF-01 đến WF-03 đang có.
9. Chờ restore/validation hoàn tất trước persist. Không ghi đè workspace bằng dữ liệu mặc định khi JSON bị lỗi hoặc version không hỗ trợ. Không tự xóa storage để xử lý lỗi.
10. Khi lỗi storage, phân biệt state đang có trong phiên với dữ liệu đã lưu. Không báo đã lưu bền vững nếu setItem thất bại; không xóa selection hoặc dữ liệu người dùng một cách khó phục hồi. Ghi rõ chính sách rollback hay giữ trong bộ nhớ và cho thử lại.

Giới hạn: chưa cần đồng bộ ghi nhiều tab. Ghi rõ chỉ bảo đảm cập nhật tuần tự trong phiên hiện tại; không tuyên bố giải quyết concurrency server. Việc gọi với state mới nhất và kiểm tra uniqueness ở BE vẫn bắt buộc sau tích hợp.

## 4. Bước B: chuyển dữ liệu cũ có kiểm soát

Viết hàm migration thuần, có version, deterministic và idempotent. Phân biệt dữ liệu domain mới hợp lệ, legacy có thể chuyển và legacy cần đối chiếu.

- Giữ bản gốc trước khi ghi workspace mới; không xóa key cũ. Nếu cần tạo backup để bảo toàn dữ liệu mà backup thất bại, không tiếp tục ghi đè phá hủy nguồn.
- Không đổi ID case/alert hoặc gom những case cũ khác nhau vào một case. Một case cũ một alert chuyển thành danh sách một phần tử nếu đủ bằng chứng.
- Nhiều transaction cùng case ID chỉ được chuyển thành một case khi cùng tenant và thông tin người phụ trách, báo cáo, quyết định/lịch sử nhất quán. Nếu mâu thuẫn, giữ nguyên để đối chiếu; không chọn tùy tiện transaction đầu tiên.
- Assigned có thể ánh xạ Investigating, Reported thành Pending Review, các trạng thái kết luận thành Closed chỉ khi có đủ dữ liệu tương ứng. Bảo toàn kết luận, notes, bằng chứng, actor, thời gian và report gốc.
- Không suy ra thời điểm tạo từ processedAt hoặc thời điểm migration. Không bịa approval, activation, subscription, actor ID, report version/history để làm bản ghi đạt validation. Người trùng tên hoặc thiếu ID phải được đánh dấu cần đối chiếu nếu không ánh xạ duy nhất được.
- Dữ liệu thiếu bằng chứng mở case hợp lệ, nguồn Rule, tenant mâu thuẫn, báo cáo/trạng thái không nhất quán phải giữ dưới dạng legacy archive cần đối chiếu. Không ép vào `InvestigationCase` bằng type assertion và không xóa/ẩn mất khỏi người có quyền.
- Có cách xem dữ liệu legacy gốc chỉ đọc trong phạm vi tenant/assignee đã xác định được. Không xác định được quyền thì không hiển thị hồ sơ cho user bất kỳ; giữ nguyên bản lưu và ghi lỗi migration có kiểm soát. Không mở quyền nội dung cho Platform Admin chỉ vì dữ liệu lỗi.
- Alert có liên kết legacy chưa giải quyết vẫn bị chặn tạo case mới. Không bỏ caseId/caseStatus để biến nó thành alert chưa xử lý.
- Migrate/restore lặp không nhân đôi case/report/event. Reload workspace mới không chạy lại chuyển đổi nguồn cũ.

Không bắt buộc mọi fixture legacy đều chuyển thành case đang hoạt động. Bàn giao số bản ghi chuyển được/cần đối chiếu cùng lý do, và xác nhận dữ liệu gốc còn nguyên.

## 5. Bước C: nguồn demo đáp ứng điều kiện WF-01

Fixture hiện có có thể chưa có lifecycle Operating hợp lệ. Không mặc định nâng doanh nghiệp legacy lên Operating, không cho UI tạo case bằng cách bỏ guard.

Nếu cần demo để nghiệm thu, thêm bộ fixture WF-04 riêng trong `src/data`, tạo snapshot doanh nghiệp qua chuỗi WF-01 hợp lệ (có cấu hình/test/approval/activation) hoặc tái sử dụng fixture hợp lệ đã có. Không dùng dữ liệu test làm import runtime. Có ít nhất ba AI Alert cùng doanh nghiệp và một alert tenant khác, một Rule Alert, cùng users có ID.

Chỉ khởi tạo fixture khi phù hợp cơ chế workspace demo sạch; không ghi đè workspace đã lưu hoặc tự reset dữ liệu người dùng. Nếu cần chuyển sang bộ demo riêng, dùng hành động rõ ràng và bảo toàn dữ liệu hiện có. Giải thích cách mở bộ demo trong báo cáo. Dùng thời gian demo có kiểm soát hoặc thời hạn hợp lệ rõ ràng; không gia hạn subscription mỗi lần render/reload để che lỗi hết hạn.

## 6. Bước D: Alert Queue

- Bổ sung checkbox cho AI Alert đủ điều kiện và hành động tạo case. Alert đã liên kết/legacy unresolved/nguồn Rule không được chọn; lý do phải hiểu được.
- Select-all chỉ áp dụng alert đủ điều kiện trên trang đang hiển thị. Khi đổi bộ lọc hoặc trang, xóa lựa chọn để tránh tạo case từ alert đang bị ẩn. Khi đổi user/tenant, luôn xóa lựa chọn và đóng detail không còn quyền.
- Trước tạo, cho người dùng xem danh sách/tổng số alert đã chọn; Operator quyết định các alert có liên quan, không tự gom theo thuật toán hoặc tự cho rằng cùng thời gian là cùng sự việc.
- Submit kiểm tra lại toàn bộ lựa chọn bằng domain trên state mới nhất. Một alert không hợp lệ thì không tạo case một phần, thông báo cụ thể và cho cập nhật lựa chọn.
- Thành công tạo đúng một Open case, bỏ chọn và cập nhật liên kết ở mọi alert thành viên. Cả case một alert và nhiều alert đều dùng cùng luồng.
- Details tiếp tục mở thông tin alert. Alert đã liên kết có hành động mở case chung; không chỉ mở transaction đầu tiên và gọi đó là case detail.
- Hiển thị lý do không tạo được khi chưa Operating/hết Subscription. Không áp guard này để chặn mở xem case cũ.

## 7. Bước E: Case Queue và chi tiết tối thiểu

- Dùng `InvestigationCase[]`, một dòng cho mỗi case. Hiển thị mã case, số alert, trạng thái, người phụ trách và thời gian phù hợp với bố cục đang có.
- Search/filter/pagination/metrics đếm case, không nhân số case theo số alert. Không dùng finding/kết luận legacy làm trạng thái mới.
- Operator cùng tenant được xem và tạo/phân công/tự đảm nhận. Investigator chỉ thấy case được giao theo user ID. SME Admin chỉ có phần báo cáo đã xác nhận theo read guard, không có nút quản lý case; PA/Implementation Staff không có quyền nội bộ mặc định.
- Case Open: chọn Investigator từ danh sách đúng tenant và theo ID, hoặc Operator tự đảm nhận; thành công chuyển Investigating ngay, không yêu cầu nhận việc qua Assigned.
- Detail tối thiểu hiển thị đủ alert thành viên, thông tin phụ trách, trạng thái và lịch sử domain thực có. Có thể xem report/kết luận đã có nếu được phép, nhưng chưa xây form soạn/gửi/duyệt.
- Với case mới, không điều hướng đến drawer legacy có khả năng đóng/gửi báo cáo bằng transaction update. Không để nút trông như hoạt động nhưng không làm gì. Những chức năng chưa nối phải không có hành động ghi và được giải thích đúng phạm vi khi cần, tránh banner kỹ thuật lặp lại.
- Người dùng đổi tenant/role trong lúc detail/dialog đang mở: recheck quyền, xóa nội dung không còn được truy cập và chặn submit bằng handler.

## 8. Bước F: chặn đường ghi legacy và đồng bộ caller liên quan

Phase 2A chưa hoàn thiện Reports/feedback, nhưng không được để đường cũ phá invariant mới:

- Rà `handleUpdateTransaction`, AlertCaseDrawer, CasesView quick actions và các caller `canUpdateCase`. Case mới chỉ có một nguồn ghi là domain/state mới. Hồ sơ legacy cần đối chiếu chỉ đọc, không cho luồng cũ tiếp tục tạo/đóng case vượt quy tắc.
- ReportsView, CSV/export, notification và metrics không được hiển thị một case mới thành nhiều case, dựng report legacy giả, hoặc đọc field transaction cũ như nguồn hiện hành cho case đã chuyển. Cho phép adapter chỉ đọc có kiểm soát hoặc điều chỉnh nhỏ để tách dữ liệu legacy rõ ràng; chưa xây report editor mới.
- Đổi busy-member guard để chặn đổi role/xóa người đang phụ trách case Investigating/Pending Review theo user ID, bảo toàn kiểm tra legacy chưa chuyển. Không khóa chỉ vì một Open case chưa có assignee.
- Case audit/log phải đúng tenant và actor. Không chuyển nguyên nội dung nội bộ lên Platform Admin qua `auditForUser`, feed hoặc thống kê feedback; đóng case không đồng nghĩa feedback.
- Không mở rộng thành redesign các màn hình phụ. Liệt kê caller đã xử lý và phần còn chờ Phase 2B trong báo cáo; không để lỗi quyền/đường ghi tồn tại với lý do ngoài phạm vi.

## 9. Kiểm thử và tiêu chí nghiệm thu

Viết test cần thiết cho integration state/migration/permissions; tái sử dụng test runner hiện có. Không chỉ test lại pure domain vốn đã có.

1. Tạo case từ hai alert: một case, hai liên kết; reload vẫn đúng; click lặp/callback cũ không tạo case thứ hai.
2. Chọn một alert vẫn được; trộn tenant, Rule, alert đã liên kết hoặc legacy unresolved đều bị chặn cả UI lẫn handler.
3. Đổi trang/filter/user/tenant xóa selection theo quy định; thay quyền trong lúc dialog mở chặn ghi và không lộ detail cũ.
4. Giao Investigator hoặc tự đảm nhận chuyển Investigating, reload giữ đúng user ID; Investigator khác không thấy case; người phụ trách đổi tên vẫn thấy.
5. Hết gói: tạo mới bị chặn, xem/phân công/tự đảm nhận case mở hợp lệ trước đó vẫn hoạt động.
6. Migration: singleton, dữ liệu đủ điều kiện, dữ liệu thiếu/mâu thuẫn, ID chung khác tenant, bảo toàn báo cáo/lịch sử gốc, idempotency. Dữ liệu không đủ không được tự hợp thức hóa.
7. Restore JSON lỗi/version lạ/storage quota lỗi không xóa hoặc ghi đè dữ liệu gốc; writer onboarding không làm mất cases; reload không seed đè workspace.
8. Case Queue/KPI đếm một case khi có nhiều alert. Không còn đường thao tác legacy tạo/đóng trái quy tắc trên case mới hoặc legacy archive.
9. Busy-member guard và đọc audit/export không làm lọt tenant/quyền; SME Admin/PA không thấy nút ghi hoặc hồ sơ không được phép.

Chạy `npm run check` rồi `npm run build` tuần tự. Kiểm thử trình duyệt bằng bộ demo hợp lệ: tạo một/nhiều alert, duplicate, phân công/tự nhận, mở Details/case detail, reload, chuyển role, empty/filter-no-results, thông báo lỗi. Kiểm tra light/dark, desktop/768px/375px, checkbox bằng bàn phím, focus/Escape dialog, console. Không chạy dev và build chung thư mục `.next` cùng lúc. Ghi bằng chứng hành vi và ảnh nếu có; không nhận đã kiểm tra UI nếu chỉ chạy unit test.

## 10. Bàn giao

Tạo `docs/wf04-phase2a-report.md` gồm:

1. File thay đổi và luồng state/write/persist, caller legacy đã chặn.
2. Quyết định schema version/backup, quy tắc migration, số bản ghi chuyển/cần đối chiếu, cách bảo toàn dữ liệu.
3. Cách chạy demo với lifecycle/subscription hợp lệ mà không phá dữ liệu cũ.
4. Ma trận yêu cầu → handler/helper → test → bằng chứng UI; kết quả check/build thực tế và giới hạn chưa kiểm chứng nếu có.
5. Danh sách phần Phase 2B còn lại: soạn báo cáo mỗi alert, gửi phiên bản, yêu cầu bổ sung, duyệt đúng report ID/version, Operator tự xác nhận; feedback là đợt riêng.

Cập nhật `docs/task.md` chỉ những mục thực sự hoàn thành; không tích trọn điều tra/báo cáo/feedback hoặc WF-04. Không thay kết luận văn bản thành enum/nhãn AI chưa thống nhất.

Dừng ở Phase 2A để review. Không tự triển khai Phase 2B hay feedback và không yêu cầu người dùng chốt lại các quy tắc đã có trong prompt.
