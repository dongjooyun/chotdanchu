import type { ReactNode } from "react";

/**
 * lo-fi 단계의 공통 상자. 왼쪽 위에 요소 이름표를 붙여서 "이게 무슨 요소인지" 바로 보이게 한다.
 * 디자인 시안이 들어오면 이 상자를 실제 디자인으로 바꾼다.
 */
export function LofiBox({
  label,
  children,
  className = "",
}: {
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative rounded-md border border-dashed border-line bg-box p-3 pt-6 ${className}`}>
      <span className="absolute left-2 top-1 rounded bg-tag px-1.5 text-[11px] text-muted">[{label}]</span>
      {children}
    </section>
  );
}
