import { describe, it, expect } from "vitest";
import { resolveWorkspaceId, validateTapdConfig, WORKSPACE_ID_HINT, TAPD_CONFIG } from "./config.js";

describe("resolveWorkspaceId", () => {
  it("正常值去除首尾空白后返回", () => {
    expect(resolveWorkspaceId(" 123 ")).toBe("123");
  });

  it("undefined 抛错且文案携带 WORKSPACE_ID_HINT", () => {
    expect(() => resolveWorkspaceId()).toThrow(WORKSPACE_ID_HINT);
  });

  it("纯空白同样视为缺失并抛错", () => {
    expect(() => resolveWorkspaceId("   ")).toThrow("缺少 TAPD 项目 ID");
  });
});

describe("validateTapdConfig", () => {
  it("有 token 时通过（vitest 已注入假 token）", () => {
    expect(() => validateTapdConfig()).not.toThrow();
  });

  it("缺少 token 时抛错", () => {
    const original = TAPD_CONFIG.accessToken;
    TAPD_CONFIG.accessToken = "";
    try {
      expect(() => validateTapdConfig()).toThrow("缺少 TAPD_ACCESS_TOKEN");
    } finally {
      TAPD_CONFIG.accessToken = original; // 还原，避免污染同进程其它用例
    }
  });
});
