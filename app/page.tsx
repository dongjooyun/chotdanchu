import { AppHeader } from "@/components/app-header";
import { ChatApp } from "@/components/chat-app";
import { Disclaimer } from "@/components/disclaimer";
import { getMode } from "@/lib/config";

/** 메인 화면 한 장: 헤더, 채팅 영역과 판단 로그 패널, 면책 문구 */
export default function Home() {
  const mode = getMode();
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4">
      <AppHeader mode={mode} />
      <ChatApp mode={mode} />
      <Disclaimer />
    </main>
  );
}
