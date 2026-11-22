// 에이전트 루프 (CDC-14). LLM이 다음 도구를 고르고, 서버가 실행해 결과를 돌려준다.
// - 한 요청당 도구 호출 상한(config.maxToolCalls, 8회). 넘으면 지금까지 결과를 정해진 규칙으로 정리한다
// - show_choices, compute_indicators를 부르면 그 자리에서 끝나고 화면 위젯을 띄운다
// - LLM 호출이 실패하면 임시 규칙으로 대신 답하고 fallback 로그를 남긴다
// - 숫자는 도구(코드)만 만든다. LLM 문장은 "도구 없이 답할 때"만 쓰인다
import Anthropic from "@anthropic-ai/sdk";
import type { ChatResponse, LogLine } from "@/lib/chat";
import type { Role } from "@/lib/types";
import type { LlmClient } from "./llm";
import { SYSTEM_PROMPT, userTurn } from "./prompt";
import { candidatesResponse, companyResponse, line, notFoundResponse, renumber, ruleResponse } from "./responses";
import { runTool, TOOLS } from "./tools";

export interface AgentDeps {
  llm: LlmClient;
  model: string;
  maxToolCalls: number;
}

/** LLM 오류를 사람이 읽을 이유로. 키나 응답 본문은 로그에 넣지 않는다 */
export function llmErrorLabel(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "API 키 인증 실패";
  if (e instanceof Anthropic.RateLimitError) return "요청 한도 초과";
  if (e instanceof Anthropic.APIConnectionError) return "API 연결 실패";
  if (e instanceof Anthropic.APIError) return `API 오류 (상태 ${e.status ?? "알 수 없음"})`;
  return "LLM 호출 중 알 수 없는 오류";
}

function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function reasonOf(input: Record<string, unknown>): string | undefined {
  return typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 200) : undefined;
}

/**
 * 메시지 하나를 에이전트로 처리한다.
 * 예: "몽돌커머스" -> search_company(후보 2곳) -> show_choices -> 후보 칩 응답
 */
export async function runAgent(message: string, role: Role | null, deps: AgentDeps): Promise<ChatResponse> {
  const log: LogLine[] = [];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userTurn(message, role) }];
  const fallback = (title: string, reason: string) => ruleResponse(message, [...log, line(0, "fallback", title, reason)]);
  let calls = 0;
  // 회사 검색을 했는데 한 번도 후보가 없었는지. 그러면 모델 문장 대신 "준비되지 않은 회사" 안내를 코드가 낸다 (11/23 QA)
  let searched = false;
  let foundAny = false;

  try {
    // 응답 한 번에 도구가 0개면 끝나므로, 반복 횟수도 호출 상한 + 1을 넘지 않는다
    for (let turn = 0; turn <= deps.maxToolCalls; turn++) {
      const res = await deps.llm.create({
        model: deps.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
        output_config: { effort: "low" },
      });

      if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
        return fallback("LLM 응답을 쓸 수 없어 정해진 규칙으로 대신 답함", `stop_reason: ${res.stop_reason}`);
      }

      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (uses.length === 0) {
        const text = textOf(res);
        log.push(line(0, "decision", "도구 없이 답하기로 함", "더 부를 도구가 없다고 판단"));
        if (searched && !foundAny) return notFoundResponse(message, log);
        return { reply: text || "회사 이름을 알려 주세요.", log: renumber(log) };
      }

      // 생각 블록까지 그대로 돌려줘야 다음 요청이 이어진다
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const use of uses) {
        calls += 1;
        if (calls > deps.maxToolCalls) {
          log.push(line(0, "limit", `도구 호출 상한 ${deps.maxToolCalls}회에 닿음`, "지금까지 찾은 결과를 정해진 규칙으로 정리"));
          return ruleResponse(message, log);
        }
        const input = (use.input ?? {}) as Record<string, unknown>;
        const why = reasonOf(input);
        const out = runTool(use.name, input);
        if (use.name === "search_company" && out.kind === "result") {
          searched = true;
          if (!out.summary.endsWith(" 후보 0곳")) foundAny = true;
        }

        if (out.kind === "choices") {
          return candidatesResponse(out.companies, [
            ...log,
            line(0, "decision", `show_choices: 후보 ${out.companies.length}곳 중에서 사용자에게 고르게 함`, why),
          ]);
        }
        if (out.kind === "company") {
          return companyResponse(out.company, [...log, line(0, "decision", `${out.company.name}(으)로 확정`, why)]);
        }
        const title = out.kind === "error" ? `${use.name}: 실패, ${out.summary}` : `${use.name}: ${out.summary}`;
        log.push(line(0, "tool_call", title, why));
        results.push({ type: "tool_result", tool_use_id: use.id, content: out.content, is_error: out.kind === "error" });
      }

      // 같은 응답의 도구 결과는 한 메시지에 모아 돌려준다
      messages.push({ role: "user", content: results });
    }
    log.push(line(0, "limit", `도구 호출 상한 ${deps.maxToolCalls}회에 닿음`, "지금까지 찾은 결과를 정해진 규칙으로 정리"));
    return ruleResponse(message, log);
  } catch (e) {
    return fallback("LLM 호출이 실패해 정해진 규칙으로 대신 답함", llmErrorLabel(e));
  }
}
