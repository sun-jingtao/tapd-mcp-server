import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBugTools } from './bug.js';
import { registerRawApiTools } from './raw-api.js';
import { registerStoryTools } from './story.js';
import { registerWorkspaceTools } from './workspace.js';

/**
 * 注册全部 MCP 工具。
 * 按业务域拆分到 bug / story / workspace 三个模块，新增工具时只需在对应模块追加；
 * raw-api 是通用透传兜底，覆盖其余全部官方接口。
 */
export function registerTools(server: McpServer): void {
  registerBugTools(server);
  registerStoryTools(server);
  registerWorkspaceTools(server);
  registerRawApiTools(server);
}
