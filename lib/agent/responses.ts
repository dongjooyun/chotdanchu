// 채팅 응답 만들기. 에이전트 루프와 임시 규칙(폴백)이 같이 쓴다.
// 화면에 나가는 숫자(등급, 원시값)는 전부 여기서 코드로 만든다. LLM 문장에는 숫자를 넣지 않는다.
import type { AppMode, ChatResponse, LogLine } from "@/lib/chat";
import { findMockCandidates, toCandidateSummary } from "@/lib/data";
import { UNAVAILABLE_REASON_LABELS } from "@/lib/format";
import { computeIndicators, gradeDistribution } from "@/lib/indicators";
import { INDICATOR_LABELS, type Company } from "@/lib/types";

/** 임시 규칙으로 판단했을 때 붙이는 이유 */
export const RULE_REASON = "정해진 규칙으로 판단 (에이전트 모드가 꺼져 있거나 대체 경로)";

export function line(step: number, type: LogLine["type"], title: string, reason?: string, mode: AppMode = "mock"): LogLine {
  return { step, type, title, reason, mode };
}

/** 로그 줄의 step을 1부터 다시 매긴다. 여러 단계에서 모은 줄을 이어 붙일 때 쓴다 */
export function renumber(lines: LogLine[]): LogLine[] {
  return lines.map((l, i) => ({ ...l, step: i + 1 }));
}

/**
 * 기업 카드 응답. compute_indicators로 등급을 계산하고, 확인 불가 지표를 로그에 따로 남긴다 (PRD 07).
 * 예: 비공시 스타트업 -> 로그 "compute_indicators: A 3 · B 2 · C 0, 확인 불가 4개" + 확인 불가 줄
 */
export function companyResponse(company: Company, lead: LogLine[]): ChatResponse {
  const graded = computeIndicators(company);
  const d = gradeDistribution(graded, company.nature);
  const missing = graded.filter((g) => g.grade === null && g.reason);
  return {
    reply: `${company.name}의 기업 카드입니다.`,
    widget: { type: "company", company, graded },
    log: renumber([
      ...lead,
      line(0, "tool_call", `compute_indicators: A ${d.A} · B ${d.B} · C ${d.C}, 확인 불가 ${d.none}개`),
      ...missing.map((g) =>
        line(0, "unavailable", `${INDICATOR_LABELS[g.id]}: 확인 불가`, g.reason ? UNAVAILABLE_REASON_LABELS[g.reason] : g.basis),
      ),
    ]),
  };
}

/** 동명 후보 칩 응답 */
export function candidatesResponse(found: Company[], lead: LogLine[]): ChatResponse {
  return {
    reply: `같은 이름의 회사가 ${found.length}곳 있습니다. 대표자, 소재지, 업종, 설립연도를 보고 골라 주세요.`,
    widget: { type: "candidates", candidates: found.map(toCandidateSummary) },
    log: renumber(lead),
  };
}

/** 찾는 회사가 없을 때 */
export function notFoundResponse(message: string, lead: LogLine[]): ChatResponse {
  return {
    reply: `목업 기업 중에 "${message}"과(와) 같은 이름이 없습니다. 예시: 별하늘랩스, 몽돌커머스, 청솔기계`,
    log: renumber(lead),
  };
}

/**
 * 임시 규칙 경로. 에이전트 모드가 꺼져 있을 때, 그리고 LLM 호출이 실패했을 때 대신 쓴다.
 * lead: 앞에 붙일 로그 (예: 폴백 이유)
 */
export function ruleResponse(message: string, lead: LogLine[] = []): ChatResponse {
  const found = findMockCandidates(message);
  const search = line(0, "tool_call", `search_company: "${message}" 후보 ${found.length}곳`);
  if (found.length === 0) return notFoundResponse(message, [...lead, search]);
  if (found.length > 1) {
    return candidatesResponse(found, [...lead, search, line(0, "decision", "후보가 여럿이라 사용자에게 묻기로 함", RULE_REASON)]);
  }
  const company = found[0];
  return companyResponse(company, [
    ...lead,
    search,
    line(0, "decision", `후보가 하나라 묻지 않고 ${company.name}(으)로 확정`, RULE_REASON),
    line(0, "tool_call", "get_company_profile: 목업 데이터에서 지표 원시값을 읽음"),
  ]);
}
