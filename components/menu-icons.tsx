// 메뉴와 버튼에 쓰는 작은 아이콘들 (선 두께 2, 글자색을 따라간다). 모바일 메뉴(chat-app)와 튜토리얼이 같이 쓴다

/** 맞대결 아이콘 (겹친 카드 두 장) */
export function CardsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="10" height="14" rx="1.5" transform="rotate(-8 8 13)" />
      <rect x="11" y="4" width="10" height="14" rx="1.5" transform="rotate(8 16 11)" />
    </svg>
  );
}

/** 대화 새로 시작 아이콘 (도는 화살표) */
export function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

/** 직무 변경 아이콘 (사람 모양) */
export function RoleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </svg>
  );
}

/** 회사 변경 아이콘 (건물 모양) */
export function CompanyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V5l8-2v18" />
      <path d="M12 9h8v12" />
      <path d="M8 9h.01M8 13h.01M8 17h.01M16 13h.01M16 17h.01" />
    </svg>
  );
}

/** 안내 아이콘 (동그라미 안의 i) */
export function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/** 단색 반짝임 아이콘 (AI 표시). 색은 글자색을 따른다 */
export function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2c.6 4.9 2.6 7.4 8 8-5.4.6-7.4 3.1-8 8-.6-4.9-2.6-7.4-8-8 5.4-.6 7.4-3.1 8-8Z" />
      <path d="M19 15c.3 2.3 1.2 3.4 3.5 3.7-2.3.3-3.2 1.4-3.5 3.7-.3-2.3-1.2-3.4-3.5-3.7 2.3-.3 3.2-1.4 3.5-3.7Z" />
    </svg>
  );
}

