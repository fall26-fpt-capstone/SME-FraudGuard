import type { UserProfile } from "@/types/fraudguard";

export const DEMO_USERS: UserProfile[] = [
  {
    id: "usr-platform-admin",
    name: "Lê Hoàng Phúc",
    email: "phuc.lh@fraudguard.io",
    role: "Platform Admin",
    title: "Platform Superadmin",
    avatarLetter: "P",
    avatarBg: "#d97706", // Amber
    description:
      "Quản trị hệ thống, doanh nghiệp và tài khoản; xem tình trạng triển khai và tập rule, không cấu hình hay phát hành rule.",
  },
    {
    id: "usr-deployment",
    name: "Nguyễn Minh Hà",
    email: "ha.nm@fraudguard.io",
    role: "Implementation Staff",
    title: "Nhân viên triển khai",
    avatarLetter: "H",
    avatarBg: "#2563eb",
    description:
      "Triển khai TechPay, FastRetail và ABC Fashion: cấu hình, kiểm thử, review, phát hành và bàn giao.",
  },
  {
    id: "usr-deployment-2",
    name: "Phạm Thu Linh",
    email: "linh.pt@fraudguard.io",
    role: "Implementation Staff",
    title: "Nhân viên triển khai",
    avatarLetter: "L",
    avatarBg: "#0284c7",
    description:
      "Triển khai EduLearn và GreenMart; chỉ thao tác doanh nghiệp được phân công.",
  },

  {
    id: "usr-sme-admin",
    enterpriseId: "tenant-abc",
    name: "Trần Mai Anh",
    email: "anh.tm@abcfashion.vn",
    role: "SME Admin",
    title: "Security & Risk Lead",
    avatarLetter: "A",
    avatarBg: "#7c3aed", // Purple
    description:
      "Quản trị viên doanh nghiệp (ABC Fashion): Giám sát tổng quan, quản lý thành viên & phân quyền, cấu hình API Key và xem báo cáo điều hành.",
  },
  {
    id: "usr-techpay-admin",
    enterpriseId: "tenant-techpay",
    name: "TechPay Admin (Demo)",
    email: "admin@techpay.example",
    role: "SME Admin",
    title: "Enterprise Administrator",
    avatarLetter: "T",
    avatarBg: "#2563eb",
    description:
      "Tài khoản demo của TechPay: xem kết quả Mobile Wallet và Checkout Gateway sau bàn giao.",
  },
  {
    id: "usr-operation",
    enterpriseId: "tenant-abc",
    name: "Đặng Tuấn Kiệt",
    email: "kiet.dt@abcfashion.vn",
    role: "Operator",
    title: "Risk Operations Team Leader",
    avatarLetter: "K",
    avatarBg: "#2563eb", // Blue
    description:
      "Trưởng nhóm vận hành: Quản lý hàng đợi cảnh báo, phân công case cho điều tra viên, duyệt báo cáo điều tra và đưa ra quyết định xử lý cuối cùng.",
  },
  {
    id: "usr-investigator",
    enterpriseId: "tenant-abc",
    name: "Nguyễn Văn An",
    email: "an.nv@abcfashion.vn",
    role: "Investigator",
    title: "Fraud Field Investigator",
    avatarLetter: "N",
    avatarBg: "#0284c7", // Sky blue
    description:
      "Điều tra viên hiện trường: Tiếp nhận case được giao (My Cases), xác minh chứng cứ đơn COD, ghi chú và gửi báo cáo kết luận về cho Operator.",
  },

];

export const DEFAULT_DEMO_USER = DEMO_USERS.find(user => user.id === "usr-deployment")!;
