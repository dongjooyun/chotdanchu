// 지표 등급 계산 테스트. 실행: npm test
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeIndicators, gradeDistribution, monthsBetween, rndBand } from "@/lib/indicators";
import type { Company, IndicatorValue } from "@/lib/types";

const ASOF = new Date(2026, 10, 20); // 2026-11-20
const companies = JSON.parse(readFileSync(new URL("../data/mock/companies.json", import.meta.url), "utf8")) as Company[];

function company(nature: Company["nature"], indicators: IndicatorValue[], industryCode = "62010"): Company {
  return {
    id: "t", corpCode: null, bizRegNo: null, bizRegNoSource: null, name: "테스트", ceoName: "-", address: "-",
    industry: "-", industryCode, foundedOn: null, disclosure: "audited", nature, natureBasis: "-",
    certifications: [], indicators, externalLinks: [], isMock: true,
  };
}

function ok(id: IndicatorValue["id"], metric: string, value: number | null, more: Partial<IndicatorValue> = {}): IndicatorValue {
  return { id, metric, status: "ok", value, unit: "%", period: "2025", source: null, ...more };
}

function gradeOf(c: Company, id: string) {
  return computeIndicators(c, ASOF).find((g) => g.id === id)?.grade;
}

test("부채비율 경계값은 위쪽 구간: 99.9 A, 100 B, 300 C", () => {
  assert.equal(gradeOf(company("general", [ok("financial_health", "debt_ratio", 99.9)]), "financial_health"), "A");
  assert.equal(gradeOf(company("general", [ok("financial_health", "debt_ratio", 100)]), "financial_health"), "B");
  assert.equal(gradeOf(company("general", [ok("financial_health", "debt_ratio", 300)]), "financial_health"), "C");
});

test("매출 증가율: 일반 15% A, 스타트업은 50%부터 A", () => {
  assert.equal(gradeOf(company("general", [ok("growth", "revenue_growth", 15)]), "growth"), "A");
  assert.equal(gradeOf(company("startup", [ok("growth", "revenue_growth", 15)]), "growth"), "B");
  assert.equal(gradeOf(company("startup", [ok("growth", "revenue_growth", -1)]), "growth"), "C");
});

test("스타트업 수익성은 방향을 본다", () => {
  const op = (v: number, prev?: number) =>
    gradeOf(company("startup", [ok("profitability", "operating_income", v, prev === undefined ? {} : { extra: { prev } })]), "profitability");
  assert.equal(op(1, -10), "A");
  assert.equal(op(-20, -47.8), "B");
  assert.equal(op(-50, -47.8), "C");
  assert.equal(op(-20), null); // 전년 값이 없으면 판단하지 않는다
});

test("고용 흐름: 일반은 연 퇴사율, 스타트업은 월 퇴사율", () => {
  const hiring = (nature: Company["nature"], v: number, extra: Record<string, number>) =>
    gradeOf(company(nature, [ok("hiring_flow", "headcount_change_12m", v, { status: "estimated", extra })]), "hiring_flow");
  assert.equal(hiring("general", 8, { annual_attrition: 14 }), "A");
  assert.equal(hiring("general", 8, { annual_attrition: 25 }), "B");
  assert.equal(hiring("general", -10, { annual_attrition: 10 }), "C");
  assert.equal(hiring("startup", 5, { monthly_attrition: 3 }), "A");
  assert.equal(hiring("startup", 5, { monthly_attrition: 4.6 }), "B");
  assert.equal(hiring("startup", 5, { monthly_attrition: 5.1 }), "C");
  assert.equal(hiring("startup", -1, { monthly_attrition: 1 }), "C");
});

test("보상: 범위 가운데값을 업종 평균과 비교", () => {
  const pay = (range: [number, number], avg: number) =>
    gradeOf(company("general", [ok("compensation", "avg_salary", null, { status: "estimated", range, unit: "만원", extra: { industry_avg: avg } })]), "compensation");
  assert.equal(pay([5420, 6110], 5100), "A"); // 가운데 5765, +13%
  assert.equal(pay([5200, 5860], 5200), "B"); // 가운데 5530, +6.3%
  assert.equal(pay([3890, 4380], 4800), "C"); // 가운데 4135, -13.9%
});

test("기술 투자: KSIC로 업종 구간을 정한다", () => {
  assert.equal(rndBand("58222"), "tech");
  assert.equal(rndBand("26110"), "tech");
  assert.equal(rndBand("26212"), "advanced");
  assert.equal(rndBand("20423"), "advanced");
  assert.equal(rndBand("24111"), "traditional");
  assert.equal(rndBand("47912"), "service");
  assert.equal(rndBand(null), "service");
  const rnd = (v: number, ksic: string) => gradeOf(company("general", [ok("tech_investment", "rnd_ratio", v)], ksic), "tech_investment");
  assert.equal(rnd(16, "26110"), "B");
  assert.equal(rnd(20, "26110"), "A");
  assert.equal(rnd(0.5, "24111"), "C");
});

test("투자 단계: 금액 조건과 18개월 조건", () => {
  const fund = (label: string, value: number, period: string) =>
    gradeOf(company("startup", [ok("funding_stage", "cumulative_funding", value, { label, period, unit: "억원" })]), "funding_stage");
  assert.equal(monthsBetween("2025-05", ASOF), 18);
  assert.equal(fund("Series B", 208.6, "2025-12"), "A");
  assert.equal(fund("Series A", 61.4, "2025-04"), "B"); // 19개월 전
  assert.equal(fund("Seed", 4.3, "2023-05"), "C");
  // 일반 기업은 데이터가 있든 없든 등급 없음이고, 확인 불가 이유를 붙이지 않는다
  const general = computeIndicators(company("general", [ok("funding_stage", "cumulative_funding", 500, { label: "Series C", period: "2026-01" })]), ASOF);
  assert.equal(general.find((g) => g.id === "funding_stage")?.grade, null);
  assert.equal(general.find((g) => g.id === "funding_stage")?.reason, undefined);
  const missing = computeIndicators(company("general", [{ id: "funding_stage", metric: "cumulative_funding", status: "unavailable", value: null, unit: "억원", period: null, source: null, reason: "no_source" }]), ASOF);
  assert.equal(missing.find((g) => g.id === "funding_stage")?.display, "등급 없음");
  assert.equal(missing.find((g) => g.id === "funding_stage")?.reason, undefined);
});

test("확인 불가는 이유를 그대로 넘기고, 없는 지표는 no_source로 채운다", () => {
  const c = company("startup", [{ id: "tenure", metric: "avg_tenure", status: "unavailable", value: null, unit: "년", period: null, source: null, reason: "not_disclosed" }]);
  const graded = computeIndicators(c, ASOF);
  assert.equal(graded.length, 10);
  assert.equal(graded.find((g) => g.id === "tenure")?.reason, "not_disclosed");
  assert.equal(graded.find((g) => g.id === "growth")?.reason, "no_source");
});

test("정보 투명도: 일반 기업은 투자 단계를 빼고 8개 중에서 센다", () => {
  const general = companies.find((c) => c.nature === "general" && c.disclosure === "listed");
  assert.ok(general);
  const t = computeIndicators(general, ASOF).find((g) => g.id === "transparency");
  assert.match(t?.display ?? "", /^지표 8개 중 \d개 확인$/);
});

test("목업 30곳 모두 10개 등급이 나오고, 등급은 원시값이 있을 때만 붙는다", () => {
  assert.equal(companies.length, 30);
  for (const c of companies) {
    const graded = computeIndicators(c, ASOF);
    assert.equal(graded.length, 10, c.id);
    for (const g of graded) {
      if (g.id === "transparency") continue;
      const raw = c.indicators.find((i) => i.id === g.id);
      if (!raw || raw.status === "unavailable") assert.equal(g.grade, null, `${c.id} ${g.id}`);
      if (g.grade === null && !(c.nature === "general" && g.id === "funding_stage")) assert.ok(g.reason, `${c.id} ${g.id} 이유 없음`);
    }
    const d = gradeDistribution(graded, c.nature);
    assert.equal(d.A + d.B + d.C + d.none, c.nature === "general" ? 8 : 9, c.id);
  }
});
