import { isAgentDecision, LogBadge } from "@/components/log-badge";
import type { LogLine } from "@/lib/chat";

/**
 * 말풍선 안의 진행 기록 (PRD 07). 도출 근거는 사용자보다 개발자와 심사위원이 보는 정보라 기본은 접어 두고,
 * "어떻게 도출했나요?"를 누르면 도구 호출과 AI 판단 줄이 펼쳐진다. 전체 기록은 에이전트 사고 과정 패널에 있다.
 */
export function InlineLog({ lines: all }: { lines: LogLine[] }) {
  // 확인 불가 줄은 지표 계산 줄의 "확인 불가 N개"로 묶이므로 말풍선에서는 빼고 패널에만 둔다
  const lines = all.filter((l) => l.type !== "unavailable");
  if (lines.length === 0) return null;
  return (
    <details className="ilog-t" data-el="진행 기록">
      <summary>어떻게 도출했나요?</summary>
      <div className="ilog">
        {lines.map((l, i) => (
          <div key={`${l.step}-${i}`} className="row">
            <LogBadge type={l.type} />
            <span className={l.type === "tool_call" ? "mono" : undefined}>
              {l.title}
              {l.reason && isAgentDecision(l.type) && <span className="muted"> ({l.reason})</span>}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
