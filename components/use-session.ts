"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getServerSessionSnapshot,
  getSessionSnapshot,
  parseSession,
  saveSession,
  subscribeSession,
} from "@/lib/session";
import type { SessionState } from "@/lib/types";

/**
 * 브라우저에 저장된 세션을 읽고 쓰는 훅. 서버 렌더링 때는 빈 세션이고, 화면이 뜬 뒤 저장된 값으로 바뀐다.
 * 새로고침해도 고른 직무가 남는다 (PRD 01 완료 기준).
 */
export function useSession(): [SessionState, (next: SessionState) => void] {
  const raw = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const session = useMemo(() => parseSession(raw), [raw]);
  return [session, saveSession];
}
