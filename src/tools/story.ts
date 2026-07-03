import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createStory,
  getStory,
  listStories,
  listStoryChanges,
  listStoryTestCases,
  writebackStory,
} from '../tapd/client.js';
import { resolveWorkspaceId } from '../tapd/config.js';
import {
  formatStatus,
  formatStoryChangeList,
  formatStoryDetails,
  formatStoryList,
  formatStoryTestCaseList,
  type FormatStoryDetailResult,
} from '../tapd/formatters.js';
import { WORKSPACE_ID_REQUIRED_DESC } from './constants.js';

/**
 * 注册需求（Story）相关的 TAPD 工具。
 */
export function registerStoryTools(server: McpServer): void {
  // ─── Tool: tapd_list_stories ─────────────────────────────────────────────────

  /**
   * MCP 工具：查询当前登录用户负责的 TAPD 需求列表。
   * 负责调用 TAPD 需求列表接口，并把结果整理成适合 Agent 阅读的文本摘要。
   */
  server.registerTool(
    'tapd_list_stories',
    {
      title: '查询 TAPD 需求列表',
      description:
        '查询 TAPD 需求列表，默认查询当前登录用户负责的需求；传入 owner 可查询指定处理人名下的需求。传入 id 精确查询时不限处理人，可查到已转给他人的需求。传入 workspace_id 时只查该项目；不传 workspace_id 时会聚合处理人参与的所有项目的需求。支持按字段过滤：需求 ID、名称、描述、状态、创建人、处理人、创建时间，以及优先级、标签、版本、模块、迭代、分类、排期/修改/完成时间、父子需求、特性、技术风险、需求类别、发布计划、规模、测试重点、抄送/开发人、来源/类型、工时、自定义字段等，并可自定义排序（order）。返回的状态会附带项目工作流中文名（如「已实现（resolved）」）。【展示约定】向用户呈现结果时，请直接原样输出本工具返回的 Markdown 表格，完整保留「序号」「id」在内的所有列（其中「需求」列已是内嵌超链接的 Markdown 写法，请勿拆成裸 URL、改成纯文本或删除链接），不要裁剪列、改列名或将表格拆分重排；如需补充分类或小结，可在表格之外另起段落，但表格本身保持原样。',
      inputSchema: {
        id: z.string().optional().describe('需求 ID，TAPD 支持多 ID 查询。传入 id 时默认跳过处理人过滤（除非同时显式传入 owner），以便查到已转出的需求'),
        name: z.string().optional().describe('需求名称，TAPD 支持模糊匹配'),
        description: z.string().optional().describe('需求详细描述，TAPD 支持模糊匹配'),
        status: z.string().optional().describe('需求状态，TAPD 支持枚举查询和不等于查询'),
        creator: z.string().optional().describe('创建人，TAPD 支持多用户查询'),
        owner: z
          .string()
          .optional()
          .describe('单个处理人 TAPD nick，不传默认查询当前登录用户负责的需求；传入则查询指定处理人名下的需求，建议先用 tapd_search_users 确认 nick'),
        created: z.string().optional().describe('创建时间，TAPD 支持时间查询'),
        workspace_id: z
          .string()
          .optional()
          .describe('TAPD 项目 ID。传入则只查该项目；不传则聚合处理人参与的所有项目的需求。可先用 tapd_list_workspaces 查看会覆盖哪些项目'),
        page: z.number().int().min(1).optional().describe('页码，默认 1。聚合查询（不传 workspace_id）时按每个项目分别分页，并非跨项目全局分页'),
        limit: z.number().int().min(1).max(200).optional().describe('返回数量上限，默认 30，最大 200；聚合查询时为每个项目的上限'),
        priority_label: z.string().optional().describe('可选，优先级（推荐字段，兼容自定义优先级），TAPD 支持枚举查询'),
        v_status: z.string().optional().describe('可选，状态，支持传入中文状态名（如「已实现」）'),
        label: z.string().optional().describe('可选，标签，TAPD 支持枚举查询'),
        version: z.string().optional().describe('可选，版本'),
        module: z.string().optional().describe('可选，模块'),
        iteration_id: z.string().optional().describe('可选，迭代 ID，TAPD 支持枚举/不等于查询'),
        include_sub_iteration: z.boolean().optional().describe('可选，是否包含子迭代，默认否'),
        category_id: z.string().optional().describe('可选，需求分类 ID，TAPD 支持枚举查询'),
        include_sub_category: z.boolean().optional().describe('可选，是否包含子分类，默认否'),
        begin: z.string().optional().describe('可选，预计开始时间，TAPD 支持时间查询'),
        due: z.string().optional().describe('可选，预计结束时间，TAPD 支持时间查询'),
        modified: z.string().optional().describe('可选，最后修改时间，TAPD 支持时间查询'),
        completed: z.string().optional().describe('可选，完成时间，TAPD 支持时间查询'),
        parent_id: z.string().optional().describe('可选，父需求 ID，查询其直接子需求'),
        ancestor_id: z.string().optional().describe('可选，祖先需求 ID，查询其下所有层级子需求'),
        children_id: z.string().optional().describe('可选，子需求 ID；查询无子需求的需求时传「|」'),
        include_leaf_stories: z.boolean().optional().describe('可选，是否包含子需求，默认否'),
        feature: z.string().optional().describe('可选，特性'),
        tech_risk: z.string().optional().describe('可选，技术风险'),
        workitem_type_id: z.string().optional().describe('可选，需求类别 ID'),
        release_id: z.string().optional().describe('可选，发布计划 ID'),
        size: z.string().optional().describe('可选，规模'),
        test_focus: z.string().optional().describe('可选，测试重点'),
        cc: z.string().optional().describe('可选，抄送人 TAPD nick'),
        developer: z.string().optional().describe('可选，开发人员 TAPD nick'),
        source: z.string().optional().describe('可选，来源'),
        type: z.string().optional().describe('可选，类型'),
        effort: z.string().optional().describe('可选，预估工时'),
        effort_completed: z.string().optional().describe('可选，完成工时'),
        remain: z.string().optional().describe('可选，剩余工时'),
        exceed: z.string().optional().describe('可选，超出工时'),
        order: z
          .string()
          .optional()
          .describe(
            '可选，排序规则，格式「字段名 asc|desc」（如 created desc），不传默认 modified desc。注意：聚合查询（不传 workspace_id）时各项目内按此排序取数，但跨项目合并后最终仍按修改时间倒序展示',
          ),
        custom_fields: z
          .record(z.string(), z.union([z.string(), z.number()]))
          .optional()
          .describe(
            '可选，自定义字段过滤透传。key 为 TAPD 字段名（custom_field_*、cus_* 或 custom_plan_field_*），原样提交；具体字段名通过 TAPD 自定义字段配置接口获取',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      id,
      name,
      description,
      status,
      creator,
      owner,
      created,
      workspace_id,
      page,
      limit,
      priority_label,
      v_status,
      label,
      version,
      module,
      iteration_id,
      include_sub_iteration,
      category_id,
      include_sub_category,
      begin,
      due,
      modified,
      completed,
      parent_id,
      ancestor_id,
      children_id,
      include_leaf_stories,
      feature,
      tech_risk,
      workitem_type_id,
      release_id,
      size,
      test_focus,
      cc,
      developer,
      source,
      type,
      effort,
      effort_completed,
      remain,
      exceed,
      order,
      custom_fields,
    }) => {
      try {
        const { stories, aggregation } = await listStories({
          id,
          name,
          description,
          status,
          creator,
          owner,
          created,
          workspace_id,
          page,
          limit,
          priority_label,
          v_status,
          label,
          version,
          module,
          iteration_id,
          include_sub_iteration,
          category_id,
          include_sub_category,
          begin,
          due,
          modified,
          completed,
          parent_id,
          ancestor_id,
          children_id,
          include_leaf_stories,
          feature,
          tech_risk,
          workitem_type_id,
          release_id,
          size,
          test_focus,
          cc,
          developer,
          source,
          type,
          effort,
          effort_completed,
          remain,
          exceed,
          order,
          custom_fields,
        });

        return {
          content: [{ type: 'text', text: formatStoryList(stories, { aggregation }) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `查询失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_list_story_changes ───────────────────────────────────────────

  /**
   * MCP 工具：查询 TAPD 需求变更历史。
   * include_details 会请求 TAPD 解析字段级变更，便于同时覆盖“变更历史”和“变更详情”。
   */
  server.registerTool(
    'tapd_list_story_changes',
    {
      title: '查询 TAPD 需求变更历史',
      description:
        '查询 TAPD 需求变更历史和字段级变更详情。story_id、created 与 id 至少提供一个；可按变更人、变更字段、变更类型过滤并自定义排序；include_details=true 时返回 field_changes 变更详情。',
      inputSchema: {
        story_id: z.string().optional().describe('TAPD 需求 ID，与 created/id 三选一必填'),
        created: z
          .string()
          .optional()
          .describe('变更创建时间查询条件，与 story_id/id 三选一必填；可使用 TAPD 支持的时间查询语法'),
        id: z
          .string()
          .optional()
          .describe('可选，变更历史记录 ID（支持多 ID 查询），与 story_id/created 三选一必填'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        creator: z.string().optional().describe('可选，变更人 TAPD nick'),
        change_field: z.string().optional().describe('可选，变更字段名（如 status）'),
        change_type: z.string().optional().describe('可选，变更类型，取值见 TAPD 文档附录'),
        order: z
          .string()
          .optional()
          .describe('可选，排序规则，格式「字段名 asc|desc」（如 created desc）'),
        page: z.number().int().min(1).optional().describe('页码，默认 1'),
        limit: z.number().int().min(1).max(100).optional().describe('返回数量上限，默认 30，最大 100'),
        include_details: z.boolean().optional().describe('是否请求字段级变更详情，映射 TAPD need_parse_changes=1'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ story_id, created, id, workspace_id, creator, change_field, change_type, order, page, limit, include_details }) => {
      // SDK 的裸 shape 模式不支持 z.refine 跨字段校验，三选一约束在 handler 内检查（listStoryChanges 内也有兜底）。
      if (!story_id && !created && !id) {
        return {
          content: [{ type: 'text', text: 'story_id、created 和 id 至少需要提供一个' }],
          isError: true,
        };
      }

      try {
        const changes = await listStoryChanges({
          story_id,
          created,
          id,
          workspace_id,
          creator,
          change_field,
          change_type,
          order,
          page,
          limit,
          include_details,
        });

        return {
          content: [{ type: 'text', text: formatStoryChangeList(changes) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `查询失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_create_story ─────────────────────────────────────────────────

  /**
   * MCP 工具：创建 TAPD 需求。
   * 创建外部需求会产生持久副作用，因此要求调用方显式传入 confirmed=true。
   */
  server.registerTool(
    'tapd_create_story',
    {
      title: '创建 TAPD 需求',
      description:
        '在 TAPD 中创建一个已确认的新需求，支持设置处理人、优先级、迭代、父需求、标签、排期、工时、自定义字段等。创建前建议先用 tapd_search_users 确认处理人的 nick；不传处理人则默认指派给当前登录用户。',
      inputSchema: {
        name: z.string().min(1).describe('需求名称'),
        description: z.string().min(1).describe('需求详细描述，支持 TAPD 富文本 HTML'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        owners: z
          .array(z.string())
          .min(1)
          .max(20)
          .optional()
          .describe('可选，需求处理人 TAPD nick 列表；建议先调用 tapd_search_users 确认'),
        priority_label: z
          .string()
          .optional()
          .describe('可选，优先级标识，推荐使用此字段以兼容自定义优先级（如 High/Medium/Low）'),
        module: z.string().optional().describe('可选，所属模块'),
        iteration_id: z.string().optional().describe('可选，迭代 ID'),
        category_id: z.string().optional().describe('可选，分类 ID'),
        parent_id: z.string().optional().describe('可选，父需求 ID，用于创建子需求'),
        label: z
          .string()
          .optional()
          .describe('可选，标签，不存在时自动创建，多个以英文竖线（|）分隔'),
        cc: z
          .string()
          .optional()
          .describe('可选，抄送人。与处理人同为 TAPD 用户 nick，参考 owner 格式，多个以分号分隔（如 a;b;）'),
        developer: z
          .string()
          .optional()
          .describe('可选，开发人员。与处理人同为 TAPD 用户 nick，参考 owner 格式，多个以分号分隔（如 a;b;）'),
        begin: z.string().optional().describe('可选，预计开始日期（YYYY-MM-DD）'),
        due: z.string().optional().describe('可选，预计结束日期（YYYY-MM-DD）'),
        business_value: z.number().int().optional().describe('可选，业务价值'),
        version: z.string().optional().describe('可选，版本'),
        size: z.number().int().optional().describe('可选，规模'),
        test_focus: z.string().optional().describe('可选，测试重点'),
        effort: z.string().optional().describe('可选，预估工时'),
        effort_completed: z.string().optional().describe('可选，完成工时'),
        remain: z.number().optional().describe('可选，剩余工时'),
        exceed: z.number().optional().describe('可选，超出工时'),
        release_id: z.string().optional().describe('可选，发布计划 ID'),
        source: z.string().optional().describe('可选，来源'),
        type: z.string().optional().describe('可选，类型'),
        feature: z.string().optional().describe('可选，特性'),
        tech_risk: z.string().optional().describe('可选，技术风险'),
        workitem_type_id: z.string().optional().describe('可选，需求类别 ID'),
        templated_id: z.string().optional().describe('可选，模板 ID。从需求模板创建时使用'),
        is_apply_template_default_value: z
          .union([z.literal(0), z.literal(1)])
          .optional()
          .describe('可选，是否从模板继承默认值/保密设置（仅 0/1，1 继承），需配合 templated_id'),
        apply_template: z
          .string()
          .optional()
          .describe(
            '可选，模板选项，多个以英文逗号分隔（如 preset_stories,preset_tasks，分别预设子需求/子任务），需配合 templated_id',
          ),
        custom_fields: z
          .record(z.string(), z.union([z.string(), z.number()]))
          .optional()
          .describe(
            '可选，自定义字段透传。key 为 TAPD 字段名（custom_field_*、cus_* 或 custom_plan_field_*），原样提交；具体字段名通过 TAPD 自定义字段配置接口获取',
          ),
        confirmed: z.literal(true).describe('必须为 true，表示用户已明确确认创建该 TAPD 需求'),
      },
    },
    async ({
      name,
      description,
      workspace_id,
      owners,
      priority_label,
      module,
      iteration_id,
      category_id,
      parent_id,
      label,
      cc,
      developer,
      begin,
      due,
      business_value,
      version,
      size,
      test_focus,
      effort,
      effort_completed,
      remain,
      exceed,
      release_id,
      source,
      type,
      feature,
      tech_risk,
      workitem_type_id,
      templated_id,
      is_apply_template_default_value,
      apply_template,
      custom_fields,
      confirmed: _,
    }) => {
      // 模板选项依赖模板来源，脱离 templated_id 提交属误用，提前拦截给出精确报错。
      if ((apply_template || is_apply_template_default_value === 1) && !templated_id) {
        return {
          content: [
            { type: 'text', text: 'apply_template / is_apply_template_default_value 需与 templated_id 一起提供' },
          ],
          isError: true,
        };
      }

      try {
        const story = await createStory({
          name,
          description,
          workspaceId: workspace_id,
          owners,
          priorityLabel: priority_label,
          module,
          iterationId: iteration_id,
          categoryId: category_id,
          parentId: parent_id,
          label,
          cc,
          developer,
          begin,
          due,
          businessValue: business_value,
          version,
          size,
          testFocus: test_focus,
          effort,
          effortCompleted: effort_completed,
          remain,
          exceed,
          releaseId: release_id,
          source,
          type,
          feature,
          techRisk: tech_risk,
          workitemTypeId: workitem_type_id,
          templatedId: templated_id,
          isApplyTemplateDefaultValue: is_apply_template_default_value,
          applyTemplate: apply_template,
          customFields: custom_fields,
        });

        return {
          content: [
            {
              type: 'text',
              text: [
                `需求创建成功：`,
                `- ID: ${story.id}`,
                `- 名称: ${story.name}`,
                `- 状态: ${formatStatus(story)}`,
                `- 处理人: ${story.owner}`,
                `- 链接: ${story.url}`,
              ].join('\n'),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `创建失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_list_story_test_cases ────────────────────────────────────────

  /**
   * MCP 工具：查询指定需求关联的 TAPD 测试用例。
   * TAPD 页面也是从需求详情页进入测试用例 tab，因此按 story_id 作为入口。
   */
  server.registerTool(
    'tapd_list_story_test_cases',
    {
      title: '查询需求关联测试用例',
      description: '查询指定 TAPD 需求直接关联的所有测试用例，支持按用例名称和状态在本地过滤',
      inputSchema: {
        story_id: z.string().describe('TAPD 需求 ID'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        include_test_plan: z.boolean().optional().describe('是否包含测试计划关联，默认 true'),
        name: z.string().optional().describe('可选，按测试用例名称本地过滤'),
        status: z.string().optional().describe('可选，按测试用例状态本地过滤，如 normal、updating、abandon'),
        limit: z.number().int().min(1).max(200).optional().describe('返回数量上限，默认 100，最大 200'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ story_id, workspace_id, include_test_plan, name, status, limit }) => {
      try {
        const testCases = await listStoryTestCases({
          storyId: story_id,
          workspaceId: workspace_id,
          includeTestPlan: include_test_plan,
          name,
          status,
          limit,
        });

        return {
          content: [{ type: 'text', text: formatStoryTestCaseList(testCases) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `查询失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_get_stories ──────────────────────────────────────────────────

  /**
   * MCP 工具：批量获取 TAPD 需求详情。
   * 适合一次分析多个需求；单条获取失败会保留在结果中，不影响其他需求返回。
   */
  server.registerTool(
    'tapd_get_stories',
    {
      title: '批量获取 TAPD 需求详情',
      description: '批量获取多个 TAPD 需求的完整内容，包括描述、评论、附件、图片和视频等详细信息。状态会附带项目工作流中文名（如「已实现（resolved）」）',
      inputSchema: {
        story_ids: z.array(z.string()).min(1).max(10).describe('TAPD 需求 ID 列表，单次最多 10 个'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ story_ids, workspace_id }) => {
      // 去重后并发查询，避免重复 ID 放大 TAPD 请求量。
      const uniqueIds = [...new Set(story_ids)];

      // 提前校验 workspace_id，避免批量查询中每个需求都重复抛出相同错误。
      let resolvedWorkspaceId: string;
      try {
        resolvedWorkspaceId = resolveWorkspaceId(workspace_id);
      } catch (error) {
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }

      // 单条需求失败不会中断整个批量请求，格式化层会把成功和失败结果一起返回。
      const results = await Promise.all(
        uniqueIds.map(async (storyId): Promise<FormatStoryDetailResult> => {
          try {
            return {
              storyId,
              story: await getStory(storyId, resolvedWorkspaceId),
            };
          } catch (error) {
            return {
              storyId,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );

      return {
        content: [{ type: 'text', text: formatStoryDetails(results) }],
        isError: results.every(result => result.error) ? true : undefined,
      };
    },
  );

  // ─── Tool: tapd_writeback_story ──────────────────────────────────────────────

  /**
   * MCP 工具：自由组合 TAPD 需求评论、状态和处理人更新。
   * 通过 confirmed=true 强制要求调用方显式确认。
   */
  server.registerTool(
    'tapd_writeback_story',
    {
      title: '更新 TAPD 需求',
      description:
        '对 TAPD 需求执行一个或多个已确认操作：回填评论、更新描述正文、更新状态、更新处理人，以及更新标题、优先级、迭代、版本、工时、标签等标准字段和自定义字段。各功能相互独立且可自由组合，至少提供 comment、description、target_status、target_owners、标准字段或 custom_fields 之一。注意：各动作分多次请求提交、非事务，可能出现部分成功（结果会逐项标明成功/失败）。',
      inputSchema: {
        story_id: z.string().describe('TAPD 需求 ID'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        comment: z.string().min(1).optional().describe('可选，回填到 TAPD 需求的评论内容'),
        comment_root_id: z
          .string()
          .optional()
          .describe('可选，评论的根评论 ID。传入时本条评论挂到该评论树下；需同时提供 comment'),
        comment_reply_id: z
          .string()
          .optional()
          .describe('可选，被回复的评论 ID，表示本条评论是对它的回复；需同时提供 comment'),
        description: z
          .string()
          .min(1)
          .optional()
          .describe('可选，更新需求描述正文（支持 HTML 富文本）。注意：该字段会整体覆盖原描述，应先获取原描述并在其基础上修改后传入完整正文'),
        target_status: z
          .string()
          .optional()
          .describe('可选，将需求状态更新为 TAPD 工作流中的状态值；必须使用当前项目实际支持的状态枚举。写入前会校验是否为项目工作流合法状态，非法状态将被拒绝并返回可选状态清单'),
        target_owners: z
          .array(z.string())
          .min(1)
          .max(20)
          .optional()
          .describe('可选，将需求处理人更新为指定 TAPD 用户 nick 列表；应先调用 tapd_search_users 确认'),
        owner_update_mode: z
          .enum(['append', 'replace'])
          .optional()
          .describe(
            '可选，处理人更新方式。用户说“添加、加上、补上、也给”等追加语义时传 append；用户说“改为、替换为、转给、只保留”等替换语义时传 replace；不传默认 append',
          ),
        name: z.string().min(1).optional().describe('可选，更新需求标题'),
        priority_label: z
          .string()
          .optional()
          .describe('可选，优先级（对应 TAPD priority_label，兼容自定义优先级）'),
        business_value: z.number().int().optional().describe('可选，业务价值'),
        version: z.string().optional().describe('可选，版本'),
        module: z.string().optional().describe('可选，模块'),
        test_focus: z.string().optional().describe('可选，测试重点'),
        size: z.number().int().optional().describe('可选，规模'),
        cc: z
          .string()
          .optional()
          .describe('可选，抄送人。与处理人同为 TAPD 用户 nick，参考 owner 格式，多个以分号分隔（如 a;b;）'),
        developer: z
          .string()
          .optional()
          .describe('可选，开发人员。与处理人同为 TAPD 用户 nick，参考 owner 格式，多个以分号分隔（如 a;b;）'),
        begin: z.string().optional().describe('可选，预计开始日期（YYYY-MM-DD）'),
        due: z.string().optional().describe('可选，预计结束日期（YYYY-MM-DD）'),
        iteration_id: z.string().optional().describe('可选，迭代 ID'),
        effort: z.string().optional().describe('可选，预估工时'),
        effort_completed: z.string().optional().describe('可选，完成工时'),
        remain: z.number().optional().describe('可选，剩余工时'),
        exceed: z.number().optional().describe('可选，超出工时'),
        category_id: z.string().optional().describe('可选，需求分类 ID'),
        release_id: z.string().optional().describe('可选，发布计划 ID'),
        source: z.string().optional().describe('可选，来源'),
        type: z.string().optional().describe('可选，类型'),
        label: z
          .string()
          .optional()
          .describe('可选，标签，不存在时自动创建，多个以英文竖线（|）分隔'),
        is_auto_close_task: z
          .union([z.literal(0), z.literal(1)])
          .optional()
          .describe('可选，流转到结束状态时是否自动关闭关联任务（仅 0/1，1 关闭，默认 0）。仅在本次同时变更状态时生效，需与 target_status 一起提交'),
        custom_fields: z
          .record(z.string(), z.union([z.string(), z.number()]))
          .optional()
          .describe(
            '可选，自定义字段透传。key 为 TAPD 字段名（custom_field_*、cus_* 或 custom_plan_field_*），原样提交；具体字段名通过 TAPD 自定义字段配置接口获取',
          ),
        confirmed: z.literal(true).describe('必须为 true，表示用户已明确确认本次评论、描述、字段、状态变更和处理人变更'),
      },
    },
    async ({
      story_id,
      workspace_id,
      comment,
      comment_root_id,
      comment_reply_id,
      description,
      target_status,
      target_owners,
      owner_update_mode,
      name,
      priority_label,
      business_value,
      version,
      module,
      test_focus,
      size,
      cc,
      developer,
      begin,
      due,
      iteration_id,
      effort,
      effort_completed,
      remain,
      exceed,
      category_id,
      release_id,
      source,
      type,
      label,
      is_auto_close_task,
      custom_fields,
      confirmed: _,
    }) => {
      // root_id/reply_id 仅在创建评论时有意义，缺少 comment 时会被静默忽略，提前给出精确报错。
      if ((comment_root_id || comment_reply_id) && !comment) {
        return {
          content: [{ type: 'text', text: 'comment_root_id / comment_reply_id 需与 comment 一起提供' }],
          isError: true,
        };
      }

      // is_auto_close_task 仅在「需求流转到结束状态」时由 TAPD 生效，单独提交是 no-op；缺少 target_status 时提前报错。
      if (is_auto_close_task !== undefined && !target_status) {
        return {
          content: [{ type: 'text', text: 'is_auto_close_task 仅在流转状态时生效，需与 target_status 一起提供' }],
          isError: true,
        };
      }

      // SDK 的裸 shape 模式不支持 z.refine 跨字段校验，组合必填约束在 handler 内检查。
      const hasStandardField =
        name !== undefined ||
        priority_label !== undefined ||
        business_value !== undefined ||
        version !== undefined ||
        module !== undefined ||
        test_focus !== undefined ||
        size !== undefined ||
        cc !== undefined ||
        developer !== undefined ||
        begin !== undefined ||
        due !== undefined ||
        iteration_id !== undefined ||
        effort !== undefined ||
        effort_completed !== undefined ||
        remain !== undefined ||
        exceed !== undefined ||
        category_id !== undefined ||
        release_id !== undefined ||
        source !== undefined ||
        type !== undefined ||
        label !== undefined;
      // is_auto_close_task 不计入组合必填：它只能随 target_status 一起出现（见上方 guard），
      // 已由 target_status 满足必填，单独不构成有效更新。
      const hasCustomField = custom_fields !== undefined && Object.keys(custom_fields).length > 0;
      if (!comment && !description && !target_status && !target_owners?.length && !hasStandardField && !hasCustomField) {
        return {
          content: [
            {
              type: 'text',
              text: 'comment、description、target_status、target_owners、标准字段或 custom_fields 至少需要提供一个',
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await writebackStory({
          storyId: story_id,
          workspaceId: workspace_id,
          comment,
          commentRootId: comment_root_id,
          commentReplyId: comment_reply_id,
          description,
          targetStatus: target_status,
          targetOwners: target_owners,
          ownerUpdateMode: owner_update_mode,
          name,
          priorityLabel: priority_label,
          businessValue: business_value,
          version,
          module,
          testFocus: test_focus,
          size,
          cc,
          developer,
          begin,
          due,
          iterationId: iteration_id,
          effort,
          effortCompleted: effort_completed,
          remain,
          exceed,
          categoryId: category_id,
          releaseId: release_id,
          source,
          type,
          label,
          isAutoCloseTask: is_auto_close_task,
          customFields: custom_fields,
        });

        const messages = [`需求 ${result.storyId} 更新结果：`];

        if (typeof result.commentCreated === 'boolean') {
          if (result.commentCreated) {
            messages.push(
              `评论已回填。评论人: ${result.author}${result.commentId ? ` | 评论 ID: ${result.commentId}` : ''}`,
            );
          } else {
            messages.push(`评论回填失败：${result.commentCreateError}`);
          }
        }

        if (typeof result.fieldsUpdated === 'boolean') {
          const fields = result.updatedFields?.join('、') ?? '';
          if (result.fieldsUpdated) {
            messages.push(`字段已更新：${fields}。`);
          } else {
            messages.push(`字段更新失败（${fields}）：${result.fieldsUpdateError}`);
          }
        }

        if (typeof result.descriptionUpdated === 'boolean') {
          if (result.descriptionUpdated) {
            messages.push('描述正文已更新（整体覆盖）。');
          } else {
            messages.push(`描述正文更新失败：${result.descriptionUpdateError}`);
          }
        }

        if (result.targetStatus) {
          if (result.statusUpdated) {
            // is_auto_close_task 随本次状态变更同请求提交，回执里明示，便于排障。
            const autoClose =
              is_auto_close_task !== undefined ? `（同请求提交 is_auto_close_task=${is_auto_close_task}）` : '';
            messages.push(`状态已更新为 ${result.targetStatus}${autoClose}。`);
          } else {
            messages.push(`状态更新为 ${result.targetStatus} 失败：${result.statusUpdateError}`);
          }
        }
        if (result.targetOwners?.length) {
          const targetOwners = result.targetOwners.join(', ');
          const finalOwners = result.finalOwners?.join(', ');
          if (result.ownerUpdated) {
            messages.push(
              result.ownerUpdateMode === 'append'
                ? `处理人已追加 ${targetOwners}。当前完整处理人列表: ${finalOwners}。`
                : `处理人已替换为 ${targetOwners}。`,
            );
          } else {
            messages.push(`处理人更新为 ${targetOwners} 失败：${result.ownerUpdateError}`);
          }
        }

        return {
          content: [{ type: 'text', text: messages.join('\n') }],
          isError: result.partialFailure || undefined,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `需求回填失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
