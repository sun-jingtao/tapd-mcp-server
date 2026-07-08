import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerRawApiTools } from "./raw-api.js";

// raw-api 工具测试：mock 全局 fetch，经 in-memory transport 走完整
// 「schema 校验 → 写保护 → tapdRequest → JSON 透传」链路。

let mcp: Client;
const server = new McpServer({ name: "test", version: "0.0.0" });
registerRawApiTools(server);

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  mcp = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
});

afterAll(async () => {
  await mcp.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const callText = (res: Awaited<ReturnType<Client["callTool"]>>) =>
  (res.content as Array<{ type: string; text: string }>)[0]!.text;

describe("tapd_call_api", () => {
  it("GET 透传 params 并返回 data 字段 JSON", async () => {
    const fetchMock = vi.fn(
      async (_url: URL | string, _init?: RequestInit) =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 1, data: [{ Task: { id: "7" } }] }),
        }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await mcp.callTool({
      name: "tapd_call_api",
      arguments: { path: "/tasks", params: { workspace_id: "123", limit: 10 } },
    });

    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain('"id": "7"');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/tasks?workspace_id=123&limit=10");
  });

  it("POST 默认被写保护拦截，不发出请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await mcp.callTool({
      name: "tapd_call_api",
      arguments: { method: "POST", path: "/timesheets", data: { workspace_id: "123" }, confirmed: true },
    });

    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("TAPD_ALLOW_RAW_WRITE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST 未传 confirmed 时被拦截，不发出请求", async () => {
    vi.stubEnv("TAPD_ALLOW_RAW_WRITE", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await mcp.callTool({
      name: "tapd_call_api",
      arguments: { method: "POST", path: "/timesheets", data: { workspace_id: "123" } },
    });

    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("confirmed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("开启 TAPD_ALLOW_RAW_WRITE 后 POST 以表单发出", async () => {
    vi.stubEnv("TAPD_ALLOW_RAW_WRITE", "true");
    const fetchMock = vi.fn(
      async (_url: URL | string, _init?: RequestInit) =>
        ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 1, data: { id: "1" } }) }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await mcp.callTool({
      name: "tapd_call_api",
      arguments: { method: "POST", path: "/timesheets", data: { workspace_id: "123", spent: "2" }, confirmed: true },
    });

    expect(res.isError).toBeFalsy();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toBe("workspace_id=123&spent=2");
  });

  it("body_format=json 时按 JSON 提交，支持数组参数", async () => {
    vi.stubEnv("TAPD_ALLOW_RAW_WRITE", "true");
    const fetchMock = vi.fn(
      async (_url: URL | string, _init?: RequestInit) =>
        ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 1, data: {} }) }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const data = { workspace_id: "123", workitems: [{ id: 1, name: "A" }] };
    const res = await mcp.callTool({
      name: "tapd_call_api",
      arguments: { method: "POST", path: "/stories/batch_update_story", data, body_format: "json", confirmed: true },
    });

    expect(res.isError).toBeFalsy();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify(data));
  });

  it("form 格式遇到数组/对象参数时报错提示改用 json", async () => {
    vi.stubEnv("TAPD_ALLOW_RAW_WRITE", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await mcp.callTool({
      name: "tapd_call_api",
      arguments: { method: "POST", path: "/stories/batch_update_story", data: { workitems: [{ id: 1 }] }, confirmed: true },
    });

    expect(res.isError).toBe(true);
    expect(callText(res)).toContain('body_format: "json"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TAPD 占位响应（Hello world）被识别为路径不存在，不当成功返回", async () => {
    const fetchMock = vi.fn(
      async (_url: URL | string, _init?: RequestInit) =>
        ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ status: 1, data: "Hello world from TAPD API. b08f010cf8e7a154d73aaf1f6962d6df" }),
        }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await mcp.callTool({
      name: "tapd_call_api",
      arguments: { path: "/wiki", params: { workspace_id: "123" } },
    });

    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("接口路径不存在");
    expect(callText(res)).toContain("GET /wiki");
  });

  it("非法 path（如带查询串）被 schema 拒绝", async () => {
    const res = await mcp.callTool({
      name: "tapd_call_api",
      arguments: { path: "/tasks?workspace_id=1" },
    });
    expect(res.isError).toBe(true);
  });
});
