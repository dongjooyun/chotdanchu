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
  | { type: "report"; data: ReportCardData }
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
  onSaveCompany: (company: Company, graded: GradedIndicator[]) => void;
  isSaved: (companyId: string) => boolean;
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
      return (
        <CompanyCard
          company={widget.company}
          graded={widget.graded}
          saved={h.isSaved(widget.company.id)}
          onSave={() => h.onSaveCompany(widget.company, widget.graded)}
        />
      );
    case "matchup":
      return active ? (
        <MatchupGame onDone={h.onMatchupDone} onSkip={h.onMatchupSkip} />
      ) : (
        <p className="small muted">맞대결을 마쳤거나 넘어갔어요.</p>
      );
    case "preference":
      return <PreferenceResult preference={widget.preference} sentence={widget.sentence} />;
    case "report":
      return <ReportCard data={widget.data} />;
  }
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
          <li key={m.id} className={m.from === "user" ? "msg msg-user" : "msg"}>
            <div
              className={m.from === "user" ? "bubble bubble-user" : "bubble"}
              data-el={m.from === "user" ? "사용자 말풍선" : "에이전트 말풍선"}
            >
              <p>{m.text}</p>
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
            <span className="small muted">에이전트가 확인하는 중이에요</span>
          </div>
        </li>
      )}
    </ol>
  );
}
