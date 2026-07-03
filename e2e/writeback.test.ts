import { describe, it, expect, afterAll } from "vitest";
import { createBug, writeback, getBug } from "../src/tapd/client.js";
import { parseDelimitedList } from "../src/tapd/utils.js";

// 回退一律用 trim + ||，不用 ??：GitHub Actions 未配置的 secret 渲染为空字符串
// 而非 undefined，`"" ?? "default"` 会保留空串，导致 CI 中默认值永远不生效。
// workspace_id 也是 E2E 的启用开关之一：缺失时整体 skip，绝不静默回退到硬编码真实项目，
// 否则定时任务会往该项目写入不可删的【回归】bug。archiveStatus 这类无副作用项才可安全回退默认值。
const workspaceId = process.env.TAPD_TEST_WORKSPACE_ID?.trim() ?? "";
// 双开关 + workspace 守卫：显式 TAPD_E2E=1、真实 token、且明确指定了测试项目，三者齐备才跑。
const e2eEnabled =
  process.env.TAPD_E2E === "1" && !!process.env.TAPD_ACCESS_TOKEN && !!workspaceId;
const selfNick = process.env.TAPD_TEST_OWNER_NICK?.trim() || undefined; // 测试人本人 nick，用于处理人收回
// 归档状态须为当前项目 bug 工作流的英文 status key（非全局常量）。
// 示例用 resolved；若 validateTargetStatus 拒绝，先查该项目工作流枚举再替换。
const archiveStatus = process.env.TAPD_TEST_ARCHIVE_STATUS?.trim() || "resolved";

// 本轮创建的 bug 登记表：TAPD OpenAPI 无删除接口（api.ts 无 delete/remove 函数），
// 测试数据无法物理清除，只能登记后在 afterAll 做「软清理」——归档状态 + 收回处理人。
const createdBugIds: string[] = [];

describe.skipIf(!e2eEnabled)("E2E: writeback 闭环", () => {
  it(
    "创建【回归】bug → 评论 → 归档状态 → 验证",
    async () => {
      // 直接调 client 层函数，不必起完整 MCP stdio
      const { bug } = await createBug({
        title: `【回归】vitest-${Date.now()}`,
        description: "e2e 自动化用例创建，验证后自动归档",
        workspaceId,
        // currentOwners 不传时默认落到 token 对应本人，符合「处理人只用本人」
      });
      createdBugIds.push(bug.id);

      const result = await writeback({
        bugId: bug.id,
        workspaceId,
        comment: "e2e: fix commit abc",
        targetStatus: archiveStatus,
      });
      expect(result.statusUpdated).toBe(true);

      const detail = await getBug(bug.id, workspaceId);
      expect(detail.status).toBe(archiveStatus); // status 为英文 key；中文名在 statusLabel
    },
    60_000
  );
});

// 兜底还原：对应 测试规范.md。TAPD 无删除 API，能做的只有两件「软清理」：
//   1) 归档为 archiveStatus（如 resolved/已关闭），不留在「待处理」视图；
//   2) 处理人 replace 回本人，避免把协作处理人遗留在测试 bug 上。
// 单条失败不阻断其余 bug 的清理（逐条 try/catch 收集），但循环结束后统一断言——
// 任何还原失败都必须让套件标红并列出 bugId 供人工清扫，不能降级成一条没人看的 warn。
afterAll(async () => {
  if (!e2eEnabled) return;
  const failures: string[] = [];
  for (const bugId of createdBugIds) {
    try {
      await writeback({
        bugId,
        workspaceId,
        targetStatus: archiveStatus,
        ...(selfNick ? { targetOwners: [selfNick], ownerUpdateMode: "replace" as const } : {}),
      });
    } catch (err) {
      failures.push(`bug ${bugId} 还原写回失败：${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    // 测后必查：写回成功 ≠ 字段已还原，需读回确认处理人确已回到本人
    if (selfNick) {
      try {
        const detail = await getBug(bugId, workspaceId);
        // currentOwner 常为 "nick;" 或 "a;b;"，复用生产同款解析器切分后比对，避免两套分隔符规则分叉
        const owners = parseDelimitedList(detail.currentOwner);
        if (!owners.includes(selfNick)) {
          failures.push(`bug ${bugId} 处理人未还原：currentOwner="${detail.currentOwner}"`);
        }
      } catch (err) {
        failures.push(`bug ${bugId} 还原复查失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  expect(failures, `e2e 软清理存在失败项，需人工清扫：\n${failures.join("\n")}`).toEqual([]);
}, 120_000);
