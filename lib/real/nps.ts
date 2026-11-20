// 국민연금 가입 사업장 내역(공공데이터포털 파일)을 지표 원시값으로 바꾸는 순수 함수.
// 파일은 110MB라 레포에 넣지 않고, 사전 계산 스크립트(scripts/build-real-companies.mts)가 레포 밖에서 읽는다.
import type { IndicatorValue, Source } from "../types";

export const NPS_SOURCE_URL = "https://www.data.go.kr/data/15083277/fileData.do";

/** 파일 한 행에서 쓰는 칸만 */
export interface NpsRow {
  period: string; // 자료생성년월 "2026-09"
  name: string; // 사업장명
  bizPrefix: string; // 사업자등록번호 앞 6자리 (뒤는 공개 안 됨)
  active: boolean; // 가입상태 1 등록
  corporate: boolean; // 사업장형태 1 법인
  industryCode: string; // 국민연금 업종코드 (KSIC와 다름)
  industryName: string;
  members: number; // 가입자수
  notice: number; // 당월 고지금액 (원, 사업장 전체 보험료)
  acquired: number; // 신규 취득자수
  lost: number; // 상실 가입자수
}

/**
 * CSV 한 줄을 칸으로 나눈다. 큰따옴표 안의 쉼표는 나누지 않는다.
 * 예: 'a,"b,c",d' -> ["a", "b,c", "d"]
 */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 파일 한 줄 -> NpsRow. 칸이 모자라거나 머리줄이면 null */
export function parseNpsLine(line: string): NpsRow | null {
  const c = splitCsv(line);
  if (c.length < 22 || !/^\d{4}-\d{2}$/.test(c[0])) return null;
  return {
    period: c[0],
    name: c[1].trim(),
    bizPrefix: c[2].trim(),
    active: c[3] === "1",
    corporate: c[12] === "1",
    industryCode: c[13].trim(),
    industryName: c[14].trim(),
    members: Number(c[18]) || 0,
    notice: Number(c[19]) || 0,
    acquired: Number(c[20]) || 0,
    lost: Number(c[21]) || 0,
  };
}

/** 법인 표기와 공백을 뺀 이름. 예: "주식회사버킷플레이스" -> "버킷플레이스" */
export function normalizeName(name: string): string {
  return name.replace(/주식회사|\(주\)|（주）|㈜/g, "").replace(/\s+/g, "");
}

/**
 * 사업자등록번호 앞 6자리와 사업장명으로 회사를 찾는다. 앞 6자리만으로는 다른 회사가 많이 걸린다 (11/19 실측).
 * 예: matchRow(rows, "120814", "카카오") -> "주식회사 카카오" 한 행
 */
export function matchRow(rows: NpsRow[], bizPrefix: string, name: string): NpsRow | null {
  const n = normalizeName(name);
  const hits = rows.filter((r) => r.active && r.bizPrefix === bizPrefix && normalizeName(r.name) === n);
  return hits.length === 1 ? hits[0] : null;
}

/** 연도별 보험료율. 2026년부터 매년 0.5%p 오른다 (2025년 연금개혁) */
const RATE_BY_YEAR: Record<string, number> = { "2025": 0.09, "2026": 0.095 };

/** 기준소득월액 상한 (매년 7월 조정). 2025-07~2026-06 637만 원, 2026-07~2027-06 659만 원 */
export function incomeCap(period: string): number {
  return period >= "2026-07" ? 6_590_000 : 6_370_000;
}

export function contributionRate(period: string): number {
  return RATE_BY_YEAR[period.slice(0, 4)] ?? 0.095;
}

/**
 * 고지금액으로 거꾸로 계산한 1인 평균 기준소득월액 (원).
 * 예: 고지 2,216,917,060원, 가입자 3,788명, 2026년 9.5% -> 약 6,160,000원
 */
export function monthlyIncome(row: Pick<NpsRow, "notice" | "members" | "period">): number | null {
  if (row.members <= 0 || row.notice <= 0) return null;
  return row.notice / row.members / contributionRate(row.period);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function source(period: string, checkedAt: string): Source {
  return { name: `국민연금 가입 사업장 내역 (${period}분)`, url: NPS_SOURCE_URL, checkedAt };
}

/**
 * 고용 흐름. 주 수치는 12개월 인원 증감률, 보조로 월 상실률(상실 / 가입자).
 * 상실 수치는 고지 대상 비교값이라 추정으로 표시한다 (11/19 결정).
 * 예: 2025-09 3,885명 -> 2026-09 3,788명 = -2.5%, 9월 상실 55명 -> 월 1.5%
 */
export function hiringIndicator(now: NpsRow | null, yearAgo: NpsRow | null, checkedAt: string): IndicatorValue {
  if (!now || !yearAgo || yearAgo.members <= 0) {
    return { id: "hiring_flow", metric: "headcount_change_12m", status: "unavailable", value: null, unit: "%", period: null, source: null, reason: "no_source" };
  }
  return {
    id: "hiring_flow",
    metric: "headcount_change_12m",
    status: "estimated",
    value: round1(((now.members - yearAgo.members) / yearAgo.members) * 100),
    unit: "%",
    period: now.period,
    extra: { headcount: now.members, headcount_prev: yearAgo.members, monthly_attrition: round1((now.lost / now.members) * 100) },
    source: source(now.period, checkedAt),
  };
}

/**
 * 업종 평균 연봉 추정 (만원). 같은 국민연금 업종코드, 가입 중인 법인, 가입자 10명 이상 사업장의 가입자 가중 평균.
 * 회사 자신은 뺀다. 표본이 30곳 미만이면 null (비교하기에 너무 적다).
 */
export function industryAverage(rows: NpsRow[], code: string, exclude: NpsRow): { avg: number; samples: number } | null {
  let notice = 0;
  let members = 0;
  let samples = 0;
  for (const r of rows) {
    if (r === exclude || !r.active || !r.corporate || r.industryCode !== code || r.members < 10) continue;
    notice += r.notice;
    members += r.members;
    samples += 1;
  }
  if (samples < 30 || members === 0) return null;
  const monthly = notice / members / contributionRate(exclude.period);
  return { avg: Math.round((monthly * 12) / 10000), samples };
}

/**
 * 보상 추정. 1인 평균 기준소득월액 x 12 (만원). 업종 평균과 같은 방법으로 계산해서 비교한다.
 * 기준소득월액은 상한에서 잘리므로, 평균이 상한의 90% 이상이면 실제보다 낮게 나온다 -> extra.near_cap = 1 ("이상"으로 표시)
 * 예: 월 616만 원 -> 연 7,392만 원, 상한 659만 원의 93% -> near_cap
 */
export function compensationIndicator(now: NpsRow | null, industry: { avg: number; samples: number } | null, checkedAt: string): IndicatorValue {
  const monthly = now ? monthlyIncome(now) : null;
  if (!now || monthly === null) {
    return { id: "compensation", metric: "avg_salary", status: "unavailable", value: null, unit: "만원", period: null, source: null, reason: "no_source" };
  }
  const extra: Record<string, number> = {};
  if (industry) {
    extra.industry_avg = industry.avg;
    extra.industry_samples = industry.samples;
  }
  if (monthly >= incomeCap(now.period) * 0.9) extra.near_cap = 1;
  return {
    id: "compensation",
    metric: "avg_salary",
    status: "estimated",
    value: Math.round((monthly * 12) / 10000),
    unit: "만원",
    period: now.period,
    extra,
    source: source(now.period, checkedAt),
  };
}
