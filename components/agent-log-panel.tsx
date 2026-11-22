import { CloseButton } from "@/components/close-button";
import { LogBadge } from "@/components/log-badge";
import type { LogLine } from "@/lib/chat";

/**
 * 에이전트 사고 과정 패널 (PRD 07, data-el 판단 로그 패널). 기본은 닫혀 있고, 고정 정보줄의
 * "에이전트 사고 과정 보기"를 누르면 PC에서는 오른쪽, 모바일에서는 채팅 아래에 단계 흐름으로 열린다.
 */
/** bare: 창 안에 넣을 때. 창 제목이 있으니 패널 제목을 빼고 내용을 위로 올린다 */
export function AgentLogPanel({ lines, onClose, bare = false }: { lines: LogLine[]; onClose?: () => void; bare?: boolean }) {
  return (
    <aside className={bare ? "aside aside-bare" : "aside"} id={bare ? undefined : "think-panel"} data-el="판단 로그 패널" aria-label="에이전트 사고 과정">
      {!bare && (
        <div className="panel-h panel-h-row">
          <span>에이전트 사고 과정</span>
          {onClose && <CloseButton onClick={onClose} label="에이전트 사고 과정 닫기" />}
        </div>
      )}
      <p className="panel-sub">답을 만들 때 거친 단계입니다. 숫자와 등급은 코드가 계산하고, AI는 세 가지(동명 법인 판별, 하는 일 세 줄 요약, 성향 설명 한 문장)만 맡습니다.</p>
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
    </aside>
  );
}
