"use client";

import Link from "next/link";
import { ModeBadge } from "@/components/mode-badge";
import type { AppMode } from "@/lib/chat";

/**
 * 맨 위 헤더: 로고 자리, 서비스 이름. 한 줄 소개는 휴대폰에서 잘려 11/23에 뺐다. 모드 배지와 카탈로그 링크는 목업(개발) 모드에서만 (PRD 01).
 * 로고와 이름을 하나의 링크로 묶어 누르면 홈(챗봇 화면)으로 간다 (11/22).
 * onHome이 있으면 새로고침 없이 화면만 바꾸고, 없으면(카탈로그 등 다른 페이지) 주소 "/"로 이동한다.
 */
export function AppHeader({ mode, onHome }: { mode: AppMode; onHome?: () => void }) {
  return (
    <header className="app-header" data-el="헤더">
      <Link
        href="/"
        className="brand-link"
        data-el="홈 링크"
        aria-label="첫단추 홈으로"
        onClick={(e) => {
          if (!onHome) return;
          e.preventDefault();
          onHome();
        }}
      >
        {/* 로고: 보라 단추 아이콘 (11/22 후보 A, design/logo-candidates). 파비콘도 같은 그림이다 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo-slot" data-el="로고 자리" src="/brand/logo.png" alt="" width={32} height={32} />
        <h1 className="brand">첫단추</h1>
      </Link>
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
