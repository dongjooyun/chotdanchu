// 검색할 때마다 "하는 일 세 줄 요약"을 새로 만든다 (11/22 동주 결정, CDC-26 후속).
// 원문(사업의 개요 문단)은 미리 받아 둔 공시 문서다: 목업은 data/mock/companies.json의 businessOverview,
// 실데이터는 data/real/business-summaries.json의 overview (scripts/build-business-summaries.mts가 OpenDART에서 받아 저장).
// 실행 중에 외부 데이터 API는 부르지 않고, 요약만 작은 모델이 그때그때 한다. 그래서 같은 회사도 검색할 때마다 문장이 조금씩 다를 수 있다.
// 모델 답은 summarizeWithLlm이 검증한다(정확히 3줄, 숫자 없음). 규칙을 어기거나 실패하면 미리 만든 요약을 그대로 쓴다.
import type { AppMode, LogLine } from "@/lib/chat";
import type { BusinessSummary, Company } from "@/lib/types";
import type { SummaryStore } from "@/lib/business-summary";
import { summarizeWithLlm, type LlmSummaryDeps } from "@/lib/agent/summarize";

/** 요약할 원문. 없으면 null (공시 없음이거나 원문을 아직 받지 않음) */
export function overviewText(company: Company, store: SummaryStore): string | null {
  if (company.businessOverview?.text) return company.businessOverview.text;
  const stored = company.corpCode ? store[company.corpCode] : undefined;
  return stored && stored.status === "ok" && stored.overview ? stored.overview : null;
}

/**
 * 요약을 새로 만든다. 성공하면 새 줄과 "AI 판단" 로그, 실패하면 원래 요약과 "규칙 대체" 로그.
 * 예: 원문 있음 + 모델 성공 -> { summary: { ...lines: 새 3줄, method: "llm" }, log: decision "하는 일 세 줄 요약을 AI가 새로 작성" }
 */
export async function refreshSummary(
  company: Company,
  summary: BusinessSummary,
  store: SummaryStore,
  deps: LlmSummaryDeps,
  mode: AppMode,
): Promise<{ summary: BusinessSummary; log: LogLine | null }> {
  if (summary.status !== "ok") return { summary, log: null };
  const text = overviewText(company, store);
  if (!text) return { summary, log: null };
  const lines = await summarizeWithLlm(text, deps);
  if (!lines) {
    return {
      summary,
      log: { step: 0, type: "fallback", title: "하는 일 요약: AI 요약이 규칙을 어겨 미리 만든 요약을 씀", reason: "3줄, 숫자 없음 검증 실패", mode },
    };
  }
  return {
    summary: { ...summary, lines, method: "llm" },
    log: { step: 0, type: "decision", title: "하는 일 세 줄 요약을 AI가 사업의 개요에서 새로 작성", reason: "공시 문단만 읽고 숫자 없이 3줄로, 코드가 줄 수와 숫자를 검증", mode },
  };
}
