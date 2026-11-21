"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * 창(모달)의 공통 기준. 카드 보기, 성향 변경 확인처럼 화면 위에 뜨는 것은 모두 이 부품을 쓴다.
 * - 브라우저 기본 alert, confirm, prompt는 쓰지 않는다 (모양을 못 맞추고 모바일에서 어색하다)
 * - 너비는 420px(모바일은 화면 폭에서 32px 뺀 값), 안쪽 여백 24px, 모서리 6px, 선 1px 회색, 그림자 없음
 * - 제목 16px 굵게, 본문 14px. 뒤는 어둡게 덮고, Esc나 "닫기"로 닫는다. 열면 창 안으로 포커스가 간다(dialog 기본 동작)
 * - 사용자가 꼭 골라야 하는 창(choice)에는 "닫기"를 두지 않고 버튼 둘로만 닫는다. 주 버튼은 왼쪽, 보조는 오른쪽
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
  /** true면 "닫기" 버튼을 두지 않는다 (사용자가 버튼으로 골라야 하는 창) */
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
    <dialog ref={ref} className="dlg" aria-labelledby={id} onClose={onClose} onCancel={choice ? (e) => e.preventDefault() : undefined}>
      <div className="dlg-bar">
        <b id={id}>{title}</b>
        {!choice && (
          <button type="button" className="btn btn-link small" onClick={onClose}>
            닫기
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
