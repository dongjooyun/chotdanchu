"use client";

import { GradeBadge } from "@/components/grade-badge";
import { LofiBox } from "@/components/lofi-box";
import { INDICATOR_LABELS, type Grade, type IndicatorId, type MatchupCard as MatchupCardData } from "@/lib/types";

/** 맞대결 카드 한 장: 기업명 없이 지표별 등급만 보인다 (PRD 02) */
function MatchupCardView({ card, onPick, disabled }: { card: MatchupCardData; onPick?: () => void; disabled?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded border border-line p-2 text-xs">
      <strong className="text-sm">{card.title}</strong>
      <ul className="flex flex-col gap-0.5">
        {(Object.entries(card.grades) as [IndicatorId, string][]).map(([id, g]) => (
          <li key={id} className="flex justify-between gap-1">
            <span className="truncate">{INDICATOR_LABELS[id]}</span>
            <GradeBadge grade={g as Grade | "unavailable"} size="sm" />
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={disabled || !onPick}
        onClick={onPick}
        className="mt-1 rounded border border-line py-1 hover:bg-tag disabled:opacity-60"
      >
        이쪽이 더 끌려요
      </button>
    </div>
  );
}

/** 맞대결 한 판: 카드 두 장이 모바일(380px)에서도 나란히 보인다. 진행 표시는 8강 기준 */
export function MatchupPair({
  cards,
  roundLabel = "8강 1/4",
  onPick,
  disabled,
}: {
  cards: [MatchupCardData, MatchupCardData];
  roundLabel?: string;
  onPick?: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <LofiBox label="맞대결 카드">
      <p className="mb-2 text-xs text-muted">[진행 표시] {roundLabel} · 모두 7판</p>
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <MatchupCardView key={c.id} card={c} disabled={disabled} onPick={onPick ? () => onPick(c.id) : undefined} />
        ))}
      </div>
    </LofiBox>
  );
}
