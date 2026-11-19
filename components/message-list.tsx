"use client";

import { CandidateChips } from "@/components/candidate-chips";
import { CompanyCard } from "@/components/company-card";
import { MatchupPair } from "@/components/matchup-card";
import { QuickReplies, type QuickReply } from "@/components/quick-replies";
import { ReportCard } from "@/components/report-card";
import type { ChatWidget } from "@/lib/chat";
import { SAMPLE_MATCHUP_PAIR } from "@/lib/samples";

export type MessageWidget = ChatWidget | { type: "matchup" } | { type: "report" };

export interface ChatMessage {
  id: number;
  from: "agent" | "user";
  text: string;
  widget?: MessageWidget;
  replies?: QuickReply[];
}

function Widget({
  widget,
  active,
  onPickCompany,
}: {
  widget: MessageWidget;
  active: boolean;
  onPickCompany: (id: string) => void;
}) {
  switch (widget.type) {
    case "candidates":
      return <CandidateChips candidates={widget.candidates} onPick={onPickCompany} disabled={!active} />;
    case "company":
      return <CompanyCard company={widget.company} />;
    case "matchup":
      return <MatchupPair cards={SAMPLE_MATCHUP_PAIR} disabled />;
    case "report":
      return <ReportCard />;
  }
}

/** 말풍선 목록. 에이전트 말풍선 안에 위젯과 빠른 응답 버튼을 그린다. 버튼은 마지막 말풍선에서만 누를 수 있다 */
export function MessageList({
  messages,
  pending,
  onSelectReply,
  onPickCompany,
}: {
  messages: ChatMessage[];
  pending: boolean;
  onSelectReply: (value: string) => void;
  onPickCompany: (id: string) => void;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m, i) => {
        const last = i === messages.length - 1;
        const active = last && !pending;
        return (
          <li key={m.id} className={m.from === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`flex max-w-full flex-col gap-2 ${m.from === "user" ? "items-end" : "w-full"}`}>
              <div
                className={`rounded-lg border border-line px-3 py-2 text-sm ${m.from === "user" ? "bg-tag" : "bg-box"}`}
              >
                <span className="mb-0.5 block text-[10px] text-muted">
                  [{m.from === "user" ? "사용자 말풍선" : "에이전트 말풍선"}]
                </span>
                {m.text}
              </div>
              {m.widget && <Widget widget={m.widget} active={active} onPickCompany={onPickCompany} />}
              {m.replies && m.replies.length > 0 && (
                <QuickReplies replies={m.replies} onSelect={active ? onSelectReply : undefined} />
              )}
            </div>
          </li>
        );
      })}
      {pending && <li className="text-xs text-muted">[응답 대기 표시] 에이전트가 확인하는 중입니다</li>}
    </ol>
  );
}
