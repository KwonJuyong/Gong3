import "./globals.css";
import type { Metadata, Viewport } from "next";
import PWARegister from "./pwa-register";
import { FeedbackHost } from "./components/feedback";

export const metadata: Metadata = {
  // 페이지의 metadata.title 이 있으면 「회원 관리 · AI 평가단」 형태가 된다.
  title: { default: "AI 평가단", template: "%s · AI 평가단" },
  description: "AI 평가단 플랫폼",
  applicationName: "AI 평가단",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "AI 평가단" },
  // .ico를 반드시 함께 준다 — Windows 바로가기/작업표시줄은 SVG 파비콘을 읽지 못해
  // 브라우저 기본 아이콘으로 떨어진다. PNG는 탭·북마크용.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48 32x32 16x16" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard 동적 서브셋. 불러오지 못하면 system-ui 로 대체된다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">
        {children}
        <FeedbackHost />
        <PWARegister />
      </body>
    </html>
  );
}
