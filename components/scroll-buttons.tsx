"use client";

import { useEffect, useState } from "react";

/**
 * 맨 위로, 맨 아래로 가기 버튼 (11/22). 모바일 채팅 화면 왼쪽 아래에 작은 회색 화살표 버튼으로 뜬다.
 * 위로는 조금 내려왔을 때, 아래로는 아래에 더 볼 것이 있을 때만 보인다. 위치는 입력창 바로 위로 맞춘다.
 */
export function ScrollButtons() {
  const [state, setState] = useState({ up: false, down: false });

  useEffect(() => {
    const input = document.querySelector<HTMLElement>(".inputbar");
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setState((s) => {
        const next = { up: y > 400, down: max - y > 400 };
        return s.up === next.up && s.down === next.down ? s : next;
      });
      if (input) document.documentElement.style.setProperty("--inputbar-h", `${input.offsetHeight}px`);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    queue();
    const ro = new ResizeObserver(queue);
    ro.observe(document.body);
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const go = (top: number) => window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return (
    <div className="scroll-btns only-mobile" data-el="맨위 맨아래 버튼">
      {state.up && (
        <button type="button" aria-label="맨 위로" onClick={() => go(0)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
      {state.down && (
        <button type="button" aria-label="맨 아래로" onClick={() => go(document.documentElement.scrollHeight)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 9l7 7 7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}
