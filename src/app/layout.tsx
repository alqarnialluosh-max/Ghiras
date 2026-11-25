import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | دروس خصوصية أونلاين للابتدائي والمتوسط`, template: `%s | ${site.name}` },
  description: "حصص خصوصية أونلاين عبر Teams في الرياضيات ولغتي والعلوم، للصفوف من الأول الابتدائي إلى الثالث المتوسط، بإشراف المعلمة غادة القرني.",
  openGraph: { locale: "ar_SA", type: "website", siteName: site.name },
};

export const viewport: Viewport = { themeColor: "#5b45b0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-50 btn btn-primary">
          تخطَّ إلى المحتوى
        </a>
        {children}
      </body>
    </html>
  );
}
