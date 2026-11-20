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

describe("POST /api/chat (실데이터 모드)", () => {
  test("API-13 아직 연결 전이라 안내 문구와 info 로그만 돌려준다", async () => {
    vi.stubEnv("USE_MOCK", "false");
    vi.resetModules();
    const { json } = await post({ message: "별하늘랩스" });
    expect(json.reply).toContain("연결되지 않았습니다");
    expect(json.log[0]).toMatchObject({ type: "info", mode: "live" });
  });
});
