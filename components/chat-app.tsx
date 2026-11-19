"use client";

import { useEffect, useRef, useState } from "react";
import { AgentLogPanel } from "@/components/agent-log-panel";
import { CardCollection } from "@/components/card-collection";
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

/** 목업 모드 예시 기업. 실데이터 모드에서는 시연 기업 4곳으로 바꾼다 (CDC-15) */
const EXAMPLE_REPLIES: QuickReply[] = [
  { label: "별하늘랩스", value: "company:별하늘랩스" },
  { label: "몽돌커머스", value: "company:몽돌커머스" },
  { label: "청솔기계", value: "company:청솔기계" },
];

const PREF_REPLIES: QuickReply[] = [
  { label: "내 기준 맞추기", value: "pref:matchup" },
  { label: "건너뛰고 기본 기준으로", value: "pref:skip" },
];

/** 리포트가 끝난 뒤 마지막 말풍선에만 붙는 다음 행동. 매 말풍선마다 붙이면 시선이 흩어진다 */
const NEXT_REPLIES: QuickReply[] = [
  { label: "다른 회사 보기", value: "next:company" },
  { label: "직무 바꾸기", value: "next:role" },
];

function ChipButton({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-line px-2 text-xs hover:bg-tag disabled:opacity-60"
    >
      {label}
    </button>
  );
}

const GREETING =
  "안녕하세요. 첫단추는 첫 회사가 3년 뒤 어디로 이어지는지, 공공데이터와 3년차 공고로 판단해 드리는 에이전트예요.";

function askCompany(role: Role): string {
  return `${role} 직무로 볼게요. 어느 회사가 궁금하세요?`;
}

/**
 * 첫 인사 말풍선. 직무를 아직 안 골랐으면 직무 버튼을, 골랐으면 회사 질문과 예시 기업 버튼을 붙인다.
 * 두 번째 방문부터는 저장된 직무로 바로 회사를 묻는다 (PRD 01).
 */
function introMessage(role: Role | null): ChatMessage {
  if (!role) return { id: 0, from: "agent", text: `${GREETING} 먼저 어떤 직무로 준비하세요?`, replies: ROLE_REPLIES };
  return { id: 0, from: "agent", text: `${GREETING} ${askCompany(role)}`, replies: EXAMPLE_REPLIES };
}

/** 채팅 화면 전체: 말풍선과 진행 기록, 위젯, 빠른 응답, 직무 표시와 입력창, 판단 로그 패널, 내 카드 모음 */
export function ChatApp({ mode }: { mode: AppMode }) {
  const [session, setSession] = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 대화가 시작된 순간의 직무. 이후 직무를 바꿔도 첫 인사 문구는 그대로 둔다
  const [introRole, setIntroRole] = useState<Role | null | undefined>(undefined);
  const [log, setLog] = useState<LogLine[]>([]);
  /** 지금 보고 있는 회사 이름. 고정 정보줄에 보인다 */
  const [company, setCompany] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  const intro = introMessage(introRole === undefined ? session.role : introRole);
  const shown = [intro, ...messages];

  useEffect(() => {
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function push(...items: Omit<ChatMessage, "id">[]) {
    if (introRole === undefined) setIntroRole(session.role);
    const withIds = items.map((m) => ({ ...m, id: nextId.current++ }));
    setMessages((prev) => [...prev, ...withIds]);
  }

  function appendLog(lines: LogLine[]) {
    setLog((prev) => [...prev, ...lines.map((l, i) => ({ ...l, step: prev.length + i + 1 }))]);
  }

  /** 기업 카드 다음 단계: 3년차 공고 비교 자리, 그다음 맞대결 권유 또는 바로 리포트 */
  function afterCompanyCard(role: Role | null) {
    const career: Omit<ChatMessage, "id"> = {
      from: "agent",
      text: `[3년차 공고와 역량 갭 자리] ${role ?? "선택한"} 직무의 3년차 공고와 비교합니다. 공고 태스크(CDC-7, CDC-15)에서 채웁니다.`,
    };
    if (session.preference) {
      push(career, { from: "agent", text: "판단 리포트 카드예요.", widget: { type: "report" }, replies: NEXT_REPLIES });
      return;
    }
    push(career, {
      from: "agent",
      text: "내 기준에 맞춰 최종 판정할까요? 회사명을 가린 카드 7판, 1분이면 돼요.",
      replies: PREF_REPLIES,
    });
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
      push({ from: "agent", text: data.reply, widget: data.widget, log: data.log });
      appendLog(data.log);
      if (data.widget?.type === "company") {
        const company = data.widget.company;
        setCompany(company.name);
        setSession(
          addAnalysis(session, {
            companyId: company.id,
            name: company.name,
            analyzedAt: new Date().toISOString(),
            label: null,
            log: data.log,
          }),
        );
        afterCompanyCard(session.role);
      }
    } catch {
      push({ from: "agent", text: "응답을 받지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setPending(false);
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

  function onSelectReply(value: string) {
    if (value.startsWith("role:")) {
      const role = value.slice(5) as Role;
      setSession({ ...session, role });
      // 첫 인사에서 고른 경우: 첫 인사가 회사 질문으로 바뀌므로 말풍선을 더하지 않는다
      if (messages.length === 0) return;
      push({ from: "user", text: role }, { from: "agent", text: askCompany(role), replies: EXAMPLE_REPLIES });
      return;
    }
    if (value.startsWith("company:")) {
      onSend(value.slice(8));
      return;
    }
    if (value === "pref:matchup") {
      push(
        { from: "user", text: "내 기준 맞추기" },
        {
          from: "agent",
          text: "더 끌리는 카드를 눌러 주세요. 회사 이름은 가려져 있어요. 8강 진행과 선호 계산은 맞대결 태스크(CDC-23)에서 붙어요.",
          widget: { type: "matchup" },
          replies: [{ label: "건너뛰고 기본 기준으로", value: "pref:skip" }],
        },
      );
      return;
    }
    if (value === "pref:skip") {
      setSession({ ...session, preference: skippedPreference() });
      push(
        { from: "user", text: "건너뛰고 기본 기준으로" },
        {
          from: "agent",
          text: "모든 지표를 같은 비중으로 보고 판정했어요. 판단 리포트 카드예요.",
          widget: { type: "report" },
          replies: NEXT_REPLIES,
        },
      );
      return;
    }
    if (value === "next:company") {
      onChangeCompany();
      return;
    }
    if (value === "next:role") onChangeRole();
  }

  /** 직무 바꾸기: 직무 버튼을 다시 보여준다. 이미 분석한 카드는 그대로 남는다 */
  function onChangeRole() {
    push({ from: "agent", text: "어떤 직무로 바꿀까요?", replies: ROLE_REPLIES });
  }

  /** 다른 회사 보기: 같은 직무로 새 회사를 묻는다 */
  function onChangeCompany() {
    if (!session.role) return;
    push({ from: "agent", text: askCompany(session.role), replies: EXAMPLE_REPLIES });
  }

  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start">
      <LofiBox label="채팅 영역" className="flex min-w-0 flex-col gap-3">
        {/* 고정 정보줄: 지금 무엇을 기준으로 보고 있는지 항상 보이고, 여기서 바로 바꾼다 */}
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-box px-1 py-2 text-sm">
          <span className="text-[10px] text-muted">[고정 정보줄]</span>
          <span className="flex items-center gap-1">
            <span className="text-muted">직무</span>
            <strong>{session.role ?? "아직 안 고름"}</strong>
            {session.role && <ChipButton onClick={onChangeRole} disabled={pending} label="바꾸기" />}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-muted">회사</span>
            <strong>{company ?? "아직 없음"}</strong>
            {company && <ChipButton onClick={onChangeCompany} disabled={pending} label="다른 회사" />}
          </span>
        </div>
        <MessageList messages={shown} pending={pending} onSelectReply={onSelectReply} onPickCompany={onPickCompany} />
        <div ref={bottomRef} />
        <div className="sticky bottom-0 -mx-1 bg-box px-1 pb-1">
          <ChatInput
            onSend={onSend}
            disabled={pending || !session.role}
            placeholder={session.role ? "회사 이름을 입력해 주세요" : "먼저 위에서 직무를 골라 주세요"}
          />
        </div>
      </LofiBox>
      <div className="flex flex-col gap-3 md:sticky md:top-3">
        <AgentLogPanel lines={log} />
        <CardCollection records={session.analyzed} />
        {mode === "live" && (
          <p className="text-xs text-muted">실데이터 모드는 에이전트 루프 연결 후 동작합니다.</p>
        )}
      </div>
    </div>
  );
}
