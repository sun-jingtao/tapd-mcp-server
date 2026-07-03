#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { server } from './server.js';
import { registerPrompts } from './prompts/index.js';
import { registerTools } from './tools/index.js';
import { validateTapdConfig } from './tapd/config.js';

// 在模块加载阶段完成 Prompt 与工具注册，使被测试 import 时即可拿到完整能力的 server，
// 与启动 stdio transport（仅入口直跑时执行）解耦。
registerPrompts(server);
registerTools(server);

export { server };

// ─── Start Server ────────────────────────────────────────────────────────────

/**
 * 使用 stdio transport 启动 MCP Server。
 * Cursor/Copilot 等宿主通过标准输入输出与该进程通信。
 */
async function main() {
  validateTapdConfig();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('TAPD MCP Server 已启动');
}

// 仅当作为可执行入口被直接运行时才启动 stdio server；被测试 import 时不应产生副作用
// （否则 import 即会 connect 到 process.stdin/stdout，挂住 vitest 进程）。
// 用 realpath 解析全局/npx 安装时的 bin symlink，避免 symlink 路径与 import.meta.url 不一致导致漏判。
const invokedPath = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  // 入口层只负责把启动失败输出到 stderr，并用非 0 状态码通知 MCP 宿主进程启动失败。
  main().catch(error => {
    console.error('启动失败:', error);
    process.exit(1);
  });
}
