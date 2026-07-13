import { defineConfig } from "vitest/config";

// 单元 / 集成测试配置。E2E 走独立的 vitest.e2e.config.ts，默认不跑。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 注入假 token：config.ts 在模块加载时即读 process.env.TAPD_ACCESS_TOKEN，
    // vitest 会先 setup env 再加载被测模块，避免单测在缺省环境下误打真实 TAPD。
    env: {
      TAPD_ACCESS_TOKEN: "test-token-for-unit-tests",
      // 空字符串关闭默认 DSN，避免单测 import 入口时向真实 Sentry 上报
      SENTRY_DSN: "",
    },
    coverage: {
      provider: "v8",
      // 计入 MCP 工具层 src/index.ts（工具注册、入参校验、错误整形）与 tapd 业务核心，
      // 避免把整个工具边界层排除在门禁外、给出「全局已覆盖」的错觉。
      include: ["src/**"],
      // api.ts 是 TAPD OpenAPI 的薄路径封装（方案 §4.2），集成测试一律 mock 它，
      // 真实逻辑由 http.ts + client 编排覆盖；计入覆盖率只会被 0% 持续扭曲，故排除。
      exclude: [
        "src/**/*.test.ts",
        "src/tapd/__fixtures__/**",
        "src/tapd/api.ts",
        "src/tapd/api-types.ts",
        "src/tapd/types.ts",
      ],
      // 已达方案 §8「稳定」阶段：核心模块覆盖达标后开启 CI 硬门禁，
      // 不达标时 `vitest run --coverage` 非零退出，CI 自动拦截。
      thresholds: { statements: 70, lines: 70, functions: 70, branches: 55 },
    },
  },
});
