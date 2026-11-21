import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "첫단추",
  description: "첫 회사, 3년 뒤까지 보고 고르세요. 직무와 기업명만으로 첫 커리어 발판을 판단하는 에이전트",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 글꼴 Pretendard v1.3.9 (SIL OFL 1.1, docs/data-sources.md). 정적 CSS 한 장이라 외부 링크로 둔다 */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
