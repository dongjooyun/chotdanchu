import { defineConfig } from "@playwright/test";

// 화면 흐름(E2E) 테스트 설정. 개발 서버는 3100번 포트와 별도 빌드 폴더(.next-e2e)로 띄워서,
// 이미 켜 둔 npm run dev(3000번)와 부딪히지 않는다. 브라우저는 컴퓨터에 설치된 Chrome을 쓴다(내려받기 없음).
// Chrome이 없으면: npx playwright install chromium 후 PW_CHANNEL=chromium npm run test:e2e
const channel = process.env.PW_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  // 개발 서버는 처음 열 때 화면을 컴파일하느라 느려서 기대 조건을 넉넉히 기다린다
  expect: { timeout: 10_000 },
  workers: process.env.CI ? 1 : 2,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    channel: channel === "chromium" ? undefined : channel,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_DIST_DIR: ".next-e2e", USE_MOCK: "true" },
  },
});
