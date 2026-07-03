import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrdAnalysisPrompt } from './prd-analysis.js';
import { registerBugFixWritebackPrompt } from './bug-fix-writeback.js';
import { registerTestDocPrompt } from './test-doc.js';

/**
 * 注册全部 MCP Prompt。
 * Prompt 只编排现有工具、不新增写入能力，随 MCP Server 一起分发。
 */
export function registerPrompts(server: McpServer): void {
  registerPrdAnalysisPrompt(server);
  registerBugFixWritebackPrompt(server);
  registerTestDocPrompt(server);
}
