// 3년차 공고와 비교한 역량 갭 (PRD 05). 모두 결정적 코드다. 사용자의 이력서나 경력은 쓰지 않는다.
// 실데이터 모드는 data/real/postings.json(준오 수동 확인 시드), 목업 모드는 data/mock/postings.json(가상 공고)을 쓴다.
//
// 무엇과 무엇을 비교하나: "이 회사의 3년차(경력 3~5년) 공고가 요구하는 역량"과 "그 직무 신입이 쌓을 수 있는 역량".
// - 3년차 쪽: 그 회사 공식 채용 페이지의 3년차 공고에서 요구 역량 문장을 발췌하고, 문장에서 역량 표현을 골랐다 (phrases)
// - 신입 쪽: 직무별 역량 사전(data/competencies/competencies.json)에서, 3년차 때 새로 요구될 것으로 따로 표시한 10개
//   (data/competencies/year3-expected.json)를 뺀 나머지다. 사전은 직무 단위라 회사마다 다르지 않다
//
// 분류 (팀 자체 기준, 11/22). 역량 하나(표현 하나)를 단위로 센다. 같은 역량이 두 번 나오면 한 번만 센다.
// - 이어짐(신입 때 쌓을 수 있는 역량): 같은 직무의 신입 역량에 있다
// - 공백(따로 채워야 하는 역량): 3년차 때 새로 요구되는 역량이거나, 다른 직무의 역량이거나, 어느 사전에도 없다(사전 보강 후보)
// 연차 조건, 태도(phrases가 빈 문장)와 우대 항목은 세지 않는다.
// 11/22 결정: 예전의 "일부(다른 직무 사전에만 있음)"는 사용자에게 쓸모가 없어 없앴다. 다른 직무의 역량도 이 직무 신입 때는 안 쌓이므로 공백이다.
import mockPostingsJson from "@/data/mock/postings.json";
import realPostingsJson from "@/data/real/postings.json";
import year3Json from "@/data/competencies/year3-expected.json";
import type { AppMode } from "@/lib/chat";
import { matchPhrase } from "@/lib/competencies";
import { competencyDictionary, getCompetencies } from "@/lib/data";
import type { Role } from "@/lib/types";

export interface PostingRequirement {
  /** 공고의 요구 역량 문장 (짧게 발췌) */
  text: string;
  /** 문장에서 고른 역량 표현. 비어 있으면 연차 조건이나 태도라 개수에서 뺀다 */
  phrases: string[];
  /** 우대 항목이면 true. 개수에서 뺀다 */
  preferred?: boolean;
}

export interface Posting {
  /** 비교 대상 기업의 OpenDART 고유번호. 목업 가상 공고는 "*" */
  companyId: string;
  role: Role;
  /** 공고를 낸 회사. 대체 칸이면 다른 회사 이름 */
  postedBy: string;
  title: string;
  /** 원문 요구 연차. 예: "5년 이상", "불명확 (원문: 3년 이하 ...)" */
  years: string;
  /** 공식 채용 페이지 원문 링크. 가상 공고는 "" */
  url: string;
  checkedAt: string;
  /** 같은 회사 공고가 없어 유사 기업 공고로 대신했으면 그 사유 */
  substitute: { reason: string } | null;
  requirements: PostingRequirement[];
}

export type GapKind = "connected" | "missing";

/** 역량 하나의 분류 결과 */
export interface GapItem {
  /** 화면에 보일 이름. 사전에 맞으면 사전 이름, 없으면 공고에서 고른 표현 */
  name: string;
  kind: GapKind;
  /** 공백인 이유. year3: 3년차 때 새로 요구, other_role: 다른 직무의 역량, unknown: 사전에 없음 */
  why?: "year3" | "other_role" | "unknown";
}

export interface CareerGap {
  posting: Posting;
  items: GapItem[];
  counts: { connected: number; missing: number };
  /** 사전에 없는 표현 (사전 보강 후보, PRD 05) */
  unmatched: string[];
}

const realPostings = (realPostingsJson as unknown as { postings: Posting[] }).postings;
const mockPostings = (mockPostingsJson as unknown as { postings: Posting[] }).postings;
const YEAR3_IDS = new Set((year3Json as { items: { id: string }[] }).items.map((i) => i.id));

/** 기업과 직무에 맞는 3년차 공고. 예: findPosting("00258801", "마케팅", "live")?.substitute !== null */
export function findPosting(companyId: string, role: Role, mode: AppMode): Posting | null {
  if (mode === "mock") return mockPostings.find((p) => p.role === role) ?? null;
  return realPostings.find((p) => p.companyId === companyId && p.role === role) ?? null;
}

/**
 * 역량 표현 하나를 분류한다.
 * 예: 마케팅 "프로모션 기획" -> connected(캠페인 기획·운영), "그로스 해킹" -> missing year3(그로스·리텐션),
 * "유관 부서 협업" -> missing other_role(협업·조율), "Braze 사용" -> missing unknown
 */
export function classifyPhrase(phrase: string, role: Role): GapItem {
  const own = matchPhrase(phrase, getCompetencies(role));
  if (own && !YEAR3_IDS.has(own.id)) return { name: own.name, kind: "connected" };
  if (own) return { name: own.name, kind: "missing", why: "year3" };
  const others = competencyDictionary.roles.filter((r) => r.role !== role).flatMap((r) => r.competencies);
  const other = matchPhrase(phrase, others);
  if (other) return { name: other.name, kind: "missing", why: "other_role" };
  return { name: phrase.trim(), kind: "missing", why: "unknown" };
}

/**
 * 역량 갭. 공고가 없으면 null (화면에는 "확인 불가").
 * 예: 무신사 마케팅 -> { connected: 1, missing: 4 }
 */
export function computeCareerGap(companyId: string, role: Role, mode: AppMode): CareerGap | null {
  const posting = findPosting(companyId, role, mode);
  if (!posting) return null;
  const phrases = posting.requirements.filter((r) => !r.preferred).flatMap((r) => r.phrases);
  const items: GapItem[] = [];
  for (const p of phrases) {
    const it = classifyPhrase(p, role);
    if (!items.some((x) => x.name === it.name)) items.push(it);
  }
  return {
    posting,
    items,
    counts: { connected: items.filter((i) => i.kind === "connected").length, missing: items.filter((i) => i.kind === "missing").length },
    unmatched: items.filter((i) => i.why === "unknown").map((i) => i.name),
  };
}

/**
 * 이어짐 비율 0~1 (신입 때 쌓을 수 있는 역량 / 3년차 때 요구되는 역량). 셀 역량이 없으면 null.
 * 예: 쌓을 수 있음 3, 따로 채움 2 -> 0.6
 */
export function connectRatio(counts: CareerGap["counts"]): number | null {
  const total = counts.connected + counts.missing;
  if (total === 0) return null;
  return counts.connected / total;
}

/**
 * 화면에 보일 역량 이름 목록. 3년차 때 새로 요구되는 역량에는 표시를 붙인다.
 * 예: { connected: ["CRM 마케팅"], missing: ["그로스·리텐션(3년차 때 새로 요구)", "Braze 사용"] }
 */
export function gapDetail(gap: CareerGap): { required: string[]; connected: string[]; missing: string[] } {
  return {
    required: gap.items.map((i) => i.name),
    connected: gap.items.filter((i) => i.kind === "connected").map((i) => i.name),
    missing: gap.items.filter((i) => i.kind === "missing").map((i) => (i.why === "year3" ? `${i.name}(3년차 때 새로 요구)` : i.name)),
  };
}

/** 사전에 따로 표시한 3년차 예상 역량 10개 (검증용) */
export const YEAR3_EXPECTED = (year3Json as { items: { id: string; name: string; role: Role }[] }).items;
