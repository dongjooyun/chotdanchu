// 사업보고서 원문에서 "사업의 개요"를 뽑는 코드 테스트 (CDC-26, 실데이터 경로). 케이스 ID: RBO-*
// 네트워크와 키는 쓰지 않는다: 가짜 fetch와 직접 만든 ZIP, 가상 원문 조각으로 확인한다.
// 기법: EP(정상, 목차만 있는 경우), BVA(개요 본문 최소 길이 30자), EG(깨진 ZIP, 오류 응답, 네트워크 오류), 규칙(키가 오류 문구에 안 나옴), 캐시(건너뛰기)
import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { summarizeOverview, type SummaryStore } from "@/lib/business-summary";
import {
  decodeXml,
  extractBusinessOverview,
  fetchBusinessOverview,
  MAX_OVERVIEW_CHARS,
  MIN_OVERVIEW_CHARS,
  pickLatestBusinessReport,
  planTargets,
  readZip,
  stripMarkup,
  toStoredSummary,
} from "@/lib/real/business-overview";

const KEY = "SECRET-KEY-1234567890";

/** 테스트용 ZIP 만들기. method 0은 저장, 8은 deflate */
function makeZip(entries: { name: string; data: Uint8Array; method?: 0 | 8 }[]): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 8;
    const body = method === 8 ? deflateRawSync(e.data) : Buffer.from(e.data);
    const name = Buffer.from(e.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(e.data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}

const BODY = "당사는 전국의 판매자와 소비자를 이어 주는 온라인 장터를 운영하는 회사입니다. 수수료와 광고가 주된 수입원입니다.";

/** 가상 사업보고서 조각: 목차(제목만)가 앞에 있고, 본문은 II. 사업의 내용 아래에 있다 */
const REPORT_XML = `<?xml version="1.0" encoding="utf-8"?><DOCUMENT>
<TOC><P>1. 사업의 개요</P><TITLE>1. 사업의 개요</TITLE></TOC>
<SECTION-1><TITLE>I. 회사의 개요</TITLE><P>회사의 연혁입니다. 설립은 오래전입니다. 충분히 긴 문장을 넣어 둡니다.</P></SECTION-1>
<SECTION-1><TITLE>II. 사업의 내용</TITLE>
<SECTION-2><TITLE>1. 사업의 개요</TITLE><P>${BODY}</P>
<TABLE><TR><TD>매출 1,234억원</TD></TR></TABLE>
<SECTION-3><TITLE>가. 업계의 현황</TITLE><P>시장은 &amp; 빠르게 변하고 있습니다.</P></SECTION-3>
</SECTION-2>
<SECTION-2><TITLE>2. 주요 제품 및 서비스</TITLE><P>이 부분은 개요가 아닙니다. 제외되어야 하는 문단입니다. 충분히 길게 씁니다.</P></SECTION-2>
</SECTION-1></DOCUMENT>`;

describe("RBO-01~08 원문에서 사업의 개요 뽑기", () => {
  it("RBO-01 목차의 제목은 건너뛰고 본문이 있는 '사업의 개요'를 뽑는다 (하위 항목 포함)", () => {
    const text = extractBusinessOverview(REPORT_XML)!;
    expect(text).toContain("온라인 장터를 운영하는 회사입니다");
    expect(text).toContain("시장은 & 빠르게 변하고 있습니다"); // 하위 항목(가.)도 개요에 들어가고, &amp;는 풀린다
  });

  it("RBO-02 다음 항목(2. 주요 제품 및 서비스)과 다른 장의 문단은 섞이지 않는다", () => {
    const text = extractBusinessOverview(REPORT_XML)!;
    expect(text).not.toContain("제외되어야 하는 문단");
    expect(text).not.toContain("회사의 연혁");
  });

  it("RBO-03 표(TABLE)는 통째로 빠져서 표 안의 숫자가 요약 재료에 없다", () => {
    expect(extractBusinessOverview(REPORT_XML)).not.toContain("1,234");
  });

  it("RBO-04 SECTION 태그가 없는 문서는 다음 제목 앞까지를 개요로 본다", () => {
    const xml = `<TITLE>사업의 개요</TITLE><P>${BODY}</P><TITLE>2. 다음 항목</TITLE><P>다른 내용입니다.</P>`;
    const text = extractBusinessOverview(xml)!;
    expect(text).toContain("온라인 장터");
    expect(text).not.toContain("다른 내용");
  });

  it("RBO-05 제목 표기가 달라도('가. 사업의 개요') 찾는다 (EP)", () => {
    expect(extractBusinessOverview(`<TITLE>가. 사업의 개요</TITLE><P>${BODY}</P>`)).toContain("온라인 장터");
  });

  it("RBO-06 본문 길이 경계: 30자 미만이면 개요가 아니라고 보고 30자면 쓴다 (BVA)", () => {
    const make = (n: number) => `<TITLE>1. 사업의 개요</TITLE><P>${"가".repeat(n)}</P>`;
    // 경계값은 상수가 아니라 숫자 그대로 둔다 (상수를 바꿔도 테스트가 같이 바뀌어 통과하는 일을 막는다)
    expect(extractBusinessOverview(make(29))).toBeNull();
    expect(extractBusinessOverview(make(30))).toHaveLength(30);
    expect(MIN_OVERVIEW_CHARS).toBe(30);
  });

  it("RBO-07 너무 긴 개요는 앞부분만 쓴다 (BVA)", () => {
    const xml = `<TITLE>1. 사업의 개요</TITLE><P>${"가".repeat(MAX_OVERVIEW_CHARS + 500)}</P>`;
    expect(extractBusinessOverview(xml)).toHaveLength(MAX_OVERVIEW_CHARS);
  });

  it("RBO-08 '사업의 개요'가 없는 문서는 null (EG)", () => {
    expect(extractBusinessOverview("<TITLE>I. 회사의 개요</TITLE><P>가나다라마바사아자차카타파하 가나다라마바사아자차카타파하</P>")).toBeNull();
    expect(extractBusinessOverview("")).toBeNull();
  });
});

describe("RBO-09~11 글자 정리와 인코딩", () => {
  it("RBO-09 태그를 지우고 엔티티를 풀며 공백을 정리한다", () => {
    expect(stripMarkup("<P>가 &amp; 나&nbsp;&lt;다&gt; &#54620;</P><P>라</P>")).toBe("가 & 나 <다> 한\n라");
  });

  it("RBO-10 EUC-KR로 선언된 문서는 EUC-KR로 푼다", () => {
    const head = new TextEncoder().encode('<?xml version="1.0" encoding="euc-kr"?><P>');
    const gana = Uint8Array.from([0xb0, 0xa1, 0xb3, 0xaa]); // "가나" (EUC-KR)
    const tail = new TextEncoder().encode("</P>");
    expect(decodeXml(Uint8Array.from([...head, ...gana, ...tail]))).toContain("<P>가나</P>");
  });

  it("RBO-11 선언이 없으면 UTF-8", () => {
    expect(decodeXml(new TextEncoder().encode("<P>한글</P>"))).toBe("<P>한글</P>");
  });
});

describe("RBO-12~15 ZIP 읽기", () => {
  it("RBO-12 deflate와 저장 방식 항목을 둘 다 푼다", () => {
    const zip = makeZip([
      { name: "a.xml", data: new TextEncoder().encode("압축된 내용"), method: 8 },
      { name: "b.xml", data: new TextEncoder().encode("저장된 내용"), method: 0 },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(["a.xml", "b.xml"]);
    expect(entries.map((e) => new TextDecoder().decode(e.data))).toEqual(["압축된 내용", "저장된 내용"]);
  });

  it("RBO-13 ZIP이 아닌 바이트는 예외 (EG)", () => {
    expect(() => readZip(new TextEncoder().encode("<result><status>020</status></result>"))).toThrow("ZIP");
  });

  it("RBO-14 목록이 깨진 ZIP은 예외 (EG)", () => {
    const zip = makeZip([{ name: "a.xml", data: new TextEncoder().encode("내용") }]);
    zip[zip.length - 22 + 16] = 0xff; // 중앙 디렉터리 위치를 망가뜨림
    expect(() => readZip(zip)).toThrow();
  });

  it("RBO-15 지원하지 않는 압축 방식은 예외 (EG)", () => {
    const zip = makeZip([{ name: "a.xml", data: new TextEncoder().encode("내용"), method: 0 }]);
    const dv = new DataView(zip.buffer);
    const cd = dv.getUint32(zip.length - 22 + 16, true);
    dv.setUint16(cd + 10, 12, true);
    expect(() => readZip(zip)).toThrow("압축 방식");
  });
});

describe("RBO-16~17 최신 사업보고서 고르기", () => {
  it("RBO-16 정정 공시도 사업보고서이고, 접수일이 가장 늦은 것을 쓴다. 분기, 반기, 감사보고서는 뺀다", () => {
    const ref = pickLatestBusinessReport([
      { report_nm: "사업보고서 (2024.12)", rcept_no: "20250320000001", rcept_dt: "20250320" },
      { report_nm: "[기재정정]사업보고서 (2024.12)", rcept_no: "20250410000002", rcept_dt: "20250410" },
      { report_nm: "분기보고서 (2025.03)", rcept_no: "20250515000003", rcept_dt: "20250515" },
      { report_nm: "감사보고서 (2024.12)", rcept_no: "20250601000004", rcept_dt: "20250601" },
    ]);
    expect(ref).toEqual({ rceptNo: "20250410000002", reportName: "[기재정정]사업보고서 (2024.12)", rceptDate: "20250410" });
  });

  it("RBO-17 사업보고서가 하나도 없으면 null (EG)", () => {
    expect(pickLatestBusinessReport([{ report_nm: "분기보고서 (2025.03)", rcept_no: "1", rcept_dt: "20250515" }])).toBeNull();
    expect(pickLatestBusinessReport([])).toBeNull();
  });
});

/** 가짜 fetch: 주소에 list.json이 있으면 공시검색 응답, document.xml이면 문서 응답 */
function fakeFetch(list: unknown, doc: Uint8Array | Error) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("list.json")) return new Response(JSON.stringify(list));
    if (doc instanceof Error) throw doc;
    return new Response(doc as BodyInit);
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const LIST_OK = { status: "000", list: [{ report_nm: "사업보고서 (2025.12)", rcept_no: "20260318001423", rcept_dt: "20260318" }] };
const GOOD_ZIP = makeZip([{ name: "20260318001423.xml", data: new TextEncoder().encode(REPORT_XML) }]);

describe("RBO-18~24 OpenDART 호출 (가짜 fetch)", () => {
  const run = (f: typeof fetch) => fetchBusinessOverview("00258801", { key: KEY, fetch: f, today: "20261122" });

  it("RBO-18 정상: 공시검색 1번, 문서 1번만 부르고 개요를 돌려준다", async () => {
    const f = fakeFetch(LIST_OK, GOOD_ZIP);
    const r = await run(f);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.text).toContain("온라인 장터");
    expect(r.ref.rceptNo).toBe("20260318001423");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("RBO-19 공시검색 결과가 없으면(013) 사업보고서 없음이고 문서는 부르지 않는다", async () => {
    const f = fakeFetch({ status: "013" }, GOOD_ZIP);
    expect(await run(f)).toEqual({ status: "no_report" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("RBO-20 목록은 있는데 사업보고서가 아닌 공시뿐이어도 사업보고서 없음", async () => {
    const f = fakeFetch({ status: "000", list: [{ report_nm: "분기보고서 (2025.03)", rcept_no: "1", rcept_dt: "20250515" }] }, GOOD_ZIP);
    expect(await run(f)).toEqual({ status: "no_report" });
  });

  it("RBO-21 공시검색 오류(요청 제한 020)는 사업보고서 없음이 아니라 실패 (EG)", async () => {
    const r = await run(fakeFetch({ status: "020" }, GOOD_ZIP));
    expect(r).toEqual({ status: "failed", reason: "DART 응답 코드 020" });
  });

  it("RBO-22 문서 응답이 오류 XML이면 실패 (EG)", async () => {
    const err = new TextEncoder().encode("<?xml version='1.0'?><result><status>014</status><message>파일이 존재하지 않습니다</message></result>");
    expect(await run(fakeFetch(LIST_OK, err))).toEqual({ status: "failed", reason: "DART 문서 응답 코드 014" });
  });

  it("RBO-23 문서에 사업의 개요가 없으면 실패 (EG)", async () => {
    const zip = makeZip([{ name: "a.xml", data: new TextEncoder().encode("<TITLE>I. 회사의 개요</TITLE><P>내용입니다 내용입니다 내용입니다 내용입니다</P>") }]);
    expect(await run(fakeFetch(LIST_OK, zip))).toEqual({ status: "failed", reason: "원문에서 사업의 개요를 찾지 못함" });
  });

  it("RBO-24 네트워크 오류와 깨진 ZIP은 예외 없이 실패로 돌려준다 (EG)", async () => {
    expect((await run(fakeFetch(LIST_OK, new Error("fetch failed")))).status).toBe("failed");
    expect((await run(fakeFetch(LIST_OK, new TextEncoder().encode("깨진 바이트")))).status).toBe("failed");
  });

  it("RBO-25 어떤 실패에서도 인증키가 결과 문구에 나오지 않는다 (규칙)", async () => {
    const results = [
      await run(fakeFetch({ status: "020" }, GOOD_ZIP)),
      await run(fakeFetch(LIST_OK, new Error(`request to https://opendart.fss.or.kr/api/document.xml?crtfc_key=${KEY} failed`))),
      await run(fakeFetch(LIST_OK, new TextEncoder().encode("깨진 바이트"))),
    ];
    for (const r of results) expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("RBO-26 요청 주소에는 키가 들어가지만(호출에 필요) 공시검색은 사업보고서(A001)만 요청한다", async () => {
    const f = fakeFetch(LIST_OK, GOOD_ZIP);
    await run(f);
    const first = String(f.mock.calls[0][0]);
    expect(first).toContain("pblntf_detail_ty=A001");
    expect(first).toContain("corp_code=00258801");
    expect(first).toContain("bgn_de=20240101"); // 오늘(2026-11-22) 기준 2년 전 해의 1월 1일
  });
});

describe("RBO-27~30 사전 계산 결과 만들기와 건너뛰기", () => {
  const ref = { rceptNo: "20260318001423", reportName: "사업보고서 (2025.12)", rceptDate: "20260318" };

  it("RBO-27 받은 개요는 3줄 요약과 공시 원문 링크로 저장한다 (원문 전체는 저장하지 않는다)", () => {
    const text = BODY + " 셋째 문장입니다.";
    const s = toStoredSummary({ status: "ok", text, ref }, { lines: summarizeOverview(text), method: "rule" }, "2026-11-22");
    expect(s).toMatchObject({ status: "ok", method: "rule" });
    if (s?.status !== "ok") return;
    expect(s.lines).toHaveLength(3);
    expect(s.source.url).toBe("https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260318001423");
    expect(s.source.checkedAt).toBe("2026-11-22");
    expect(JSON.stringify(s)).not.toContain("충분히"); // 저장 항목에는 개요 원문이 없다
  });

  it("RBO-28 사업보고서 없음은 '공시 없음'으로 확인 날짜와 함께 저장한다", () => {
    expect(toStoredSummary({ status: "no_report" }, null, "2026-11-22")).toEqual({ status: "no_report", checkedAt: "2026-11-22" });
  });

  it("RBO-29 실패와 쓸 문장이 없는 경우는 저장하지 않아서(null) 다음 실행에서 다시 시도한다", () => {
    expect(toStoredSummary({ status: "failed", reason: "x" }, null, "2026-11-22")).toBeNull();
    expect(toStoredSummary({ status: "ok", text: "숫자 1개만 있습니다.", ref }, { lines: [], method: "rule" }, "2026-11-22")).toBeNull();
    expect(toStoredSummary({ status: "ok", text: "가", ref }, null, "2026-11-22")).toBeNull();
  });

  it("RBO-27b 모델로 만든 요약은 method가 llm으로 저장된다", () => {
    const s = toStoredSummary({ status: "ok", text: BODY, ref }, { lines: ["가입니다.", "나입니다.", "다입니다."], method: "llm" }, "2026-11-22");
    expect(s).toMatchObject({ status: "ok", method: "llm" });
  });

  it("RBO-30 이미 저장된 기업(요약 있음, 공시 없음)은 건너뛰고, 저장되지 않은 기업만 받는다. force면 모두 다시 받는다 (캐시)", () => {
    const stored: SummaryStore = {
      A: { status: "ok", lines: ["가."], source: { name: "n", url: "", checkedAt: "2026-11-22" }, method: "rule" },
      B: { status: "no_report", checkedAt: "2026-11-22" },
    };
    expect(planTargets(["A", "B", "C", "C"], stored)).toEqual({ todo: ["C"], skipped: ["A", "B"] });
    expect(planTargets(["A", "B", "C"], stored, true)).toEqual({ todo: ["A", "B", "C"], skipped: [] });
    expect(planTargets(["A"], {})).toEqual({ todo: ["A"], skipped: [] });
  });
});
