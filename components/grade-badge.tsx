import type { Grade } from "@/lib/types";

/**
 * 등급 배지. 색은 한 가지만 쓰고 채움 정도로 등급을 나눈다.
 * A: 꽉 채움, B: 옅게 채움, C: 테두리만, 확인 불가: 점선.
 * 글자(A/B/C)와 채움이 같은 뜻을 두 번 말하므로 색을 구분하기 어려운 사람에게도 읽힌다.
 */
export function GradeBadge({ grade, size = "md" }: { grade: Grade | "unavailable" | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-5 min-w-5 text-[10px]" : "h-7 min-w-7 text-sm";
  if (grade === null || grade === "unavailable") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded border border-dashed border-muted px-1 text-[10px] text-muted ${box}`}
      >
        확인 불가
      </span>
    );
  }
  const style = {
    A: "border border-fg bg-fg text-bg",
    B: "border border-fg bg-tag text-fg",
    C: "border border-fg bg-box text-fg",
  }[grade];
  return (
    <span className={`inline-flex items-center justify-center rounded font-bold ${box} ${style}`} aria-label={`등급 ${grade}`}>
      {grade}
    </span>
  );
}
