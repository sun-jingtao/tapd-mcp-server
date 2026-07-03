import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * MCP Prompt：需求宣讲前研发评估。
 * Prompt 随 MCP Server 分发，用户通过 npx 安装后即可在支持 prompts 的 MCP 宿主中使用。
 */
export function registerPrdAnalysisPrompt(server: McpServer): void {
  server.registerPrompt(
    'tapd_prd_analysis',
    {
      title: 'TAPD 需求宣讲前研发评估',
      description:
        '基于 TAPD 需求上下文和当前代码库，输出研发视角的需求宣讲前评估报告，只保留对决策有帮助的信息。',
      argsSchema: {
        story_id: z.string().optional().describe('TAPD 需求 ID；已知需求 ID 时直接传入'),
        keyword: z.string().optional().describe('需求关键词；未知需求 ID 时用于搜索候选需求'),
        workspace_id: z
          .string()
          .optional()
          .describe('可选，TAPD 项目 ID；提供后用于定位需求，未提供时按需求 ID/关键词跨项目查询'),
      },
    },
    ({ story_id, keyword, workspace_id }) => {
      const target = story_id
        ? `目标 TAPD 需求 ID：${story_id}`
        : keyword
          ? `目标需求关键词：${keyword}`
          : '目标需求：用户尚未提供需求 ID 或关键词，请先询问用户。';

      const workspaceHint = workspace_id
        ? `TAPD 项目 ID：${workspace_id}`
        : 'TAPD 项目 ID：未提供，按需求 ID 或关键词跨项目查询（可用 tapd_list_workspaces 查看参与项目）。';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                '请作为资深研发，在需求宣讲前完成一份 TAPD 需求研发评估报告。',
                '',
                target,
                workspaceHint,
                '',
                '工作流：',
                '1. 如果已提供 story_id，先调用 tapd_get_stories 获取需求详情、描述、评论、附件和媒体信息。',
                '2. 如果只提供 keyword，先调用 tapd_list_stories 搜索候选需求，并让用户确认目标需求后再继续。',
                '3. 按需调用 tapd_list_story_changes 追踪需求变化；需要字段级变更时使用 include_details=true。',
                '4. 按需调用 tapd_list_story_test_cases 核对需求关联测试用例和验收覆盖情况。',
                '5. 按需调用 tapd_list_bugs 了解历史缺陷或关联缺陷，并传入 story_id（会返回该需求全部处理人名下的关联缺陷，不限当前登录用户）。',
                '6. 阅读当前代码库，定位相关路由、页面、组件、接口、状态管理、数据模型、权限、埋点、配置和测试代码。',
                '7. 不要只复述 PRD，要结合代码现状给出研发视角的判断；未经用户明确要求，不要直接修改代码。',
                '',
                '报告要求：',
                '- 输出要简洁、清晰、明了；优先短句和要点，不写长段落。',
                '- 结论先行，只保留对研发决策有帮助的信息，避免复述 PRD。',
                '- 风险、依赖、测试和待确认问题都要具体，避免泛泛而谈。',
                '- 每个小项控制在 1-3 条；没有明确内容时写“暂无”。',
                '- 待确认问题最多 3 条，不要为了凑数量编造问题。',
                '- 对不确定信息标注“需要确认”，不要臆测。',
                '',
                '请按以下模板输出：',
                '',
                '## 结论',
                '- 需求目标：',
                '- 改动范围：',
                '- 最大风险：',
                '- 必须确认：',
                '',
                '## 技术判断',
                '- 相关代码：',
                '- 实现方案：',
                '- 接口 / 数据 / 权限：',
                '',
                '## 风险与依赖',
                '- 主要风险：',
                '- 外部依赖：',
                '- 漏洞 / 异常场景：',
                '',
                '## 测试建议',
                '- 验收路径：',
                '- 边界 / 回归：',
                '',
                '## 待确认问题',
                '- 暂无 / 需要确认的问题：',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
