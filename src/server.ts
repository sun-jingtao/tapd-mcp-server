import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name?: string;
  version?: string;
};

const packageName = packageJson.name ?? 'tapd-mcp-server';
export const packageVersion = packageJson.version ?? '0.1.0';
const publicIconUrl = `https://unpkg.com/${packageName}@${packageVersion}/icon.png`;

/**
 * MCP Server 实例。
 * 这里只创建实例；Prompt 与工具注册分别下沉到 prompts/ 与 tools/，
 * 具体 TAPD 访问与输出格式化继续保留在 tapd 子模块。
 */
export const server = new McpServer({
  name: 'TAPD MCP',
  title: 'TAPD MCP Server',
  version: packageVersion,
  websiteUrl: 'https://github.com/sun-jingtao/tapd-mcp-server',
  description: '在 Cursor/Copilot 中查询、分析和回填 TAPD bug / 需求',
  icons: [
    {
      src: publicIconUrl,
      mimeType: 'image/png',
      sizes: ['512x512'],
    },
  ],
});
