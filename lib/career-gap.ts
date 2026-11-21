// 3년차 공고와 비교한 역량 갭 (PRD 05). 모두 결정적 코드다. 사용자의 이력서나 경력은 쓰지 않는다.
// 실데이터 모드는 data/real/postings.json(준오 수동 확인 시드), 목업 모드는 data/mock/postings.json(가상 공고)을 쓴다.
//
// 무엇과 무엇을 견주나: "이 직무의 신입이 쌓는 역량"과 "3년차(경력 3~5년) 공고가 요구하는 역량".
// 신입이 쌓는 역량 = 직무별 역량 사전(data/competencies/competencies.json)에서 3년차 예상 역량 10개(year3-expected.json)를 뺀 것.
// 한계: 사전은 신입 공고와 3년차 공고를 나눠 모은 것이 아니라 Claude 초안을 공고 몇 건으로 검수한 것이고, 신입 공고는 수집하지 않는다.
//
// 분류 (팀 자체 기준, 11/22). 공고 문장 하나는 역량 표현(phrases)을 사전에 맞춰 아래 순서로 정한다.
// - 이어짐: 같은 직무의 신입 역량에 있다
// - 공백: 같은 직무의 3년차 예상 역량에 있다(3년차에 새로 요구, newAtYear3), 또는 어느 사전에도 없다(사전 보강 후보). 따로 채워야 한다
// - 일부: 위에 없고 다른 직무의 신입 역량에 있다. 이 직무 일만으로는 안 쌓이고 다른 직무 일과 겹친다
// 연차 조건, 태도(phrases가 빈 문장)와 우대 항목은 개수에서 뺀다.
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

export type GapKind = "connected" | "partial" | "missing";

export interface GapItem {
  text: string;
  kind: GapKind;
  /** 맞은 역량 이름 (이어짐, 일부, 3년차에 새로 요구). 사전에 없으면 문장에서 고른 표현 */
  names: string[];
  /** 공백 중 같은 직무 사전의 3년차 예상 역량에 맞은 것 (신입 때는 안 쌓이고 3년차에 새로 요구) */
  newAtYear3?: boolean;
  /** 일부일 때 그 역량이 있는 다른 직무 */
  fromRoles?: Role[];
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
const YEAR3_IDS = new Set((year3Json as { ids: string[] }).ids);

/** 기업과 직무에 맞는 3년차 공고. 예: findPosting("00258801", "마케팅", "live")?.substitute !== null */
export function findPosting(companyId: string, role: Role, mode: AppMode): Posting | null {
  if (mode === "mock") return mockPostings.find((p) => p.role === role) ?? null;
  return realPostings.find((p) => p.companyId === companyId && p.role === role) ?? null;
}

/**
 * 공고 문장 하나를 분류한다.
 * 예: 마케팅 "유관 부서 협업" -> partial (서비스기획 신입 역량), "그로스 해킹" -> missing + newAtYear3 (그로스·리텐션은 3년차 예상 역량),
 * "Braze 사용" -> missing (사전에 없음), "프로모션 기획" -> connected
 */
export function classifyRequirement(req: PostingRequirement, role: Role): GapItem & { unmatched: string[] } {
  const own = getCompetencies(role);
  const ownHits = req.phrases.map((p) => matchPhrase(p, own)).filter((m) => m !== null);
  const juniorHits = ownHits.filter((m) => !YEAR3_IDS.has(m.id));
  if (juniorHits.length > 0) return { text: req.text, kind: "connected", names: unique(juniorHits.map((m) => m.name)), unmatched: [] };
  const year3Hits = ownHits.filter((m) => YEAR3_IDS.has(m.id));
  if (year3Hits.length > 0) return { text: req.text, kind: "missing", names: unique(year3Hits.map((m) => m.name)), newAtYear3: true, unmatched: [] };
  const others = competencyDictionary.roles
    .filter((r) => r.role !== role)
    .flatMap((r) => r.competencies.filter((c) => !YEAR3_IDS.has(c.id)).map((c) => ({ ...c, role: r.role })));
  const otherHits = req.phrases
    .map((p) => {
      const m = matchPhrase(p, others);
      return m ? { name: m.name, role: others.find((c) => c.id === m.id)!.role } : null;
    })
    .filter((m) => m !== null);
  if (otherHits.length > 0)
    return { text: req.text, kind: "partial", names: unique(otherHits.map((m) => m.name)), fromRoles: unique(otherHits.map((m) => m.role)), unmatched: [] };
  return { text: req.text, kind: "missing", names: req.phrases, unmatched: req.phrases };
}

/**
 * 역량 갭. 공고가 없으면 null (화면에는 "확인 불가").
 * 예: 무신사 마케팅 -> { connected: 0, partial: 1, missing: 3 }
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
    items: classified.map(({ text, kind, names, newAtYear3, fromRoles }) => ({
      text,
      kind,
      names,
      ...(newAtYear3 ? { newAtYear3 } : {}),
      ...(fromRoles ? { fromRoles } : {}),
    })),
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

/**
 * 화면에 보일 역량 이름 목록. 예: { connected: ["프로모션 기획"], partial: ["협업·조율(서비스기획)"], missing: ["그로스·리텐션(3년차에 새로 요구)", "Braze 사용"] }
 */
export function gapDetail(gap: CareerGap): { connected: string[]; partial: string[]; missing: string[] } {
  const out = { connected: [] as string[], partial: [] as string[], missing: [] as string[] };
  for (const it of gap.items) {
    for (const n of it.names) {
      const label = it.kind === "partial" ? `${n}(${(it.fromRoles ?? []).join(", ")})` : it.newAtYear3 ? `${n}(3년차에 새로 요구)` : n;
      if (!out[it.kind].includes(label)) out[it.kind].push(label);
    }
  }
  return out;
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
