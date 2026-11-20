import { LofiBox } from "@/components/lofi-box";
import type { AnalysisRecord } from "@/lib/types";

/**
 * 내 카드 모음. 분석한 기업이 카드 한 장씩 쌓인다 (브라우저에만 저장, 최대 10장).
 * 카드 모양(이미지 저장, 리포트 QR)은 준오 시안(CDC-12)을 따라 채운다.
 */
export function CardCollection({ records }: { records: AnalysisRecord[] }) {
  return (
    <LofiBox label="내 카드 모음">
      <p className="mb-2 text-sm font-semibold">내 카드 {records.length}장</p>
      {records.length === 0 ? (
        <p className="text-xs text-muted">기업을 분석하면 카드가 여기에 모여요.</p>
      ) : (
        <ol className="grid grid-cols-3 gap-2 text-xs md:grid-cols-2">
          {records.map((r) => (
            <li key={r.companyId} className="rounded border border-line bg-box p-2">
              <p className="truncate font-semibold">{r.name}</p>
              <p className="text-muted">{r.label ?? "[판정 라벨: 리포트 후]"}</p>
              {/* 저장은 UTC(ISO)라 그대로 자르면 한국 시간으로 하루 전이 될 수 있다. 브라우저 시간대로 바꿔 보인다 */}
              <p className="text-[10px] text-muted">{new Date(r.analyzedAt).toLocaleDateString("sv-SE")}</p>
            </li>
          ))}
        </ol>
      )}
    </LofiBox>
  );
}
