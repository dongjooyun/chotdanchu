// 3년차 공고와 비교한 역량 갭 (PRD 05). 모두 결정적 코드다.
// 실데이터 모드는 data/real/postings.json(준오 수동 확인 시드), 목업 모드는 data/mock/postings.json(가상 공고)을 쓴다.
//
// 분류 기준 (팀 자체 기준, 11/21):
// - 이어짐: 공고 문장의 역량 표현이 같은 직무의 역량 사전에 있다. 신입으로 이 직무를 하면 매일 쌓는 역량이다
// - 일부: 같은 직무 사전에는 없고 다른 직무 사전에 있다. 이 자리에서 곁눈으로 접하지만 따로 키워야 한다
// - 공백: 어느 사전에도 없다. 그 회사·도메인 고유의 요구라 따로 채워야 한다. 이 표현들은 사전 보강 후보로 모은다
// 연차 조건, 태도(phrases가 빈 문장)와 우대 항목은 개수에서 뺀다.
import mockPostingsJson from "@/data/mock/postings.json";
import realPostingsJson from "@/data/real/postings.json";
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

export type GapKind = "connected" | "partial" | "missing";

export interface GapItem {
  text: string;
  kind: GapKind;
  /** 맞은 역량 이름 (이어짐, 일부). 공백이면 문장에서 고른 표현 */
  names: string[];
}

export interface CareerGap {
  posting: Posting;
  items: GapItem[];
  counts: { connected: number; partial: number; missing: number };
  /** 사전에 없는 표현 (사전 보강 후보, PRD 05) */
  unmatched: string[];
}

const realPostings = (realPostingsJson as unknown as { postings: Posting[] }).postings;
const mockPostings = (mockPostingsJson as unknown as { postings: Posting[] }).postings;

/** 기업과 직무에 맞는 3년차 공고. 예: findPosting("00258801", "마케팅", "live")?.substitute !== null */
export function findPosting(companyId: string, role: Role, mode: AppMode): Posting | null {
  if (mode === "mock") return mockPostings.find((p) => p.role === role) ?? null;
  return realPostings.find((p) => p.companyId === companyId && p.role === role) ?? null;
}

/** 다른 직무의 사전 (일부 판정용). 예: otherRoleCompetencies("마케팅") -> 서비스기획 + 운영 역량 */
function otherRoleCompetencies(role: Role) {
  return competencyDictionary.roles.filter((r) => r.role !== role).flatMap((r) => r.competencies);
}

/**
 * 공고 문장 하나를 분류한다. 표현 중 하나라도 같은 직무 사전에 맞으면 이어짐, 아니면 다른 직무 사전에 맞으면 일부, 아니면 공백.
 * 예: 마케팅 "브레이즈(Braze) 사용 경험" ["Braze 사용"] -> missing, "여러 부서와 ... 협업" ["유관 부서 협업"] -> partial (서비스기획 사전)
 */
export function classifyRequirement(req: PostingRequirement, role: Role): GapItem & { unmatched: string[] } {
  const own = getCompetencies(role);
  const others = otherRoleCompetencies(role);
  const ownHits = req.phrases.map((p) => matchPhrase(p, own)).filter((m) => m !== null);
  if (ownHits.length > 0) return { text: req.text, kind: "connected", names: unique(ownHits.map((m) => m.name)), unmatched: [] };
  const otherHits = req.phrases.map((p) => matchPhrase(p, others)).filter((m) => m !== null);
  if (otherHits.length > 0) return { text: req.text, kind: "partial", names: unique(otherHits.map((m) => m.name)), unmatched: [] };
  return { text: req.text, kind: "missing", names: req.phrases, unmatched: req.phrases };
}

/**
 * 역량 갭. 공고가 없으면 null (화면에는 "확인 불가").
 * 예: 무신사 마케팅 -> { connected: 1, partial: 2, missing: 1 }
 */
export function computeCareerGap(companyId: string, role: Role, mode: AppMode): CareerGap | null {
  const posting = findPosting(companyId, role, mode);
  if (!posting) return null;
  const counted = posting.requirements.filter((r) => !r.preferred && r.phrases.length > 0);
  const classified = counted.map((r) => classifyRequirement(r, role));
  const counts = { connected: 0, partial: 0, missing: 0 };
  for (const c of classified) counts[c.kind] += 1;
  return {
    posting,
    items: classified.map(({ text, kind, names }) => ({ text, kind, names })),
    counts,
    unmatched: unique(classified.flatMap((c) => c.unmatched)),
  };
}

/**
 * 이어짐 비율 0~1. 일부는 절반으로 센다. 셀 문장이 없으면 null.
 * 예: 이어짐 1, 일부 2, 공백 1 -> (1 + 2 * 0.5) / 4 = 0.5
 */
export function connectRatio(counts: CareerGap["counts"]): number | null {
  const total = counts.connected + counts.partial + counts.missing;
  if (total === 0) return null;
  return (counts.connected + counts.partial * 0.5) / total;
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
