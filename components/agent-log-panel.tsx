import { LofiBox } from "@/components/lofi-box";
import { LogBadge } from "@/components/log-badge";
import type { LogLine } from "@/lib/chat";

function LogList({ lines }: { lines: LogLine[] }) {
  if (lines.length === 0) {
    return <p className="text-xs text-muted">아직 기록이 없습니다. 기업을 분석하면 에이전트가 무엇을 왜 했는지 여기에 쌓입니다.</p>;
  }
  return (
    <ol className="flex flex-col gap-2 text-xs">
      {lines.map((l, i) => (
        <li
          key={`${l.step}-${i}`}
          className={`rounded border p-2 ${l.type === "decision" || l.type === "fallback" ? "border-fg" : "border-line"}`}
        >
          <div className="flex items-center gap-1">
            <span className="text-muted">#{l.step}</span>
            <LogBadge type={l.type} />
            <span className="text-[10px] text-muted">{l.mode === "mock" ? "목업" : "실데이터"}</span>
          </div>
          <p className="mt-1">{l.title}</p>
          {l.reason && <p className="mt-0.5 text-muted">이유: {l.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

/**
 * 판단 로그 패널 (PRD 07). 데스크톱에서는 옆에 펼쳐 두고, 모바일에서는 접어 둔다.
 */
export function AgentLogPanel({ lines }: { lines: LogLine[] }) {
  return (
    <LofiBox label="판단 로그 패널" className="h-full">
      <details className="md:hidden">
        <summary className="cursor-pointer text-sm">에이전트 판단 로그 보기 ({lines.length})</summary>
        <div className="mt-2">
          <LogList lines={lines} />
        </div>
      </details>
      <div className="hidden md:block">
        <p className="mb-2 text-sm font-semibold">에이전트 판단 로그</p>
        <LogList lines={lines} />
      </div>
    </LofiBox>
  );
}
