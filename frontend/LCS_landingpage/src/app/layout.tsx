import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FraudGuard | Giải pháp quản lý rủi ro giao dịch cho doanh nghiệp",
  description: "Tìm hiểu FraudGuard: giải pháp giám sát giao dịch bất thường, quản trị nền tảng và phối hợp điều tra dành cho doanh nghiệp SME.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
