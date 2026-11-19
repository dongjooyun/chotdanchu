import Link from "next/link";
import { LofiBox } from "@/components/lofi-box";
import { ModeBadge } from "@/components/mode-badge";
import type { AppMode } from "@/lib/chat";

/** 맨 위 헤더: 서비스 이름, 한 줄 소개, 모드 표시 (PRD 01) */
export function AppHeader({ mode }: { mode: AppMode }) {
  return (
    <LofiBox label="헤더">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">
            <Link href="/">첫단추</Link>
          </h1>
          <p className="text-sm text-muted">첫 회사, 3년 뒤까지 보고 고르세요.</p>
        </div>
        <div className="flex items-center gap-3">
          <ModeBadge mode={mode} />
          <Link href="/catalog" className="text-xs text-muted underline">
            위젯 카탈로그 (개발용)
          </Link>
        </div>
      </div>
    </LofiBox>
  );
}
