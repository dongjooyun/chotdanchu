// 기업 카드에 "하는 일 세 줄 요약"이 실려 나가는지 (CDC-26). 케이스 ID: SUM-*
// 채팅 API 응답(위젯과 판단 로그)과 카드 화면 문구를 본다. 요약 규칙 자체는 business-summary.test.ts (BS-*)
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CompanyCard } from "@/components/company-card";
import { computeIndicators } from "@/lib/indicators";
import type { ChatResponse } from "@/lib/chat";
import type { BusinessSummary } from "@/lib/types";
import { mockCompanies, realBusinessSummaries } from "@/lib/data";

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

/** data/real/business-summaries.json 대신 쓸 값을 넣고 실데이터 모드로 응답을 받는다 (실제 결과 파일이 바뀌어도 테스트가 흔들리지 않게) */
async function liveWith(store: unknown, pickCompanyId: string) {
  vi.stubEnv("USE_MOCK", "false");
  vi.stubEnv("USE_AGENT", "false");
  vi.resetModules();
  vi.doMock("@/data/real/business-summaries.json", () => ({ default: store }));
  return post({ pickCompanyId });
}

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
    const json = await liveWith({}, "00258801"); // 상장 카카오, 사전 계산 파일이 비어 있는 경우
    const w = companyWidget(json);
    expect(w.summary).toEqual({ status: "unavailable", reason: "not_computed" });
    const line = json.log.find((l) => l.title === "하는 일 요약: 확인 불가");
    expect(line?.type).toBe("unavailable");
  });

  test("SUM-08 실데이터 모드는 목업 기업용 요약 문단을 쓰지 않는다 (실데이터 카드에는 businessOverview가 없다)", async () => {
    const w = companyWidget(await liveWith({}, "00258801"));
    expect(w.company.businessOverview).toBeUndefined();
  });
});

describe("SUM-13~15 실데이터 모드: 사전 계산 파일의 값이 카드에 반영된다", () => {
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

describe("SUM-16~19 실제 사전 계산 결과 파일 (data/real/business-summaries.json)", () => {
  const demo = ["00258801", "01137727", "01153956", "01547845"]; // 카카오, 무신사, 컬리, 당근마켓
  const text = JSON.stringify(realBusinessSummaries);

  test("SUM-16 시연 기업 4곳이 모두 들어 있다", () => {
    for (const code of demo) expect(realBusinessSummaries[code], code).toBeDefined();
  });

  test("SUM-17 요약 있음 항목은 3줄이고 숫자가 없으며, 원문 링크는 DART 공시 주소이고, 방식과 확인일 형식이 맞다", () => {
    for (const code of demo) {
      const e = realBusinessSummaries[code];
      if (e.status !== "ok") continue;
      expect(e.lines, code).toHaveLength(3);
      for (const l of e.lines) expect(l, code).not.toMatch(/[0-9０-９]|퍼센트/);
      expect(e.source.url, code).toMatch(/^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}$/);
      expect(["rule", "llm"], code).toContain(e.method);
      expect(e.source.checkedAt, code).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("SUM-18 사업의 개요는 공시 공개 문서의 앞부분(4000자 이하)만 저장한다 (항목에는 상태, 요약, 출처, 방식, 원문 문단뿐이고 요약 줄은 한 문장 길이)", () => {
    for (const code of Object.keys(realBusinessSummaries)) {
      const e = realBusinessSummaries[code];
      expect(Object.keys(e).sort(), code).toEqual(e.status === "ok" ? ["lines", "method", "overview", "source", "status"] : ["checkedAt", "status"]);
      if (e.status === "ok") expect((e.overview ?? "").length, code).toBeLessThanOrEqual(4000);
      if (e.status === "ok") for (const l of e.lines) expect(l.length, code).toBeLessThanOrEqual(200);
    }
  });

  test("SUM-19 파일에 인증키 모양의 문자열이 없다 (40자리 16진수, sk-ant-, crtfc_key)", () => {
    expect(text).not.toMatch(/[0-9a-fA-F]{40}/);
    expect(text).not.toMatch(/sk-ant-/);
    expect(text).not.toMatch(/crtfc_key/);
  });
});

/** 요약 구역만 잘라 본다. 11/22 디자인에서 요약은 회사 정보 바로 아래 section이라, 아래 등급 분포의 "확인 불가" 배지와 섞이지 않게 한다 */
function summaryBlock(html: string): string {
  const i = html.indexOf("하는 일 세 줄 요약");
  return html.slice(i, html.indexOf("</section>", i));
}

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
    const block = summaryBlock(html);
    expect(block).toContain("공시 없음");
    expect(block).not.toContain("<ol");
    expect(block).not.toContain("확인 불가");
  });

  test("SUM-12 확인 불가는 '공시 없음'과 다르게 보이고 이유가 붙는다", () => {
    const html = render({ status: "unavailable", reason: "not_computed" });
    const block = summaryBlock(html);
    expect(block).toContain("확인 불가");
    expect(block).toContain("아직 요약을 만들지 못했어요");
    expect(block).not.toContain("공시 없음");
  });
});

describe("SUM-20~23 새 디자인(동주님 카드)과 요약 블록이 함께 있다", () => {
  const company = mockCompanies.find((c) => c.id === "mock-026")!;
  const graded = computeIndicators(company, new Date(2026, 10, 20));
  const summary: BusinessSummary = {
    status: "ok",
    lines: ["가입니다.", "나입니다.", "다입니다."],
    source: { name: "OpenDART 사업보고서", url: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260318001423", checkedAt: "2026-11-22" },
    method: "llm",
  };
  const render = (props: Record<string, never>) =>
    renderToStaticMarkup(createElement(CompanyCard, { company, graded, summary, ...props }));

  test("SUM-20 요약 블록은 기업 카드 안, 회사 정보 바로 아래에 있다 (11/22 동주 카드 구성: 저장 버튼은 카드에 없음)", () => {
    const html = render({});
    const at = {
      head: html.indexOf("판정 근거"),
      biz: html.indexOf('data-el="하는 일 세 줄 요약"'),
      dist: html.indexOf('data-el="등급 분포"'),
    };
    expect(at.head).toBeGreaterThan(-1);
    expect(at.biz).toBeGreaterThan(at.head);
    expect(at.dist).toBeGreaterThan(at.biz);
    expect((html.match(/data-el="기업 카드"/g) ?? []).length).toBe(1); // 카드는 하나
  });

  test("SUM-21 기업 카드에는 저장 버튼이 없다 (저장은 최종 판단 리포트 아래 \"기업 카드 모음에 담기\"만, 11/22 결정)", () => {
    const html = render({});
    expect(html).not.toContain("기업 카드 저장하기");
    expect(html).toContain("가입니다.");
    expect((html.match(/btn-primary/g) ?? []).length).toBe(0);
  });

  test("SUM-22 요약 블록은 새 디자인 클래스(cc-biz)를 쓰고, 옛 와이어프레임 클래스와 대괄호 이름표를 쓰지 않는다", () => {
    const html = render({});
    const block = html.slice(html.indexOf('data-el="하는 일 세 줄 요약"') - 40);
    expect(block).toContain("cc-biz");
    expect(block).not.toMatch(/bg-box|border-line|text-\[10px\]|rounded border/);
    expect(html).not.toContain("[하는 일 세 줄 요약]");
  });

  test("SUM-23 요약 블록 스타일(globals.css의 .cc-biz)은 디자인 규칙을 지킨다: 토큰만 쓰고, 그림자와 그라데이션 없음, 1px 회색 선, 모서리 4px(--r-2)", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "../../app/globals.css"), "utf8");
    const rules = css.split("\n").filter((l) => l.startsWith(".cc-biz"));
    expect(rules.length).toBeGreaterThanOrEqual(5);
    const all = rules.join("\n");
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/); // 직접 쓴 색 없음 (:root 토큰만)
    expect(all).not.toMatch(/box-shadow|gradient/);
    const box = rules.find((l) => l.startsWith(".cc-biz {"))!;
    expect(box).toContain("border: 1px solid var(--line)");
    expect(box).toContain("border-radius: var(--r-2)");
    expect(box).toContain("background: var(--surface)");
  });
});
