// 검색할 때마다 새로 쓰는 "하는 일 세 줄 요약" (CDC-26 후속, 11/22). 케이스 ID: FRS-*. 가짜 LLM이라 크레딧을 쓰지 않는다.
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { overviewText, refreshSummary } from "@/lib/agent/fresh-summary";
import type { LlmClient } from "@/lib/agent/llm";
import type { SummaryStore } from "@/lib/business-summary";
import type { BusinessSummary, Company } from "@/lib/types";

const company = { id: "00000001", corpCode: "00000001", name: "가상기업(주)" } as unknown as Company;
const OLD: BusinessSummary = { status: "ok", lines: ["예전 줄 하나예요.", "예전 줄 둘이에요.", "예전 줄 셋이에요."], source: { name: "OpenDART 사업보고서", url: "", checkedAt: "2026-11-22" }, method: "llm" };
const store: SummaryStore = { "00000001": { ...OLD, status: "ok", overview: "당사는 온라인 장터를 운영합니다. 수수료와 광고가 수입원입니다." } as SummaryStore[string] };

function fakeLlm(answer: string) {
  const create = vi.fn(async (_p: Anthropic.MessageCreateParamsNonStreaming) => ({ content: [{ type: "text", text: answer }] }) as unknown as Anthropic.Message);
  return { llm: { create } as LlmClient, create };
}

describe("검색할 때마다 새 요약", () => {
  it("FRS-01 원문이 있으면 부를 때마다 모델을 부르고, 새 3줄과 AI 판단 로그를 돌려준다", async () => {
    const f = fakeLlm("온라인 장터를 운영해요.\n수수료와 광고로 수익을 내요.\n판매자를 돕는 도구도 만들어요.");
    const deps = { llm: f.llm, model: config.models.small };
    const a = await refreshSummary(company, OLD, store, deps, "live");
    await refreshSummary(company, OLD, store, deps, "live");
    expect(f.create).toHaveBeenCalledTimes(2); // 캐시하지 않고 매번 새로 쓴다
    expect(a.summary.status === "ok" && a.summary.lines[0]).toBe("온라인 장터를 운영해요.");
    expect(a.log?.type).toBe("decision");
  });

  it("FRS-02 모델 답이 규칙(3줄, 숫자 없음)을 어기면 미리 만든 요약을 그대로 쓰고 대체 로그를 남긴다", async () => {
    const f = fakeLlm("매출은 1,234억원이에요.\n둘째 줄이에요.\n셋째 줄이에요.");
    const r = await refreshSummary(company, OLD, store, { llm: f.llm, model: config.models.small }, "live");
    expect(r.summary).toEqual(OLD);
    expect(r.log?.type).toBe("fallback");
  });

  it("FRS-03 원문이 없거나 공시 없음이면 모델을 부르지 않는다", async () => {
    const f = fakeLlm("가\n나\n다");
    const deps = { llm: f.llm, model: config.models.small };
    expect((await refreshSummary(company, { status: "no_report" }, store, deps, "live")).log).toBeNull();
    expect((await refreshSummary(company, OLD, {}, deps, "live")).log).toBeNull();
    expect(f.create).not.toHaveBeenCalled();
    expect(overviewText(company, {})).toBeNull();
  });
});
