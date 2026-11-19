import type { LogType } from "@/lib/chat";

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  decision: "판단",
  tool_call: "도구 호출",
  fallback: "대체",
  unavailable: "확인 불가",
  limit: "호출 상한",
  info: "안내",
};

/**
 * 로그 종류 표시. 에이전트가 직접 고른 줄(decision, fallback)은 강조 배지로,
 * 코드가 계산하거나 조회한 줄은 흐린 배지로 그려서 "AI가 정한 곳"과 "코드가 한 일"을 나눠 보이게 한다.
 */
export function LogBadge({ type }: { type: LogType }) {
  const agent = type === "decision" || type === "fallback";
  return (
    <span
      className={
        agent
          ? "shrink-0 rounded bg-fg px-1 text-[10px] font-semibold text-bg"
          : "shrink-0 rounded bg-tag px-1 text-[10px] text-muted"
      }
    >
      {agent ? "판단" : LOG_TYPE_LABELS[type]}
    </span>
  );
}
