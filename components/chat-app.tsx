"use client";

import { useEffect, useRef, useState } from "react";
import { AgentLogPanel } from "@/components/agent-log-panel";
import { AppDialog } from "@/components/app-dialog";
import { AppHeader } from "@/components/app-header";
import { CardCollection } from "@/components/card-collection";
import { ChatInput } from "@/components/chat-input";
import { Disclaimer } from "@/components/disclaimer";
import { MessageList, type ChatMessage, type MessageWidget, type WidgetHandlers } from "@/components/message-list";
import type { QuickReply } from "@/components/quick-replies";
import { useSession } from "@/components/use-session";
import type { AppMode, ChatRequest, ChatResponse, LogLine } from "@/lib/chat";
import { preferenceFromPicks } from "@/lib/matchup";
import { typeSentence } from "@/lib/preference-sentence";
import { buildReportDraft, type ReportDraftInput } from "@/lib/report-draft";
import { personalizedCount, saveReport, skippedPreference } from "@/lib/session";
import {
  PREFERENCE_TYPE_LABELS,
  type AnalysisRecord,
  type Company,
  type GradedIndicator,
  type Preference,
  type Role,
  type SessionState,
} from "@/lib/types";

/** 방금 본 기업의 카드 내용 (리포트 카드의 재료) */
type Analysis = Pick<ReportDraftInput, "company" | "graded" | "log">;

const ROLE_REPLIES: QuickReply[] = [
  { label: "서비스기획", value: "role:서비스기획" },
  { label: "마케팅", value: "role:마케팅" },
  { label: "운영", value: "role:운영" },
];

/** 예시 기업 버튼. 목업 모드는 가상 기업, 실데이터 모드는 미리 계산해 둔 시연 기업 (서버가 이름을 넘겨 준다) */
function exampleReplies(names: string[]): QuickReply[] {
  return names.map((n) => ({ label: n, value: `company:${n}` }));
}

/** 입력창 아래 한 줄: 기업 정보를 어디서 가져오는지 */
function sourceNote(mode: AppMode, names: string[]): string {
  if (mode === "mock") return "목업 모드: 가상 기업 데이터로 보여 드려요. 실제 회사가 아닙니다.";
  return `OpenDART 공시, 국민연금 가입 사업장, 국세청 사업자 상태로 미리 확인해 둔 회사만 볼 수 있어요: ${names.join(", ")}`;
}

/** 맞대결 권유. 원하는 행동(맞대결)만 연보라로 강조한다 */
const PREF_REPLIES: QuickReply[] = [
  { label: "기업 맞대결로 내 성향 맞춤 판정 받기", value: "pref:matchup", main: true },
  { label: "건너뛰고 기본 기준으로", value: "pref:skip" },
];

/** 리포트가 끝난 뒤 마지막 말풍선에만 붙는 다음 행동. 매 말풍선마다 붙이면 시선이 흩어진다 */
function nextReplies(personalized: boolean): QuickReply[] {
  return [
    { label: "다른 회사 보기", value: "next:company" },
    { label: "직무 변경하기", value: "next:role" },
    personalized
      ? { label: "기업 맞대결 다시 하기", value: "pref:matchup" }
      : { label: "기업 맞대결로 내 성향 맞춤 판정 받기", value: "pref:matchup", main: true },
  ];
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
function introMessage(role: Role | null, examples: QuickReply[]): ChatMessage {
  if (!role) return { id: 0, from: "agent", text: `${GREETING} 먼저 어떤 직무로 준비하세요?`, replies: ROLE_REPLIES };
  return { id: 0, from: "agent", text: `${GREETING} ${askCompany(role)}`, replies: examples };
}

const isPersonalized = (p: Preference | null): p is Preference => Boolean(p && !p.skipped && p.type);

/** 유형 설명 문장. 서버가 LLM 문장(USE_AGENT=true일 때)이나 규칙 문장을 준다. 실패하면 규칙 문장 */
async function fetchSentence(pref: Preference): Promise<{ sentence: string; by: "llm" | "rule" }> {
  try {
    const res = await fetch("/api/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: pref.type, topIndicators: pref.topIndicators }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as { sentence: string; by: "llm" | "rule" };
  } catch {
    return { sentence: typeSentence(pref), by: "rule" };
  }
}

/** 채팅 화면 전체: 헤더, 고정 정보줄, 말풍선과 위젯, 입력창, 에이전트 사고 과정 패널, 면책 문구, 기업 카드 모음 */
export function ChatApp({ mode, examples }: { mode: AppMode; examples: string[] }) {
  const EXAMPLE_REPLIES = exampleReplies(examples);
  const [session, setSession] = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 대화가 시작된 순간의 직무. 이후 직무를 바꿔도 첫 인사 문구는 그대로 둔다
  const [introRole, setIntroRole] = useState<Role | null | undefined>(undefined);
  const [log, setLog] = useState<LogLine[]>([]);
  /** 지금 보고 있는 회사 이름. 고정 정보줄에 보인다 */
  const [company, setCompany] = useState<string | null>(null);
  /** 가장 최근에 분석한 기업의 카드 내용. 리포트 카드를 만들 때 쓴다 */
  const [current, setCurrent] = useState<Analysis | null>(null);
  const [pending, setPending] = useState(false);
  const [think, setThink] = useState(false);
  /** 맞대결을 다시 해 성향이 바뀌었을 때 저장 카드를 어떻게 할지 묻는 창 */
  const [retype, setRetype] = useState<{ from: Preference; to: Preference; count: number } | null>(null);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  const intro = introMessage(introRole === undefined ? session.role : introRole, EXAMPLE_REPLIES);
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

  /** 리포트 카드를 만들고 기업 카드 모음에도 담는다 (같은 기업은 한 장, 직무별로 저장) */
  function withReport(s: SessionState, a: Analysis, role: Role, preference: Preference | null) {
    const data = buildReportDraft({ ...a, role, preference, checkedAt: new Date().toISOString().slice(0, 10) });
    const next = saveReport(
      s,
      { companyId: a.company.id, name: a.company.name, analyzedAt: new Date().toISOString(), log: a.log, analysis: { company: a.company, graded: a.graded } },
      role,
      data,
      isPersonalized(preference),
    );
    const widget: MessageWidget = { type: "report", data };
    return { next, widget };
  }

  /** 기업 카드 다음 단계: 3년차 공고 안내, 그다음 맞대결 권유 또는 바로 리포트 */
  function afterCompanyCard(role: Role | null, a: Analysis) {
    const career: Omit<ChatMessage, "id"> = {
      from: "agent",
      text: `${role ?? "선택한"} 직무의 3년차 공고 비교는 준비 중이라 이번 카드에는 "공고 비교 준비 중"으로 보여 드려요.`,
    };
    // 이미 맞대결을 했거나 건너뛴 사용자는 다시 묻지 않고 그 기준으로 바로 판정한다. 건너뛴 사용자에게는 리포트 뒤에 맞대결 버튼을 다시 준다
    if (session.preference && role) {
      const personal = isPersonalized(session.preference);
      const { next, widget } = withReport(session, a, role, session.preference);
      setSession(next);
      push(career, {
        from: "agent",
        text: personal ? "저장해 둔 내 성향으로 판정한 최종 판단 리포트예요." : "기본 기준으로 판정한 최종 판단 리포트예요.",
        widget,
        replies: nextReplies(personal),
      });
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
        const analysis: Analysis = { company: data.widget.company, graded: data.widget.graded, log: data.log };
        setCurrent(analysis);
        setCompany(analysis.company.name);
        afterCompanyCard(session.role, analysis);
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

  /** "기업 카드 저장하기": 지금 성향 기준으로 이 직무의 카드를 모음에 담는다. 맞대결 전이면 "기본 기준" 카드 */
  function onSaveCompany(c: Company, graded: GradedIndicator[]) {
    if (!session.role) return;
    const a = current?.company.id === c.id ? current : { company: c, graded, log: [] };
    setSession(withReport(session, a, session.role, session.preference).next);
  }

  const isSaved = (companyId: string) =>
    Boolean(session.role && session.analyzed.find((r) => r.companyId === companyId)?.reports?.[session.role]);

  function startMatchup(userText: string) {
    push(
      { from: "user", text: userText },
      { from: "agent", text: "더 끌리는 카드를 눌러 주세요. 회사 이름은 가려져 있고, 실존 기업이 아닌 가상 카드예요.", widget: { type: "matchup" } },
    );
  }

  /** 7판이 끝나면: 선호 계산(코드) -> 유형 설명 문장 -> 결과 -> 리포트. 성향이 바뀌었고 맞춤 카드가 있으면 다시 판정할지 묻는다 */
  async function onMatchupDone(picks: string[]) {
    const pref = preferenceFromPicks(picks);
    setPending(true);
    const { sentence, by } = await fetchSentence(pref);
    setPending(false);
    appendLog([
      { step: 0, type: "tool_call", title: "compute_preference: 맞대결 7판을 Bradley-Terry로 계산", reason: "같은 선택이면 항상 같은 결과", mode },
      { step: 0, type: by === "llm" ? "decision" : "info", title: by === "llm" ? "유형 설명 문장을 AI가 작성" : "유형 설명 문장은 규칙 문장", reason: by === "llm" ? "중시 지표 순서만 근거로 씀, 숫자 없음" : undefined, mode },
    ]);
    const before = session.preference;
    let next: SessionState = { ...session, preference: pref };
    const items: Omit<ChatMessage, "id">[] = [
      { from: "agent", text: `내 성향은 ${PREFERENCE_TYPE_LABELS[pref.type!]}이에요.`, widget: { type: "preference", preference: pref, sentence } },
    ];
    if (current && session.role) {
      const r = withReport(next, current, session.role, pref);
      next = r.next;
      items.push({ from: "agent", text: "내 성향으로 판정한 최종 판단 리포트예요.", widget: r.widget, replies: nextReplies(true) });
    } else {
      items.push({ from: "agent", text: "성향을 저장했어요. 이제 회사를 고르면 이 성향으로 판정해 드려요.", replies: EXAMPLE_REPLIES });
    }
    setSession(next);
    push(...items);
    if (isPersonalized(before) && before.type !== pref.type && personalizedCount(session) > 0)
      setRetype({ from: before, to: pref, count: personalizedCount(session) });
  }

  function onMatchupSkip() {
    onSelectReply("pref:skip");
  }

  /** 성향이 바뀐 뒤 "새 성향으로 다시 판정": 맞춤 판정을 받은 직무 카드만 새 성향으로 다시 만든다 */
  function rejudgeAll(to: Preference) {
    let s = session;
    for (const r of session.analyzed) {
      if (!r.analysis) continue;
      for (const [role, saved] of Object.entries(r.reports ?? {})) {
        if (!saved?.personalized) continue;
        s = withReport(s, { ...r.analysis, log: r.log as LogLine[] }, role as Role, to).next;
      }
    }
    setSession({ ...s, preference: to });
  }

  function closeRetype(rejudge: boolean) {
    if (rejudge && retype) rejudgeAll(retype.to);
    setRetype(null);
  }

  /** 모음의 "맞춤 판정 받기": 그 카드의 기업과 직무로 맞대결을 시작한다 */
  function onPersonalize(r: AnalysisRecord) {
    if (!r.analysis) return;
    const role = r.lastRole ?? session.role;
    if (role && role !== session.role) setSession({ ...session, role });
    setCurrent({ ...r.analysis, log: r.log as LogLine[] });
    setCompany(r.name);
    startMatchup(`${r.name} 맞춤 판정 받기`);
  }

  /** 카드 창의 "이 직무로 판정 받기": 직무를 바꾸고 같은 기업을 다시 분석한다 */
  function onRequestRole(r: AnalysisRecord, role: Role) {
    setSession({ ...session, role });
    push({ from: "user", text: `${r.name}, ${role} 직무로 볼게요` });
    void ask({ pickCompanyId: r.companyId });
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
      startMatchup("기업 맞대결로 내 성향 맞춤 판정 받기");
      return;
    }
    if (value === "pref:skip") {
      const preference = skippedPreference();
      push({ from: "user", text: "건너뛰고 기본 기준으로" });
      if (!current || !session.role) {
        setSession({ ...session, preference });
        return;
      }
      const { next, widget } = withReport({ ...session, preference }, current, session.role, preference);
      setSession(next);
      push({
        from: "agent",
        text: "모든 지표를 같은 비중으로 보고 판정했어요. 최종 판단 리포트예요.",
        widget,
        replies: nextReplies(false),
      });
      return;
    }
    if (value === "next:company") {
      onChangeCompany();
      return;
    }
    if (value === "next:role") onChangeRole();
  }

  /** 직무 변경하기: 직무 버튼을 다시 보여준다. 이미 저장한 카드는 그대로 남는다 */
  function onChangeRole() {
    push({ from: "agent", text: "어떤 직무로 바꿀까요?", replies: ROLE_REPLIES });
  }

  /** 회사 변경하기: 같은 직무로 새 회사를 묻는다 */
  function onChangeCompany() {
    if (!session.role) return;
    push({ from: "agent", text: askCompany(session.role), replies: EXAMPLE_REPLIES });
  }

  const handlers: WidgetHandlers = { onPickCompany, onSaveCompany, isSaved, onMatchupDone, onMatchupSkip };

  return (
    <>
      <div className="app" data-think={think ? "open" : "closed"}>
        <AppHeader mode={mode} />
        {/* 고정 정보줄: 지금 무엇을 기준으로 보고 있는지 항상 보이고, 여기서 바로 바꾼다 */}
        <div className="infobar" data-el="고정 정보줄">
          <span>
            <span className="muted">직무</span> <b>{session.role ?? "미정"}</b>{" "}
            {session.role && (
              <button type="button" className="btn btn-link small" aria-label="직무 변경하기" onClick={onChangeRole} disabled={pending}>
                변경하기
              </button>
            )}
          </span>
          <span>
            <span className="muted">회사</span> <b>{company ?? "미정"}</b>{" "}
            {company && (
              <button type="button" className="btn btn-link small" aria-label="회사 변경하기" onClick={onChangeCompany} disabled={pending}>
                변경하기
              </button>
            )}
          </span>
          <button
            type="button"
            className="btn btn-link small think-toggle"
            aria-expanded={think}
            aria-controls="think-panel"
            onClick={() => setThink(!think)}
          >
            {think ? "에이전트 사고 과정 닫기" : `에이전트 사고 과정 보기 (${log.length}단계)`}
          </button>
        </div>
        <div className="cols">
          <div className="chat-col">
            <MessageList messages={shown} pending={pending} onSelectReply={onSelectReply} handlers={handlers} />
            <div ref={bottomRef} />
            <div className="inputbar">
              <ChatInput
                onSend={onSend}
                disabled={pending || !session.role}
                placeholder={session.role ? "회사 이름을 입력해 주세요" : "먼저 위에서 직무를 골라 주세요"}
              />
              <p className="tiny muted" style={{ marginTop: 6 }}>
                {sourceNote(mode, examples)}
              </p>
            </div>
          </div>
          {think && <AgentLogPanel lines={log} onClose={() => setThink(false)} />}
        </div>
        <Disclaimer />
      </div>
      <CardCollection records={session.analyzed} onPersonalize={onPersonalize} onRequestRole={onRequestRole} busy={pending} />
      <AppDialog open={retype !== null} title="내 성향이 달라졌어요" choice onClose={() => closeRetype(false)}>
        {retype && (
          <div data-el="성향 변경 확인">
            <p className="dlg-text">
              이번 맞대결에서는 &quot;{PREFERENCE_TYPE_LABELS[retype.to.type!]}&quot;으로 나왔어요(이전: {PREFERENCE_TYPE_LABELS[retype.from.type!]}). 저장한 카드
              중 맞춤 판정을 받은 {retype.count}장도 새 성향으로 다시 판정할까요?
            </p>
            <div className="dlg-actions">
              <button type="button" className="btn btn-primary" onClick={() => closeRetype(true)}>
                새 성향으로 다시 판정
              </button>
              <button type="button" className="btn" onClick={() => closeRetype(false)}>
                기존 카드는 그대로 두기
              </button>
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              그대로 두면 기존 카드에는 이전 성향이 계속 표시돼요.
            </p>
          </div>
        )}
      </AppDialog>
    </>
  );
}
