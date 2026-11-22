// 밸런스 게임(PRD 02) 단위 테스트. 케이스 ID는 MAT-{번호}. 기법: 동등 분할(고르는 성향별), 경계값(0판, 7판), 결정성 검사.
import { describe, expect, test } from "vitest";
import { cardNo, logoOf, monogram } from "@/lib/brand";
import {
  comparisons,
  currentPair,
  featureDiff,
  MATCHUP_CARDS,
  MATCHUP_ROUNDS,
  preferenceFromPicks,
} from "@/lib/matchup";
import { checkSentence, typeSentence } from "@/lib/preference-sentence";
import { addAnalysis, EMPTY_SESSION, personalizedCount, saveReport } from "@/lib/session";
import { SAMPLE_REPORT_CARD } from "@/lib/samples";
import type { Grade, IndicatorId, MatchupCard } from "@/lib/types";

const score = (c: MatchupCard, id: IndicatorId) => {
  const g = c.grades[id];
  return g && g !== "unavailable" ? { A: 2, B: 1, C: 0 }[g as Grade] : -1;
};

/** 매 판 chooser가 고른 쪽으로 7판을 끝까지 둔다 */
function play(chooser: (a: MatchupCard, b: MatchupCard) => MatchupCard): string[] {
  const picks: string[] = [];
  for (let pair = currentPair(picks); pair; pair = currentPair(picks)) picks.push(chooser(pair[0], pair[1]).id);
  return picks;
}

const byIndicator = (id: IndicatorId) => (a: MatchupCard, b: MatchupCard) => (score(b, id) > score(a, id) ? b : a);

describe("밸런스 게임 대진과 선호 계산", () => {
  test("MAT-01 8강 4판, 4강 2판, 결승 1판으로 7판에 끝나고, 8강은 매 판 다른 유형끼리 붙는다", () => {
    const picks = play((a) => a);
    expect(picks).toHaveLength(MATCHUP_ROUNDS);
    expect(currentPair(picks)).toBeNull();
    for (let k = 0; k < 4; k++) {
      const [a, b] = currentPair(picks.slice(0, k))!;
      expect(a.archetype).not.toBe(b.archetype);
    }
    expect(MATCHUP_CARDS).toHaveLength(8);
  });

  test("MAT-02 같은 선택이면 항상 같은 결과가 나온다", () => {
    const picks = play(byIndicator("growth"));
    expect(preferenceFromPicks(picks)).toEqual(preferenceFromPicks([...picks]));
  });

  test("MAT-03 지표 10개 중요도는 모두 양수이고 합이 1이다", () => {
    for (const id of ["growth", "financial_health", "compensation"] as IndicatorId[]) {
      const w = preferenceFromPicks(play(byIndicator(id))).weights;
      expect(Object.keys(w)).toHaveLength(10);
      expect(Object.values(w).every((x) => x > 0)).toBe(true);
      expect(Object.values(w).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    }
  });

  test("MAT-04 성장성이 높은 쪽만 고르면 자율·개척 지향이고 성장성이 중시 지표 3개에 든다", () => {
    const p = preferenceFromPicks(play(byIndicator("growth")));
    expect(p.type).toBe("autonomy_pioneer");
    expect(p.topIndicators).toContain("growth");
    expect(p.topIndicators).toHaveLength(3);
  });

  test("MAT-05 재무 체력이 높은 쪽만 고르면 안정·시스템 지향이다", () => {
    expect(preferenceFromPicks(play(byIndicator("financial_health"))).type).toBe("stable_system");
  });

  test("MAT-06 보상이 높은 쪽만 고르면 밸런스·실속 지향이다", () => {
    expect(preferenceFromPicks(play(byIndicator("compensation"))).type).toBe("balance_practical");
  });

  test("MAT-07 확인 불가인 지표는 그 판의 계산에서 빠진다 (차이 0)", () => {
    const [stable, pioneer] = [MATCHUP_CARDS[0], MATCHUP_CARDS[1]];
    const d = featureDiff(stable, pioneer);
    // 지표 순서: 재무, 성장, 고용, 보상, 근속(pioneer 확인 불가), 투자 단계(stable 확인 불가)
    expect(d).toEqual([1, -1, -0.5, 0.5, 0, 0]);
  });

  test("MAT-08 대진에 없는 카드 id가 오면 거기서 계산을 멈춘다", () => {
    expect(comparisons(["card-1", "card-99", "card-5"])).toHaveLength(1);
  });

  test("MAT-09 0판(아무것도 안 고름)이면 모든 지표가 같은 비중이다", () => {
    const w = preferenceFromPicks([]).weights;
    for (const v of Object.values(w)) expect(v).toBeCloseTo(0.1, 10);
  });

  test("MAT-10 유형 설명 문장에는 숫자가 없고, 숫자나 em dash가 든 LLM 문장은 버린다", () => {
    const p = preferenceFromPicks(play(byIndicator("growth")));
    const s = typeSentence(p);
    expect(s).not.toMatch(/[0-9]/);
    expect(checkSentence(s)).toBe(true);
    expect(checkSentence("성장성을 30% 더 중시해요.")).toBe(false);
    expect(checkSentence("성장 지향 — 빠른 회사")).toBe(false);
    expect(checkSentence("")).toBe(false);
  });
});

describe("카드 표시와 모음 저장", () => {
  test("BRD-01 카드 번호는 OpenDART 고유번호 8자리, 이니셜은 법인 표기를 뺀 두 글자", () => {
    expect(cardNo("00258801")).toBe("00258801");
    expect(cardNo("mock-001")).toBe("00000001");
    expect(monogram("(주)카카오")).toBe("카카");
    expect(monogram("주식회사 청솔기계")).toBe("청솔");
    expect(monogram("별하늘랩스(주)")).toBe("별하");
  });

  test("BRD-02 로고는 시연 기업 4곳만 있고, 폐업한 동명 카카오 법인에는 쓰지 않는다", () => {
    expect(logoOf("00258801")).toBe("/logos/00258801.webp");
    expect(logoOf("00918444")).toBeNull();
    expect(logoOf("mock-001")).toBeNull();
  });

  test("SES-01 같은 기업은 한 장으로 합치고 직무별 리포트를 남긴다. 맞춤 판정 수를 센다", () => {
    const base = { companyId: "00258801", name: "(주)카카오", analyzedAt: "2026-11-21T00:00:00.000Z", log: [] };
    let s = saveReport(EMPTY_SESSION, base, "마케팅", { ...SAMPLE_REPORT_CARD, role: "마케팅" }, true);
    s = saveReport(s, base, "운영", { ...SAMPLE_REPORT_CARD, role: "운영" }, false);
    expect(s.analyzed).toHaveLength(1);
    expect(Object.keys(s.analyzed[0].reports ?? {})).toEqual(["마케팅", "운영"]);
    expect(s.analyzed[0].lastRole).toBe("운영");
    expect(personalizedCount(s)).toBe(1);
    // 기록만 다시 넣어도 저장한 리포트는 남는다
    s = addAnalysis(s, { ...base, label: null });
    expect(personalizedCount(s)).toBe(1);
  });
});
