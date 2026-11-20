// 등급 기준표의 모든 행. docs/indicators.md의 표 한 줄이 여기 한 줄이다 (추적성의 원본).
// 테스트 케이스는 criterion 키로 이 목록과 연결되고, 키가 빠지면 indicators.test.ts의 추적성 검사가 실패한다.
export interface Criterion {
  /** 케이스 ID와 같은 접두어. 예: "FH-G" -> IND-FH-G-01 */
  key: string;
  /** docs/indicators.md의 어느 표, 어느 행인가 */
  row: string;
  /** 경계값(BVA) 케이스가 최소 몇 개 있어야 하나. 임계값 하나에 아래·위 두 점 이상 */
  minBva: number;
  /** true면 케이스가 별도 describe에 있다 (분류 함수처럼 등급 케이스 모양이 아닌 것) */
  external?: boolean;
}

export const CRITERIA: Criterion[] = [
  { key: "FH-G", row: "일반 기업 기준표 / 재무 체력 (부채비율)", minBva: 4 },
  { key: "FH-S", row: "스타트업 기준표 / 재무 체력 (런웨이)", minBva: 4 },
  { key: "GR-G", row: "일반 기업 기준표 / 성장성 (매출 증가율)", minBva: 4 },
  { key: "GR-S", row: "스타트업 기준표 / 성장성 (매출 증가율)", minBva: 4 },
  { key: "PF-G", row: "일반 기업 기준표 / 수익성 (영업이익률)", minBva: 4 },
  { key: "PF-S", row: "스타트업 기준표 / 수익성 (영업이익, 방향)", minBva: 3 },
  { key: "HR-G", row: "일반 기업 기준표 / 고용 흐름 (연 퇴사율)", minBva: 4 },
  { key: "HR-S", row: "스타트업 기준표 / 고용 흐름 (월 퇴사율)", minBva: 4 },
  { key: "CP", row: "두 기준표 공통 / 보상 (업종 평균 대비)", minBva: 4 },
  { key: "TN", row: "두 기준표 공통 / 근속", minBva: 4 },
  { key: "TI-G", row: "일반 기업 기준표 / 기술 투자 (R&D 비율, 업종 구간 4개)", minBva: 8 },
  { key: "TI-S", row: "스타트업 기준표 / 기술 투자 (등록 특허)", minBva: 3 },
  { key: "KSIC", row: "일반 기업 기준표 / 기술 투자 업종 구간 (KSIC 분류)", minBva: 0, external: true },
  { key: "FS-S", row: "스타트업 기준표 / 투자 단계 (금액 조건 x 18개월 조건)", minBva: 3 },
  { key: "FS-G", row: "일반 기업 기준표 / 투자 단계 (등급 없음)", minBva: 0 },
  { key: "RK", row: "두 기준표 공통 / 리스크", minBva: 0 },
  { key: "TR", row: "두 기준표 공통 / 정보 투명도 (확인 개수 7, 4)", minBva: 4 },
  { key: "EG", row: "공통 원칙 / 확인 불가와 빠진 값 처리 (오류 추정)", minBva: 0 },
];
