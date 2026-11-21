// 기업 카드에 "하는 일 세 줄 요약"이 실려 나가는지 (CDC-26). 케이스 ID: SUM-*
// 채팅 API 응답(위젯과 판단 로그)과 카드 화면 문구를 본다. 요약 규칙 자체는 business-summary.test.ts (BS-*)
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CompanyCard } from "@/components/company-card";
import { computeIndicators } from "@/lib/indicators";
import type { ChatResponse } from "@/lib/chat";
import type { BusinessSummary } from "@/lib/types";
import { mockCompanies } from "@/lib/data";

async function post(body: unknown) {
  const { POST } = await import("@/app/api/chat/route");
  const res = await POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }));
  return (await res.json()) as ChatResponse;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@/data/real/business-summaries.json");
  vi.resetModules();
});

function companyWidget(json: ChatResponse) {
  if (json.widget?.type !== "company") throw new Error("카드가 없음");
  return json.widget;
}

describe("SUM-01~05 채팅 응답 (목업 모드)", () => {
  test("SUM-01 사업의 개요가 있는 상장사는 카드에 3줄 요약이 실리고 로그에 get_business_summary가 남는다", async () => {
    const w = companyWidget(await post({ message: "한결전자" }));
    expect(w.summary.status).toBe("ok");
    if (w.summary.status !== "ok") return;
    expect(w.summary.lines).toHaveLength(3);
    expect(w.summary.source.url).toBe(""); // 목업은 가상 링크
  });

  test("SUM-02 요약 줄에는 숫자가 하나도 없다 (개요 문단에는 숫자 문장이 있어도)", async () => {
    const json = await post({ message: "한결전자" });
    const w = companyWidget(json);
    expect(w.company.businessOverview?.text).toMatch(/\d/); // 원문에는 숫자가 있다
    if (w.summary.status !== "ok") throw new Error("요약이 있어야 함");
    for (const line of w.summary.lines) expect(line).not.toMatch(/\d/);
  });

  test("SUM-03 사업보고서가 없는 기업은 공시 없음이고, 요약 줄은 없다", async () => {
    const w = companyWidget(await post({ message: "별하늘랩스" }));
    expect(w.summary).toEqual({ status: "no_report" });
  });

  test("SUM-04 공시 없음은 확인 불가 로그가 아니라 안내(info) 줄로 남아서 지표의 확인 불가 개수(4)가 그대로다", async () => {
    const json = await post({ message: "별하늘랩스" });
    expect(json.log.filter((l) => l.type === "unavailable")).toHaveLength(4);
    const info = json.log.find((l) => l.type === "info");
    expect(info?.title).toBe("하는 일 요약: 공시 없음");
    expect(info?.reason).toBeTruthy();
  });

  test("SUM-05 요약 로그는 compute_indicators 다음에 있고 step이 1부터 이어진다", async () => {
    const json = await post({ message: "한결전자" });
    const titles = json.log.map((l) => l.title);
    const at = titles.findIndex((t) => t.startsWith("get_business_summary"));
    expect(at).toBeGreaterThan(titles.findIndex((t) => t.startsWith("compute_indicators")));
    expect(json.log.map((l) => l.step)).toEqual(json.log.map((_, i) => i + 1));
  });
});

describe("SUM-06~08 채팅 응답 경로와 실데이터 모드", () => {
  test("SUM-06 후보 칩에서 골라도 요약이 같이 간다", async () => {
    const twin = mockCompanies.find((c) => c.id === "mock-030")!; // 상장 청솔기계 (비상장 동명 법인 mock-018이 있다)
    const w = companyWidget(await post({ pickCompanyId: twin.id }));
    expect(w.summary.status).toBe("ok");
    const other = companyWidget(await post({ pickCompanyId: "mock-018" }));
    expect(other.summary).toEqual({ status: "no_report" });
  });

  test("SUM-07 실데이터 모드에서 아직 계산하지 않은 기업은 공시 없음이 아니라 확인 불가이고, 로그에 확인 불가 줄이 남는다", async () => {
    vi.stubEnv("USE_MOCK", "false");
    vi.stubEnv("USE_AGENT", "false");
    vi.resetModules();
    const json = await post({ pickCompanyId: "00258801" }); // 상장 카카오
    const w = companyWidget(json);
    expect(w.summary).toEqual({ status: "unavailable", reason: "not_computed" });
    const line = json.log.find((l) => l.title === "하는 일 요약: 확인 불가");
    expect(line?.type).toBe("unavailable");
  });

  test("SUM-08 실데이터 모드는 목업 기업용 요약 문단을 쓰지 않는다 (실데이터 카드에는 businessOverview가 없다)", async () => {
    vi.stubEnv("USE_MOCK", "false");
    vi.stubEnv("USE_AGENT", "false");
    vi.resetModules();
    const w = companyWidget(await post({ pickCompanyId: "00258801" }));
    expect(w.company.businessOverview).toBeUndefined();
  });
});

describe("SUM-13~15 실데이터 모드: 사전 계산 파일의 값이 카드에 반영된다", () => {
  /** data/real/business-summaries.json 대신 쓸 값을 넣고 실데이터 모드로 응답을 받는다 */
  async function liveWith(store: unknown, pickCompanyId: string) {
    vi.stubEnv("USE_MOCK", "false");
    vi.stubEnv("USE_AGENT", "false");
    vi.resetModules();
    vi.doMock("@/data/real/business-summaries.json", () => ({ default: store }));
    return post({ pickCompanyId });
  }
  const src = { name: "OpenDART 사업보고서 (2025.12)", url: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260318001423", checkedAt: "2026-11-22" };

  test("SUM-13 저장된 요약은 그대로 카드에 실리고, 로그에 요약 줄이 남는다", async () => {
    const json = await liveWith({ "00258801": { status: "ok", lines: ["가입니다.", "나입니다.", "다입니다."], source: src, method: "rule" } }, "00258801");
    const w = companyWidget(json);
    expect(w.summary).toEqual({ status: "ok", lines: ["가입니다.", "나입니다.", "다입니다."], source: src, method: "rule" });
    expect(json.log.some((l) => l.title.startsWith("get_business_summary"))).toBe(true);
  });

  test("SUM-14 저장된 '공시 없음'은 카드에 공시 없음으로 나오고 확인 불가가 아니다", async () => {
    const json = await liveWith({ "01137727": { status: "no_report", checkedAt: "2026-11-22" } }, "01137727");
    expect(companyWidget(json).summary).toEqual({ status: "no_report" });
    expect(json.log.find((l) => l.title === "하는 일 요약: 공시 없음")?.type).toBe("info");
  });

  test("SUM-15 같은 파일에서 저장되지 않은 기업은 확인 불가다 (저장된 기업과 구분)", async () => {
    const json = await liveWith({ "00258801": { status: "no_report", checkedAt: "2026-11-22" } }, "01153956");
    expect(companyWidget(json).summary).toEqual({ status: "unavailable", reason: "not_computed" });
  });
});

describe("SUM-09~12 카드 화면 문구 (서버 렌더링으로 확인)", () => {
  const company = mockCompanies.find((c) => c.id === "mock-026")!;
  const graded = computeIndicators(company, new Date(2026, 10, 20));
  const render = (summary: BusinessSummary) =>
    renderToStaticMarkup(createElement(CompanyCard, { company, graded, summary }));
  const src = { name: "OpenDART 사업보고서", url: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260318001423", checkedAt: "2026-11-22" };

  test("SUM-09 요약 있음: 3줄과 원문 링크가 보인다", () => {
    const html = render({ status: "ok", lines: ["가입니다.", "나입니다.", "다입니다."], source: src, method: "rule" });
    expect(html).toContain("하는 일 세 줄 요약");
    expect((html.match(/<li>/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("가입니다.");
    expect(html).toContain(`href="${src.url}"`);
    expect(html).not.toContain("공시 없음");
  });

  test("SUM-10 목업 요약은 링크 대신 가상 링크 자리가 보인다", () => {
    const html = render({ status: "ok", lines: ["가입니다."], source: { ...src, url: "" }, method: "rule" });
    expect(html).toContain("원문 링크 자리 (가상 링크, 목업)");
    expect(html).not.toContain("<a href=\"\"");
  });

  test("SUM-11 공시 없음은 요약 줄 없이 '공시 없음'만 보인다", () => {
    const html = render({ status: "no_report" });
    const block = html.slice(html.indexOf("하는 일 세 줄 요약"));
    expect(block).toContain("공시 없음");
    expect(block).not.toContain("<ol");
    expect(block).not.toContain("확인 불가");
  });

  test("SUM-12 확인 불가는 '공시 없음'과 다르게 보이고 이유가 붙는다", () => {
    const html = render({ status: "unavailable", reason: "not_computed" });
    const block = html.slice(html.indexOf("하는 일 세 줄 요약"));
    expect(block).toContain("확인 불가");
    expect(block).toContain("아직 요약을 만들지 못했어요");
    expect(block).not.toContain("공시 없음");
  });
});
