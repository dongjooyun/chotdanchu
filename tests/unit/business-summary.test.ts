// "하는 일 세 줄 요약" 테스트 (CDC-26). 케이스 ID: BS-*
// 기법: EP 동등 분할, BVA 경계값(수치 없는 문장 개수 0/2/3/4), EG 오류 추정(빈 문단, 소수점), 규칙(숫자와 새 문장을 만들지 않음), 캐시
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSummaryCache,
  getBusinessSummary,
  hasNumber,
  splitSentences,
  summarizeOverview,
  type SummaryStore,
} from "@/lib/business-summary";
import { mockCompanies } from "@/lib/data";
import type { Company } from "@/lib/types";
import { makeCompany } from "./helpers";

const SRC = { name: "OpenDART 사업보고서 (테스트)", url: "", checkedAt: "2026-11-22" };

function withOverview(text: string | null, over: Partial<Company> = {}): Company {
  const c = makeCompany("general", []);
  return { ...c, ...over, ...(text === null ? {} : { businessOverview: { text, source: SRC } }) };
}

beforeEach(() => clearSummaryCache());

describe("BS-01~06 문장 나누기와 수치 문장 제외", () => {
  it("BS-01 마침표 뒤 공백과 줄바꿈에서 문장을 나눈다", () => {
    expect(splitSentences("A입니다. B입니다.\nC입니다")).toEqual(["A입니다.", "B입니다.", "C입니다"]);
  });

  it("BS-02 소수점은 문장을 자르지 않고, 숫자가 든 문장으로 센다 (EG)", () => {
    const s = splitSentences("비중은 3.5배입니다. 고객은 제조사입니다.");
    expect(s).toEqual(["비중은 3.5배입니다.", "고객은 제조사입니다."]);
    expect(s.map(hasNumber)).toEqual([true, false]);
  });

  it("BS-03 숫자 판별: 아라비아 숫자, 전각 숫자, 퍼센트는 수치, 일반 문장은 수치 아님 (EP)", () => {
    expect(hasNumber("비중은 62%입니다")).toBe(true);
    expect(hasNumber("제품이 ３개 있습니다")).toBe(true);
    expect(hasNumber("매출의 삼십 퍼센트입니다")).toBe(true);
    expect(hasNumber("주요 고객은 제조사입니다")).toBe(false);
  });

  it("BS-04 숫자가 든 문장은 요약에서 빠진다", () => {
    const lines = summarizeOverview("가입니다. 나는 62%입니다. 다입니다. 라입니다.");
    expect(lines).toEqual(["가입니다.", "다입니다.", "라입니다."]);
    expect(lines.some(hasNumber)).toBe(false);
  });

  it("BS-05 같은 문장이 두 번 나와도 한 번만 쓴다", () => {
    expect(summarizeOverview("가입니다. 가입니다. 나입니다.")).toEqual(["가입니다.", "나입니다."]);
  });

  it("BS-06 빈 문단, 공백, 줄바꿈만 있는 문단은 빈 배열 (EG)", () => {
    expect(summarizeOverview("")).toEqual([]);
    expect(summarizeOverview("   \n  ")).toEqual([]);
  });
});

describe("BS-07 경계값: 수치 없는 문장의 개수 (BVA)", () => {
  const cases: [string, number, number][] = [
    ["0개 (모두 숫자 문장)", 0, 0],
    ["2개 (3줄 바로 아래)", 2, 2],
    ["3개 (정확히 3줄)", 3, 3],
    ["4개 (3줄 바로 위, 앞에서 3개)", 4, 3],
  ];
  for (const [name, n, expected] of cases) {
    it(`수치 없는 문장 ${name} -> ${expected}줄`, () => {
      const text = [...Array.from({ length: n }, (_, i) => `문장${"가나다라"[i]}입니다.`), "숫자 7개가 있습니다."].join(" ");
      expect(summarizeOverview(text)).toHaveLength(expected);
    });
  }

  it("4개일 때는 문단 앞쪽 3개를 순서대로 쓴다", () => {
    expect(summarizeOverview("가입니다. 나입니다. 다입니다. 라입니다.")).toEqual(["가입니다.", "나입니다.", "다입니다."]);
  });
});

describe("BS-08~10 목업 기업 (data/mock)", () => {
  it("BS-08 사업의 개요가 있는 상장 5곳은 3줄 요약과 가상 링크 자리가 나온다", () => {
    const listed = mockCompanies.filter((c) => c.businessOverview);
    expect(listed.map((c) => c.id)).toEqual(["mock-026", "mock-027", "mock-028", "mock-029", "mock-030"]);
    for (const c of listed) {
      const r = getBusinessSummary(c, "mock");
      expect(r.status).toBe("ok");
      if (r.status !== "ok") continue;
      expect(r.lines).toHaveLength(3);
      expect(r.method).toBe("rule");
      expect(r.source.url).toBe(""); // 목업은 가상 링크
      expect(r.source.name).toContain("목업");
    }
  });

  it("BS-09 요약 줄은 원문 문단의 문장 그대로이고 숫자가 없다 (규칙: 새 문장과 숫자를 만들지 않음)", () => {
    for (const c of mockCompanies.filter((x) => x.businessOverview)) {
      const r = getBusinessSummary(c, "mock");
      if (r.status !== "ok") throw new Error("요약이 있어야 함");
      const original = c.businessOverview!.text;
      for (const line of r.lines) {
        expect(original).toContain(line);
        expect(hasNumber(line)).toBe(false);
      }
    }
  });

  it("BS-10 사업보고서가 없는 나머지 25곳은 공시 없음이다", () => {
    const none = mockCompanies.filter((c) => !c.businessOverview);
    expect(none).toHaveLength(25);
    for (const c of none) expect(getBusinessSummary(c, "mock")).toEqual({ status: "no_report" });
  });

  it("BS-11 개요 문단이 있어도 쓸 수 있는 문장이 없으면 공시 없음이 아니라 확인 불가 (EG)", () => {
    const c = withOverview("숫자 1개만 있습니다. 숫자 2개만 있습니다.");
    expect(getBusinessSummary(c, "mock")).toEqual({ status: "unavailable", reason: "fetch_failed" });
  });
});

describe("BS-12~14 실데이터: 사전 계산 결과 읽기", () => {
  const store: SummaryStore = {
    "00000001": { status: "ok", lines: ["가입니다.", "나입니다.", "다입니다."], source: SRC, method: "llm" },
    "00000002": { status: "no_report", checkedAt: "2026-11-22" },
  };
  const live = (corpCode: string | null) => withOverview(null, { id: corpCode ?? "manual-x", corpCode });

  it("BS-12 저장된 요약은 그대로 보여 주고, 사업보고서 없음은 공시 없음이다", () => {
    expect(getBusinessSummary(live("00000001"), "live", { store })).toEqual({
      status: "ok",
      lines: ["가입니다.", "나입니다.", "다입니다."],
      source: SRC,
      method: "llm",
    });
    expect(getBusinessSummary(live("00000002"), "live", { store })).toEqual({ status: "no_report" });
  });

  it("BS-13 아직 계산하지 않은 기업은 공시 없음이 아니라 확인 불가(not_computed)로 구분된다", () => {
    expect(getBusinessSummary(live("00000003"), "live", { store })).toEqual({ status: "unavailable", reason: "not_computed" });
  });

  it("BS-14 고유번호가 없는 기업도 확인 불가 (EG)", () => {
    expect(getBusinessSummary(live(null), "live", { store })).toEqual({ status: "unavailable", reason: "not_computed" });
  });

  it("BS-15 실데이터 모드는 기업의 목업용 businessOverview를 읽지 않는다", () => {
    const c = withOverview("가입니다. 나입니다. 다입니다.", { id: "00000009", corpCode: "00000009" });
    expect(getBusinessSummary(c, "live", { store })).toEqual({ status: "unavailable", reason: "not_computed" });
  });
});

describe("BS-16~18 캐시: 같은 기업은 두 번 계산하지 않는다", () => {
  it("BS-16 같은 기업을 두 번 불러도 요약 계산은 한 번", () => {
    const summarize = vi.fn(summarizeOverview);
    const c = withOverview("가입니다. 나입니다. 다입니다.", { id: "mock-x" });
    const a = getBusinessSummary(c, "mock", { summarize });
    const b = getBusinessSummary(c, "mock", { summarize });
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it("BS-17 다른 기업은 따로 계산하고, 모드가 다르면 캐시를 섞지 않는다", () => {
    const summarize = vi.fn(summarizeOverview);
    const c1 = withOverview("가입니다. 나입니다. 다입니다.", { id: "mock-a" });
    const c2 = withOverview("라입니다. 마입니다. 바입니다.", { id: "mock-b" });
    getBusinessSummary(c1, "mock", { summarize });
    getBusinessSummary(c2, "mock", { summarize });
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(getBusinessSummary(c1, "live", {})).toEqual({ status: "unavailable", reason: "not_computed" });
  });

  it("BS-18 계산하지 못한 상태(확인 불가)는 캐시하지 않아서 나중에 채워지면 바뀐다", () => {
    const c = withOverview(null, { id: "00000005", corpCode: "00000005" });
    expect(getBusinessSummary(c, "live", { store: {} })).toEqual({ status: "unavailable", reason: "not_computed" });
    const store: SummaryStore = { "00000005": { status: "no_report", checkedAt: "2026-11-22" } };
    expect(getBusinessSummary(c, "live", { store })).toEqual({ status: "no_report" });
  });
});
