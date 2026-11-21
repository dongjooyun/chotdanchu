// 하는 일 세 줄 요약 사전 계산 스크립트 (CDC-26). 시연 기업 4곳의 최신 사업보고서 원문에서 "사업의 개요"를 받아
// 수치 없이 문장 3줄로 요약해 data/real/business-summaries.json에 저장한다. 앱은 실행 중에 이 파일만 읽는다.
//
// 실행: node scripts/build-business-summaries.mts [--dry] [--force]
//   --dry    네트워크와 키 없이, 무엇을 받고 무엇을 건너뛸지만 출력한다
//   --force  이미 저장된 기업도 다시 받는다
//   --llm    작은 모델(config.models.small)로 요약한다 (ANTHROPIC_API_KEY 필요, 크레딧 사용). 없으면 규칙 요약(원문 문장 선택)만 한다
//            모델 답이 규칙(정확히 3줄, 숫자 없음)을 어기면 그 기업은 규칙 요약으로 대신한다
//   - .env.local의 OPENDART_API_KEY를 쓴다. 키는 화면, 로그, 파일에 찍지 않는다
//   - 이미 저장된 기업(요약 있음, 공시 없음)은 건너뛴다 (같은 기업을 두 번 부르지 않는다)
//   - 실패는 저장하지 않는다. 다시 돌리면 실패한 기업만 다시 시도한다
//   - 사업보고서가 없는 기업은 { status: "no_report" }("공시 없음")로 저장해서, 아직 계산 안 한 기업("확인 불가")과 구분한다
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredSummary, SummaryStore } from "../lib/business-summary.ts";
import { createAnthropicClient } from "../lib/agent/llm.ts";
import { summarizeOverviewAsync, type LlmSummaryDeps } from "../lib/agent/summarize.ts";
import { config } from "../lib/config.ts";
import { fetchBusinessOverview, planTargets, toStoredSummary } from "../lib/real/business-overview.ts";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "data/real/business-summaries.json");
const CHECKED_AT = new Date().toISOString().slice(0, 10);

/**
 * 시연 기업 4곳 (11/22 정함). 고유번호는 data/real/companies.json의 id와 같다.
 * 카카오는 같은 이름의 폐업 법인(00918444)이 따로 있어서 상장 법인의 고유번호만 쓴다.
 */
const DEMO = [
  { corpCode: "00258801", name: "카카오" },
  { corpCode: "01137727", name: "무신사" },
  { corpCode: "01153956", name: "컬리" },
  { corpCode: "01547845", name: "당근마켓" },
];

const args = new Set(process.argv.slice(2));
const dry = args.has("--dry");
const force = args.has("--force");
const useLlm = args.has("--llm");

function loadEnv(): Record<string, string> {
  const path = join(ROOT, ".env.local");
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const stored: SummaryStore = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as SummaryStore) : {};

// 대상이 실데이터 기업 목록에 있는지 확인 (오타 방지)
const real = JSON.parse(readFileSync(join(ROOT, "data/real/companies.json"), "utf8")) as { id: string; name: string }[];
for (const d of DEMO) if (!real.some((c) => c.id === d.corpCode)) throw new Error(`data/real/companies.json에 없는 고유번호: ${d.name} ${d.corpCode}`);

const plan = planTargets(DEMO.map((d) => d.corpCode), stored, force);
const nameOf = (code: string) => DEMO.find((d) => d.corpCode === code)?.name ?? code;
console.log(`대상 ${DEMO.length}곳: 받을 곳 ${plan.todo.length} (${plan.todo.map(nameOf).join(", ") || "없음"}), 건너뜀 ${plan.skipped.length} (${plan.skipped.map(nameOf).join(", ") || "없음"})`);

if (dry) {
  console.log("--dry: 네트워크를 부르지 않고 끝냅니다.");
} else if (plan.todo.length > 0) {
  const env = { ...loadEnv(), ...process.env };
  const key = env.OPENDART_API_KEY;
  if (!key) throw new Error("OPENDART_API_KEY가 없습니다 (.env.local)");
  let llm: LlmSummaryDeps | undefined;
  if (useLlm) {
    if (!env.ANTHROPIC_API_KEY) throw new Error("--llm에는 ANTHROPIC_API_KEY가 필요합니다 (.env.local)");
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY; // SDK가 환경변수에서 읽는다. 값은 출력하지 않는다
    llm = { llm: createAnthropicClient(), model: config.models.small };
  }
  let saved = 0;
  for (const code of plan.todo) {
    const result = await fetchBusinessOverview(code, { key });
    const summary = result.status === "ok" ? await summarizeOverviewAsync(result.text, llm) : null;
    const entry: StoredSummary | null = toStoredSummary(result, summary, CHECKED_AT);
    if (entry) {
      stored[code] = entry;
      saved++;
      console.log(`${nameOf(code)}: ${entry.status === "ok" ? `요약 ${entry.lines.length}줄 저장 (${entry.method === "llm" ? "AI 요약" : "규칙 요약"})` : "공시 없음으로 저장"}`);
    } else {
      // 실패한 이유만 출력한다 (주소와 키는 출력하지 않는다)
      console.log(`${nameOf(code)}: 저장 안 함 (${result.status === "failed" ? result.reason : "쓸 수 있는 문장이 없음"})`);
    }
    await new Promise((r) => setTimeout(r, 500)); // 호출 간격
  }
  // 고유번호 순서를 고정해서 다시 돌려도 파일 차이가 최소가 되게 한다
  const sorted = Object.fromEntries(Object.entries(stored).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`data/real/business-summaries.json에 ${saved}곳을 저장했습니다.`);
}
