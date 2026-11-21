// 맞대결(PRD 02): 가상 카드 8장의 8강 토너먼트(7판)와 선호 가중치 계산.
// 출제는 미리 정한 대진이고(적응형 아님), 계산은 Bradley-Terry 쌍 비교 모델이다. 같은 선택이면 항상 같은 결과가 나온다.
import cardsFile from "@/data/matchup/cards.json";
import {
  type Grade,
  type IndicatorId,
  type MatchupCard,
  type Preference,
  type PreferenceType,
} from "@/lib/types";

export const MATCHUP_ROUNDS = 7;

/** 카드에 보이는 지표 6개 (순서대로 화면에 그린다) */
export const MATCHUP_INDICATORS = cardsFile.indicators as IndicatorId[];

export const MATCHUP_CARDS: MatchupCard[] = cardsFile.cards.map((c) => ({
  id: c.id,
  title: "",
  archetype: c.archetype as PreferenceType,
  grades: c.grades as MatchupCard["grades"],
}));

const ALL_IDS: IndicatorId[] = [
  "financial_health", "growth", "profitability", "hiring_flow", "compensation",
  "tenure", "tech_investment", "funding_stage", "risk", "transparency",
];

const GRADE_SCORE: Record<Grade, number> = { A: 1, B: 0.5, C: 0 };

const byId = (id: string) => {
  const card = MATCHUP_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`맞대결 카드 없음: ${id}`);
  return card;
};

/**
 * 지금 판의 두 카드. picks는 지금까지 판마다 고른 카드 id (0~6개).
 * 8강 4판은 1-2, 3-4, 5-6, 7-8. 4강은 8강 1·2판 승자끼리, 3·4판 승자끼리. 결승은 4강 승자끼리.
 * 예: currentPair([]) -> [card-1, card-2], currentPair(7개) -> null (끝남)
 */
export function currentPair(picks: string[]): [MatchupCard, MatchupCard] | null {
  const k = picks.length;
  if (k < 4) return [MATCHUP_CARDS[k * 2], MATCHUP_CARDS[k * 2 + 1]];
  if (k === 4) return [byId(picks[0]), byId(picks[1])];
  if (k === 5) return [byId(picks[2]), byId(picks[3])];
  if (k === 6) return [byId(picks[4]), byId(picks[5])];
  return null;
}

/** 판 이름. 예: 0 -> "8강", 4 -> "4강", 6 -> "결승" */
export function roundName(k: number): string {
  return k < 4 ? "8강" : k < 6 ? "4강" : "결승";
}

/** 고른 기록을 (이긴 카드, 진 카드) 쌍으로 바꾼다. 중간에 대진에 없는 id가 오면 거기서 멈춘다 */
export function comparisons(picks: string[]): { winner: MatchupCard; loser: MatchupCard }[] {
  const out: { winner: MatchupCard; loser: MatchupCard }[] = [];
  for (let k = 0; k < Math.min(picks.length, MATCHUP_ROUNDS); k++) {
    const pair = currentPair(picks.slice(0, k));
    if (!pair) break;
    const [a, b] = pair;
    if (picks[k] === a.id) out.push({ winner: a, loser: b });
    else if (picks[k] === b.id) out.push({ winner: b, loser: a });
    else break;
  }
  return out;
}

/**
 * 판 하나의 지표별 차이 (이긴 카드 점수 - 진 카드 점수). 두 카드 중 하나라도 확인 불가인 지표는 0으로 둬 학습에서 뺀다 (PRD 02).
 * 예: 재무 A vs C -> +1, 성장 C vs A -> -1, 근속 A vs 확인 불가 -> 0
 */
export function featureDiff(winner: MatchupCard, loser: MatchupCard): number[] {
  return MATCHUP_INDICATORS.map((id) => {
    const a = winner.grades[id];
    const b = loser.grades[id];
    if (!a || !b || a === "unavailable" || b === "unavailable") return 0;
    return GRADE_SCORE[a] - GRADE_SCORE[b];
  });
}

/**
 * Bradley-Terry(로지스틱) 계수. P(이긴 카드가 이김) = sigmoid(w · 차이)를 최대로 하는 w를 경사 상승 300번으로 찾는다.
 * 판이 7개뿐이라 값이 튀지 않게 L2 규제(0.5)를 둔다. 시작점과 반복 횟수가 고정이라 같은 입력이면 같은 출력이다.
 */
export function fitBradleyTerry(diffs: number[][]): number[] {
  const n = MATCHUP_INDICATORS.length;
  const w = new Array<number>(n).fill(0);
  const lambda = 0.5;
  const lr = 0.3;
  for (let it = 0; it < 300; it++) {
    const grad = w.map((wi) => -lambda * wi);
    for (const d of diffs) {
      const z = d.reduce((s, x, i) => s + x * w[i], 0);
      const p = 1 / (1 + Math.exp(-z));
      for (let i = 0; i < n; i++) grad[i] += (1 - p) * d[i];
    }
    for (let i = 0; i < n; i++) w[i] += lr * grad[i];
  }
  return w;
}

/** 유형을 가르는 지표 묶음. 두 묶음 점수가 거의 같으면 밸런스·실속으로 본다 */
const TYPE_GROUPS: Record<PreferenceType, IndicatorId[]> = {
  stable_system: ["financial_health", "tenure"],
  autonomy_pioneer: ["growth", "funding_stage"],
  balance_practical: ["compensation", "hiring_flow"],
};

/** 유형 설명과 어울리는 기업 성격 (PRD 02). 팀이 공개 자료로 정한 자체 기준 */
export const TYPE_INFO: Record<PreferenceType, { description: string; fits: string }> = {
  stable_system: {
    description: "체계가 갖춰진 곳에서 차근차근 쌓아 가는 쪽을 중시해요.",
    fits: "상장 기업, 중견기업처럼 재무와 근속이 안정적인 곳",
  },
  autonomy_pioneer: {
    description: "빠르게 크는 곳에서 넓은 범위를 맡아 보는 쪽을 중시해요.",
    fits: "스타트업, 성장형 중소기업처럼 성장과 투자가 활발한 곳",
  },
  balance_practical: {
    description: "보상과 사람의 흐름 같은 실속을 고루 따지는 쪽이에요.",
    fits: "강소기업, 성장 안정기의 중견기업처럼 보상과 고용이 고른 곳",
  },
};

/**
 * 7판의 선택으로 선호를 만든다. 지표 10개 중요도는 계수를 softmax로 바꿔 합이 1이고,
 * 카드에 없는 지표(수익성, 기술 투자, 리스크, 정보 투명도)는 계수가 0이라 기본 비중을 받는다.
 * 예: 매번 성장성이 높은 카드를 고르면 type "autonomy_pioneer", topIndicators 첫째 "growth"
 */
export function preferenceFromPicks(picks: string[]): Preference {
  const diffs = comparisons(picks).map((c) => featureDiff(c.winner, c.loser));
  const coef = fitBradleyTerry(diffs);
  const raw = Object.fromEntries(ALL_IDS.map((id) => [id, 0])) as Record<IndicatorId, number>;
  MATCHUP_INDICATORS.forEach((id, i) => (raw[id] = coef[i]));
  const exp = ALL_IDS.map((id) => Math.exp(raw[id]));
  const sum = exp.reduce((s, x) => s + x, 0);
  const weights = Object.fromEntries(ALL_IDS.map((id, i) => [id, exp[i] / sum])) as Record<IndicatorId, number>;
  const topIndicators = [...MATCHUP_INDICATORS]
    .sort((a, b) => weights[b] - weights[a] || MATCHUP_INDICATORS.indexOf(a) - MATCHUP_INDICATORS.indexOf(b))
    .slice(0, 3);
  return { skipped: false, type: typeFromWeights(weights), topIndicators, weights };
}

/** 묶음 점수가 가장 큰 유형. 1, 2위 차이가 0.01 미만이면 밸런스·실속 */
export function typeFromWeights(weights: Record<IndicatorId, number>): PreferenceType {
  const scores = (Object.keys(TYPE_GROUPS) as PreferenceType[]).map((t) => ({
    t,
    s: TYPE_GROUPS[t].reduce((acc, id) => acc + weights[id], 0),
  }));
  scores.sort((a, b) => b.s - a.s);
  if (scores[0].s - scores[1].s < 0.01) return "balance_practical";
  return scores[0].t;
}
