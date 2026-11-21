// 화면 자리를 확인하기 위한 예시 데이터. 실제 값이 아니다.
import type { ReportCardData } from "@/lib/report-card";
import type { MatchupCard } from "@/lib/types";

/** 리포트 카드 모양 확인용. 회사와 수치는 모두 가상이다 */
export const SAMPLE_REPORT_CARD: ReportCardData = {
  no: "00000001",
  companyId: "mock-001",
  companyName: "하늘커머스 (가상)",
  logo: null,
  monogram: "하늘",
  typeLabel: "감사보고서 공개 · 스타트업",
  role: "서비스기획",
  fitLabel: "도전",
  fitReason: "성장은 빠르지만 근속 정보가 없어 면접에서 확인이 필요해요",
  preferenceType: "자율·개척 지향",
  topIndicators: [
    { id: "growth", grade: "A" },
    { id: "funding_stage", grade: "B" },
    { id: "tenure", grade: null },
  ],
  gap: { connected: 4, missing: 3 },
  careerSource: "같은 회사 공식 채용 페이지 (수동 확인)",
  grades: [
    { id: "financial_health", grade: "A" },
    { id: "growth", grade: "A" },
    { id: "profitability", grade: "B" },
    { id: "hiring_flow", grade: "B" },
    { id: "compensation", grade: "B" },
    { id: "tenure", grade: null },
    { id: "tech_investment", grade: "C" },
    { id: "funding_stage", grade: "B" },
    { id: "risk", grade: "B" },
    { id: "transparency", grade: "A" },
  ],
  interviewQuestions: [
    "입사 3년 차 기획자의 평균 근속과 이직 사유를 여쭤봐도 될까요?",
    "신입 기획자가 첫해에 맡는 프로젝트 범위가 궁금합니다.",
    "3년 차 공고의 데이터 분석 역량은 입사 후 어떻게 키우나요?",
  ],
  decisions: ["동명 법인 2곳이라 사용자에게 확인", "감사보고서를 공개하는 회사라 감사보고서와 국민연금으로 지표 계산"],
  checkedAt: "2026-11-19",
};

/** 판단 리포트 적합도 라벨 (PRD 06, 11/19 확정). 라벨은 코드가 정하고 AI는 이유 문장만 쓴다 */
export const FIT_LABELS = [
  { id: "optimal", name: "최적", description: "3년 뒤가 보이는 자리" },
  { id: "challenge", name: "도전", description: "배울 건 많지만 감수할 게 있는 자리" },
  { id: "stable", name: "안정", description: "든든하지만 역량은 따로 채울 자리" },
  { id: "consider", name: "고려", description: "다른 선택지와 비교해 볼 자리" },
  { id: "need_info", name: "정보 보강", description: "면접에서 더 알아볼 자리" },
] as const;

/** 맞대결 카드 자리 확인용 두 장. 실제 카드 8장(data/matchup/)은 맞대결 태스크에서 만든다 */
export const SAMPLE_MATCHUP_PAIR: [MatchupCard, MatchupCard] = [
  {
    id: "sample-a",
    title: "기업 A",
    archetype: "autonomy_pioneer",
    grades: { growth: "A", funding_stage: "A", financial_health: "C", tenure: "unavailable", compensation: "B" },
  },
  {
    id: "sample-b",
    title: "기업 B",
    archetype: "stable_system",
    grades: { growth: "C", funding_stage: "unavailable", financial_health: "A", tenure: "A", compensation: "B" },
  },
];
