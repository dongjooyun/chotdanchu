// 역량 매칭 (extract_competencies의 코드 부분). 공고에서 뽑은 역량 표현을 역량 사전의 이름으로 맞춘다.
// 공고 문구에서 표현을 뽑는 일은 작은 모델(LLM)이 하고 프롬프트는 준오가 맡는다 (CDC-24 메모).
// 여기서는 뽑힌 표현 목록을 받아 사전과 맞추고, 맞지 않은 표현은 따로 모아 사전 보강에 쓴다 (PRD 05).
import type { Competency } from "./data";

export interface MatchedCompetency {
  /** 공고에서 뽑힌 원래 표현 */
  phrase: string;
  id: string;
  name: string;
  /** exact: 이름·유의어와 같음, contains: 한쪽이 다른 쪽을 포함 */
  via: "exact" | "contains";
  /** 무엇과 맞았는지 (이름 또는 유의어) */
  term: string;
}

export interface MatchResult {
  matched: MatchedCompetency[];
  /** 사전에 없는 표현. 사전 보강 후보 */
  unmatched: string[];
}

/**
 * 비교용으로 표현을 다듬는다. 공백, 가운뎃점, 괄호, 문장부호를 지우고 영어는 소문자로.
 * 예: "화면설계서(스토리보드) 작성" -> "화면설계서스토리보드작성", "SQL 활용" -> "sql활용"
 */
export function normalizePhrase(s: string): string {
  return s.toLowerCase().replace(/[\s·・,./()[\]{}\-_~!?:;'"“”‘’]/g, "");
}

/** 포함 비교에 쓰기엔 너무 짧은 말 (예: "기획", "운영"만으로 아무 데나 맞는 것을 막는다) */
const MIN_CONTAINS_LENGTH = 4;

/**
 * 표현 하나를 사전에 맞춘다. 같은 말이 있으면 exact, 없으면 가장 긴 말끼리 포함하는 쪽을 contains로 고른다.
 * 예: "PRD 작성" -> 기획서 작성(exact), "주간 KPI 설정 및 관리" -> 성과 지표 관리(contains, "KPI 설정"), "영상 편집" -> null
 */
export function matchPhrase(phrase: string, dictionary: Competency[]): MatchedCompetency | null {
  const p = normalizePhrase(phrase);
  if (!p) return null;
  let best: MatchedCompetency | null = null;
  let bestLength = 0;
  for (const c of dictionary) {
    for (const term of [c.name, ...c.synonyms]) {
      const t = normalizePhrase(term);
      if (!t) continue;
      if (t === p) return { phrase, id: c.id, name: c.name, via: "exact", term };
      const shorter = Math.min(t.length, p.length);
      if (shorter >= MIN_CONTAINS_LENGTH && (p.includes(t) || t.includes(p)) && shorter > bestLength) {
        best = { phrase, id: c.id, name: c.name, via: "contains", term };
        bestLength = shorter;
      }
    }
  }
  return best;
}

/**
 * 표현 목록을 사전에 맞춘다. 같은 표현이 두 번 나와도 한 번만 센다.
 * 예: matchCompetencies(["PRD 작성", "영상 편집"], 서비스기획 사전)
 *   -> { matched: [{ phrase: "PRD 작성", id: "spec-writing", ... }], unmatched: ["영상 편집"] }
 */
export function matchCompetencies(phrases: string[], dictionary: Competency[]): MatchResult {
  const seen = new Set<string>();
  const result: MatchResult = { matched: [], unmatched: [] };
  for (const raw of phrases) {
    const phrase = raw.trim();
    const key = normalizePhrase(phrase);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const m = matchPhrase(phrase, dictionary);
    if (m) result.matched.push(m);
    else result.unmatched.push(phrase);
  }
  return result;
}

/** 매칭된 역량 id를 중복 없이. 예: 두 표현이 모두 spec-writing이면 ["spec-writing"] */
export function matchedIds(result: MatchResult): string[] {
  return [...new Set(result.matched.map((m) => m.id))];
}
