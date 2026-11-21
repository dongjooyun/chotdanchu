import { LogBadge } from "@/components/log-badge";
import type { LogLine } from "@/lib/chat";

/**
 * 에이전트 사고 과정 패널 (PRD 07, data-el 판단 로그 패널). 기본은 닫혀 있고, 고정 정보줄의
 * "에이전트 사고 과정 보기"를 누르면 PC에서는 오른쪽, 모바일에서는 채팅 아래에 단계 흐름으로 열린다.
 */
export function AgentLogPanel({ lines, onClose }: { lines: LogLine[]; onClose?: () => void }) {
  return (
    <aside className="aside" id="think-panel" data-el="판단 로그 패널" aria-label="에이전트 사고 과정">
      <div className="panel-h">에이전트 사고 과정</div>
      <p className="panel-sub">답을 만들 때 거친 단계입니다. 숫자는 코드가 계산하고, AI는 판단과 문장만 맡습니다.</p>
      {lines.length === 0 ? (
        <p className="small muted">아직 기록이 없어요. 기업을 분석하면 무엇을 왜 했는지 여기에 쌓여요.</p>
      ) : (
        <ol className="flow">
          {lines.map((l, i) => (
            <li key={`${l.step}-${i}`}>
              <div className="what">
                <LogBadge type={l.type} />
                <span className={l.type === "tool_call" ? "mono" : undefined}>{l.title}</span>
              </div>
              {l.reason && <div className="why">{l.reason}</div>}
            </li>
          ))}
        </ol>
      )}
      {onClose && (
        <button type="button" className="btn btn-link small" style={{ alignSelf: "flex-start" }} onClick={onClose}>
          닫기
        </button>
      )}
    </aside>
  );
}
