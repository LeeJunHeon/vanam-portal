import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import PushManager from "@/components/PushManager";
import ChatWidget from "@/components/portal/ChatWidget";
import "./globals.css";

export const metadata: Metadata = {
  title: "VanaM Platform",
  description: "VanaM 통합 플랫폼",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VanaM",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 서버 사이드 세션 확인 — 미인증 사용자에게는 ChatWidget을 HTML에 포함시키지 않음
  const session = await auth();

  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>
        <SessionProvider>
          {children}
          {session?.user && <ChatWidget />}
          <PushManager />
        </SessionProvider>
      </body>
    </html>
  );
}
