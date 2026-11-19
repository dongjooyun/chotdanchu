import type { AppMode } from "@/lib/chat";

/** 지금 목업 모드인지 실데이터 모드인지 보여준다 (PRD 07). 버튼이 아니라 표시만 한다 */
export function ModeBadge({ mode }: { mode: AppMode }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
      {mode === "mock" ? "목업 모드" : "실데이터 모드"}
    </span>
  );
}
