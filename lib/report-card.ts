// 저장용 리포트 카드에 들어갈 내용 (화면용 모양). 값은 모두 코드가 만든 결과에서 옮겨 담는다.
// 리포트 태스크(CDC-16)에서 실제 값으로 채우고, 모양이 굳으면 docs/schema.md로 옮긴다.
import type { Grade, IndicatorId, Role } from "@/lib/types";

export interface ReportCardData {
  /** 모은 순서. 포켓몬 카드의 도감 번호처럼 보인다. 예: 1 -> "No. 001" */
  no: number;
  companyName: string;
  /** 예: "외감 · 스타트업" */
  typeLabel: string;
  role: Role;
  /** 적합도 라벨 (PRD 06). 코드가 정한다. 리포트 태스크(CDC-16) 전에는 null */
  fitLabel: string | null;
  /** 라벨 이유 한 줄. AI가 쓰되 숫자는 넣지 않는다 */
  fitReason: string;
  /** 맞대결 결과 유형. 건너뛰었으면 null ("기본 기준") */
  preferenceType: string | null;
  /** 내가 중시한 지표 3개와 이 회사의 등급 */
  topIndicators: { id: IndicatorId; grade: Grade | null }[];
  /** 3년차 공고 대비 역량 갭 개수 (PRD 05). 공고 수집 전에는 null */
  gap: { connected: number; partial: number; missing: number } | null;
  /** 3년차 공고 출처. 유사 기업으로 대체했으면 그 사실. 공고 수집 전에는 null */
  careerSource: string | null;
  /** 뒷면: 지표 10개 등급 */
  grades: { id: IndicatorId; grade: Grade | null }[];
  /** 뒷면: 면접에서 물어볼 질문. 확인 불가 항목마다 하나 이상 */
  interviewQuestions: string[];
  /** 뒷면: 에이전트가 판단한 곳 (판단 로그에서 decision만) */
  decisions: string[];
  /** 기준일 YYYY-MM-DD */
  checkedAt: string;
}
