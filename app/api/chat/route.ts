// 채팅 API. USE_AGENT=true면 LLM 에이전트 루프(lib/agent/loop.ts), 아니면 정해진 규칙으로 답한다.
// 후보 칩을 고른 요청은 사용자가 이미 정한 것이라 LLM 없이 바로 카드를 만든다.
import type { ChatRequest, ChatResponse } from "@/lib/chat";
import { config, getMode } from "@/lib/config";
import { getCompany } from "@/lib/data";
import { createAnthropicClient } from "@/lib/agent/llm";
import { runAgent } from "@/lib/agent/loop";
import { companyResponse, line, profileLine, renumber, ruleResponse } from "@/lib/agent/responses";
import { refreshSummary } from "@/lib/agent/fresh-summary";
import { realBusinessSummaries } from "@/lib/data";

/**
 * 기업 카드 응답이면 "하는 일 세 줄 요약"을 AI가 그때그때 새로 쓴다 (USE_AGENT=true일 때만). 실패하면 미리 만든 요약 그대로
 */
async function withFreshSummary(res: ChatResponse): Promise<ChatResponse> {
  if (!config.useAgent || res.widget?.type !== "company") return res;
  const { summary, log } = await refreshSummary(
    res.widget.company,
    res.widget.summary,
    realBusinessSummaries,
    { llm: createAnthropicClient(), model: config.models.small },
    getMode(),
  );
  return { ...res, widget: { ...res.widget, summary }, log: log ? renumber([...res.log, log]) : res.log };
}

/** Vercel에서 AI 호출(에이전트 판단, 요약)이 기본 제한 시간보다 길어질 수 있어 60초로 늘린다 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatRequest | null;
  if (!body) return Response.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });

  if (body.pickCompanyId) {
    const company = getCompany(body.pickCompanyId, getMode());
    if (!company) return Response.json({ error: "없는 기업입니다" }, { status: 404 });
    const res: ChatResponse = companyResponse(company, [
      line(0, "decision", `사용자가 후보 중 ${company.name}을(를) 골라 확정`, "동명 후보 중 사용자 선택"),
      profileLine(),
    ]);
    return Response.json(await withFreshSummary(res));
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 100) : "";
  if (!message) return Response.json({ error: "메시지가 비어 있습니다" }, { status: 400 });

  if (!config.useAgent) return Response.json(ruleResponse(message));

  const res = await runAgent(message, body.session?.role ?? null, {
    llm: createAnthropicClient(),
    model: config.models.small,
    maxToolCalls: config.maxToolCalls,
  });
  return Response.json(await withFreshSummary(res));
}
