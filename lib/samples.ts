// 화면 자리를 확인하기 위한 예시 데이터. 실제 값이 아니다.
import type { MatchupCard } from "@/lib/types";

/** 판단 리포트 적합도 라벨 (PRD 06, 11/19 확정). 라벨은 코드가 정하고 AI는 이유 문장만 쓴다 */
export const FIT_LABELS = [
  { id: "optimal", name: "최적", description: "3년 뒤가 보이는 자리" },
  { id: "challenge", name: "도전", description: "배울 건 많지만 감수할 게 있는 자리" },
  { id: "stable", name: "안정", description: "든든하지만 역량은 따로 채울 자리" },
  { id: "consider", name: "고려", description: "다른 선택지와 견줘 볼 자리" },
  { id: "need_info", name: "정보 보강", description: "면접에서 더 알아볼 자리" },
] as const;

/** 맞대결 카드 자리 확인용 두 장. 실제 카드 8장(data/matchup/)은 맞대결 태스크에서 만든다 */
export const SAMPLE_MATCHUP_PAIR: [MatchupCard, MatchupCard] = [
  {
    id: "sample-a",
    title: "카드 A",
    archetype: "autonomy_pioneer",
    grades: { growth: "A", funding_stage: "A", financial_health: "C", tenure: "unavailable", compensation: "B" },
  },
  {
    id: "sample-b",
    title: "카드 B",
    archetype: "stable_system",
    grades: { growth: "C", funding_stage: "unavailable", financial_health: "A", tenure: "A", compensation: "B" },
  },
];
