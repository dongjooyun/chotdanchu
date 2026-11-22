import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const DESCRIPTION = "첫 회사, 3년 뒤까지 보고 고르기";

/**
 * 링크 공유 미리보기 (카카오톡, 슬랙, X 등). 이미지는 public/og.png (1200x630, 흰 배경 + 단추 로고 + 글자, 11/22).
 * 카카오톡은 처음 본 미리보기를 캐시하므로, 바꾼 뒤에는 카카오 공유 디버거에서 주소를 새로 스크랩한다.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://chotdanchu.vercel.app"),
  title: "첫단추",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "첫단추",
    title: "첫단추",
    description: DESCRIPTION,
    url: "/",
    locale: "ko_KR",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "첫단추 로고" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "첫단추",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 글꼴 Pretendard v1.3.9 (SIL OFL 1.1, docs/data-sources.md). 정적 CSS 한 장이라 외부 링크로 둔다 */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
      </head>
      <body className="min-h-full">
        {children}
        {/* 방문 통계 (Vercel Web Analytics): 쿠키 없이 방문 수, 페이지, 국가, 기기 종류만 익명으로 센다. 이름이나 입력 내용은 보내지 않는다 */}
        <Analytics />
      </body>
    </html>
  );
}
