// 채팅 응답 만들기. 에이전트 루프와 임시 규칙(폴백)이 같이 쓴다.
// 화면에 나가는 숫자(등급, 원시값)는 전부 여기서 코드로 만든다. LLM 문장에는 숫자를 넣지 않는다.
import type { AppMode, ChatResponse, LogLine } from "@/lib/chat";
import { getMode } from "@/lib/config";
import { getBusinessSummary } from "@/lib/business-summary";
import { exampleNames, findCandidates, realBusinessSummaries, toCandidateSummary } from "@/lib/data";
import { SUMMARY_UNAVAILABLE_LABELS, UNAVAILABLE_REASON_LABELS } from "@/lib/format";
import { computeIndicators, gradeDistribution } from "@/lib/indicators";
import { INDICATOR_LABELS, type BusinessSummary, type Company } from "@/lib/types";

/** 임시 규칙으로 판단했을 때 붙이는 이유 */
export const RULE_REASON = "정해진 규칙으로 판단 (에이전트 모드가 꺼져 있거나 대체 경로)";

export function line(step: number, type: LogLine["type"], title: string, reason?: string, mode: AppMode = getMode()): LogLine {
  return { step, type, title, reason, mode };
}

/** 지표 원시값을 어디서 읽었는지 판단 로그 한 줄 */
export function profileLine(): LogLine {
  return getMode() === "live"
    ? line(0, "tool_call", "get_company_profile: 공공데이터(OpenDART, 국민연금, 국세청)로 미리 계산해 둔 원시값을 읽음")
    : line(0, "tool_call", "get_company_profile: 목업 데이터에서 지표 원시값을 읽음");
}

/** 로그 줄의 step을 1부터 다시 매긴다. 여러 단계에서 모은 줄을 이어 붙일 때 쓴다 */
export function renumber(lines: LogLine[]): LogLine[] {
  return lines.map((l, i) => ({ ...l, step: i + 1 }));
}

/**
 * "하는 일 세 줄 요약" 판단 로그 한 줄 (CDC-26).
 * 예: 요약 있음 -> tool_call "get_business_summary: 사업의 개요를 3줄로 요약함 (원문 문장 선택)"
 *     사업보고서 없음 -> info "하는 일 요약: 공시 없음" (확인한 결과라서 확인 불가 줄이 아니다)
 *     아직 못 만듦 -> unavailable "하는 일 요약: 확인 불가"
 */
export function summaryLogLine(summary: BusinessSummary): LogLine {
  switch (summary.status) {
    case "ok":
      return line(
        0,
        "tool_call",
        `get_business_summary: 사업의 개요를 ${summary.lines.length}줄로 요약함 (${summary.method === "llm" ? "AI 요약, 숫자 없음 검증" : "원문 문장 선택, 숫자 문장 제외"})`,
      );
    case "no_report":
      return line(0, "info", "하는 일 요약: 공시 없음", "사업보고서가 없는 기업이라 요약을 보여주지 않음");
    case "unavailable":
      return line(0, "unavailable", "하는 일 요약: 확인 불가", SUMMARY_UNAVAILABLE_LABELS[summary.reason]);
  }
}

/**
 * 기업 카드 응답. compute_indicators로 등급을 계산하고, 확인 불가 지표를 로그에 따로 남긴다 (PRD 07).
 * 하는 일 세 줄 요약은 코드가 만들어 카드에 같이 실어 보낸다 (CDC-26).
 * 예: 비공시 스타트업 -> 로그 "compute_indicators: A 3 · B 2 · C 0, 확인 불가 4개" + 확인 불가 줄 + "하는 일 요약: 공시 없음"
 */
export function companyResponse(company: Company, lead: LogLine[]): ChatResponse {
  const graded = computeIndicators(company);
  const d = gradeDistribution(graded, company.nature);
  const missing = graded.filter((g) => g.grade === null && g.reason);
  const summary = getBusinessSummary(company, getMode(), { store: realBusinessSummaries });
  return {
    reply: `${company.name}의 기업 분석 결과입니다.`,
    widget: { type: "company", company, graded, summary },
    log: renumber([
      ...lead,
      line(0, "tool_call", `compute_indicators: A ${d.A} · B ${d.B} · C ${d.C}, 확인 불가 ${d.none}개`),
      ...missing.map((g) =>
        line(0, "unavailable", `${INDICATOR_LABELS[g.id]}: 확인 불가`, g.reason ? UNAVAILABLE_REASON_LABELS[g.reason] : g.basis),
      ),
      summaryLogLine(summary),
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
  const examples = exampleNames(getMode()).join(", ");
  const reply =
    getMode() === "live"
      ? `"${message}"은(는) 아직 준비되지 않은 회사예요. 지금은 공공데이터로 미리 계산해 둔 시연 기업만 볼 수 있어요: ${examples}`
      : `목업 기업 중에 "${message}"과(와) 같은 이름이 없습니다. 예시: ${examples}`;
  return { reply, log: renumber(lead) };
}

/**
 * 임시 규칙 경로. 에이전트 모드가 꺼져 있을 때, 그리고 LLM 호출이 실패했을 때 대신 쓴다.
 * lead: 앞에 붙일 로그 (예: 폴백 이유)
 */
export function ruleResponse(message: string, lead: LogLine[] = []): ChatResponse {
  const found = findCandidates(message, getMode());
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
    profileLine(),
  ]);
}
