"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppNav, type AppView } from "@/components/app-nav";
import { Fab } from "@/components/fab";
import { AgentLogPanel } from "@/components/agent-log-panel";
import { AppDialog } from "@/components/app-dialog";
import { AppHeader } from "@/components/app-header";
import { CardCollection } from "@/components/card-collection";
import { ChatInput } from "@/components/chat-input";
import { Disclaimer } from "@/components/disclaimer";
import { MessageList, type ChatMessage, type MessageWidget, type WidgetHandlers } from "@/components/message-list";
import type { QuickReply } from "@/components/quick-replies";
import { TutorialTour } from "@/components/tutorial-tour";
import { useSession } from "@/components/use-session";
import { useStoredState } from "@/components/use-stored-state";
import type { AppMode, ChatRequest, ChatResponse, LogLine } from "@/lib/chat";
import { preferenceFromPicks } from "@/lib/matchup";
import { typeSentence } from "@/lib/preference-sentence";
import { computeCareerGap } from "@/lib/career-gap";
import { buildReportDraft, careerMessage, type ReportDraftInput } from "@/lib/report-draft";
import { personalizedCount, saveReport, skippedPreference } from "@/lib/session";
import {
  PREFERENCE_TYPE_LABELS,
  type AnalysisRecord,
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

/** 모음에 담을 기록 (기업 카드 내용과 판단 로그 포함) */
const recordOf = (a: Analysis) => ({
  companyId: a.company.id,
  name: a.company.name,
  analyzedAt: new Date().toISOString(),
  log: a.log,
  analysis: { company: a.company, graded: a.graded },
});

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

// 대화 내용 저장의 첫 값. useSyncExternalStore가 같은 값을 받도록 모듈 상수로 둔다
const NO_MESSAGES: ChatMessage[] = [];
const NO_LOG: LogLine[] = [];
/** 대화를 저장하는 칸 이름. 목업과 실데이터 대화가 섞이지 않게 모드를 붙인다 */
const chatKey = (mode: AppMode, name: string) => `chotdanchu:chat:v1:${mode}:${name}`;

/** 맞대결 아이콘 (겹친 카드 두 장) */
function CardsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="10" height="14" rx="1.5" transform="rotate(-8 8 13)" />
      <rect x="11" y="4" width="10" height="14" rx="1.5" transform="rotate(8 16 11)" />
    </svg>
  );
}

/** 대화 새로 시작 아이콘 (도는 화살표) */
function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

/** 단색 반짝임 아이콘 (AI 표시). 색은 글자색을 따른다 */
function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2c.6 4.9 2.6 7.4 8 8-5.4.6-7.4 3.1-8 8-.6-4.9-2.6-7.4-8-8 5.4-.6 7.4-3.1 8-8Z" />
      <path d="M19 15c.3 2.3 1.2 3.4 3.5 3.7-2.3.3-3.2 1.4-3.5 3.7-.3-2.3-1.2-3.4-3.5-3.7 2.3-.3 3.2-1.4 3.5-3.7Z" />
    </svg>
  );
}

/** 채팅 화면 전체: 헤더, 고정 정보줄, 말풍선과 위젯, 입력창, 에이전트 사고 과정 패널, 면책 문구, 기업 카드 모음 */
export function ChatApp({ mode, examples }: { mode: AppMode; examples: string[] }) {
  const EXAMPLE_REPLIES = exampleReplies(examples);
  const [session, setSession] = useSession();
  // 대화 내용(말풍선, 사고 과정, 지금 보는 회사)은 브라우저에 저장해서 새로고침, 뒤로 가기, 창을 닫았다 열어도 남긴다 (11/22)
  const [messages, setMessages] = useStoredState(chatKey(mode, "messages"), NO_MESSAGES);
  // 대화가 시작된 순간의 직무. 이후 직무를 바꿔도 첫 인사 문구는 그대로 둔다. "unset"은 아직 대화 전
  const [introRaw, setIntroRaw] = useStoredState<Role | null | "unset">(chatKey(mode, "intro"), "unset");
  const introRole = introRaw === "unset" ? undefined : introRaw;
  const [log, setLog] = useStoredState(chatKey(mode, "log"), NO_LOG);
  /** 지금 보고 있는 회사 이름. 고정 정보줄에 보인다 */
  const [company, setCompany] = useStoredState<string | null>(chatKey(mode, "company"), null);
  /** 가장 최근에 분석한 기업의 카드 내용. 리포트 카드를 만들 때 쓴다 */
  const [current, setCurrent] = useStoredState<Analysis | null>(chatKey(mode, "current"), null);
  /** 화면 메뉴: 챗봇(기본), 기업 카드 모음, 튜토리얼 */
  // 처음 접속하면 튜토리얼부터 보여 주고(11/22), 튜토리얼을 한 번 벗어난 뒤에는 챗봇부터 연다.
  // 서버가 그릴 때는 알 수 없어 챗봇으로 그리고, 화면이 뜬 뒤 처음 온 사람만 튜토리얼로 바뀐다 (재방문자는 깜빡임 없음)
  const [tutorialSeen, setTutorialSeen] = useStoredState<boolean | null>("chotdanchu:tutorial-seen", null);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [picked, setPicked] = useState<AppView | null>(null);
  const view: AppView = picked ?? (hydrated && tutorialSeen !== true ? "tutorial" : "chat");
  /** "대화 새로 시작" 확인 창 */
  const [resetAsk, setResetAsk] = useState(false);
  /** 맞대결을 한 번이라도 끝까지 했는지 (건너뛴 뒤에도 "다시 하기"로 보이게) */
  const [matchupDone, setMatchupDone] = useStoredState("chotdanchu:matchup-done", false);
  /** 모바일에서 사고 과정을 여는 창 */
  const [thinkModal, setThinkModal] = useState(false);
  /** 맞대결 중 통합 버튼 메뉴 */
  const [dockMenu, setDockMenu] = useState(false);
  const dockPointer = useRef<string>("");
  const dockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 마우스를 올리면 메뉴가 열리고, 벗어나면 0.25초 뒤 닫힌다 (버튼에서 메뉴로 옮겨 가는 동안 닫히지 않게) */
  const openDock = () => {
    if (dockTimer.current) clearTimeout(dockTimer.current);
    setDockMenu(true);
  };
  const closeDockSoon = () => {
    if (dockTimer.current) clearTimeout(dockTimer.current);
    dockTimer.current = setTimeout(() => setDockMenu(false), 250);
  };
  const [pending, setPending] = useState(false);
  const [think, setThink] = useState(false);
  /** 맞대결을 다시 해 성향이 바뀌었을 때 저장 카드를 어떻게 할지 묻는 창 */
  const [retype, setRetype] = useState<{ from: Preference; to: Preference; count: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const intro = introMessage(introRole === undefined ? session.role : introRole, EXAMPLE_REPLIES);
  const shown = [intro, ...messages];
  // 맞대결이 진행 중이면(마지막 말풍선이 맞대결) 모바일 둥근 버튼을 숨겨 카드 오른쪽 등급 배지와 "건너뛰고 기본 기준으로"를 가리지 않게 한다 (11/22)
  const matchupOpen = messages.at(-1)?.widget?.type === "matchup";

  // 새 말풍선이 생기면(보냈거나 받았거나) 그 묶음의 첫 말풍선이 화면 위쪽에 오게 스크롤한다 (11/22).
  // 처음 화면이 뜰 때(저장된 대화를 불러올 때)는 움직이지 않는다
  const seenCount = useRef<number | null>(null);
  useEffect(() => {
    const prev = seenCount.current;
    seenCount.current = messages.length;
    if (prev === null || messages.length <= prev) return;
    const first = messages[prev];
    if (!first) return;
    requestAnimationFrame(() => {
      document.querySelector(`[data-msg-id="${first.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [messages]);

  // 모바일 둥근 버튼은 입력창 바로 위에 띄운다. 입력창이 어디에 있든(바닥에 붙었든, 아직 아래에 있든) 보내기 버튼을 가리지 않게
  // 입력창의 실제 위쪽 위치를 재서 그 12px 위로 맞춘다 (스크롤, 크기가 바뀔 때마다)
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".inputbar");
    if (!el) return;
    let raf = 0;
    const set = () => {
      raf = 0;
      const nav = 60 + 12; // 하단 탭 높이 + 여백
      const above = window.innerHeight - el.getBoundingClientRect().top + 12;
      const bottom = Math.max(nav, above);
      document.documentElement.style.setProperty("--fab-bottom", `${bottom}px`);
      // 통합 버튼 자리(보내기 버튼 아래)까지 세 버튼이 내려가야 하는 거리
      document.documentElement.style.setProperty("--dock-dy", `${Math.max(0, bottom - 66)}px`);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(set);
    };
    set();
    const ro = new ResizeObserver(queue);
    ro.observe(el);
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [view, messages.length]);

  // 통합 버튼 메뉴는 바깥을 누르거나 Esc로 닫고, 맞대결이 끝나면 닫는다
  useEffect(() => {
    if (!dockMenu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest(".fab-dock")) setDockMenu(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [dockMenu]);

  // 메뉴를 오가도 챗봇 화면의 스크롤 위치를 기억한다
  const chatScroll = useRef(0);
  function changeView(v: AppView) {
    if (view === "chat") chatScroll.current = window.scrollY;
    if (view === "tutorial" && v !== "tutorial") setTutorialSeen(true);
    setPicked(v);
    requestAnimationFrame(() => window.scrollTo({ top: v === "chat" ? chatScroll.current : 0 }));
  }

  /** 헤더(로고, 이름, 소개)를 누르면 홈인 챗봇 화면으로. 이미 챗봇이면 맨 위로 올린다 */
  function goHome() {
    if (view === "chat") window.scrollTo({ top: 0, behavior: "smooth" });
    else changeView("chat");
  }

  function push(...items: Omit<ChatMessage, "id">[]) {
    if (introRole === undefined) setIntroRaw(session.role);
    setMessages((prev) => {
      const base = prev.reduce((max, m) => Math.max(max, m.id), 0) + 1;
      return [...prev, ...items.map((m, i) => ({ ...m, id: base + i }))];
    });
  }

  function appendLog(lines: LogLine[]) {
    setLog((prev) => [...prev, ...lines.map((l, i) => ({ ...l, step: prev.length + i + 1 }))]);
  }

  /**
   * 리포트 카드를 만든다. 모음에는 사용자가 "기업 카드 모음에 담기"를 눌러야 담긴다 (11/22).
   * 다만 이미 모음에 있는 같은 기업, 같은 직무 카드는 새 판정으로 바로 바꿔 둔다 (맞춤 판정 받기, 성향 변경 다시 판정)
   */
  function withReport(s: SessionState, a: Analysis, role: Role, preference: Preference | null) {
    const data = buildReportDraft({ ...a, role, preference, mode, checkedAt: new Date().toISOString().slice(0, 10) });
    const personalized = isPersonalized(preference);
    const alreadySaved = Boolean(s.analyzed.find((r) => r.companyId === a.company.id)?.reports?.[role]);
    const next = alreadySaved ? saveReport(s, recordOf(a), role, data, personalized) : s;
    const widget: MessageWidget = { type: "report", data, personalized, analysis: { company: a.company, graded: a.graded }, log: a.log };
    return { next, widget };
  }

  /**
   * 3년차 공고 비교 말풍선과 판단 로그. 공고 찾기와 역량 분류는 코드가 하고(같은 입력이면 같은 결과),
   * 유사 기업 대체는 사람이 미리 확인해 정한 시드라 AI 판단이 아닌 정보 줄로 남긴다.
   */
  function careerStep(role: Role | null, a: Analysis): Omit<ChatMessage, "id"> {
    if (!role) return { from: "agent", text: "직무를 고르면 3년차 공고와 비교해 드려요." };
    const gap = computeCareerGap(a.company.id, role, mode);
    const lines: LogLine[] = [
      {
        step: 0,
        type: "tool_call",
        title: gap
          ? `compare_career_posting: ${role} 3년차 공고와 역량 비교 (신입 때 쌓을 수 있음 ${gap.counts.connected}, 따로 채움 ${gap.counts.missing})`
          : `compare_career_posting: ${role} 3년차 공고 없음`,
        reason: "공고 문장의 역량 표현을 역량 사전과 맞춰 코드가 분류",
        mode,
      },
    ];
    if (gap?.posting.substitute)
      lines.push({ step: 0, type: "info", title: `유사 기업 공고로 대체: ${gap.posting.postedBy} ${gap.posting.title}`, reason: gap.posting.substitute.reason, mode });
    if (gap && gap.unmatched.length > 0)
      lines.push({ step: 0, type: "info", title: `사전에 없는 표현 ${gap.unmatched.length}개를 사전 보강 후보로 모음`, reason: gap.unmatched.join(", "), mode });
    appendLog(lines);
    return { from: "agent", text: careerMessage(gap, role), log: lines };
  }

  /** 기업 카드 다음 단계: 3년차 공고 안내, 그다음 맞대결 권유 또는 바로 리포트 */
  function afterCompanyCard(role: Role | null, a: Analysis) {
    const career = careerStep(role, a);
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
    push({ from: "user", text: "이 회사로 할게요." });
    void ask({ pickCompanyId: id });
  }

  /** 리포트 아래 "기업 카드 모음에 담기": 그 리포트(기업, 직무, 판정)를 모음에 담는다. 맞대결 전이면 "기본 기준" 카드 */
  function onSaveReport(w: Extract<MessageWidget, { type: "report" }>) {
    if (!w.analysis) return;
    const a: Analysis = { ...w.analysis, log: w.log ?? [] };
    setSession(saveReport(session, recordOf(a), w.data.role, w.data, Boolean(w.personalized)));
  }

  const isReportSaved = (companyId: string, role: Role) =>
    Boolean(session.analyzed.find((r) => r.companyId === companyId)?.reports?.[role]);

  function startMatchup(userText: string) {
    push(
      { from: "user", text: userText },
      { from: "agent", text: "더 끌리는 카드를 눌러 주세요. 회사 이름은 가려져 있고, 실존 기업이 아닌 가상 카드예요.", widget: { type: "matchup" } },
    );
  }

  /** 7판이 끝나면: 선호 계산(코드) -> 유형 설명 문장 -> 결과 -> 리포트. 성향이 바뀌었고 맞춤 카드가 있으면 다시 판정할지 묻는다 */
  async function onMatchupDone(picks: string[]) {
    const pref = preferenceFromPicks(picks);
    setMatchupDone(true);
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
    push({ from: "user", text: `${r.name}, ${role} 직무로 볼게요.` });
    void ask({ pickCompanyId: r.companyId });
  }

  function onSelectReply(value: string) {
    if (value.startsWith("role:")) {
      const role = value.slice(5) as Role;
      setSession({ ...session, role });
      // 첫 인사에서 골라도 다른 선택과 똑같이 내 말풍선(직무)과 회사 질문을 이어 붙인다. 첫 인사는 그대로 남는다 (11/22)
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
        text: "기본 기준으로 판정한 최종 판단 리포트예요.",
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

  const matchupLabel = matchupDone || isPersonalized(session.preference) ? "기업 맞대결 다시 하기" : "기업 맞대결 하기";
  const handlers: WidgetHandlers = { onPickCompany, onSaveReport, isReportSaved, onMatchupDone, onMatchupSkip };

  /** 대화 새로 시작: 말풍선과 사고 과정만 지운다. 고른 직무, 성향, 기업 카드 모음은 남는다 */
  function resetChat() {
    setMessages(NO_MESSAGES);
    setLog(NO_LOG);
    setCompany(null);
    setCurrent(null);
    setIntroRaw("unset");
    setResetAsk(false);
  }

  return (
    <>
      <AppHeader mode={mode} onHome={goHome} />
      <AppNav view={view} onChange={changeView} count={session.analyzed.length} />
      {view === "tutorial" && <TutorialTour examples={examples} onFinish={() => changeView("chat")} />}
      {/* 메뉴를 바꿔도 대화와 맞대결 진행이 사라지지 않게 챗봇 화면은 숨기기만 한다 */}
      <div className="app" data-think={think ? "open" : "closed"} data-docked={matchupOpen ? "true" : "false"} hidden={view !== "chat"}>
        {/* 고정 정보줄: 지금 무엇을 기준으로 보고 있는지 항상 보이고, 여기서 바로 바꾼다 */}
        <div className="infobar" data-el="고정 정보줄">
          <div className="infobar-main">
            <b className="infobar-title">현재 분석 중인 직무 및 기업</b>
            <div className="infobar-row">
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
            </div>
          </div>
          {/* PC: 오른쪽 두 줄(맞대결·새로 시작 / 사고 과정)로 왼쪽 두 줄과 높이를 맞춘다. 모바일은 오른쪽 아래 둥근 버튼 */}
          <div className="infobar-side only-pc">
            <span className="infobar-actions">
              {session.role && (
                <button type="button" className="btn btn-link small" onClick={() => startMatchup(matchupLabel)} disabled={pending} data-el="맞대결 버튼">
                  {matchupLabel}
                </button>
              )}
              {messages.length > 0 && (
                <button type="button" className="btn btn-quiet small" onClick={() => setResetAsk(true)} disabled={pending}>
                  대화 새로 시작하기
                </button>
              )}
            </span>
            <button
              type="button"
              className="btn btn-ai think-toggle"
              aria-expanded={think}
              aria-controls="think-panel"
              data-el="사고 과정 버튼"
              onClick={() => setThink(!think)}
            >
              <SparkleIcon />
              {think ? "에이전트 사고 과정 닫기" : `에이전트 사고 과정 보기 (${log.length}단계)`}
            </button>
          </div>
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
          {think && (
            <div className="only-pc">
              <AgentLogPanel lines={log} onClose={() => setThink(false)} />
            </div>
          )}
        </div>
        <Disclaimer />
      </div>
      {/* 모바일: 사고 과정과 대화 새로 시작은 오른쪽 아래 둥근 아이콘 버튼. 사고 과정은 창으로 연다 */}
      {view === "chat" && (
        <div className="fab-stack only-mobile" data-docked={matchupOpen ? "true" : "false"}>
          {messages.length > 0 && (
            <Fab tone="quiet" label="대화 새로 시작하기" onClick={() => setResetAsk(true)} disabled={pending}>
              <RefreshIcon />
            </Fab>
          )}
          {session.role && (
            <Fab tone="lilac" label={matchupLabel} onClick={() => startMatchup(matchupLabel)} disabled={pending}>
              <CardsIcon />
            </Fab>
          )}
          <Fab tone="ai" label="에이전트 사고 과정 보기" onClick={() => setThinkModal(true)}>
            <SparkleIcon />
          </Fab>
        </div>
      )}
      {/* 맞대결 중에는 세 버튼이 입력창 보내기 버튼 아래 작은 통합 버튼 하나로 모인다. 누르면 두 가지 메뉴(대화 새로 시작, 사고 과정)가 열린다 (11/22) */}
      {view === "chat" && (
        <div
          className="fab-dock only-mobile"
          data-docked={matchupOpen ? "true" : "false"}
          onPointerEnter={(e) => e.pointerType === "mouse" && openDock()}
          onPointerLeave={(e) => e.pointerType === "mouse" && closeDockSoon()}
        >
          {dockMenu && matchupOpen && (
            <div className="dock-menu" role="menu">
              {messages.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setDockMenu(false);
                    setResetAsk(true);
                  }}
                >
                  <RefreshIcon />
                  대화 새로 시작하기
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setDockMenu(false);
                  setThinkModal(true);
                }}
              >
                <SparkleIcon />
                에이전트 사고 과정 보기
              </button>
            </div>
          )}
          <button
            type="button"
            className="dock-btn"
            aria-label="빠른 메뉴"
            aria-haspopup="menu"
            aria-expanded={dockMenu && matchupOpen}
            tabIndex={matchupOpen ? 0 : -1}
            onPointerDown={(e) => (dockPointer.current = e.pointerType)}
            // 마우스는 올리면 열리므로 클릭으로 닫지 않는다. 터치와 키보드는 누를 때마다 열고 닫는다
            onClick={() => {
              if (dockPointer.current === "mouse") return;
              setDockMenu((v) => !v);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="6" cy="6" r="2.2" />
              <circle cx="18" cy="6" r="2.2" />
              <circle cx="6" cy="18" r="2.2" />
              <circle cx="18" cy="18" r="2.2" />
            </svg>
          </button>
        </div>
      )}
      <AppDialog open={thinkModal} title="에이전트 사고 과정" onClose={() => setThinkModal(false)}>
        <AgentLogPanel lines={log} bare />
      </AppDialog>
      {view === "collection" && (
        <CardCollection
          records={session.analyzed}
          onPersonalize={(r) => {
            changeView("chat");
            onPersonalize(r);
          }}
          onRequestRole={(r, role) => {
            changeView("chat");
            onRequestRole(r, role);
          }}
          busy={pending}
        />
      )}
      <AppDialog open={resetAsk} title="대화를 새로 시작할까요?" choice onClose={() => setResetAsk(false)}>
        <p className="dlg-text">지금까지의 말풍선과 에이전트 사고 과정이 지워져요. 고른 직무, 내 성향, 기업 카드 모음은 그대로 남아요.</p>
        <div className="dlg-actions">
          <button type="button" className="btn btn-primary" onClick={resetChat}>
            새로 시작
          </button>
          <button type="button" className="btn" onClick={() => setResetAsk(false)}>
            취소
          </button>
        </div>
      </AppDialog>
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
