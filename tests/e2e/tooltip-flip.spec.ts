// (i) 설명 말풍선과 카드 뒤집기 (11/22 실사용 버그: 카드를 뒤집으면 말풍선 글자가 거꾸로 보임). 케이스 ID: E2E-22.
// 사파리 계열(WebKit)에서 터지는 버그라 playwright.config.ts의 webkit 프로젝트에서도 같은 테스트를 돈다.
import { expect, test, type Page } from "@playwright/test";

async function chooseRole(page: Page, role: string) {
  await expect(async () => {
    await page.getByRole("button", { name: role, exact: true }).first().click({ timeout: 1500 });
    await expect(page.getByText("어느 회사가 궁금하세요?").first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000, intervals: [300, 600, 1000] });
}

/** 가상 기업으로 리포트 카드까지 간다 (목업 모드, 별하늘랩스) */
async function openReport(page: Page) {
  await page.addInitScript(() => localStorage.setItem("chotdanchu:tutorial-seen", "true"));
  await page.goto("/");
  await chooseRole(page, "서비스기획");
  await page.getByLabel("메시지 입력").fill("별하늘랩스");
  await page.getByRole("button", { name: "보내기" }).click();
  await page.getByRole("button", { name: "건너뛰기(일반 기준 적용)" }).click({ timeout: 20_000 });
  await expect(page.locator('[data-el="리포트 카드"]')).toBeVisible({ timeout: 20_000 });
}

/** 글자가 거울처럼 뒤집혔는지: 말풍선과 그 조상 중 어디에도 회전, 반전 변환이 없어야 한다 */
async function isUpright(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const t = getComputedStyle(n).transform;
      if (t && t !== "none") {
        const m = t.match(/matrix(?:3d)?\(([^)]+)\)/);
        if (m) {
          const v = m[1].split(",").map(Number);
          const a = v.length === 6 ? v[0] : v[0];
          if (a < 0.99) return false;
        }
      }
    }
    return true;
  });
}

test("E2E-22 카드를 뒤집은 뒤에도 (i) 설명 말풍선 글자가 똑바로 보이고 화면 안에 있다", async ({ page }) => {
  await openReport(page);
  const card = page.locator('[data-el="리포트 카드"]');
  // 앞면 (i)
  await card.locator('[data-el="설명 아이콘"]').first().click();
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeVisible();
  expect(await isUpright(page, '[role="tooltip"]')).toBe(true);
  // 바깥을 누르면 닫힌다
  await page.mouse.click(5, 5);
  await expect(tip).toHaveCount(0);
  // 뒤집고 (애니메이션이 끝난 뒤) 뒷면 (i)
  await page.getByRole("button", { name: "근거 보기" }).click();
  await expect(page.getByRole("button", { name: "요약 보기" })).toBeVisible();
  await page.waitForTimeout(1000);
  const icon = card.locator('[data-el="설명 아이콘"]:visible').first();
  await icon.scrollIntoViewIfNeeded();
  await icon.click();
  await expect(tip).toBeVisible();
  expect(await isUpright(page, '[role="tooltip"]')).toBe(true);
  // 카드의 보이는 면도 3D 변환이 풀려 있어야 한다 (멈춘 뒤에는 평평하게)
  expect(await isUpright(page, '[data-el="리포트 카드"] .rc-back')).toBe(true);
  // 말풍선이 화면 가로 안에 있다
  const box = await tip.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
  // (i)를 눌러도 카드는 뒤집히지 않는다
  await expect(page.getByRole("button", { name: "요약 보기" })).toBeVisible();
});
