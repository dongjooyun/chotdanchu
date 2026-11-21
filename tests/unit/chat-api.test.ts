// 채팅 API 통합 테스트: 요청 하나를 넣고 응답(위젯, 로그, 상태 코드)을 본다. 케이스 ID는 API-{번호}.
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ChatResponse } from "@/lib/chat";

async function post(body: unknown, raw = false) {
  const { POST } = await import("@/app/api/chat/route");
  const res = await POST(
    new Request("http://localhost/api/chat", { method: "POST", body: raw ? (body as string) : JSON.stringify(body) }),
  );
  return { status: res.status, json: (await res.json()) as ChatResponse & { error?: string } };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("POST /api/chat (목업 모드)", () => {
  test("API-01 후보가 하나인 이름이면 바로 기업 카드와 등급 10개", async () => {
    const { status, json } = await post({ message: "별하늘랩스" });
    expect(status).toBe(200);
    expect(json.widget?.type).toBe("company");
    if (json.widget?.type !== "company") return;
    expect(json.widget.graded).toHaveLength(10);
    expect(json.log.some((l) => l.type === "tool_call" && l.title.startsWith("compute_indicators"))).toBe(true);
  });

  test("API-02 확인 불가 지표가 판단 로그에 한 줄씩 따로 찍힌다 (별하늘랩스는 4개)", async () => {
    const { json } = await post({ message: "별하늘랩스" });
    const unavailable = json.log.filter((l) => l.type === "unavailable");
    expect(unavailable).toHaveLength(4);
    for (const l of unavailable) expect(l.reason).toBeTruthy();
  });

  test("API-03 이름이 같은 회사가 둘이면 후보 칩과 판단 로그(decision)", async () => {
    const { json } = await post({ message: "몽돌커머스" });
    expect(json.widget?.type).toBe("candidates");
    expect(json.log.some((l) => l.type === "decision")).toBe(true);
  });

  test("API-04 후보 중 하나를 고르면 그 회사 카드", async () => {
    const { json: cands } = await post({ message: "몽돌커머스" });
    if (cands.widget?.type !== "candidates") throw new Error("후보가 없음");
    const pick = cands.widget.candidates[0];
    const { status, json } = await post({ pickCompanyId: pick.id });
    expect(status).toBe(200);
    expect(json.widget?.type === "company" && json.widget.company.id).toBe(pick.id);
  });

  test("API-05 법인 표기와 띄어쓰기가 달라도 같은 회사로 찾는다", async () => {
    const { json } = await post({ message: "(주) 별하늘 랩스" });
    expect(json.widget?.type).toBe("company");
  });

  test("API-06 없는 회사는 위젯 없이 안내 문구", async () => {
    const { status, json } = await post({ message: "없는회사" });
    expect(status).toBe(200);
    expect(json.widget).toBeUndefined();
    expect(json.reply).toContain("없습니다");
  });

  test.each([
    ["API-07", { message: "" }, 400, "빈 메시지"],
    ["API-08", { message: "   " }, 400, "공백뿐인 메시지"],
    ["API-09", { pickCompanyId: "없는-id" }, 404, "없는 기업 id"],
    ["API-10", {}, 400, "아무것도 없는 요청"],
  ])("%s %j -> %i (%s)", async (id, body, status, label) => {
    expect((await post(body)).status, `${id} ${label}`).toBe(status);
  });

  test("API-11 JSON이 아닌 본문은 400", async () => {
    expect((await post("not json", true)).status).toBe(400);
  });

  test("API-12 아주 긴 입력이 와도 깨지지 않는다 (100자까지만 사용)", async () => {
    const { status } = await post({ message: "가".repeat(500) });
    expect(status).toBe(200);
  });
});

describe("POST /api/chat (실데이터 모드, 사전 계산한 시연 기업)", () => {
  function live() {
    vi.stubEnv("USE_MOCK", "false");
    vi.stubEnv("USE_AGENT", "false");
    vi.resetModules();
  }

  test("API-13 목업 기업은 실데이터 모드에서 찾지 않고, 준비된 시연 기업 이름을 알려 준다", async () => {
    live();
    const { json } = await post({ message: "별하늘랩스" });
    expect(json.widget).toBeUndefined();
    expect(json.reply).toContain("아직 준비되지 않은 회사");
    expect(json.reply).toContain("카카오");
    expect(json.log.every((l) => l.mode === "live")).toBe(true);
  });

  test("API-14 카카오는 동명 법인 2곳이 후보로 나오고, 공시 대표자와 상장·폐업 꼬리표로 구별된다", async () => {
    live();
    const { json } = await post({ message: "카카오" });
    expect(json.widget?.type).toBe("candidates");
    if (json.widget?.type !== "candidates") return;
    expect(json.widget.candidates).toHaveLength(2);
    expect(json.widget.candidates.every((c) => c.ceoName !== "")).toBe(true);
    expect(json.widget.candidates.map((c) => c.tags).sort()).toEqual([["상장"], ["폐업"]]);
  });

  test("API-17 실데이터 대표자 이름은 LLM에 가는 도구 결과에 들어가지 않는다 (절대 규칙 1)", async () => {
    live();
    const { runTool } = await import("@/lib/agent/tools");
    const { realCompanies } = await import("@/lib/data");
    const out = runTool("search_company", { query: "카카오", reason: "테스트" });
    if (out.kind !== "result") throw new Error("결과가 없음");
    for (const c of realCompanies) expect(out.content).not.toContain(c.ceoName);
    expect(out.content).toContain("폐업");
  });

  test("API-18 법인명과 다른 부르는 이름(당근 -> 주식회사 당근마켓)으로도 찾는다", async () => {
    live();
    const { json } = await post({ message: "당근" });
    expect(json.widget?.type === "company" && json.widget.company.name).toBe("(주)당근마켓");
  });

  test("API-19 폐업한 동명 법인의 리포트에는 면접 질문 대신 안내만 나온다", async () => {
    live();
    const { getCompany } = await import("@/lib/data");
    const { computeIndicators } = await import("@/lib/indicators");
    const { buildReportDraft } = await import("@/lib/report-draft");
    const closed = getCompany("00918444", "live")!;
    const d = buildReportDraft({ company: closed, graded: computeIndicators(closed), role: "운영", preference: null, log: [], checkedAt: "2026-11-21" });
    expect(d.interviewQuestions).toEqual([]);
    expect(d.notice).toContain("폐업");
  });

  test("API-15 상장 카카오를 고르면 실데이터 카드 (등급 10개, 출처는 OpenDART와 국민연금)", async () => {
    live();
    const { json } = await post({ pickCompanyId: "00258801" });
    expect(json.widget?.type).toBe("company");
    if (json.widget?.type !== "company") return;
    expect(json.widget.company.isMock).toBe(false);
    expect(json.widget.graded).toHaveLength(10);
    const sources = json.widget.graded.map((g) => g.source?.name ?? "").join(" ");
    expect(sources).toContain("OpenDART");
    expect(sources).toContain("국민연금");
    expect(json.log.some((l) => l.title.includes("공공데이터"))).toBe(true);
  });

  test("API-16 폐업한 동명 법인은 리스크가 해당(폐업)이고 나머지는 이유와 함께 확인 불가", async () => {
    live();
    const { json } = await post({ pickCompanyId: "00918444" });
    if (json.widget?.type !== "company") throw new Error("카드가 없음");
    const risk = json.widget.graded.find((g) => g.id === "risk");
    expect(risk).toMatchObject({ grade: "C", display: "해당 (폐업)" });
    expect(json.log.filter((l) => l.type === "unavailable").length).toBeGreaterThan(0);
  });
});
