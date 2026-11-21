// 공공 출처에서 받은 조각들을 기업 카드(Company) 하나로 조립한다. 순수 함수, 네트워크 없음.
// 등급은 여기서 매기지 않는다. 원시값과 출처만 넣고, 등급은 화면에서 lib/indicators.ts가 계산한다 (docs/schema.md 1장).
import type { Company, CompanyNature, Disclosure, IndicatorValue, Source } from "../types";

/** 사람이 정하는 값. data/real/targets.json 한 줄 */
export interface RealTarget {
  corpCode: string;
  nature: CompanyNature;
  /** 유형 판정 근거 한 줄 (카드 배지 옆) */
  natureBasis: string;
  /** 국민연금 행이 없을 때 쓸 업종명 */
  industry?: string;
  /** 사람들이 부르는 다른 이름 (예: "당근") */
  aliases?: string[];
}

/** 시연 기업만 사람이 공식 자료에서 확인해 넣는 값 (data/real/manual.json). 출처 링크와 확인 날짜 필수 */
export interface ManualValue {
  corpCode: string;
  indicator: IndicatorValue;
}

/** OpenDART 기업개황(company.json)에서 쓰는 칸 */
export interface DartProfile {
  corp_name: string;
  corp_cls: string; // Y 유가, K 코스닥, N 코넥스, E 기타
  adres: string;
  induty_code: string;
  est_dt: string; // YYYYMMDD
  bizr_no: string;
  ceo_nm: string; // 공시된 대표자. 화면 표시 전용, LLM에 보내지 않는다
}

/** 국세청 사업자 상태 코드. 01 계속, 02 휴업, 03 폐업 */
export type NtsStatus = "01" | "02" | "03";

const PROVINCE: Record<string, string> = {
  서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 광주광역시: "광주",
  대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종", 경기도: "경기", 강원도: "강원",
  강원특별자치도: "강원", 충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전북특별자치도: "전북",
  전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주",
};

/** 시·구까지만. 예: "제주특별자치도 제주시 첨단로 242" -> "제주 제주시", "서울특별시 강남구 역삼동" -> "서울 강남구" */
export function shortAddress(adres: string): string {
  const [p, c] = adres.trim().split(/\s+/);
  if (!p) return "";
  return [PROVINCE[p] ?? p, c].filter(Boolean).join(" ");
}

/** "19950216" -> "1995-02-16" */
export function isoDate(yyyymmdd: string): string | null {
  return /^\d{8}$/.test(yyyymmdd) ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}` : null;
}

/** 상장(유가, 코스닥, 코넥스)이면 listed, 아니면 재무 공시가 있으면 audited, 없으면 unlisted */
export function disclosureOf(corpCls: string, hasFinancials: boolean): Disclosure {
  if (["Y", "K", "N"].includes(corpCls)) return "listed";
  return hasFinancials ? "audited" : "unlisted";
}

/**
 * 리스크. 국세청 휴폐업과 감사의견을 본다.
 * 폐업·휴업 또는 감사의견 부적정·의견거절 -> 해당, 한정 -> 경미, 그 외 -> 해당 없음. 둘 다 모르면 확인 불가.
 * 예: ("03", []) -> 해당 (폐업), ("01", ["적정의견"]) -> 해당 없음
 */
export function riskIndicator(
  nts: NtsStatus | null,
  opinions: string[],
  sources: { nts: Source | null; audit: Source | null },
): IndicatorValue {
  if (nts === null && opinions.length === 0) {
    return { id: "risk", metric: "risk_flags", status: "unavailable", value: null, unit: "", period: null, source: null, reason: "fetch_failed" };
  }
  const closed = nts === "03" || nts === "02";
  const severe = opinions.some((o) => /부적정|의견거절/.test(o));
  const minor = opinions.some((o) => /한정/.test(o));
  const label = closed || severe ? "해당" : minor ? "경미" : "해당 없음";
  const extra: Record<string, number> = {};
  if (nts === "03") extra.closed = 1;
  if (nts === "02") extra.suspended = 1;
  return {
    id: "risk",
    metric: "risk_flags",
    status: "ok",
    value: null,
    unit: "",
    period: sources.nts?.checkedAt.slice(0, 7) ?? null,
    label,
    ...(Object.keys(extra).length ? { extra } : {}),
    source: closed ? sources.nts : sources.audit ?? sources.nts,
  };
}

function missing(id: IndicatorValue["id"], metric: string, unit: string, reason: IndicatorValue["reason"]): IndicatorValue {
  return { id, metric, status: "unavailable", value: null, unit, period: null, source: null, reason };
}

export interface AssembleInput {
  target: RealTarget;
  profile: DartProfile;
  /** financialIndicators 결과. 재무 공시가 없으면 빈 배열 */
  financials: IndicatorValue[];
  tenure: IndicatorValue | null;
  hiring: IndicatorValue;
  compensation: IndicatorValue;
  risk: IndicatorValue;
  /** 국민연금 업종명 (있으면) */
  npsIndustry: string | null;
  manual: ManualValue[];
  checkedAt: string;
}

/**
 * 기업 카드 하나. 지표 순서와 빈칸 처리를 목업과 똑같이 맞춘다.
 * 대표자는 OpenDART 기업개황에 공시된 이름을 그대로 쓴다. 동명 후보를 가르는 단서이고, 화면 표시 전용이라 LLM에 보내지 않는다 (11/21 결정).
 */
export function assembleCompany(x: AssembleInput): Company {
  const { target, profile } = x;
  // 재무가 API가 아니라 감사보고서 원문에서 왔어도(manual) 재무 공시가 있는 외감 법인이다
  const finIds: IndicatorValue["id"][] = ["financial_health", "growth", "profitability"];
  const hasFin =
    x.financials.some((f) => f.status !== "unavailable") ||
    x.manual.some((m) => m.corpCode === target.corpCode && finIds.includes(m.indicator.id));
  const disclosure = disclosureOf(profile.corp_cls, hasFin);
  const manual = (id: IndicatorValue["id"]) => x.manual.find((m) => m.corpCode === target.corpCode && m.indicator.id === id)?.indicator;
  const fin = (id: IndicatorValue["id"], metric: string, unit: string) =>
    manual(id) ?? x.financials.find((f) => f.id === id) ?? missing(id, metric, unit, "not_disclosed");

  const general = target.nature === "general";
  const indicators: IndicatorValue[] = [
    fin("financial_health", general ? "debt_ratio" : "runway_months", general ? "%" : "개월"),
    fin("growth", "revenue_growth", "%"),
    fin("profitability", general ? "operating_margin" : "operating_income", general ? "%" : "억원"),
    manual("hiring_flow") ?? x.hiring,
    manual("compensation") ?? x.compensation,
    manual("tenure") ?? x.tenure ?? missing("tenure", "avg_tenure", "년", "not_disclosed"),
    // 일반 기업 R&D 비율, 스타트업 등록 특허는 시연 기업만 사람이 확인한다 (docs/indicators.md)
    manual("tech_investment") ?? missing("tech_investment", general ? "rnd_ratio" : "registered_patents", general ? "%" : "건", "no_source"),
    manual("funding_stage") ?? missing("funding_stage", "cumulative_funding", "억원", "no_source"),
    x.risk,
  ];

  return {
    id: target.corpCode,
    corpCode: target.corpCode,
    bizRegNo: profile.bizr_no ? profile.bizr_no.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3") : null,
    bizRegNoSource: profile.bizr_no
      ? { name: "OpenDART 기업개황", url: "https://opendart.fss.or.kr", checkedAt: x.checkedAt }
      : null,
    // 회사명은 공시 표기 그대로 둔다: "(주)카카오"처럼 (주)가 앞이나 뒤에 붙는다 (11/21 결정)
    name: profile.corp_name.trim(),
    ceoName: (profile.ceo_nm ?? "").trim(),
    address: shortAddress(profile.adres),
    industry: x.npsIndustry ?? target.industry ?? "업종 정보 없음",
    industryCode: profile.induty_code || null,
    foundedOn: isoDate(profile.est_dt),
    disclosure,
    nature: target.nature,
    natureBasis: target.natureBasis,
    certifications: [],
    indicators,
    ...(target.aliases?.length ? { aliases: target.aliases } : {}),
    externalLinks: [],
    isMock: false,
  };
}
