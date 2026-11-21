// 역량 매칭 테스트 (ISTQB 기법). 케이스 ID는 CMP-{영역}-{번호}.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { matchCompetencies, matchedIds, matchPhrase, normalizePhrase } from "@/lib/competencies";
import type { Competency } from "@/lib/data";

const file = path.resolve(import.meta.dirname, "../../data/competencies/competencies.json");
const dict = JSON.parse(readFileSync(file, "utf8")) as { roles: { role: string; competencies: Competency[] }[] };
const planning = dict.roles.find((r) => r.role === "서비스기획")!.competencies;

describe("표현 다듬기 (normalizePhrase)", () => {
  test.each([
    ["CMP-NRM-01", "화면설계서(스토리보드) 작성", "화면설계서스토리보드작성", "괄호와 공백 제거"],
    ["CMP-NRM-02", "SQL 활용", "sql활용", "영어 소문자"],
    ["CMP-NRM-03", "시장·경쟁사 분석", "시장경쟁사분석", "가운뎃점 제거"],
    ["CMP-NRM-04", "   ", "", "공백만 있으면 빈 문자열"],
    ["CMP-NRM-05", "", "", "빈 입력"],
  ])("%s %s -> %s (%s)", (id, input, expected, label) => {
    expect(normalizePhrase(input), `${id} ${label}`).toBe(expected);
  });
});

describe("한 표현 맞추기 (matchPhrase): 동등 분할과 경계값", () => {
  test("CMP-EX-01 사전 이름과 같으면 exact", () => {
    expect(matchPhrase("요구사항 정의", planning)).toMatchObject({ id: "requirements-definition", via: "exact" });
  });
  test("CMP-EX-02 유의어와 같으면 exact (띄어쓰기가 달라도)", () => {
    expect(matchPhrase("PRD작성", planning)).toMatchObject({ id: "spec-writing", via: "exact" });
  });
  test("CMP-CT-01 표현이 유의어를 포함하면 contains", () => {
    expect(matchPhrase("주간 KPI 설정 및 리포팅", planning)).toMatchObject({ id: "kpi-management", via: "contains" });
  });
  test("CMP-CT-02 가장 긴 일치를 고른다", () => {
    const m = matchPhrase("PRD 작성 및 화면설계서(스토리보드) 작성", planning);
    expect(m?.id).toBe("spec-writing");
    expect(m?.term).toContain("화면설계서");
  });
  test.each([
    ["CMP-MIN-01", "기획", "2글자 표현은 포함 비교에서 제외"],
    ["CMP-MIN-02", "분석", "2글자 표현"],
    ["CMP-MIN-03", "영상 편집", "사전에 없는 표현"],
  ])("%s %s는 맞추지 않는다 (%s)", (id, phrase, label) => {
    expect(matchPhrase(phrase, planning), `${id} ${label}`).toBeNull();
  });
  test("CMP-MIN-04 빈 표현은 null", () => {
    expect(matchPhrase("", planning)).toBeNull();
  });
});

describe("표현 목록 맞추기 (matchCompetencies)", () => {
  test("CMP-LST-01 맞은 것과 못 맞은 것을 나눠 모은다", () => {
    const r = matchCompetencies(["PRD 작성", "영상 편집"], planning);
    expect(r.matched.map((m) => m.id)).toEqual(["spec-writing"]);
    expect(r.unmatched).toEqual(["영상 편집"]);
  });
  test("CMP-LST-02 같은 표현은 띄어쓰기가 달라도 한 번만 센다", () => {
    expect(matchCompetencies(["PRD 작성", "PRD작성", "prd 작성"], planning).matched).toHaveLength(1);
  });
  test("CMP-LST-03 빈 문자열은 무시한다", () => {
    expect(matchCompetencies(["", "  "], planning)).toEqual({ matched: [], unmatched: [] });
  });
  test("CMP-LST-04 서로 다른 표현이 같은 역량이면 id는 한 번만", () => {
    const r = matchCompetencies(["PRD 작성", "정책서 작성"], planning);
    expect(r.matched).toHaveLength(2);
    expect(matchedIds(r)).toEqual(["spec-writing"]);
  });
  test("CMP-LST-05 빈 목록", () => {
    expect(matchCompetencies([], planning)).toEqual({ matched: [], unmatched: [] });
  });
});

describe("역량 사전 자체의 품질 (데이터 검증)", () => {
  test("CMP-DICT-01 직무 3개, 역량 합계 52개", () => {
    expect(dict.roles.map((r) => r.role)).toEqual(["서비스기획", "마케팅", "운영"]);
    expect(dict.roles.reduce((n, r) => n + r.competencies.length, 0)).toBe(53);
  });
  test("CMP-DICT-02 모든 이름과 유의어는 자기 역량으로 돌아온다 (직무마다)", () => {
    for (const role of dict.roles) {
      for (const c of role.competencies) {
        for (const term of [c.name, ...c.synonyms]) {
          expect(matchPhrase(term, role.competencies)?.id, `${role.role}: ${term}`).toBe(c.id);
        }
      }
    }
  });
  test("CMP-DICT-03 한 직무 안에서 이름이나 유의어가 다른 역량과 겹치지 않는다", () => {
    for (const role of dict.roles) {
      const seen = new Map<string, string>();
      for (const c of role.competencies) {
        for (const term of [c.name, ...c.synonyms]) {
          const k = normalizePhrase(term);
          expect(seen.get(k) ?? c.id, `${role.role}: "${term}"`).toBe(c.id);
          seen.set(k, c.id);
        }
      }
    }
  });
});
