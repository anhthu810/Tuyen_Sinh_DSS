import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DSS Tư vấn Tuyển sinh & Hướng nghiệp — Nhóm 5",
  description:
    "Hệ hỗ trợ quyết định chọn & xếp nguyện vọng đại học: điểm chuẩn, dự báo, việc làm, chi phí (7 trường ĐH Hà Nội, 2023–2026).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="grid min-h-screen grid-cols-1 md:grid-cols-[260px_1fr]">
          <div className="hidden md:block">
            <Suspense fallback={<aside className="h-full border-r bg-card" />}>
              <AppSidebar />
            </Suspense>
          </div>
          <main className="min-w-0 px-5 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
