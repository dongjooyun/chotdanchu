// LLM 호출부. 루프는 이 인터페이스만 알고, 테스트에서는 가짜를 넣는다 (크레딧 0).
import Anthropic from "@anthropic-ai/sdk";

export interface LlmClient {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}

/** 실제 Claude API. 키는 서버 환경변수(ANTHROPIC_API_KEY)에서만 읽는다 */
export function createAnthropicClient(): LlmClient {
  const client = new Anthropic();
  return { create: (params) => client.messages.create(params) };
}
