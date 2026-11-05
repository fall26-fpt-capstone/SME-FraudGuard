import type { Enterprise } from "@/types/enterprise";

export const demoEnterprises: Enterprise[] = [
  {
    id: "tenant-abc",
    code: "ABC-2026",
    name: "ABC Fashion",
    projectIds: ["proj-abc-cod"],
    deploymentStaffId: "usr-deployment",
    plan: "Subscription",
    specification: {
      stage: "confirmed",
      businessModel: "Thương mại điện tử Thời trang & Giao hàng thu hộ (COD)",
      deploymentScopeNote: "1 workspace = 1 phạm vi triển khai chính (Giám sát đơn hàng COD) + 1 bộ cấu hình phát hiện.",
      representativeName: "Trần Quốc Bảo",
      representativeRole: "Quản trị Doanh nghiệp (SME Admin)",
      representativeEmail: "admin@abcfashion.vn",
      smeAdminName: "Trần Quốc Bảo",
      smeAdminEmail: "admin@abcfashion.vn",
      intakeReviewNote: "Hồ sơ tiếp nhận đầy đủ mô tả quy trình đặt hàng COD và tệp mẫu giao dịch từ cổng bán hàng trực tuyến.",
      intakeDocuments: [
        {
          id: "doc-abc-1",
          name: "Mo_ta_nghiep_vu_don_hang_COD_ABCFashion.txt",
          format: "TXT",
          receivedAt: "10/10/2026 09:15",
          summary: "Mô tả luồng thanh toán thu hộ COD và các dấu hiệu đơn hàng bất thường cần cảnh báo.",
          content: "DOANH NGHIỆP: ABC Fashion (ABC-2026)\nPHẠM VI: Giám sát đơn hàng COD trên kênh Website và Mobile App.\nYÊU CẦU NGHIỆP VỤ:\n1. Phát hiện đơn hàng COD có giá trị cao bất thường vượt quá 15.000.000 VND.\n2. Phát hiện tài khoản đặt lặp nhiều đơn hàng trong thời gian ngắn từ cùng một mã định danh thiết bị hoặc trình duyệt."
        },
        {
          id: "doc-abc-2",
          name: "Mau_giao_dich_COD_ABCFashion.json",
          format: "JSON",
          receivedAt: "10/10/2026 09:20",
          summary: "Tệp mẫu 2 bản ghi giao dịch COD phục vụ đối chiếu trường dữ liệu.",
          content: JSON.stringify(
            [
              {
                id: "abc-sample-1",
                ref: "ORD-ABC-101",
                projectId: "proj-abc-cod",
                transactionType: "payment",
                fields: { amount: 18500000, channel: "COD", user_hash: "usr_abc_01", device_id: "web_chrome_991" },
                expected: "Abnormal"
              },
              {
                id: "abc-sample-2",
                ref: "ORD-ABC-102",
                projectId: "proj-abc-cod",
                transactionType: "payment",
                fields: { amount: 450000, channel: "COD", user_hash: "usr_abc_02", device_id: "app_ios_220" },
                expected: "Normal"
              }
            ],
            null,
            2
          )
        }
      ],
      suggestedSupplementItems: [
        "Làm rõ ngưỡng giá trị đơn hàng COD tối đa theo từng nhóm sản phẩm",
        "Bổ sung mô tả ý nghĩa các giá trị của trường channel trong dữ liệu đầu vào"
      ],
      supplementRequests: [],
      conditionsList: [
        {
          id: "cond-abc-1",
          name: "Đơn hàng COD giá trị cao vượt ngưỡng",
          criteria: "amount > 15000000 và channel == 'COD'",
          scope: "Giao dịch thanh toán đơn hàng (payment) thuộc dự án proj-abc-cod"
        },
        {
          id: "cond-abc-2",
          name: "Đặt hàng lặp tần suất cao trong 1 giờ",
          criteria: "Số lượng giao dịch của cùng user_hash > 5 lần / 1 giờ",
          scope: "Giao dịch đặt hàng trực tuyến trên Website và Mobile App"
        }
      ],
      schema: [
        { name: "amount", type: "number", required: true, description: "Tổng giá trị đơn hàng (VND)" },
        { name: "channel", type: "string", required: true, description: "Kênh thanh toán hoặc phương thức giao nhận (ví dụ: COD, Online)" },
        { name: "user_hash", type: "string", required: true, description: "Mã băm ẩn danh định danh tài khoản khách hàng" },
        { name: "device_id", type: "string", required: false, description: "Mã định danh thiết bị hoặc trình duyệt thực hiện đặt hàng" }
      ],
      savedDraft: {
        version: "v1.0",
        requirements: "Giám sát đơn hàng COD giá trị cao và hành vi đặt hàng lặp bất thường trên kênh thương mại điện tử ABC Fashion.",
        conditionsList: [
          {
            id: "cond-abc-1",
            name: "Đơn hàng COD giá trị cao vượt ngưỡng",
            criteria: "amount > 15000000 và channel == 'COD'",
            scope: "Giao dịch thanh toán đơn hàng (payment) thuộc dự án proj-abc-cod"
          },
          {
            id: "cond-abc-2",
            name: "Đặt hàng lặp tần suất cao trong 1 giờ",
            criteria: "Số lượng giao dịch của cùng user_hash > 5 lần / 1 giờ",
            scope: "Giao dịch đặt hàng trực tuyến trên Website và Mobile App"
          }
        ],
        schema: [
          { name: "amount", type: "number", required: true, description: "Tổng giá trị đơn hàng (VND)" },
          { name: "channel", type: "string", required: true, description: "Kênh thanh toán hoặc phương thức giao nhận (ví dụ: COD, Online)" },
          { name: "user_hash", type: "string", required: true, description: "Mã băm ẩn danh định danh tài khoản khách hàng" },
          { name: "device_id", type: "string", required: false, description: "Mã định danh thiết bị hoặc trình duyệt thực hiện đặt hàng" }
        ],
        sampleJson: JSON.stringify(
          [
            {
              id: "abc-sample-1",
              ref: "ORD-ABC-101",
              projectId: "proj-abc-cod",
              transactionType: "payment",
              fields: { amount: 18500000, channel: "COD", user_hash: "usr_abc_01", device_id: "web_chrome_991" },
              expected: "Abnormal"
            }
          ],
          null,
          2
        ),
        updatedAt: "2026-10-12T10:00:00Z",
        sentAt: "2026-10-12T10:30:00Z",
        sentBy: "Nguyễn Minh Hà"
      },
      sentSnapshot: {
        version: "v1.0",
        requirements: "Giám sát đơn hàng COD giá trị cao và hành vi đặt hàng lặp bất thường trên kênh thương mại điện tử ABC Fashion.",
        conditionsList: [
          {
            id: "cond-abc-1",
            name: "Đơn hàng COD giá trị cao vượt ngưỡng",
            criteria: "amount > 15000000 và channel == 'COD'",
            scope: "Giao dịch thanh toán đơn hàng (payment) thuộc dự án proj-abc-cod"
          },
          {
            id: "cond-abc-2",
            name: "Đặt hàng lặp tần suất cao trong 1 giờ",
            criteria: "Số lượng giao dịch của cùng user_hash > 5 lần / 1 giờ",
            scope: "Giao dịch đặt hàng trực tuyến trên Website và Mobile App"
          }
        ],
        schema: [
          { name: "amount", type: "number", required: true, description: "Tổng giá trị đơn hàng (VND)" },
          { name: "channel", type: "string", required: true, description: "Kênh thanh toán hoặc phương thức giao nhận (ví dụ: COD, Online)" },
          { name: "user_hash", type: "string", required: true, description: "Mã băm ẩn danh định danh tài khoản khách hàng" },
          { name: "device_id", type: "string", required: false, description: "Mã định danh thiết bị hoặc trình duyệt thực hiện đặt hàng" }
        ],
        sampleJson: JSON.stringify(
          [
            {
              id: "abc-sample-1",
              ref: "ORD-ABC-101",
              projectId: "proj-abc-cod",
              transactionType: "payment",
              fields: { amount: 18500000, channel: "COD", user_hash: "usr_abc_01", device_id: "web_chrome_991" },
              expected: "Abnormal"
            }
          ],
          null,
          2
        ),
        updatedAt: "2026-10-12T10:00:00Z",
        sentAt: "2026-10-12T10:30:00Z",
        sentBy: "Nguyễn Minh Hà"
      },
      confirmedSnapshot: {
        version: "v1.0",
        requirements: "Giám sát đơn hàng COD giá trị cao và hành vi đặt hàng lặp bất thường trên kênh thương mại điện tử ABC Fashion.",
        conditionsList: [
          {
            id: "cond-abc-1",
            name: "Đơn hàng COD giá trị cao vượt ngưỡng",
            criteria: "amount > 15000000 và channel == 'COD'",
            scope: "Giao dịch thanh toán đơn hàng (payment) thuộc dự án proj-abc-cod"
          },
          {
            id: "cond-abc-2",
            name: "Đặt hàng lặp tần suất cao trong 1 giờ",
            criteria: "Số lượng giao dịch của cùng user_hash > 5 lần / 1 giờ",
            scope: "Giao dịch đặt hàng trực tuyến trên Website và Mobile App"
          }
        ],
        schema: [
          { name: "amount", type: "number", required: true, description: "Tổng giá trị đơn hàng (VND)" },
          { name: "channel", type: "string", required: true, description: "Kênh thanh toán hoặc phương thức giao nhận (ví dụ: COD, Online)" },
          { name: "user_hash", type: "string", required: true, description: "Mã băm ẩn danh định danh tài khoản khách hàng" },
          { name: "device_id", type: "string", required: false, description: "Mã định danh thiết bị hoặc trình duyệt thực hiện đặt hàng" }
        ],
        sampleJson: JSON.stringify(
          [
            {
              id: "abc-sample-1",
              ref: "ORD-ABC-101",
              projectId: "proj-abc-cod",
              transactionType: "payment",
              fields: { amount: 18500000, channel: "COD", user_hash: "usr_abc_01", device_id: "web_chrome_991" },
              expected: "Abnormal"
            }
          ],
          null,
          2
        ),
        updatedAt: "2026-10-12T10:00:00Z",
        sentAt: "2026-10-12T10:30:00Z",
        sentBy: "Nguyễn Minh Hà"
      },
      enterpriseConfirmation: {
        confirmedAt: "2026-10-13T14:20:00Z",
        confirmedBy: "Trần Quốc Bảo (Quản trị Doanh nghiệp - ABC Fashion)",
        channel: "Email xác nhận",
        note: "Đồng ý danh mục điều kiện phát hiện đơn COD giá trị cao và schema 4 trường dữ liệu.",
        version: "v1.0"
      },
      dataAndEvaluationClarified: true,
      dataClarifiedAt: "2026-10-13T15:00:00Z",
      dataClarifiedBy: "Nguyễn Minh Hà",
      requirements: "Giám sát đơn hàng COD giá trị cao và hành vi đặt hàng lặp bất thường trên kênh thương mại điện tử ABC Fashion.",
      fields: "amount (number, bắt buộc), channel (string, bắt buộc), user_hash (string, bắt buộc), device_id (string, tùy chọn)",
      conditions: "1. Đơn hàng COD giá trị cao vượt ngưỡng: amount > 15000000 và channel == 'COD'\n2. Đặt hàng lặp tần suất cao trong 1 giờ: Số lượng giao dịch của cùng user_hash > 5 lần / 1 giờ",
      sampleJson: JSON.stringify(
        [
          {
            id: "abc-sample-1",
            ref: "ORD-ABC-101",
            projectId: "proj-abc-cod",
            transactionType: "payment",
            fields: { amount: 18500000, channel: "COD", user_hash: "usr_abc_01", device_id: "web_chrome_991" },
            expected: "Abnormal"
          }
        ],
        null,
        2
      ),
      updatedAt: "2026-10-13T14:20:00Z",
      confirmedAt: "2026-10-13T14:20:00Z",
      confirmedBy: "Trần Quốc Bảo (Quản trị Doanh nghiệp - ABC Fashion)"
    }
  },
  {
    id: "tenant-fastretail",
    code: "FR-2026",
    name: "FastRetail Mart",
    projectIds: ["proj-market"],
    deploymentStaffId: "usr-deployment",
    plan: "Subscription",
    specification: {
      stage: "intake",
      businessModel: "Chuỗi bán lẻ hàng tiêu dùng nhanh & Thanh toán đa kênh",
      deploymentScopeNote: "1 workspace = 1 phạm vi triển khai chính (Giám sát giao dịch bán lẻ) + 1 bộ cấu hình phát hiện.",
      representativeName: "Phạm Thị Minh Châu",
      representativeRole: "Trưởng phòng Kiểm soát Nội bộ",
      representativeEmail: "chau.pham@fastretail.vn",
      smeAdminName: "Đỗ Hoàng Hải",
      smeAdminEmail: "hai.do@fastretail.vn",
      intakeReviewNote: "Doanh nghiệp đã gửi bản mô tả yêu cầu ban đầu và trích xuất CSV giao dịch. Cần đối chiếu thêm ngưỡng giá trị giao dịch cần cảnh báo theo ca làm việc.",
      intakeDocuments: [
        {
          id: "doc-fr-1",
          name: "Phieu_yeu_cau_giam_sat_giao_dich_FastRetail.txt",
          format: "TXT",
          receivedAt: "20/10/2026 14:10",
          summary: "Tài liệu mô tả bài toán phát hiện giao dịch thanh toán và điều chỉnh hóa đơn bất thường tại quầy.",
          content: "DOANH NGHIỆP: FastRetail Mart (FR-2026)\nNGƯỜI LIÊN HỆ: Phạm Thị Minh Châu - Trưởng phòng Kiểm soát Nội bộ\nNỘI DUNG YÊU CẦU:\n- Theo dõi các giao dịch có giá trị thanh toán lớn bất thường so với mặt bằng hóa đơn bán lẻ.\n- Theo dõi các giao dịch phát sinh ngoài khung giờ hoạt động tiêu chuẩn của điểm bán."
        },
        {
          id: "doc-fr-2",
          name: "Trich_xuat_giao_dich_mau_FastRetail.csv",
          format: "CSV",
          receivedAt: "20/10/2026 14:15",
          summary: "Dữ liệu giao dịch mẫu định dạng CSV gồm 3 dòng bản ghi đối soát.",
          content: "transaction_reference,transaction_type,amount,currency,user_hash,payment_method\nFR-TX-001,payment,12500000,VND,cashier_01,QR_TRANSFER\nFR-TX-002,payment,320000,VND,cashier_02,CARD\nFR-TX-003,payment,9800000,VND,cashier_01,QR_TRANSFER"
        }
      ],
      suggestedSupplementItems: [
        "Xác nhận ngưỡng số tiền hóa đơn cần cảnh báo tại chuỗi cửa hàng FastRetail",
        "Làm rõ danh sách giá trị của trường payment_method trong tệp CSV xuất từ hệ thống bán hàng"
      ],
      supplementRequests: [],
      conditionsList: [
        {
          id: "cond-fr-1",
          name: "Hóa đơn thanh toán vượt ngưỡng kiểm soát bán lẻ",
          criteria: "amount >= 10000000",
          scope: "Giao dịch thanh toán (payment) thuộc dự án proj-market"
        }
      ],
      schema: [
        { name: "amount", type: "number", required: true, description: "Số tiền thanh toán trên hóa đơn (VND)" },
        { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh của tài khoản thực hiện giao dịch" },
        { name: "payment_method", type: "string", required: false, description: "Phương thức thanh toán ghi nhận trên hóa đơn" }
      ],
      savedDraft: {
        version: "v1.0",
        requirements: "Phát hiện giao dịch thanh toán hóa đơn giá trị lớn bất thường tại hệ thống bán lẻ FastRetail Mart.",
        conditionsList: [
          {
            id: "cond-fr-1",
            name: "Hóa đơn thanh toán vượt ngưỡng kiểm soát bán lẻ",
            criteria: "amount >= 10000000",
            scope: "Giao dịch thanh toán (payment) thuộc dự án proj-market"
          }
        ],
        schema: [
          { name: "amount", type: "number", required: true, description: "Số tiền thanh toán trên hóa đơn (VND)" },
          { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh của tài khoản thực hiện giao dịch" },
          { name: "payment_method", type: "string", required: false, description: "Phương thức thanh toán ghi nhận trên hóa đơn" }
        ],
        sampleJson: JSON.stringify(
          [
            {
              id: "fr-sample-1",
              ref: "FR-TX-001",
              projectId: "proj-market",
              transactionType: "payment",
              fields: { amount: 12500000, user_hash: "cashier_01", payment_method: "QR_TRANSFER" },
              expected: "Abnormal"
            }
          ],
          null,
          2
        ),
        updatedAt: "2026-10-20T15:00:00Z"
      },
      feedbackHistory: [],
      dataAndEvaluationClarified: false,
      requirements: "Phát hiện giao dịch thanh toán hóa đơn giá trị lớn bất thường tại hệ thống bán lẻ FastRetail Mart.",
      fields: "amount (number, bắt buộc), user_hash (string, bắt buộc), payment_method (string, tùy chọn)",
      conditions: "Hóa đơn thanh toán vượt ngưỡng kiểm soát bán lẻ: amount >= 10000000",
      sampleJson: JSON.stringify(
        [
          {
            id: "fr-sample-1",
            ref: "FR-TX-001",
            projectId: "proj-market",
            transactionType: "payment",
            fields: { amount: 12500000, user_hash: "cashier_01", payment_method: "QR_TRANSFER" },
            expected: "Abnormal"
          }
        ],
        null,
        2
      ),
      updatedAt: "2026-10-20T15:00:00Z"
    }
  },
  {
    id: "tenant-greenmart",
    code: "GM-2026",
    name: "GreenMart",
    projectIds: [],
    deploymentStaffId: "usr-deployment",
    plan: "Free",
    specification: {
      stage: "waiting_confirmation",
      businessModel: "Sàn phân phối thực phẩm sạch & Đặt hàng định kỳ",
      deploymentScopeNote: "1 workspace = 1 phạm vi triển khai chính (Đơn đặt hàng trực tuyến GreenMart) + 1 bộ cấu hình phát hiện.",
      representativeName: "Vũ Đình Khôi",
      representativeRole: "Giám đốc Điều hành",
      representativeEmail: "khoi.vu@greenmart.vn",
      smeAdminName: "Vũ Đình Khôi",
      smeAdminEmail: "khoi.vu@greenmart.vn",
      intakeReviewNote: "Đã làm rõ 2 điều kiện phát hiện và gửi bản dự thảo đặc tả v1.0 cho đại diện GreenMart xem xét.",
      intakeDocuments: [
        {
          id: "doc-gm-1",
          name: "Thong_tin_dat_hang_GreenMart.txt",
          format: "TXT",
          receivedAt: "18/10/2026 11:00",
          summary: "Mô tả đặc thù đơn hàng thực phẩm tươi sống và giới hạn giá trị đơn hàng khách lẻ.",
          content: "DOANH NGHIỆP: GreenMart (GM-2026)\nGÓI DỊCH VỤ: Free (Kiểm tra bằng bộ quy tắc)\nYÊU CẦU:\n- Cảnh báo đơn đặt hàng khách lẻ vượt quá 8.000.000 VND để nhân viên gọi xác nhận trước khi xuất kho.\n- Cảnh báo đơn hàng sử dụng mã giảm giá có tỷ lệ chiết khấu vượt ngưỡng 50%."
        }
      ],
      suggestedSupplementItems: [
        "Cung cấp danh mục mã chương trình khuyến mãi áp dụng trong quý hiện tại"
      ],
      supplementRequests: [],
      conditionsList: [
        {
          id: "cond-gm-1",
          name: "Đơn hàng thực phẩm tươi sống vượt hạn mức khách lẻ",
          criteria: "amount > 8000000",
          scope: "Giao dịch thanh toán đơn hàng trực tuyến (payment) của GreenMart"
        },
        {
          id: "cond-gm-2",
          name: "Tỷ lệ chiết khấu trên đơn hàng cao bất thường",
          criteria: "discount_percent > 50",
          scope: "Giao dịch thanh toán có áp dụng mã khuyến mãi"
        }
      ],
      schema: [
        { name: "amount", type: "number", required: true, description: "Giá trị thanh toán của đơn hàng (VND)" },
        { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh người đặt hàng" },
        { name: "discount_percent", type: "number", required: false, description: "Phần trăm chiết khấu áp dụng trên đơn hàng (0 - 100)" }
      ],
      savedDraft: {
        version: "v1.0",
        requirements: "Kiểm tra đơn đặt hàng thực phẩm vượt hạn mức khách lẻ và chiết khấu bất thường cho GreenMart.",
        conditionsList: [
          {
            id: "cond-gm-1",
            name: "Đơn hàng thực phẩm tươi sống vượt hạn mức khách lẻ",
            criteria: "amount > 8000000",
            scope: "Giao dịch thanh toán đơn hàng trực tuyến (payment) của GreenMart"
          },
          {
            id: "cond-gm-2",
            name: "Tỷ lệ chiết khấu trên đơn hàng cao bất thường",
            criteria: "discount_percent > 50",
            scope: "Giao dịch thanh toán có áp dụng mã khuyến mãi"
          }
        ],
        schema: [
          { name: "amount", type: "number", required: true, description: "Giá trị thanh toán của đơn hàng (VND)" },
          { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh người đặt hàng" },
          { name: "discount_percent", type: "number", required: false, description: "Phần trăm chiết khấu áp dụng trên đơn hàng (0 - 100)" }
        ],
        sampleJson: "[]",
        updatedAt: "2026-10-19T09:30:00Z",
        sentAt: "2026-10-19T10:00:00Z",
        sentBy: "Nguyễn Minh Hà"
      },
      sentSnapshot: {
        version: "v1.0",
        requirements: "Kiểm tra đơn đặt hàng thực phẩm vượt hạn mức khách lẻ và chiết khấu bất thường cho GreenMart.",
        conditionsList: [
          {
            id: "cond-gm-1",
            name: "Đơn hàng thực phẩm tươi sống vượt hạn mức khách lẻ",
            criteria: "amount > 8000000",
            scope: "Giao dịch thanh toán đơn hàng trực tuyến (payment) của GreenMart"
          },
          {
            id: "cond-gm-2",
            name: "Tỷ lệ chiết khấu trên đơn hàng cao bất thường",
            criteria: "discount_percent > 50",
            scope: "Giao dịch thanh toán có áp dụng mã khuyến mãi"
          }
        ],
        schema: [
          { name: "amount", type: "number", required: true, description: "Giá trị thanh toán của đơn hàng (VND)" },
          { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh người đặt hàng" },
          { name: "discount_percent", type: "number", required: false, description: "Phần trăm chiết khấu áp dụng trên đơn hàng (0 - 100)" }
        ],
        sampleJson: "[]",
        updatedAt: "2026-10-19T09:30:00Z",
        sentAt: "2026-10-19T10:00:00Z",
        sentBy: "Nguyễn Minh Hà"
      },
      sentHistory: [
        {
          version: "v1.0",
          requirements: "Kiểm tra đơn đặt hàng thực phẩm vượt hạn mức khách lẻ và chiết khấu bất thường cho GreenMart.",
          conditionsList: [
            {
              id: "cond-gm-1",
              name: "Đơn hàng thực phẩm tươi sống vượt hạn mức khách lẻ",
              criteria: "amount > 8000000",
              scope: "Giao dịch thanh toán đơn hàng trực tuyến (payment) của GreenMart"
            },
            {
              id: "cond-gm-2",
              name: "Tỷ lệ chiết khấu trên đơn hàng cao bất thường",
              criteria: "discount_percent > 50",
              scope: "Giao dịch thanh toán có áp dụng mã khuyến mãi"
            }
          ],
          schema: [
            { name: "amount", type: "number", required: true, description: "Giá trị thanh toán của đơn hàng (VND)" },
            { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh người đặt hàng" },
            { name: "discount_percent", type: "number", required: false, description: "Phần trăm chiết khấu áp dụng trên đơn hàng (0 - 100)" }
          ],
          sampleJson: "[]",
          updatedAt: "2026-10-19T09:30:00Z",
          sentAt: "2026-10-19T10:00:00Z",
          sentBy: "Nguyễn Minh Hà"
        }
      ],
      feedbackHistory: [],
      dataAndEvaluationClarified: true,
      dataClarifiedAt: "2026-10-19T09:45:00Z",
      dataClarifiedBy: "Nguyễn Minh Hà",
      requirements: "Kiểm tra đơn đặt hàng thực phẩm vượt hạn mức khách lẻ và chiết khấu bất thường cho GreenMart.",
      fields: "amount (number, bắt buộc), user_hash (string, bắt buộc), discount_percent (number, tùy chọn)",
      conditions: "1. Đơn hàng thực phẩm tươi sống vượt hạn mức khách lẻ: amount > 8000000\n2. Tỷ lệ chiết khấu trên đơn hàng cao bất thường: discount_percent > 50",
      sampleJson: "[]",
      updatedAt: "2026-10-19T10:00:00Z"
    }
  },
  {
    id: "tenant-techpay",
    code: "TP-2026",
    name: "TechPay FinTech",
    projectIds: ["proj-wallet", "proj-checkout"],
    deploymentStaffId: "usr-deployment-2",
    plan: "Subscription",
    specification: {
      stage: "clarifying",
      businessModel: "Ví điện tử & Cổng thanh toán trực tuyến",
      deploymentScopeNote: "1 workspace = 1 phạm vi triển khai chính (Ví điện tử & Cổng thanh toán TechPay) + 1 bộ cấu hình phát hiện.",
      representativeName: "Lê Minh Quân",
      representativeRole: "Trưởng bộ phận Quản trị Rủi ro Thanh toán",
      representativeEmail: "quan.le@techpay.vn",
      smeAdminName: "Lê Minh Quân",
      smeAdminEmail: "quan.le@techpay.vn",
      intakeReviewNote: "Đang làm rõ danh mục trường dữ liệu cho giao dịch nạp/rút ví và thanh toán qua cổng.",
      intakeDocuments: [
        {
          id: "doc-tp-1",
          name: "Dac_ta_luong_giao_dich_TechPay.txt",
          format: "TXT",
          receivedAt: "15/10/2026 08:45",
          summary: "Tài liệu mô tả các loại giao dịch ví điện tử và cổng thanh toán.",
          content: "DOANH NGHIỆP: TechPay FinTech (TP-2026)\nPHẠM VI: Dự án Ví điện tử (proj-wallet) và Cổng thanh toán (proj-checkout).\nYÊU CẦU: Phát hiện giao dịch rút tiền hoặc chuyển khoản vượt ngưỡng 50.000.000 VND/lần."
        }
      ],
      suggestedSupplementItems: [
        "Xác nhận danh sách mã quốc gia kết nối hợp lệ đối với cổng thanh toán"
      ],
      supplementRequests: [],
      conditionsList: [
        {
          id: "cond-tp-1",
          name: "Giao dịch ví vượt hạn mức đơn lẻ",
          criteria: "amount > 50000000",
          scope: "Giao dịch thanh toán và rút ví trên proj-wallet, proj-checkout"
        }
      ],
      schema: [
        { name: "amount", type: "number", required: true, description: "Số tiền giao dịch (VND)" },
        { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh chủ ví" }
      ],
      savedDraft: {
        version: "v1.0",
        requirements: "Giám sát giao dịch ví điện tử và cổng thanh toán giá trị lớn cho TechPay FinTech.",
        conditionsList: [
          {
            id: "cond-tp-1",
            name: "Giao dịch ví vượt hạn mức đơn lẻ",
            criteria: "amount > 50000000",
            scope: "Giao dịch thanh toán và rút ví trên proj-wallet, proj-checkout"
          }
        ],
        schema: [
          { name: "amount", type: "number", required: true, description: "Số tiền giao dịch (VND)" },
          { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh chủ ví" }
        ],
        sampleJson: "[]",
        updatedAt: "2026-10-16T11:00:00Z"
      },
      feedbackHistory: [],
      dataAndEvaluationClarified: false,
      requirements: "Giám sát giao dịch ví điện tử và cổng thanh toán giá trị lớn cho TechPay FinTech.",
      fields: "amount (number, bắt buộc), user_hash (string, bắt buộc)",
      conditions: "Giao dịch ví vượt hạn mức đơn lẻ: amount > 50000000",
      sampleJson: "[]",
      updatedAt: "2026-10-16T11:00:00Z"
    }
  },
  {
    id: "tenant-edulearn",
    code: "EL-2026",
    name: "EduLearn VN",
    projectIds: ["proj-edtech"],
    deploymentStaffId: "usr-deployment-2",
    plan: "Subscription",
    specification: {
      stage: "waiting_reconfirmation",
      businessModel: "Nền tảng khóa học trực tuyến & Thanh toán học phí",
      deploymentScopeNote: "1 workspace = 1 phạm vi triển khai chính (Cổng học phí EduLearn) + 1 bộ cấu hình phát hiện.",
      representativeName: "Hoàng Thu Trang",
      representativeRole: "Quản lý Vận hành Học vụ",
      representativeEmail: "trang.hoang@edulearn.vn",
      smeAdminName: "Hoàng Thu Trang",
      smeAdminEmail: "trang.hoang@edulearn.vn",
      intakeReviewNote: "Đã cập nhật bản đặc tả v1.2 theo phản hồi của EduLearn về ngưỡng hoàn học phí và đang chờ doanh nghiệp xác nhận lại.",
      intakeDocuments: [
        {
          id: "doc-el-1",
          name: "Quy_dinh_thanh_toan_hoc_phi_EduLearn.txt",
          format: "TXT",
          receivedAt: "11/10/2026 10:00",
          summary: "Quy định thanh toán và hoàn học phí khóa học trực tuyến.",
          content: "DOANH NGHIỆP: EduLearn VN (EL-2026)\nYÊU CẦU: Kiểm soát giao dịch hoàn học phí vượt 10.000.000 VND và giao dịch mua khóa học lặp bất thường."
        }
      ],
      suggestedSupplementItems: [],
      supplementRequests: [],
      conditionsList: [
        {
          id: "cond-el-1",
          name: "Yêu cầu hoàn học phí giá trị cao",
          criteria: "amount > 10000000",
          scope: "Giao dịch hoàn học phí (refund) thuộc dự án proj-edtech"
        }
      ],
      schema: [
        { name: "amount", type: "number", required: true, description: "Số tiền học phí / hoàn phí (VND)" },
        { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh học viên" },
        { name: "course_pack", type: "string", required: false, description: "Mã gói khóa học đăng ký" }
      ],
      savedDraft: {
        version: "v1.2",
        requirements: "Giám sát giao dịch mua khóa học và hoàn học phí bất thường trên nền tảng EduLearn VN.",
        conditionsList: [
          {
            id: "cond-el-1",
            name: "Yêu cầu hoàn học phí giá trị cao",
            criteria: "amount > 10000000",
            scope: "Giao dịch hoàn học phí (refund) thuộc dự án proj-edtech"
          }
        ],
        schema: [
          { name: "amount", type: "number", required: true, description: "Số tiền học phí / hoàn phí (VND)" },
          { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh học viên" },
          { name: "course_pack", type: "string", required: false, description: "Mã gói khóa học đăng ký" }
        ],
        sampleJson: "[]",
        updatedAt: "2026-10-21T16:00:00Z",
        sentAt: "2026-10-21T16:10:00Z",
        sentBy: "Phạm Quốc Anh",
        revisionSummary: "Điều chỉnh ngưỡng hoàn học phí từ 8.000.000 VND lên 10.000.000 VND và bổ sung trường course_pack theo phản hồi của EduLearn VN."
      },
      sentSnapshot: {
        version: "v1.2",
        requirements: "Giám sát giao dịch mua khóa học và hoàn học phí bất thường trên nền tảng EduLearn VN.",
        conditionsList: [
          {
            id: "cond-el-1",
            name: "Yêu cầu hoàn học phí giá trị cao",
            criteria: "amount > 10000000",
            scope: "Giao dịch hoàn học phí (refund) thuộc dự án proj-edtech"
          }
        ],
        schema: [
          { name: "amount", type: "number", required: true, description: "Số tiền học phí / hoàn phí (VND)" },
          { name: "user_hash", type: "string", required: true, description: "Mã định danh ẩn danh học viên" },
          { name: "course_pack", type: "string", required: false, description: "Mã gói khóa học đăng ký" }
        ],
        sampleJson: "[]",
        updatedAt: "2026-10-21T16:00:00Z",
        sentAt: "2026-10-21T16:10:00Z",
        sentBy: "Phạm Quốc Anh",
        revisionSummary: "Điều chỉnh ngưỡng hoàn học phí từ 8.000.000 VND lên 10.000.000 VND và bổ sung trường course_pack theo phản hồi của EduLearn VN."
      },
      feedbackHistory: [
        {
          id: "fb-el-1",
          versionTarget: "v1.1",
          receivedAt: "21/10/2026 14:30",
          channel: "Email",
          contactPerson: "Hoàng Thu Trang",
          content: "Đề nghị nâng ngưỡng cảnh báo hoàn học phí lên 10.000.000 VND vì gói khóa học combo năm hiện có mức học phí 9.500.000 VND."
        }
      ],
      dataAndEvaluationClarified: true,
      dataClarifiedAt: "2026-10-21T16:05:00Z",
      dataClarifiedBy: "Phạm Quốc Anh",
      requirements: "Giám sát giao dịch mua khóa học và hoàn học phí bất thường trên nền tảng EduLearn VN.",
      fields: "amount (number, bắt buộc), user_hash (string, bắt buộc), course_pack (string, tùy chọn)",
      conditions: "Yêu cầu hoàn học phí giá trị cao: amount > 10000000",
      sampleJson: "[]",
      updatedAt: "2026-10-21T16:10:00Z"
    }
  }
];
