/**
 * 카드 가운데 기업 표시 (data-el 로고 자리). 공식 로고가 있으면 영역을 가로로 가득 채우고(변형하지 않음),
 * 없으면 이니셜 정사각형만 그린다. 배경 무늬는 쓰지 않는다.
 */
export function CompanyMark({ logo, monogram }: { logo: string | null; monogram: string }) {
  return (
    <span className="art" data-el="로고 자리" aria-hidden="true">
      {logo ? (
        // 로고는 작은 정적 이미지라 next/image 최적화 없이 그대로 쓴다
        // eslint-disable-next-line @next/next/no-img-element
        <img className="logo-img" src={logo} alt="" />
      ) : (
        <span className="mono-mark">{monogram}</span>
      )}
    </span>
  );
}
