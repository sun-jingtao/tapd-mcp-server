import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * MCP Prompt：缺陷修复后回填验证。
 * 只编排现有 TAPD 查询 / 写回工具，不新增自动写入能力；所有写回仍需用户确认。
 */
export function registerBugFixWritebackPrompt(server: McpServer): void {
  server.registerPrompt(
    'tapd_bug_fix_writeback',
    {
      title: 'TAPD bug 修复验证回填',
      description:
        '基于 TAPD bug 上下文和用户提供的修复信息，生成简洁回填草稿；用户确认后将状态改为已解决并写入评论。',
      argsSchema: {
        bug_id: z.string().optional().describe('TAPD bug ID；已知 bug ID 时直接传入'),
        workspace_id: z
          .string()
          .optional()
          .describe('可选，TAPD 项目 ID；提供后直接查询详情，未提供时先通过 bug ID 跨项目定位'),
        fix_summary: z.string().optional().describe('可选，修复说明；未提供时需要结合代码改动或向用户追问'),
      },
    },
    ({ bug_id, workspace_id, fix_summary }) => {
      const target = bug_id ? `目标 TAPD bug ID：${bug_id}` : '目标 TAPD bug：用户尚未提供 bug ID，请先询问用户。';

      const workspaceHint = workspace_id
        ? `TAPD 项目 ID：${workspace_id}`
        : 'TAPD 项目 ID：未提供。若只有 bug ID，先调用 tapd_list_bugs 精确查询并定位所属项目；拿到 workspace_id 后再调用 tapd_get_bugs。';

      const fixSummary = fix_summary ? `修复说明：${fix_summary}` : '修复说明：未提供，请结合代码改动生成草稿；信息不足时先向用户追问。';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                '请作为资深研发助手，完成 TAPD bug 修复后的简洁回填流程。',
                '',
                target,
                workspaceHint,
                fixSummary,
                '',
                '工作流：',
                '1. 如果缺少 bug_id，先询问用户要回填哪个 TAPD bug。',
                '2. 如果缺少 workspace_id，先调用 tapd_list_bugs 用 bug_id 精确查询，定位 bug 所属项目；若无法唯一定位，请让用户确认。',
                '3. 调用 tapd_get_bugs 获取 bug 上下文，重点确认标题、当前状态、描述、评论和链接。',
                '4. 阅读本次实际代码改动，结合 bug 现象自动判断 Bug 类型；如果没有对应修复 diff，不要强行分类，提示需人工选择。',
                '5. 根据 bug 上下文和修复信息生成回填草稿：状态固定建议改为 resolved（页面显示“已解决”），评论按实际情况简洁描述。',
                '6. 如果状态流转页要求填写 Bug 类型，优先使用上一步根据代码改动判断出的类型；当前写回工具不直接更新 Bug 类型时，只在草稿里提示用户确认。',
                '7. 写回前必须请求用户明确确认；未经确认，不要调用 tapd_writeback。',
                '8. 用户确认后，对每个 bug 优先一次性调用 tapd_writeback，传入 target_status="resolved"、comment 和 confirmed=true；resolved 对应 TAPD 页面上的“已解决”。',
                '',
                '回填原则：',
                '- 默认只做状态流转和评论回填，不主动更新处理人。',
                '- 状态写入值固定为 resolved；若项目不支持该状态，根据工具返回的可选状态让用户确认。',
                '- Bug 类型必须基于实际代码改动判断；没有对应修复 diff 时，输出“无法基于实际代码改动判断，需人工选择”。',
                '- 评论只写修复事实，不要求附带 PR、commit 或其他链接。',
                '- 评论应简洁，避免长篇复述 bug 背景。',
                '',
                '评论模板：',
                '已修复。',
                '',
                '修复说明：',
                '',
                '输出要求：',
                '1. 先输出“回填草稿”，等待用户确认。',
                '2. 用户确认后再执行写回，并输出“写回结果”。',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
