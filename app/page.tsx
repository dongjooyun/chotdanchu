import { ChatApp } from "@/components/chat-app";
import { getMode } from "@/lib/config";
import { exampleNames } from "@/lib/data";

/** 메인 화면 한 장: 헤더, 고정 정보줄, 채팅 영역, 에이전트 사고 과정 패널, 면책 문구, 그 아래 기업 카드 모음 */
export default function Home() {
  const mode = getMode();
  return (
    <main className="wrap">
      <ChatApp mode={mode} examples={exampleNames(mode)} />
    </main>
  );
}
