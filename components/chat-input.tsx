"use client";

import { useState, type FormEvent } from "react";

/** 입력창. 기업명을 입력받는다. 이력서나 연락처는 받지 않는다 (CLAUDE.md 절대 규칙 1) */
export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "회사 이름을 입력해 주세요",
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
    <form onSubmit={submit} data-el="입력창">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={100}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="메시지 입력"
        className="field"
      />
      <button type="submit" disabled={disabled || !text.trim()} className="btn btn-ink">
        보내기
      </button>
    </form>
  );
}
