"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 브라우저 localStorage에 두는 상태 (useState와 같은 모양). 새로고침, 뒤로 가기, 창을 닫았다 다시 열어도 남는다 (11/22).
 * 대화 내용(말풍선, 사고 과정 로그)을 지키려고 쓴다. 계정이 없어 같은 브라우저에서만 남는다.
 * 서버에서 그릴 때는 initial이고, 화면이 뜬 뒤 저장된 값으로 바뀐다 (useSession과 같은 방식).
 */
const CHANGE_EVENT = "chotdanchu:stored-state";
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, initial: T): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = initial;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = initial;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write<T>(key: string, value: T) {
  let raw: string | null = null;
  try {
    raw = JSON.stringify(value);
    window.localStorage.setItem(key, raw);
  } catch {
    // 저장소가 꽉 찼거나 막혀 있어도 화면은 계속 동작한다 (이번 탭 안에서는 cache로 유지)
  }
  cache.set(key, { raw, value });
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useStoredState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, initial),
    () => initial,
  );
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = read(key, initial);
      write(key, typeof next === "function" ? (next as (p: T) => T)(prev) : next);
    },
    // initial은 처음 값만 쓰면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, set];
}
