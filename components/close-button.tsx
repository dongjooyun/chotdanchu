/**
 * 모든 "닫기"의 공통 모양: X 아이콘 버튼 (11/22 결정). 글자는 화면 읽기 프로그램용 이름(aria-label)으로만 둔다.
 * 터치 영역은 44px, 아이콘은 18px, 색은 회색이고 마우스를 올리면 진해진다.
 */
export function CloseButton({ onClick, label = "닫기" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="icon-close" onClick={onClick} aria-label={label} title={label}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
