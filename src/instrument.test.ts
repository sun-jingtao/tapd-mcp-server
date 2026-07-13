import { afterEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();

vi.mock("@sentry/node", () => ({
  init,
  captureException: vi.fn(),
  close: vi.fn(),
}));

describe("instrument", () => {
  const originalDsn = process.env.SENTRY_DSN;

  afterEach(() => {
    if (originalDsn === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = originalDsn;
    }
    init.mockClear();
    vi.resetModules();
  });

  it("未设置 SENTRY_DSN 时用默认 DSN 初始化", async () => {
    delete process.env.SENTRY_DSN;
    const { DEFAULT_DSN } = await import("./instrument.js");
    expect(init).toHaveBeenCalledWith({ dsn: DEFAULT_DSN });
  });

  it("SENTRY_DSN 为空字符串时关闭", async () => {
    process.env.SENTRY_DSN = "";
    await import("./instrument.js");
    expect(init).not.toHaveBeenCalled();
  });

  it("SENTRY_DSN 有值时覆盖默认", async () => {
    process.env.SENTRY_DSN = "https://example@o0.ingest.sentry.io/1";
    await import("./instrument.js");
    expect(init).toHaveBeenCalledWith({ dsn: "https://example@o0.ingest.sentry.io/1" });
  });
});
