// 에이전트 도구 정의와 실행부. 실제 일은 lib/data.ts, lib/indicators.ts가 하고 여기는 얇게 감싼다.
// 도구마다 reason(왜 이 도구를 부르는지)을 필수로 받아서 판단 로그의 근거로 쓴다.
// LLM에게 돌려주는 결과에는 대표자 이름을 넣지 않는다 (CLAUDE.md 절대 규칙 1).
import type Anthropic from "@anthropic-ai/sdk";
import { getMode } from "@/lib/config";
import { findCandidates, getCompany } from "@/lib/data";
import { DISCLOSURE_LABELS, NATURE_LABELS } from "@/lib/format";
import type { Company } from "@/lib/types";

const reason = { type: "string", description: "이 도구를 지금 부르는 이유 한 문장 (판단 로그에 그대로 보인다)" } as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_company",
    description:
      "회사 이름으로 동명 후보를 찾는다. 법인 표기와 띄어쓰기는 무시한다. 후보마다 id, 이름, 업종, 소재지(시·구), 설립연도를 돌려준다.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "사용자가 말한 회사 이름" }, reason },
      required: ["query", "reason"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "show_choices",
    description:
      "후보가 둘 이상이라 사용자가 골라야 할 때 후보 칩을 화면에 띄운다. 이 도구를 부르면 이번 차례가 끝난다.",
    input_schema: {
      type: "object",
      properties: {
        company_ids: { type: "array", items: { type: "string" }, description: "search_company가 돌려준 후보 id들" },
        reason,
      },
      required: ["company_ids", "reason"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_company_profile",
    description: "회사 하나의 기본 정보(업종, 기업 유형, 공시 수준, 설립연도)와 지표 원시값이 있는 개수를 돌려준다.",
    input_schema: {
      type: "object",
      properties: { company_id: { type: "string" }, reason },
      required: ["company_id", "reason"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "compute_indicators",
    description:
      "회사 하나로 확정됐을 때 10가지 지표 등급을 코드로 계산해 기업 카드를 띄운다. 숫자는 이 도구만 만든다. 이 도구를 부르면 이번 차례가 끝난다.",
    input_schema: {
      type: "object",
      properties: { company_id: { type: "string" }, reason },
      required: ["company_id", "reason"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export type ToolName = "search_company" | "show_choices" | "get_company_profile" | "compute_indicators";

/** 도구 실행 결과. terminal이면 루프가 여기서 끝나고 화면 위젯을 띄운다 */
export type ToolOutcome =
  | { kind: "result"; content: string; summary: string }
  | { kind: "error"; content: string; summary: string }
  | { kind: "choices"; companies: Company[] }
  | { kind: "company"; company: Company };

function str(input: Record<string, unknown>, key: string): string | null {
  const v = input[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function error(content: string): ToolOutcome {
  return { kind: "error", content, summary: content };
}

/**
 * 도구 하나 실행. 잘못된 이름이나 인자는 예외 대신 오류 결과로 돌려줘서 모델이 고칠 수 있게 한다.
 * 예: runTool("search_company", { query: "몽돌커머스" }) -> 후보 2곳 JSON
 */
export function runTool(name: string, input: Record<string, unknown>): ToolOutcome {
  switch (name) {
    case "search_company": {
      const query = str(input, "query");
      if (!query) return error("query가 비어 있습니다");
      const found = findCandidates(query.slice(0, 100), getMode());
      const candidates = found.map((c) => ({
        id: c.id,
        name: c.name,
        industry: c.industry,
        address: c.address,
        foundedYear: c.foundedOn ? c.foundedOn.slice(0, 4) : null,
      }));
      return {
        kind: "result",
        content: JSON.stringify({ count: candidates.length, candidates }),
        summary: `"${query}" 후보 ${candidates.length}곳`,
      };
    }
    case "show_choices": {
      const ids = Array.isArray(input.company_ids) ? input.company_ids.filter((x): x is string => typeof x === "string") : [];
      const companies = [...new Set(ids)].map((id) => getCompany(id, getMode())).filter((c): c is Company => Boolean(c));
      if (companies.length < 2) return error("후보 칩은 존재하는 회사 id가 2개 이상일 때만 띄울 수 있습니다");
      return { kind: "choices", companies };
    }
    case "get_company_profile": {
      const id = str(input, "company_id");
      const c = id ? getCompany(id, getMode()) : undefined;
      if (!c) return error(`없는 회사 id입니다: ${id ?? "(비어 있음)"}`);
      const available = c.indicators.filter((i) => i.status !== "unavailable").length;
      return {
        kind: "result",
        content: JSON.stringify({
          id: c.id,
          name: c.name,
          industry: c.industry,
          nature: NATURE_LABELS[c.nature],
          disclosure: DISCLOSURE_LABELS[c.disclosure],
          foundedYear: c.foundedOn ? c.foundedOn.slice(0, 4) : null,
          indicatorsWithValue: available,
        }),
        summary: `${c.name}: ${NATURE_LABELS[c.nature]}, 원시값 있는 지표 ${available}개`,
      };
    }
    case "compute_indicators": {
      const id = str(input, "company_id");
      const c = id ? getCompany(id, getMode()) : undefined;
      if (!c) return error(`없는 회사 id입니다: ${id ?? "(비어 있음)"}`);
      return { kind: "company", company: c };
    }
    default:
      return error(`없는 도구입니다: ${name}`);
  }
}
