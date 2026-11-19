// 데이터 파일 읽기. 목업 기업(data/mock/)은 목업 모드에서만, 역량 사전(data/competencies/)은 항상 쓴다.
import companiesJson from "@/data/mock/companies.json";
import competenciesJson from "@/data/competencies/competencies.json";
import type { CandidateSummary } from "@/lib/chat";
import type { Company, Role } from "@/lib/types";

export interface Competency {
  id: string;
  name: string;
  description: string;
  synonyms: string[];
}

interface CompetencyDictionary {
  version: number;
  roles: { role: Role; competencies: Competency[] }[];
}

// JSON을 그대로 import하면 문자열 값이 넓은 string 타입이 되어서, 스키마 타입으로 한 번 맞춘다.
// 형식 검증은 데이터를 만들 때 tsc로 했다 (PR #8).
export const mockCompanies = companiesJson as unknown as Company[];
export const competencyDictionary = competenciesJson as unknown as CompetencyDictionary;

/** 직무별 역량 목록. 예: getCompetencies("마케팅").length === 16 */
export function getCompetencies(role: Role): Competency[] {
  return competencyDictionary.roles.find((r) => r.role === role)?.competencies ?? [];
}

/** 목업 기업 하나. 예: getMockCompany("mock-001")?.name === "별하늘랩스(주)" */
export function getMockCompany(id: string): Company | undefined {
  return mockCompanies.find((c) => c.id === id);
}

/**
 * 법인 표기와 공백을 뺀 이름.
 * 예: "주식회사 몽돌커머스" -> "몽돌커머스", "몽돌커머스(주)" -> "몽돌커머스", "(주) 하늘 커머스" -> "하늘커머스"
 */
export function normalizeCompanyName(name: string): string {
  return name.replace(/주식회사|\(주\)|（주）|㈜/g, "").replace(/\s+/g, "");
}

/**
 * 목업 기업 중 이름이 같은 후보. 임시 로직이고, 실제 동명 판별은 에이전트 루프(CDC-14)가 한다.
 * 예: findMockCandidates("몽돌커머스") -> 2곳, findMockCandidates("없는회사") -> []
 */
export function findMockCandidates(query: string): Company[] {
  const q = normalizeCompanyName(query);
  if (!q) return [];
  return mockCompanies.filter((c) => normalizeCompanyName(c.name) === q);
}

/** 후보 칩에 보일 요약. 예: { name: "주식회사 몽돌커머스", foundedYear: "2009", ... } */
export function toCandidateSummary(c: Company): CandidateSummary {
  return {
    id: c.id,
    name: c.name,
    ceoName: c.ceoName,
    address: c.address,
    industry: c.industry,
    foundedYear: c.foundedOn ? c.foundedOn.slice(0, 4) : null,
  };
}
