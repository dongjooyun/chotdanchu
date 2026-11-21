// 최종 판단 리포트 (CDC-16) 테스트. 역량 갭은 GAP-{번호}, 판정 라벨은 FIT-{번호}.
// 설계: 라벨 표는 결정 테이블(두 축 x 높음·낮음 + 정보 보강), 기준값은 경계값 분석(기반 0.75, 이어짐 0.6의 바로 위·아래)으로 고른다 (docs/testing.md).
import { describe, expect, test } from "vitest";
import { classifyRequirement, computeCareerGap, connectRatio, gapDetail } from "@/lib/career-gap";
import { realCompanies } from "@/lib/data";
import { BASE_THRESHOLD, CONNECT_THRESHOLD, baseScore, decideFit, equalWeights } from "@/lib/fit-label";
import { computeIndicators } from "@/lib/indicators";
import { preferenceFromPicks } from "@/lib/matchup";
import { buildReportDraft, careerMessage, josa } from "@/lib/report-draft";
import { skippedPreference } from "@/lib/session";
import { decodeWeights, encodeWeights, parseRole, shareHref } from "@/lib/share";
import type { GradedIndicator, Grade, IndicatorId, Role } from "@/lib/types";

const ROLES: Role[] = ["서비스기획", "마케팅", "운영"];
const DEMO = ["00258801", "01137727", "01153956", "01547845"];
const AS_OF = new Date("2026-11-21");

/** 맞대결에서 늘 안정형 카드(1, 4, 7)를 고른 사람과 늘 자율형 카드(2, 5, 8)를 고른 사람 */
const STABLE = preferenceFromPicks(["card-1", "card-4", "card-6", "card-7", "card-1", "card-7", "card-1"]);
const AUTONOMY = preferenceFromPicks(["card-2", "card-3", "card-5", "card-8", "card-2", "card-5", "card-5"]);

function g(id: IndicatorId, grade: Grade | null): GradedIndicator {
  return { id, grade, display: "", basis: "", source: null, ...(grade === null ? { reason: "no_source" as const } : {}) };
}

/** 기반 점수가 정확히 x가 되는 등급 묶음 (같은 비중, A 1 B 0.5 C 0). 예: 0.6 -> A 3, C 2 */
function gradedWithBase(aCount: number, cCount: number, transparency: Grade = "A"): GradedIndicator[] {
  const ids: IndicatorId[] = ["financial_health", "growth", "profitability", "hiring_flow", "compensation", "tenure", "tech_investment", "funding_stage", "risk"];
  const list = ids.map((id, i) => g(id, i < aCount ? "A" : i < aCount + cCount ? "C" : null));
  return [...list, g("transparency", transparency)];
}

function report(companyId: string, role: Role, pref = skippedPreference()) {
  const company = realCompanies.find((c) => c.id === companyId)!;
  return buildReportDraft({ company, graded: computeIndicators(company, AS_OF), role, preference: pref, log: [], checkedAt: "2026-11-21", mode: "live" });
}

describe("역량 갭 (3년차 공고 비교)", () => {
  test("GAP-01 같은 직무 신입 역량이면 이어짐, 3년차 예상 역량이거나 어디에도 없으면 공백, 다른 직무 신입 역량이면 일부", () => {
    expect(classifyRequirement({ text: "", phrases: ["프로젝트 관리"] }, "서비스기획").kind).toBe("connected");
    expect(classifyRequirement({ text: "", phrases: ["프로모션 기획"] }, "마케팅").kind).toBe("connected");
    // 그로스·리텐션은 마케팅 사전에 있지만 3년차 예상 역량이라 신입 때 쌓는 역량이 아니다 (3년차에 새로 요구)
    const g3 = classifyRequirement({ text: "", phrases: ["그로스 해킹"] }, "마케팅");
    expect(g3.kind).toBe("missing");
    expect(g3.newAtYear3).toBe(true);
    // 사전에 없는 표현은 공백이고 사전 보강 후보로 모은다
    const none = classifyRequirement({ text: "", phrases: ["Braze 사용"] }, "마케팅");
    expect(none.kind).toBe("missing");
    expect(none.unmatched).toEqual(["Braze 사용"]);
    // 다른 직무 사전(서비스기획)의 신입 역량과 겹치면 일부, 어느 직무인지 남는다
    const part = classifyRequirement({ text: "", phrases: ["유관 부서 협업"] }, "마케팅");
    expect(part.kind).toBe("partial");
    expect(part.fromRoles).toContain("서비스기획");
    // 표현이 여럿이면 하나라도 신입 역량에 맞을 때 이어짐
    expect(classifyRequirement({ text: "", phrases: ["Braze 사용", "프로모션 기획"] }, "마케팅").kind).toBe("connected");
  });

  test("GAP-02 시연 기업 4곳 x 직무 3개 모두 3년차 공고와 갭 결과가 있고, 원문 링크가 공식 채용 페이지다", () => {
    for (const id of DEMO)
      for (const role of ROLES) {
        const gap = computeCareerGap(id, role, "live");
        expect(gap, `${id} ${role}`).not.toBeNull();
        expect(gap!.posting.url).toMatch(/^https:\/\/(kurly\.career\.greetinghr\.com|www\.musinsacareers\.com|careers\.kakao\.com|careers\.daangn\.com)\//);
        const c = gap!.counts;
        expect(c.connected + c.partial + c.missing).toBeGreaterThan(0);
      }
  });

  test("GAP-03 카카오 마케팅·운영만 유사 기업 공고로 대체했고, 카드와 채팅에 사유가 보인다", () => {
    for (const id of DEMO)
      for (const role of ROLES) {
        const gap = computeCareerGap(id, role, "live")!;
        const substituted = id === "00258801" && role !== "서비스기획";
        expect(gap.posting.substitute !== null, `${id} ${role}`).toBe(substituted);
        const d = report(id, role);
        if (substituted) {
          expect(d.substituteNote).toBe(gap.posting.substitute!.reason);
          expect(careerMessage(gap, role)).toContain(gap.posting.substitute!.reason);
          expect(d.careerSource).not.toContain("카카오");
        } else expect(d.substituteNote).toBeUndefined();
      }
  });

  test("GAP-04 공백 표현은 사전 보강 후보로 모인다", () => {
    const gap = computeCareerGap("01137727", "마케팅", "live")!;
    expect(gap.unmatched).toContain("Braze 사용");
    const missingPhrases = gap.items.filter((i) => i.kind === "missing").flatMap((i) => i.names);
    expect(gap.unmatched).toEqual(missingPhrases);
  });

  test("GAP-05 우대 항목과 연차·태도 문장(표현 없음)은 개수에서 뺀다", () => {
    const gap = computeCareerGap("01547845", "운영", "live")!;
    const counted = gap.posting.requirements.filter((r) => !r.preferred && r.phrases.length > 0).length;
    expect(gap.counts.connected + gap.counts.partial + gap.counts.missing).toBe(counted);
    expect(gap.posting.requirements.length).toBeGreaterThan(counted);
  });

  test("GAP-06 이어짐 비율: 일부는 절반, 셀 문장이 없으면 null", () => {
    expect(connectRatio({ connected: 1, partial: 2, missing: 1 })).toBe(0.5);
    expect(connectRatio({ connected: 5, partial: 0, missing: 0 })).toBe(1);
    expect(connectRatio({ connected: 0, partial: 0, missing: 0 })).toBeNull();
  });

  test("GAP-07 리포트의 갭 숫자와 채팅 문장의 숫자가 계산 결과와 같다", () => {
    for (const id of DEMO)
      for (const role of ROLES) {
        const gap = computeCareerGap(id, role, "live")!;
        expect(report(id, role).gap).toEqual(gap.counts);
        const msg = careerMessage(gap, role);
        const total = gap.counts.connected + gap.counts.partial + gap.counts.missing;
        expect(msg).toContain(`요구하는 역량 ${total}개 중 ${gap.counts.connected}개는 신입 때 쌓는 역량이고, ${gap.counts.partial}개는 다른 직무 역량과 겹치고, ${gap.counts.missing}개는 따로 채워야 해요`);
      }
  });
});

describe("역량 갭 표시", () => {
  test("GAP-08 이름 목록은 개수와 맞고, 3년차에 새로 요구되는 역량과 다른 직무는 표시한다", () => {
    for (const id of DEMO)
      for (const role of ROLES) {
        const gap = computeCareerGap(id, role, "live")!;
        const d = gapDetail(gap);
        expect(d.connected.length === 0).toBe(gap.counts.connected === 0);
        expect(d.partial.length === 0).toBe(gap.counts.partial === 0);
        expect(d.missing.length === 0).toBe(gap.counts.missing === 0);
        for (const n of d.partial) expect(n).toMatch(/\((서비스기획|마케팅|운영)/);
      }
    // 무신사 마케팅: CRM 마케팅은 신입 역량(이어짐), 실험·협업은 서비스기획 역량과 겹침(일부), Braze는 사전에 없는 표현(공백)
    const d = gapDetail(computeCareerGap("01137727", "마케팅", "live")!);
    expect(d.connected).toContain("CRM 마케팅");
    expect(d.partial).toContain("협업·조율(서비스기획)");
    expect(d.missing).toContain("Braze 사용");
    // 3년차 예상 역량이 공백으로 나오면 이름 뒤에 표시가 붙는다
    expect(gapDetail({ ...computeCareerGap("01137727", "마케팅", "live")!, items: [{ text: "", kind: "missing", names: ["그로스·리텐션"], newAtYear3: true }] }).missing).toEqual(["그로스·리텐션(3년차에 새로 요구)"]);
  });

  test("GAP-09 채팅 안내는 직무와 신입 기준을 말하고, 공고가 경력 몇 년인지와 역량 이름을 보인다", () => {
    const gap = computeCareerGap("01137727", "마케팅", "live")!;
    const msg = careerMessage(gap, "마케팅");
    expect(msg).toContain("마케팅 직무에서 신입 때 쌓는 역량과 비교하면");
    expect(msg).toContain("경력 4년 이상");
    expect(msg).toContain("따로 채워야 하는 것:");
    expect(msg).toContain("Braze 사용");
  });
});

describe("판정 라벨", () => {
  test("FIT-01 기준값은 기반 0.75, 이어짐 0.6", () => {
    expect(BASE_THRESHOLD).toBe(0.75);
    expect(CONNECT_THRESHOLD).toBe(0.6);
  });

  test("FIT-02 결정 테이블: 이어짐 높음·낮음 x 기반 좋음·약함 -> 최적, 도전, 안정, 고려", () => {
    const good = gradedWithBase(5, 1); // A 6개(정보 투명도 포함), C 1개 = 6 / 7
    const weak = gradedWithBase(1, 2, "B"); // (1 + 0 + 0 + 0.5) / 4
    const w = equalWeights();
    expect(decideFit({ graded: good, weights: w, connect: 0.6 }).label).toBe("최적");
    expect(decideFit({ graded: weak, weights: w, connect: 0.6 }).label).toBe("도전");
    expect(decideFit({ graded: good, weights: w, connect: 0.5 }).label).toBe("안정");
    expect(decideFit({ graded: weak, weights: w, connect: 0.5 }).label).toBe("고려");
  });

  test("FIT-03 경계값: 기반 0.75와 이어짐 0.6이 정확히 기준이면 좋음·높음, 바로 아래면 약함·낮음", () => {
    const w = equalWeights();
    // 정확히 0.75: A A B B = (1 + 1 + 0.5 + 0.5) / 4 (마지막은 정보 투명도 B)
    const at = [g("financial_health", "A"), g("growth", "A"), g("profitability", "B"), g("transparency", "B")];
    // 바로 아래 0.714: A A A B B B B = 5 / 7
    const below = [g("financial_health", "A"), g("growth", "A"), g("profitability", "A"), g("hiring_flow", "B"), g("compensation", "B"), g("tenure", "B"), g("transparency", "B")];
    expect(baseScore(at, w)).toBeCloseTo(0.75, 10);
    expect(baseScore(below, w)).toBeCloseTo(5 / 7, 10);
    expect(decideFit({ graded: at, weights: w, connect: 0.6 }).label).toBe("최적");
    expect(decideFit({ graded: at, weights: w, connect: 0.59 }).label).toBe("안정");
    expect(decideFit({ graded: below, weights: w, connect: 0.6 }).label).toBe("도전");
    expect(decideFit({ graded: below, weights: w, connect: 0.59 }).label).toBe("고려");
  });

  test("FIT-04 정보 투명도 C이거나 3년차 공고가 없으면 정보 보강", () => {
    const w = equalWeights();
    expect(decideFit({ graded: gradedWithBase(9, 0, "C"), weights: w, connect: 1 }).label).toBe("정보 보강");
    const noPosting = decideFit({ graded: gradedWithBase(9, 0), weights: w, connect: null });
    expect(noPosting.label).toBe("정보 보강");
    expect(noPosting.rule).toBe("3년차 공고 없음");
  });

  test("FIT-05 기반 점수는 확인 불가 지표를 빼고 남은 가중치로 나눈다", () => {
    const w = equalWeights();
    expect(baseScore([g("growth", "A"), g("tenure", null)], w)).toBe(1);
    expect(baseScore([g("growth", null)], w)).toBeNull();
  });

  test("FIT-06 같은 회사도 선호가 다르면 강조점(중시 지표, 이유 문장)이 다르다", () => {
    const a = report("01153956", "서비스기획", STABLE);
    const b = report("01153956", "서비스기획", AUTONOMY);
    expect(a.topIndicators).not.toEqual(b.topIndicators);
    expect(a.fitReason).not.toBe(b.fitReason);
  });

  test("FIT-07 이유 문장에는 숫자(용어 \"3년차\" 제외), em dash, 이모지가 없고 회사를 평가하는 말이 없다", () => {
    for (const id of DEMO)
      for (const role of ROLES)
        for (const pref of [skippedPreference(), STABLE, AUTONOMY]) {
          const d = report(id, role, pref);
          expect(d.fitReason.replaceAll("3년", ""), `${id} ${role}`).not.toMatch(/[0-9]|—|\p{Extended_Pictographic}/u);
          expect(d.fitReason).not.toMatch(/좋은 회사|나쁜 회사|추천/);
          expect(d.fitLabel).not.toBeNull();
        }
  });

  test("FIT-08 조사: 받침이 없는 지표 이름에는 가·는을 붙인다", () => {
    expect(josa("내가 중시한 성장성", "이", "가")).toBe("이");
    expect(josa("내가 중시한 리스크", "이", "가")).toBe("가");
    expect(josa("내가 중시한 투자 단계", "은", "는")).toBe("는");
  });

  test("FIT-09 폐업한 동명 법인은 판정하지 않는다", () => {
    const d = report("00918444", "운영");
    expect(d.fitLabel).toBeNull();
    expect(d.notice).toContain("폐업");
  });
});

describe("카드 공유 링크 (QR)", () => {
  test("SHR-01 가중치를 링크용으로 줄였다가 되살려도 유형과 중시 지표 3개가 같다", () => {
    for (const pref of [STABLE, AUTONOMY]) {
      const back = decodeWeights(encodeWeights(pref.weights))!;
      expect(back.type).toBe(pref.type);
      expect(back.topIndicators).toEqual(pref.topIndicators);
      expect(Object.values(back.weights).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    }
  });

  test("SHR-02 링크 값이 없거나 깨졌으면 기본 기준(null)이다", () => {
    expect(decodeWeights(null)).toBeNull();
    expect(decodeWeights("1_2_3")).toBeNull();
    expect(decodeWeights("a_b_c_d_e_f_g_h_i_j")).toBeNull();
    expect(decodeWeights("0_0_0_0_0_0_0_0_0_0")).toBeNull();
  });

  test("SHR-03 링크에는 기업 ID, 직무, 가중치만 담긴다 (이름, 회사명, 개인정보 없음)", () => {
    const href = shareHref("00258801", "마케팅", encodeWeights(STABLE.weights));
    const q = new URL(href, "http://x").searchParams;
    expect([...q.keys()].sort()).toEqual(["c", "r", "w"]);
    expect(q.get("c")).toBe("00258801");
    expect(parseRole(q.get("r"))).toBe("마케팅");
    expect(parseRole("개발자")).toBeNull();
    expect(shareHref("00258801", "운영")).not.toContain("w=");
  });

  test("SHR-04 맞춤 판정 카드에만 가중치가 들어가고, 링크로 다시 만든 카드는 같다", () => {
    const personal = report("01153956", "서비스기획", STABLE);
    expect(personal.weightsParam).toBe(encodeWeights(STABLE.weights));
    expect(report("01153956", "서비스기획").weightsParam).toBeUndefined();
    const again = report("01153956", "서비스기획", decodeWeights(personal.weightsParam)!);
    expect(again.fitLabel).toBe(personal.fitLabel);
    expect(again.topIndicators).toEqual(personal.topIndicators);
    expect(again.gap).toEqual(personal.gap);
  });
});
