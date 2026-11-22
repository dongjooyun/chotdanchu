// 채팅 화면과 /api/chat이 주고받는 데이터 모양. 서버와 클라이언트가 같이 쓴다.
import type { BusinessSummary, Company, GradedIndicator, SessionState } from "@/lib/types";

/** mock: 목업 데이터, live: 실데이터 */
export type AppMode = "mock" | "live";

/** 판단 로그 한 줄의 종류 (PRD 07) */
export type LogType = "decision" | "tool_call" | "fallback" | "unavailable" | "limit" | "info";

/**
 * 판단 로그 한 줄. 지금은 초안이고, 형식은 에이전트 루프(CDC-14)에서 확정한다.
 * 예: { step: 1, type: "tool_call", title: "search_company: 목업 기업 2곳 찾음", mode: "mock" }
 */
export interface LogLine {
  step: number;
  type: LogType;
  title: string;
  /** 판단 이유. decision과 fallback에는 꼭 넣는다 */
  reason?: string;
  mode: AppMode;
}

/** 동명 기업 후보 칩에 보이는 정보. 대표자는 화면 표시 전용이다 */
export interface CandidateSummary {
  id: string;
  name: string;
  ceoName: string;
  address: string;
  industry: string;
  foundedYear: string | null;
  /** 고르는 데 도움이 되는 상태 표시. 예: ["상장"], ["폐업"] */
  tags: string[];
}

/** 에이전트 말풍선 안에 그리는 위젯 */
export type ChatWidget =
  | { type: "candidates"; candidates: CandidateSummary[] }
  /** graded: compute_indicators가 기준표로 계산한 10개 등급 (정보 투명도 포함) */
  | { type: "company"; company: Company; graded: GradedIndicator[]; summary: BusinessSummary };

export interface ChatRequest {
  /** 사용자가 입력한 문장 (기업명 등) */
  message?: string;
  /** 동명 후보 칩에서 고른 기업 id */
  pickCompanyId?: string;
  session?: SessionState;
}

export interface ChatResponse {
  reply: string;
  widget?: ChatWidget;
  log: LogLine[];
}
