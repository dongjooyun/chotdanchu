// 시연 기업 사전 계산 스크립트. 공공 출처를 한 번 불러서 data/real/companies.json을 만든다.
// 앱은 실행 중에 이 파일만 읽는다 (API 호출 없음, 같은 기업을 두 번 계산하지 않음).
//
// 실행: node scripts/build-real-companies.mts
//   - .env.local의 OPENDART_API_KEY, DATA_GO_KR_API_KEY를 쓴다. 키는 화면과 파일에 찍지 않는다
//   - 국민연금 파일 폴더: NPS_DIR (기본값: 레포 옆 ../data-raw/nps). 최신 월과 12개월 전 월 파일 두 개가 필요하다
//   - 대상 기업과 유형 판정: data/real/targets.json, 사람이 확인한 값: data/real/manual.json
import { readFileSync, readdirSync, writeFileSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { assembleCompany, riskIndicator, type DartProfile, type ManualValue, type NtsStatus, type RealTarget } from "../lib/real/assemble.ts";
import { financialIndicators, parseAmount, startupFinancials, tenureIndicator, type DartAccountRow, type DartEmployeeRow } from "../lib/real/dart.ts";
import { compensationIndicator, hiringIndicator, industryAverage, matchRow, parseNpsLine, type NpsRow } from "../lib/real/nps.ts";
import type { Company } from "../lib/types.ts";

const ROOT = join(import.meta.dirname, "..");
const CHECKED_AT = new Date().toISOString().slice(0, 10);

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = { ...loadEnv(), ...process.env } as Record<string, string | undefined>;
const DART_KEY = env.OPENDART_API_KEY;
const GO_KEY = env.DATA_GO_KR_API_KEY;
if (!DART_KEY) throw new Error("OPENDART_API_KEY가 없습니다 (.env.local)");

async function dart<T>(path: string, query: string): Promise<{ status: string; list?: T[] } & Record<string, unknown>> {
  const res = await fetch(`https://opendart.fss.or.kr/api/${path}.json?crtfc_key=${DART_KEY}&${query}`);
  return res.json();
}

/** 국세청 사업자 상태. 키가 없거나 실패하면 null (리스크는 감사의견만으로 본다) */
async function ntsStatus(bizNos: string[]): Promise<Map<string, NtsStatus>> {
  const out = new Map<string, NtsStatus>();
  if (!GO_KEY || bizNos.length === 0) return out;
  const res = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(GO_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ b_no: bizNos }),
  });
  const j = (await res.json()) as { data?: { b_no: string; b_stt_cd: string }[] };
  for (const d of j.data ?? []) if (["01", "02", "03"].includes(d.b_stt_cd)) out.set(d.b_no, d.b_stt_cd as NtsStatus);
  return out;
}

/** 파일 첫 데이터 줄의 자료생성년월. 예: "2026-09" */
function filePeriod(path: string): string {
  const fd = openSync(path, "r");
  const buf = Buffer.alloc(2000);
  readSync(fd, buf, 0, 2000, 0);
  closeSync(fd);
  const line = new TextDecoder("euc-kr").decode(buf).split(/\r?\n/)[1] ?? "";
  return line.slice(0, 7);
}

function readNps(path: string): NpsRow[] {
  const text = new TextDecoder("euc-kr").decode(readFileSync(path));
  const rows: NpsRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const r = parseNpsLine(line);
    if (r) rows.push(r);
  }
  return rows;
}

/** "2026-09" -> "2025-09" */
function yearBefore(period: string): string {
  return `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
}

async function main() {
  const targets = JSON.parse(readFileSync(join(ROOT, "data/real/targets.json"), "utf8")) as RealTarget[];
  const manual = JSON.parse(readFileSync(join(ROOT, "data/real/manual.json"), "utf8")) as ManualValue[];

  const npsDir = env.NPS_DIR ?? join(ROOT, "..", "data-raw", "nps");
  const files = readdirSync(npsDir).filter((f) => f.endsWith(".csv")).map((f) => ({ path: join(npsDir, f), period: filePeriod(join(npsDir, f)) }));
  const latest = files.sort((a, b) => b.period.localeCompare(a.period))[0];
  const prev = files.find((f) => f.period === yearBefore(latest.period));
  console.log(`국민연금 파일: 최신 ${latest.period}, 12개월 전 ${prev?.period ?? "없음"}`);
  const npsNow = readNps(latest.path);
  const npsPrev = prev ? readNps(prev.path) : [];

  const profiles = new Map<string, DartProfile>();
  for (const t of targets) profiles.set(t.corpCode, (await dart("company", `corp_code=${t.corpCode}`)) as unknown as DartProfile);
  const nts = await ntsStatus([...profiles.values()].map((p) => p.bizr_no).filter(Boolean));
  const ntsSource = { name: "국세청 사업자등록 상태조회", url: "https://www.data.go.kr/data/15081808/openapi.do", checkedAt: CHECKED_AT };

  const companies: Company[] = [];
  for (const t of targets) {
    const profile = profiles.get(t.corpCode)!;
    // 가장 최근 사업보고서 연도 (올해 3월 이전이면 전년도가 아직 없을 수 있어 한 해 더 본다)
    let year = "";
    let fin: DartAccountRow[] = [];
    for (const y of [new Date().getFullYear() - 1, new Date().getFullYear() - 2]) {
      const r = await dart<DartAccountRow>("fnlttSinglAcnt", `corp_code=${t.corpCode}&bsns_year=${y}&reprt_code=11011`);
      if (r.status === "000" && r.list?.length) {
        year = String(y);
        fin = r.list;
        break;
      }
    }
    // 사업보고서를 내도 재무 숫자(XBRL)가 API에 없는 비상장사가 있다 (예: 당근마켓). 직원 현황과 감사의견은 따로 찾는다
    const reportYear = year || String(new Date().getFullYear() - 1);
    const emp = await dart<DartEmployeeRow>("empSttus", `corp_code=${t.corpCode}&bsns_year=${reportYear}&reprt_code=11011`);
    const adt = await dart<{ adt_opinion: string; rcept_no: string; bsns_year: string }>("accnutAdtorNmNdAdtOpinion", `corp_code=${t.corpCode}&bsns_year=${reportYear}&reprt_code=11011`);
    // 당기 감사의견만 본다 (전기, 전전기 행도 같이 온다)
    const opinions = (adt.list ?? []).filter((a) => /당기/.test(a.bsns_year)).map((a) => a.adt_opinion).filter((o) => o && o !== "-");

    const name = profile.corp_name.replace(/\(주\)|주식회사/g, "");
    const prefix = profile.bizr_no?.slice(0, 6) ?? "";
    const now = matchRow(npsNow, prefix, name);
    const before = matchRow(npsPrev, prefix, name);
    // 국민연금 업종이 "BIZ_NO미존재사업장"처럼 업종이 아닌 값이면, 사람이 정한 업종명(targets.json)과 같은 국민연금 업종으로 평균을 낸다
    const realIndustry = now && !/미존재|해당없음/.test(now.industryName);
    const peerCode = realIndustry ? now!.industryCode : npsNow.find((r) => r.industryName === t.industry)?.industryCode;
    const industry = now && peerCode ? industryAverage(npsNow, peerCode, now) : null;
    const status = nts.get(profile.bizr_no) ?? null;

    // 스타트업 런웨이에 쓸 현금. 주요계정에는 없어서 전체 재무제표(별도)에서 찾는다
    let cash: number | null = null;
    if (year && t.nature === "startup") {
      const all = await dart<{ sj_div: string; account_nm: string; thstrm_amount: string }>("fnlttSinglAcntAll", `corp_code=${t.corpCode}&bsns_year=${year}&reprt_code=11011&fs_div=OFS`);
      cash = parseAmount(all.list?.find((r) => r.sj_div === "BS" && r.account_nm.trim() === "현금및현금성자산")?.thstrm_amount);
    }

    const company = assembleCompany({
      target: t,
      profile,
      financials: !year ? [] : t.nature === "startup" ? startupFinancials(fin, cash, year, CHECKED_AT) : financialIndicators(fin, year, CHECKED_AT),
      tenure: emp.list?.length ? tenureIndicator(emp.list, reportYear, CHECKED_AT) : null,
      hiring: hiringIndicator(now, before, CHECKED_AT),
      compensation: compensationIndicator(now, industry, CHECKED_AT),
      risk: riskIndicator(status, opinions, {
        nts: status ? ntsSource : null,
        audit: adt.list?.[0] ? { name: `OpenDART ${reportYear} 감사의견`, url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${adt.list[0].rcept_no}`, checkedAt: CHECKED_AT } : null,
      }),
      npsIndustry: realIndustry ? now!.industryName : null,
      manual,
      checkedAt: CHECKED_AT,
    });
    companies.push(company);
    const ok = company.indicators.filter((i) => i.status !== "unavailable").length;
    console.log(`${company.name} (${t.corpCode}): 사업보고서 ${year || "없음"}, 국민연금 ${now ? "매칭" : "없음"}, 국세청 ${status ?? "모름"}, 값 있는 지표 ${ok}/9`);
  }

  writeFileSync(join(ROOT, "data/real/companies.json"), JSON.stringify(companies, null, 2) + "\n");
  console.log(`data/real/companies.json에 ${companies.length}곳을 썼습니다`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
