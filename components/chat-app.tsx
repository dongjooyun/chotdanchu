"use client";

import { useEffect, useRef, useState } from "react";
import { AgentLogPanel } from "@/components/agent-log-panel";
import { ChatInput } from "@/components/chat-input";
import { LofiBox } from "@/components/lofi-box";
import { MessageList, type ChatMessage } from "@/components/message-list";
import type { QuickReply } from "@/components/quick-replies";
import { useSession } from "@/components/use-session";
import type { AppMode, ChatRequest, ChatResponse, LogLine } from "@/lib/chat";
import { addAnalysis, skippedPreference } from "@/lib/session";
import type { Role } from "@/lib/types";

const ROLE_REPLIES: QuickReply[] = [
  { label: "서비스기획", value: "role:서비스기획" },
  { label: "마케팅", value: "role:마케팅" },
  { label: "운영", value: "role:운영" },
];

const BRANCH_REPLIES: QuickReply[] = [
  { label: "맞대결 먼저", value: "branch:matchup" },
  { label: "바로 기업 분석", value: "branch:analyze" },
];

const GREETING: ChatMessage = {
  id: 0,
  from: "agent",
  text: "안녕하세요. 첫단추는 직무와 기업명만으로 그 회사가 첫 커리어 발판으로 맞는지 함께 살펴보는 에이전트입니다. 먼저 관심 있는 직무를 골라 주세요.",
  replies: ROLE_REPLIES,
};

/** 채팅 화면 전체: 말풍선, 위젯, 빠른 응답, 입력창, 판단 로그 패널 */
export function ChatApp({ mode }: { mode: AppMode }) {
  const [session, setSession] = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function push(...items: Omit<ChatMessage, "id">[]) {
    const withIds = items.map((m) => ({ ...m, id: nextId.current++ }));
    setMessages((prev) => [...prev, ...withIds]);
  }

  function appendLog(lines: LogLine[]) {
    setLog((prev) => [...prev, ...lines.map((l, i) => ({ ...l, step: prev.length + i + 1 }))]);
  }

  async function ask(body: ChatRequest) {
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, session }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ChatResponse;
      push({ from: "agent", text: data.reply, widget: data.widget });
      appendLog(data.log);
      if (data.widget?.type === "company") {
        const company = data.widget.company;
        push({ from: "agent", text: "판단 리포트가 들어갈 자리입니다. 리포트는 리포트 태스크에서 채웁니다.", widget: { type: "report" } });
        setSession(
          addAnalysis(session, {
            companyId: company.id,
            name: company.name,
            analyzedAt: new Date().toISOString(),
            label: null,
            log: data.log,
          }),
        );
      }
    } catch {
      push({ from: "agent", text: "응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setPending(false);
    }
  }

  function onSelectReply(value: string) {
    if (value.startsWith("role:")) {
      const role = value.slice(5) as Role;
      setSession({ ...session, role });
      push(
        { from: "user", text: role },
        {
          from: "agent",
          text: "맞대결을 하면 내 기준에 맞춘 판단을 드려요. 맞대결을 먼저 할까요, 바로 기업을 분석할까요?",
          replies: BRANCH_REPLIES,
        },
      );
      return;
    }
    if (value === "branch:matchup") {
      push(
        { from: "user", text: "맞대결 먼저" },
        {
          from: "agent",
          text: "카드 두 장 중 더 끌리는 쪽을 골라 주세요. 지금은 화면 자리만 있고, 8강 진행과 선호 계산은 맞대결 태스크에서 붙습니다.",
          widget: { type: "matchup" },
          replies: [{ label: "바로 기업 분석", value: "branch:analyze" }],
        },
      );
      return;
    }
    if (value === "branch:analyze") {
      if (!session.preference) setSession({ ...session, preference: skippedPreference() });
      push(
        { from: "user", text: "바로 기업 분석" },
        {
          from: "agent",
          text: "분석할 기업 이름을 입력해 주세요. 목업 예시: 별하늘랩스, 몽돌커머스(동명 2곳), 청솔기계(동명 2곳)",
        },
      );
    }
  }

  function onSend(text: string) {
    push({ from: "user", text });
    void ask({ message: text });
  }

  function onPickCompany(id: string) {
    push({ from: "user", text: "이 회사로 할게요" });
    void ask({ pickCompanyId: id });
  }

  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start">
      <div className="flex min-w-0 flex-col gap-3">
        <LofiBox label="채팅 영역">
          <p className="mb-2 text-[11px] text-muted">
            [세션 상태] 직무: {session.role ?? "아직 안 고름"} · 맞대결:{" "}
            {session.preference ? (session.preference.skipped ? "건너뜀" : "완료") : "아직"} · 최근 분석{" "}
            {session.analyzed.length}건
          </p>
          <MessageList messages={messages} pending={pending} onSelectReply={onSelectReply} onPickCompany={onPickCompany} />
          <div ref={bottomRef} />
        </LofiBox>
        <ChatInput onSend={onSend} disabled={pending} />
      </div>
      <div className="md:sticky md:top-3">
        <AgentLogPanel lines={log} />
        {mode === "live" && (
          <p className="mt-2 text-xs text-muted">실데이터 모드는 에이전트 루프 연결 후 동작합니다.</p>
        )}
      </div>
    </div>
  );
}
