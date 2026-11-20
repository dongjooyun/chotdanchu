import { GradeBadge } from "@/components/grade-badge";
import { LofiBox } from "@/components/lofi-box";
import {
  DISCLOSURE_LABELS,
  METRIC_LABELS,
  NATURE_LABELS,
  UNAVAILABLE_REASON_LABELS,
} from "@/lib/format";
import { gradeDistribution } from "@/lib/indicators";
import { INDICATOR_LABELS, type Company, type GradedIndicator } from "@/lib/types";

/** 지표 한 칸: 등급 배지 + 수치 한 줄 + 어느 기준으로 매겼는지 + 출처 (PRD 04) */
function IndicatorCell({ g, metric }: { g: GradedIndicator; metric?: string }) {
  const unavailable = g.grade === null && g.reason !== undefined;
  return (
    <div className={`rounded border border-line p-2 text-xs ${unavailable ? "bg-grade-none" : "bg-box"}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold">{INDICATOR_LABELS[g.id]}</span>
        {g.grade === null && !unavailable ? (
          <span className="text-[10px] text-muted">등급 없음</span>
        ) : (
          <GradeBadge grade={g.grade} size="sm" />
        )}
      </div>
      <div className="mt-1">
        {metric && <span className="text-muted">{METRIC_LABELS[metric] ?? metric} </span>}
        <span className="font-medium">{g.display}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted">
        {unavailable && g.reason ? `이유: ${UNAVAILABLE_REASON_LABELS[g.reason]}` : g.basis}
      </div>
      {g.source && (
        <div className="text-[10px] text-muted">
          출처: {g.source.name} · {g.source.checkedAt}
        </div>
      )}
    </div>
  );
}

/**
 * 결론 한 줄: 지표 몇 개를 공식 출처로 확인했고 몇 개가 확인 불가인지. 숫자는 등급 결과에서 센다.
 * 예: 스타트업 9개 중 5개 확인 -> "지표 9개 중 5개를 공식 출처로 확인했어요 · 확인 불가 4개"
 */
function summaryLine(graded: GradedIndicator[], company: Company): string {
  const d = gradeDistribution(graded, company.nature);
  const total = d.A + d.B + d.C + d.none;
  return `지표 ${total}개 중 ${total - d.none}개를 공식 출처로 확인했어요${d.none > 0 ? ` · 확인 불가 ${d.none}개` : ""}`;
}

/**
 * 펼치지 않아도 보이는 두 줄: C 등급 지표(수치와 함께)와 확인 불가 지표 이름.
 * 예: "C 등급: 리스크 해당 (폐업)", "확인 불가: 재무 체력, 성장성 (이유는 아래를 펼치면 보여요)"
 */
function Highlights({ cells }: { cells: GradedIndicator[] }) {
  const weak = cells.filter((g) => g.grade === "C");
  const missing = cells.filter((g) => g.grade === null && g.reason !== undefined);
  if (weak.length === 0 && missing.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5 text-xs">
      {weak.length > 0 && (
        <p>
          <span className="font-semibold">C 등급: </span>
          {weak.map((g) => `${INDICATOR_LABELS[g.id]} ${g.display}`).join(" · ")}
        </p>
      )}
      {missing.length > 0 && (
        <p className="text-muted">
          확인 불가: {missing.map((g) => INDICATOR_LABELS[g.id]).join(", ")} (이유는 아래를 펼치면 보여요)
        </p>
      )}
    </div>
  );
}

/** 기업 카드: 결론(유형, 확인 개수, 등급 분포, 정보 투명도)을 먼저 보여주고 지표 칸들은 펼쳐서 본다 */
export function CompanyCard({ company, graded }: { company: Company; graded: GradedIndicator[] }) {
  const d = gradeDistribution(graded, company.nature);
  const transparency = graded.find((g) => g.id === "transparency");
  const cells = graded.filter((g) => g.id !== "transparency");
  return (
    <LofiBox label="기업 카드">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{company.name}</strong>
        <span className="rounded border border-line px-1.5 text-xs">
          [유형 배지] {DISCLOSURE_LABELS[company.disclosure]} · {NATURE_LABELS[company.nature]}
        </span>
        {company.isMock && <span className="text-[10px] text-muted">목업 데이터</span>}
      </div>
      <p className="mt-1 text-xs text-muted">판정 근거: {company.natureBasis}</p>
      <p className="text-xs text-muted">
        {company.industry} · {company.address} · 설립 {company.foundedOn?.slice(0, 4) ?? "-"}
      </p>
      <div className="mt-2 rounded border border-line bg-box p-2">
        <p className="text-sm font-semibold">{summaryLine(graded, company)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">[등급 분포]</span>
          <span className="flex items-center gap-1"><GradeBadge grade="A" size="sm" /> {d.A}</span>
          <span className="flex items-center gap-1"><GradeBadge grade="B" size="sm" /> {d.B}</span>
          <span className="flex items-center gap-1"><GradeBadge grade="C" size="sm" /> {d.C}</span>
          <span className="flex items-center gap-1"><GradeBadge grade={null} size="sm" /> {d.none}</span>
          {transparency && (
            <span className="ml-auto flex items-center gap-1">
              <span className="text-muted">{INDICATOR_LABELS.transparency}</span>
              <GradeBadge grade={transparency.grade} size="sm" />
            </span>
          )}
        </div>
        <Highlights cells={cells} />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm">지표 자세히 보기</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {cells.map((g) => (
            <IndicatorCell key={g.id} g={g} metric={company.indicators.find((x) => x.id === g.id)?.metric} />
          ))}
          {transparency && <IndicatorCell g={transparency} />}
        </div>
      </details>
      <p className="mt-2 text-[10px] text-muted">
        [하는 일 세 줄 요약 자리] 사업보고서가 있는 기업만 표시 (예비 기능)
      </p>
    </LofiBox>
  );
}
