"use client";

export interface QuickReply {
  label: string;
  value: string;
  /** 원하는 행동 하나만 연보라로 강조한다 (예: 기업 밸런스 게임) */
  main?: boolean;
}

/** 빠른 응답 버튼 (PRD 01). 시연 중 엉뚱한 입력을 줄이려고 선택지를 버튼으로 준다 */
export function QuickReplies({
  replies,
  onSelect,
  disabled = false,
}: {
  replies: QuickReply[];
  onSelect?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="quick" data-el="빠른 응답 버튼">
      {replies.map((r) => (
        <button
          key={r.value}
          type="button"
          disabled={disabled || !onSelect}
          onClick={() => onSelect?.(r.value)}
          className={r.main ? "chip-btn chip-main" : "chip-btn"}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
