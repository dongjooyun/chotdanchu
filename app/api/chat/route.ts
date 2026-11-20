// 채팅 API. USE_AGENT=true면 LLM 에이전트 루프(lib/agent/loop.ts), 아니면 정해진 규칙으로 답한다.
// 후보 칩을 고른 요청은 사용자가 이미 정한 것이라 LLM 없이 바로 카드를 만든다.
import type { ChatRequest, ChatResponse } from "@/lib/chat";
import { config, getMode } from "@/lib/config";
import { getCompany } from "@/lib/data";
import { createAnthropicClient } from "@/lib/agent/llm";
import { runAgent } from "@/lib/agent/loop";
import { companyResponse, line, profileLine, ruleResponse } from "@/lib/agent/responses";

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
    return Response.json(res);
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 100) : "";
  if (!message) return Response.json({ error: "메시지가 비어 있습니다" }, { status: 400 });

  if (!config.useAgent) return Response.json(ruleResponse(message));

  const res = await runAgent(message, body.session?.role ?? null, {
    llm: createAnthropicClient(),
    model: config.models.small,
    maxToolCalls: config.maxToolCalls,
  });
  return Response.json(res);
}
