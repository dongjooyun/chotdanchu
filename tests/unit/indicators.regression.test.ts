// 회귀 테스트: 목업 기업 30곳의 등급 분포를 지금 동작 그대로 고정한다.
// 기준표나 계산 코드를 바꾸면 여기가 먼저 깨져서 "무엇이 바뀌었는지"를 보여 준다.
// 바꾼 것이 의도한 것이면 아래 표를 새 값으로 고친다 (이 값은 정답이 아니라 현재 동작의 기록이다).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { computeIndicators, gradeDistribution } from "@/lib/indicators";
import type { Company } from "@/lib/types";
import { ASOF } from "./helpers";

const file = path.resolve(import.meta.dirname, "../../data/mock/companies.json");
const companies = JSON.parse(readFileSync(file, "utf8")) as Company[];

// [기업 id, A, B, C, 확인 불가, 정보 투명도 등급, 확인된 개수]
const GOLDEN: [string, number, number, number, number, string, number][] = [
  ["mock-001", 3, 2, 0, 4, "B", 5], ["mock-002", 4, 0, 1, 4, "B", 5], ["mock-003", 2, 0, 2, 5, "B", 4],
  ["mock-004", 3, 2, 0, 4, "B", 5], ["mock-005", 3, 2, 0, 4, "B", 5], ["mock-006", 4, 1, 0, 4, "B", 5],
  ["mock-007", 2, 1, 1, 5, "B", 4], ["mock-008", 1, 2, 2, 4, "B", 5], ["mock-009", 1, 2, 0, 6, "C", 3],
  ["mock-010", 1, 0, 4, 4, "B", 5], ["mock-011", 3, 1, 1, 4, "B", 5], ["mock-012", 1, 0, 3, 5, "B", 4],
  ["mock-013", 6, 2, 0, 1, "A", 8], ["mock-014", 1, 5, 2, 1, "A", 8], ["mock-015", 2, 2, 4, 1, "A", 8],
  ["mock-016", 4, 2, 2, 1, "A", 8], ["mock-017", 1, 1, 1, 5, "C", 3], ["mock-018", 1, 2, 0, 5, "C", 3],
  ["mock-019", 0, 0, 3, 5, "C", 3], ["mock-020", 4, 2, 0, 2, "B", 6], ["mock-021", 2, 2, 2, 2, "B", 6],
  ["mock-022", 2, 4, 0, 2, "B", 6], ["mock-023", 4, 1, 1, 2, "B", 6], ["mock-024", 1, 1, 4, 2, "B", 6],
  ["mock-025", 0, 4, 2, 2, "B", 6], ["mock-026", 7, 1, 0, 0, "A", 8], ["mock-027", 3, 2, 3, 0, "A", 8],
  ["mock-028", 1, 5, 2, 0, "A", 8], ["mock-029", 4, 1, 3, 0, "A", 8], ["mock-030", 6, 1, 1, 0, "A", 8],
];

describe("목업 30곳 회귀", () => {
  test("REG-00 기준 표가 30곳 전부를 덮는다", () => {
    expect(GOLDEN.map((g) => g[0])).toEqual(companies.map((c) => c.id));
  });

  test.each(GOLDEN)("REG %s: A %i · B %i · C %i · 확인 불가 %i, 투명도 %s (%i개 확인)", (id, a, b, c, none, tGrade, found) => {
    const company = companies.find((x) => x.id === id)!;
    const graded = computeIndicators(company, ASOF);
    expect(gradeDistribution(graded, company.nature)).toEqual({ A: a, B: b, C: c, none });
    const t = graded.find((g) => g.id === "transparency")!;
    expect(t.grade).toBe(tGrade);
    expect(t.display).toContain(`${found}개 확인`);
  });

  test("REG-31 등급은 원시값이 있을 때만 붙고, 값이 없으면 이유가 항상 있다", () => {
    for (const company of companies) {
      for (const g of computeIndicators(company, ASOF)) {
        if (g.id === "transparency") continue;
        const raw = company.indicators.find((i) => i.id === g.id);
        const noGradeByDesign = company.nature === "general" && g.id === "funding_stage";
        if (!raw || raw.status === "unavailable") expect(g.grade, `${company.id} ${g.id}`).toBeNull();
        if (g.grade === null && !noGradeByDesign) expect(g.reason, `${company.id} ${g.id} 이유`).toBeDefined();
      }
    }
  });
});
