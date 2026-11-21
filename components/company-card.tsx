import { GradeBadge, NoGradeBadge } from "@/components/grade-badge";
import {
  DISCLOSURE_LABELS,
  METRIC_LABELS,
  NATURE_LABELS,
  UNAVAILABLE_REASON_LABELS,
} from "@/lib/format";
import { gradeDistribution } from "@/lib/indicators";
import { INDICATOR_LABELS, type Company, type GradedIndicator } from "@/lib/types";

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
      <span className="src">
        {unavailable && g.reason ? `이유: ${UNAVAILABLE_REASON_LABELS[g.reason]}` : g.basis}
        {g.source && (
          <>
            <br />
            출처: {g.source.name} · {g.source.checkedAt}
          </>
        )}
      </span>
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
  return { head: `지표 ${total}개 중 ${total - d.none}개를 공식 출처로 확인했어요`, none: d.none };
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
 * 기업 카드: 결론(유형, 확인 개수, 등급 분포, 정보 투명도)을 먼저 보여주고 지표 행은 펼쳐서 본다.
 * 주 버튼은 "기업 카드 저장하기" 하나 (화면당 1개). 저장하면 기업 카드 모음에 "기본 기준" 카드로 들어간다.
 */
export function CompanyCard({
  company,
  graded,
  onSave,
  saved = false,
}: {
  company: Company;
  graded: GradedIndicator[];
  onSave?: () => void;
  saved?: boolean;
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
      {onSave && (
        <div className="cc-foot">
          {saved && <span className="small muted">기업 카드 모음에 담았어요</span>}
          <button type="button" className="btn btn-primary" data-el="기업 카드 저장하기" onClick={onSave} disabled={saved}>
            {saved ? "저장했어요" : "기업 카드 저장하기"}
          </button>
        </div>
      )}
    </div>
  );
}
