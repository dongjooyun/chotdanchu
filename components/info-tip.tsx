"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * (i) 아이콘 그림 (11/22 동주 제공 SVG 기준). 연한 회색 동그라미 테두리와 가운데 정렬된 i, 살짝 입체감.
 * 입체감은 그림자 없이 동그라미 안쪽 위에서 아래로 흰색 -> 아주 연한 회색 그라데이션과 위쪽 안쪽 하이라이트 선으로만 낸다.
 * 보이는 동그라미 지름은 예전과 같은 14px이고(18px 칸 안), 색은 글자색(currentColor)을 따라 마우스를 올리면 진해진다.
 */
function InfoIcon() {
  const gid = `info-g-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gid} x1="12" y1="2.75" x2="12" y2="21.25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#edf0f3" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.25" fill={`url(#${gid})`} stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.4 9.6A6.2 6.2 0 0 1 12 5.9" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" opacity=".95" />
      <path d="M12 11.5V16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="8.25" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * (i) 설명 아이콘과 설명 말풍선 (11/22 다시 만듦).
 * 말풍선은 카드 안이 아니라 화면 맨 위(body)에 띄운다. 카드 안에 두면 (1) 카드를 뒤집을 때 사파리에서 글자가 거꾸로 보이고
 * (2) 카드의 overflow: hidden에 잘리고 (3) 고정된 left 값 때문에 좁은 화면 가장자리에서 어긋났다.
 * 아이콘의 실제 위치를 재서 위쪽(공간이 없으면 아래쪽)에 띄우고, 화면 밖으로 나가지 않게 좌우를 맞춘다.
 * 폰은 누르면 열리고 바깥을 누르거나 다시 누르면 닫힌다. PC는 마우스를 올리면 열리고, 키보드 포커스로도 열린다.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean; arrow: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    const p = pop.current;
    if (!b || !p) return;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const gap = 8;
    const vw = document.documentElement.clientWidth;
    const left = Math.max(8, Math.min(b.left + b.width / 2 - w / 2, vw - w - 8));
    // 위쪽에 자리가 없으면(맨 위 헤더 56px 포함) 아래쪽으로 연다
    const below = b.top - h - gap < 64;
    const top = below ? b.bottom + gap : b.top - h - gap;
    // 말풍선 꼬리는 아이콘 가운데를 가리킨다
    const arrow = Math.max(10, Math.min(b.left + b.width / 2 - left, w - 10));
    setPos({ top, left, below, arrow });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      const t = e.target as Node;
      if (btn.current?.contains(t) || pop.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, place]);

  const pointer = useRef("");
  // 창(dialog) 안의 (i)는 말풍선도 그 창 안에 띄운다. 창은 화면 맨 위 층에 떠서 body에 띄우면 창 뒤로 숨는다 (11/23 QA: 카드 모음 창에서 말풍선이 안 뜸)
  const [host, setHost] = useState<HTMLElement | null>(null);
  const show = (v: boolean | ((v: boolean) => boolean)) => {
    setHost(btn.current?.closest("dialog") ?? null);
    setOpen(v);
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="info tip"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        data-el="설명 아이콘"
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onPointerEnter={(e) => e.pointerType === "mouse" && show(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
        onFocus={() => pointer.current !== "touch" && show(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // 카드 위의 (i)를 눌러도 카드가 뒤집히지 않게 한다
          e.stopPropagation();
          if (pointer.current === "mouse") return;
          show((v) => !v);
        }}
      >
        <InfoIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="tooltip"
            className="tip-float"
            data-below={pos?.below ? "true" : "false"}
            style={pos ? { top: pos.top, left: pos.left, ["--arrow" as string]: `${pos.arrow}px` } : { top: 0, left: 0, visibility: "hidden" }}
          >
            {children}
          </div>,
          host ?? document.body,
        )}
    </>
  );
}
