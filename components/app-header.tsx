import Link from "next/link";
import { ModeBadge } from "@/components/mode-badge";
import type { AppMode } from "@/lib/chat";

/** 맨 위 헤더: 로고 자리, 서비스 이름, 한 줄 소개. 모드 배지와 카탈로그 링크는 목업(개발) 모드에서만 (PRD 01) */
export function AppHeader({ mode }: { mode: AppMode }) {
  return (
    <header className="app-header" data-el="헤더">
      <span className="logo-slot" data-el="로고 자리" aria-hidden="true">
        첫
      </span>
      <h1 className="brand">
        <Link href="/">첫단추</Link>
      </h1>
      <span className="small muted">첫 회사, 3년 뒤까지 보고 고르세요</span>
      {mode === "mock" && (
        <span className="header-end">
          <ModeBadge mode={mode} />
          <Link href="/catalog" className="tiny muted">
            위젯 카탈로그 (개발용)
          </Link>
        </span>
      )}
    </header>
  );
}
