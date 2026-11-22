"use client";

import { useState } from "react";
import { AppDialog } from "@/components/app-dialog";
import { CompanyMark } from "@/components/company-mark";
import { ReportCard } from "@/components/report-card";
import { cardNo, logoOf, monogram } from "@/lib/brand";
import type { AnalysisRecord, Role } from "@/lib/types";

const MAX_CARDS = 10;

/** 저장은 UTC(ISO)라 그대로 자르면 한국 시간으로 하루 전이 될 수 있다. 브라우저 시간대로 바꿔 보인다 */
const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");

/** 카드 한 장의 요약: 가장 최근 직무, 그 직무가 맞춤 판정인지, 몇 개 직무를 봤는지 */
function summaryOf(r: AnalysisRecord) {
  const roles = Object.keys(r.reports ?? {}) as Role[];
  const role = r.lastRole ?? roles[0] ?? null;
  const saved = role ? r.reports?.[role] : undefined;
  // 모은 직무를 고정 순서로 나열한다. "직무 1/3" 같은 분수 표기는 알아보기 어려워 없앴다 (11/22)
  const ORDER: Role[] = ["서비스기획", "마케팅", "운영"];
  const roleList = ORDER.filter((x) => roles.includes(x)).join(" · ");
  return { role, personalized: Boolean(saved?.personalized), count: roles.length, saved, roleList };
}

function StateTag({ personalized }: { personalized: boolean }) {
  return personalized ? <span className="tag tag-lilac">맞춤 판정 완료</span> : <span className="tag">기본 기준</span>;
}

/**
 * 기업 카드 모음 (data-el 내 카드 모음). 기업 한 곳에 카드 한 장, 브라우저에만 저장, 최대 10장.
 * 목록으로 보기와 카드로 보기를 오가고, 카드를 누르면 창으로 열어 직무 탭과 근거 보기로 본다.
 * 아직 맞춤 판정을 안 받은 카드는 "맞춤 판정 받기"로 밸런스 게임을 이어 간다.
 */
export function CardCollection({
  records,
  onPersonalize,
  onRequestRole,
  busy = false,
}: {
  records: AnalysisRecord[];
  onPersonalize?: (r: AnalysisRecord) => void;
  onRequestRole?: (r: AnalysisRecord, role: Role) => void;
  busy?: boolean;
}) {
  const [view, setView] = useState<"list" | "gallery">("list");
  const [open, setOpen] = useState<AnalysisRecord | null>(null);

  function openCard(r: AnalysisRecord) {
    setOpen(r);
  }

  const go = (r: AnalysisRecord) => (
    <button type="button" className="btn btn-sm go" disabled={busy || !onPersonalize || !r.analysis} onClick={() => onPersonalize?.(r)}>
      맞춤 판정 받기
    </button>
  );

  return (
    <section className="coll" data-el="내 카드 모음" data-view={view}>
      <div className="coll-h">
        <span>
          <b>기업 카드 모음</b> <span className="small muted">총 {records.length}장</span>
        </span>
        <span className="tools">
          <span className="view-toggle" role="group" aria-label="보기 방식">
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
              목록으로 보기
            </button>
            <button type="button" aria-pressed={view === "gallery"} onClick={() => setView("gallery")}>
              카드로 보기
            </button>
          </span>
        </span>
      </div>
      {records.length === 0 && view === "list" ? (
        <p className="coll-empty">기업을 분석하고 저장하면 카드가 여기에 모여요.</p>
      ) : view === "list" ? (
        <div className="coll-list">
          {records.map((r) => {
            const s = summaryOf(r);
            return (
              <div
                key={r.companyId}
                className="coll-r"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  openCard(r);
                }}
              >
                <span className="coll-no">No. {cardNo(r.companyId)}</span>
                <span>
                  <button type="button" className="btn coll-title" onClick={() => openCard(r)}>
                    {r.name}
                  </button>
                  <span className="coll-sub">
                    <StateTag personalized={s.personalized} />
                    <span className="small muted">
                      {s.roleList ? `${s.roleList} · ` : ""}
                      {day(s.saved?.savedAt ?? r.analyzedAt)}
                    </span>
                  </span>
                </span>
                {s.personalized ? <span className="tag" data-el="판정 라벨">{r.label ?? "판정 준비 중"}</span> : go(r)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="coll-gallery">
          {records.map((r) => {
            const s = summaryOf(r);
            return (
              <button key={r.companyId} type="button" className="gc" onClick={() => openCard(r)} aria-label={`${r.name} 카드 열기`}>
                <span className="gc-top">
                  <span>최종 판단 리포트</span>
                  <span>No. {cardNo(r.companyId)}</span>
                </span>
                <span className="gc-body">
                  <CompanyMark logo={logoOf(r.companyId)} monogram={monogram(r.name)} />
                  <span className="gc-name">{r.name}</span>
                  <span className="gc-role">
                    {s.roleList ? `${s.roleList} · ` : ""}
                    {day(s.saved?.savedAt ?? r.analyzedAt)}
                  </span>
                  {s.personalized ? <StateTag personalized /> : <span className="gc-cta">맞춤 판정 받기</span>}
                </span>
              </button>
            );
          })}
          {Array.from({ length: Math.max(0, MAX_CARDS - records.length) }, (_, i) => (
            <div key={`empty-${i}`} className="gc-empty" aria-hidden="true">
              <b>No. ????????</b>
              <span>아직 비어 있어요.</span>
            </div>
          ))}
        </div>
      )}
      <AppDialog open={open !== null} title="기업 카드 보기" onClose={() => setOpen(null)}>
        {open && summaryOf(open).saved && (
          <ReportCard
            key={open.companyId}
            data={summaryOf(open).saved!.report}
            reports={open.reports}
            onRequestRole={
              onRequestRole
                ? (role) => {
                    setOpen(null);
                    onRequestRole(open, role);
                  }
                : undefined
            }
          />
        )}
        {open && !summaryOf(open).saved && <p className="small muted">이 카드는 예전 형식이라 다시 분석하면 열 수 있어요.</p>}
        {open && !summaryOf(open).personalized && onPersonalize && open.analysis && (
          <div className="dlg-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setOpen(null);
                onPersonalize(open);
              }}
            >
              맞춤 판정 받기
            </button>
          </div>
        )}
      </AppDialog>
    </section>
  );
}
