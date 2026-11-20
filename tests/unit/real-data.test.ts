// 실데이터 변환 테스트. 케이스 ID는 REAL-{번호}.
// 고정 파일(tests/fixtures/real)은 카카오 2025 사업보고서의 OpenDART 응답을 그대로 줄인 것이다. 테스트는 API를 부르지 않는다.
import { describe, expect, test } from "vitest";
import kakaoFin from "../fixtures/real/kakao-2025-fin.json";
import kakaoEmp from "../fixtures/real/kakao-2025-emp.json";
import realCompanies from "@/data/real/companies.json";
import { assembleCompany, riskIndicator, shortAddress } from "@/lib/real/assemble";
import { employeeSummary, financialIndicators, parseTenure, tenureIndicator } from "@/lib/real/dart";
import { compensationIndicator, hiringIndicator, industryAverage, matchRow, monthlyIncome, parseNpsLine, splitCsv, type NpsRow } from "@/lib/real/nps";
import { computeIndicators } from "@/lib/indicators";
import type { Company } from "@/lib/types";

const D = "2026-11-20";

function nps(over: Partial<NpsRow>): NpsRow {
  return {
    period: "2026-09", name: "주식회사 카카오", bizPrefix: "120814", active: true, corporate: true,
    industryCode: "642003", industryName: "데이터베이스 및 온라인 정보 제공업",
    members: 3788, notice: 2_216_917_060, acquired: 58, lost: 55, ...over,
  };
}

describe("OpenDART 변환", () => {
  test("REAL-01 카카오 2025 별도 재무: 부채비율 55.0%, 매출 증가율 3.3%, 영업이익률 16.4% (공시 원본과 손 계산 일치)", () => {
    const f = financialIndicators(kakaoFin, "2025", D);
    expect(f.map((x) => [x.metric, x.value])).toEqual([
      ["debt_ratio", 55],
      ["revenue_growth", 3.3],
      ["operating_margin", 16.4],
    ]);
    expect(f.every((x) => x.source?.name.includes("별도") && x.source.url.includes("20260318001423"))).toBe(true);
  });

  test("REAL-02 계정이 없으면 그 지표만 확인 불가 (지어내지 않는다)", () => {
    const noDebt = kakaoFin.filter((r) => r.account_nm !== "부채총계");
    const f = financialIndicators(noDebt, "2025", D);
    expect(f[0]).toMatchObject({ status: "unavailable", value: null, reason: "not_disclosed" });
    expect(f[1].status).toBe("ok");
  });

  test("REAL-03 직원 현황: 남녀 합 3,922명, 근속은 인원 가중 6.3년", () => {
    expect(employeeSummary(kakaoEmp).headcount).toBe(3922);
    expect(tenureIndicator(kakaoEmp, "2025", D)).toMatchObject({ value: 6.3, unit: "년", status: "ok" });
  });

  test("REAL-04 근속 문구 읽기 (EG)", () => {
    expect(parseTenure("6년 4개월")).toBeCloseTo(6.333, 2);
    expect(parseTenure("8년")).toBe(8);
    expect(parseTenure("6.3")).toBe(6.3);
    expect(parseTenure("-")).toBeNull();
    expect(parseTenure("")).toBeNull();
  });
});

describe("국민연금 변환", () => {
  test("REAL-05 CSV 줄 읽기: 따옴표 안 쉼표는 나누지 않고, 머리줄은 건너뛴다", () => {
    expect(splitCsv('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(parseNpsLine("자료생성년월,사업장명,사업자등록번호")).toBeNull();
    const line = "2026-09,주식회사 카카오,120814,1,63309,주소,제주특별자치도 제주시 첨단로,1,1,50,110,0,1,642003,데이터베이스 및 온라인 정보 제공업,1995-02-16,,,3788,2216917060,58,55";
    expect(parseNpsLine(line)).toMatchObject({ name: "주식회사 카카오", bizPrefix: "120814", members: 3788, lost: 55 });
  });

  test("REAL-06 앞 6자리가 같은 다른 회사는 이름으로 걸러낸다", () => {
    const rows = [nps({}), nps({ name: "케이지스틸 주식회사", members: 1576 }), nps({ name: "(주)카카오", active: false })];
    expect(matchRow(rows, "120814", "카카오")?.members).toBe(3788);
    expect(matchRow(rows, "120814", "없는회사")).toBeNull();
  });

  test("REAL-07 고용 흐름: 3,885명 -> 3,788명 = -2.5%, 월 상실률 1.5%", () => {
    const h = hiringIndicator(nps({}), nps({ period: "2025-09", members: 3885 }), D);
    expect(h).toMatchObject({ value: -2.5, status: "estimated", period: "2026-09" });
    expect(h.extra?.monthly_attrition).toBe(1.5);
  });

  test("REAL-08 12개월 전 행이 없으면 고용 흐름은 확인 불가", () => {
    expect(hiringIndicator(nps({}), null, D)).toMatchObject({ status: "unavailable", reason: "no_source" });
  });

  test("REAL-09 보상 추정: 2026년 보험료율 9.5%로 거꾸로 계산, 상한(659만 원)의 90% 이상이면 near_cap", () => {
    expect(monthlyIncome(nps({}))! / 10000).toBeCloseTo(616.05, 1);
    const c = compensationIndicator(nps({}), { avg: 4794, samples: 693 }, D);
    expect(c).toMatchObject({ value: 7393, status: "estimated" });
    expect(c.extra).toMatchObject({ industry_avg: 4794, near_cap: 1 });
    // 2025년은 9%: 같은 고지금액이면 소득이 더 높게 나온다
    expect(monthlyIncome(nps({ period: "2025-09" }))!).toBeGreaterThan(monthlyIncome(nps({}))!);
  });

  test("REAL-10 업종 평균: 표본이 30곳 미만이면 비교하지 않는다", () => {
    const self = nps({});
    const peers = Array.from({ length: 29 }, () => nps({ name: "다른 회사", members: 50, notice: 20_000_000 }));
    expect(industryAverage([self, ...peers], "642003", self)).toBeNull();
    const more = [...peers, nps({ name: "하나 더", members: 50, notice: 20_000_000 })];
    expect(industryAverage([self, ...more], "642003", self)?.samples).toBe(30);
  });
});

describe("리스크와 조립", () => {
  const ntsSrc = { name: "국세청", url: "https://www.data.go.kr", checkedAt: D };

  test("REAL-11 리스크: 폐업이면 해당, 계속사업자이고 감사의견 적정이면 해당 없음, 둘 다 모르면 확인 불가", () => {
    expect(riskIndicator("03", [], { nts: ntsSrc, audit: null }).label).toBe("해당");
    expect(riskIndicator("01", ["적정의견"], { nts: ntsSrc, audit: null }).label).toBe("해당 없음");
    expect(riskIndicator("01", ["한정의견"], { nts: ntsSrc, audit: null }).label).toBe("경미");
    expect(riskIndicator(null, [], { nts: null, audit: null }).status).toBe("unavailable");
  });

  test("REAL-12 주소는 시·구까지만", () => {
    expect(shortAddress("제주특별자치도 제주시 첨단로 242")).toBe("제주 제주시");
    expect(shortAddress("서울특별시 강남구 역삼동")).toBe("서울 강남구");
  });

  test("REAL-13 조립한 카드에는 대표자 이름이 없고, 지표 9개가 목업과 같은 순서다", () => {
    const c = assembleCompany({
      target: { corpCode: "00258801", nature: "general", natureBasis: "상장" },
      profile: { corp_name: "(주)카카오", corp_cls: "Y", adres: "제주특별자치도 제주시 첨단로 242", induty_code: "63120", est_dt: "19950216", bizr_no: "1208147521" },
      financials: financialIndicators(kakaoFin, "2025", D),
      tenure: tenureIndicator(kakaoEmp, "2025", D),
      hiring: hiringIndicator(nps({}), nps({ period: "2025-09", members: 3885 }), D),
      compensation: compensationIndicator(nps({}), { avg: 4794, samples: 693 }, D),
      risk: riskIndicator("01", ["적정의견"], { nts: ntsSrc, audit: null }),
      npsIndustry: "데이터베이스 및 온라인 정보 제공업",
      manual: [],
      checkedAt: D,
    });
    expect(c.ceoName).toBe("");
    expect(c.disclosure).toBe("listed");
    expect(c.name).toBe("주식회사 카카오");
    expect(c.indicators.map((i) => i.id)).toEqual([
      "financial_health", "growth", "profitability", "hiring_flow", "compensation", "tenure", "tech_investment", "funding_stage", "risk",
    ]);
  });
});

describe("사전 계산 결과 (data/real/companies.json)", () => {
  const companies = realCompanies as unknown as Company[];

  test("REAL-14 카카오는 동명 법인 2곳이고 설립연도와 소재지로 구별된다", () => {
    const kakao = companies.filter((c) => c.name === "주식회사 카카오");
    expect(kakao).toHaveLength(2);
    expect(new Set(kakao.map((c) => `${c.address} ${c.foundedOn}`)).size).toBe(2);
  });

  test("REAL-15 저장한 원시값으로 등급을 다시 계산하면 늘 같다 (등급은 파일에 없다)", () => {
    for (const c of companies) {
      expect(JSON.stringify(c)).not.toMatch(/"grade"/);
      expect(computeIndicators(c, new Date(D))).toEqual(computeIndicators(c, new Date(D)));
    }
  });

  test("REAL-16 실데이터에는 대표자 이름과 목업 표시가 없다", () => {
    for (const c of companies) {
      expect(c.ceoName).toBe("");
      expect(c.isMock).toBe(false);
      for (const i of c.indicators) if (i.status === "unavailable") expect(i.reason).toBeTruthy();
    }
  });
});
