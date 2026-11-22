"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MobileMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * 모바일 메뉴 버튼 (11/22). 입력창 오른쪽에 늘 보이는 둥근 버튼 하나이고, 누르면 위로 펼쳐지며 메뉴 목록이 뜬다.
 * 예전 둥근 버튼 3개(대화 새로 시작, 맞대결, 사고 과정)는 카드와 겹쳐서 없애고 이 메뉴로 합쳤다.
 * forceOpen은 튜토리얼에서 펼쳐 둔 채로 보여 줄 때 쓴다.
 * 맨 위 한 줄은 지금 보고 있는 직무와 회사다(모바일에서는 위쪽 정보줄을 없앴다). 바깥을 누르거나 Esc로 닫는다.
 */
export function MobileMenu({ status, items, forceOpen = false }: { status: string; items: MobileMenuItem[]; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
      } else if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="mmenu only-mobile" ref={root} data-el="모바일 메뉴">
      {(open || forceOpen) && (
        <div className="mmenu-pop" role="menu" aria-label="메뉴">
          <p className="mmenu-status">{status}</p>
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="mmenu-btn" aria-label="메뉴" aria-haspopup="menu" aria-expanded={open || forceOpen} onClick={() => setOpen((v) => !v)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <circle cx="6" cy="18" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
        </svg>
      </button>
    </div>
  );
}
