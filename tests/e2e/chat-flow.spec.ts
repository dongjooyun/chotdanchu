// 화면 흐름(E2E) 테스트. 실제 브라우저로 처음부터 끝까지 눌러 본다. 케이스 ID는 E2E-{번호}.
// 상태 전이: 첫 방문 -> 직무 선택 -> 회사 입력 -> (동명이면 후보 선택) -> 기업 카드(저장) -> 맞대결 권유 -> (맞대결 7판) -> 최종 판단 리포트 -> 다음 행동
// 같은 테스트를 데스크톱(1280px)과 모바일(375px) 두 화면에서 돈다 (playwright.config.ts의 projects).
import { expect, test, type Page } from "@playwright/test";

/** 개발 서버는 처음 연결 직후 버튼이 아직 안 살아 있을 수 있어, 눌렀는데 반응이 없으면 다시 누른다 */
async function clickUntil(action: () => Promise<void>, done: () => Promise<void>) {
  await expect(async () => {
    await action();
    await done();
  }).toPass({ timeout: 15_000, intervals: [300, 600, 1000] });
}

async function chooseRole(page: Page, role: string) {
  await clickUntil(
    () => page.getByRole("button", { name: role, exact: true }).first().click({ timeout: 1500 }),
    () => expect(page.getByText("어느 회사가 궁금하세요?").first()).toBeVisible({ timeout: 1500 }),
  );
}

async function searchCompany(page: Page, name: string) {
  await page.getByLabel("메시지 입력").fill(name);
  await page.getByRole("button", { name: "보내기" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "서비스기획", exact: true })).toBeVisible();
});

test("E2E-01 첫 방문: 직무 3개 버튼, 입력창은 직무를 고르기 전까지 잠김", async ({ page }) => {
  for (const role of ["서비스기획", "마케팅", "운영"]) {
    await expect(page.getByRole("button", { name: role, exact: true })).toBeVisible();
  }
  await expect(page.getByLabel("메시지 입력")).toBeDisabled();
  // 고정 정보줄: 직무와 회사 둘 다 미정
  await expect(page.getByText("미정", { exact: true })).toHaveCount(2);
});

test("E2E-02 직무를 고르면 바로 회사를 묻고, 새로고침해도 직무가 남는다", async ({ page }) => {
  await chooseRole(page, "마케팅");
  await expect(page.getByLabel("메시지 입력")).toBeEnabled();
  await expect(page.locator('[data-el="고정 정보줄"]')).toBeVisible();
  await page.reload();
  await expect(page.getByText("마케팅 직무로 볼게요. 어느 회사가 궁금하세요?")).toBeVisible();
});

test("E2E-03 동명 회사: 후보 2곳을 보여 주고 고르면 기업 카드와 등급 분포가 나온다", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "몽돌커머스");
  await expect(page.getByText("같은 이름의 회사가 2곳 있습니다")).toBeVisible();
  // 후보 칩은 대표자 정보가 같이 적혀 있어서, 위쪽 예시 버튼(이름만 있음)과 구분된다
  await page.getByRole("button", { name: /대표/ }).first().click();
  await expect(page.getByText(/지표 \d+개 중 \d+개를 공식 출처로 확인했어요/)).toBeVisible();
  // 진행 기록은 접혀 있다가 "어떻게 도출했나요?"를 누르면 도구 호출 줄이 보인다
  const cardLog = page.locator("details").filter({ hasText: "compute_indicators" }).last();
  await cardLog.getByText("어떻게 도출했나요?").click();
  await expect(cardLog.getByText("compute_indicators")).toBeVisible();
  // 기업 카드 다음에는 3년차 공고 비교 말풍선이 오고, 그 진행 기록에는 공고 비교 도구 줄이 있다 (CDC-16)
  await expect(page.getByText(/3년차 공고\(.+\)와 비교하면 요구 역량 중 이어짐 \d+, 일부 \d+, 공백 \d+이에요/)).toBeVisible();
  const careerLog = page.locator("details").filter({ hasText: "compare_career_posting" }).last();
  await careerLog.getByText("어떻게 도출했나요?").click();
  await expect(careerLog.getByText(/compare_career_posting/)).toBeVisible();
});

test("E2E-04 기업 카드: 지표 자세히 보기를 열면 칸마다 등급이나 이유, 기준이 보인다", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "별하늘랩스");
  await page.getByText("지표 자세히 보기").click();
  await expect(page.getByText("이유: 공시 의무가 없어 볼 수 없음").first()).toBeVisible();
  await expect(page.getByText(/스타트업 기준표/).first()).toBeVisible();
});

test("E2E-05 맞대결을 건너뛰면 리포트 카드가 나오고, 뒷면을 뒤집을 수 있다", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "별하늘랩스");
  await page.getByRole("button", { name: "건너뛰고 기본 기준으로" }).click();
  await expect(page.getByText("최종 판단 리포트예요")).toBeVisible();
  const flip = page.locator(".chat .flip");
  await expect(flip).not.toHaveClass(/is-back/);
  await page.getByRole("button", { name: "근거 보기" }).click();
  await expect(flip).toHaveClass(/is-back/);
  await page.getByRole("button", { name: "요약 보기" }).click();
  await expect(flip).not.toHaveClass(/is-back/);
});

test("E2E-06 리포트 뒤 다음 행동: 다른 회사 보기, 직무 바꾸기", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "별하늘랩스");
  await page.getByRole("button", { name: "건너뛰고 기본 기준으로" }).click();
  await page.getByRole("button", { name: "다른 회사 보기" }).click();
  await expect(page.getByText("서비스기획 직무로 볼게요. 어느 회사가 궁금하세요?").last()).toBeVisible();
  await page.getByRole("button", { name: "직무 변경하기", exact: true }).first().click();
  await expect(page.getByText("어떤 직무로 바꿀까요?")).toBeVisible();
  await page.getByRole("button", { name: "운영", exact: true }).last().click();
  await expect(page.getByText("운영 직무로 볼게요. 어느 회사가 궁금하세요?").last()).toBeVisible();
});

test("E2E-07 없는 회사를 입력하면 안내 문구가 나오고 화면이 깨지지 않는다", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "없는회사");
  await expect(page.getByText(/같은 이름이 없습니다/)).toBeVisible();
  await expect(page.getByLabel("메시지 입력")).toBeEnabled();
});

test("E2E-08 저장한 기업이 기업 카드 모음에 쌓이고, 같은 기업은 한 장, 새로고침해도 남는다", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "별하늘랩스");
  await expect(page.getByText("총 0장")).toBeVisible();
  await page.getByRole("button", { name: "기업 카드 저장하기" }).click();
  await expect(page.getByText("총 1장")).toBeVisible();
  await searchCompany(page, "별하늘랩스");
  await expect(page.getByText(/공식 출처로 확인했어요/)).toHaveCount(2);
  // 같은 기업은 이미 저장되어 두 번째 카드의 버튼도 "저장했어요"로 보인다
  await expect(page.getByRole("button", { name: "저장했어요" })).toHaveCount(2);
  await expect(page.getByText("총 1장")).toBeVisible();
  await searchCompany(page, "청솔기계");
  await page.getByRole("button", { name: /대표/ }).first().click();
  await page.getByRole("button", { name: "기업 카드 저장하기" }).click();
  await expect(page.getByText("총 2장")).toBeVisible();
  await expect(page.getByText("기본 기준", { exact: true })).toHaveCount(2);
  await page.reload();
  await expect(page.getByText("총 2장")).toBeVisible();
});

test("E2E-09 가로 스크롤이 생기지 않는다 (기업 카드와 리포트 카드가 나온 뒤)", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "별하늘랩스");
  await page.getByRole("button", { name: "건너뛰고 기본 기준으로" }).click();
  await expect(page.getByText("최종 판단 리포트예요")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("E2E-11 직무와 회사를 바꾼 뒤 리포트 카드는 지금 직무와 회사를 보여 준다 (예시 카드가 아니다)", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "별하늘랩스");
  await page.getByRole("button", { name: "건너뛰고 기본 기준으로" }).click();
  await expect(page.getByText("서비스기획 직무 · ").first()).toBeVisible();
  // 직무를 마케팅으로 바꾸고 다른 회사를 본다
  await page.getByRole("button", { name: "직무 변경하기", exact: true }).first().click();
  await page.getByRole("button", { name: "마케팅", exact: true }).last().click();
  await expect(page.getByText("마케팅 직무로 볼게요. 어느 회사가 궁금하세요?").last()).toBeVisible();
  await searchCompany(page, "청솔기계");
  await page.getByRole("button", { name: /대표/ }).first().click();
  await expect(page.getByText("최종 판단 리포트예요").last()).toBeVisible();
  const cards = page.locator(".chat .flip");
  await expect(cards).toHaveCount(2);
  const second = await cards.nth(1).innerText();
  expect(second).toContain("주식회사 청솔기계");
  expect(second).toContain("마케팅 직무");
  expect(second).not.toContain("하늘커머스");
  expect(second).not.toContain("기획자");
  // 고정 정보줄도 같은 직무와 회사를 보여 준다
  const bar = page.locator('[data-el="고정 정보줄"]');
  await expect(bar).toContainText("마케팅");
  await expect(bar).toContainText("주식회사 청솔기계");
});

test("E2E-12 길어진 대화에서도 직무와 회사 줄은 화면 맨 위에 붙어 있다", async ({ page }) => {
  await chooseRole(page, "마케팅");
  await searchCompany(page, "별하늘랩스");
  await page.getByRole("button", { name: "건너뛰고 기본 기준으로" }).click();
  await expect(page.getByText("최종 판단 리포트예요")).toBeVisible();
  const bar = page.locator('[data-el="고정 정보줄"]');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(bar).toBeInViewport();
  const top = await bar.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(top).toBeLessThanOrEqual(1);
  await expect(bar).toContainText("마케팅");
  await expect(bar).toContainText("별하늘랩스(주)");
});

test("E2E-10 화면 문구 규칙: em dash와 이모지를 쓰지 않는다", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "별하늘랩스");
  await page.getByRole("button", { name: "건너뛰고 기본 기준으로" }).click();
  await expect(page.getByText("최종 판단 리포트예요")).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("—");
  expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
});

/** 맞대결 7판을 끝까지 둔다. side는 매 판 고를 쪽 */
async function playMatchup(page: Page, side: "기업 A" | "기업 B") {
  for (let i = 1; i <= 7; i++) {
    await expect(page.getByText(`${i} / 7`)).toBeVisible();
    await page.getByRole("button", { name: `${side} 선택` }).click();
  }
}

test("E2E-13 맞대결 7판을 끝내면 내 성향과 맞춤 판정 리포트가 나오고, 모음에 맞춤 판정 완료로 담긴다", async ({ page }) => {
  await chooseRole(page, "서비스기획");
  await searchCompany(page, "별하늘랩스");
  await page.getByRole("button", { name: "기업 맞대결로 내 성향 맞춤 판정 받기" }).click();
  await expect(page.getByText("더 끌리는 카드를 선택해 주세요")).toBeVisible();
  await playMatchup(page, "기업 A");
  await expect(page.getByText("내 성향은 안정·시스템 지향이에요.")).toBeVisible();
  await expect(page.getByText("내 성향으로 판정한 최종 판단 리포트예요")).toBeVisible();
  await expect(page.locator(".chat .flip").last()).toContainText("안정·시스템 지향");
  await expect(page.getByText("맞춤 판정 완료")).toBeVisible();
});

test("E2E-14 맞대결: 이전 판으로 돌아가면 진행 표시가 한 판 줄고, 건너뛰면 기본 기준 리포트가 나온다", async ({ page }) => {
  await chooseRole(page, "운영");
  await searchCompany(page, "별하늘랩스");
  await page.getByRole("button", { name: "기업 맞대결로 내 성향 맞춤 판정 받기" }).click();
  await page.getByRole("button", { name: "기업 B 선택" }).click();
  await expect(page.getByText("2 / 7")).toBeVisible();
  await page.getByRole("button", { name: "이전 판으로 돌아가기" }).click();
  await expect(page.getByText("1 / 7")).toBeVisible();
  await page.locator('[data-el="맞대결"]').getByRole("button", { name: "건너뛰고 기본 기준으로" }).click();
  await expect(page.getByText("모든 지표를 같은 비중으로 보고 판정했어요. 최종 판단 리포트예요.")).toBeVisible();
});

test("E2E-15 맞대결을 다시 해 성향이 바뀌면 저장 카드를 다시 판정할지 묻는다", async ({ page }) => {
  await chooseRole(page, "마케팅");
  await searchCompany(page, "별하늘랩스");
  await page.getByRole("button", { name: "기업 맞대결로 내 성향 맞춤 판정 받기" }).click();
  await playMatchup(page, "기업 A");
  await expect(page.getByText("내 성향은 안정·시스템 지향이에요.")).toBeVisible();
  await page.getByRole("button", { name: "기업 맞대결 다시 하기" }).click();
  await playMatchup(page, "기업 B");
  const dialog = page.getByRole("dialog", { name: "내 성향이 달라졌어요" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "새 성향으로 다시 판정" }).click();
  await expect(dialog).toBeHidden();
  // 모음에서 카드를 열면 새 성향이 적혀 있다
  await page.locator(".coll-title").first().click();
  await expect(page.getByRole("dialog", { name: "기업 카드 보기" })).toContainText("자율·개척 지향");
});
