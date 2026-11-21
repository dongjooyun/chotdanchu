"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toBlob } from "html-to-image";
import { QRCodeSVG } from "qrcode.react";
import { CompanyMark } from "@/components/company-mark";
import { GradeBadge } from "@/components/grade-badge";
import { shareHref } from "@/lib/share";
import { FIT_DESCRIPTIONS, type FitLabel } from "@/lib/fit-label";
import type { ReportCardData } from "@/lib/report-card";
import { SAMPLE_REPORT_CARD } from "@/lib/samples";
import { INDICATOR_LABELS, type Role, type SavedReport } from "@/lib/types";

const ROLES: Role[] = ["서비스기획", "마케팅", "운영"];

const noopSubscribe = () => () => {};
/** 지금 사이트 주소. 서버에서 그릴 때는 빈 문자열이라 QR은 브라우저에서만 나온다 */
const useOrigin = () => useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");

const isFitLabel = (s: string): s is FitLabel => s in FIT_DESCRIPTIONS;

/** 앞면: 한눈에 보는 결론. 판정 결과가 가장 크다 */
function Front({
  d,
  missingRole,
  onRequestRole,
  hidden,
}: {
  d: ReportCardData;
  missingRole?: Role;
  onRequestRole?: (role: Role) => void;
  hidden: boolean;
}) {
  const top = d.topIndicators.map((t) => INDICATOR_LABELS[t.id]).join(", ");
  const origin = useOrigin();
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
              <b>{d.fitLabel ?? "판정 없음"}</b>
              {d.fitLabel && isFitLabel(d.fitLabel) && <span className="small" data-el="라벨 설명">{FIT_DESCRIPTIONS[d.fitLabel]}</span>}
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
              {d.gap ? (
                <>
                  <div>
                    <dt>3년차 공고 요구 역량</dt>
                    <dd>
                      {d.gap.connected + d.gap.partial + d.gap.missing}개{d.careerYears ? ` (경력 ${d.careerYears})` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>{d.role} 신입 때 쌓는 역량</dt>
                    <dd>{d.gap.connected}개</dd>
                  </div>
                  <div>
                    <dt>다른 직무와 겹치는 역량</dt>
                    <dd>{d.gap.partial}개</dd>
                  </div>
                  <div>
                    <dt>따로 채워야 하는 역량</dt>
                    <dd>{d.gap.missing}개</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt>3년차 공고 요구 역량</dt>
                  <dd>확인 불가</dd>
                </div>
              )}
            </dl>
            {d.substituteNote && (
              <p className="small muted" data-el="대체 공고 안내">
                <span className="tag">유사 기업 공고로 비교</span> {d.substituteNote}
              </p>
            )}
            {d.fitLabel && origin && (
              <div className="rc-qr" data-el="카드 QR">
                <QRCodeSVG value={`${origin}${shareHref(d.companyId, d.role, d.weightsParam)}`} size={64} level="M" marginSize={0} />
                <span className="tiny muted">QR로 이 카드를 다시 열 수 있어요. 링크에는 기업, 직무, 내 기준만 담겨요</span>
              </div>
            )}
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
        {d.gapDetail && (
          <div className="small" data-el="역량 비교 상세">
            <b>3년차 공고 요구 역량 비교</b>
            <p className="muted">{d.role} 직무에서 신입 때 쌓는 역량과 견준 결과예요</p>
            <ul>
              {d.gapDetail.connected.length > 0 && <li>신입 때 쌓는 역량: {d.gapDetail.connected.join(", ")}</li>}
              {d.gapDetail.partial.length > 0 && <li>다른 직무와 겹치는 역량: {d.gapDetail.partial.join(", ")}</li>}
              {d.gapDetail.missing.length > 0 && <li>따로 채워야 하는 역량: {d.gapDetail.missing.join(", ")}</li>}
            </ul>
          </div>
        )}
        {d.careerSource && (
          <p className="small" data-el="3년차 공고 출처">
            <span className="muted">3년차 공고: </span>
            {d.careerUrl ? (
              <a href={d.careerUrl} target="_blank" rel="noreferrer">
                {d.careerSource}
              </a>
            ) : (
              d.careerSource
            )}
          </p>
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

  /** 이미지로 저장: 요약(앞면) 또는 근거(뒷면) 카드를 사진으로 만든다. 돌아가 있어도 같은 결과가 나오게, 저장하는 동안만 화면 밖에 그 면을 따로 그린다 */
  const [shot, setShot] = useState<"idle" | "making" | "failed">("idle");
  const [face, setFace] = useState<"요약" | "근거">("요약");
  const capRef = useRef<HTMLDivElement>(null);
  const fileName = `첫단추-${shown.companyName}-${shown.role}-${face}.png`;
  useEffect(() => {
    if (shot !== "making") return;
    (async () => {
      try {
        await document.fonts?.ready;
        const blob = capRef.current ? await toBlob(capRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" }) : null;
        if (!blob) throw new Error("empty");
        const file = new File([blob], fileName, { type: "image/png" });
        // 휴대폰에서는 공유 창으로 갤러리에 저장하고, 안 되면 파일로 내려받는다
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            setShot("idle");
            return;
          } catch (e) {
            if ((e as Error).name === "AbortError") {
              setShot("idle");
              return;
            }
          }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setShot("idle");
      } catch {
        setShot("failed");
      }
    })();
    // 저장을 누른 순간의 파일 이름이면 충분하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

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
      {/* 직무 탭은 카드 밖에 둔다. 이미지로 저장할 때 카드만 찍히게 하려는 것 (11/21) */}
      {tabs}
      <div className={`flip ${back ? "is-back" : ""} ${flipping ? "flipping" : ""}`} data-el="리포트 카드">
        <div className="flip-inner">
          <Front d={shown} missingRole={missingRole} onRequestRole={onRequestRole} hidden={back} />
          <Back d={shown} hidden={!back} />
        </div>
        <span className="sheen" aria-hidden="true" />
      </div>
      <div className="rc-actions">
        {(["요약", "근거"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={f === "요약" ? "btn btn-primary" : "btn"}
            onClick={() => {
              setFace(f);
              setShot("making");
            }}
            disabled={Boolean(missingRole) || shot === "making" || !shown.fitLabel}
            data-el={`${f} 카드 저장`}
          >
            {shot === "making" && face === f ? "이미지 만드는 중" : `${f} 카드 저장하기`}
          </button>
        ))}
        <button type="button" className="btn" onClick={flip} disabled={Boolean(missingRole)}>
          {back ? "요약 보기" : "근거 보기"}
        </button>
      </div>
      {shot === "failed" && (
        <p className="small muted" role="status">
          이미지를 만들지 못했어요. 화면을 캡처해서 저장해 주세요.
        </p>
      )}
      {shot === "making" && (
        <div className="cap-offscreen" ref={capRef} aria-hidden="true">
          {face === "요약" ? <Front d={shown} hidden /> : <Back d={shown} hidden={false} />}
        </div>
      )}
    </div>
  );
}
