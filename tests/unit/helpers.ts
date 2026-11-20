// 테스트용 데이터 만들기. 기준일(ASOF)은 고정해서 "최근 18개월" 같은 시간 조건도 매번 같은 결과가 나오게 한다.
import type { Company, CompanyNature, IndicatorValue, UnavailableReason } from "@/lib/types";

/** 기준일 2026-11-20. 18개월 전 달은 2025-05, 19개월 전 달은 2025-04 */
export const ASOF = new Date(2026, 10, 20);

type Id = IndicatorValue["id"];

export function makeCompany(
  nature: CompanyNature,
  indicators: IndicatorValue[],
  industryCode = "62010",
): Company {
  return {
    id: "test",
    corpCode: null,
    bizRegNo: null,
    bizRegNoSource: null,
    name: "테스트기업",
    ceoName: "-",
    address: "-",
    industry: "-",
    industryCode,
    foundedOn: null,
    disclosure: "audited",
    nature,
    natureBasis: "-",
    certifications: [],
    indicators,
    externalLinks: [],
    isMock: true,
  };
}

/** 값이 있는 지표. 예: val("growth", "revenue_growth", 15) */
export function val(id: Id, metric: string, value: number | null, more: Partial<IndicatorValue> = {}): IndicatorValue {
  return { id, metric, status: "ok", value, unit: "%", period: "2025", source: null, ...more };
}

/** 확인 불가 지표 */
export function missing(id: Id, metric: string, reason: UnavailableReason): IndicatorValue {
  return { id, metric, status: "unavailable", value: null, unit: "", period: null, source: null, reason };
}
