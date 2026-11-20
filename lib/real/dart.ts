// OpenDART 응답을 지표 원시값으로 바꾸는 순수 함수. 네트워크는 부르지 않는다 (호출은 scripts/build-real-companies.mts).
// 사전 계산 스크립트와 테스트가 같이 쓴다. Node가 바로 실행할 수 있게 타입 import만 쓴다.
import type { IndicatorValue, Source } from "../types";

/** 단일회사 주요계정(fnlttSinglAcnt) 한 행 */
export interface DartAccountRow {
  fs_div: string; // OFS 별도, CFS 연결
  sj_div: string; // BS 재무상태표, IS 손익계산서
  account_nm: string;
  thstrm_amount: string; // 당기
  frmtrm_amount: string; // 전기
  rcept_no: string;
}

/** 직원 현황(empSttus) 한 행. 성별, 사업부문별로 나뉘어 온다 */
export interface DartEmployeeRow {
  sm: string; // 합계 인원
  avrg_cnwk_sdytrn: string; // 평균 근속 (예: "6년 4개월", "6.3")
  fyer_salary_totamt: string; // 연간 급여 총액 (원)
  rcept_no: string;
}

/** "2,680,861,279,732" -> 2680861279732, "-" 또는 빈 값 -> null */
export function parseAmount(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/,/g, "").trim());
  return s.trim() === "-" || !Number.isFinite(n) ? null : n;
}

/** "6년 4개월" -> 6.33, "6.3" -> 6.3, "8년" -> 8, 읽을 수 없으면 null */
export function parseTenure(s: string | undefined): number | null {
  if (!s) return null;
  const ym = /(\d+)\s*년(?:\s*(\d+)\s*개월)?/.exec(s);
  if (ym) return Number(ym[1]) + (ym[2] ? Number(ym[2]) / 12 : 0);
  const n = Number(s.trim());
  return Number.isFinite(n) && s.trim() !== "" ? n : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 공시 원문 링크. 예: dartViewerUrl("20260318001423") */
export function dartViewerUrl(rceptNo: string): string {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
}

/**
 * 계정 하나 찾기. 별도(OFS)를 먼저 쓰고 없으면 연결(CFS). 입사하는 법인 자체를 보기 위해 별도를 우선한다.
 * 국민연금(사업장 단위)과 직원 현황도 법인 단위라 기준을 맞춘다.
 */
function account(rows: DartAccountRow[], sj: string, names: string[]) {
  for (const fs of ["OFS", "CFS"]) {
    const r = rows.find((x) => x.fs_div === fs && x.sj_div === sj && names.includes(x.account_nm.trim()));
    if (r) return { cur: parseAmount(r.thstrm_amount), prev: parseAmount(r.frmtrm_amount), fs, rcept: r.rcept_no };
  }
  return null;
}

function fsLabel(fs: string): string {
  return fs === "OFS" ? "별도" : "연결";
}

function unavailable(id: IndicatorValue["id"], metric: string, unit: string): IndicatorValue {
  return { id, metric, status: "unavailable", value: null, unit, period: null, source: null, reason: "not_disclosed" };
}

/**
 * 재무 3지표 (일반 기업 기준표): 부채비율, 매출 증가율, 영업이익률.
 * 예: 부채 4,112,785 / 자본 7,477,584 -> 부채비율 55.0%
 *     매출 2,680,861 vs 전기 2,595,101 -> 매출 증가율 3.3%, 영업이익 440,242 -> 영업이익률 16.4%
 * 계정이 없으면 그 지표만 확인 불가(not_disclosed)
 */
export function financialIndicators(rows: DartAccountRow[], year: string, checkedAt: string): IndicatorValue[] {
  const debt = account(rows, "BS", ["부채총계"]);
  const equity = account(rows, "BS", ["자본총계"]);
  const revenue = account(rows, "IS", ["매출액", "수익(매출액)", "영업수익"]);
  const op = account(rows, "IS", ["영업이익", "영업이익(손실)"]);
  const src = (fs: string, rcept: string): Source => ({
    name: `OpenDART ${year} 사업보고서 (${fsLabel(fs)} 재무제표)`,
    url: dartViewerUrl(rcept),
    checkedAt,
  });
  const out: IndicatorValue[] = [];

  if (debt?.cur != null && equity?.cur && equity.cur > 0) {
    out.push({ id: "financial_health", metric: "debt_ratio", status: "ok", value: round1((debt.cur / equity.cur) * 100), unit: "%", period: year, source: src(debt.fs, debt.rcept) });
  } else out.push(unavailable("financial_health", "debt_ratio", "%"));

  if (revenue?.cur != null && revenue.prev) {
    out.push({ id: "growth", metric: "revenue_growth", status: "ok", value: round1(((revenue.cur - revenue.prev) / revenue.prev) * 100), unit: "%", period: year, source: src(revenue.fs, revenue.rcept) });
  } else out.push(unavailable("growth", "revenue_growth", "%"));

  if (op?.cur != null && revenue?.cur) {
    out.push({ id: "profitability", metric: "operating_margin", status: "ok", value: round1((op.cur / revenue.cur) * 100), unit: "%", period: year, source: src(op.fs, op.rcept) });
  } else out.push(unavailable("profitability", "operating_margin", "%"));

  return out;
}

/**
 * 재무 3지표 (스타트업 기준표): 런웨이, 매출 증가율, 영업이익(억원, 전년 같이).
 * 런웨이 = 현금및현금성자산 / (영업손실 / 12). 영업흑자면 소진이 없어 값 대신 extra.profitable = 1 (등급 A, 11/21 결정)
 * 예: 무신사 2025 영업이익 1,458억 원 (전년 1,124억 원) -> 흑자, 런웨이 제한 없음
 *     영업손실 120억 원, 현금 90억 원 -> 런웨이 9개월
 * cash: 전체 재무제표(fnlttSinglAcntAll)의 현금및현금성자산 (원). 없으면 null
 */
export function startupFinancials(rows: DartAccountRow[], cash: number | null, year: string, checkedAt: string): IndicatorValue[] {
  const general = financialIndicators(rows, year, checkedAt);
  const growth = general.find((g) => g.id === "growth")!;
  const op = account(rows, "IS", ["영업이익", "영업이익(손실)"]);
  const src = (fs: string, rcept: string): Source => ({
    name: `OpenDART ${year} 사업보고서 (${fsLabel(fs)} 재무제표)`,
    url: dartViewerUrl(rcept),
    checkedAt,
  });
  const eok = (won: number) => round1(won / 100_000_000);

  let runway: IndicatorValue = unavailable("financial_health", "runway_months", "개월");
  if (op?.cur != null && op.cur >= 0) {
    runway = { id: "financial_health", metric: "runway_months", status: "ok", value: null, unit: "개월", period: year, extra: { profitable: 1 }, source: src(op.fs, op.rcept) };
  } else if (op?.cur != null && cash !== null) {
    runway = { id: "financial_health", metric: "runway_months", status: "ok", value: round1(cash / (-op.cur / 12)), unit: "개월", period: year, source: src(op.fs, op.rcept) };
  }

  const profit: IndicatorValue =
    op?.cur != null
      ? {
          id: "profitability",
          metric: "operating_income",
          status: "ok",
          value: eok(op.cur),
          unit: "억원",
          period: year,
          ...(op.prev != null ? { extra: { prev: eok(op.prev) } } : {}),
          source: src(op.fs, op.rcept),
        }
      : unavailable("profitability", "operating_income", "억원");

  return [runway, growth, profit];
}

/**
 * 직원 현황에서 인원, 평균 근속(인원 가중), 1인 평균 급여(급여 총액 / 인원, 만원).
 * 예: 남 2,186명 6년 4개월, 여 1,736명 6년 3개월 -> 3,922명, 6.3년
 */
export function employeeSummary(rows: DartEmployeeRow[]) {
  let people = 0;
  let tenureSum = 0;
  let tenurePeople = 0;
  let salaryTotal = 0;
  for (const r of rows) {
    const n = parseAmount(r.sm) ?? 0;
    people += n;
    const t = parseTenure(r.avrg_cnwk_sdytrn);
    if (t !== null && n > 0) {
      tenureSum += t * n;
      tenurePeople += n;
    }
    salaryTotal += parseAmount(r.fyer_salary_totamt) ?? 0;
  }
  return {
    headcount: people,
    avgTenure: tenurePeople > 0 ? round1(tenureSum / tenurePeople) : null,
    avgSalaryManwon: people > 0 && salaryTotal > 0 ? Math.round(salaryTotal / people / 10000) : null,
    rceptNo: rows[0]?.rcept_no ?? null,
  };
}

/** 근속 지표. 직원 현황이 없으면 확인 불가 */
export function tenureIndicator(rows: DartEmployeeRow[], year: string, checkedAt: string): IndicatorValue {
  const s = employeeSummary(rows);
  if (s.avgTenure === null || !s.rceptNo) return unavailable("tenure", "avg_tenure", "년");
  return {
    id: "tenure",
    metric: "avg_tenure",
    status: "ok",
    value: s.avgTenure,
    unit: "년",
    period: year,
    extra: { headcount: s.headcount },
    source: { name: `OpenDART ${year} 사업보고서 (직원 현황)`, url: dartViewerUrl(s.rceptNo), checkedAt },
  };
}
