"use client";

import { LofiBox } from "@/components/lofi-box";

export interface QuickReply {
  label: string;
  value: string;
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
    <LofiBox label="빠른 응답 버튼">
      <div className="flex flex-wrap gap-2">
        {replies.map((r) => (
          <button
            key={r.value}
            type="button"
            disabled={disabled || !onSelect}
            onClick={() => onSelect?.(r.value)}
            className="rounded-full border border-line px-3 py-1 text-sm hover:bg-tag disabled:opacity-60"
          >
            {r.label}
          </button>
        ))}
      </div>
    </LofiBox>
  );
}
