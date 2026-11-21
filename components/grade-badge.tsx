import type { Grade } from "@/lib/types";

/**
 * 등급 배지. 보라 한 색의 채움 정도로 등급을 나눈다.
 * A: 꽉 채움, B: 연보라 채움, C: 테두리만, 확인 불가: 점선 "?".
 * 글자와 채움이 같은 뜻을 두 번 말하므로 색을 구분하기 어려운 사람에게도 읽힌다.
 */
export function GradeBadge({ grade, size = "md" }: { grade: Grade | "unavailable" | null; size?: "sm" | "md" }) {
  const sm = size === "sm" ? " g-sm" : "";
  if (grade === null || grade === "unavailable") {
    return (
      <span className={`g g-n${sm}`} role="img" aria-label="확인 불가">
        ?
      </span>
    );
  }
  return (
    <span className={`g g-${grade.toLowerCase()}${sm}`} role="img" aria-label={`등급 ${grade}`}>
      {grade}
    </span>
  );
}

/** 등급이 매겨지지 않는 칸 (예: 일반 기업의 투자 단계) */
export function NoGradeBadge() {
  return (
    <span className="g g-0 g-sm" role="img" aria-label="등급 없음">
      -
    </span>
  );
}
