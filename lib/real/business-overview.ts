// 사업보고서 원문에서 "사업의 개요" 문단을 받아 오는 코드 (CDC-26, 실데이터 경로).
// 앱은 이 파일을 부르지 않는다. scripts/build-business-summaries.mts가 시연 기업만 미리 받아 요약해 두고,
// 앱은 그 결과(data/real/business-summaries.json)만 읽는다 (실행 중 외부 API 없음).
// 네트워크는 fetchBusinessOverview 하나만 부르고, 나머지는 순수 함수라 테스트에서 고정 입력으로 확인한다.
// 키는 호출하는 쪽이 .env.local에서 읽어 넘긴다. 이 파일은 키를 로그나 오류 문구에 넣지 않는다.
// 주의: 실제 DART 원문 구조로 실행해 본 적이 없다. 추출 규칙은 공시 문서의 SECTION/TITLE 구조를 가정한 것이라 키로 한 번 확인이 필요하다.
import { inflateRawSync } from "node:zlib";
import type { StoredSummary } from "../business-summary.ts";
import { dartViewerUrl } from "./dart.ts";

/** 개요 문단 최소 길이(글자). 이보다 짧으면 개요가 아니라 제목만 있는 것으로 본다 */
export const MIN_OVERVIEW_CHARS = 30;
/** 요약 재료로 쓸 최대 길이(글자). 개요 문단은 길 수 있고 앞부분만 있으면 된다 */
export const MAX_OVERVIEW_CHARS = 4000;

/** 공시검색(list.json) 한 행 */
export interface DartListRow {
  report_nm: string; // 예: "사업보고서 (2025.12)", "[기재정정]사업보고서 (2025.12)"
  rcept_no: string;
  rcept_dt: string; // YYYYMMDD
}

export interface BusinessReportRef {
  rceptNo: string;
  reportName: string;
  rceptDate: string;
}

/**
 * 공시 행들에서 가장 최근 사업보고서 하나. 정정 공시도 사업보고서라 접수일이 가장 늦은 것을 쓴다.
 * 분기보고서, 반기보고서, 감사보고서는 "사업보고서"라는 글자가 없어서 빠진다.
 * 예: ["사업보고서 (2024.12)" 20250320, "[기재정정]사업보고서 (2024.12)" 20250410, "분기보고서 (2025.03)" 20250515] -> 20250410 것
 */
export function pickLatestBusinessReport(rows: DartListRow[]): BusinessReportRef | null {
  const reports = rows.filter((r) => r.report_nm.includes("사업보고서") && r.rcept_no);
  if (reports.length === 0) return null;
  const latest = reports.reduce((a, b) => (b.rcept_dt > a.rcept_dt ? b : a));
  return { rceptNo: latest.rcept_no, reportName: latest.report_nm.trim(), rceptDate: latest.rcept_dt };
}

// ---------------------------------------------------------------------------
// ZIP 읽기 (OpenDART 문서 API는 원문 XML을 ZIP으로 준다). 새 라이브러리 없이 Node 기본 기능만 쓴다.
// ---------------------------------------------------------------------------

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * ZIP 파일의 항목들을 푼다. 저장(0)과 deflate(8)만 지원한다.
 * 예: PK 헤더로 시작하는 바이트 -> [{ name: "20260318001423.xml", data: <바이트> }]
 * ZIP이 아니거나 깨졌으면 예외를 던진다.
 */
export function readZip(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // 끝 중앙 디렉터리 레코드(EOCD)를 뒤에서부터 찾는다
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP 파일이 아닙니다");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP 목록이 깨졌습니다");
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localAt = dv.getUint32(p + 42, true);
    const name = new TextDecoder("utf-8").decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (localAt + 30 > buf.length || dv.getUint32(localAt, true) !== 0x04034b50) throw new Error("ZIP 항목이 깨졌습니다");
    const dataAt = localAt + 30 + dv.getUint16(localAt + 26, true) + dv.getUint16(localAt + 28, true);
    const raw = buf.subarray(dataAt, dataAt + compSize);
    if (method === 0) out.push({ name, data: raw });
    else if (method === 8) out.push({ name, data: inflateRawSync(raw) });
    else throw new Error(`지원하지 않는 ZIP 압축 방식입니다 (${method})`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** XML 바이트를 글자로. 첫 줄의 encoding 선언을 따르고 없으면 UTF-8. 예: encoding="euc-kr" -> EUC-KR로 푼다 */
export function decodeXml(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const enc = /encoding\s*=\s*["']([A-Za-z0-9_-]+)["']/.exec(head)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(enc).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// ---------------------------------------------------------------------------
// "사업의 개요" 문단 추출
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** 태그를 지워 글자만 남긴다. 표(TABLE)는 숫자 덩어리라 통째로 뺀다. 예: "<P>가 &amp; 나</P>" -> "가 & 나" */
export function stripMarkup(xml: string): string {
  return xml
    .replace(/<TABLE[\s\S]*?<\/TABLE>/gi, " ")
    .replace(/<(?:\/P|BR\s*\/?)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

const TITLE_RE = /<TITLE[^>]*>([\s\S]*?)<\/TITLE>/gi;
/** "1. 사업의 개요", "가. 사업의 개요", "사업의 개요" 같은 제목 */
const OVERVIEW_TITLE = /^(?:[0-9]+\.|[가-힣]\.|\([0-9]+\))?\s*사업의\s*개요$/;

/**
 * 사업보고서 원문 XML에서 "사업의 개요" 문단(하위 항목 포함)을 뽑는다. 못 찾으면 null.
 * 1) 제목이 "사업의 개요"인 SECTION을 찾아 그 SECTION이 끝날 때까지를 개요로 본다
 * 2) SECTION 구조가 없으면 다음 제목 앞까지
 * 목차처럼 제목만 있고 본문이 짧은 곳은 건너뛴다. 길이는 MAX_OVERVIEW_CHARS로 자른다.
 * 예: "<SECTION-2><TITLE>1. 사업의 개요</TITLE><P>당사는 ...입니다.</P></SECTION-2>" -> "당사는 ...입니다."
 */
export function extractBusinessOverview(xml: string): string | null {
  const titles = [...xml.matchAll(TITLE_RE)];
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    if (!OVERVIEW_TITLE.test(stripMarkup(t[1]))) continue;
    const bodyStart = (t.index ?? 0) + t[0].length;

    let bodyEnd = titles[i + 1]?.index ?? xml.length; // 방법 2: 다음 제목 앞까지
    const open = /<SECTION-(\d+)[^>]*>\s*$/i.exec(xml.slice(Math.max(0, (t.index ?? 0) - 200), t.index));
    if (open) {
      const close = xml.indexOf(`</SECTION-${open[1]}>`, bodyStart); // 방법 1: 그 SECTION이 끝날 때까지
      if (close >= 0) bodyEnd = close;
    }

    const text = stripMarkup(xml.slice(bodyStart, bodyEnd));
    if (text.length >= MIN_OVERVIEW_CHARS) return text.slice(0, MAX_OVERVIEW_CHARS);
  }
  return null;
}

// ---------------------------------------------------------------------------
// OpenDART 호출 (이 파일의 유일한 네트워크 코드)
// ---------------------------------------------------------------------------

export type OverviewResult =
  | { status: "ok"; text: string; ref: BusinessReportRef }
  /** 최근 사업보고서가 없는 기업 (공시검색 결과가 비어 있음) */
  | { status: "no_report" }
  /** 조회나 추출에 실패함. reason에는 키나 주소를 넣지 않는다 */
  | { status: "failed"; reason: string };

export interface FetchDeps {
  /** OpenDART 인증키. 호출하는 쪽이 .env.local에서 읽어 넘긴다 */
  key: string;
  fetch?: typeof fetch;
  /** 공시검색 시작일 YYYYMMDD. 사업보고서는 해마다 3월쯤 나오므로 기본은 2년 전부터 */
  from?: string;
  /** 오늘 YYYYMMDD (테스트용) */
  today?: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** 응답 본문이 오류 XML이면 상태 코드. 예: "<result><status>020</status>..." -> "020" */
function errorCodeOf(bytes: Uint8Array): string | null {
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 500));
  return /<status>\s*(\d+)\s*<\/status>/.exec(head)?.[1] ?? null;
}

/**
 * 기업 하나의 최신 사업보고서에서 "사업의 개요" 문단을 받아 온다. 호출은 기업당 2번(공시검색 1, 문서 1).
 * 예: fetchBusinessOverview("00258801", { key }) -> { status: "ok", text: "당사는 ...", ref: { rceptNo: "2026...", ... } }
 * 사업보고서가 없으면 { status: "no_report" }, 오류는 { status: "failed", reason: "DART 응답 코드 020" } 같은 짧은 이유.
 */
export async function fetchBusinessOverview(corpCode: string, deps: FetchDeps): Promise<OverviewResult> {
  const f = deps.fetch ?? fetch;
  const today = deps.today ?? ymd(new Date());
  const from = deps.from ?? `${Number(today.slice(0, 4)) - 2}0101`;
  try {
    // 1) 최신 사업보고서 접수번호 찾기 (정기공시 A, 세부 A001 사업보고서)
    const listUrl =
      `https://opendart.fss.or.kr/api/list.json?crtfc_key=${encodeURIComponent(deps.key)}` +
      `&corp_code=${encodeURIComponent(corpCode)}&bgn_de=${from}&end_de=${today}&pblntf_ty=A&pblntf_detail_ty=A001&page_count=100`;
    const list = (await (await f(listUrl)).json()) as { status?: string; list?: DartListRow[] };
    if (list.status === "013") return { status: "no_report" }; // 조회된 데이터가 없음
    if (list.status !== "000") return { status: "failed", reason: `DART 응답 코드 ${list.status ?? "알 수 없음"}` };
    const ref = pickLatestBusinessReport(list.list ?? []);
    if (!ref) return { status: "no_report" };

    // 2) 원문 문서(ZIP) 받아 개요 문단 뽑기
    const docUrl = `https://opendart.fss.or.kr/api/document.xml?crtfc_key=${encodeURIComponent(deps.key)}&rcept_no=${ref.rceptNo}`;
    const bytes = new Uint8Array(await (await f(docUrl)).arrayBuffer());
    const code = errorCodeOf(bytes);
    if (code) return { status: "failed", reason: `DART 문서 응답 코드 ${code}` };
    const xmls = readZip(bytes).filter((e) => /\.xml$/i.test(e.name));
    if (xmls.length === 0) return { status: "failed", reason: "원문 ZIP에 XML이 없음" };
    for (const e of xmls) {
      const text = extractBusinessOverview(decodeXml(e.data));
      if (text) return { status: "ok", text, ref };
    }
    return { status: "failed", reason: "원문에서 사업의 개요를 찾지 못함" };
  } catch (e) {
    // 오류 문구에 주소(키 포함)가 들어가지 않게 이름만 남긴다
    return { status: "failed", reason: `조회 중 오류 (${e instanceof Error ? e.name : "알 수 없음"})` };
  }
}

// ---------------------------------------------------------------------------
// 사전 계산 결과 만들기와 건너뛰기 (캐시)
// ---------------------------------------------------------------------------

/**
 * 받아 온 결과를 저장할 항목으로. 저장하지 않을 결과(실패, 쓸 문장이 없음)는 null이라 다음 실행에서 다시 시도한다.
 * 예: 사업보고서 없음 -> { status: "no_report", checkedAt }, 개요에서 3줄을 뽑음 -> { status: "ok", lines, source, method }
 */
export function toStoredSummary(
  result: OverviewResult,
  summarize: (text: string) => string[],
  checkedAt: string,
): StoredSummary | null {
  if (result.status === "no_report") return { status: "no_report", checkedAt };
  if (result.status !== "ok") return null;
  const lines = summarize(result.text);
  if (lines.length === 0) return null;
  return {
    status: "ok",
    lines,
    source: { name: `OpenDART ${result.ref.reportName}`, url: dartViewerUrl(result.ref.rceptNo), checkedAt },
    method: "rule",
  };
}

/**
 * 이번에 받을 기업과 건너뛸 기업을 나눈다. 이미 저장된 기업(요약 있음, 공시 없음)은 건너뛰어서 같은 기업을 두 번 부르지 않는다.
 * force면 모두 다시 받는다. 예: 저장된 {A: ok}에서 [A, B] -> { todo: [B], skipped: [A] }
 */
export function planTargets(corpCodes: string[], stored: Record<string, unknown>, force = false) {
  const todo: string[] = [];
  const skipped: string[] = [];
  for (const c of [...new Set(corpCodes)]) (!force && stored[c] ? skipped : todo).push(c);
  return { todo, skipped };
}
