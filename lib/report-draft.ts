// 지금 보고 있는 기업과 직무로 최종 판단 리포트 카드 내용을 만든다 (CDC-16).
// 회사 이름, 유형, 직무, 지표 등급, 판단 로그는 실제 값이고, 판정 라벨과 역량 갭도 코드가 계산한다.
// 라벨 이유 한 줄은 규칙 문장이다. 숫자를 넣지 않고, 내가 중시한 지표 이름이 들어가서 선호가 다르면 강조점이 달라진다.
import { cardNo, logoOf, monogram } from "@/lib/brand";
import { computeCareerGap, connectRatio, gapDetail, type CareerGap } from "@/lib/career-gap";
import type { AppMode, LogLine } from "@/lib/chat";
import { decideFit, equalWeights, type FitResult } from "@/lib/fit-label";
import { encodeWeights } from "@/lib/share";
import { DISCLOSURE_LABELS, NATURE_LABELS } from "@/lib/format";
import type { ReportCardData } from "@/lib/report-card";
import {
  INDICATOR_LABELS,
  PREFERENCE_TYPE_LABELS,
  type Company,
  type GradedIndicator,
  type IndicatorId,
  type Preference,
  type Role,
} from "@/lib/types";

export interface ReportDraftInput {
  company: Company;
  graded: GradedIndicator[];
  role: Role;
  preference: Preference | null;
  log: LogLine[];
  /** 기준일 YYYY-MM-DD */
  checkedAt: string;
  /** 3년차 공고를 어느 데이터에서 찾을지 (목업은 가상 공고) */
  mode: AppMode;
}

/** 폐업·휴업 회사에 질문 대신 보일 안내 (고정 문구) */
export const CLOSED_NOTICE: Record<"closed" | "suspended", string> = {
  closed: "국세청 기준 폐업한 회사라 지원할 수 없어요. 면접 질문은 만들지 않았어요. 같은 이름의 다른 회사를 찾으셨다면 후보에서 다시 골라 주세요.",
  suspended: "국세청 기준 휴업 중인 회사예요. 면접 질문은 만들지 않았어요. 채용이 열려 있는지 회사 공식 채용 페이지에서 먼저 확인해 주세요.",
};

/** 역량 갭에서 면접 질문으로 만들 공백 항목 수의 상한 */
const GAP_QUESTION_LIMIT = 2;

/**
 * 예: 확인 불가 지표 1개, 공백 역량 1개 -> 면접 질문 2개. 이름에 직무가 들어가므로 직무를 바꾸면 질문도 바뀐다.
 * 폐업·휴업 회사는 판정과 질문 없이 고정 안내만 둔다 (11/21 결정)
 */
export function buildReportDraft(input: ReportDraftInput): ReportCardData {
  const { company, graded, role, preference, log } = input;
  const riskExtra = company.indicators.find((i) => i.id === "risk")?.extra;
  const stopped = riskExtra?.closed ? "closed" : riskExtra?.suspended ? "suspended" : null;
  const gradeOf = (id: GradedIndicator["id"]) => graded.find((g) => g.id === id)?.grade ?? null;
  const gap = stopped ? null : computeCareerGap(company.id, role, input.mode);
  const fit = stopped
    ? null
    : decideFit({ graded, weights: preference?.weights ?? equalWeights(), connect: gap ? connectRatio(gap.counts) : null });
  const top = preference?.topIndicators ?? [];
  return {
    no: cardNo(company.id),
    companyId: company.id,
    companyName: company.name,
    logo: logoOf(company.id),
    monogram: monogram(company.name),
    typeLabel: `${DISCLOSURE_LABELS[company.disclosure]} · ${NATURE_LABELS[company.nature]}`,
    role,
    fitLabel: fit?.label ?? null,
    fitReason: fit ? fitReason(fit, top, graded, gap) : "운영 중인 회사가 아니라 판정하지 않았어요",
    preferenceType: preference?.type ? PREFERENCE_TYPE_LABELS[preference.type] : null,
    topIndicators: top.map((id) => ({ id, grade: gradeOf(id) })),
    gap: gap?.counts ?? null,
    ...(gap ? { gapDetail: gapDetail(gap), careerYears: gap.posting.years } : {}),
    careerSource: gap ? careerSourceText(gap) : null,
    ...(gap?.posting.url ? { careerUrl: gap.posting.url } : {}),
    ...(gap?.posting.substitute ? { substituteNote: gap.posting.substitute.reason } : {}),
    ...(preference && !preference.skipped ? { weightsParam: encodeWeights(preference.weights) } : {}),
    grades: graded.map((g) => ({ id: g.id, grade: g.grade })),
    interviewQuestions: stopped ? [] : interviewQuestions(graded, role, gap),
    ...(stopped ? { notice: CLOSED_NOTICE[stopped] } : {}),
    decisions: log.filter((l) => l.type === "decision").map((l) => l.title),
    checkedAt: input.checkedAt,
  };
}

/**
 * 3년차 공고 출처 한 줄. 예: "(주)무신사 Growth Marketer (카테고리 전략 담당), 4년 이상, 수동 확인 2026-11-21"
 * 목업 가상 공고는 "가상 공고 (목업)"이 들어간다
 */
export function careerSourceText(gap: CareerGap): string {
  const p = gap.posting;
  if (!p.url) return `${p.title}, 목업용 가상 공고`;
  const years = p.title.includes(p.years) ? "" : `, ${p.years}`;
  return `${p.postedBy} ${p.title}${years}, 수동 확인 ${p.checkedAt}`;
}

/**
 * 라벨 이유 한 줄 (규칙 문장, 숫자 없음). 내가 중시한 지표 이름이 들어가서 선호가 다르면 문장도 달라진다.
 * 예: 최적, 중시 지표 [성장성] -> "내가 중시한 성장성이 우수하고, 3년차 때 요구되는 역량 대부분을 신입 때부터 쌓을 수 있어요."
 */
export function fitReason(fit: FitResult, top: IndicatorId[], graded: GradedIndicator[], gap: CareerGap | null): string {
  const gradeOf = (id: IndicatorId) => graded.find((g) => g.id === id)?.grade ?? null;
  const strong = top.find((id) => gradeOf(id) === "A") ?? top[0];
  const weak = top.find((id) => gradeOf(id) === "C" || gradeOf(id) === null);
  const strongText = strong ? `내가 중시한 ${INDICATOR_LABELS[strong]}` : "공개 지표 전반";
  const i = josa(strongText, "이", "가");
  const n = josa(strongText, "은", "는");
  const missing = gap?.items.find((it) => it.kind === "missing")?.name;
  switch (fit.label) {
    case "최적":
      return `${strongText}${i} 우수하고, 3년차 때 요구되는 역량 대부분을 신입 때부터 쌓을 수 있어요.`;
    case "도전":
      return weak
        ? `3년차 때 요구되는 역량 대부분을 신입 때부터 쌓을 수 있지만, 내가 중시한 ${INDICATOR_LABELS[weak]} 쪽은 감수할 부분이 있어요.`
        : "3년차 때 요구되는 역량 대부분을 쌓을 수 있지만, 내 기준으로 본 회사 기반은 아쉬운 편이에요.";
    case "안정":
      return missing
        ? `${strongText}${n} 든든하지만, 3년차 때 요구되는 "${missing}" 같은 역량은 따로 채워야 해요.`
        : `${strongText}${n} 든든하지만, 3년차 때 요구되는 역량 일부는 따로 채워야 해요.`;
    case "고려":
      return "내 기준으로 본 회사 기반과 3년차 역량 모두 아쉬운 점이 있어, 다른 회사와 비교해 보면 좋아요.";
    case "정보 보강":
      return fit.rule === "3년차 공고 없음"
        ? "같은 직무의 3년차 공고를 찾지 못해, 쌓을 수 있는 역량은 면접에서 확인해야 해요."
        : "공개된 정보가 적어, 판단에 필요한 내용을 면접에서 더 확인해야 해요.";
  }
}

/**
 * 받침에 맞는 조사. 예: josa("성장성", "이", "가") -> "이", josa("리스크", "이", "가") -> "가"
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return withFinal;
  return code % 28 === 0 ? withoutFinal : withFinal;
}

/** 확인 불가 지표마다 하나, 3년차 공고의 공백 역량마다 하나(최대 2개). 아무것도 없으면 기본 질문 하나 */
function interviewQuestions(graded: GradedIndicator[], role: Role, gap: CareerGap | null): string[] {
  const unavailable = graded.filter((g) => g.grade === null && g.reason !== undefined);
  const qs = unavailable.map(
    (g) => `${INDICATOR_LABELS[g.id]} 정보를 확인하지 못했어요. ${role} 직무로 일하게 되면 이 부분을 어떻게 알 수 있나요?`,
  );
  const gaps = (gap?.items ?? []).filter((i) => i.kind === "missing").slice(0, GAP_QUESTION_LIMIT);
  for (const g of gaps) qs.push(`3년차 ${role} 공고에 나온 "${g.name}" 같은 역량은 신입 때 어떻게 쌓을 수 있나요?`);
  return qs.length > 0 ? qs : [`입사 3년 차 ${role} 담당자는 어떤 일을 맡고 있나요?`];
}

/**
 * 기업 카드 다음에 보일 3년차 공고 비교 안내 (채팅 말풍선). 숫자와 역량 이름은 코드가 센 결과 그대로다.
 * 줄글이 길면 안 읽히므로 한 줄씩 나눈다 (말풍선은 줄바꿈을 그대로 보인다). 사용자 정보는 쓰지 않는다.
 * 예:
 *   마케팅 직무에서 신입 때 쌓을 수 있는 역량과 비교했어요.
 *   - 3년차 때 요구되는 역량: 5개 (경력 4년 이상 공고)
 *   - 신입 마케팅 직무 때 쌓을 수 있는 역량: 3개 (퍼포먼스 광고 운영, 검색 마케팅, 마케팅 데이터 분석)
 *   - 따로 채워야 하는 역량: 2개 (협업·조율, 생성형 AI 활용)
 */
export function careerMessage(gap: CareerGap | null, role: Role): string {
  if (!gap) return `${role} 직무의 3년차 공고를 찾지 못해 역량 비교는 확인 불가로 둘게요.`;
  const c = gap.counts;
  const d = gapDetail(gap);
  const p = gap.posting;
  const years = p.url ? ` (경력 ${p.years} 공고)` : "";
  const lines = [
    `${role} 직무에서 신입 때 쌓을 수 있는 역량과 비교했어요.`,
    `- 3년차 때 요구되는 역량: ${c.connected + c.missing}개${years}`,
    `- 신입 ${role} 직무 때 쌓을 수 있는 역량: ${c.connected}개${c.connected > 0 ? ` (${d.connected.join(", ")})` : ""}`,
    `- 따로 채워야 하는 역량: ${c.missing}개${c.missing > 0 ? ` (${d.missing.join(", ")})` : ""}`,
  ];
  if (p.substitute) lines.push(`${p.substitute.reason}.`);
  return lines.join("\n");
}
