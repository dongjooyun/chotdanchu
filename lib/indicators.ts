// 지표 등급 계산 (compute_indicators). 기준표는 docs/indicators.md (11/19 확정)를 그대로 옮겼다.
// 숫자는 데이터에서 읽기만 하고, 여기서는 기준표에 입각하여 A/B/C 또는 확인 불가만 정한다.
// 경계값은 "N 이상"인 쪽에 넣는다 (예: 부채비율 정확히 100%면 B, 매출 증가율 정확히 15%면 A).
import { formatIndicatorValue } from "./format";
import { INDICATOR_LABELS } from "./types";
import type { Company, CompanyNature, Grade, GradedIndicator, IndicatorId, IndicatorValue } from "./types";

type Rated = { grade: Grade | null; basis: string; reason?: IndicatorValue["reason"] };

const GENERAL = "일반 기업 기준표";
const STARTUP = "스타트업 기준표";
const GENERAL_FUNDING_BASIS = `${GENERAL}: 일반 기업은 투자 라운드로 판단하지 않음 (등급 없음)`;

/** 화면에 보일 순서 (정보 투명도는 맨 끝, 계산값) */
export const INDICATOR_ORDER: IndicatorId[] = [
  "financial_health", "growth", "profitability", "hiring_flow", "compensation",
  "tenure", "tech_investment", "funding_stage", "risk", "transparency",
];

/**
 * 높을수록 좋은 수치를 세 구간으로 나눈다.
 * 예: band(15, 15, 0) -> "A", band(3, 15, 0) -> "B", band(-2, 15, 0) -> "C"
 */
function band(v: number, aFrom: number, bFrom: number): Grade {
  if (v >= aFrom) return "A";
  if (v >= bFrom) return "B";
  return "C";
}

/**
 * 재무 체력. 일반: 부채비율 100% 미만 A, 100~300% B, 300% 이상 C. 스타트업: 런웨이 18개월 이상 A, 12~18 B, 12 미만 C.
 * 스타트업이 영업흑자면 현금을 소진하지 않아 런웨이 제한이 없으므로 A (11/21 결정). 데이터에는 extra.profitable = 1
 */
function rateFinancial(x: IndicatorValue, v: number): Rated {
  if (x.metric === "runway_months" && x.extra?.profitable) {
    return { grade: "A", basis: `${STARTUP}: 영업흑자라 현금을 소진하지 않음 (런웨이 제한 없음) A` };
  }
  if (x.metric === "runway_months") {
    return { grade: band(v, 18, 12), basis: `${STARTUP}: 런웨이 18개월 이상 A, 12~18개월 B, 12개월 미만 C` };
  }
  const grade: Grade = v < 100 ? "A" : v < 300 ? "B" : "C";
  return { grade, basis: `${GENERAL}: 부채비율 100% 미만 A, 100~300% B, 300% 이상 C` };
}

/** 성장성. 매출 증가율. 일반: 15% 이상 A, 0~15% B, 감소 C. 스타트업: 50% 이상 A, 0~50% B, 감소 C */
function rateGrowth(nature: CompanyNature, v: number): Rated {
  if (nature === "startup") {
    return { grade: band(v, 50, 0), basis: `${STARTUP}: 매출 증가율 연 50% 이상 A, 0~50% B, 감소 C` };
  }
  return { grade: band(v, 15, 0), basis: `${GENERAL}: 매출 증가율 연 15% 이상 A, 0~15% B, 감소 C` };
}

/**
 * 수익성. 일반: 영업이익률 7% 이상 A, 3~7% B, 3% 미만 C.
 * 스타트업: 영업흑자면 A, 적자인데 전년보다 적자폭이 줄면 B, 늘거나 같으면 C.
 * 예: { value: -20, extra: { prev: -47.8 } } -> "B" (적자폭 축소)
 */
function rateProfitability(x: IndicatorValue, v: number): Rated {
  if (x.metric === "operating_income") {
    const basis = `${STARTUP}: 영업흑자 A, 적자폭 축소 B, 적자폭 확대 C`;
    if (v >= 0) return { grade: "A", basis };
    const prev = x.extra?.prev;
    if (prev === undefined) {
      return { grade: null, basis: `${basis}. 전년 영업이익이 없어 방향을 볼 수 없음`, reason: "no_source" };
    }
    return { grade: v > prev ? "B" : "C", basis };
  }
  return { grade: band(v, 7, 3), basis: `${GENERAL}: 영업이익률 7% 이상 A, 3~7% B, 3% 미만 C` };
}

/**
 * 고용 흐름. 주 수치는 12개월 인원 증감률.
 * 일반: 순증이고 연 퇴사율 20% 이하 A, 12개월 10% 이상 감소 C, 그 외 B.
 * 스타트업: 순증이고 월 퇴사율 3% 이하 A, 감소 또는 월 퇴사율 5% 초과 C, 그 외 B.
 * 퇴사율이 없으면 A를 줄 수 없다 (B 상한).
 * 예: 일반 { value: 8.2, extra: { annual_attrition: 14.1 } } -> "A"
 */
function rateHiring(nature: CompanyNature, x: IndicatorValue, v: number): Rated {
  if (nature === "startup") {
    const m = x.extra?.monthly_attrition;
    const basis = `${STARTUP}: 1년 전보다 직원이 늘었고 월 퇴사율 3% 이하면 A, 직원이 줄었거나 월 퇴사율 5% 초과면 C, 그 외 B`;
    if (v < 0 || (m !== undefined && m > 5)) return { grade: "C", basis };
    if (v > 0 && m !== undefined && m <= 3) return { grade: "A", basis };
    return { grade: "B", basis };
  }
  const a = x.extra?.annual_attrition;
  const basis = `${GENERAL}: 1년 전보다 직원이 늘었고 연 퇴사율 20% 이하면 A, 1년 새 직원이 10% 이상 줄면 C, 그 외 B`;
  if (v <= -10) return { grade: "C", basis };
  if (v > 0 && a !== undefined && a <= 20) return { grade: "A", basis };
  return { grade: "B", basis };
}

/**
 * 보상. 추정 범위의 가운데값을 업종 평균과 비교. 10% 이상 높음 A, ±10% 이내 B, 10% 이상 낮음 C.
 * 예: { range: [5420, 6110], extra: { industry_avg: 5100 } } -> 가운데 5765, +13.0% -> "A"
 */
function rateCompensation(x: IndicatorValue, v: number): Rated {
  const avg = x.extra?.industry_avg;
  const mid = x.range ? (x.range[0] + x.range[1]) / 2 : v;
  if (!avg) {
    return { grade: null, basis: "업종 평균 연봉이 없어 비교할 수 없음", reason: "no_source" };
  }
  const diff = ((mid - avg) / avg) * 100;
  const grade: Grade = diff >= 10 ? "A" : diff <= -10 ? "C" : "B";
  return { grade, basis: `업종 평균(${avg.toLocaleString("ko-KR")}만원) 대비 ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%. 10% 이상 높음 A, ±10% 이내 B, 10% 이상 낮음 C` };
}

/** 근속. 평균 근속 10년 이상 A, 5~10년 B, 5년 미만 C (두 기준표 같음) */
function rateTenure(v: number): Rated {
  return { grade: band(v, 10, 5), basis: "평균 근속 10년 이상 A, 5~10년 B, 5년 미만 C" };
}

/** 기술 투자 업종 구간. 적정 R&D 비율 [하한, 상한] (docs/indicators.md) */
const RND_BANDS = {
  tech: { name: "기술 집약", range: [10, 20] },
  advanced: { name: "첨단 제조", range: [5, 10] },
  traditional: { name: "전통 제조·장치", range: [1, 3] },
  service: { name: "서비스·금융·유틸리티", range: [0.1, 1] },
} as const;

/**
 * 표준산업분류(KSIC) 코드로 업종 구간을 정한다.
 * 예: "58222"(응용 소프트웨어) -> 기술 집약, "26212"(액정 표시장치) -> 첨단 제조, "24111"(제철) -> 전통 제조·장치, "47912" -> 서비스
 */
export function rndBand(ksic: string | null): keyof typeof RND_BANDS {
  const k = ksic ?? "";
  // 시스템 반도체(261), 의약품(21), 소프트웨어 출판(582), 프로그래밍(62), 정보서비스(63)
  if (/^(261|21|582|62|63)/.test(k)) return "tech";
  // 디스플레이 등 전자부품(26), 반도체 장비(29271), 이차전지(282), 화장품(20423, 뷰티 테크)
  if (/^(26|29271|282|20423)/.test(k)) return "advanced";
  // 그 밖의 제조업(10~34)
  const div = Number(k.slice(0, 2));
  if (k.length >= 2 && div >= 10 && div <= 34) return "traditional";
  return "service";
}

/**
 * 기술 투자. 일반: 매출 대비 R&D가 업종 적정 범위 위 A, 안 B, 아래 C. 스타트업: 등록 특허 3건 이상 A, 1~2건 B, 0건 C.
 * 예: 일반, KSIC "26110", rnd_ratio 16.0 -> 기술 집약(10~20%) 안 -> "B"
 */
function rateTech(company: Company, x: IndicatorValue, v: number): Rated {
  if (x.metric === "registered_patents") {
    return { grade: band(v, 3, 1), basis: `${STARTUP}: 등록 특허 3건 이상 A, 1~2건 B, 0건 C` };
  }
  const b = RND_BANDS[rndBand(company.industryCode)];
  const [lo, hi] = b.range;
  return { grade: band(v, hi, lo), basis: `${GENERAL}: ${b.name} 업종 적정 R&D ${lo}~${hi}%. 위 A, 안 B, 아래 C` };
}

/** "YYYY-MM"과 기준일 사이 개월 수. 예: monthsBetween("2025-04", 2026-11-20) -> 19 */
export function monthsBetween(period: string, asOf: Date): number | null {
  const m = /^(\d{4})-(\d{2})/.exec(period);
  if (!m) return null;
  return asOf.getFullYear() * 12 + asOf.getMonth() + 1 - (Number(m[1]) * 12 + Number(m[2]));
}

/**
 * 투자 단계 (스타트업만). ① 라운드와 누적 투자금: Series A면 30억 원 이상, Series B 이상이면 100억 원 이상
 * ② 최근 투자 유치가 18개월 이내. 둘 다 충족 A, 하나 B, 둘 다 미충족 C.
 * 라운드 이름이 없으면 ①은 누적 100억 원 이상일 때 충족. 최근 투자 시점을 모르면 ②는 미충족.
 * 예: { label: "Series B", value: 208.6, period: "2025-12" }, 기준일 2026-11 -> ① 충족, ② 11개월 충족 -> "A"
 */
function rateFunding(x: IndicatorValue, v: number, asOf: Date): Rated {
  const round = (x.label ?? "").trim().toLowerCase();
  // 라운드 이름을 공식 자료에서 못 찾았어도(공시의 유상증자, 회사 소개 페이지의 누적 투자액 등) 누적 100억 원 이상이면 ①을 충족으로 본다 (11/21)
  const need = /series\s*[b-z]|pre-ipo/.test(round) ? 100 : /series\s*a/.test(round) ? 30 : round === "" ? 100 : null;
  const first = need !== null && v >= need;
  const months = x.period ? monthsBetween(x.period, asOf) : null;
  const second = months !== null && months <= 18;
  const count = Number(first) + Number(second);
  const grade: Grade = count === 2 ? "A" : count === 1 ? "B" : "C";
  const when = months === null ? "최근 투자 시점 모름" : `최근 투자 ${months}개월 전`;
  return {
    grade,
    basis: `${STARTUP}: ① Series A 누적 30억 원 이상, Series B 이상 100억 원 이상 ② 최근 투자 18개월 이내. 둘 다 A, 하나 B, 없음 C (${when})`,
  };
}

/** 리스크. 해당 없음 A, 감사의견 한정 등 경미 B, 휴폐업·부적정·거절 C */
function rateRisk(x: IndicatorValue): Rated {
  const basis = "해당 없음 A, 경미(감사의견 한정 등) B, 해당(휴폐업, 감사의견 부적정·거절) C";
  if (x.label === "해당 없음") return { grade: "A", basis };
  if (x.label === "경미") return { grade: "B", basis };
  return { grade: "C", basis };
}

/** 원시값 하나를 기준표에 대어 등급을 정한다. 확인 불가면 grade null과 이유를 그대로 넘긴다 */
function rateOne(company: Company, x: IndicatorValue, asOf: Date): Rated {
  // 일반 기업의 투자 단계는 데이터가 있든 없든 "등급 없음"이다 (확인 불가로 세지 않는다)
  if (x.id === "funding_stage" && company.nature === "general") {
    return { grade: null, basis: GENERAL_FUNDING_BASIS };
  }
  if (x.status === "unavailable") {
    return { grade: null, basis: "공식 근거가 없어 등급을 매기지 않음", reason: x.reason ?? "no_source" };
  }
  if (x.id === "risk") return rateRisk(x);
  // 흑자 스타트업은 런웨이 값 자체가 없다 (소진이 없어 나눌 수 없음)
  if (x.metric === "runway_months" && x.extra?.profitable) return rateFinancial(x, Infinity);
  // 보상은 범위만 있고 대표값이 없을 수 있다
  const v = x.value ?? (x.range ? (x.range[0] + x.range[1]) / 2 : null);
  if (v === null) return { grade: null, basis: "값이 비어 있음", reason: "fetch_failed" };
  switch (x.id) {
    case "financial_health": return rateFinancial(x, v);
    case "growth": return rateGrowth(company.nature, v);
    case "profitability": return rateProfitability(x, v);
    case "hiring_flow": return rateHiring(company.nature, x, v);
    case "compensation": return rateCompensation(x, v);
    case "tenure": return rateTenure(v);
    case "tech_investment": return rateTech(company, x, v);
    case "funding_stage": return rateFunding(x, v, asOf);
  }
}

/**
 * 정보 투명도. 나머지 지표 중 등급이 나온 개수. 7개 이상 A, 4~6개 B, 3개 이하 C.
 * 일반 기업은 투자 단계가 등급 없음이라 8개 중에서 센다.
 * 예: 9개 중 8개 확인 -> "A"
 */
export function rateTransparency(graded: GradedIndicator[], nature: CompanyNature): GradedIndicator {
  const pool = graded.filter((g) => !(nature === "general" && g.id === "funding_stage"));
  const found = pool.filter((g) => g.grade !== null).length;
  const grade: Grade = found >= 7 ? "A" : found >= 4 ? "B" : "C";
  return {
    id: "transparency",
    grade,
    display: `지표 ${pool.length}개 중 ${found}개 확인`,
    basis: "확인된 지표 7개 이상 A, 4~6개 B, 3개 이하 C",
    source: null,
  };
}

/**
 * 기업 하나의 10개 지표 등급을 계산한다. 데이터에 없는 지표는 확인 불가(no_source)로 채운다.
 * asOf는 투자 시점(18개월 이내)을 셀 기준일이다.
 */
export function computeIndicators(company: Company, asOf: Date = new Date()): GradedIndicator[] {
  const graded: GradedIndicator[] = INDICATOR_ORDER.filter((id) => id !== "transparency").map((id) => {
    const x = company.indicators.find((i) => i.id === id);
    if (id === "funding_stage" && company.nature === "general") {
      return { id, grade: null, display: "등급 없음", basis: GENERAL_FUNDING_BASIS, source: null };
    }
    if (!x) {
      return {
        id,
        grade: null,
        display: "확인 불가",
        basis: `${INDICATOR_LABELS[id]} 데이터가 없음`,
        source: null,
        reason: "no_source",
      };
    }
    const r = rateOne(company, x, asOf);
    return {
      id,
      grade: r.grade,
      display: formatIndicatorValue(x),
      basis: r.basis,
      source: x.source,
      ...(r.reason ? { reason: r.reason } : {}),
    };
  });
  return [...graded, rateTransparency(graded, company.nature)];
}

/** 등급 분포. 예: { A: 3, B: 5, C: 1, none: 1 } (정보 투명도 제외, 일반 기업의 투자 단계 제외) */
export function gradeDistribution(graded: GradedIndicator[], nature: CompanyNature) {
  const dist = { A: 0, B: 0, C: 0, none: 0 };
  for (const g of graded) {
    if (g.id === "transparency") continue;
    if (nature === "general" && g.id === "funding_stage") continue;
    if (g.grade) dist[g.grade] += 1;
    else dist.none += 1;
  }
  return dist;
}
