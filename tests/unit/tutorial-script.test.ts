// 튜토리얼 대본(data/tutorial/script.json)이 지금 코드가 만드는 목업 응답과 같은지 확인한다. 케이스 ID: TUT-*.
// 대본은 실제 AI를 부르지 않는 정적 데이터다. 코드(지표, 카드)가 바뀌면 아래 명령으로 다시 만든다:
//   PowerShell: $env:WRITE_TUTORIAL='1'; npx vitest run tests/unit/tutorial-script.test.ts
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import script from "@/data/tutorial/script.json";
import { candidatesResponse, companyResponse, line, profileLine, renumber, summaryLogLine } from "@/lib/agent/responses";
import type { ChatResponse } from "@/lib/chat";
import { findCandidates, getCompany } from "@/lib/data";
import type { BusinessSummary } from "@/lib/types";

const QUERY = "몽돌커머스 분석해줘";
const PICK = "mock-020";

/** 실제 에이전트(USE_AGENT=true)가 남기는 줄과 같은 모양의 예시 로그. 튜토리얼은 AI를 부르지 않으므로 이유 문장은 미리 적어 둔다 */
function build() {
  const found = findCandidates("몽돌커머스", "mock");
  const company = getCompany(PICK, "mock")!;
  const candidates = candidatesResponse(found, [
    line(0, "tool_call", `search_company: "몽돌커머스" 후보 ${found.length}곳`, "사용자가 말한 회사 이름으로 법인 후보를 찾음", "mock"),
    line(0, "decision", `show_choices: 후보 ${found.length}곳 중에서 사용자에게 고르게 함`, "이름이 같은 법인이 여럿이고 설립연도와 소재지가 달라 사용자에게 확인", "mock"),
  ]);
  const res = companyResponse(company, [
    line(0, "decision", `사용자가 후보 중 ${company.name}을(를) 골라 확정`, "동명 후보 중 사용자 선택", "mock"),
    { ...profileLine(), mode: "mock" as const },
  ]);
  // 가상 기업이라 공시 원문이 없다. 실제 서비스에서 AI가 쓰는 "하는 일 세 줄 요약"의 모양만 보여 주려고 예시 문장을 넣는다 (숫자 없음)
  const summary: BusinessSummary = {
    status: "ok",
    lines: ["온라인 장터를 운영하는 가상 회사예요.", "판매자 수수료와 광고로 수익을 내요.", "판매자용 정산, 배송 도구도 만들어요."],
    source: { name: "가상 사업보고서 (튜토리얼 예시)", url: "", checkedAt: "2026-11-22" },
    method: "llm",
  };
  const picked: ChatResponse =
    res.widget?.type === "company"
      ? { ...res, widget: { ...res.widget, summary }, log: renumber([
            ...res.log.filter((l) => !l.title.startsWith("하는 일 요약")),
            summaryLogLine(summary),
            line(0, "decision", "하는 일 세 줄 요약을 AI가 사업의 개요에서 새로 작성", "공시 문단만 읽고 숫자 없이 3줄로, 코드가 줄 수와 숫자를 검증", "mock"),
          ]) }
      : res;
  return { version: 1, note: "튜토리얼 전용 정적 대본. 가상 기업이고 AI를 부르지 않는다", query: QUERY, candidates, picked };
}

describe("튜토리얼 대본", () => {
  it("TUT-01 대본이 지금 코드의 목업 응답과 같다 (다르면 WRITE_TUTORIAL=1로 다시 만든다)", () => {
    const fresh = build();
    if (process.env.WRITE_TUTORIAL === "1") writeFileSync("data/tutorial/script.json", JSON.stringify(fresh, null, 2) + "\n");
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(process.env.WRITE_TUTORIAL === "1" ? JSON.parse(JSON.stringify(fresh)) : script);
  });

  it("TUT-02 가상 기업만 쓰고 동명 후보가 2곳 이상이다", () => {
    expect(script.candidates.widget?.type).toBe("candidates");
    const c = script.candidates.widget as { candidates: { id: string }[] };
    expect(c.candidates.length).toBeGreaterThanOrEqual(2);
    expect(c.candidates.every((x) => x.id.startsWith("mock-"))).toBe(true);
    expect(script.picked.widget?.type).toBe("company");
  });
});
