import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { tapdRequest } from '../tapd/http.js';

// 透传结果最大字符数，防止 list 类接口一次返回撑爆模型上下文。
const MAX_RESULT_CHARS = 50_000;

// 写操作（POST）默认关闭，需在 MCP 配置 env 中显式开启，避免通用透传误触删除/批量修改类接口。
const allowRawWrite = () => process.env.TAPD_ALLOW_RAW_WRITE === 'true';

/** 把宽松的键值对序列化为 TAPD 要求的 URLSearchParams，过滤 undefined。 */
function toSearchParams(record?: Record<string, string | number | boolean>): URLSearchParams | undefined {
  if (!record) return undefined;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    params.set(key, String(value));
  }
  return params;
}

/**
 * 按 body_format 序列化 POST 请求体。
 * form → URLSearchParams（值必须是标量）；json → JSON 字符串（值可为数组/对象，
 * 如 batch_update_story 的 workitems 数组）。
 */
function toRequestBody(data: Record<string, unknown>, bodyFormat: 'form' | 'json'): URLSearchParams | string {
  if (bodyFormat === 'json') {
    return JSON.stringify(data);
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      throw new Error(`表单参数 ${key} 是数组/对象，form 格式无法序列化；该接口若要求 JSON 请求体，请传 body_format: "json"。`);
    }
    params.set(key, String(value));
  }
  return params;
}

/**
 * 注册 TAPD 通用透传工具。
 * 已有专用工具（tapd_list_bugs 等）覆盖高频场景；本工具兜底官方文档中其余全部 REST 接口，
 * 由调用方模型按官方文档自行拼路径和参数。
 */
export function registerRawApiTools(server: McpServer): void {
  // ─── Tool: tapd_call_api ─────────────────────────────────────────────────────

  server.registerTool(
    'tapd_call_api',
    {
      title: '调用任意 TAPD OpenAPI 接口',
      description:
        '通用透传工具：直接调用 TAPD OpenAPI（https://api.tapd.cn）的任意 REST 接口，用于专用工具未覆盖的场景（任务、工时、测试计划、模块/版本配置、Wiki、看板等）。' +
        'path 为官方文档（open.tapd.cn）中每个接口标注的 URL 路径，例如 GET /tasks（获取任务）、GET /stories/count（需求数量）、GET /modules（模块配置）、POST /timesheets（新增工时）。' +
        '路径没有统一推导规则，不确定时应以官方文档为准，不要凭猜测拼路径——按 REST 直觉猜容易踩空，例如 Wiki 列表是 /wikis 而非 /wiki，/boards、/reports 也都不是有效路径。' +
        '几乎所有接口都需要 workspace_id 参数。查询类接口默认返回 30 条，可用 page/limit 翻页。' +
        '文件上传（multipart）不走本工具，请使用 tapd_upload_bug_attachment / tapd_upload_bug_image。' +
        '注意：POST 写操作默认禁用，需在 MCP 配置 env 中设置 TAPD_ALLOW_RAW_WRITE=true，且每次调用需传 confirmed=true；优先使用专用写入工具（tapd_create_bug / tapd_writeback 等）。',
      inputSchema: {
        method: z.enum(['GET', 'POST']).optional().describe('HTTP 方法，默认 GET；TAPD 查询用 GET，新增/修改/删除用 POST'),
        path: z
          .string()
          .regex(/^\/[\w/]+$/, 'path 必须是 / 开头的 TAPD 接口路径，如 /tasks')
          .describe('TAPD 接口路径（api.tapd.cn 之后的部分），如 /tasks、/stories/count、/timesheets/delete_timesheets'),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe('GET 查询参数，如 { workspace_id: "123", limit: 10 }'),
        data: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('POST 请求体参数，仅 method=POST 时使用；默认按表单序列化，值为数组/对象时需配合 body_format: "json"'),
        body_format: z
          .enum(['form', 'json'])
          .optional()
          .describe('POST 请求体格式，默认 form（application/x-www-form-urlencoded）；接口文档要求 JSON 请求体（如 batch_update_story 的 workitems 数组）时传 json'),
        confirmed: z
          .literal(true)
          .optional()
          .describe('method=POST 时必须为 true，表示用户已明确确认本次写操作；GET 无需传'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ method = 'GET', path, params, data, body_format = 'form', confirmed }) => {
      try {
        if (method === 'POST') {
          if (!allowRawWrite()) {
            throw new Error(
              '通用透传的写操作已禁用。如确需调用，请在 MCP 配置 env 中设置 TAPD_ALLOW_RAW_WRITE=true；查询类接口请改用 GET。',
            );
          }
          if (confirmed !== true) {
            throw new Error('写操作需要显式确认：请在用户明确同意后传入 confirmed: true。');
          }
        }

        const payload = await tapdRequest<{ status?: number; info?: string; data?: unknown }>(path, {
          method,
          params: toSearchParams(params),
          body: method === 'POST' && data ? toRequestBody(data, body_format) : undefined,
          errorMessage: `TAPD 接口调用失败（${method} ${path}）`,
        });

        const result = payload.data ?? payload;
        // TAPD 对不存在的 path 不报 404，而是返回 status=1 + "Hello world" 占位串，须拦下防止误判为调通。
        if (typeof result === 'string' && result.startsWith('Hello world from TAPD API')) {
          throw new Error(
            `接口路径不存在（${method} ${path}）：TAPD 对无效 path 返回了占位响应。请以 open.tapd.cn 官方文档标注的 path 为准，不要凭猜测拼路径。`,
          );
        }

        let text = JSON.stringify(result, null, 2);
        if (text.length > MAX_RESULT_CHARS) {
          text = `${text.slice(0, MAX_RESULT_CHARS)}\n…（结果过长已截断，请用 limit/page 或 fields 参数缩小查询范围）`;
        }

        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `调用失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
