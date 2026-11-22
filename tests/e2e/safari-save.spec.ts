// 카드 이미지 저장 (11/22 실사용 버그: 아이폰에서 저장이 안 됨). 케이스 ID: E2E-23.
// 아이폰 사파리 흉내(WebKit, 터치 화면)와 PC 크롬 둘 다 돈다. PC는 파일 내려받기, 터치 화면은 "길게 눌러 저장" 창이다.
import { expect, test, type Page } from "@playwright/test";

async function openReport(page: Page) {
  await page.addInitScript(() => localStorage.setItem("chotdanchu:tutorial-seen", "true"));
  await page.goto("/");
  await expect(async () => {
    await page.getByRole("button", { name: "서비스기획", exact: true }).first().click({ timeout: 1500 });
    await expect(page.getByText("어느 회사가 궁금하세요?").first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000, intervals: [300, 600, 1000] });
  await page.getByLabel("메시지 입력").fill("별하늘랩스");
  await page.getByRole("button", { name: "보내기" }).click();
  await page.getByRole("button", { name: "건너뛰기(일반 기준 적용)" }).click({ timeout: 20_000 });
  await expect(page.locator('[data-el="리포트 카드"]')).toBeVisible({ timeout: 20_000 });
}

/** 사진 안에 흰색이 아닌 점이 충분히 있는지 (빈 흰 사진이면 실패) */
async function nonBlankRatio(page: Page, imgSelector: string) {
  return page.locator(imgSelector).evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = Math.min(img.naturalWidth, 400);
    c.height = Math.round((c.width / img.naturalWidth) * img.naturalHeight);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let non = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) non++;
    return non / (d.length / 4);
  });
}

test("E2E-23 카드 이미지는 미리 만들어지고, PC는 파일로, 터치 화면은 길게 눌러 저장 창으로 저장된다", async ({ page, hasTouch }) => {
  await openReport(page);
  const save = page.locator('[data-el="카드 저장"]');
  // 누르기 전에 이미 사진이 준비돼 있다 (사파리는 누른 직후에만 공유, 저장 창을 열어 준다)
  await expect(save).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(save).toContainText("요약 카드 저장하기");
  if (hasTouch) {
    await save.click();
    const box = page.locator('[data-el="이미지 저장 창"]');
    await expect(box).toBeVisible();
    await expect(box).toContainText("길게 눌러");
    expect(await nonBlankRatio(page, '[data-el="이미지 저장 창"] img')).toBeGreaterThan(0.05);
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(box).toHaveCount(0);
  } else {
    const [download] = await Promise.all([page.waitForEvent("download"), save.click()]);
    expect(download.suggestedFilename()).toMatch(/^첫단추-.*-요약카드\.png$/);
  }
  // 뒷면도 같은 방식으로 준비된다
  await page.getByRole("button", { name: "근거 보기" }).click();
  await expect(save).toContainText("근거 카드 저장하기");
  await expect(save).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
});

test.describe("카카오톡 안에서 연 화면", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 KAKAOTALK/10.4.0" });

  test("E2E-24 앱 안 브라우저면 다른 브라우저로 열라는 안내와 열기 버튼이 보인다", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("chotdanchu:tutorial-seen", "true"));
    await page.goto("/");
    const note = page.locator('[data-el="앱 안 브라우저 안내"]');
    await expect(note).toBeVisible({ timeout: 15_000 });
    await expect(note).toContainText("다른 브라우저로 열어 주세요");
    await expect(note.getByRole("link", { name: "다른 브라우저로 열기" })).toHaveAttribute("href", /^kakaotalk:\/\/web\/openExternal\?url=/);
    await note.getByRole("button", { name: "그냥 볼게요" }).click();
    await expect(note).toHaveCount(0);
  });
});

test("E2E-24b 일반 브라우저에서는 앱 안 브라우저 안내가 없다", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("chotdanchu:tutorial-seen", "true"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "서비스기획", exact: true })).toBeVisible();
  await expect(page.locator('[data-el="앱 안 브라우저 안내"]')).toHaveCount(0);
});