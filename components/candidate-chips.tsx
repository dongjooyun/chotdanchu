"use client";

import { LofiBox } from "@/components/lofi-box";
import type { CandidateSummary } from "@/lib/chat";

/**
 * 동명 기업 후보 칩 (PRD 03). 이름이 같은 회사가 여럿이면 대표자, 소재지, 업종, 설립연도로 고르게 한다.
 * 대표자는 화면 표시 전용이고 LLM에 보내지 않는다. 상장, 폐업 같은 상태는 이름 옆에 꼬리표로 붙인다.
 */
export function CandidateChips({
  candidates,
  onPick,
  disabled = false,
}: {
  candidates: CandidateSummary[];
  onPick?: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <LofiBox label="동명 기업 후보 칩">
      <div className="flex flex-col gap-2">
        {candidates.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={disabled || !onPick}
            onClick={() => onPick?.(c.id)}
            className="rounded border border-line px-3 py-2 text-left text-sm hover:bg-tag disabled:cursor-default disabled:opacity-70"
          >
            <strong>{c.name}</strong>
            {c.tags.map((t) => (
              <span key={t} className="ml-1 rounded border border-line px-1 text-[10px]">
                {t}
              </span>
            ))}
            <span className="block text-xs text-muted">
              {[c.ceoName && `대표 ${c.ceoName}`, c.address, c.industry, `설립 ${c.foundedYear ?? "-"}`].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
      </div>
    </LofiBox>
  );
}
