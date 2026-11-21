"use client";

import { CandidateChips } from "@/components/candidate-chips";
import { CompanyCard } from "@/components/company-card";
import { InlineLog } from "@/components/inline-log";
import { MatchupGame } from "@/components/matchup-card";
import { QuickReplies, type QuickReply } from "@/components/quick-replies";
import { ReportCard } from "@/components/report-card";
import type { ChatWidget, LogLine } from "@/lib/chat";
import type { ReportCardData } from "@/lib/report-card";
import { INDICATOR_LABELS, PREFERENCE_TYPE_LABELS, type Company, type GradedIndicator, type Preference } from "@/lib/types";
import { TYPE_INFO } from "@/lib/matchup";

export type MessageWidget =
  | ChatWidget
  | { type: "matchup" }
  /** 최종 판단 리포트. 모음에 담을 때 쓰려고 그 기업의 카드 내용(analysis)과 맞춤 판정 여부를 같이 둔다 */
  | { type: "report"; data: ReportCardData; personalized?: boolean; analysis?: { company: Company; graded: GradedIndicator[] }; log?: LogLine[] }
  | { type: "preference"; preference: Preference; sentence: string };

export interface ChatMessage {
  id: number;
  from: "agent" | "user";
  text: string;
  widget?: MessageWidget;
  replies?: QuickReply[];
  /** 이 답을 만들 때 에이전트가 한 일. 말풍선 안에 접어 둔다 */
  log?: LogLine[];
}

export interface WidgetHandlers {
  onPickCompany: (id: string) => void;
  /** 리포트 아래 "기업 카드 모음에 담기" */
  onSaveReport: (widget: Extract<MessageWidget, { type: "report" }>) => void;
  /** 이 기업의 이 직무 카드가 이미 모음에 있는지 */
  isReportSaved: (companyId: string, role: ReportCardData["role"]) => boolean;
  onMatchupDone: (picks: string[]) => void;
  onMatchupSkip: () => void;
}

/** 맞대결 결과: 내 유형, 설명 한 줄, 중시한 지표 3개, 어울리는 기업 성격 (PRD 02) */
function PreferenceResult({ preference, sentence }: { preference: Preference; sentence: string }) {
  if (!preference.type) return null;
  return (
    <div className="cc" data-el="맞대결 결과">
      <div className="cc-head result">
        <span className="small muted">내 성향</span>
        <span className="result-type">{PREFERENCE_TYPE_LABELS[preference.type]}</span>
        <p>{sentence}</p>
        <p className="small muted">
          중시한 지표: {preference.topIndicators.map((id) => INDICATOR_LABELS[id]).join(", ")} · 어울리는 곳: {TYPE_INFO[preference.type].fits}
        </p>
      </div>
    </div>
  );
}

function Widget({ widget, active, h }: { widget: MessageWidget; active: boolean; h: WidgetHandlers }) {
  switch (widget.type) {
    case "candidates":
      return <CandidateChips candidates={widget.candidates} onPick={h.onPickCompany} disabled={!active} />;
    case "company":
      return <CompanyCard company={widget.company} graded={widget.graded} summary={widget.summary} />;
    case "matchup":
      return active ? (
        <MatchupGame onDone={h.onMatchupDone} onSkip={h.onMatchupSkip} />
      ) : (
        <p className="small muted">맞대결을 마쳤거나 넘어갔어요.</p>
      );
    case "preference":
      return <PreferenceResult preference={widget.preference} sentence={widget.sentence} />;
    case "report": {
      const saved = h.isReportSaved(widget.data.companyId, widget.data.role);
      // 리포트 카드와 카드 버튼을 한 구역으로 묶어, 아래 빠른 응답 버튼과 섞여 보이지 않게 한다 (11/22)
      return (
        <section className="report-block" data-el="리포트 구역">
          <ReportCard data={widget.data} />
          <div className="report-save">
            <button
              type="button"
              className="btn btn-quiet-primary"
              data-el="모음에 담기"
              disabled={saved || !widget.analysis || !widget.data.fitLabel}
              onClick={() => h.onSaveReport(widget)}
            >
              {saved ? "기업 카드 모음에 담았어요." : "기업 카드 모음에 담기"}
            </button>
            {!saved && <p className="report-save-note">누르지 않으면 기업 카드 모음에 저장되지 않아요.</p>}
          </div>
        </section>
      );
    }
  }
}

/** **굵게**를 b로 바꾼다 */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>,
  );
}

/**
 * 에이전트 말풍선용 아주 작은 마크다운: "- "로 시작하는 줄은 들여쓴 점 목록, "  - "는 한 단계 더 들여쓴 목록, 나머지 줄은 문단.
 * 예: "비교했어요.\n- 3년차 때 요구되는 역량: 4개" -> 문단 하나 + 점 목록 한 줄
 */
function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { depth: number; text: string }[] = [];
  const flush = () => {
    if (list.length === 0) return;
    const items = list;
    blocks.push(
      <ul key={blocks.length} className="md-ul">
        {items.map((it, i) => (
          <li key={i} className={it.depth > 0 ? "md-sub" : undefined}>
            {inline(it.text)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^(\s*)- (.*)$/);
    if (m) list.push({ depth: m[1].length >= 2 ? 1 : 0, text: m[2] });
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="md">{blocks}</div>;
}

/** 말풍선 목록. 에이전트 말풍선 아래에 위젯과 빠른 응답 버튼을 그린다. 버튼과 맞대결은 마지막 말풍선에서만 누를 수 있다 */
export function MessageList({
  messages,
  pending,
  onSelectReply,
  handlers,
}: {
  messages: ChatMessage[];
  pending: boolean;
  onSelectReply: (value: string) => void;
  handlers: WidgetHandlers;
}) {
  return (
    <ol className="chat" data-el="채팅 영역" style={{ listStyle: "none", margin: 0 }}>
      {messages.map((m, i) => {
        const active = i === messages.length - 1 && !pending;
        return (
          <li key={m.id} className={m.from === "user" ? "msg msg-user" : "msg"} data-msg-id={m.id}>
            <div
              className={m.from === "user" ? "bubble bubble-user" : "bubble"}
              data-el={m.from === "user" ? "사용자 말풍선" : "에이전트 말풍선"}
            >
              {m.from === "agent" ? <Markdown text={m.text} /> : <p>{m.text}</p>}
              {m.log && <InlineLog lines={m.log} />}
            </div>
            {m.widget && <Widget widget={m.widget} active={active} h={handlers} />}
            {m.replies && m.replies.length > 0 && (
              <QuickReplies replies={m.replies} onSelect={active ? onSelectReply : undefined} />
            )}
          </li>
        );
      })}
      {pending && (
        <li className="msg" data-el="응답 대기 표시">
          <div className="bubble">
            <span className="wait" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>{" "}
            <span className="small muted">에이전트가 확인하는 중이에요.</span>
          </div>
        </li>
      )}
    </ol>
  );
}
