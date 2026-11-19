// 첫단추 데이터 타입. 설명과 예시는 docs/schema.md, 기준값은 docs/indicators.md.
// 이 파일과 docs/schema.md는 항상 같이 고친다.

/** 직무. 역량 사전(data/competencies/competencies.json)의 role과 같은 이름 */
export type Role = "서비스기획" | "마케팅" | "운영";

/** 지표 id. 화면 이름은 INDICATOR_LABELS */
export type IndicatorId =
  | "financial_health"
  | "growth"
  | "profitability"
  | "hiring_flow"
  | "compensation"
  | "tenure"
  | "tech_investment"
  | "funding_stage"
  | "risk"
  | "transparency";

export const INDICATOR_LABELS: Record<IndicatorId, string> = {
  financial_health: "재무 체력",
  growth: "성장성",
  profitability: "수익성",
  hiring_flow: "고용 흐름",
  compensation: "보상",
  tenure: "근속",
  tech_investment: "기술 투자",
  funding_stage: "투자 단계",
  risk: "리스크",
  transparency: "정보 투명도",
};

export type Grade = "A" | "B" | "C";

/** 공시 수준: 어떤 데이터가 있는가 */
export type Disclosure = "listed" | "audited" | "unlisted";

/** 기업 성격: 어떤 기준표로 판단하는가 */
export type CompanyNature = "startup" | "general";

/**
 * ok: 공공 API·공시에서 받은 값
 * estimated: 추정치 (보상). range를 같이 둔다
 * manual: 기업·투자사 공식 발표를 사람이 확인한 값. source.url과 checkedAt 필수
 * unavailable: 확인 불가. value는 null, reason 필수
 */
export type IndicatorStatus = "ok" | "estimated" | "manual" | "unavailable";

/** 확인 불가 이유: 공시 의무 없음 / 데이터를 가져올 곳 없음 / 조회 실패 */
export type UnavailableReason = "not_disclosed" | "no_source" | "fetch_failed";

export interface Source {
  name: string;
  url: string;
  /** 확인 날짜 YYYY-MM-DD */
  checkedAt: string;
}

export interface IndicatorValue {
  id: Exclude<IndicatorId, "transparency">; // 정보 투명도는 저장하지 않고 계산
  /** 어떤 숫자인지 (예: debt_ratio, runway_months). docs/schema.md 4장 표 참고 */
  metric: string;
  status: IndicatorStatus;
  /** 원시값. 확인 불가면 null. 등급이 아니다 */
  value: number | null;
  range?: [number, number];
  unit: string;
  /** 기준 시점 (예: "2025", "2026-09") */
  period: string | null;
  /** 숫자가 아닌 값 (예: 투자 라운드 "Series A", 리스크 "해당 없음") */
  label?: string;
  /** 보조 수치 (예: { reserve_ratio: 820, op_income_per_employee: 3200 }) */
  extra?: Record<string, number>;
  source: Source | null;
  reason?: UnavailableReason;
}

/** 코드가 기준표로 계산한 결과. 데이터 파일에는 저장하지 않는다 */
export interface GradedIndicator {
  id: IndicatorId;
  grade: Grade | null; // null이면 확인 불가 또는 등급 없음(투자 단계 일반 기업)
  /** 화면에 보일 수치 한 줄 (예: "부채비율 120%"). 코드가 만든다 */
  display: string;
  /** 어느 기준표의 어느 기준으로 매겼는지 (예: "일반 기업 기준표: 100~300%면 B") */
  basis: string;
  source: Source | null;
  reason?: UnavailableReason;
}

export interface Company {
  /** 목업 "mock-001", 실데이터는 OpenDART 고유번호, DART에 없으면 "manual-영문이름" */
  id: string;
  corpCode: string | null;
  /** 사업자등록번호. DART 기업개황 또는 회사 홈페이지(사람이 확인) */
  bizRegNo: string | null;
  bizRegNoSource: Source | null;
  name: string;
  /** 화면 표시 전용. LLM 프롬프트에 넣지 않는다 (CLAUDE.md 절대 규칙 1) */
  ceoName: string;
  /** 시·구까지만 */
  address: string;
  industry: string;
  /** 표준산업분류(KSIC). 기술 투자의 업종 구간 판정에 쓴다 */
  industryCode: string | null;
  /** 설립일 YYYY-MM-DD. 업력 판정에 쓴다 */
  foundedOn: string | null;
  disclosure: Disclosure;
  nature: CompanyNature;
  /** 유형 판정 근거 한 줄 (카드 배지 옆에 보인다) */
  natureBasis: string;
  /** 공공 인증 (보조 신호): 이노비즈, 메인비즈, 워크넷 강소기업 */
  certifications: string[];
  indicators: IndicatorValue[];
  /** "원문 보기" 링크만. 데이터는 가져오지 않는다 */
  externalLinks: { name: string; url: string }[];
  isMock: boolean;
}

/** KT 기업분석 수업 "기업 선택 가치관" 3유형 */
export type PreferenceType = "stable_system" | "autonomy_pioneer" | "balance_practical";

export const PREFERENCE_TYPE_LABELS: Record<PreferenceType, string> = {
  stable_system: "안정·시스템 지향",
  autonomy_pioneer: "자율·개척 지향",
  balance_practical: "밸런스·실속 지향",
};

/** 맞대결 카드. 가상 카드라 원시값 없이 등급만 둔다 (data/matchup/) */
export interface MatchupCard {
  /** "card-1" ~ "card-8" */
  id: string;
  /** 기업명 대신 보이는 이름 (예: "카드 A") */
  title: string;
  /** 이 카드를 설계할 때 겨냥한 유형 */
  archetype: PreferenceType;
  grades: Partial<Record<IndicatorId, Grade | "unavailable">>;
}

export interface Preference {
  /** 맞대결을 건너뛰었으면 true. 이때 weights는 모두 같은 비중 */
  skipped: boolean;
  type: PreferenceType | null;
  /** 가장 중시하는 지표 3개 */
  topIndicators: IndicatorId[];
  /** 10개 지표 전부, 합 1 */
  weights: Record<IndicatorId, number>;
}

/** 최근 분석 기록. 판단 로그를 같이 저장해 다시 열어볼 수 있다 */
export interface AnalysisRecord {
  companyId: string;
  name: string;
  /** ISO 8601 */
  analyzedAt: string;
  /** 판단 리포트 라벨. 라벨 체계는 PRD 06에서 확정 */
  label: string | null;
  /** 판단 로그. 한 줄의 모양은 에이전트 루프(CDC-14)에서 확정 */
  log: unknown[];
}

/** 브라우저 localStorage에 두는 세션 상태. 개인 식별 정보 없음 */
export interface SessionState {
  role: Role | null;
  preference: Preference | null;
  analyzed: AnalysisRecord[];
}
