import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * MCP Prompt：根据当前分支代码生成提测文档。
 * 只编排现有能力（宿主 Agent 的 git/代码读取 + 可选 TAPD 查询工具），不新增写入能力。
 */
export function registerTestDocPrompt(server: McpServer): void {
  server.registerPrompt(
    'tapd_test_doc',
    {
      title: 'TAPD 提测文档生成',
      description:
        '先做提测准入判断（对照 PRD 关联用例评估是否达标），达标或用户决策后把提测文档（测试环境 / 本次提测 / 测试重点 / 已知问题）写入项目根目录 提测文档.md。准入判断过程只在对话中进行，不写入文档；不改 TAPD。',
      argsSchema: {
        test_url: z.string().optional().describe('测试环境地址；缺失时在文档中标注“待补充”并提示用户'),
        base_branch: z
          .string()
          .regex(/^[A-Za-z0-9._/-]+$/, 'base_branch 只能含字母、数字与 . _ / -，避免被拼进 git 命令时注入')
          .optional()
          .describe('diff 基线分支；不传则自动探测仓库默认分支（master/main 等）'),
        story_id: z
          .string()
          .optional()
          .describe('可选，TAPD 需求 ID；提供后据其关联用例做提测准入判断，并丰富测试重点与已知问题。不提供则由用户从名下需求中选定，或确认跳过准入'),
        workspace_id: z
          .string()
          .optional()
          .describe('可选，TAPD 项目 ID；准入对照工具（get_stories / list_story_test_cases / list_bugs）均要求 workspace_id，缺失时先用 tapd_list_stories(id=story_id) 跨项目定位再查询'),
        known_issues: z.string().optional().describe('可选，手动补充的已知问题 / 正在跟进项；会与代码中扫描到的 TODO/FIXME 合并'),
      },
    },
    ({ test_url, base_branch, story_id, workspace_id, known_issues }) => {
      const baseBranchHint = base_branch
        ? `diff 基线分支：${base_branch}`
        : 'diff 基线分支：未指定——请自动探测仓库默认分支（可能是 master 等）。';

      const diffStep = base_branch
        ? `1. 运行 git diff ${base_branch}...HEAD 与 git log ${base_branch}..HEAD，识别本次分支的全部改动；若该基线分支不存在，提示用户确认正确的基线。`
        : '1. 先确定 diff 基线：仓库主分支不一定叫 main，也可能是 master 等。优先用 git symbolic-ref --short refs/remotes/origin/HEAD 取默认分支；取不到再依次用 git rev-parse --verify 检查 main、master 是否存在；仍无法确定则询问用户。确定基线后运行 git diff <基线>...HEAD 与 git log <基线>..HEAD，识别本次分支的全部改动。';

      const testUrlHint = test_url
        ? `测试环境地址：${test_url}`
        : '测试环境地址：未提供，请在文档中写“待补充”，并提醒用户补全。';

      const storyHint = story_id
        ? `关联 TAPD 需求 ID：${story_id}${
            workspace_id ? `（项目 ID：${workspace_id}）` : '（项目 ID 未提供，先用 tapd_list_stories(id=story_id) 跨项目定位 workspace_id 再查询）'
          }`
        : '关联 TAPD 需求：未提供——先调用 tapd_list_stories 列出你名下的候选需求供选择，选定后再做准入判断；你也可确认跳过准入。';

      const knownIssuesHint = known_issues
        ? `用户补充的已知问题：${known_issues}`
        : '用户补充的已知问题：未提供，仅从代码 TODO/FIXME/已知注释中收集；没有则写“暂无”。';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                '请作为资深研发，先做提测准入判断，再根据当前分支的代码改动生成提测文档并写入项目根目录的 提测文档.md。分两个阶段；进入第二阶段（生成文档）的合法前提是以下任一：准入通过 / 准入未达标但用户选择 A 或 B / 用户确认跳过准入。准入未达标时必须由用户决策后才能进入第二阶段。',
                '',
                testUrlHint,
                baseBranchHint,
                storyHint,
                knownIssuesHint,
                '',
                '阶段一 · 提测准入判断（先于生成文档；用户可在本阶段确认跳过准入）：',
                diffStep,
                '2. 阅读改动涉及的代码，理解本次实际实现了什么。',
                '3. 准入对照依赖 PRD 关联用例，注意 tapd_get_stories / tapd_list_story_test_cases / tapd_list_bugs（按 story_id 过滤）都要求 workspace_id，缺失会直接报错：',
                '   - 若有 story_id 且有 workspace_id：直接用二者调用 tapd_get_stories 获取需求与验收要点、tapd_list_story_test_cases 获取 PRD 关联测试用例、tapd_list_bugs（传入 story_id + workspace_id）获取该需求关联缺陷——该工具默认返回全部状态，只把仍未关闭/未解决的缺陷计入「未关闭关联缺陷」，按缺陷状态排除已解决/已关闭/已拒绝等终态；无法确定某状态是否为终态时标“需确认”，不要默认计入。若用户此前已确认跳过准入，则跳过本分支这三个工具调用，直接进入阶段二。',
                '   - 若有 story_id 但缺 workspace_id：先调用 tapd_list_stories 传入 id=story_id 跨项目定位需求、从结果取出 workspace_id，再用该 workspace_id 调用上述三个工具；不要直接调用它们。',
                '   - 若未提供 story_id：先调用 tapd_list_stories（不传 workspace_id，默认按当前登录用户聚合名下各项目需求）列出候选需求，连同所属项目（workspace_id）清晰展示，请用户选定目标需求；用户也可选择【跳过准入、直接基于代码改动生成文档】。得到用户选择前不要继续；用户选定后，从该需求结果取出 story_id 与 workspace_id，再按上一分支做准入对照，不要凭分支名臆测对应需求。',
                '4. 逐条把「PRD 关联用例 / 验收要点 / 未关闭关联缺陷」与本次代码实现对照，判定是否符合提测标准。重点找：用例未覆盖或无对应实现、验收点未实现或部分实现、存在阻断性未关闭缺陷。',
                '5. 输出「提测准入判断」结论：',
                '   - 符合标准：列出已覆盖的关键用例/验收点，说明可以提测，直接进入阶段二。',
                '   - 不符合标准：清晰列出每个未达标项（关联用例编号/标题 + 差距说明），然后请用户在以下三选一，得到明确选择前不要进入阶段二、不要生成文档：',
                '     A. 继续提测，并把这些未达标项记入文档「已知问题 / 正在跟进」；',
                '     B. 继续提测，忽略风险——不记入文档，只在对话中说明“已确认忽略以下未达标项”并列出，便于追溯；',
                '     C. 终止提测——不生成文档，仅输出待补项清单，供修复后重跑。',
                '',
                '阶段二 · 生成提测文档（准入通过 / 用户选择 A 或 B / 用户确认跳过准入后才执行）：',
                '6. 把 diff 翻译成业务视角的「本次提测」要点，不要逐行复述 diff。',
                '7. 由每一项改动反推「测试重点」，做到改动点与测试点一一对应；结合阶段一的 PRD 用例/验收要点补全覆盖。',
                '8. 收集「已知问题 / 正在跟进」：合并用户补充内容与代码 TODO/FIXME/已知注释。仅当完成了阶段一准入对照、且用户未选择跳过准入时，才调用 tapd_list_bugs（传入 story_id + workspace_id）取关联缺陷，并按上述规则只列入未关闭/未解决的缺陷（排除终态）；用户跳过准入、或缺 story_id/workspace_id 时不要调用 tapd_list_bugs（否则会跨项目聚合出无关缺陷）。若用户选 A，再把准入未达标项一并并入；若用户选 B，不把准入未达标项写入文档（仅在对话中说明）。没有则写“暂无”。',
                '9. 把最终提测文档写入项目根目录的 提测文档.md（整体覆盖同名文件），不要调用任何 TAPD 写入工具。准入判断结论、diff 基线、关联需求等过程信息只在对话中说明，不写入该文件——文件内容严格只包含下方模板的章节。',
                '',
                '文档要求：',
                '- 简洁、结论先行；每条改动 / 测试点用短句，便于测试同学逐条核对。',
                '- 「本次提测」与「测试重点」尽量结构对应；测试重点必须从本次 diff 推断，不要套用固定清单。下列仅为常见示例，命中才写、不相关则略：设备适配、核心链路、边界、成功/失败提示、状态流转、倒计时、多语言等。',
                '- 「已知问题」要写清现象与当前进展（如对接方是否已反馈）；没有就写“暂无”。',
                '- 不臆测未发生的改动；无法从 diff 判断的内容标注“需确认”。',
                '- 文档不写「提测准入 / Diff 基线 / 关联需求」等过程信息，只保留模板的四个章节，保持干净。',
                '',
                '处理顺序：准入未达标时，先只在对话输出「提测准入判断」+ 三选一，等用户选择；用户选 A/B 后再写入 提测文档.md，选 C 则只输出待补项清单、不写文件。准入通过、或用户确认跳过准入时，直接写入 提测文档.md（跳过准入即不做准入对照、不查关联缺陷）。',
                '',
                '提测文档模板（即 提测文档.md 的完整内容）：',
                '',
                '## 提测文档',
                '',
                `测试环境：${test_url || '（待补充）'}`,
                '',
                '### 本次提测',
                '1. ',
                '',
                '### 测试重点',
                '1. ',
                '',
                '### ⚠️ 已知问题 / 正在跟进',
                '- ',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
