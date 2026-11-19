"use client";

import { useState } from "react";
import { GradeBadge } from "@/components/grade-badge";
import { LofiBox } from "@/components/lofi-box";
import type { ReportCardData } from "@/lib/report-card";
import { FIT_LABELS, SAMPLE_REPORT_CARD } from "@/lib/samples";
import { INDICATOR_LABELS } from "@/lib/types";

/** 적합도 라벨 배지 (PRD 06): 짧은 이름 + 설명 한 줄 */
export function FitLabelBadge({ name, description }: { name: string; description: string }) {
  return (
    <span className="inline-flex flex-col rounded border border-line px-2 py-1 text-xs">
      <strong>{name}</strong>
      <span className="text-muted">{description}</span>
    </span>
  );
}

/** 앞면: 한눈에 보는 결론. 판정 라벨이 가장 크다 */
function Front({ d }: { d: ReportCardData }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>[유형 배지] {d.typeLabel}</span>
        <span>No. {String(d.no).padStart(3, "0")}</span>
      </div>
      <div>
        <p className="text-base font-bold">{d.companyName}</p>
        <p className="text-xs text-muted">{d.role} 직무 · {d.checkedAt} 기준</p>
      </div>
      <div className="rounded border-2 border-fg p-2">
        <p className="text-xs text-muted">[판정 라벨: 카드의 주인공]</p>
        <p className="text-2xl font-bold">{d.fitLabel}</p>
        <p className="text-sm">{d.fitReason}</p>
      </div>
      <div className="rounded border border-line p-2 text-xs">
        <p className="text-muted">내 성향</p>
        <p className="font-semibold">{d.preferenceType ?? "기본 기준 (맞대결 건너뜀)"}</p>
        <p className="mt-1 text-muted">내가 중시한 지표</p>
        <ul className="mt-0.5 flex flex-wrap gap-2">
          {d.topIndicators.map((t) => (
            <li key={t.id} className="flex items-center gap-1">
              <span>{INDICATOR_LABELS[t.id]}</span>
              <GradeBadge grade={t.grade} size="sm" />
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded border border-line p-2 text-xs">
        <p className="text-muted">3년 뒤 요구 역량 (3년차 공고 대비)</p>
        <p className="font-semibold">
          이어짐 {d.gap.connected} · 일부 {d.gap.partial} · 공백 {d.gap.missing}
        </p>
        <p className="text-[10px] text-muted">출처: {d.careerSource}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-[10px] text-muted">공개 데이터 기반 참고 정보이며 기업 평가가 아니에요.</p>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-dashed border-line text-[10px] text-muted">
          [QR]
        </span>
      </div>
    </div>
  );
}

/** 뒷면: 근거. 지표 10개, 면접 역질문, 에이전트가 판단한 곳 */
function Back({ d }: { d: ReportCardData }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="font-semibold">{d.companyName} 근거</p>
      <ul className="grid grid-cols-2 gap-1">
        {d.grades.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-1 rounded border border-line px-1.5 py-1">
            <span className="truncate">{INDICATOR_LABELS[g.id]}</span>
            <GradeBadge grade={g.grade} size="sm" />
          </li>
        ))}
      </ul>
      <div>
        <p className="text-muted">면접에서 물어볼 것</p>
        <ol className="mt-0.5 list-decimal pl-4">
          {d.interviewQuestions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </div>
      <div>
        <p className="text-muted">에이전트가 판단한 곳</p>
        <ul className="mt-0.5 list-disc pl-4">
          {d.decisions.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      <p className="text-[10px] text-muted">수치는 코드가 공식 출처에서 그대로 가져왔어요. 기준일 {d.checkedAt}</p>
    </div>
  );
}

/**
 * 저장용 리포트 카드 (PRD 06). 앞면은 결론, 뒷면은 근거. 카드 비율은 세로형으로 고정해 이미지로 저장해도 같은 모양이다.
 * 지금은 예시 값이고, 실제 값은 리포트 태스크(CDC-16)에서 채운다.
 */
export function ReportCard({ data = SAMPLE_REPORT_CARD }: { data?: ReportCardData }) {
  const [side, setSide] = useState<"front" | "back">("front");
  return (
    <LofiBox label="리포트 카드">
      <div className="mx-auto w-full max-w-[340px]">
        <div className="min-h-[480px] rounded-xl border-2 border-fg bg-box p-3">
          {side === "front" ? <Front d={data} /> : <Back d={data} />}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <button
            type="button"
            onClick={() => setSide(side === "front" ? "back" : "front")}
            className="rounded border border-line py-1.5 hover:bg-tag"
          >
            {side === "front" ? "뒷면 보기 (근거)" : "앞면 보기"}
          </button>
          <button type="button" disabled className="rounded border-2 border-fg py-1.5 font-semibold disabled:opacity-60">
            [주 버튼] 이미지로 저장
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted">이미지 저장은 라이브러리 확인 후 붙여요. 카드는 내 카드 모음에도 자동으로 담겨요.</p>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted">판정 라벨 5종 보기</summary>
        <div className="mt-1 flex flex-wrap gap-2">
          {FIT_LABELS.map((l) => (
            <FitLabelBadge key={l.id} name={l.name} description={l.description} />
          ))}
        </div>
      </details>
    </LofiBox>
  );
}
