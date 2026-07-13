import { afterEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();

vi.mock("@sentry/node", () => ({
  init,
  captureException: vi.fn(),
  close: vi.fn(),
}));

describe("instrument", () => {
  const originalDsn = process.env.TAPD_MCP_SENTRY_DSN;

  afterEach(() => {
    if (originalDsn === undefined) {
      delete process.env.TAPD_MCP_SENTRY_DSN;
    } else {
      process.env.TAPD_MCP_SENTRY_DSN = originalDsn;
    }
    init.mockClear();
    vi.resetModules();
  });

  it("未设置 TAPD_MCP_SENTRY_DSN 时用默认 DSN 初始化，并带 release 与脱敏配置", async () => {
    delete process.env.TAPD_MCP_SENTRY_DSN;
    const { DEFAULT_DSN, scrubBreadcrumb } = await import("./instrument.js");
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DEFAULT_DSN,
        release: expect.stringMatching(/^tapd-mcp-server@\d+\.\d+\.\d+$/),
        sendDefaultPii: false,
        beforeBreadcrumb: scrubBreadcrumb,
      }),
    );
  });

  it("TAPD_MCP_SENTRY_DSN 为空字符串时关闭", async () => {
    process.env.TAPD_MCP_SENTRY_DSN = "";
    await import("./instrument.js");
    expect(init).not.toHaveBeenCalled();
  });

  it("TAPD_MCP_SENTRY_DSN 有值时覆盖默认", async () => {
    process.env.TAPD_MCP_SENTRY_DSN = "https://example@o0.ingest.sentry.io/1";
    await import("./instrument.js");
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: "https://example@o0.ingest.sentry.io/1" }),
    );
  });

  it("scrubBreadcrumb 丢弃 console、剥离 http 查询串", async () => {
    process.env.TAPD_MCP_SENTRY_DSN = "";
    const { scrubBreadcrumb } = await import("./instrument.js");

    expect(scrubBreadcrumb({ category: "console", message: "启动失败: ..." })).toBeNull();

    const httpCrumb = {
      type: "http",
      category: "http",
      data: {
        url: "https://api.tapd.cn/bugs",
        "http.method": "GET",
        "http.query": "?workspace_id=123&title=敏感关键词",
        "http.fragment": "#x",
        status_code: 200,
      },
    };
    expect(scrubBreadcrumb(httpCrumb)?.data).toEqual({
      url: "https://api.tapd.cn/bugs",
      "http.method": "GET",
      status_code: 200,
    });
  });
});
