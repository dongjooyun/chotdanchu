import { GradeBadge, NoGradeBadge } from "@/components/grade-badge";
import {
  DISCLOSURE_LABELS,
  METRIC_LABELS,
  NATURE_LABELS,
  SUMMARY_UNAVAILABLE_LABELS,
  UNAVAILABLE_REASON_LABELS,
} from "@/lib/format";
import { gradeDistribution } from "@/lib/indicators";
import { INDICATOR_LABELS, type BusinessSummary, type Company, type GradedIndicator } from "@/lib/types";

/** 지표 한 줄: 이름, 수치 한 줄, 등급 배지, 아래에 기준과 출처 (PRD 04). 공시 표처럼 행으로 읽는다 */
function IndicatorRow({ g, metric }: { g: GradedIndicator; metric?: string }) {
  const unavailable = g.grade === null && g.reason !== undefined;
  return (
    <div className="im" data-el={unavailable ? "확인 불가 칸" : "지표 칸"}>
      <span className="k">{INDICATOR_LABELS[g.id]}</span>
      <span className={unavailable ? "v muted" : "v"}>
        {unavailable ? "확인 불가" : (
          <>
            {metric && <span className="muted">{METRIC_LABELS[metric] ?? metric} </span>}
            {g.display}
          </>
        )}
      </span>
      {g.grade === null && !unavailable ? <NoGradeBadge /> : <GradeBadge grade={g.grade} />}
      <span className="src">{unavailable && g.reason ? `이유: ${UNAVAILABLE_REASON_LABELS[g.reason]}` : g.basis}</span>
      {g.source && (<span className="src src-from">출처: {g.source.name} · {g.source.checkedAt}</span>)}
    </div>
  );
}

/**
 * 결론 한 줄: 지표 몇 개를 공식 출처로 확인했고 몇 개가 확인 불가인지. 숫자는 등급 결과에서 센다.
 * 예: 스타트업 9개 중 5개 확인 -> "지표 9개 중 5개를 공식 출처로 확인했어요" + "확인 불가 4개"
 */
function summary(graded: GradedIndicator[], company: Company): { head: string; none: number } {
  const d = gradeDistribution(graded, company.nature);
  const total = d.A + d.B + d.C + d.none;
  return { head: `지표 ${total}개 중 ${total - d.none}개를 공식 출처로 확인했어요.`, none: d.none };
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
    <div className="cc-hl">
      {weak.length > 0 && (
        <span>
          <b>C 등급: </b>
          {weak.map((g) => `${INDICATOR_LABELS[g.id]} ${g.display}`).join(" · ")}
        </span>
      )}
      {missing.length > 0 && (
        <span className="muted">
          확인 불가: {missing.map((g) => INDICATOR_LABELS[g.id]).join(", ")} (이유는 아래를 펼치면 보여요)
        </span>
      )}
    </div>
  );
}

/**
 * 하는 일 세 줄 요약 (PRD 04, CDC-26, 준오 구현). 세 가지 상태를 다르게 보여준다.
 * 요약 있음: 3줄 + 원문 링크 (목업은 "가상 링크"), 공시 없음: 사업보고서가 없는 기업, 확인 불가: 아직 못 만든 상태.
 * USE_AGENT=true면 검색할 때마다 AI가 새로 요약한다 (lib/agent/fresh-summary.ts).
 * 스타일은 새 디자인 규칙을 따른다: 흰 카드 안 1px 회색 선 상자, 그림자 없음, 모서리 4px (globals.css의 .cc-biz)
 */
function BusinessSummaryBlock({ summary }: { summary: BusinessSummary }) {
  return (
    <div className="cc-biz" data-el="하는 일 세 줄 요약" data-summary-status={summary.status}>
      <b>
        하는 일 세 줄 요약{" "}
        {summary.status === "ok" && summary.method === "llm" && <span className="tag tag-ai">AI 요약</span>}
      </b>
      {summary.status === "ok" && (
        <>
          <ol className="cc-biz-l">
            {summary.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
          <p className="cc-biz-n">
            {summary.method === "llm" ? "AI가 요약했고 숫자는 쓰지 않았어요. " : "원문 문장 중 숫자가 없는 문장만 골랐어요. "}
            원문:{" "}
            {summary.source.url ? (
              <a href={summary.source.url} target="_blank" rel="noreferrer" className="src-link">
                {summary.source.name}
              </a>
            ) : (
              <span>원문 링크 자리 (가상 링크, 목업)</span>
            )}{" "}
            · 확인 {summary.source.checkedAt}
          </p>
        </>
      )}
      {summary.status === "no_report" && (
        <>
          <p className="cc-biz-v">공시 없음</p>
          <p className="cc-biz-n">사업보고서가 없는 기업이라 요약을 보여주지 않아요.</p>
        </>
      )}
      {summary.status === "unavailable" && (
        <>
          <p className="cc-biz-v">확인 불가</p>
          <p className="cc-biz-n">이유: {SUMMARY_UNAVAILABLE_LABELS[summary.reason]}</p>
        </>
      )}
    </div>
  );
}

/**
 * 기업 카드: 결론(유형, 확인 개수, 등급 분포, 정보 투명도)을 먼저 보여주고 지표 행은 펼쳐서 본다.
 * 저장 버튼은 두지 않는다. 기업 카드 모음에는 최종 판단 리포트 아래 "기업 카드 모음에 담기"로만 담는다 (11/22).
 */
export function CompanyCard({
  company,
  graded,
  summary: business,
}: {
  company: Company;
  graded: GradedIndicator[];
  /** 하는 일 세 줄 요약. 예전 대화(저장된 말풍선)에는 없을 수 있다 */
  summary?: BusinessSummary;
}) {
  const d = gradeDistribution(graded, company.nature);
  const s = summary(graded, company);
  const transparency = graded.find((g) => g.id === "transparency");
  const cells = graded.filter((g) => g.id !== "transparency");
  return (
    <div className="cc" data-el="기업 카드">
      <div className="cc-head">
        <div className="cc-name">
          {company.name}
          <span className="tag" data-el="유형 배지">
            {DISCLOSURE_LABELS[company.disclosure]} · {NATURE_LABELS[company.nature]}
          </span>
          {company.isMock && <span className="tag">목업 데이터</span>}
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          판정 근거: {company.natureBasis}
        </p>
        <p className="small muted">
          {company.industry} · {company.address} · 설립 {company.foundedOn?.slice(0, 4) ?? "-"}
        </p>
      </div>
      {business && <BusinessSummaryBlock summary={business} />}
      <div className="cc-sum">
        <b>{s.head}</b>
        {s.none > 0 && <span className="muted"> · 확인 불가 {s.none}개</span>}
        <div className="dist" data-el="등급 분포">
          <span><GradeBadge grade="A" size="sm" />{d.A}</span>
          <span><GradeBadge grade="B" size="sm" />{d.B}</span>
          <span><GradeBadge grade="C" size="sm" />{d.C}</span>
          <span><GradeBadge grade={null} size="sm" />{d.none}</span>
          {transparency && (
            <span style={{ marginLeft: "auto" }} className="small muted">
              {INDICATOR_LABELS.transparency} <GradeBadge grade={transparency.grade} size="sm" />
            </span>
          )}
        </div>
        <Highlights cells={cells} />
      </div>
      <details className="cc-more ilog-t">
        <summary>지표 자세히 보기</summary>
        <div className="imetrics">
          {cells.map((g) => (
            <IndicatorRow key={g.id} g={g} metric={company.indicators.find((x) => x.id === g.id)?.metric} />
          ))}
          {transparency && <IndicatorRow g={transparency} />}
        </div>
      </details>
    </div>
  );
}
