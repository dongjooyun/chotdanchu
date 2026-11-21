"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CompanyMark } from "@/components/company-mark";
import { GradeBadge } from "@/components/grade-badge";
import type { ReportCardData } from "@/lib/report-card";
import { SAMPLE_REPORT_CARD } from "@/lib/samples";
import { INDICATOR_LABELS, type Role, type SavedReport } from "@/lib/types";

const ROLES: Role[] = ["서비스기획", "마케팅", "운영"];

/** 앞면: 한눈에 보는 결론. 판정 결과가 가장 크다 */
function Front({
  d,
  tabs,
  missingRole,
  onRequestRole,
  hidden,
}: {
  d: ReportCardData;
  tabs?: ReactNode;
  missingRole?: Role;
  onRequestRole?: (role: Role) => void;
  hidden: boolean;
}) {
  const top = d.topIndicators.map((t) => INDICATOR_LABELS[t.id]).join(", ");
  return (
    <div className="rc rc-face rc-front" aria-hidden={hidden}>
      <div className="rc-top">
        <span>최종 판단 리포트</span>
        <span>No. {d.no}</span>
      </div>
      <div className="rc-body">
        <CompanyMark logo={d.logo} monogram={d.monogram} />
        <div>
          <div className="rc-name">{d.companyName}</div>
          <p className="small muted">
            {missingRole ?? d.role} 직무 · {d.checkedAt} 기준 <span className="tag" data-el="유형 배지">{d.typeLabel}</span>
          </p>
        </div>
        {tabs}
        {missingRole ? (
          <>
            <div className="rc-fit" data-el="판정 라벨">
              <span className="small muted">판정 결과</span>
              <b>이 직무는 아직 안 봤어요</b>
            </div>
            {onRequestRole && (
              <button type="button" className="btn btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => onRequestRole(missingRole)}>
                이 직무로 판정 받기
              </button>
            )}
          </>
        ) : (
          <>
            <div className="rc-fit" data-el="판정 라벨">
              <span className="small muted">판정 결과</span>
              <b>{d.fitLabel ?? "판정 준비 중"}</b>
              <span className="small muted">{d.fitReason}</span>
            </div>
            <dl className="rc-facts">
              <div>
                <dt>내 성향</dt>
                <dd>{d.preferenceType ?? "기본 기준 (맞대결 건너뜀)"}</dd>
              </div>
              {top && (
                <div>
                  <dt>내가 중시한 지표</dt>
                  <dd>{top}</dd>
                </div>
              )}
              <div>
                <dt>3년 뒤 역량 갭</dt>
                <dd>{d.gap ? `이어짐 ${d.gap.connected} · 일부 ${d.gap.partial} · 공백 ${d.gap.missing}` : "공고 비교 준비 중"}</dd>
              </div>
            </dl>
            {d.substituteNote && <p className="small muted">{d.substituteNote}</p>}
          </>
        )}
      </div>
      <div className="rc-foot">공개 데이터 기반 참고 정보이며 기업 평가가 아니에요</div>
    </div>
  );
}

/** 뒷면: 근거. 지표 10개 등급, 에이전트가 판단한 곳, 면접에서 물어볼 것 */
function Back({ d, hidden }: { d: ReportCardData; hidden: boolean }) {
  return (
    <div className="rc rc-face rc-back" aria-hidden={hidden}>
      <div className="rc-top">
        <span>최종 판단 근거</span>
        <span>No. {d.no}</span>
      </div>
      <div className="rc-body">
        <div className="rc-grades">
          {d.grades.map((g) => (
            <div key={g.id}>
              <span>{INDICATOR_LABELS[g.id]}</span>
              <GradeBadge grade={g.grade} size="sm" />
            </div>
          ))}
        </div>
        {d.decisions.length > 0 && (
          <div className="small">
            <span className="tag tag-ai">AI 판단</span>{" "}
            <span className="muted">{d.decisions.join(" · ")}</span>
          </div>
        )}
        <section className="rc-q">
          <h4>면접에서 물어볼 것</h4>
          {d.notice ? (
            <p>{d.notice}</p>
          ) : (
            <ol>
              {d.interviewQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <div className="rc-foot">수치 기반 등급은 공개 데이터로 계산했어요 · 기준일 {d.checkedAt}</div>
    </div>
  );
}

/**
 * 저장용 최종 판단 리포트 카드 (PRD 06). 앞면은 결론, 뒷면은 근거. "근거 보기"를 누르면 Y축으로 돌고 광택이 한 번 지나간다.
 * reports를 주면(기업 카드 모음에서 열 때) 기업 한 장 안에서 직무 탭으로 직무별 판정을 본다.
 */
export function ReportCard({
  data = SAMPLE_REPORT_CARD,
  reports,
  onRequestRole,
}: {
  data?: ReportCardData;
  reports?: Partial<Record<Role, SavedReport>>;
  onRequestRole?: (role: Role) => void;
}) {
  const [back, setBack] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [role, setRole] = useState<Role>(data.role);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const shown = reports?.[role]?.report ?? data;
  const missingRole = reports && !reports[role] ? role : undefined;

  function flip() {
    setBack((b) => !b);
    setFlipping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlipping(false), 850);
  }

  const tabs = reports ? (
    <div className="view-toggle role-tabs" role="group" aria-label="직무">
      {ROLES.map((r) => (
        <button key={r} type="button" aria-pressed={r === role} onClick={() => setRole(r)}>
          {r}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <div className="flip-wrap">
      <div className={`flip ${back ? "is-back" : ""} ${flipping ? "flipping" : ""}`} data-el="리포트 카드">
        <div className="flip-inner">
          <Front d={shown} tabs={tabs} missingRole={missingRole} onRequestRole={onRequestRole} hidden={back} />
          <Back d={shown} hidden={!back} />
        </div>
        <span className="sheen" aria-hidden="true" />
      </div>
      <button type="button" className="btn" onClick={flip} disabled={Boolean(missingRole)}>
        {back ? "요약 보기" : "근거 보기"}
      </button>
    </div>
  );
}
