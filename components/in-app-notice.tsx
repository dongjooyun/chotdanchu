"use client";

import { useState, useSyncExternalStore } from "react";
import { inAppBrowser } from "@/components/card-image";

/**
 * 카카오톡 등 앱 안에서 연 화면 안내 (11/22 실사용 테스트에서 둘 다 카카오톡 안에서 열었다).
 * 앱 안 브라우저는 파일 저장, 공유 창, 일부 화면 효과가 막힐 수 있어서 다른 브라우저(크롬, 사파리)로 열어 달라고 알린다.
 * 카카오톡은 주소 하나로 바로 바깥 브라우저를 여는 방법(kakaotalk://web/openExternal)이 있어 버튼을 둔다.
 * 서버에서 그릴 때는 알 수 없어 화면이 뜬 뒤에만 나온다. 닫으면 이번 방문에서는 다시 안 나온다.
 */
const noop = () => () => {};

export function InAppNotice() {
  const kind = useSyncExternalStore(noop, () => inAppBrowser(), () => null);
  const [closed, setClosed] = useState(false);
  if (!kind || closed) return null;
  const href = typeof window === "undefined" ? "#" : `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
  return (
    <aside className="inapp-notice" role="note" data-el="앱 안 브라우저 안내">
      <p>
        <b>다른 브라우저로 열어 주세요.</b> 지금 앱 안에서 열어서 카드 이미지 저장이 잘 안 될 수 있어요. 크롬이나 사파리에서 열면 모두 잘 돼요.
      </p>
      <div className="inapp-actions">
        {kind === "kakao" && (
          <a className="btn btn-primary" href={href}>
            다른 브라우저로 열기
          </a>
        )}
        <button type="button" className="btn" onClick={() => setClosed(true)}>
          그냥 볼게요
        </button>
      </div>
    </aside>
  );
}
