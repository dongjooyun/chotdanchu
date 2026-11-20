// 에이전트 루프 테스트. LLM 응답을 가짜로 바꿔 넣어 도구 호출 순서, 호출 상한, 판단 로그, 폴백을 본다 (크레딧 0).
// 케이스 ID는 AGT-{번호}. 기법: 상태 전이(도구 순서), 경계값(호출 상한 8회), 오류 추정(없는 도구, API 실패, 거절)
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import type { LlmClient } from "@/lib/agent/llm";
import { runAgent } from "@/lib/agent/loop";
import { findMockCandidates } from "@/lib/data";
import { computeIndicators } from "@/lib/indicators";

type Params = Anthropic.MessageCreateParamsNonStreaming;
type Step = Anthropic.Message | Error | ((params: Params) => Anthropic.Message);

let seq = 0;
function message(content: unknown[], stop_reason: string = "tool_use"): Anthropic.Message {
  return {
    id: `msg_${++seq}`,
    type: "message",
    role: "assistant",
    model: "fake",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Anthropic.Message;
}
const use = (name: string, input: Record<string, unknown>) => ({ type: "tool_use", id: `tu_${++seq}`, name, input });
const text = (t: string) => ({ type: "text", text: t, citations: null });

/** 정해 둔 순서대로 응답하는 가짜 LLM. 받은 요청은 그 시점 모습 그대로 복사해 둔다 */
function fakeLlm(steps: Step[] | ((i: number) => Step)) {
  const calls: Params[] = [];
  const llm: LlmClient = {
    async create(params) {
      calls.push(JSON.parse(JSON.stringify(params)) as Params);
      const i = calls.length - 1;
      const step = typeof steps === "function" ? steps(i) : steps[i];
      if (!step) throw new Error(`가짜 LLM 응답이 ${i + 1}번째에 없음`);
      if (step instanceof Error) throw step;
      return typeof step === "function" ? step(params) : step;
    },
  };
  return { llm, calls };
}

const deps = (llm: LlmClient) => ({ llm, model: "claude-haiku-5-5", maxToolCalls: 8 });
const [mongdolA, mongdolB] = findMockCandidates("몽돌커머스");

describe("도구 순서 (상태 전이)", () => {
  test("AGT-01 후보가 하나면 search_company -> compute_indicators로 카드, LLM은 2번만", async () => {
    const { llm, calls } = fakeLlm([
      message([use("search_company", { query: "별하늘랩스", reason: "이름으로 후보 찾기" })]),
      message([use("compute_indicators", { company_id: "mock-001", reason: "후보가 하나라 확정" })]),
    ]);
    const res = await runAgent("별하늘랩스", "마케팅", deps(llm));
    expect(calls).toHaveLength(2);
    expect(res.widget?.type).toBe("company");
    expect(res.log.map((l) => l.step)).toEqual(res.log.map((_, i) => i + 1));
    expect(res.log[0]).toMatchObject({ type: "tool_call", title: 'search_company: "별하늘랩스" 후보 1곳', reason: "이름으로 후보 찾기" });
    expect(res.log[1]).toMatchObject({ type: "decision", reason: "후보가 하나라 확정" });
    expect(res.log.filter((l) => l.type === "unavailable")).toHaveLength(4);
  });

  test("AGT-02 후보가 둘이면 show_choices로 후보 칩", async () => {
    const { llm } = fakeLlm([
      message([use("search_company", { query: "몽돌커머스", reason: "후보 찾기" })]),
      message([use("show_choices", { company_ids: [mongdolA.id, mongdolB.id], reason: "업종이 달라 사용자가 골라야 함" })]),
    ]);
    const res = await runAgent("몽돌커머스", null, deps(llm));
    expect(res.widget?.type).toBe("candidates");
    if (res.widget?.type !== "candidates") return;
    expect(res.widget.candidates.map((c) => c.id)).toEqual([mongdolA.id, mongdolB.id]);
    expect(res.log.at(-1)).toMatchObject({ type: "decision", reason: "업종이 달라 사용자가 골라야 함" });
  });

  test("AGT-03 도구 없이 답하면 그 문장이 답이 되고 decision 로그가 남는다", async () => {
    const { llm } = fakeLlm([message([text("회사 이름을 알려 주세요.")], "end_turn")]);
    const res = await runAgent("안녕", null, deps(llm));
    expect(res.reply).toBe("회사 이름을 알려 주세요.");
    expect(res.widget).toBeUndefined();
    expect(res.log).toEqual([expect.objectContaining({ step: 1, type: "decision" })]);
  });
});

describe("호출 상한 (경계값: 8회)", () => {
  test("AGT-04 8번째 호출까지는 실행하고, 9번째에서 멈춰 limit 로그와 규칙 결과로 정리", async () => {
    const { llm, calls } = fakeLlm(() => message([use("search_company", { query: "별하늘랩스", reason: "다시 찾기" })]));
    const res = await runAgent("별하늘랩스", null, deps(llm));
    expect(calls).toHaveLength(9);
    const llmToolCalls = res.log.filter((l) => l.type === "tool_call" && l.reason === "다시 찾기");
    expect(llmToolCalls).toHaveLength(8);
    expect(res.log.some((l) => l.type === "limit" && l.title.includes("8회"))).toBe(true);
    expect(res.widget?.type).toBe("company");
  });

  test("AGT-05 한 응답에 도구 2개면 2회로 센다 (5번 x 2개 = 10 -> 9번째에서 멈춤)", async () => {
    const { llm, calls } = fakeLlm(() =>
      message([
        use("search_company", { query: "별하늘랩스", reason: "a" }),
        use("search_company", { query: "별하늘 랩스", reason: "b" }),
      ]),
    );
    const res = await runAgent("별하늘랩스", null, deps(llm));
    expect(calls).toHaveLength(5);
    expect(res.log.filter((l) => l.type === "tool_call" && (l.reason === "a" || l.reason === "b"))).toHaveLength(8);
    expect(res.log.some((l) => l.type === "limit")).toBe(true);
  });

  test("AGT-06 같은 응답의 도구 결과 2개는 한 user 메시지에 모아 돌려준다", async () => {
    const { llm, calls } = fakeLlm([
      message([
        use("search_company", { query: "별하늘랩스", reason: "a" }),
        use("get_company_profile", { company_id: "mock-001", reason: "b" }),
      ]),
      message([use("compute_indicators", { company_id: "mock-001", reason: "c" })]),
    ]);
    await runAgent("별하늘랩스", null, deps(llm));
    const last = calls[1].messages.at(-1)!;
    expect(last.role).toBe("user");
    expect(Array.isArray(last.content) && last.content.map((b) => b.type)).toEqual(["tool_result", "tool_result"]);
  });
});

describe("잘못된 도구와 API 실패 (오류 추정)", () => {
  test("AGT-07 없는 도구 이름은 is_error 결과로 돌려주고 계속 진행한다", async () => {
    const { llm, calls } = fakeLlm([
      message([use("delete_everything", { reason: "?" })]),
      message([use("compute_indicators", { company_id: "mock-001", reason: "확정" })]),
    ]);
    const res = await runAgent("별하늘랩스", null, deps(llm));
    const result = (calls[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0];
    expect(result).toMatchObject({ type: "tool_result", is_error: true });
    expect(res.log[0].title).toContain("실패");
    expect(res.widget?.type).toBe("company");
  });

  test("AGT-08 show_choices에 회사가 1곳뿐이면 오류로 돌려준다", async () => {
    const { llm, calls } = fakeLlm([
      message([use("show_choices", { company_ids: ["mock-001"], reason: "?" })]),
      message([text("다시 찾아볼게요.")], "end_turn"),
    ]);
    await runAgent("별하늘랩스", null, deps(llm));
    expect((calls[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0].is_error).toBe(true);
  });

  test.each([
    ["AGT-09", new Anthropic.APIConnectionError({ message: "down" }), "API 연결 실패"],
    ["AGT-10", new Error("boom"), "LLM 호출 중 알 수 없는 오류"],
  ])("%s LLM 호출이 실패하면 규칙 경로로 대신 답하고 fallback 로그 (%s)", async (id, err, label) => {
    const { llm } = fakeLlm([err]);
    const res = await runAgent("별하늘랩스", null, deps(llm));
    expect(res.log[0], id).toMatchObject({ step: 1, type: "fallback", reason: label });
    expect(res.widget?.type, id).toBe("company");
  });

  test("AGT-11 거절(refusal)도 규칙 경로로 대신 답한다", async () => {
    const { llm } = fakeLlm([message([], "refusal")]);
    const res = await runAgent("몽돌커머스", null, deps(llm));
    expect(res.log[0]).toMatchObject({ type: "fallback", reason: "stop_reason: refusal" });
    expect(res.widget?.type).toBe("candidates");
  });
});

describe("숫자와 개인정보 (절대 규칙)", () => {
  test("AGT-12 카드의 등급은 코드 계산과 같고, LLM이 함께 쓴 문장은 답에 쓰이지 않는다", async () => {
    const { llm } = fakeLlm([
      message([text("A등급이 9개인 좋은 회사입니다."), use("compute_indicators", { company_id: "mock-001", reason: "확정" })]),
    ]);
    const res = await runAgent("별하늘랩스", null, deps(llm));
    expect(res.reply).not.toContain("9");
    if (res.widget?.type !== "company") throw new Error("카드가 없음");
    expect(res.widget.graded).toEqual(computeIndicators(res.widget.company));
  });

  test("AGT-13 LLM에 보내는 도구 결과에 대표자 이름이 없다", async () => {
    const { llm, calls } = fakeLlm([
      message([
        use("search_company", { query: "몽돌커머스", reason: "a" }),
        use("get_company_profile", { company_id: mongdolA.id, reason: "b" }),
      ]),
      message([text("골라 주세요.")], "end_turn"),
    ]);
    await runAgent("몽돌커머스", null, deps(llm));
    const sent = JSON.stringify(calls[1].messages);
    for (const c of [mongdolA, mongdolB]) expect(sent).not.toContain(c.ceoName);
  });

  test("AGT-14 요청 모양: 지정 모델, 도구 4개, 강제 도구 선택 없음, 시스템 프롬프트 고정", async () => {
    const { llm, calls } = fakeLlm([message([text("회사 이름을 알려 주세요.")], "end_turn")]);
    await runAgent("안녕", "운영", deps(llm));
    const p = calls[0];
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.tools?.map((t) => ("name" in t ? t.name : ""))).toEqual([
      "search_company",
      "show_choices",
      "get_company_profile",
      "compute_indicators",
    ]);
    expect(p.tool_choice).toBeUndefined();
    expect(p.messages[0].content).toContain("직무: 운영");
    expect(p.system).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
