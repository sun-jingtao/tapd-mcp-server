import { describe, it, expect, vi, afterEach } from "vitest";
import { tapdRequest, tapdMultipartRequest } from "./http.js";

afterEach(() => vi.unstubAllGlobals());

// 构造一个最小 Response 桩：请求层只用到 ok / status / text()。
const mockFetch = (body: string, ok = true, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, text: async () => body }) as unknown as Response)
  );

describe("tapdRequest", () => {
  it("status === 1 时返回解析后的 payload（happy path）", async () => {
    mockFetch(JSON.stringify({ status: 1, data: [{ Bug: { id: "1" } }] }));
    await expect(tapdRequest("/bugs", { errorMessage: "查询失败" })).resolves.toMatchObject({
      status: 1,
    });
  });

  it("GET 带 params 拼入查询串；POST 带 body 补 x-www-form-urlencoded 头", async () => {
    const fetchMock = vi.fn(
      async (_url: URL | string, _init?: RequestInit) =>
        ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 1 }) }) as unknown as Response
    );
    vi.stubGlobal("fetch", fetchMock);

    await tapdRequest("/bugs", {
      method: "POST",
      params: new URLSearchParams({ q: "x" }),
      body: new URLSearchParams({ id: "1" }),
      errorMessage: "查询失败",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("q=x"); // params 序列化进查询串
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded"
    );
  });

  it("HTTP 200 但 status !== 1 时优先抛出 TAPD info", async () => {
    mockFetch(JSON.stringify({ status: 0, info: "无权限" }));
    await expect(tapdRequest("/bugs", { errorMessage: "查询失败" })).rejects.toThrow("无权限");
  });

  it("HTTP 非 2xx 但响应为带 info 的 JSON（限流）时抛出 info", async () => {
    mockFetch(JSON.stringify({ status: 0, info: "访问频率超限" }), false, 429);
    await expect(tapdRequest("/bugs", { errorMessage: "查询失败" })).rejects.toThrow("访问频率超限");
  });

  it("HTTP 非 2xx 且 payload 无 info 时回退到 errorMessage", async () => {
    mockFetch(JSON.stringify({ status: 0 }), false, 500);
    await expect(tapdRequest("/bugs", { errorMessage: "查询失败" })).rejects.toThrow("查询失败");
  });

  it("非 JSON 响应回退为带状态码与片段的错误", async () => {
    mockFetch("<html>502 Bad Gateway</html>", false, 502);
    await expect(tapdRequest("/bugs", { errorMessage: "查询失败" })).rejects.toThrow(
      /查询失败：HTTP 502，响应非 JSON/
    );
  });

  it("请求超时（TimeoutError）收敛为带接口语义的超时文案", async () => {
    // http.ts 用 AbortSignal.timeout，超时表现为 fetch 抛 DOMException('','TimeoutError')
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timeout", "TimeoutError");
      })
    );
    await expect(tapdRequest("/bugs", { errorMessage: "查询失败" })).rejects.toThrow(
      /查询失败：请求超时/
    );
  });

  it("网络异常（非超时）保留 errorMessage 前缀并附带底层信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    await expect(tapdRequest("/bugs", { errorMessage: "查询失败" })).rejects.toThrow(
      "查询失败：ECONNREFUSED"
    );
  });
});

describe("tapdMultipartRequest", () => {
  it("status === 1 时返回解析后的 payload", async () => {
    mockFetch(JSON.stringify({ status: 1, data: {} }));
    await expect(
      tapdMultipartRequest("/files/upload_image", new FormData(), "上传失败")
    ).resolves.toMatchObject({ status: 1 });
  });

  it("非 JSON 响应回退为带状态码与片段的错误", async () => {
    mockFetch("Bad Gateway", false, 502);
    await expect(
      tapdMultipartRequest("/files/upload_image", new FormData(), "上传失败")
    ).rejects.toThrow(/上传失败：HTTP 502，响应非 JSON/);
  });

  it("上传超时收敛为带接口语义的超时文案", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timeout", "TimeoutError");
      })
    );
    await expect(
      tapdMultipartRequest("/files/upload_image", new FormData(), "上传失败")
    ).rejects.toThrow(/上传失败：请求超时/);
  });

  it("HTTP 200 但 status !== 1 时优先抛出 TAPD info", async () => {
    mockFetch(JSON.stringify({ status: 0, info: "图片格式不支持" }));
    await expect(
      tapdMultipartRequest("/files/upload_image", new FormData(), "上传失败")
    ).rejects.toThrow("图片格式不支持");
  });

  it("网络异常（非超时）保留 errorMessage 前缀并附带底层信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );
    await expect(
      tapdMultipartRequest("/files/upload_image", new FormData(), "上传失败")
    ).rejects.toThrow("上传失败：ECONNRESET");
  });
});
