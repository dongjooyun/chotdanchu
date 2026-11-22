// 리포트 카드 초안 테스트. 케이스 ID는 RPT-{번호}.
// 11/20 사용자 시나리오에서 나온 버그: 직무를 바꿔도, 회사를 바꿔도 리포트 카드가 늘 같은 예시(하늘커머스, 서비스기획)였다.
import { describe, expect, test } from "vitest";
import { findMockCandidates } from "@/lib/data";
import { computeIndicators } from "@/lib/indicators";
import { buildReportDraft } from "@/lib/report-draft";
import { skippedPreference } from "@/lib/session";
import { INDICATOR_LABELS, type Role } from "@/lib/types";

function draft(name: string, role: Role, index = 0) {
  const company = findMockCandidates(name)[index];
  const graded = computeIndicators(company);
  return buildReportDraft({
    company,
    graded,
    role,
    preference: skippedPreference(),
    log: [],
    checkedAt: "2026-11-20",
    mode: "mock",
  });
}

describe("리포트 카드 초안", () => {
  test("RPT-01 회사 이름과 직무가 지금 보는 것과 같다 (예시 하늘커머스가 아니다)", () => {
    const d = draft("별하늘랩스", "마케팅");
    expect(d.companyName).toBe("별하늘랩스(주)");
    expect(d.role).toBe("마케팅");
    expect(JSON.stringify(d)).not.toContain("하늘커머스");
  });

  test("RPT-02 직무를 바꾸면 면접 질문의 직무도 바뀌고, 다른 직무 이름이 남지 않는다", () => {
    for (const [role, other] of [
      ["마케팅", "서비스기획"],
      ["서비스기획", "마케팅"],
      ["운영", "기획자"],
    ] as const) {
      const d = draft("별하늘랩스", role);
      expect(d.interviewQuestions.every((q) => q.includes(role))).toBe(true);
      expect(d.interviewQuestions.join(" ")).not.toContain(other);
    }
  });

  test("RPT-03 뒷면 지표 등급은 기업 카드 계산과 같다", () => {
    const company = findMockCandidates("청솔기계")[0];
    const graded = computeIndicators(company);
    const d = draft("청솔기계", "운영");
    expect(d.grades).toEqual(graded.map((g) => ({ id: g.id, grade: g.grade })));
    expect(d.typeLabel).toMatch(/·/);
  });

  test("RPT-04 확인 불가 지표마다 면접 질문이 하나씩 있고, 3년차 공고의 공백 역량 질문이 최대 2개 붙는다", () => {
    const company = findMockCandidates("별하늘랩스")[0];
    const unavailable = computeIndicators(company).filter((g) => g.grade === null && g.reason !== undefined);
    expect(unavailable.length).toBeGreaterThan(0);
    const d = draft("별하늘랩스", "마케팅");
    const missing = Math.min(d.gap!.missing, 2);
    expect(d.interviewQuestions).toHaveLength(unavailable.length + missing);
    for (const g of unavailable) expect(d.interviewQuestions.some((q) => q.startsWith(INDICATOR_LABELS[g.id]))).toBe(true);
  });

  test("RPT-05 목업 기업은 가상 공고와 비교하고, 출처에 가상 공고라고 적는다 (링크 없음)", () => {
    const d = draft("별하늘랩스", "마케팅");
    expect(d.fitLabel).not.toBeNull();
    expect(d.gap).not.toBeNull();
    expect(d.careerSource).toContain("가상 공고");
    expect(d.careerUrl).toBeUndefined();
  });

  test("RPT-06 밸런스 게임을 건너뛰면 성향은 비고 중시한 지표도 없다", () => {
    const d = draft("별하늘랩스", "마케팅");
    expect(d.preferenceType).toBeNull();
    expect(d.topIndicators).toEqual([]);
  });

  test("RPT-08 폐업한 회사는 면접 질문을 만들지 않고 고정 안내만 둔다", () => {
    const base = findMockCandidates("별하늘랩스")[0];
    const closed = {
      ...base,
      indicators: base.indicators.map((i) => (i.id === "risk" ? { ...i, label: "해당", extra: { closed: 1 } } : i)),
    };
    const d = buildReportDraft({
      company: closed,
      graded: computeIndicators(closed),
      role: "마케팅",
      preference: skippedPreference(),
      log: [],
      checkedAt: "2026-11-21",
      mode: "mock",
    });
    expect(d.interviewQuestions).toEqual([]);
    expect(d.notice).toContain("폐업");
    expect(d.fitLabel).toBeNull();
    expect(d.gap).toBeNull();
    // 영업 중인 회사는 그대로 질문이 있다
    expect(draft("별하늘랩스", "마케팅").notice).toBeUndefined();
  });

  test("RPT-07 같은 이름의 다른 회사는 다른 카드가 된다", () => {
    const a = draft("몽돌커머스", "마케팅", 0);
    const b = draft("몽돌커머스", "마케팅", 1);
    expect(a.grades).not.toEqual(b.grades);
  });
});
