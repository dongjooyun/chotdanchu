// 앱 전체 설정. 서버 코드(페이지, API 라우트)에서만 불러온다.
// 환경변수는 서버에서만 읽히므로 클라이언트 컴포넌트에서 import하지 않는다.
import type { AppMode } from "@/lib/chat";

export const config = {
  /** USE_MOCK=false로 명시하지 않으면 목업 모드다. 기본값을 목업으로 둬서 API 크레딧을 아낀다 */
  useMock: process.env.USE_MOCK !== "false",
  /** 모델 이름은 여기 한 곳에서만 관리한다 (CLAUDE.md 5장) */
  models: {
    /** 가벼운 단계: 동명 기업 판별, 역량 추출 */
    small: "claude-haiku-5-5",
    /** 무거운 단계: 판단 리포트 문장 */
    large: "claude-sonnet-5-5",
  },
  /** 한 요청당 도구 호출 상한. 넘으면 지금까지 결과로 정리해 응답한다 */
  maxToolCalls: 8,
} as const;

/** 지금 모드. 예: USE_MOCK이 없거나 "true"면 "mock", "false"면 "live" */
export function getMode(): AppMode {
  return config.useMock ? "mock" : "live";
}
