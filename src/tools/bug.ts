import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  appendBugDescriptionImage,
  createBug,
  getBug,
  listBugChanges,
  listBugs,
  uploadBugAttachment,
  uploadBugImage,
  writeback,
} from '../tapd/client.js';
import { resolveWorkspaceId } from '../tapd/config.js';
import {
  formatBugChangeList,
  formatBugDetails,
  formatBugList,
  formatStatus,
  type FormatBugDetailResult,
} from '../tapd/formatters.js';
import { WORKSPACE_ID_REQUIRED_DESC } from './constants.js';

/**
 * 注册缺陷（Bug）相关的 TAPD 工具，包含缺陷多媒体上传。
 */
export function registerBugTools(server: McpServer): void {
  // ─── Tool: tapd_list_bugs ────────────────────────────────────────────────────

  /**
   * MCP 工具：查询 TAPD bug 列表。
   * 负责调用 TAPD 列表接口，并把结果整理成适合 Agent 阅读的文本摘要。
   */
  server.registerTool(
    'tapd_list_bugs',
    {
      title: '查询 TAPD bug 列表',
      description:
        '查询 TAPD bug 列表，默认查询当前登录用户负责的缺陷；传入 current_owner 可查询指定处理人名下的缺陷。传入 id 或 story_id 时不限处理人（story_id 返回该需求全部处理人名下的关联缺陷），可查到已转给他人的缺陷；显式传入 current_owner 时再按该处理人取交集。传入 workspace_id 时只查该项目；不传 workspace_id 时会聚合处理人参与的所有项目的缺陷（按 story_id 过滤时仍需具体项目）。支持按字段过滤：缺陷 ID、关联需求、标题、描述、状态、报告人、处理人、创建时间，以及优先级、严重程度、中文状态、标签、迭代、模块、版本/基线、发布计划、特性、缺陷类型/根源/解决方法/重现规律、各类人员（测试/开发/参与/抄送/修复/验证/审核/关闭人等）、环境（操作系统/平台）、测试方式/阶段/类型、排期/解决/关闭/修改/流转时间、自定义字段等，并可自定义排序（order）。返回的状态会附带项目工作流中文名（如「已解决（resolved）」）。【展示约定】向用户呈现结果时，请直接原样输出本工具返回的 Markdown 表格，完整保留「序号」「id」在内的所有列（其中「缺陷」列已是内嵌超链接的 Markdown 写法，请勿拆成裸 URL、改成纯文本或删除链接），不要裁剪列、改列名或将表格拆分重排；如需补充分类或小结，可在表格之外另起段落，但表格本身保持原样。',
      inputSchema: {
        id: z.string().optional().describe('缺陷 ID，TAPD 支持多 ID 查询。传入 id 时默认跳过处理人过滤（除非同时显式传入 current_owner），以便查到已转出的缺陷'),
        story_id: z
          .string()
          .optional()
          .describe('关联需求 ID，返回该需求的关联缺陷；默认不按当前登录用户过滤（与按 id 精确查询一致，可查到他人名下的关联缺陷），仅在显式传入 current_owner 时按该处理人取交集。与 id 参数同时使用时取交集；该过滤需要具体项目，必须同时传入 workspace_id'),
        title: z.string().optional().describe('缺陷标题，TAPD 支持模糊匹配'),
        description: z.string().optional().describe('缺陷详细描述，TAPD 支持模糊匹配'),
        status: z.string().optional().describe('缺陷状态，TAPD 支持枚举查询和不等于查询'),
        reporter: z.string().optional().describe('报告人，TAPD 支持多用户查询'),
        current_owner: z
          .string()
          .optional()
          .describe('单个处理人 TAPD nick，不传默认查询当前登录用户负责的缺陷；传入则查询指定处理人名下的缺陷，建议先用 tapd_search_users 确认 nick'),
        created: z.string().optional().describe('创建时间，TAPD 支持时间查询'),
        workspace_id: z
          .string()
          .optional()
          .describe('TAPD 项目 ID。传入则只查该项目；不传则聚合处理人参与的所有项目的缺陷。可先用 tapd_list_workspaces 查看会覆盖哪些项目'),
        page: z.number().int().min(1).optional().describe('页码，默认 1。聚合查询（不传 workspace_id）时按每个项目分别分页，并非跨项目全局分页'),
        limit: z.number().int().min(1).max(200).optional().describe('返回数量上限，默认 30，最大 200；聚合查询时为每个项目的上限'),
        priority_label: z.string().optional().describe('可选，优先级（推荐字段，兼容自定义优先级）'),
        severity: z.string().optional().describe('可选，严重程度，TAPD 支持枚举查询'),
        v_status: z.string().optional().describe('可选，状态，支持传入中文状态名（如「已解决」）'),
        label: z.string().optional().describe('可选，标签，TAPD 支持枚举查询'),
        iteration_id: z.string().optional().describe('可选，迭代 ID，TAPD 支持枚举查询'),
        module: z.string().optional().describe('可选，模块，TAPD 支持枚举查询'),
        version_report: z.string().optional().describe('可选，发现版本，TAPD 支持枚举查询'),
        feature: z.string().optional().describe('可选，特性'),
        bugtype: z.string().optional().describe('可选，缺陷类型'),
        source: z.string().optional().describe('可选，缺陷根源，TAPD 支持枚举查询'),
        resolution: z.string().optional().describe('可选，解决方法，TAPD 支持枚举查询'),
        frequency: z.string().optional().describe('可选，重现规律，TAPD 支持枚举查询'),
        te: z.string().optional().describe('可选，测试人员 TAPD nick，支持模糊匹配'),
        de: z.string().optional().describe('可选，开发人员 TAPD nick，支持模糊匹配'),
        participator: z.string().optional().describe('可选，参与人，支持多人员查询'),
        begin: z.string().optional().describe('可选，预计开始时间'),
        due: z.string().optional().describe('可选，预计结束时间'),
        deadline: z.string().optional().describe('可选，解决期限'),
        resolved: z.string().optional().describe('可选，解决时间，TAPD 支持时间查询'),
        closed: z.string().optional().describe('可选，关闭时间，TAPD 支持时间查询'),
        modified: z.string().optional().describe('可选，最后修改时间，TAPD 支持时间查询'),
        release_id: z.string().optional().describe('可选，发布计划 ID'),
        version_test: z.string().optional().describe('可选，验证版本'),
        version_fix: z.string().optional().describe('可选，合入版本'),
        version_close: z.string().optional().describe('可选，关闭版本'),
        baseline_find: z.string().optional().describe('可选，发现基线'),
        baseline_join: z.string().optional().describe('可选，合入基线'),
        baseline_test: z.string().optional().describe('可选，验证基线'),
        baseline_close: z.string().optional().describe('可选，关闭基线'),
        cc: z.string().optional().describe('可选，抄送人 TAPD nick'),
        auditer: z.string().optional().describe('可选，审核人 TAPD nick'),
        confirmer: z.string().optional().describe('可选，验证人 TAPD nick'),
        fixer: z.string().optional().describe('可选，修复人 TAPD nick'),
        closer: z.string().optional().describe('可选，关闭人 TAPD nick'),
        lastmodify: z.string().optional().describe('可选，最后修改人 TAPD nick'),
        in_progress_time: z.string().optional().describe('可选，接受处理时间，TAPD 支持时间查询'),
        verify_time: z.string().optional().describe('可选，验证时间，TAPD 支持时间查询'),
        reject_time: z.string().optional().describe('可选，拒绝时间，TAPD 支持时间查询'),
        os: z.string().optional().describe('可选，操作系统'),
        platform: z.string().optional().describe('可选，软件平台'),
        testmode: z.string().optional().describe('可选，测试方式'),
        testphase: z.string().optional().describe('可选，测试阶段'),
        testtype: z.string().optional().describe('可选，测试类型'),
        estimate: z.string().optional().describe('可选，预计解决时间'),
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
      story_id,
      title,
      description,
      status,
      reporter,
      current_owner,
      created,
      workspace_id,
      page,
      limit,
      priority_label,
      severity,
      v_status,
      label,
      iteration_id,
      module,
      version_report,
      feature,
      bugtype,
      source,
      resolution,
      frequency,
      te,
      de,
      participator,
      begin,
      due,
      deadline,
      resolved,
      closed,
      modified,
      release_id,
      version_test,
      version_fix,
      version_close,
      baseline_find,
      baseline_join,
      baseline_test,
      baseline_close,
      cc,
      auditer,
      confirmer,
      fixer,
      closer,
      lastmodify,
      in_progress_time,
      verify_time,
      reject_time,
      os,
      platform,
      testmode,
      testphase,
      testtype,
      estimate,
      order,
      custom_fields,
    }) => {
      try {
        const { bugs, aggregation } = await listBugs({
          id,
          story_id,
          title,
          description,
          status,
          reporter,
          current_owner,
          created,
          workspace_id,
          page,
          limit,
          priority_label,
          severity,
          v_status,
          label,
          iteration_id,
          module,
          version_report,
          feature,
          bugtype,
          source,
          resolution,
          frequency,
          te,
          de,
          participator,
          begin,
          due,
          deadline,
          resolved,
          closed,
          modified,
          release_id,
          version_test,
          version_fix,
          version_close,
          baseline_find,
          baseline_join,
          baseline_test,
          baseline_close,
          cc,
          auditer,
          confirmer,
          fixer,
          closer,
          lastmodify,
          in_progress_time,
          verify_time,
          reject_time,
          os,
          platform,
          testmode,
          testphase,
          testtype,
          estimate,
          order,
          custom_fields,
        });

        return {
          content: [{ type: 'text', text: formatBugList(bugs, { aggregation }) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `查询失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_list_bug_changes ─────────────────────────────────────────────

  /**
   * MCP 工具：查询 TAPD 缺陷变更历史。
   * 适合追踪 bug 字段流转、处理人和状态等历史变更。
   */
  server.registerTool(
    'tapd_list_bug_changes',
    {
      title: '查询 TAPD bug 变更历史',
      description: '查询 TAPD bug 变更历史。bug_id、created 与 id 至少提供一个；可按变更人、变更字段过滤并自定义排序，include_add_bug=true 时返回创建缺陷的记录。状态变更会附带项目工作流中文名（如「接受/处理（in_progress） => 已解决（resolved）」）。',
      inputSchema: {
        bug_id: z.string().optional().describe('TAPD bug ID，与 created/id 三选一必填'),
        created: z
          .string()
          .optional()
          .describe('变更创建时间查询条件，与 bug_id/id 三选一必填；可使用 TAPD 支持的时间查询语法'),
        id: z
          .string()
          .optional()
          .describe('可选，变更历史记录 ID（支持多 ID 查询），与 bug_id/created 三选一必填'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        author: z.string().optional().describe('可选，变更人 TAPD nick'),
        field: z.string().optional().describe('可选，变更字段名（如 status）'),
        order: z
          .string()
          .optional()
          .describe('可选，排序规则，格式「字段名 asc|desc」（如 created desc）'),
        include_add_bug: z.boolean().optional().describe('可选，是否返回创建缺陷的变更记录，映射 TAPD include_add_bug=1'),
        page: z.number().int().min(1).optional().describe('页码，默认 1'),
        limit: z.number().int().min(1).max(200).optional().describe('返回数量上限，默认 30，最大 200'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ bug_id, created, id, workspace_id, author, field, order, include_add_bug, page, limit }) => {
      // SDK 的裸 shape 模式不支持 z.refine 跨字段校验，三选一约束在 handler 内检查（listBugChanges 内也有兜底）。
      if (!bug_id && !created && !id) {
        return {
          content: [{ type: 'text', text: 'bug_id、created 和 id 至少需要提供一个' }],
          isError: true,
        };
      }

      try {
        const changes = await listBugChanges({
          bug_id,
          created,
          id,
          workspace_id,
          author,
          field,
          order,
          include_add_bug,
          page,
          limit,
        });

        return {
          content: [{ type: 'text', text: formatBugChangeList(changes) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `查询失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_create_bug ───────────────────────────────────────────────────

  /**
   * MCP 工具：创建 TAPD bug。
   * 创建外部缺陷会产生持久副作用，因此要求调用方显式传入 confirmed=true。
   */
  server.registerTool(
    'tapd_create_bug',
    {
      title: '创建 TAPD bug',
      description:
        '在 TAPD 中创建一个已确认的新 bug，可选关联到指定需求，支持设置处理人、优先级、严重程度、模块、版本、迭代、排期、各类人员（测试/开发/参与人等）、工时、模板、自定义字段等。创建前建议先用 tapd_search_users 确认处理人的 nick；不传处理人则默认指派给当前登录用户。',
      inputSchema: {
        title: z.string().min(1).describe('缺陷标题'),
        description: z.string().min(1).describe('缺陷详细描述，支持 TAPD 富文本 HTML'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        story_id: z.string().optional().describe('可选，需求 ID；传入后会在缺陷创建成功后关联到该需求'),
        current_owners: z
          .array(z.string())
          .min(1)
          .max(20)
          .optional()
          .describe('可选，缺陷处理人 TAPD nick 列表；建议先调用 tapd_search_users 确认'),
        priority_label: z
          .string()
          .optional()
          .describe('可选，优先级标识，推荐使用此字段以兼容自定义优先级（如 High/Medium/Low）'),
        severity: z.string().optional().describe('可选，严重程度，需使用当前项目支持的 TAPD 严重程度值'),
        module: z.string().optional().describe('可选，所属模块'),
        bugtype: z.string().optional().describe('可选，缺陷类型'),
        version_report: z.string().optional().describe('可选，发现版本'),
        feature: z.string().optional().describe('可选，特性'),
        release_id: z.string().optional().describe('可选，发布计划 ID'),
        version_test: z.string().optional().describe('可选，验证版本'),
        version_fix: z.string().optional().describe('可选，合入版本'),
        version_close: z.string().optional().describe('可选，关闭版本'),
        baseline_find: z.string().optional().describe('可选，发现基线'),
        baseline_join: z.string().optional().describe('可选，合入基线'),
        baseline_test: z.string().optional().describe('可选，验证基线'),
        baseline_close: z.string().optional().describe('可选，关闭基线'),
        cc: z
          .string()
          .optional()
          .describe('可选，抄送人。与处理人同为 TAPD 用户 nick，参考 current_owner 格式，多个以分号分隔（如 a;b;）'),
        participator: z
          .string()
          .optional()
          .describe('可选，参与人。与处理人同为 TAPD 用户 nick，多个以分号分隔（如 a;b;）'),
        te: z.string().optional().describe('可选，测试人员 TAPD nick'),
        de: z.string().optional().describe('可选，开发人员 TAPD nick'),
        fixer: z.string().optional().describe('可选，修复人 TAPD nick'),
        confirmer: z.string().optional().describe('可选，验证人 TAPD nick'),
        auditer: z.string().optional().describe('可选，审核人 TAPD nick'),
        closer: z.string().optional().describe('可选，关闭人 TAPD nick'),
        begin: z.string().optional().describe('可选，预计开始日期（YYYY-MM-DD）'),
        due: z.string().optional().describe('可选，预计结束日期（YYYY-MM-DD）'),
        deadline: z.string().optional().describe('可选，解决期限（YYYY-MM-DD）'),
        iteration_id: z.string().optional().describe('可选，迭代 ID'),
        size: z.number().int().optional().describe('可选，规模'),
        os: z.string().optional().describe('可选，操作系统'),
        platform: z.string().optional().describe('可选，软件平台'),
        testmode: z.string().optional().describe('可选，测试方式'),
        testphase: z.string().optional().describe('可选，测试阶段'),
        testtype: z.string().optional().describe('可选，测试类型'),
        source: z.string().optional().describe('可选，缺陷根源'),
        originphase: z.string().optional().describe('可选，发现阶段'),
        sourcephase: z.string().optional().describe('可选，引入阶段'),
        resolution: z.string().optional().describe('可选，解决方法'),
        frequency: z.string().optional().describe('可选，重现规律'),
        estimate: z.number().int().optional().describe('可选，预计解决时间'),
        effort: z.string().optional().describe('可选，预估工时'),
        label: z
          .string()
          .optional()
          .describe('可选，标签，不存在时自动创建，多个以英文竖线（|）分隔'),
        template_id: z.string().optional().describe('可选，模板 ID。从缺陷模板创建时使用'),
        is_apply_template_default_value: z
          .union([z.literal(0), z.literal(1)])
          .optional()
          .describe('可选，是否从模板继承默认值（仅 0/1，1 继承），需配合 template_id'),
        custom_fields: z
          .record(z.string(), z.union([z.string(), z.number()]))
          .optional()
          .describe(
            '可选，自定义字段透传。key 为 TAPD 字段名（custom_field_*、cus_* 或 custom_plan_field_*），原样提交；具体字段名通过 TAPD 自定义字段配置接口获取',
          ),
        confirmed: z.literal(true).describe('必须为 true，表示用户已明确确认创建该 TAPD bug'),
      },
    },
    async ({
      title,
      description,
      workspace_id,
      story_id,
      current_owners,
      priority_label,
      severity,
      module,
      bugtype,
      version_report,
      feature,
      release_id,
      version_test,
      version_fix,
      version_close,
      baseline_find,
      baseline_join,
      baseline_test,
      baseline_close,
      cc,
      participator,
      te,
      de,
      fixer,
      confirmer,
      auditer,
      closer,
      begin,
      due,
      deadline,
      iteration_id,
      size,
      os,
      platform,
      testmode,
      testphase,
      testtype,
      source,
      originphase,
      sourcephase,
      resolution,
      frequency,
      estimate,
      effort,
      label,
      template_id,
      is_apply_template_default_value,
      custom_fields,
      confirmed: _,
    }) => {
      // is_apply_template_default_value 依赖模板来源，脱离 template_id 提交属误用，提前拦截给出精确报错。
      if (is_apply_template_default_value === 1 && !template_id) {
        return {
          content: [
            { type: 'text', text: 'is_apply_template_default_value 需与 template_id 一起提供' },
          ],
          isError: true,
        };
      }

      try {
        const bug = await createBug({
          title,
          description,
          workspaceId: workspace_id,
          storyId: story_id,
          currentOwners: current_owners,
          priorityLabel: priority_label,
          severity,
          module,
          bugtype,
          versionReport: version_report,
          feature,
          releaseId: release_id,
          versionTest: version_test,
          versionFix: version_fix,
          versionClose: version_close,
          baselineFind: baseline_find,
          baselineJoin: baseline_join,
          baselineTest: baseline_test,
          baselineClose: baseline_close,
          cc,
          participator,
          te,
          de,
          fixer,
          confirmer,
          auditer,
          closer,
          begin,
          due,
          deadline,
          iterationId: iteration_id,
          size,
          os,
          platform,
          testmode,
          testphase,
          testtype,
          source,
          originphase,
          sourcephase,
          resolution,
          frequency,
          estimate,
          effort,
          label,
          templateId: template_id,
          isApplyTemplateDefaultValue: is_apply_template_default_value,
          customFields: custom_fields,
        });

        return {
          content: [
            {
              type: 'text',
              text: [
                `bug 创建成功：`,
                `- ID: ${bug.bug.id}`,
                `- 标题: ${bug.bug.title}`,
                `- 状态: ${formatStatus(bug.bug)}`,
                `- 处理人: ${bug.bug.currentOwner}`,
                ...(bug.relatedStoryId
                  ? [
                      bug.relationError
                        ? `- 关联需求失败: ${bug.relatedStoryId} | ${bug.relationError}`
                        : `- 关联需求: ${bug.relatedStoryId}${bug.relationId ? ` | 关联 ID: ${bug.relationId}` : ''}`,
                    ]
                  : []),
                `- 链接: ${bug.bug.url}`,
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

  // ─── Tool: tapd_get_bugs ─────────────────────────────────────────────────────

  /**
   * MCP 工具：批量获取 TAPD bug 详情。
   * 适合一次分析多个缺陷；单条获取失败会保留在结果中，不影响其他缺陷返回。
   */
  server.registerTool(
    'tapd_get_bugs',
    {
      title: '批量获取 TAPD bug 详情',
      description: '批量获取多个 TAPD bug 的完整内容，包括描述、复现步骤、评论、附件、图片和视频等详细信息。状态会附带项目工作流中文名（如「已解决（resolved）」）',
      inputSchema: {
        bug_ids: z.array(z.string()).min(1).max(10).describe('TAPD bug ID 列表，单次最多 10 个'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ bug_ids, workspace_id }) => {
      const uniqueIds = [...new Set(bug_ids)];

      // 提前校验 workspace_id，避免批量查询中每个 bug 都重复抛出相同错误。
      let resolvedWorkspaceId: string;
      try {
        resolvedWorkspaceId = resolveWorkspaceId(workspace_id);
      } catch (error) {
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }

      const results = await Promise.all(
        uniqueIds.map(async (bugId): Promise<FormatBugDetailResult> => {
          try {
            return {
              bugId,
              bug: await getBug(bugId, resolvedWorkspaceId),
            };
          } catch (error) {
            return {
              bugId,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );

      return {
        content: [{ type: 'text', text: formatBugDetails(results) }],
        isError: results.every(result => result.error) ? true : undefined,
      };
    },
  );

  // ─── Tool: tapd_writeback ────────────────────────────────────────────────────

  /**
   * MCP 工具：自由组合 TAPD 评论、状态和处理人更新。
   * 通过 confirmed=true 强制要求调用方显式确认。
   */
  server.registerTool(
    'tapd_writeback',
    {
      title: '更新 TAPD bug',
      description:
        '对 TAPD bug 执行一个或多个已确认操作：回填评论、更新标题、更新描述正文、更新状态、更新处理人，以及更新优先级、严重程度、模块、版本、迭代、排期、各类人员、工时、标签等标准字段和自定义字段。各功能相互独立且可自由组合，至少提供 comment、title、description、target_status、target_owners、标准字段或 custom_fields 之一。注意：各动作分多次请求提交、非事务，可能出现部分成功（结果会逐项标明成功/失败）。',
      inputSchema: {
        bug_id: z.string().describe('TAPD bug ID'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        comment: z.string().min(1).optional().describe('可选，回填到 TAPD 的评论内容'),
        comment_root_id: z
          .string()
          .optional()
          .describe('可选，评论的根评论 ID。传入时本条评论挂到该评论树下；需同时提供 comment'),
        comment_reply_id: z
          .string()
          .optional()
          .describe('可选，被回复的评论 ID，表示本条评论是对它的回复；需同时提供 comment'),
        title: z.string().min(1).optional().describe('可选，更新缺陷标题为该值'),
        description: z
          .string()
          .min(1)
          .optional()
          .describe('可选，更新缺陷描述正文（支持 HTML 富文本）。注意：该字段会整体覆盖原描述，应先获取原描述并在其基础上修改后传入完整正文'),
        target_status: z
          .string()
          .optional()
          .describe('可选，将 bug 状态更新为 TAPD 工作流中的状态值，如 resolved；必须使用当前项目实际支持的状态枚举。写入前会校验是否为项目工作流合法状态，非法状态将被拒绝并返回可选状态清单'),
        target_owners: z
          .array(z.string())
          .min(1)
          .max(20)
          .optional()
          .describe('可选，将 bug 处理人更新为指定 TAPD 用户 nick 列表；应先调用 tapd_search_users 确认'),
        owner_update_mode: z
          .enum(['append', 'replace'])
          .optional()
          .describe(
            '可选，处理人更新方式。用户说“添加、加上、补上、也给”等追加语义时传 append；用户说“改为、替换为、转给、只保留”等替换语义时传 replace；不传默认 append',
          ),
        priority_label: z
          .string()
          .optional()
          .describe('可选，优先级（对应 TAPD priority_label，兼容自定义优先级）'),
        severity: z.string().optional().describe('可选，严重程度'),
        module: z.string().optional().describe('可选，模块'),
        feature: z.string().optional().describe('可选，特性'),
        release_id: z.string().optional().describe('可选，发布计划 ID'),
        version_report: z.string().optional().describe('可选，发现版本'),
        version_test: z.string().optional().describe('可选，验证版本'),
        version_fix: z.string().optional().describe('可选，合入版本'),
        version_close: z.string().optional().describe('可选，关闭版本'),
        baseline_find: z.string().optional().describe('可选，发现基线'),
        baseline_join: z.string().optional().describe('可选，合入基线'),
        baseline_test: z.string().optional().describe('可选，验证基线'),
        baseline_close: z.string().optional().describe('可选，关闭基线'),
        cc: z
          .string()
          .optional()
          .describe('可选，抄送人。与处理人同为 TAPD 用户 nick，多个以分号分隔（如 a;b;）'),
        participator: z
          .string()
          .optional()
          .describe('可选，参与人。与处理人同为 TAPD 用户 nick，多个以分号分隔（如 a;b;）'),
        te: z.string().optional().describe('可选，测试人员 TAPD nick'),
        de: z.string().optional().describe('可选，开发人员 TAPD nick'),
        fixer: z.string().optional().describe('可选，修复人 TAPD nick'),
        confirmer: z.string().optional().describe('可选，验证人 TAPD nick'),
        auditer: z.string().optional().describe('可选，审核人 TAPD nick'),
        closer: z.string().optional().describe('可选，关闭人 TAPD nick'),
        begin: z.string().optional().describe('可选，预计开始日期（YYYY-MM-DD）'),
        due: z.string().optional().describe('可选，预计结束日期（YYYY-MM-DD）'),
        deadline: z.string().optional().describe('可选，解决期限（YYYY-MM-DD）'),
        iteration_id: z.string().optional().describe('可选，迭代 ID'),
        size: z.number().int().optional().describe('可选，规模'),
        os: z.string().optional().describe('可选，操作系统'),
        platform: z.string().optional().describe('可选，软件平台'),
        testmode: z.string().optional().describe('可选，测试方式'),
        testphase: z.string().optional().describe('可选，测试阶段'),
        testtype: z.string().optional().describe('可选，测试类型'),
        source: z.string().optional().describe('可选，缺陷根源'),
        bugtype: z.string().optional().describe('可选，缺陷类型'),
        frequency: z.string().optional().describe('可选，重现规律'),
        originphase: z.string().optional().describe('可选，发现阶段'),
        sourcephase: z.string().optional().describe('可选，引入阶段'),
        resolution: z.string().optional().describe('可选，解决方法'),
        estimate: z.number().int().optional().describe('可选，预计解决时间'),
        effort: z.string().optional().describe('可选，预估工时'),
        label: z
          .string()
          .optional()
          .describe('可选，标签，不存在时自动创建，多个以英文竖线（|）分隔'),
        custom_fields: z
          .record(z.string(), z.union([z.string(), z.number()]))
          .optional()
          .describe(
            '可选，自定义字段透传。key 为 TAPD 字段名（custom_field_*、cus_* 或 custom_plan_field_*），原样提交；具体字段名通过 TAPD 自定义字段配置接口获取',
          ),
        confirmed: z.literal(true).describe('必须为 true，表示用户已明确确认本次评论、标题、描述、字段、状态变更和处理人变更'),
      },
    },
    async ({
      bug_id,
      workspace_id,
      comment,
      comment_root_id,
      comment_reply_id,
      title,
      description,
      target_status,
      target_owners,
      owner_update_mode,
      priority_label,
      severity,
      module,
      feature,
      release_id,
      version_report,
      version_test,
      version_fix,
      version_close,
      baseline_find,
      baseline_join,
      baseline_test,
      baseline_close,
      cc,
      participator,
      te,
      de,
      fixer,
      confirmer,
      auditer,
      closer,
      begin,
      due,
      deadline,
      iteration_id,
      size,
      os,
      platform,
      testmode,
      testphase,
      testtype,
      source,
      bugtype,
      frequency,
      originphase,
      sourcephase,
      resolution,
      estimate,
      effort,
      label,
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

      // SDK 的裸 shape 模式不支持 z.refine 跨字段校验，组合必填约束在 handler 内检查。
      const hasStandardField =
        priority_label !== undefined ||
        severity !== undefined ||
        module !== undefined ||
        feature !== undefined ||
        release_id !== undefined ||
        version_report !== undefined ||
        version_test !== undefined ||
        version_fix !== undefined ||
        version_close !== undefined ||
        baseline_find !== undefined ||
        baseline_join !== undefined ||
        baseline_test !== undefined ||
        baseline_close !== undefined ||
        cc !== undefined ||
        participator !== undefined ||
        te !== undefined ||
        de !== undefined ||
        fixer !== undefined ||
        confirmer !== undefined ||
        auditer !== undefined ||
        closer !== undefined ||
        begin !== undefined ||
        due !== undefined ||
        deadline !== undefined ||
        iteration_id !== undefined ||
        size !== undefined ||
        os !== undefined ||
        platform !== undefined ||
        testmode !== undefined ||
        testphase !== undefined ||
        testtype !== undefined ||
        source !== undefined ||
        bugtype !== undefined ||
        frequency !== undefined ||
        originphase !== undefined ||
        sourcephase !== undefined ||
        resolution !== undefined ||
        estimate !== undefined ||
        effort !== undefined ||
        label !== undefined;
      const hasCustomField = custom_fields !== undefined && Object.keys(custom_fields).length > 0;
      if (!comment && !title && !description && !target_status && !target_owners?.length && !hasStandardField && !hasCustomField) {
        return {
          content: [
            {
              type: 'text',
              text: 'comment、title、description、target_status、target_owners、标准字段或 custom_fields 至少需要提供一个',
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await writeback({
          bugId: bug_id,
          workspaceId: workspace_id,
          comment,
          commentRootId: comment_root_id,
          commentReplyId: comment_reply_id,
          title,
          description,
          targetStatus: target_status,
          targetOwners: target_owners,
          ownerUpdateMode: owner_update_mode,
          priorityLabel: priority_label,
          severity,
          module,
          feature,
          releaseId: release_id,
          versionReport: version_report,
          versionTest: version_test,
          versionFix: version_fix,
          versionClose: version_close,
          baselineFind: baseline_find,
          baselineJoin: baseline_join,
          baselineTest: baseline_test,
          baselineClose: baseline_close,
          cc,
          participator,
          te,
          de,
          fixer,
          confirmer,
          auditer,
          closer,
          begin,
          due,
          deadline,
          iterationId: iteration_id,
          size,
          os,
          platform,
          testmode,
          testphase,
          testtype,
          source,
          bugtype,
          frequency,
          originphase,
          sourcephase,
          resolution,
          estimate,
          effort,
          label,
          customFields: custom_fields,
        });

        const messages = [`bug ${result.bugId} 更新结果：`];

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

        if (result.targetTitle) {
          if (result.titleUpdated) {
            messages.push(`标题已更新为 ${result.targetTitle}。`);
          } else {
            messages.push(`标题更新为 ${result.targetTitle} 失败：${result.titleUpdateError}`);
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
            messages.push(`状态已更新为 ${result.targetStatus}。`);
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
          content: [{ type: 'text', text: `回填失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_upload_bug_attachment ────────────────────────────────────────

  /**
   * MCP 工具：上传文件到缺陷附件区（type=bug）。
   * 上传会产生持久副作用，因此要求调用方显式传入 confirmed=true。
   */
  server.registerTool(
    'tapd_upload_bug_attachment',
    {
      title: '上传 TAPD 缺陷附件',
      description:
        '把文件上传到指定缺陷的附件区（支持 png/jpg/mp4 等任意类型，单文件 ≤250MB）。文件内容用 base64 传入（Agent 通常无本地路径）。录屏、视频等应走此工具而非内嵌描述。上传后可用 tapd_get_bugs 在附件区核对。',
      inputSchema: {
        bug_id: z.string().describe('TAPD 缺陷 ID（附件挂载的工作项）'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        file_base64: z.string().min(1).describe('文件内容的 base64 编码，可带或不带 data:URI 前缀'),
        filename: z.string().min(1).describe('文件名，含后缀（如 capture.png、record.mp4）'),
        content_type: z.string().optional().describe('可选，文件 MIME 类型，如 image/png、video/mp4'),
        confirmed: z.literal(true).describe('必须为 true，表示用户已明确确认上传该附件'),
      },
    },
    async ({ bug_id, workspace_id, file_base64, filename, content_type, confirmed: _ }) => {
      try {
        const attachment = await uploadBugAttachment({
          bugId: bug_id,
          workspaceId: workspace_id,
          fileBase64: file_base64,
          filename,
          contentType: content_type,
        });

        return {
          content: [
            {
              type: 'text',
              text: [
                `附件已上传到缺陷 ${bug_id}：`,
                `- 附件 ID: ${attachment.id}`,
                `- 文件名: ${attachment.filename}`,
                `- 类型: ${attachment.content_type}`,
              ].join('\n'),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `附件上传失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_upload_bug_image ─────────────────────────────────────────────

  /**
   * MCP 工具：上传图片并返回可嵌入描述的 html_code（不自动写入描述）。
   * 上传会产生持久副作用，因此要求调用方显式传入 confirmed=true。
   */
  server.registerTool(
    'tapd_upload_bug_image',
    {
      title: '上传 TAPD 缺陷描述内嵌图片',
      description:
        '上传图片到 TAPD 并返回 html_code（<img> 片段），用于嵌入缺陷描述。仅支持 png/gif/jpg/jpeg/bmp、单张 ≤5MB。本工具只上传图片、不修改描述：拿到 html_code 后需自行用 tapd_get_bugs 取原描述、拼接后再调 tapd_writeback 的 description（或直接用 tapd_append_bug_description_image 一步完成）。',
      inputSchema: {
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        file_base64: z.string().min(1).describe('图片内容的 base64 编码，可带或不带 data:URI 前缀'),
        filename: z.string().min(1).describe('文件名，后缀须为 png/gif/jpg/jpeg/bmp'),
        content_type: z.string().optional().describe('可选，图片 MIME 类型，如 image/png'),
        confirmed: z.literal(true).describe('必须为 true，表示用户已明确确认上传该图片'),
      },
    },
    async ({ workspace_id, file_base64, filename, content_type, confirmed: _ }) => {
      try {
        const image = await uploadBugImage({
          workspaceId: workspace_id,
          fileBase64: file_base64,
          filename,
          contentType: content_type,
        });

        return {
          content: [
            {
              type: 'text',
              text: [
                '图片已上传：',
                `- 图片路径: ${image.imageSrc}`,
                `- 可嵌入描述的 html_code: ${image.htmlCode}`,
                '提示：将该 html_code 拼接到 tapd_get_bugs 取到的原描述后，再调用 tapd_writeback 的 description 写回，或直接使用 tapd_append_bug_description_image。',
              ].join('\n'),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `图片上传失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: tapd_append_bug_description_image ─────────────────────────────────

  /**
   * MCP 工具：上传图片并自动追加到缺陷描述末尾（组合工具）。
   * 会修改缺陷描述，产生持久副作用，因此要求调用方显式传入 confirmed=true。
   */
  server.registerTool(
    'tapd_append_bug_description_image',
    {
      title: '上传图片并追加到 TAPD 缺陷描述',
      description:
        '一步完成：上传图片 → 读取缺陷当前描述 → 把图片追加到描述末尾后整体回写。先读后写避免覆盖原有正文。仅支持 png/gif/jpg/jpeg/bmp、单张 ≤5MB。图片上传成功但描述写入失败时会明确提示（此时图片已上传，可改用 tapd_writeback 手动写回）。',
      inputSchema: {
        bug_id: z.string().describe('TAPD 缺陷 ID'),
        workspace_id: z
          .string()
          .describe(WORKSPACE_ID_REQUIRED_DESC),
        file_base64: z.string().min(1).describe('图片内容的 base64 编码，可带或不带 data:URI 前缀'),
        filename: z.string().min(1).describe('文件名，后缀须为 png/gif/jpg/jpeg/bmp'),
        content_type: z.string().optional().describe('可选，图片 MIME 类型，如 image/png'),
        confirmed: z.literal(true).describe('必须为 true，表示用户已明确确认上传图片并修改缺陷描述'),
      },
    },
    async ({ bug_id, workspace_id, file_base64, filename, content_type, confirmed: _ }) => {
      try {
        const result = await appendBugDescriptionImage({
          bugId: bug_id,
          workspaceId: workspace_id,
          fileBase64: file_base64,
          filename,
          contentType: content_type,
        });

        const messages = [
          `图片已上传到缺陷 ${bug_id}：`,
          `- 图片路径: ${result.imageSrc}`,
        ];
        if (result.descriptionUpdated) {
          messages.push('- 已追加到缺陷描述末尾。');
        } else {
          messages.push(`- 描述追加失败：${result.descriptionUpdateError}`);
          messages.push(`  图片已上传成功，可用此 html_code 手动写回描述：${result.htmlCode}`);
        }

        return {
          content: [{ type: 'text', text: messages.join('\n') }],
          isError: result.descriptionUpdated ? undefined : true,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `操作失败：${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
