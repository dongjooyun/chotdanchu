// 최종 판단 리포트의 판정 라벨 (PRD 06). 두 축을 코드가 계산하고 표에서 라벨을 고른다. AI는 이유 문장만 쓴다.
//
// 축 1, 회사 기반: 내 선호 가중치로 낸 등급 평균 (A 1, B 0.5, C 0). 확인 불가 지표는 빼고 남은 가중치로 다시 나눈다.
// 축 2, 이어짐: 3년차 공고 요구 역량 중 이 자리에서 이어지는 비율 (lib/career-gap.ts connectRatio, 일부는 절반).
// 기준값 (팀 자체 기준, 11/22): 기반 0.75 = 등급 평균이 A와 B 사이 중간 이상(대부분 A, 나머지 B). 이어짐 0.6 = 요구 역량 다섯 중 셋 이상이 이어짐.
// 기반을 0.75로 둔 이유: 시연 기업이 모두 큰 회사라 등급이 A 위주인데, 0.6이면 기반이 늘 "좋음"이라 성향이 달라도 라벨이 같다.
import { skippedPreference } from "@/lib/session";
import type { GradedIndicator, IndicatorId } from "@/lib/types";

export type FitLabel = "최적" | "도전" | "안정" | "고려" | "정보 보강";

/** 라벨 설명 한 줄 (PRD 06 표 그대로) */
export const FIT_DESCRIPTIONS: Record<FitLabel, string> = {
  최적: "3년 뒤가 보이는 자리",
  도전: "배울 건 많지만 감수할 게 있는 자리",
  안정: "든든하지만 일부 역량은 따로 채우기",
  고려: "다른 선택지와 비교해 볼 자리",
  "정보 보강": "면접에서 더 알아볼 자리",
};

/** 회사 기반 "좋음"의 기준값 */
export const BASE_THRESHOLD = 0.75;
/** 이어짐 "높음"의 기준값 */
export const CONNECT_THRESHOLD = 0.6;

const GRADE_SCORE = { A: 1, B: 0.5, C: 0 } as const;

/**
 * 회사 기반 점수 0~1. 등급이 나온 지표만 가중 평균한다. 셀 지표가 없으면 null.
 * 예: 가중치가 성장성에만 1이고 성장성 A -> 1, 같은 비중에 A 2개 C 2개 -> 0.5
 */
export function baseScore(graded: GradedIndicator[], weights: Record<IndicatorId, number>): number | null {
  let sum = 0;
  let wsum = 0;
  for (const g of graded) {
    if (g.grade === null) continue;
    const w = weights[g.id] ?? 0;
    sum += w * GRADE_SCORE[g.grade];
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : null;
}

export interface FitInput {
  graded: GradedIndicator[];
  weights: Record<IndicatorId, number>;
  /** 이어짐 비율. 3년차 공고가 없으면 null */
  connect: number | null;
}

export interface FitResult {
  label: FitLabel;
  base: number | null;
  connect: number | null;
  /** 어느 조건으로 골랐는지 (판단 로그용, 숫자 없이) */
  rule: string;
}

/**
 * 라벨을 고른다. 정보 투명도 C이거나 두 축 중 하나를 셀 수 없으면 정보 보강.
 * 예: 기반 0.7, 이어짐 0.8 -> 최적 / 기반 0.4, 이어짐 0.8 -> 도전 / 기반 0.7, 이어짐 0.4 -> 안정 / 둘 다 0.4 -> 고려
 */
export function decideFit({ graded, weights, connect }: FitInput): FitResult {
  const base = baseScore(graded, weights);
  const transparency = graded.find((g) => g.id === "transparency")?.grade;
  if (transparency === "C") return { label: "정보 보강", base, connect, rule: "정보 투명도 C" };
  if (base === null || connect === null) {
    return { label: "정보 보강", base, connect, rule: connect === null ? "3년차 공고 없음" : "등급이 나온 지표 없음" };
  }
  // 0.1씩 더한 평균이 0.7499999처럼 나오는 오차를 허용한다
  const good = base + 1e-9 >= BASE_THRESHOLD;
  const high = connect + 1e-9 >= CONNECT_THRESHOLD;
  const label: FitLabel = high ? (good ? "최적" : "도전") : good ? "안정" : "고려";
  return { label, base, connect, rule: `이어짐 ${high ? "높음" : "낮음"}, 기반 ${good ? "좋음" : "약함"}` };
}

/** 밸런스 게임을 건너뛰었을 때 쓰는 같은 비중 가중치 (lib/session.ts skippedPreference와 같다) */
export function equalWeights(): Record<IndicatorId, number> {
  return skippedPreference().weights;
}
