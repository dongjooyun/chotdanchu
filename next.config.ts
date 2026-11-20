import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E 테스트가 개발 서버와 빌드 폴더를 나눠 쓰도록 환경변수로 바꿀 수 있다 (playwright.config.ts)
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
