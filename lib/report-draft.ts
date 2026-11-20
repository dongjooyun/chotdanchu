// 지금 보고 있는 기업과 직무로 리포트 카드 내용을 만든다. 리포트 태스크(CDC-16) 전까지의 초안이다.
// 회사 이름, 유형, 직무, 지표 등급, 판단 로그는 실제 값이고, 판정 라벨과 3년차 공고 비교는 아직 없어서 비워 둔다.
import type { LogLine } from "@/lib/chat";
import { DISCLOSURE_LABELS, NATURE_LABELS } from "@/lib/format";
import type { ReportCardData } from "@/lib/report-card";
import {
  INDICATOR_LABELS,
  PREFERENCE_TYPE_LABELS,
  type Company,
  type GradedIndicator,
  type Preference,
  type Role,
} from "@/lib/types";

export interface ReportDraftInput {
  company: Company;
  graded: GradedIndicator[];
  role: Role;
  preference: Preference | null;
  log: LogLine[];
  /** 모은 순서 (1부터) */
  no: number;
  /** 기준일 YYYY-MM-DD */
  checkedAt: string;
}

/** 폐업·휴업 회사에 질문 대신 보일 안내 (고정 문구) */
export const CLOSED_NOTICE: Record<"closed" | "suspended", string> = {
  closed: "국세청 기준 폐업한 회사라 지원할 수 없어요. 면접 질문은 만들지 않았어요. 같은 이름의 다른 회사를 찾으셨다면 후보에서 다시 골라 주세요.",
  suspended: "국세청 기준 휴업 중인 회사예요. 면접 질문은 만들지 않았어요. 채용이 열려 있는지 회사 공식 채용 페이지에서 먼저 확인해 주세요.",
};

/**
 * 예: 확인 불가 지표 1개 -> 면접 질문 1개. 이름에 직무가 들어가므로 직무를 바꾸면 질문도 바뀐다.
 * 폐업·휴업 회사는 질문 없이 고정 안내만 둔다 (11/21 결정)
 */
export function buildReportDraft(input: ReportDraftInput): ReportCardData {
  const { company, graded, role, preference, log } = input;
  const riskExtra = company.indicators.find((i) => i.id === "risk")?.extra;
  const stopped = riskExtra?.closed ? "closed" : riskExtra?.suspended ? "suspended" : null;
  const gradeOf = (id: GradedIndicator["id"]) => graded.find((g) => g.id === id)?.grade ?? null;
  const unavailable = graded.filter((g) => g.grade === null && g.reason !== undefined);
  const questions = unavailable.map(
    (g) => `${INDICATOR_LABELS[g.id]} 정보를 확인하지 못했어요. ${role} 직무로 일하게 되면 이 부분을 어떻게 알 수 있나요?`,
  );
  return {
    no: input.no,
    companyName: company.name,
    typeLabel: `${DISCLOSURE_LABELS[company.disclosure]} · ${NATURE_LABELS[company.nature]}`,
    role,
    fitLabel: null,
    fitReason: "판정 라벨은 리포트 태스크(CDC-16)에서 붙어요",
    preferenceType: preference?.type ? PREFERENCE_TYPE_LABELS[preference.type] : null,
    topIndicators: (preference?.topIndicators ?? []).map((id) => ({ id, grade: gradeOf(id) })),
    gap: null,
    careerSource: null,
    grades: graded.map((g) => ({ id: g.id, grade: g.grade })),
    interviewQuestions: stopped
      ? []
      : questions.length > 0
        ? questions
        : [`입사 3년 차 ${role} 담당자는 어떤 일을 맡고 있나요?`],
    ...(stopped ? { notice: CLOSED_NOTICE[stopped] } : {}),
    decisions: log.filter((l) => l.type === "decision").map((l) => l.title),
    checkedAt: input.checkedAt,
  };
}
