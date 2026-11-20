import { LofiBox } from "@/components/lofi-box";
import { LogBadge } from "@/components/log-badge";
import type { LogLine } from "@/lib/chat";

/**
 * 말풍선 안에 붙는 짧은 진행 기록 (PRD 07). 에이전트가 이 답을 만들려고 무엇을 했는지 2~4줄로 보여준다.
 * 전체 기록과 이유는 옆의 판단 로그 패널에 있다.
 */
export function InlineLog({ lines: all }: { lines: LogLine[] }) {
  // 확인 불가 줄은 지표 계산 줄의 "확인 불가 N개"로 묶이므로 말풍선에서는 빼고 패널에만 둔다
  const lines = all.filter((l) => l.type !== "unavailable");
  if (lines.length === 0) return null;
  return (
    <LofiBox label="진행 기록">
      <ol className="flex flex-col gap-1 text-xs">
        {lines.map((l, i) => (
          <li key={`${l.step}-${i}`} className="flex items-start gap-1.5">
            <LogBadge type={l.type} />
            <span>
              {l.title}
              {l.reason && (l.type === "decision" || l.type === "fallback") && (
                <span className="text-muted"> ({l.reason})</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </LofiBox>
  );
}
