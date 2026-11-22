import { toBlob } from "html-to-image";

/**
 * 카드를 사진(PNG)으로 만드는 브라우저 전용 도구 (11/22 다시 만듦).
 * 실사용에서 아이폰(사파리)은 저장이 안 되고 회사 로고가 빠졌다. 안드로이드 크롬은 잘 됐다. 원인과 대책:
 * 1) 사파리는 사진을 찍을 때 아직 안 읽은 이미지(로고)를 빼고 찍는다 -> 로고를 먼저 데이터 주소로 바꿔 넣고, 다 읽힌 뒤에 찍는다.
 *    사파리(WebKit) 계열은 첫 호출에 글꼴, 이미지가 빠지는 알려진 문제가 있어 한 번 먼저 찍어 버린다.
 * 2) 사파리는 버튼을 누른 "직후"에만 공유 창을 열어 준다. 눌러서 사진을 만들면 늦어서 막힌다 -> 사진은 미리 만들어 두고,
 *    누르면 바로 보여 준다.
 */

const UA = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);

/** 손가락으로 쓰는 화면인지 (휴대폰, 태블릿). 이런 화면은 파일 내려받기 대신 "길게 눌러 저장" 창을 쓴다 */
export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/** 사파리 계열인지. 아이폰은 크롬을 써도 안쪽은 사파리(WebKit)다 */
export function isWebKit(): boolean {
  const ua = UA();
  return /iPhone|iPad|iPod/.test(ua) || (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua));
}

/** 앱 안에서 연 화면(카카오톡, 인스타그램, 네이버 앱 등)인지. 파일 저장, 공유가 막히는 곳이 많다 */
export function inAppBrowser(): "kakao" | "other" | null {
  const ua = UA();
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  if (/Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps|; wv\)/i.test(ua)) return "other";
  return null;
}

async function toDataUrl(src: string): Promise<string> {
  const res = await fetch(src, { cache: "force-cache" });
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** 카드 안 이미지(로고)를 데이터 주소로 바꾸고 다 읽힐 때까지 기다린다. 찍는 동안만 쓰는 복사본이라 원본에 영향이 없다 */
async function inlineImages(node: HTMLElement) {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      try {
        const src = img.getAttribute("src");
        if (src && !src.startsWith("data:")) img.src = await toDataUrl(src);
        await img.decode();
      } catch {
        // 로고 하나가 안 읽혀도 카드는 찍는다 (이니셜 없이 빈칸이 될 수 있음)
      }
    }),
  );
}

/** 카드를 2배 크기 PNG로. 화면 밖 복사본(node)을 찍는다 */
export async function makeCardPng(node: HTMLElement): Promise<Blob> {
  await document.fonts?.ready;
  await inlineImages(node);
  const options = {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#ffffff",
    // 화면 밖(left -9999px)에 둔 위치를 그대로 복제하면 빈 흰 이미지가 나온다. 찍을 때만 제자리로 돌린다
    style: { position: "static", left: "0", top: "0", margin: "0" },
  } as const;
  if (isWebKit()) await toBlob(node, options).catch(() => null);
  const blob = await toBlob(node, options);
  if (!blob) throw new Error("empty");
  return blob;
}
