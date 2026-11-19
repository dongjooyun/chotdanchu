// 브라우저 localStorage에 두는 세션 상태 (계정 없음, 개인 식별 정보 없음).
// 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 화면이 깨지지 않게 모든 읽기·쓰기를 try로 감싼다.
import type { AnalysisRecord, IndicatorId, Preference, SessionState } from "@/lib/types";

const STORAGE_KEY = "chotdanchu:session:v1";
const CHANGE_EVENT = "chotdanchu:session-change";
/** 최근 분석 기록은 이 개수까지만 남긴다 */
const MAX_ANALYZED = 10;

export const EMPTY_SESSION: SessionState = { role: null, preference: null, analyzed: [] };

const INDICATOR_IDS: IndicatorId[] = [
  "financial_health", "growth", "profitability", "hiring_flow", "compensation",
  "tenure", "tech_investment", "funding_stage", "risk", "transparency",
];

/** 맞대결을 건너뛴 사용자의 선호: 모든 지표를 같은 비중으로 본다 (PRD 02). 예: weights.growth === 0.1 */
export function skippedPreference(): Preference {
  const w = 1 / INDICATOR_IDS.length;
  const weights = Object.fromEntries(INDICATOR_IDS.map((id) => [id, w])) as Record<IndicatorId, number>;
  return { skipped: true, type: null, topIndicators: [], weights };
}

/** 저장된 문자열을 세션으로. 비었거나 깨졌으면 빈 세션. 예: parseSession(null) -> EMPTY_SESSION */
export function parseSession(raw: string | null): SessionState {
  if (!raw) return EMPTY_SESSION;
  try {
    const v = JSON.parse(raw) as Partial<SessionState>;
    return {
      role: v.role ?? null,
      preference: v.preference ?? null,
      analyzed: Array.isArray(v.analyzed) ? v.analyzed : [],
    };
  } catch {
    return EMPTY_SESSION;
  }
}

export function getSessionSnapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 서버 렌더링 때는 저장소가 없으므로 항상 null */
export function getServerSessionSnapshot(): string | null {
  return null;
}

export function subscribeSession(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function saveSession(next: SessionState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장소를 못 써도 화면은 계속 동작한다
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** 최근 분석 기록 맨 앞에 추가. 같은 기업은 새 기록으로 바꾼다 */
export function addAnalysis(session: SessionState, record: AnalysisRecord): SessionState {
  const rest = session.analyzed.filter((r) => r.companyId !== record.companyId);
  return { ...session, analyzed: [record, ...rest].slice(0, MAX_ANALYZED) };
}
