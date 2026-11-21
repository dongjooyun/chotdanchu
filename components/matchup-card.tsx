"use client";

import { useEffect, useRef, useState } from "react";
import { GradeBadge } from "@/components/grade-badge";
import { currentPair, MATCHUP_INDICATORS, MATCHUP_ROUNDS } from "@/lib/matchup";
import { INDICATOR_LABELS, type IndicatorId, type MatchupCard as MatchupCardData } from "@/lib/types";

/** 지표 이름 옆 (i)에 보이는 설명. 숫자 없이 무엇을 보는 지표인지만 쓴다 */
export const INDICATOR_HINTS: Record<IndicatorId, string> = {
  financial_health: "빚 부담과 버틸 힘이에요. 일반 기업은 부채비율, 스타트업은 현금으로 몇 개월 버티는지로 봐요.",
  growth: "매출이 1년 전보다 얼마나 늘었는지예요.",
  profitability: "본업으로 이익을 내는지예요. 영업이익률로 봐요.",
  hiring_flow: "1년 전보다 직원이 늘었는지, 얼마나 많이 퇴사하는지예요.",
  compensation: "국민연금 신고 금액으로 추정한 보상 수준이에요.",
  tenure: "직원들이 평균 몇 년 다니는지예요.",
  tech_investment: "연구개발에 쓰는 비중이나 등록 특허 수예요.",
  funding_stage: "외부 투자를 어느 단계까지 받았는지예요. 스타트업에만 매겨요.",
  risk: "휴업, 폐업, 감사의견 같은 위험 신호가 있는지예요.",
  transparency: "나머지 지표 중 공식 출처로 확인된 비율이에요.",
};

/** 맞대결 카드 한 장: 기업명 없이 지표별 등급만. 카드 전체를 눌러 고른다 (PRD 02, 11/21 결정) */
function MatchupCardView({
  card,
  title,
  onPick,
  picked,
  disabled,
}: {
  card: MatchupCardData;
  title: string;
  onPick?: () => void;
  picked: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`mc${picked ? " picked" : ""}`} data-el="맞대결 카드">
      <button type="button" className="pick" aria-label={`${title} 선택`} onClick={onPick} disabled={disabled || !onPick} />
      <h3>{title}</h3>
      <ul>
        {MATCHUP_INDICATORS.map((id) => (
          <li key={id}>
            <span className="k">
              {INDICATOR_LABELS[id]}
              <span className="info tip" tabIndex={0} aria-label={`${INDICATOR_LABELS[id]} 설명`}>
                i<span className="tip-pop" role="tooltip">{INDICATOR_HINTS[id]}</span>
              </span>
            </span>
            <GradeBadge grade={card.grades[id] ?? null} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 진행 표시 "4 / 7"과 막대 */
function Progress({ done }: { done: number }) {
  return (
    <div className="mp-prog" data-el="진행 표시">
      <b className="small">
        {Math.min(done + 1, MATCHUP_ROUNDS)} / {MATCHUP_ROUNDS}
      </b>
      <span className="bar" aria-hidden="true">
        {Array.from({ length: MATCHUP_ROUNDS }, (_, i) => (
          <i key={i} className={i <= done ? "on" : undefined} />
        ))}
      </span>
    </div>
  );
}

/** 등급 범례: A, B, C가 등급이라는 것을 알려 준다 (11/20 피드백) */
export function GradeLegend() {
  return (
    <p className="legend">
      <b>A, B, C는 지표별 등급이에요.</b>
      <span><GradeBadge grade="A" size="sm" /> 좋음</span>
      <span><GradeBadge grade="B" size="sm" /> 보통</span>
      <span><GradeBadge grade="C" size="sm" /> 미흡</span>
      <span><GradeBadge grade={null} size="sm" /> 확인 불가</span>
    </p>
  );
}

/**
 * 맞대결 게임 한 번 (8강 토너먼트 7판). 고르면 0.5초 뒤 다음 판으로 넘어가고, 7판이 끝나면 onDone에 고른 기록을 넘긴다.
 * "이전 판으로 돌아가기"로 한 판씩 되돌리고, "건너뛰고 기본 기준으로"는 늘 보인다.
 */
export function MatchupGame({
  onDone,
  onSkip,
  disabled = false,
}: {
  onDone: (picks: string[]) => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  const [picks, setPicks] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const pair = currentPair(picks);
  const locked = disabled || picked !== null;

  function pick(id: string) {
    if (locked) return;
    setPicked(id);
    timer.current = setTimeout(() => {
      const next = [...picks, id];
      setPicked(null);
      setPicks(next);
      if (next.length === MATCHUP_ROUNDS) onDone(next);
    }, 500);
  }

  if (!pair) return null;
  return (
    <div className="mp-wrap" data-el="맞대결">
      <div className="mp-top">
        <b className="mp-title">더 끌리는 카드를 선택해 주세요</b>
        <Progress done={picks.length} />
        <p className="mp-note" data-el="맞대결 안내">진행 중인 맞대결은 임시 저장되지 않아요. 새로고침하거나 창을 닫으면 1판부터 다시 해요.</p>
      </div>
      <div className="mp">
        <MatchupCardView card={pair[0]} title="기업 A" picked={picked === pair[0].id} onPick={() => pick(pair[0].id)} disabled={locked} />
        <span className="vs" aria-hidden="true">VS</span>
        <MatchupCardView card={pair[1]} title="기업 B" picked={picked === pair[1].id} onPick={() => pick(pair[1].id)} disabled={locked} />
      </div>
      <GradeLegend />
      <div className="mp-foot">
        <button type="button" className="btn btn-link small" disabled={locked || picks.length === 0} onClick={() => setPicks(picks.slice(0, -1))}>
          이전 판으로 돌아가기
        </button>
        <button type="button" className="btn btn-link small" disabled={disabled} onClick={onSkip}>
          건너뛰고 기본 기준으로
        </button>
      </div>
    </div>
  );
}

/** 카탈로그용: 맞대결 한 판의 모양만 (고를 수 없음) */
export function MatchupPair({ cards }: { cards: [MatchupCardData, MatchupCardData] }) {
  return (
    <div className="mp-wrap" data-el="맞대결">
      <div className="mp-top">
        <b className="mp-title">더 끌리는 카드를 선택해 주세요</b>
        <Progress done={0} />
      </div>
      <div className="mp">
        <MatchupCardView card={cards[0]} title="기업 A" picked={false} disabled />
        <span className="vs" aria-hidden="true">VS</span>
        <MatchupCardView card={cards[1]} title="기업 B" picked={false} disabled />
      </div>
      <GradeLegend />
    </div>
  );
}
