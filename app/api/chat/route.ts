// 채팅 API 자리. 지금은 목업 모드에서 정해진 규칙으로만 답한다.
// 실제 에이전트 루프(LLM이 다음 도구를 고르는 구조, 호출 상한 8회)는 CDC-14에서 이 파일에 붙인다.
import type { ChatRequest, ChatResponse, LogLine } from "@/lib/chat";
import { getMode } from "@/lib/config";
import { findMockCandidates, getMockCompany, toCandidateSummary } from "@/lib/data";
import { computeIndicators, gradeDistribution } from "@/lib/indicators";
import { UNAVAILABLE_REASON_LABELS } from "@/lib/format";
import { INDICATOR_LABELS, type Company } from "@/lib/types";

const TEMP = "임시 규칙 (CDC-14에서 에이전트 판단으로 교체)";

function line(step: number, type: LogLine["type"], title: string, reason?: string): LogLine {
  return { step, type, title, reason, mode: "mock" };
}

/**
 * 기업 카드 응답. compute_indicators로 등급을 계산하고, 확인 불가 지표를 로그에 따로 남긴다 (PRD 07).
 * 예: 비공시 스타트업 -> 로그 "compute_indicators: A 3 · B 2 · C 0, 확인 불가 4개" + 확인 불가 줄
 */
function companyResponse(company: Company, first: number, lead: LogLine[]): ChatResponse {
  const graded = computeIndicators(company);
  const d = gradeDistribution(graded, company.nature);
  const missing = graded.filter((g) => g.grade === null && g.reason);
  return {
    reply: `${company.name}의 기업 카드입니다.`,
    widget: { type: "company", company, graded },
    log: [
      ...lead,
      line(first, "tool_call", `get_company_profile: 목업 데이터에서 지표 원시값을 읽음`),
      line(first + 1, "tool_call", `compute_indicators: A ${d.A} · B ${d.B} · C ${d.C}, 확인 불가 ${d.none}개`),
      ...missing.map((g, i) =>
        line(first + 2 + i, "unavailable", `${INDICATOR_LABELS[g.id]}: 확인 불가`, g.reason ? UNAVAILABLE_REASON_LABELS[g.reason] : g.basis),
      ),
    ],
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatRequest | null;
  if (!body) return Response.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });

  if (getMode() === "live") {
    const res: ChatResponse = {
      reply: "실데이터 모드는 아직 연결되지 않았습니다. 지금은 목업 모드(USE_MOCK=true)로 확인해 주세요.",
      log: [{ step: 1, type: "info", title: "실데이터 모드 미연결", mode: "live" }],
    };
    return Response.json(res);
  }

  if (body.pickCompanyId) {
    const company = getMockCompany(body.pickCompanyId);
    if (!company) return Response.json({ error: "없는 기업입니다" }, { status: 404 });
    const res = companyResponse(company, 2, [
      line(1, "decision", `사용자가 후보 중 ${company.name}을(를) 골라 확정`, "동명 후보 중 사용자 선택"),
    ]);
    return Response.json(res);
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 100) : "";
  if (!message) return Response.json({ error: "메시지가 비어 있습니다" }, { status: 400 });

  const found = findMockCandidates(message);
  if (found.length === 0) {
    const res: ChatResponse = {
      reply: `목업 기업 중에 "${message}"과(와) 같은 이름이 없습니다. 예시: 별하늘랩스, 몽돌커머스, 청솔기계`,
      log: [line(1, "tool_call", `search_company: "${message}" 후보 0곳`)],
    };
    return Response.json(res);
  }
  if (found.length > 1) {
    const res: ChatResponse = {
      reply: `같은 이름의 회사가 ${found.length}곳 있습니다. 대표자, 소재지, 업종, 설립연도를 보고 골라 주세요.`,
      widget: { type: "candidates", candidates: found.map(toCandidateSummary) },
      log: [
        line(1, "tool_call", `search_company: "${message}" 후보 ${found.length}곳`),
        line(2, "decision", "후보가 여럿이라 사용자에게 묻기로 함", TEMP),
      ],
    };
    return Response.json(res);
  }
  const company = found[0];
  const res = companyResponse(company, 3, [
    line(1, "tool_call", `search_company: "${message}" 후보 1곳`),
    line(2, "decision", `후보가 하나라 묻지 않고 ${company.name}(으)로 확정`, TEMP),
  ]);
  return Response.json(res);
}
