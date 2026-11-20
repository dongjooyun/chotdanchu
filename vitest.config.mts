import path from "node:path";
import { defineConfig } from "vitest/config";

// 단위·통합 테스트 설정. 화면 흐름(E2E)은 playwright.config.ts가 따로 맡는다.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
