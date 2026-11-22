"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * 모바일 오른쪽 아래 둥근 아이콘 버튼. 휴대폰에는 마우스를 올리는 동작이 없어서, 꾹 누르면(0.45초) 버튼 이름이 왼쪽에 뜬다 (11/22).
 * 꾹 눌러 이름을 본 뒤 손을 떼면 버튼은 눌리지 않는다. 짧게 누르면 바로 동작한다.
 */
export function Fab({
  label,
  tone,
  onClick,
  disabled,
  children,
}: {
  label: string;
  tone: "ai" | "quiet" | "lilac";
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <span className="fab-wrap">
      {show && (
        <span className="fab-label" role="tooltip">
          {label}
        </span>
      )}
      <button
        type="button"
        className={`fab fab-${tone}`}
        aria-label={label}
        disabled={disabled}
        onPointerDown={() => {
          longPressed.current = false;
          clear();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            setShow(true);
          }, 450);
        }}
        onPointerUp={() => {
          clear();
          if (longPressed.current) setTimeout(() => setShow(false), 1200);
        }}
        onPointerLeave={() => {
          clear();
          setShow(false);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onClick();
        }}
      >
        {children}
      </button>
    </span>
  );
}
