import Link from "next/link";
import { Suspense } from "react";
import { ReportCard } from "@/components/report-card";
import { getMode } from "@/lib/config";
import { getCompany } from "@/lib/data";
import { computeIndicators } from "@/lib/indicators";
import { buildReportDraft } from "@/lib/report-draft";
import { decodeWeights, parseRole } from "@/lib/share";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * QR이 여는 카드 보기 (PRD 06). 링크의 기업 ID, 직무, 선호 가중치로 같은 코드가 카드를 다시 계산해 그린다.
 * 로그인도 저장도 없다. 에이전트 판단 로그는 이 화면에 없어서 "AI 판단" 줄은 비어 있다.
 */
export default function CardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="wrap">
      <section className="shared-card" data-el="공유 카드">
        {/* 링크 값(searchParams)은 요청마다 달라서 Suspense 안에서 읽는다 */}
        <Suspense fallback={<p className="small muted">카드를 불러오는 중이에요</p>}>
          <SharedCard searchParams={searchParams} />
        </Suspense>
        <p className="small">
          <Link href="/" className="btn btn-link">
            첫단추에서 내 기준으로 판정하기
          </Link>
        </p>
      </section>
    </main>
  );
}

async function SharedCard({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const mode = getMode();
  const company = one("c") ? getCompany(one("c")!, mode) : undefined;
  const role = parseRole(one("r"));
  if (!company || !role) return <p className="small muted">열 수 없는 카드 링크예요. 첫단추에서 카드를 다시 만들어 주세요.</p>;
  return (
    <ReportCard
      data={buildReportDraft({
        company,
        graded: computeIndicators(company),
        role,
        preference: decodeWeights(one("w")),
        log: [],
        checkedAt: new Date().toISOString().slice(0, 10),
        mode,
      })}
    />
  );
}
