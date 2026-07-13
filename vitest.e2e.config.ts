import { defineConfig } from "vitest/config";

// E2E 配置：默认不随 `pnpm test` 运行，仅 `pnpm test:e2e`（或 CI nightly）显式触发。
// 不注入假 token —— E2E 必须由外部显式提供真实 TAPD_ACCESS_TOKEN + TAPD_E2E=1，
// 否则用例内 describe.skipIf 会整体跳过（见方案 5.4）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.test.ts"],
    testTimeout: 60_000,
    env: {
      // 空字符串关闭默认 DSN，避免 E2E 噪声打到真实 Sentry
      TAPD_MCP_SENTRY_DSN: "",
    },
  },
});
