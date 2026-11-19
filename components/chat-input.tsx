"use client";

import { useState, type FormEvent } from "react";
import { LofiBox } from "@/components/lofi-box";

/** 입력창. 기업명을 입력받는다. 이력서나 연락처는 받지 않는다 (CLAUDE.md 절대 규칙 1) */
export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "기업 이름을 입력해 주세요",
}: {
  onSend?: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !onSend) return;
    onSend(t);
    setText("");
  }

  return (
    <LofiBox label="입력창">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={100}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="메시지 입력"
          className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded border border-line px-3 text-sm hover:bg-tag disabled:opacity-60"
        >
          보내기
        </button>
      </form>
    </LofiBox>
  );
}
