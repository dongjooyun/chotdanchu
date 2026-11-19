// 역량 매칭 테스트. 실행: npm test
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { matchCompetencies, matchedIds, matchPhrase, normalizePhrase } from "@/lib/competencies";
import type { Competency } from "@/lib/data";

const dict = JSON.parse(readFileSync(new URL("../data/competencies/competencies.json", import.meta.url), "utf8")) as {
  roles: { role: string; competencies: Competency[] }[];
};
const planning = dict.roles.find((r) => r.role === "서비스기획")!.competencies;

test("비교용 다듬기: 공백, 괄호, 가운뎃점을 지우고 소문자로", () => {
  assert.equal(normalizePhrase("화면설계서(스토리보드) 작성"), "화면설계서스토리보드작성");
  assert.equal(normalizePhrase("SQL 활용"), "sql활용");
  assert.equal(normalizePhrase("시장·경쟁사 분석"), "시장경쟁사분석");
});

test("이름이나 유의어와 같으면 exact", () => {
  const m = matchPhrase("PRD작성", planning);
  assert.equal(m?.id, "spec-writing");
  assert.equal(m?.via, "exact");
  assert.equal(matchPhrase("요구사항 정의", planning)?.via, "exact");
});

test("한쪽이 다른 쪽을 포함하면 contains, 짧은 말로는 맞추지 않는다", () => {
  const m = matchPhrase("주간 KPI 설정 및 리포팅", planning);
  assert.equal(m?.id, "kpi-management");
  assert.equal(m?.via, "contains");
  assert.equal(matchPhrase("기획", planning), null);
});

test("사전에 없는 표현은 unmatched로 모이고, 같은 표현은 한 번만 센다", () => {
  const r = matchCompetencies(["PRD 작성", "PRD작성", "정책서 작성", "영상 편집", "  "], planning);
  assert.deepEqual(r.unmatched, ["영상 편집"]);
  assert.equal(r.matched.length, 2);
  assert.deepEqual(matchedIds(r), ["spec-writing"]);
});

test("사전의 모든 이름과 유의어는 자기 역량으로 돌아온다", () => {
  for (const role of dict.roles) {
    for (const c of role.competencies) {
      for (const term of [c.name, ...c.synonyms]) {
        assert.equal(matchPhrase(term, role.competencies)?.id, c.id, `${role.role}: ${term}`);
      }
    }
  }
});
