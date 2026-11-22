import type { AppMode } from "@/lib/chat";

/**
 * 목업 모드 표시 (PRD 07). 실데이터(운영) 모드에서는 그리지 않는다: 사용자에게는 정보가 아니고 완성도가 떨어져 보인다 (11/21 결정).
 * 실데이터 여부는 입력창 아래 출처 안내와 판단 로그에서 확인할 수 있다.
 */
export function ModeBadge({ mode }: { mode: AppMode }) {
  if (mode === "live") return null;
  return (
    <span className="tag" data-el="모드 배지">
      목업 모드
    </span>
  );
}
