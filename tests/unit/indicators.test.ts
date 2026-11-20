// 지표 등급 계산 테스트 (ISTQB 기법). 설계 방식과 추적표는 docs/testing.md.
//  EP  동등 분할: 같은 등급이 나올 구간마다 대표값 하나
//  BVA 경계값 분석: 임계값의 바로 아래, 정확히 그 값, 바로 위 (3점)
//  DT  결정 테이블: 조건이 둘 이상 겹칠 때 조합마다 하나
//  EG  오류 추정: 데이터가 비었거나 이상할 때
// 케이스 ID는 IND-{기준표 행}-{번호}. 기준표 행은 criteria-registry.ts에 있다.
import { describe, expect, test } from "vitest";
import { computeIndicators, INDICATOR_ORDER, monthsBetween, rndBand } from "@/lib/indicators";
import type { CompanyNature, Grade, IndicatorId, IndicatorValue, UnavailableReason } from "@/lib/types";
import { CRITERIA } from "./criteria-registry";
import { ASOF, makeCompany, missing, val } from "./helpers";

type Technique = "EP" | "BVA" | "DT" | "EG";

interface Case {
  id: string;
  criterion: string;
  technique: Technique;
  /** 입력과 기대를 한 줄로. 테스트 이름에 그대로 보인다 */
  title: string;
  nature: CompanyNature;
  indicators: IndicatorValue[];
  industryCode?: string;
  target: IndicatorId;
  grade: Grade | null;
  reason?: UnavailableReason;
  /** 등급을 어떤 기준으로 매겼는지(근거 문구)에 들어 있어야 하는 말 */
  basis?: RegExp;
}

const cases: Case[] = [];

/**
 * 기준표 한 행의 케이스를 한꺼번에 만든다.
 * rows: [기법, 입력, 기대 등급, 설명(선택)]
 */
function table<I>(
  key: string,
  nature: CompanyNature,
  target: IndicatorId,
  basis: RegExp,
  build: (input: I) => IndicatorValue[],
  label: (input: I) => string,
  rows: [Technique, I, Grade | null, string?][],
  industryCode?: string,
) {
  rows.forEach(([technique, input, grade, note], i) => {
    cases.push({
      id: `IND-${key}-${String(i + 1).padStart(2, "0")}`,
      criterion: key,
      technique,
      title: `${label(input)} -> ${grade ?? "등급 없음"}${note ? ` (${note})` : ""}`,
      nature,
      indicators: build(input),
      industryCode,
      target,
      grade,
      basis: grade === null ? undefined : basis,
    });
  });
}

// ---------- 재무 체력 ----------
table("FH-G", "general", "financial_health", /부채비율 100% 미만 A/, (v: number) => [val("financial_health", "debt_ratio", v)], (v) => `부채비율 ${v}%`, [
  ["EP", 50, "A"], ["BVA", 99.99, "A", "100% 바로 아래"], ["BVA", 100, "B", "경계는 위쪽 등급"], ["BVA", 100.01, "B"],
  ["EP", 200, "B"], ["BVA", 299.99, "B"], ["BVA", 300, "C", "경계는 위쪽 등급"], ["BVA", 300.01, "C"], ["EP", 500, "C"],
]);
table("FH-S", "startup", "financial_health", /런웨이 18개월 이상 A/, (v: number) => [val("financial_health", "runway_months", v, { unit: "개월" })], (v) => `런웨이 ${v}개월`, [
  ["EP", 6, "C"], ["BVA", 11.99, "C"], ["BVA", 12, "B"], ["BVA", 12.01, "B"],
  ["EP", 15, "B"], ["BVA", 17.99, "B"], ["BVA", 18, "A"], ["BVA", 18.01, "A"], ["EP", 24, "A"],
]);
// 흑자 스타트업: 런웨이 값이 없어도(소진 없음) A (11/21 결정)
cases.push({
  id: "IND-FH-S-10",
  criterion: "FH-S",
  technique: "EP",
  title: "영업흑자라 런웨이 값 없음 (extra.profitable) -> A",
  nature: "startup",
  indicators: [{ ...val("financial_health", "runway_months", 0, { unit: "개월" }), value: null, extra: { profitable: 1 } }],
  target: "financial_health",
  grade: "A",
  basis: /영업흑자라 현금을 소진하지 않음/,
});

// ---------- 성장성 ----------
table("GR-G", "general", "growth", /15%/, (v: number) => [val("growth", "revenue_growth", v)], (v) => `매출 증가율 ${v}%`, [
  ["EP", -20, "C"], ["BVA", -0.01, "C"], ["BVA", 0, "B"], ["BVA", 0.01, "B"],
  ["EP", 8, "B"], ["BVA", 14.99, "B"], ["BVA", 15, "A"], ["BVA", 15.01, "A"], ["EP", 40, "A"],
]);
table("GR-S", "startup", "growth", /50%/, (v: number) => [val("growth", "revenue_growth", v)], (v) => `매출 증가율 ${v}%`, [
  ["EP", -20, "C"], ["BVA", -0.01, "C"], ["BVA", 0, "B"], ["BVA", 0.01, "B"],
  ["EP", 25, "B"], ["BVA", 49.99, "B"], ["BVA", 50, "A"], ["BVA", 50.01, "A"], ["EP", 120, "A"],
]);

// ---------- 수익성 ----------
table("PF-G", "general", "profitability", /영업이익률 7% 이상 A/, (v: number) => [val("profitability", "operating_margin", v)], (v) => `영업이익률 ${v}%`, [
  ["EP", -5, "C"], ["BVA", 2.99, "C"], ["BVA", 3, "B"], ["BVA", 3.01, "B"],
  ["EP", 5, "B"], ["BVA", 6.99, "B"], ["BVA", 7, "A"], ["BVA", 7.01, "A"], ["EP", 12, "A"],
]);
table("PF-S", "startup", "profitability", /영업흑자 A/, ([v, prev]: [number, number?]) => [
  val("profitability", "operating_income", v, { unit: "억원", extra: prev === undefined ? undefined : { prev } }),
], ([v, prev]) => `영업이익 ${v}억, 전년 ${prev ?? "없음"}`, [
  ["EP", [12, -3], "A", "흑자"], ["BVA", [0, -10], "A", "손익분기는 흑자로 침"], ["BVA", [-0.01, -10], "B", "적자지만 줄어듦"],
  ["EP", [-5, -47.8], "B", "적자폭 축소"], ["BVA", [-9.99, -10], "B"], ["BVA", [-10, -10], "C", "전년과 같으면 축소가 아님"],
  ["BVA", [-10.01, -10], "C", "적자폭 확대"], ["EP", [-60, -47.8], "C"],
]);

// ---------- 고용 흐름 (결정 테이블) ----------
type Hire = { v: number; a?: number };
table("HR-G", "general", "hiring_flow", /연 퇴사율 20% 이하면 A/, ({ v, a }: Hire) => [
  val("hiring_flow", "headcount_change_12m", v, { status: "estimated", extra: a === undefined ? {} : { annual_attrition: a } }),
], ({ v, a }) => `12개월 증감 ${v}%, 연 퇴사율 ${a ?? "없음"}`, [
  ["DT", { v: 8, a: 14 }, "A", "순증, 퇴사율 낮음"], ["BVA", { v: 8, a: 20 }, "A", "퇴사율 20% 이하 경계"], ["BVA", { v: 8, a: 20.01 }, "B"],
  ["BVA", { v: 0.01, a: 10 }, "A", "순증의 경계"], ["BVA", { v: 0, a: 10 }, "B", "증감 0은 순증이 아님"],
  ["BVA", { v: -9.99, a: 10 }, "B"], ["BVA", { v: -10, a: 10 }, "C", "10% 감소 경계"], ["BVA", { v: -10.01, a: 10 }, "C"],
  ["DT", { v: 8 }, "B", "퇴사율을 모르면 A를 못 받음"], ["DT", { v: -10 }, "C", "퇴사율을 몰라도 급감이면 C"],
]);
table("HR-S", "startup", "hiring_flow", /월 퇴사율 3% 이하면 A/, ({ v, a }: Hire) => [
  val("hiring_flow", "headcount_change_12m", v, { status: "estimated", extra: a === undefined ? {} : { monthly_attrition: a } }),
], ({ v, a }) => `12개월 증감 ${v}%, 월 퇴사율 ${a ?? "없음"}`, [
  ["DT", { v: 5, a: 3 }, "A", "월 퇴사율 3% 이하 경계"], ["BVA", { v: 5, a: 3.01 }, "B"], ["BVA", { v: 5, a: 5 }, "B", "5% 초과가 아님"],
  ["BVA", { v: 5, a: 5.01 }, "C", "월 퇴사율 5% 초과"], ["BVA", { v: 0.01, a: 3 }, "A"], ["BVA", { v: 0, a: 1 }, "B"],
  ["BVA", { v: -0.01, a: 1 }, "C", "인원 감소"], ["DT", { v: 5 }, "B", "퇴사율을 모르면 A를 못 받음"], ["DT", { v: -1 }, "C"],
]);

// ---------- 보상: 업종 평균 1000만 원 기준, 범위 가운데값을 비교 ----------
table("CP", "general", "compensation", /업종 평균/, (mid: number) => [
  val("compensation", "avg_salary", null, { status: "estimated", unit: "만원", range: [mid - 10, mid + 10], extra: { industry_avg: 1000 } }),
], (mid) => `가운데값 ${mid}만원 (업종 평균 1000만원, ${((mid - 1000) / 10).toFixed(2)}%)`, [
  ["EP", 1300, "A"], ["BVA", 1100, "A", "정확히 +10%"], ["BVA", 1099.9, "B", "+10% 바로 아래"],
  ["EP", 1000, "B"], ["BVA", 900.1, "B", "-10% 바로 위"], ["BVA", 900, "C", "정확히 -10%"], ["EP", 700, "C"],
]);

// ---------- 근속 ----------
table("TN", "general", "tenure", /평균 근속 10년 이상 A/, (v: number) => [val("tenure", "avg_tenure", v, { unit: "년" })], (v) => `평균 근속 ${v}년`, [
  ["EP", 2, "C"], ["BVA", 4.99, "C"], ["BVA", 5, "B"], ["BVA", 5.01, "B"],
  ["EP", 7, "B"], ["BVA", 9.99, "B"], ["BVA", 10, "A"], ["BVA", 10.01, "A"], ["EP", 15, "A"],
]);

// ---------- 기술 투자: 일반 기업은 업종 구간마다 적정 R&D 비율이 다르다 ----------
const rnd = (v: number) => [val("tech_investment", "rnd_ratio", v)];
const rndLabel = (v: number) => `R&D ${v}%`;
table("TI-G", "general", "tech_investment", /기술 집약 업종 적정 R&D 10~20%/, rnd, rndLabel, [
  ["EP", 25, "A"], ["BVA", 20, "A", "상한 경계"], ["BVA", 19.99, "B"], ["BVA", 10, "B", "하한 경계"], ["BVA", 9.99, "C"], ["EP", 3, "C"],
], "58222");
const rndAdvanced = cases.length;
table("TI-G-ADV", "general", "tech_investment", /첨단 제조 업종 적정 R&D 5~10%/, rnd, rndLabel, [
  ["BVA", 10, "A"], ["BVA", 9.99, "B"], ["BVA", 5, "B"], ["BVA", 4.99, "C"],
], "26212");
table("TI-G-TRD", "general", "tech_investment", /전통 제조·장치 업종 적정 R&D 1~3%/, rnd, rndLabel, [
  ["BVA", 3, "A"], ["BVA", 2.99, "B"], ["BVA", 1, "B"], ["BVA", 0.99, "C"],
], "24111");
table("TI-G-SVC", "general", "tech_investment", /서비스·금융·유틸리티 업종 적정 R&D 0.1~1%/, rnd, rndLabel, [
  ["BVA", 1, "A"], ["BVA", 0.99, "B"], ["BVA", 0.1, "B"], ["BVA", 0.09, "C"],
], "47912");
// 업종 구간 케이스는 같은 기준표 행(TI-G)에 묶어 추적한다
for (const c of cases.slice(rndAdvanced)) c.criterion = "TI-G";
table("TI-S", "startup", "tech_investment", /등록 특허 3건 이상 A/, (v: number) => [val("tech_investment", "registered_patents", v, { unit: "건" })], (v) => `등록 특허 ${v}건`, [
  ["BVA", 0, "C"], ["BVA", 1, "B"], ["BVA", 2, "B"], ["BVA", 3, "A", "경계"], ["EP", 8, "A"],
]);

// ---------- 투자 단계 (결정 테이블: 금액 조건 x 최근 18개월 조건) ----------
type Fund = { round: string; amount: number; period: string | null };
table("FS-S", "startup", "funding_stage", /Series A 누적 30억 원 이상/, ({ round, amount, period }: Fund) => [
  val("funding_stage", "cumulative_funding", amount, { label: round, period, unit: "억원" }),
], ({ round, amount, period }) => `${round} 누적 ${amount}억, 최근 투자 ${period ?? "시점 모름"}`, [
  ["DT", { round: "Series A", amount: 30, period: "2025-05" }, "A", "금액 경계 + 정확히 18개월"],
  ["BVA", { round: "Series A", amount: 29.99, period: "2025-05" }, "B", "금액만 모자람"],
  ["BVA", { round: "Series A", amount: 30, period: "2025-04" }, "B", "19개월이라 오래됨"],
  ["DT", { round: "Series A", amount: 29.99, period: "2025-04" }, "C", "둘 다 미충족"],
  ["DT", { round: "Series B", amount: 100, period: "2026-06" }, "A", "Series B는 100억 기준"],
  ["BVA", { round: "Series B", amount: 99.99, period: "2026-06" }, "B"],
  ["DT", { round: "Series C", amount: 250, period: "2023-01" }, "B", "금액만 충족"],
  ["DT", { round: "Seed", amount: 4.3, period: "2026-06" }, "B", "Seed는 금액 조건이 없어 최근성만"],
  ["DT", { round: "Seed", amount: 4.3, period: "2023-05" }, "C"],
  ["DT", { round: "Series B", amount: 150, period: null }, "B", "투자 시점을 모르면 최근성 미충족"],
]);
table("FS-G", "general", "funding_stage", /등급 없음/, () => [val("funding_stage", "cumulative_funding", 500, { label: "Series C", period: "2026-01", unit: "억원" })], () => "일반 기업은 투자 데이터가 있어도", [
  ["EP", null, null],
]);
cases[cases.length - 1].basis = /등급 없음/;

// ---------- 리스크 ----------
table("RK", "general", "risk", /해당 없음 A/, (label: string) => [val("risk", "risk_flags", null, { label, unit: "" })], (l) => `위험 신호 "${l}"`, [
  ["EP", "해당 없음", "A"], ["EP", "경미", "B"], ["EP", "해당", "C"],
]);

// ---------- 정보 투명도: 나머지 지표 중 확인된 개수 ----------
function withFound(nature: CompanyNature, found: number): IndicatorValue[] {
  const good: IndicatorValue[] = [
    nature === "startup" ? val("financial_health", "runway_months", 20, { unit: "개월" }) : val("financial_health", "debt_ratio", 50),
    val("growth", "revenue_growth", 60),
    nature === "startup" ? val("profitability", "operating_income", 1, { unit: "억원" }) : val("profitability", "operating_margin", 8),
    val("hiring_flow", "headcount_change_12m", 5, { status: "estimated", extra: { annual_attrition: 10, monthly_attrition: 2 } }),
    val("compensation", "avg_salary", null, { status: "estimated", range: [1090, 1110], extra: { industry_avg: 1000 } }),
    val("tenure", "avg_tenure", 12, { unit: "년" }),
    nature === "startup" ? val("tech_investment", "registered_patents", 3, { unit: "건" }) : val("tech_investment", "rnd_ratio", 15),
    val("risk", "risk_flags", null, { label: "해당 없음", unit: "" }),
    val("funding_stage", "cumulative_funding", 150, { label: "Series B", period: "2026-06", unit: "억원" }),
  ];
  const pool = nature === "general" ? good.filter((x) => x.id !== "funding_stage") : good;
  const ids = pool.map((x) => x.id);
  const unknown = ids.slice(found).map((id) => missing(id, "x", "not_disclosed"));
  return [...pool.slice(0, found), ...unknown];
}
const trRows: [Technique, number, Grade][] = [["EP", 9, "A"], ["BVA", 7, "A"], ["BVA", 6, "B"], ["BVA", 4, "B"], ["BVA", 3, "C"], ["EP", 0, "C"]];
table("TR", "startup", "transparency", /확인된 지표 7개 이상 A/, (n: number) => withFound("startup", n), (n) => `스타트업 9개 중 ${n}개 확인`, trRows);
const generalRows: [Technique, number, Grade][] = [["EP", 8, "A"], ["BVA", 7, "A"], ["BVA", 6, "B"], ["BVA", 4, "B"], ["BVA", 3, "C"]];
generalRows.forEach(([technique, n, grade], i) => {
  cases.push({
    id: `IND-TR-${String(trRows.length + i + 1).padStart(2, "0")}`,
    criterion: "TR",
    technique,
    title: `일반 기업 8개 중 ${n}개 확인 -> ${grade} (투자 단계는 세지 않음)`,
    nature: "general",
    indicators: withFound("general", n),
    target: "transparency",
    grade,
    basis: /확인된 지표 7개 이상 A/,
  });
});

// ---------- 오류 추정: 확인 불가와 빠진 값 ----------
const eg = (n: number, title: string, c: Omit<Case, "id" | "criterion" | "technique" | "title">) =>
  cases.push({ id: `IND-EG-${String(n).padStart(2, "0")}`, criterion: "EG", technique: "EG", title, ...c });
eg(1, "공시 의무 없음은 이유 그대로 not_disclosed", { nature: "startup", indicators: [missing("growth", "revenue_growth", "not_disclosed")], target: "growth", grade: null, reason: "not_disclosed" });
eg(2, "가져올 출처 없음은 no_source", { nature: "startup", indicators: [missing("compensation", "avg_salary", "no_source")], target: "compensation", grade: null, reason: "no_source" });
eg(3, "조회 실패는 fetch_failed", { nature: "general", indicators: [missing("tenure", "avg_tenure", "fetch_failed")], target: "tenure", grade: null, reason: "fetch_failed" });
eg(4, "데이터에 지표 자체가 없으면 확인 불가(no_source)로 채움", { nature: "general", indicators: [], target: "risk", grade: null, reason: "no_source" });
eg(5, "상태는 ok인데 값이 비어 있으면 확인 불가(fetch_failed)", { nature: "general", indicators: [val("growth", "revenue_growth", null)], target: "growth", grade: null, reason: "fetch_failed" });
eg(6, "업종 평균이 없으면 보상을 비교할 수 없음", {
  nature: "general",
  indicators: [val("compensation", "avg_salary", 4000, { status: "estimated", unit: "만원" })],
  target: "compensation", grade: null, reason: "no_source",
});
eg(7, "스타트업 적자인데 전년 값이 없으면 방향을 알 수 없음", {
  nature: "startup",
  indicators: [val("profitability", "operating_income", -20, { unit: "억원" })],
  target: "profitability", grade: null, reason: "no_source", basis: /전년/,
});
eg(8, "일반 기업의 투자 단계는 확인 불가로 세지 않음(이유 없음)", {
  nature: "general",
  indicators: [missing("funding_stage", "cumulative_funding", "no_source")],
  target: "funding_stage", grade: null,
});

// ======================================================================

function gradedOf(c: Case) {
  const company = makeCompany(c.nature, c.indicators, c.industryCode);
  return computeIndicators(company, ASOF).find((g) => g.id === c.target)!;
}

describe("등급 산출: 기준표 행마다 케이스 (근거 문구 포함)", () => {
  test.each(cases)("$id [$criterion/$technique] $title", (c) => {
    const g = gradedOf(c);
    expect(g.grade).toBe(c.grade);
    if (c.reason) expect(g.reason).toBe(c.reason);
    else if (c.grade !== null || c.target === "funding_stage") expect(g.reason).toBeUndefined();
    expect(g.basis.length).toBeGreaterThan(0);
    if (c.basis) expect(g.basis).toMatch(c.basis);
  });
});

describe("추적성: 기준표의 모든 행에 테스트가 있다", () => {
  test("IND-TRACE-01 모든 케이스는 등록된 기준표 행에 속하고, ID가 겹치지 않는다", () => {
    const keys = new Set(CRITERIA.map((x) => x.key));
    for (const c of cases) expect(keys.has(c.criterion), `${c.id}의 행 ${c.criterion}이 registry에 없음`).toBe(true);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  test.each(CRITERIA)("IND-TRACE-02 $key $row: 케이스 있음, 경계값(BVA) $minBva개 이상", (row) => {
    if (row.external) return; // 업종 구간(KSIC)은 아래 별도 describe에서 12개 케이스로 검증
    const mine = cases.filter((c) => c.criterion === row.key);
    expect(mine.length, `${row.row}에 케이스가 없음`).toBeGreaterThan(0);
    expect(mine.filter((c) => c.technique === "BVA").length).toBeGreaterThanOrEqual(row.minBva);
  });

  test("IND-TRACE-03 구간형 기준(재무, 성장, 수익, 근속, 기술)은 A, B, C 세 등급이 모두 검증된다", () => {
    for (const key of ["FH-G", "FH-S", "GR-G", "GR-S", "PF-G", "PF-S", "CP", "TN", "TI-G", "TI-S", "HR-G", "HR-S", "TR"]) {
      const grades = new Set(cases.filter((c) => c.criterion === key).map((c) => c.grade));
      for (const g of ["A", "B", "C"]) expect(grades.has(g as Grade), `${key}에 ${g} 케이스가 없음`).toBe(true);
    }
  });
});

describe("업종 구간 (KSIC): 동등 분할", () => {
  test.each([
    ["IND-KSIC-01", "58222", "응용 소프트웨어", "tech"],
    ["IND-KSIC-02", "62010", "컴퓨터 프로그래밍", "tech"],
    ["IND-KSIC-03", "63120", "포털·정보매개", "tech"],
    ["IND-KSIC-04", "21210", "완제 의약품", "tech"],
    ["IND-KSIC-05", "26110", "전자집적회로(시스템 반도체)", "tech"],
    ["IND-KSIC-06", "26212", "액정 표시장치", "advanced"],
    ["IND-KSIC-07", "20423", "화장품(뷰티 테크)", "advanced"],
    ["IND-KSIC-08", "24111", "제철", "traditional"],
    ["IND-KSIC-09", "30399", "자동차 부품", "traditional"],
    ["IND-KSIC-10", "47912", "전자상거래 소매", "service"],
    ["IND-KSIC-11", "66199", "금융 지원 서비스", "service"],
    ["IND-KSIC-12", null, "코드 없음", "service"],
  ] as const)("%s KSIC %s (%s) -> %s", (id, code, name, band) => {
    expect(rndBand(code), `${id} ${name}`).toBe(band);
  });
});

describe("투자 단계의 개월 계산 (경계값)", () => {
  test.each([
    ["IND-MON-01", "2025-05", 18],
    ["IND-MON-02", "2025-04", 19],
    ["IND-MON-03", "2026-11", 0],
    ["IND-MON-04", "2025-12", 11],
  ])("%s %s -> %i개월 전", (id, period, months) => {
    expect(monthsBetween(period, ASOF), id).toBe(months);
  });
  test("IND-MON-05 형식이 틀리면 null", () => {
    expect(monthsBetween("작년", ASOF)).toBeNull();
  });
});

describe("출력 형태 (모든 입력에 공통)", () => {
  test("IND-SHAPE-01 항상 10개, 정해진 순서, 정보 투명도가 맨 끝", () => {
    const out = computeIndicators(makeCompany("startup", []), ASOF);
    expect(out.map((g) => g.id)).toEqual(INDICATOR_ORDER);
    expect(out.at(-1)?.id).toBe("transparency");
  });
  test("IND-SHAPE-02 같은 입력이면 같은 결과 (결정적)", () => {
    const c = makeCompany("startup", withFound("startup", 5));
    expect(computeIndicators(c, ASOF)).toEqual(computeIndicators(c, ASOF));
  });
  test("IND-SHAPE-03 등급이 나온 칸에는 어느 기준으로 매겼는지 근거가 항상 있다", () => {
    for (const nature of ["startup", "general"] as const) {
      for (const g of computeIndicators(makeCompany(nature, withFound(nature, 9)), ASOF)) {
        expect(g.basis.length, `${nature} ${g.id}`).toBeGreaterThan(5);
      }
    }
  });
});
