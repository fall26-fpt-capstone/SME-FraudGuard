# Rà soát điểm nối WF-01

## Nguồn đã đối chiếu

Đã đọc nội dung word/document.xml của hai tài liệu tại Downloads: Phieu_FA26SE215_v3_EN.docx và SME-FraudGuard_Du-thao-dang-ky-workflow.docx (WF-01). Đối chiếu với docs/task.md, prompt Phase 1 và code hiện tại. Đây là rà soát điểm nối để chia đợt triển khai, chưa phải nghiệm thu toàn bộ UI bằng trình duyệt.

Proposal mô tả Platform Admin thiết lập doanh nghiệp, phân công Implementation Staff; nhân viên xác nhận đặc tả, cấu hình và kiểm thử mẫu trước tích hợp. Dự thảo WF-01 cụ thể hóa chuỗi gửi duyệt → Platform Admin duyệt → SME Admin xác nhận/kích hoạt, yêu cầu bổ sung và thời điểm bắt đầu Subscription. Không gọi mọi chi tiết trong dự thảo là nguyên văn proposal.

## Hiện trạng

| Phần | Bằng chứng code | Kết luận |
| --- | --- | --- |
| Tiếp nhận doanh nghiệp, SME Admin ban đầu, phân công | useOnboardingWorkflow.handleCreateEnterpriseSubmit và OnboardingPlatformAdminScreen | Đã có UI/callback; cần nghiệm thu tính nhất quán khi lưu doanh nghiệp và tài khoản, không tạo lại từ đầu. Không tương đương email/kích hoạt tài khoản thật. |
| Đặc tả, tài liệu, xác nhận | useOnboardingWorkflow, OnboardingIntakeScreen, OnboardingClarifyScreen, OnboardingConfirmationScreen | Đã có cấu trúc và thao tác. Cần phân biệt xác nhận đặc tả với phê duyệt cấu hình và kích hoạt doanh nghiệp. |
| Vòng đời doanh nghiệp | types/enterprise-lifecycle.ts và utils/enterprise-lifecycle.ts, tests/enterprise-lifecycle.test.cjs | Domain Phase 1 đã có. Các màn hình onboarding/rule set khảo sát chưa nối các command của vòng đời này. |
| Phát hành/áp dụng | RuleSetsView gọi handoverSet từ nút “Áp dụng và bàn giao” | Luồng hiện tại chưa thể hiện chuỗi PA duyệt → SME kích hoạt của dự thảo; phải thay khi tích hợp UI, không chỉ đổi nhãn nút. |
| SME tham gia trước vận hành | Cần đối soát navigation, quyền và màn hình SME | Chưa chốt nghiệm thu. Phải có đường gửi tài liệu, theo dõi, xem bản được duyệt, yêu cầu sửa và kích hoạt theo tenant. |
| Lưu trữ vòng đời | Workspace coordinator hiện dùng chung với case/feedback WF-04 | Cần kiểm chứng validation sâu và lưu/restore lifecycle, không coi field tùy chọn trên Enterprise là tích hợp đã xong. |

## Chia việc

1. Phase 2A: nối lifecycle vào state/coordinator, validation và khởi tạo doanh nghiệp mới; kiểm thử lưu/recovery/không mất dữ liệu WF-04. Chưa bật UI phê duyệt/kích hoạt.
2. Phase 2B: nối UI theo actor và thay đường bàn giao cũ, snapshot cấu hình/kiểm thử đúng phiên bản; SME yêu cầu sửa → kiểm thử lại → PA duyệt lại → kích hoạt. Đối soát quyền và gating trên các caller vận hành.
3. Phase 2C: nghiệm thu đầu-cuối, tài khoản/tài liệu và các điểm còn thiếu có bằng chứng; tách riêng việc cần BE như email, authentication, API key và thực thi quyền phía máy chủ.

Không tự chuyển toàn bộ dữ liệu cũ thành Operating; không làm hỏng fixtures WF-04 đã có lifecycle hợp lệ. Không bắt đầu tính Subscription khi chỉ tạo tài khoản hoặc khi PA duyệt.
