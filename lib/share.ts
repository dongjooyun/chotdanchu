// 카드 공유 링크 (QR이 여는 주소). 링크에는 기업 ID, 직무, 선호 가중치만 담는다 (개인정보 없음, PRD 06 11/19 결정).
// 열면 같은 코드로 카드를 다시 계산해 그린다 (app/card/page.tsx). 같은 입력이면 같은 카드가 나온다.
import { MATCHUP_INDICATORS, typeFromWeights } from "@/lib/matchup";
import { INDICATOR_LABELS, type IndicatorId, type Preference, type Role } from "@/lib/types";

const ROLES: Role[] = ["서비스기획", "마케팅", "운영"];
const ORDER = Object.keys(INDICATOR_LABELS) as IndicatorId[];

/**
 * 가중치를 링크용 문자열로. 지표 순서대로 1000배 반올림한 정수를 "_"로 잇는다.
 * 예: 모두 0.1 -> "100_100_100_100_100_100_100_100_100_100"
 */
export function encodeWeights(weights: Record<IndicatorId, number>): string {
  return ORDER.map((id) => Math.round((weights[id] ?? 0) * 1000)).join("_");
}

/**
 * 링크의 값으로 선호를 되살린다. 값이 없거나 형식이 틀리면 null(기본 기준).
 * 예: decodeWeights("100_100_...") -> { skipped: false, type: "balance_practical", ... }
 */
export function decodeWeights(raw: string | null | undefined): Preference | null {
  if (!raw) return null;
  const nums = raw.split("_").map(Number);
  if (nums.length !== ORDER.length || nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const sum = nums.reduce((s, n) => s + n, 0);
  if (sum <= 0) return null;
  const weights = Object.fromEntries(ORDER.map((id, i) => [id, nums[i] / sum])) as Record<IndicatorId, number>;
  const topIndicators = [...MATCHUP_INDICATORS]
    .sort((a, b) => weights[b] - weights[a] || MATCHUP_INDICATORS.indexOf(a) - MATCHUP_INDICATORS.indexOf(b))
    .slice(0, 3);
  return { skipped: false, type: typeFromWeights(weights), topIndicators, weights };
}

/** 링크 경로와 쿼리. 예: shareHref("00258801", "마케팅", "100_...") -> "/card?c=00258801&r=%EB%A7%88...&w=100_..." */
export function shareHref(companyId: string, role: Role, weightsParam?: string): string {
  const q = new URLSearchParams({ c: companyId, r: role });
  if (weightsParam) q.set("w", weightsParam);
  return `/card?${q.toString()}`;
}

/** 링크 값 확인. 직무가 셋 중 하나가 아니면 null */
export function parseRole(raw: string | null | undefined): Role | null {
  return ROLES.find((r) => r === raw) ?? null;
}
