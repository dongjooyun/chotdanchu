"use client";

import { useState } from "react";

/**
 * 화면 메뉴 3개: 튜토리얼, 챗봇, 기업 카드 모음 (11/22).
 * - PC(821px 이상): 왼쪽에 아이콘만 있는 세로 사이드바. 마우스를 올리거나 키보드로 들어오면 펼쳐져 이름이 보인다
 * - 모바일: 화면 맨 아래 3칸 탭. 같은 아이콘 아래에 이름을 작게 쓴다 (아이콘과 글자는 같은 칸 너비에 가운데 정렬)
 * 챗봇이 기본 화면이고, 기업 카드 모음은 예전 홈 아래쪽 모음 구역만 따로 보여 준다. 튜토리얼은 온보딩 안내 자리다(동주 태스크).
 */
export type AppView = "tutorial" | "chat" | "collection";

const ITEMS: { id: AppView; label: string; icon: React.ReactNode }[] = [
  {
    id: "tutorial",
    label: "튜토리얼",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
        <path d="M12 17h.01" />
      </>
    ),
  },
  {
    id: "chat",
    label: "챗봇",
    icon: <path d="M4 5h16v11H9l-5 4V5Z" />,
  },
  {
    id: "collection",
    label: "기업 카드 모음",
    icon: (
      <>
        <rect x="3" y="4" width="8" height="11" rx="1" />
        <rect x="13" y="4" width="8" height="11" rx="1" />
        <path d="M3 19h18" />
      </>
    ),
  },
];

export function AppNav({ view, onChange, count }: { view: AppView; onChange: (v: AppView) => void; count: number }) {
  // 메뉴를 누르면 마우스가 사이드바 위에 있어도 바로 아이콘만 남게 접고, 마우스가 나갔다 다시 들어오면 다시 펼친다 (11/22)
  const [picked, setPicked] = useState(false);
  return (
    <nav className={picked ? "app-nav is-picked" : "app-nav"} aria-label="메뉴" data-el="메뉴" onMouseLeave={() => setPicked(false)}>
      {ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          className="app-nav-item"
          aria-current={view === it.id ? "page" : undefined}
          onClick={(e) => {
            onChange(it.id);
            setPicked(true);
            // 마우스로 누른 뒤 포커스가 남아 사이드바가 펼쳐진 채로 있지 않게 한다
            e.currentTarget.blur();
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {it.icon}
          </svg>
          <span className="app-nav-label">
            {it.label}
            {it.id === "collection" && count > 0 ? ` (${count})` : ""}
          </span>
        </button>
      ))}
    </nav>
  );
}
