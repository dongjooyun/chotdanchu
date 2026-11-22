"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import script from "@/data/tutorial/script.json";
import { AgentLogPanel } from "@/components/agent-log-panel";
import { LogBadge } from "@/components/log-badge";
import { CardsIcon, CompanyIcon, InfoIcon, RefreshIcon, RoleIcon, SparkleIcon } from "@/components/menu-icons";
import { MobileMenu } from "@/components/mobile-menu";
import { MessageList, type ChatMessage, type MessageWidget, type WidgetHandlers } from "@/components/message-list";
import type { QuickReply } from "@/components/quick-replies";
import { computeCareerGap } from "@/lib/career-gap";
import type { ChatResponse, LogLine } from "@/lib/chat";
import { currentPair, preferenceFromPicks } from "@/lib/matchup";
import { typeSentence } from "@/lib/preference-sentence";
import { buildReportDraft, careerMessage } from "@/lib/report-draft";
import { skippedPreference } from "@/lib/session";
import { PREFERENCE_TYPE_LABELS, type Preference, type Role } from "@/lib/types";

/**
 * 튜토리얼 (CDC-32, 11/22). 가상 기업 "몽돌커머스"로 첫단추 흐름 전체를 따라가 본다.
 * - 실제 AI와 API를 부르지 않는다. 기업 후보와 기업 카드는 미리 만든 정적 대본(data/tutorial/script.json, 테스트 TUT-*)이고,
 *   AI가 일하는 모습은 판단 로그 줄이 하나씩 올라오는 연출로만 보여 준다. 3년차 비교, 밸런스 게임, 리포트는 실제 코드로 계산한다.
 * - 실제 세션(대화, 직무, 성향, 기업 카드 모음)은 건드리지 않는다. 튜토리얼을 닫으면 처음으로 돌아간다.
 * - 단계마다 말풍선(툴팁)이 지금 볼 곳을 가리키고, "다음"을 누르면 사용자가 할 행동을 대신 해 준다.
 */

const CANDIDATES = script.candidates as unknown as ChatResponse;
const PICKED = script.picked as unknown as ChatResponse;
const COMPANY = PICKED.widget?.type === "company" ? PICKED.widget : null;

const ROLE_REPLIES: QuickReply[] = [
  { label: "서비스기획", value: "role:서비스기획" },
  { label: "마케팅", value: "role:마케팅" },
  { label: "운영", value: "role:운영" },
];
const PREF_REPLIES: QuickReply[] = [
  { label: "기업 밸런스 게임 시작하기", value: "pref:matchup", main: true },
  { label: "건너뛰기(일반 기준 적용)", value: "pref:skip" },
];
const TYPED = "몽돌커머스 분석해줘";
/** 말풍선 첫 스타일. 위치는 화면에 그린 뒤 place()가 DOM에 바로 넣는다 (같은 객체라 React가 덮어쓰지 않는다) */
const TIP_START = { visibility: "hidden", top: 0, left: 0 } as const;
const INTRO: ChatMessage = {
  id: 1,
  from: "agent",
  text: "안녕하세요. 첫단추는 첫 회사가 3년 뒤 어디로 이어지는지, 공공데이터와 3년차 공고로 판단해 드리는 에이전트예요. 먼저 어떤 직무로 준비하세요?",
  replies: ROLE_REPLIES,
};

type StepId = "role" | "input" | "candidates" | "company" | "career" | "pref" | "matchup" | "report" | "think" | "menu" | "done";

const STEPS: { id: StepId; title: string; body: string }[] = [
  { id: "role", title: "직무 고르기", body: "직무에 따라 비교하는 3년차 공고가 달라져요. 직무 버튼을 눌러 보세요. 다음을 누르면 서비스기획으로 진행해요." },
  { id: "input", title: "회사 이름 말하기", body: "궁금한 회사 이름을 입력창에 적어 보내요. 여기서는 가상 기업 몽돌커머스로 해 볼게요. 보내기나 다음을 눌러 보세요." },
  {
    id: "candidates",
    title: "AI 에이전트의 판단",
    body: "이름이 같은 법인이 2곳이라 에이전트가 어느 회사인지 되물어요. 노란 \"AI 판단\" 표시가 AI가 스스로 정한 부분이에요. 후보 하나를 골라 보세요.",
  },
  {
    id: "company",
    title: "기업 카드",
    body: "10가지 지표를 공시와 공공데이터로 계산해 A, B, C로 보여 줘요. 근거가 없으면 \"확인 불가\"로 남겨요. 하는 일 세 줄 요약은 AI가 공시 원문을 읽고 숫자 없이 써요.",
  },
  {
    id: "career",
    title: "3년차 공고와 비교",
    body: "같은 직무 3년차 공고가 요구하는 역량을 신입 때 쌓을 수 있는 역량과 따로 채워야 하는 역량으로 코드가 나눠요.",
  },
  { id: "pref", title: "내 기준 정하기", body: "회사명을 가린 카드 7판으로 내가 중요하게 보는 지표를 찾아요. 밸런스 게임 버튼을 눌러 보세요." },
  { id: "matchup", title: "기업 밸런스 게임", body: "두 카드 중 더 끌리는 쪽을 눌러요. 7판을 다 하거나, 다음을 누르면 자동으로 끝까지 골라요." },
  {
    id: "report",
    title: "최종 판단 리포트",
    body: "지표, 내 성향, 역량 갭을 엮어 판정 라벨을 줘요. 카드를 누르면 근거가 보이고, 이미지로 저장하거나 QR로 공유할 수 있어요. 기업 카드 모음에 담으면 나중에 다시 볼 수 있어요.",
  },
  {
    id: "think",
    title: "에이전트 사고 과정",
    body: "에이전트가 어떤 도구를 왜 불렀는지, 어디가 AI 판단이고 어디가 코드 계산인지 단계별로 남아요. 챗봇 화면에서는 노란 버튼으로 열어요.",
  },
  { id: "done", title: "준비 끝", body: "" },
];

/** 모바일에서만 보이는 단계: 입력창 오른쪽 메뉴 버튼 (11/22). PC에는 이 버튼이 없고 정보줄의 버튼들이 같은 일을 한다 */
const MENU_STEP: { id: StepId; title: string; body: string } = {
  id: "menu",
  title: "오른쪽 아래 메뉴 버튼",
  body: "입력창 오른쪽의 보라색 둥근 버튼이에요. 누르면 위로 메뉴가 펼쳐져요: 직무 변경하기, 회사 변경하기, 기업 밸런스 게임 하기, 대화 새로 시작하기, 에이전트 사고 과정 보기, 출처와 유의사항. 맨 위 한 줄에는 지금 보는 직무와 회사가 나와요.",
};

const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia("(max-width: 820px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, reduceMotion() ? Math.min(ms, 80) : ms));
const today = () => new Date().toISOString().slice(0, 10);

export function TutorialTour({ examples, onFinish }: { examples: string[]; onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>("서비스기획");
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [ticker, setTicker] = useState<LogLine[] | null>(null);
  const [typed, setTyped] = useState("");
  const [saved, setSaved] = useState(false);
  const [preference, setPreference] = useState<Preference | null>(null);
  const run = useRef(0);
  const ids = useRef<Record<string, number>>({ intro: INTRO.id });
  const nextId = useRef(INTRO.id + 1);
  const busy = ticker !== null;
  const mobile = useSyncExternalStore(subscribeNarrow, () => window.matchMedia("(max-width: 820px)").matches, () => false);
  const steps = mobile ? [...STEPS.slice(0, -1), MENU_STEP, STEPS[STEPS.length - 1]] : STEPS;
  const current = steps[Math.min(step, steps.length - 1)];

  const push = useCallback((items: Omit<ChatMessage, "id">[], tag?: string) => {
    const withIds = items.map((m) => ({ ...m, id: nextId.current++ }));
    if (tag) ids.current[tag] = withIds[0].id;
    setMessages((prev) => [...prev, ...withIds]);
    return withIds;
  }, []);
  const addLog = (lines: LogLine[]) => setLog((prev) => [...prev, ...lines.map((l, i) => ({ ...l, step: prev.length + i + 1 }))]);

  /** 처음으로: 인사 말풍선과 직무 버튼만 남긴다. 진행 중인 AI 연출은 멈춘다 */
  function reset() {
    run.current += 1;
    ids.current = { intro: INTRO.id };
    nextId.current = INTRO.id + 1;
    setMessages([INTRO]);
    setLog([]);
    setTicker(null);
    setTyped("");
    setSaved(false);
    setPreference(null);
    setRole("서비스기획");
    setStep(0);
  }

  // 튜토리얼을 닫으면 진행 중인 AI 연출을 멈춘다
  useEffect(() => {
    const r = run;
    return () => {
      r.current += 1;
    };
  }, []);

  /** AI 호출 연출: 판단 로그 줄이 하나씩 올라온 뒤 결과가 나온다. 중간에 처음으로 돌아가면 멈춘다 */
  async function fakeCall(lines: LogLine[]): Promise<boolean> {
    const id = run.current;
    setTicker([]);
    for (const l of lines) {
      await sleep(520);
      if (run.current !== id) return false;
      setTicker((prev) => [...(prev ?? []), l]);
    }
    await sleep(450);
    if (run.current !== id) return false;
    setTicker(null);
    return true;
  }

  function chooseRole(r: Role) {
    setRole(r);
    push([
      { from: "user", text: r },
      { from: "agent", text: `${r} 직무로 볼게요. 어느 회사가 궁금하세요?`, replies: [{ label: "몽돌커머스", value: "company:몽돌커머스" }] },
    ]);
    setStep(1);
  }

  async function sendCompany() {
    const id = run.current;
    for (let i = 1; i <= TYPED.length; i++) {
      setTyped(TYPED.slice(0, i));
      await sleep(45);
      if (run.current !== id) return;
    }
    await sleep(200);
    setTyped("");
    push([{ from: "user", text: TYPED }]);
    if (!(await fakeCall(CANDIDATES.log))) return;
    addLog(CANDIDATES.log);
    push([{ from: "agent", text: CANDIDATES.reply, widget: CANDIDATES.widget, log: CANDIDATES.log }], "candidates");
    setStep(2);
  }

  async function pickCompany() {
    push([{ from: "user", text: "이 회사로 할게요." }]);
    if (!(await fakeCall(PICKED.log))) return;
    addLog(PICKED.log);
    push([{ from: "agent", text: PICKED.reply, widget: PICKED.widget, log: PICKED.log }], "company");
    setStep(3);
  }

  function showCareer() {
    if (!COMPANY) return;
    const gap = computeCareerGap(COMPANY.company.id, role, "mock");
    const lines: LogLine[] = [
      {
        step: 0,
        type: "tool_call",
        title: gap
          ? `compare_career_posting: ${role} 3년차 공고와 역량 비교 (신입 때 쌓을 수 있음 ${gap.counts.connected}, 따로 채움 ${gap.counts.missing})`
          : `compare_career_posting: ${role} 3년차 공고 없음`,
        reason: "공고 문장의 역량 표현을 역량 사전과 맞춰 코드가 분류",
        mode: "mock",
      },
    ];
    addLog(lines);
    push([{ from: "agent", text: careerMessage(gap, role), log: lines }], "career");
    setStep(4);
  }

  function askPreference() {
    push([{ from: "agent", text: "내 성향 맞춤 판단을 원하시나요? 회사명을 가린 카드 7판, 1분이면 돼요.", replies: PREF_REPLIES }], "pref");
    setStep(5);
  }

  function startMatchup() {
    push([
      { from: "user", text: "기업 밸런스 게임 시작하기" },
      { from: "agent", text: "더 끌리는 카드를 눌러 주세요. 회사 이름은 가려져 있고, 실존 기업이 아닌 가상 카드예요.", widget: { type: "matchup" } },
    ], "matchup");
    setStep(6);
  }

  /** 밸런스 게임 결과(코드 계산)와 리포트. 성향 설명 문장은 실제 서비스에서 AI가 쓰는 자리라 연출을 한 번 보여 준다 */
  async function finishMatchup(pref: Preference, skipped: boolean) {
    if (!COMPANY) return;
    setPreference(pref);
    const lines: LogLine[] = skipped
      ? []
      : [
          { step: 0, type: "tool_call", title: "compute_preference: 밸런스 게임 7판을 Bradley-Terry로 계산", reason: "같은 선택이면 항상 같은 결과", mode: "mock" },
          { step: 0, type: "decision", title: "유형 설명 문장을 AI가 작성", reason: "중시 지표 순서만 근거로 씀, 숫자 없음", mode: "mock" },
        ];
    if (lines.length && !(await fakeCall(lines))) return;
    addLog(lines);
    const data = buildReportDraft({ company: COMPANY.company, graded: COMPANY.graded, log: PICKED.log, role, preference: pref, mode: "mock", checkedAt: today() });
    const report: MessageWidget = { type: "report", data, personalized: !skipped, analysis: { company: COMPANY.company, graded: COMPANY.graded }, log: PICKED.log };
    const items: Omit<ChatMessage, "id">[] = skipped
      ? [{ from: "user", text: "건너뛰기(일반 기준 적용)" }, { from: "agent", text: "기본 기준으로 판정한 최종 판단 리포트예요.", widget: report }]
      : [
          { from: "agent", text: `내 성향은 ${PREFERENCE_TYPE_LABELS[pref.type!]}이에요.`, widget: { type: "preference", preference: pref, sentence: typeSentence(pref) } },
          { from: "agent", text: "내 성향으로 판정한 최종 판단 리포트예요.", widget: report },
        ];
    const out = push(items);
    ids.current.report = out[out.length - 1].id;
    setStep(7);
  }

  /** 밸런스 게임을 대신 끝까지 고른다 (매 판 왼쪽 카드) */
  function autoPicks(): string[] {
    const picks: string[] = [];
    for (let pair = currentPair(picks); pair; pair = currentPair(picks)) picks.push(pair[0].id);
    return picks;
  }

  /** "다음": 그 단계에서 사용자가 할 행동을 대신 한다 */
  function next() {
    if (busy) return;
    switch (current.id) {
      case "role":
        return chooseRole("서비스기획");
      case "input":
        return void sendCompany();
      case "candidates":
        return void pickCompany();
      case "company":
        return showCareer();
      case "career":
        return askPreference();
      case "pref":
        return startMatchup();
      case "matchup":
        return void finishMatchup(preferenceFromPicks(autoPicks()), false);
      case "report":
        return setStep(8);
      case "think":
        return setStep(9); // 모바일은 메뉴 단계, PC는 마지막 화면
      case "menu":
        return setStep(10);
    }
  }

  function onSelectReply(value: string) {
    if (busy) return;
    if (value.startsWith("role:") && current.id === "role") chooseRole(value.slice(5) as Role);
    else if (value.startsWith("company:") && current.id === "input") void sendCompany();
    else if (value === "pref:matchup" && current.id === "pref") startMatchup();
    else if (value === "pref:skip" && current.id === "pref") void finishMatchup(skippedPreference(), true);
  }

  const handlers: WidgetHandlers = {
    onPickCompany: () => {
      if (!busy && current.id === "candidates") void pickCompany();
    },
    onSaveReport: () => setSaved(true),
    isReportSaved: () => saved,
    onMatchupDone: (picks) => void finishMatchup(preferenceFromPicks(picks), false),
    onMatchupSkip: () => void finishMatchup(skippedPreference(), true),
  };

  // 말풍선(툴팁)이 가리킬 화면 요소
  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  function targetOf(id: StepId): HTMLElement | null {
    const root = rootRef.current;
    if (!root) return null;
    const msg = (tag: string) => root.querySelector<HTMLElement>(`[data-msg-id="${ids.current[tag]}"]`);
    switch (id) {
      case "role":
        return msg("intro")?.querySelector<HTMLElement>('[data-el="빠른 응답 버튼"]') ?? null;
      case "input":
        return root.querySelector<HTMLElement>('[data-tut="input"]');
      case "candidates":
        return msg("candidates")?.querySelector<HTMLElement>('[data-el="동명 기업 후보 칩"]') ?? null;
      case "company":
        return msg("company")?.querySelector<HTMLElement>('[data-el="기업 카드"]') ?? null;
      case "career":
        return msg("career")?.querySelector<HTMLElement>(".bubble") ?? null;
      case "pref":
        return msg("pref")?.querySelector<HTMLElement>('[data-el="빠른 응답 버튼"]') ?? null;
      case "matchup":
        return root.querySelector<HTMLElement>('[data-el="밸런스 게임"]');
      case "report":
        return msg("report")?.querySelector<HTMLElement>('[data-el="리포트 구역"]') ?? null;
      case "think":
        return root.querySelector<HTMLElement>('[data-tut="think"]');
      case "menu":
        return root.querySelector<HTMLElement>(".mmenu-btn");
      default:
        return null;
    }
  }

  /** 마지막으로 스크롤해 준 단계 (같은 단계에서 다시 스크롤하지 않게) */
  const scrolledFor = useRef("");

  /**
   * 말풍선을 가리키는 요소 바로 아래에 두고(위에 두면 앞 말풍선을 가린다. 아래 여백은 CSS가 확보), 대상에 보라 테두리를 그린다.
   * 위치는 상태가 아니라 DOM 스타일로 바로 넣는다(다시 그리기를 줄이려고). 단계가 바뀐 뒤 처음 한 번은 대상과 말풍선이 함께 보이게 스크롤한다
   */
  const place = useCallback(() => {
    const root = rootRef.current;
    const tip = tipRef.current;
    root?.querySelectorAll(".tut-focus").forEach((el) => el.classList.remove("tut-focus"));
    if (!root) return;
    const target = busy ? null : targetOf(current.id);
    if (!tip) return;
    if (!target) {
      tip.style.visibility = "hidden";
      return;
    }
    target.classList.add("tut-focus");
    const r = root.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    tip.style.top = `${t.bottom - r.top + 12}px`;
    tip.style.left = `${Math.max(8, Math.min(t.left - r.left, r.width - tip.offsetWidth - 8))}px`;
    tip.style.visibility = "visible";
  }, [current.id, busy]);

  /**
   * 대상과 말풍선이 함께 보이게 스크롤한다 (키가 큰 카드는 아랫부분과 말풍선). 목표 위치를 절대값으로 계산해서
   * 두 번 불러도(그리는 도중 한 번, 다 그린 뒤 한 번) 같은 곳으로 간다. force가 아니면 단계마다 한 번만
   */
  const scrollToStep = useCallback(
    (force = false) => {
      const root = rootRef.current;
      const tip = tipRef.current;
      if (!root || busy) return;
      const behavior: ScrollBehavior = reduceMotion() ? "auto" : "smooth";
      const key = `${current.id}:${messages.length}`;
      if (!force && scrolledFor.current === key) return;
      if (current.id === "done") {
        scrolledFor.current = key;
        root.querySelector<HTMLElement>('[data-tut="done"]')?.scrollIntoView({ behavior, block: "center" });
        return;
      }
      const target = targetOf(current.id);
      if (!target || !tip || tip.style.visibility !== "visible") return;
      scrolledFor.current = key;
      const t = target.getBoundingClientRect();
      const tipBottom = tip.getBoundingClientRect().bottom;
      const margin = 24;
      // 모바일은 위 머리글(56px)과 아래 하단 탭(60px)이 가리므로 그만큼 뺀 높이를 쓴다
      const mobile = window.innerWidth < 768;
      const offsetTop = mobile ? 56 : 0;
      const view = window.innerHeight - (mobile ? 72 : 0) - offsetTop;
      // 대상 윗부분부터 말풍선 아래까지가 한 화면에 들어가면 그 범위를 가운데로, 아니면 말풍선이 보이는 영역 아래쪽에 오게
      const span = tipBottom - t.top;
      const y = span + margin * 2 < view ? t.top - offsetTop - (view - span) / 2 : tipBottom - (offsetTop + view) + margin;
      window.scrollTo({ top: Math.max(0, window.scrollY + y), behavior });
    },
    [current.id, busy, messages.length],
  );

  useLayoutEffect(() => {
    place();
  }, [place, messages.length]);

  useEffect(() => {
    // 밸런스 게임, 리포트처럼 그린 직후 크기가 바뀌는 부품이 있어 조금 뒤에 재고, 다 그려진 뒤 한 번 더 같은 계산으로 맞춘다
    const first = setTimeout(() => {
      place();
      scrollToStep();
    }, 120);
    const second = setTimeout(() => {
      place();
      scrollToStep(true);
    }, 700);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [place, scrollToStep]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => place());
    ro.observe(root);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [place]);

  // 진행 중에도 AI 연출이 보이게 아래로 따라간다
  useEffect(() => {
    if (ticker && ticker.length > 0) rootRef.current?.querySelector('[data-tut="ticker"]')?.scrollIntoView({ block: "nearest" });
  }, [ticker]);

  const showThink = current.id === "think" || current.id === "menu" || current.id === "done";
  const n = Math.min(step + 1, steps.length - 1);
  const isLast = steps[step + 1]?.id === "done";

  return (
    <section className="coll tutorial" data-el="튜토리얼">
      <div className="coll-h">
        <div>
          <b>튜토리얼</b>
          <p className="tiny muted" style={{ marginTop: 2 }}>
            가상 기업으로 따라 해 보는 예시예요. 실제 AI를 부르지 않고, 내 대화와 기업 카드 모음에는 저장되지 않아요.
          </p>
        </div>
        <span className="tools">
          <button type="button" className="btn btn-quiet small" onClick={reset}>
            처음부터
          </button>
          <button type="button" className="btn btn-link small" onClick={onFinish}>
            건너뛰고 챗봇으로
          </button>
        </span>
      </div>
      <div className="tut-stage" ref={rootRef}>
        <div className="chat-col">
          <MessageList messages={messages} pending={false} onSelectReply={onSelectReply} handlers={handlers} />
          {ticker && (
            <div className="msg tut-ticker-msg" data-tut="ticker" data-el="AI 호출 연출">
              <div className="bubble tut-ticker">
                <p className="small">
                  <span className="wait" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>{" "}
                  <span className="muted">에이전트가 확인하는 중이에요.</span>
                </p>
                <ol className="tut-lines" aria-live="polite">
                  {ticker.map((l, i) => (
                    <li key={i}>
                      <LogBadge type={l.type} /> <span>{l.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          {current.id !== "done" && current.id !== "think" && (
            <div className="tut-input" data-tut="input">
              <form
                data-el="입력창"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (current.id === "input" && !busy) void sendCompany();
                }}
              >
                <input
                  className="field"
                  value={typed}
                  readOnly
                  placeholder={current.id === "input" ? "보내기를 누르면 몽돌커머스를 입력해요" : "튜토리얼에서는 버튼으로 진행해요"}
                  aria-label="튜토리얼 입력창"
                />
                <button type="submit" className="btn btn-ink send-btn" disabled={current.id !== "input" || busy}>
                  <span className="send-label">보내기</span>
                  <svg className="send-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 19V5" />
                    <path d="M5 12l7-7 7 7" />
                  </svg>
                </button>
                {/* 모바일 전용: 실제 챗봇 화면과 같은 메뉴 버튼. 메뉴 단계에서는 펼쳐 둔다 */}
                <MobileMenu
                  forceOpen={current.id === "menu"}
                  status="서비스기획 · 몽돌커머스"
                  items={[
                    { key: "role", label: "직무 변경하기", icon: <RoleIcon />, onSelect: () => {} },
                    { key: "company", label: "회사 변경하기", icon: <CompanyIcon />, onSelect: () => {} },
                    { key: "matchup", label: "기업 밸런스 게임 하기", icon: <CardsIcon />, onSelect: () => {} },
                    { key: "reset", label: "대화 새로 시작하기", icon: <RefreshIcon />, onSelect: () => {} },
                    { key: "think", label: "에이전트 사고 과정 보기", icon: <SparkleIcon />, onSelect: () => {} },
                    { key: "notice", label: "출처와 유의사항", icon: <InfoIcon />, onSelect: () => {} },
                  ]}
                />
              </form>
            </div>
          )}
          {showThink && (
            <div className="tut-think" data-tut="think">
              <AgentLogPanel lines={log} bare />
            </div>
          )}
          {current.id === "done" && (
            <div className="tut-done" data-tut="done" data-el="튜토리얼 끝">
              <b>이제 실제 회사로 해 볼까요?</b>
              <p className="small">
                챗봇에서는 {examples.join(", ")}을(를) 볼 수 있어요.{" "}
                {preference && !preference.skipped && preference.type ? `튜토리얼에서 나온 성향(${PREFERENCE_TYPE_LABELS[preference.type]})은 저장되지 않으니 챗봇에서 밸런스 게임을 다시 해 주세요.` : ""}
              </p>
              <div className="tut-done-actions">
                <button type="button" className="btn btn-primary" onClick={onFinish}>
                  챗봇에서 시작하기
                </button>
                <button type="button" className="btn" onClick={reset}>
                  처음부터 다시
                </button>
              </div>
            </div>
          )}
        </div>
        {current.id !== "done" && (
          <div
            key={current.id}
            ref={tipRef}
            className="tut-tip"
            role="dialog"
            aria-label={`튜토리얼 ${n}단계: ${current.title}`}
            style={TIP_START}
          >
            <span className="tut-step">
              {n} / {steps.length - 1}
            </span>
            <b className="tut-title">{current.title}</b>
            <p>{current.body}</p>
            <div className="tut-actions">
              <button type="button" className="btn tut-next" onClick={next} disabled={busy}>
                {isLast ? "마치기" : "다음"}
              </button>
              <button type="button" className="tut-skip" onClick={onFinish}>
                건너뛰기
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
