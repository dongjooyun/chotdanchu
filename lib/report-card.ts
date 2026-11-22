// 저장용 리포트 카드에 들어갈 내용 (화면용 모양). 값은 모두 코드가 만든 결과에서 옮겨 담는다.
// 최종 판단 리포트(CDC-16)에서 코드가 채운다. 설명은 docs/schema.md.
import type { Grade, IndicatorId, Role } from "@/lib/types";

export interface ReportCardData {
  /** 카드 번호: OpenDART 고유번호 8자리 (lib/brand.ts cardNo). 같은 회사는 누가 봐도 같은 번호. 예: "00258801" */
  no: string;
  companyId: string;
  companyName: string;
  /** 로고 경로. 없으면 null이고 이니셜을 그린다 */
  logo: string | null;
  /** 이니셜 두 글자. 예: "카카" */
  monogram: string;
  /** 예: "감사보고서 공개 · 스타트업" */
  typeLabel: string;
  role: Role;
  /** 판정 라벨 (PRD 06, lib/fit-label.ts). 코드가 정한다. 폐업·휴업 회사는 null */
  fitLabel: string | null;
  /** 라벨 이유 한 줄. 숫자를 넣지 않는다 (지금은 규칙 문장) */
  fitReason: string;
  /** 맞대결 결과 유형. 건너뛰었으면 null ("기본 기준") */
  preferenceType: string | null;
  /** 내가 중시한 지표 3개와 이 회사의 등급 */
  topIndicators: { id: IndicatorId; grade: Grade | null }[];
  /** 3년차 공고 대비 역량 갭 개수 (PRD 05, lib/career-gap.ts). 공고가 없으면 null */
  gap: { connected: number; missing: number } | null;
  /** 역량 갭에서 맞은 역량 이름 (카드 뒷면에 보인다). 공고가 없으면 생략 */
  gapDetail?: { required?: string[]; connected: string[]; missing: string[] };
  /** 3년차 공고의 원문 요구 연차. 예: "5년 이상" */
  careerYears?: string;
  /** 3년차 공고 출처 한 줄. 공고가 없으면 null */
  careerSource: string | null;
  /** 3년차 공고 원문 링크 (회사 공식 채용 페이지). 가상 공고나 공고가 없으면 생략 */
  careerUrl?: string;
  /** 3년차 공고 이름. 링크로 보이는 부분. 예: "(주)무신사 Growth Marketer (카테고리 전략 담당), 4년 이상" */
  careerTitle?: string;
  /** 공고를 사람이 확인한 날짜 YYYY-MM-DD */
  careerCheckedAt?: string;
  /** 유사 기업 공고로 대체했을 때 화면에 보일 사유 한 줄 (PRD 05). 없으면 생략 */
  substituteNote?: string;
  /** 맞대결로 판정했을 때 선호 가중치를 링크용으로 줄인 값 (lib/share.ts). QR 링크에 들어간다. 기본 기준이면 생략 */
  weightsParam?: string;
  /** 뒷면: 지표 10개 등급 */
  grades: { id: IndicatorId; grade: Grade | null }[];
  /** 뒷면: 면접에서 물어볼 질문. 확인 불가 항목마다 하나 이상. 폐업·휴업 회사는 빈 배열 */
  interviewQuestions: string[];
  /** 질문 대신 보일 안내 (폐업·휴업 회사). 없으면 생략 */
  notice?: string;
  /** 뒷면: 에이전트가 판단한 곳 (판단 로그에서 decision만) */
  decisions: string[];
  /** 기준일 YYYY-MM-DD */
  checkedAt: string;
}
