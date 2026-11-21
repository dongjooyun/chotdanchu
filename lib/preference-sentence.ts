// 맞대결 유형 설명 문장 (PRD 02 완료 기준: 중요도 순서만 근거로 쓰고 숫자를 지어내지 않는다).
// 규칙 문장이 기본이고, LLM 문장은 아래 검사를 통과할 때만 쓴다.
import { TYPE_INFO } from "@/lib/matchup";
import { INDICATOR_LABELS, PREFERENCE_TYPE_LABELS, type IndicatorId, type PreferenceType } from "@/lib/types";

type Input = { type: PreferenceType | null; topIndicators: IndicatorId[] };

/** 예: 성장성, 투자 단계, 고용 흐름 -> "성장성, 투자 단계, 고용 흐름 순으로 중시했어요. 빠르게 크는 곳에서 ..." */
export function typeSentence(pref: Input): string {
  if (!pref.type) return "모든 지표를 같은 비중으로 봤어요.";
  const names = pref.topIndicators.map((id) => INDICATOR_LABELS[id]).join(", ");
  return `${names} 순으로 중시했어요. ${TYPE_INFO[pref.type].description}`;
}

/** LLM에 보내는 글. 유형 이름과 지표 이름 순서만 들어간다 */
export function preferencePrompt(pref: Input): string {
  const names = pref.topIndicators.map((id) => INDICATOR_LABELS[id]).join(", ");
  const type = pref.type ? PREFERENCE_TYPE_LABELS[pref.type] : "기본 기준";
  return [
    "취업 준비생이 회사 카드 맞대결에서 고른 결과를 한 문장으로 설명해 주세요.",
    `유형: ${type}`,
    `중시한 지표(중요한 순서): ${names}`,
    "규칙: '~해요'체 한 문장, 50자 안팎. 사용자에게 직접 말하듯 쓰고 '설명드릴 수 있습니다' 같은 말은 빼요. 숫자, 퍼센트, 회사 이름을 쓰지 않는다. 회사를 추천하거나 평가하지 않는다. 문장만 출력한다.",
    "예: 회사가 얼마나 빨리 크는지와 투자를 받고 있는지를 먼저 보는 편이에요.",
  ].join("\n");
}

/** LLM 문장 검사: 비었거나 길거나, 숫자·em dash·줄바꿈이 있으면 버리고 규칙 문장을 쓴다 */
export function checkSentence(text: string): boolean {
  return text.length > 0 && text.length <= 120 && !/[0-9０-９%—\n]/.test(text);
}
