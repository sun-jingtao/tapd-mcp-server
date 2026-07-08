import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerRawApiTools } from "../src/tools/raw-api.js";

// tapd_call_api 的 E2E：不 mock fetch，经 in-memory MCP 走完整工具链路打真实 TAPD API。
// 存在的意义是验证「对 TAPD 真实行为的假设」——单测里的 mock 只能锁定已知假设：
// 占位响应检测依赖 TAPD 对无效 path 返回 status=1 + "Hello world..." 这一未见于官方文档的行为，
// 若 TAPD 日后改掉该行为（如改返回 404 或换占位文案），本文件会先于用户报警。
// 仅使用 GET 查询，零副作用，无需 afterAll 清理。
const workspaceId = process.env.TAPD_TEST_WORKSPACE_ID?.trim() ?? "";
const e2eEnabled =
  process.env.TAPD_E2E === "1" && !!process.env.TAPD_ACCESS_TOKEN && !!workspaceId;

let mcp: Client | undefined;
const server = new McpServer({ name: "e2e", version: "0.0.0" });
registerRawApiTools(server);

beforeAll(async () => {
  if (!e2eEnabled) return;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  mcp = new Client({ name: "e2e-client", version: "0.0.0" });
  await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
});

afterAll(async () => {
  await mcp?.close();
});

const callText = (res: Awaited<ReturnType<Client["callTool"]>>) =>
  (res.content as Array<{ type: string; text: string }>)[0]!.text;

describe.skipIf(!e2eEnabled)("E2E: tapd_call_api 透传真实 TAPD API", () => {
  it("有效 path（GET /bugs/count）返回真实数据", async () => {
    // skipIf 保证进入用例时 e2eEnabled 成立，beforeAll 必已赋值 mcp
    const res = await mcp!.callTool({
      name: "tapd_call_api",
      arguments: { path: "/bugs/count", params: { workspace_id: workspaceId } },
    });

    expect(res.isError).toBeFalsy();
    // /bugs/count 返回 { count: number }，只断言结构存在，不假设具体数量
    expect(JSON.parse(callText(res))).toHaveProperty("count");
  });

  it("无效 path（GET /wiki）命中 TAPD 占位响应，被识别为路径不存在", async () => {
    const res = await mcp!.callTool({
      name: "tapd_call_api",
      arguments: { path: "/wiki", params: { workspace_id: workspaceId } },
    });

    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("接口路径不存在");
  });
});
