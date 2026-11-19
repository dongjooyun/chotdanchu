import { LofiBox } from "@/components/lofi-box";
import { FIT_LABELS } from "@/lib/samples";

/** 적합도 라벨 배지 (PRD 06): 짧은 이름 + 설명 한 줄 */
export function FitLabelBadge({ name, description }: { name: string; description: string }) {
  return (
    <span className="inline-flex flex-col rounded border border-line px-2 py-1 text-xs">
      <strong>{name}</strong>
      <span className="text-muted">{description}</span>
    </span>
  );
}

/** 판단 리포트 자리 (PRD 06). 문장과 역질문은 리포트 태스크(CDC-16)에서 채운다 */
export function ReportCard() {
  return (
    <LofiBox label="판단 리포트">
      <p className="text-xs text-muted">[적합도 라벨 배지] 아래 5개 중 하나가 코드로 정해진다</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {FIT_LABELS.map((l) => (
          <FitLabelBadge key={l.id} name={l.name} description={l.description} />
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs">
        <div className="rounded border border-dashed border-line p-2">[판단과 근거 문장 자리] 수치는 도구 결과 인용, 출처 링크</div>
        <div className="rounded border border-dashed border-line p-2">[역량 갭 자리] 이어짐 · 일부 · 공백 (PRD 05)</div>
        <div className="rounded border border-dashed border-line p-2">[면접 역질문 자리] 확인 불가 항목마다 하나 이상</div>
      </div>
    </LofiBox>
  );
}
