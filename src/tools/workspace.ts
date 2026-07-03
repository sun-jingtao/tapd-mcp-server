import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listIterations, listWorkspaces, searchWorkspaceUsers } from '../tapd/client.js';
import { formatIterationList, formatWorkspaceList, formatWorkspaceUsers } from '../tapd/formatters.js';
import { WORKSPACE_ID_REQUIRED_DESC } from './constants.js';

/**
 * 注册项目 / 迭代 / 成员相关的 TAPD 工具。
 */
export function registerWorkspaceTools(server: McpServer): void {
  // ─── Tool: tapd_list_workspaces ──────────────────────────────────────────────

  /**
   * MCP 工具：查询用户参与的 TAPD 项目列表。
   * 用于在用户名下存在多个 workspace_id 时拿到全部项目 ID，便于后续跨项目聚合查询缺陷。
   */
  server.registerTool(
    'tapd_list_workspaces',
    {
      title: '查询用户参与的 TAPD 项目',
      description:
        '查询指定用户参与的所有 TAPD 项目（workspace），默认查询当前登录用户。默认过滤掉 category=organization 的公司/组织条目，只返回可用于查询缺陷和需求的具体项目。当用户名下存在多个 workspace_id 时，可先用此工具拿到全部项目 ID；tapd_list_bugs / tapd_list_stories 在不传 workspace_id 时即会跨这些项目聚合查询。',
      inputSchema: {
        nick: z
          .string()
          .optional()
          .describe('目标用户 TAPD nick，不传默认查询当前登录用户参与的项目；建议先用 tapd_search_users 确认 nick'),
        include_organization: z
          .boolean()
          .optional()
          .describe('是否包含 category=organization 的公司/组织条目，默认 false（这些条目不是具体项目，无法直接查询缺陷）'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ nick, include_organization }) => {
      try {
        const workspaces = await listWorkspaces({ nick, include_organization });

        return {
          content: [{ type: 'text', text: formatWorkspaceList(workspaces) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `查询失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_list_iterations ──────────────────────────────────────────────

  /**
   * MCP 工具：查询 TAPD 项目迭代列表。
   * 用于创建或更新需求前确认 iteration_id，避免手填错误。
   */
  server.registerTool(
    'tapd_list_iterations',
    {
      title: '查询 TAPD 迭代列表',
      description:
        '查询 TAPD 项目迭代列表，支持按迭代 ID、名称、状态过滤，以及描述、起止时间、迭代类别、计划应用、创建人、创建/修改/完成时间、锁定人、自定义字段等，并可自定义排序（order）与翻页；用于创建或更新需求时选择 iteration_id',
      inputSchema: {
        id: z.string().optional().describe('迭代 ID，TAPD 支持多 ID 查询'),
        name: z.string().optional().describe('迭代名称，TAPD 支持模糊匹配'),
        status: z
          .string()
          .optional()
          .describe('迭代状态，系统状态为 open（开启）/done（已关闭），自定义状态可传中文名'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        description: z.string().optional().describe('可选，详细描述'),
        startdate: z.string().optional().describe('可选，开始时间，TAPD 支持时间查询'),
        enddate: z.string().optional().describe('可选，结束时间，TAPD 支持时间查询'),
        workitem_type_id: z.string().optional().describe('可选，迭代类别 ID'),
        plan_app_id: z.string().optional().describe('可选，计划应用 ID'),
        creator: z.string().optional().describe('可选，创建人 TAPD nick'),
        created: z.string().optional().describe('可选，创建时间，TAPD 支持时间查询'),
        modified: z.string().optional().describe('可选，最后修改时间，TAPD 支持时间查询'),
        completed: z.string().optional().describe('可选，完成时间'),
        locker: z.string().optional().describe('可选，锁定人 TAPD nick'),
        order: z
          .string()
          .optional()
          .describe('可选，排序规则，格式「字段名 asc|desc」（如 created desc），不传默认 modified desc'),
        custom_fields: z
          .record(z.string(), z.union([z.string(), z.number()]))
          .optional()
          .describe(
            '可选，自定义字段过滤透传。key 为 TAPD 字段名（custom_field_*、cus_* 或 custom_plan_field_*），原样提交；具体字段名通过 TAPD 自定义字段配置接口获取',
          ),
        page: z.number().int().min(1).optional().describe('页码，默认 1'),
        limit: z.number().int().min(1).max(200).optional().describe('返回数量上限，默认 50，最大 200'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      id,
      name,
      status,
      workspace_id,
      description,
      startdate,
      enddate,
      workitem_type_id,
      plan_app_id,
      creator,
      created,
      modified,
      completed,
      locker,
      order,
      custom_fields,
      page,
      limit,
    }) => {
      try {
        const iterations = await listIterations({
          id,
          name,
          status,
          workspace_id,
          description,
          startdate,
          enddate,
          workitem_type_id,
          plan_app_id,
          creator,
          created,
          modified,
          completed,
          locker,
          order,
          custom_fields,
          page,
          limit,
        });

        return {
          content: [{ type: 'text', text: formatIterationList(iterations) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `查询失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_search_users ─────────────────────────────────────────────────

  /**
   * MCP 工具：搜索 TAPD 项目成员。
   * 用于在回填前把用户输入的人名匹配为可写入 current_owner 的 TAPD nick。
   */
  server.registerTool(
    'tapd_search_users',
    {
      title: '搜索 TAPD 项目成员',
      description: '按姓名、TAPD nick 或邮箱搜索项目成员。需要更新 bug 处理人前，应先用该工具确认目标处理人的 nick。',
      inputSchema: {
        keyword: z
          .string()
          .optional()
          .describe('搜索关键词，可匹配中文名、TAPD nick 或邮箱；不传则返回项目成员列表前若干项'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        limit: z.number().int().min(1).max(50).optional().describe('返回数量上限，默认 20，最大 50'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ keyword, workspace_id, limit }) => {
      try {
        const users = await searchWorkspaceUsers({ keyword, workspace_id, limit });

        return {
          content: [{ type: 'text', text: formatWorkspaceUsers(users) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `搜索失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
