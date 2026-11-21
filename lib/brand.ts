// 카드에 보이는 기업 표시: 카드 번호, 로고, 이니셜. 화면 표시 전용이다.

/**
 * 시연 기업 로고 (각 사가 공개한 브랜드 자료, 비상업 목적 사용, 출처는 docs/data-sources.md).
 * 키는 OpenDART 고유번호. 폐업한 동명 법인(카카오 00918444)에는 현재 로고를 쓰지 않는다.
 */
const LOGOS: Record<string, string> = {
  "00258801": "/logos/00258801.webp",
  "01137727": "/logos/01137727.webp",
  "01153956": "/logos/01153956.png",
  "01547845": "/logos/01547845.webp",
};

export function logoOf(companyId: string): string | null {
  return LOGOS[companyId] ?? null;
}

/**
 * 카드 번호: OpenDART 고유번호를 8자리로 맞춘다. 목업처럼 숫자가 적은 id는 앞을 0으로 채운다.
 * 예: "00258801" -> "00258801", "mock-001" -> "00000001"
 */
export function cardNo(companyId: string): string {
  const digits = companyId.replace(/\D/g, "");
  return (digits || "0").slice(-8).padStart(8, "0");
}

/**
 * 로고가 없을 때 쓰는 이니셜 두 글자. 법인 표기는 뺀다.
 * 예: "(주)카카오" -> "카카", "주식회사 청솔기계" -> "청솔", "별하늘랩스(주)" -> "별하"
 */
export function monogram(name: string): string {
  const core = name.replace(/\(주\)|주식회사/g, "").replace(/\s+/g, "");
  return core.slice(0, 2) || "?";
}
