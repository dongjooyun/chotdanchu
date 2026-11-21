// "하는 일 세 줄 요약" (CDC-26, PRD 04). 사업보고서의 "사업의 개요" 문단을 수치 없이 문장 3줄로 보여준다.
// 숫자는 코드만 만든다 (CLAUDE.md 3번): 숫자가 든 문장은 요약에서 뺀다. 이 파일은 외부 API와 LLM을 부르지 않는다.
// - 목업 모드: 기업의 businessOverview 샘플 문단을 규칙으로 요약한다. 문단이 없으면 "공시 없음"
// - 실데이터 모드: 미리 계산해 둔 결과(data/real/business-summaries.json)를 읽는다. 파일에 없으면 "확인 불가"
//   (원문을 받아 요약하는 일은 scripts/build-business-summaries.mts가 한다)
// - 같은 기업은 한 번만 계산한다 (메모리 캐시)
import type { AppMode } from "@/lib/chat";
import type { BusinessSummary, Company, Source, SummaryMethod } from "@/lib/types";

/** 요약 줄 수 상한 */
export const SUMMARY_LINES = 3;

/** 사전 계산 파일(data/real/business-summaries.json) 한 항목. 실패는 저장하지 않아서 다시 돌리면 다시 시도한다 */
export type StoredSummary =
  | { status: "ok"; lines: string[]; source: Source; method: SummaryMethod }
  /** 사업보고서가 없는 기업. 확인한 날짜와 함께 저장한다 ("공시 없음") */
  | { status: "no_report"; checkedAt: string };

/** 키는 OpenDART 고유번호 */
export type SummaryStore = Record<string, StoredSummary>;

/** 수치가 든 문장인지. 아라비아 숫자(전각 포함)와 "퍼센트"를 본다. 예: "비중은 62%입니다" -> true, "고객은 제조사입니다" -> false */
export function hasNumber(sentence: string): boolean {
  return /[0-9０-９]|퍼센트/.test(sentence);
}

/**
 * 문단을 문장으로 나눈다. 마침표, 물음표, 느낌표 뒤의 공백이나 줄바꿈에서 자른다.
 * 소수점은 뒤에 공백이 없어서 안 잘린다.
 * 예: "A입니다. B입니다.\nC입니다" -> ["A입니다.", "B입니다.", "C입니다"]
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\r?\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

/**
 * 개요 문단에서 요약 줄을 고른다: 수치가 없는 문장을 앞에서부터 3개 (중복 제외).
 * 원문 문장을 그대로 쓰고 새 문장이나 숫자를 만들지 않는다.
 * 예: 문장 5개 중 3번째만 숫자가 있으면 -> [1번, 2번, 4번]
 *     수치 없는 문장이 2개뿐이면 2줄, 하나도 없으면 [] (빈 문단도 [])
 */
export function summarizeOverview(text: string): string[] {
  const picked: string[] = [];
  for (const s of splitSentences(text)) {
    if (hasNumber(s) || picked.includes(s)) continue;
    picked.push(s);
    if (picked.length === SUMMARY_LINES) break;
  }
  return picked;
}

export interface SummaryDeps {
  /** 사전 계산 결과 (실데이터). 기본값은 비어 있다 */
  store?: SummaryStore;
  /** 문단 -> 요약 줄. 테스트에서 호출 횟수를 셀 때 바꾼다 */
  summarize?: (text: string) => string[];
}

const cache = new Map<string, BusinessSummary>();

/** 캐시 비우기 (테스트용) */
export function clearSummaryCache(): void {
  cache.clear();
}

/**
 * 기업 카드에 보일 "하는 일 세 줄 요약"의 상태를 정한다. 같은 기업은 한 번만 계산한다.
 * 예: 사업의 개요가 있는 목업 상장사 -> { status: "ok", lines: [3줄], source, method: "rule" }
 *     사업보고서가 없는 목업 비상장사 -> { status: "no_report" } (공시 없음)
 *     아직 계산하지 않은 실데이터 기업 -> { status: "unavailable", reason: "not_computed" } (확인 불가)
 */
export function getBusinessSummary(company: Company, mode: AppMode, deps: SummaryDeps = {}): BusinessSummary {
  const key = `${mode}:${company.id}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const result = mode === "mock" ? mockSummary(company, deps.summarize ?? summarizeOverview) : liveSummary(company, deps.store ?? {});
  // 확인한 결과(ok, no_report)만 캐시한다. 계산하지 못한 상태는 다음에 다시 시도한다
  if (result.status !== "unavailable") cache.set(key, result);
  return result;
}

function mockSummary(company: Company, summarize: (text: string) => string[]): BusinessSummary {
  const overview = company.businessOverview;
  if (!overview) return { status: "no_report" };
  const lines = summarize(overview.text);
  if (lines.length === 0) return { status: "unavailable", reason: "fetch_failed" };
  return { status: "ok", lines, source: overview.source, method: "rule" };
}

function liveSummary(company: Company, store: SummaryStore): BusinessSummary {
  const stored = company.corpCode ? store[company.corpCode] : undefined;
  if (!stored) return { status: "unavailable", reason: "not_computed" };
  if (stored.status === "no_report") return { status: "no_report" };
  return { status: "ok", lines: stored.lines, source: stored.source, method: stored.method };
}
