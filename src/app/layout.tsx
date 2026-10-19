import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/components/common/Toast";
import { ConfirmProvider } from "@/components/common/ConfirmDialog";
import { AppLayout } from "@/components/layout/AppLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "ケンシュウリンク — 研修講師 × 企業・個人のマッチング",
  description:
    "IT・マネジメント・語学まで、経験豊富な研修講師を分野・形態・予算で検索。依頼から見積り、実施後の評価まで、ケンシュウリンクで完結します。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" data-scroll-behavior="smooth">
      <body>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AppLayout>{children}</AppLayout>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
