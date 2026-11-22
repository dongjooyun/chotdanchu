"use client";

import { useState, type FormEvent, type ReactNode } from "react";

/**
 * 입력창. 기업명을 입력받는다. 이력서나 연락처는 받지 않는다 (CLAUDE.md 절대 규칙 1).
 * 모바일에서는 "보내기" 글자 대신 화살표 아이콘만 보여 입력칸을 넓힌다(화면 읽기 프로그램에는 "보내기"로 읽힌다).
 * trailing은 보내기 버튼 오른쪽에 붙는 것(모바일 메뉴 버튼)이다.
 */
export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "회사 이름을 입력해 주세요",
  trailing,
}: {
  onSend?: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  trailing?: ReactNode;
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
      <button type="submit" disabled={disabled || !text.trim()} className="btn btn-ink send-btn">
        <span className="send-label">보내기</span>
        <svg className="send-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      </button>
      {trailing}
    </form>
  );
}
