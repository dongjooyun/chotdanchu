// 밸런스 게임 결과의 유형 설명 한 줄. USE_AGENT=true면 작은 모델이 문장만 다듬고, 아니면(기본, 테스트) 규칙 문장을 쓴다.
// LLM에는 유형 이름과 중시 지표 이름 순서만 보낸다. 개인정보와 숫자는 보내지 않는다 (CLAUDE.md 절대 규칙 1, 3).
import { createAnthropicClient } from "@/lib/agent/llm";
import { config } from "@/lib/config";
import { checkSentence, preferencePrompt, typeSentence } from "@/lib/preference-sentence";
import { INDICATOR_LABELS, PREFERENCE_TYPE_LABELS, type IndicatorId, type Preference, type PreferenceType } from "@/lib/types";

/** Vercel에서 AI 호출(에이전트 판단, 요약)이 기본 제한 시간보다 길어질 수 있어 60초로 늘린다 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Pick<Preference, "type" | "topIndicators"> | null;
  const type = body?.type;
  const top = Array.isArray(body?.topIndicators) ? body.topIndicators.filter((id) => id in INDICATOR_LABELS).slice(0, 3) : [];
  if (!type || !(type in PREFERENCE_TYPE_LABELS) || top.length === 0) {
    return Response.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }
  const pref = { type: type as PreferenceType, topIndicators: top as IndicatorId[] };
  const fallback = typeSentence(pref);
  if (!config.useAgent) return Response.json({ sentence: fallback, by: "rule" });

  try {
    const res = await createAnthropicClient().create({
      model: config.models.small,
      max_tokens: 200,
      messages: [{ role: "user", content: preferencePrompt(pref) }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const ok = checkSentence(text);
    return Response.json(ok ? { sentence: text, by: "llm" } : { sentence: fallback, by: "rule" });
  } catch {
    return Response.json({ sentence: fallback, by: "rule" });
  }
}
