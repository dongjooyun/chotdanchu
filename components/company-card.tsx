import { LofiBox } from "@/components/lofi-box";
import {
  DISCLOSURE_LABELS,
  METRIC_LABELS,
  NATURE_LABELS,
  UNAVAILABLE_REASON_LABELS,
  formatIndicatorValue,
} from "@/lib/format";
import { INDICATOR_LABELS, type Company, type IndicatorValue } from "@/lib/types";

/** 지표 한 칸: 등급 배지 + 수치 한 줄 + 출처와 기준 시점 (PRD 04) */
function IndicatorCell({ x }: { x: IndicatorValue }) {
  const unavailable = x.status === "unavailable";
  return (
    <div className={`rounded border border-line p-2 text-xs ${unavailable ? "bg-grade-none" : "bg-box"}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold">{INDICATOR_LABELS[x.id]}</span>
        {/* 등급은 지표 계산(compute_indicators, CDC-24)이 붙인다. 지금은 자리만 */}
        <span className="rounded bg-tag px-1 text-[10px] text-muted">[등급 배지: 계산 전]</span>
      </div>
      <div className="mt-1">
        <span className="text-muted">{METRIC_LABELS[x.metric] ?? x.metric}</span>{" "}
        <span className="font-medium">{formatIndicatorValue(x)}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted">
        {unavailable
          ? `이유: ${x.reason ? UNAVAILABLE_REASON_LABELS[x.reason] : "알 수 없음"}`
          : `출처: ${x.source?.name ?? "-"} · 기준 ${x.period ?? "-"}`}
      </div>
    </div>
  );
}

/**
 * 결론 한 줄: 지표 몇 개를 공식 출처로 확인했고 몇 개가 확인 불가인지. 숫자는 데이터에서 센다.
 * 예: 지표 9개 중 8개 확인 -> "지표 9개 중 8개를 공식 출처로 확인했어요 · 확인 불가 1개"
 */
function summaryLine(company: Company): string {
  const total = company.indicators.length;
  const missing = company.indicators.filter((x) => x.status === "unavailable").length;
  const found = total - missing;
  return `지표 ${total}개 중 ${found}개를 공식 출처로 확인했어요${missing > 0 ? ` · 확인 불가 ${missing}개` : ""}`;
}

/** 기업 카드: 결론(유형, 확인 개수, 등급 분포)을 먼저 보여주고 지표 칸들은 펼쳐서 본다 */
export function CompanyCard({ company }: { company: Company }) {
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
        <p className="text-sm font-semibold">{summaryLine(company)}</p>
        {/* 등급 분포(A 3 · B 5 · C 1)는 지표 계산(CDC-24)이 붙이면 채운다 */}
        <p className="mt-1 text-xs text-muted">[등급 분포: 계산 전]</p>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm">지표 자세히 보기</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {company.indicators.map((x) => (
            <IndicatorCell key={x.id} x={x} />
          ))}
          <div className="rounded border border-dashed border-line p-2 text-xs">
            <span className="font-semibold">{INDICATOR_LABELS.transparency}</span>
            <div className="mt-1 text-muted">[정보 투명도: 계산 전]</div>
          </div>
        </div>
      </details>
      <p className="mt-2 text-[10px] text-muted">
        [하는 일 세 줄 요약 자리] 사업보고서가 있는 기업만 표시 (예비 기능)
      </p>
    </LofiBox>
  );
}
