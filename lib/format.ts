// 화면에 보일 이름과 수치 문구. 숫자 자체는 데이터에서 그대로 가져오고, 여기서는 모양만 바꾼다.
import type { CompanyNature, Disclosure, IndicatorValue, UnavailableReason } from "@/lib/types";

export const DISCLOSURE_LABELS: Record<Disclosure, string> = {
  listed: "상장",
  audited: "외감",
  unlisted: "비공시",
};

export const NATURE_LABELS: Record<CompanyNature, string> = {
  startup: "스타트업",
  general: "일반 기업",
};

export const UNAVAILABLE_REASON_LABELS: Record<UnavailableReason, string> = {
  not_disclosed: "공시 의무가 없어 볼 수 없음",
  no_source: "가져올 공식 출처가 없음",
  fetch_failed: "조회에 실패함",
};

export const METRIC_LABELS: Record<string, string> = {
  debt_ratio: "부채비율",
  runway_months: "런웨이",
  revenue_growth: "매출 증가율",
  operating_margin: "영업이익률",
  operating_income: "영업이익",
  headcount_change_12m: "12개월 인원 증감",
  avg_salary: "평균 연봉",
  avg_tenure: "평균 근속",
  rnd_ratio: "매출 대비 R&D",
  registered_patents: "등록 특허",
  cumulative_funding: "누적 투자",
  risk_flags: "위험 신호",
};

function num(n: number | null): string {
  return n === null ? "-" : n.toLocaleString("ko-KR");
}

/**
 * 지표 원시값을 한 줄로.
 * 예: { metric: "debt_ratio", value: 120.5, unit: "%" } -> "120.5%"
 *     { metric: "avg_salary", range: [4500, 5100], unit: "만원" } -> "4,500~5,100만원 (추정)"
 *     { metric: "headcount_change_12m", value: 12.3, unit: "%", status: "estimated" } -> "+12.3% (추정)"
 *     { status: "unavailable" } -> "확인 불가"
 */
export function formatIndicatorValue(x: IndicatorValue): string {
  if (x.status === "unavailable") return "확인 불가";
  if (x.metric === "risk_flags") return x.label ?? "해당 없음";
  if (x.metric === "cumulative_funding") return `${x.label ?? ""} 누적 ${num(x.value)}${x.unit}`.trim();
  if (x.range) return `${num(x.range[0])}~${num(x.range[1])}${x.unit} (추정)`;
  if (x.metric === "operating_income" && x.extra?.prev !== undefined) {
    return `${num(x.value)}${x.unit} (전년 ${num(x.extra.prev)}${x.unit})`;
  }
  const sign = x.metric === "headcount_change_12m" && x.value !== null && x.value > 0 ? "+" : "";
  const text = `${sign}${num(x.value)}${x.unit}`;
  return x.status === "estimated" ? `${text} (추정)` : text;
}
