import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 테스트 실행이 만드는 폴더 (E2E용 별도 빌드 폴더, 결과물, 보고서)
    ".next-e2e/**",
    // 실데이터 모드 화면 확인용 별도 빌드 폴더 (docs/agent-design.md)
    ".next-live/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
