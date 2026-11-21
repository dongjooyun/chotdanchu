import type { LogType } from "@/lib/chat";

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  decision: "AI 판단",
  tool_call: "도구 호출",
  fallback: "AI 판단",
  unavailable: "확인 불가",
  limit: "호출 상한",
  info: "안내",
};

/** AI가 직접 고른 줄(decision, fallback)인지. 이 줄에만 노랑 "AI 판단" 배지를 붙인다 */
export function isAgentDecision(type: LogType): boolean {
  return type === "decision" || type === "fallback";
}

/**
 * 로그 종류 표시. 노랑은 "AI 판단" 하나뿐이고, 코드가 계산하거나 조회한 줄은 무채색 태그로 그려
 * "AI가 정한 곳"과 "코드가 한 일"을 나눠 보이게 한다.
 */
export function LogBadge({ type }: { type: LogType }) {
  const cls = isAgentDecision(type) ? "tag tag-ai" : type === "tool_call" ? "tag tag-tool" : "tag";
  return <span className={cls}>{LOG_TYPE_LABELS[type]}</span>;
}
