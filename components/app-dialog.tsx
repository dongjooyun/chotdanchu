"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseButton } from "@/components/close-button";

/**
 * 창(모달)의 공통 기준. 카드 보기, 성향 변경 확인처럼 화면 위에 뜨는 것은 모두 이 부품을 쓴다.
 * - 브라우저 기본 alert, confirm, prompt는 쓰지 않는다 (모양을 못 맞추고 모바일에서 어색하다)
 * - 너비는 420px(모바일은 화면 폭에서 32px 뺀 값), 안쪽 여백 24px, 모서리 6px, 선 1px 회색, 그림자 없음
 * - 제목 16px 굵게, 본문 14px. 뒤는 어둡게 덮고, Esc나 오른쪽 위 X 버튼으로 닫는다. 열면 창 안으로 포커스가 간다(dialog 기본 동작)
 * - 창은 PC와 모바일 모두 화면 가로·세로 한가운데에 뜬다. 내용이 길면 창 안에서 스크롤한다
 * - 모든 창은 같은 자리(오른쪽 위)에 X 닫기가 있다 (11/22). 고르는 창(choice)에서 X는 "기존대로 두기"와 같다. 주 버튼은 왼쪽, 보조는 오른쪽
 * - 창 안의 안내 글은 본문과 보조 글(12px 회색) 두 단계만 쓴다
 */
export function AppDialog({
  open,
  title,
  onClose,
  choice = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** 고르는 창이면 true. X와 Esc가 onClose(기존대로 두기)로 닫는다 */
  choice?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={choice ? "dlg dlg-choice" : "dlg"} aria-labelledby={id} onClose={onClose}>
      <div className="dlg-bar">
        <b id={id}>{title}</b>
        <CloseButton onClick={onClose} />
      </div>
      {children}
    </dialog>
  );
}
