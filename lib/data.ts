// 데이터 파일 읽기. 목업 기업(data/mock/)은 목업 모드에서만, 실데이터 시연 기업(data/real/)은 실데이터 모드에서만,
// 역량 사전(data/competencies/)은 항상 쓴다.
// 실데이터는 scripts/build-real-companies.mts가 공공 출처에서 미리 계산해 둔 파일이다. 실행 중에는 외부 API를 부르지 않는다.
import companiesJson from "@/data/mock/companies.json";
import realCompaniesJson from "@/data/real/companies.json";
import realBusinessSummariesJson from "@/data/real/business-summaries.json";
import type { SummaryStore } from "@/lib/business-summary";
import competenciesJson from "@/data/competencies/competencies.json";
import type { AppMode, CandidateSummary } from "@/lib/chat";
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
export const realCompanies = realCompaniesJson as unknown as Company[];
/** 사전 계산한 "하는 일 세 줄 요약" (scripts/build-business-summaries.mts). 키는 OpenDART 고유번호. 아직 안 만든 기업은 없다 */
export const realBusinessSummaries = realBusinessSummariesJson as unknown as SummaryStore;
export const competencyDictionary = competenciesJson as unknown as CompetencyDictionary;

/** 모드에 맞는 기업 목록. 목업 모드 30곳, 실데이터 모드는 사전 계산한 시연 기업 */
export function companiesFor(mode: AppMode): Company[] {
  return mode === "live" ? realCompanies : mockCompanies;
}

/** 기업 하나. 예: getCompany("00258801", "live")?.name === "주식회사 카카오" */
export function getCompany(id: string, mode: AppMode): Company | undefined {
  return companiesFor(mode).find((c) => c.id === id);
}

/**
 * 이름이 같은 후보. 예: findCandidates("카카오", "live") -> 2곳 (상장 법인, 2014년 폐업한 동명 법인)
 */
export function findCandidates(query: string, mode: AppMode): Company[] {
  const q = normalizeCompanyName(query);
  if (!q) return [];
  return companiesFor(mode).filter(
    (c) => normalizeCompanyName(c.name) === q || (c.aliases ?? []).some((a) => normalizeCompanyName(a) === q),
  );
}

/** 예시 버튼과 안내 문구에 쓸 기업 이름 (법인명에서 "주식회사"를 뺀 이름, 중복 없이). 예: exampleNames("live") -> ["카카오", "무신사", "컬리", "당근마켓"] */
export function exampleNames(mode: AppMode): string[] {
  if (mode === "mock") return ["별하늘랩스", "몽돌커머스", "청솔기계"];
  return [...new Set(realCompanies.map((c) => normalizeCompanyName(c.name)))];
}

/** 직무별 역량 목록. 예: getCompetencies("마케팅").length === 16 */
export function getCompetencies(role: Role): Competency[] {
  return competencyDictionary.roles.find((r) => r.role === role)?.competencies ?? [];
}

/** 목업 기업 하나. 예: getMockCompany("mock-001")?.name === "별하늘랩스(주)" */
export function getMockCompany(id: string): Company | undefined {
  return getCompany(id, "mock");
}

/**
 * 법인 표기와 공백을 뺀 이름.
 * 예: "주식회사 몽돌커머스" -> "몽돌커머스", "몽돌커머스(주)" -> "몽돌커머스", "(주) 하늘 커머스" -> "하늘커머스"
 */
export function normalizeCompanyName(name: string): string {
  return name.replace(/주식회사|\(주\)|（주）|㈜/g, "").replace(/\s+/g, "");
}

/**
 * 목업 기업 중 이름이 같은 후보.
 * 예: findMockCandidates("몽돌커머스") -> 2곳, findMockCandidates("없는회사") -> []
 */
export function findMockCandidates(query: string): Company[] {
  return findCandidates(query, "mock");
}

/**
 * 후보 칩에 보일 상태 표시. 상장 여부와 휴폐업은 이름이 같은 회사를 가르는 가장 빠른 단서다.
 * 예: 상장 카카오 -> ["상장"], 2014년 폐업한 동명 법인 -> ["폐업"]
 */
function candidateTags(c: Company): string[] {
  const tags: string[] = [];
  if (c.disclosure === "listed") tags.push("상장");
  const risk = c.indicators.find((i) => i.id === "risk");
  if (risk?.extra?.closed) tags.push("폐업");
  if (risk?.extra?.suspended) tags.push("휴업");
  return tags;
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
    tags: candidateTags(c),
  };
}
