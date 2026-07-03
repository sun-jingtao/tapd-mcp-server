import { describe, it, expect } from "vitest";
import {
  formatStatus,
  formatBugList,
  formatStoryList,
  formatWorkspaceList,
  formatBugChangeList,
  formatStoryChangeList,
  formatIterationList,
  formatStoryTestCaseList,
  formatWorkspaceUsers,
  formatBugDetail,
  formatBugDetails,
  formatStoryDetail,
  formatStoryDetails,
} from "./formatters.js";
import { normalizeBug, normalizeBugChange, normalizeStory, normalizeStoryChange } from "./utils.js";
import type { TapdWorkspaceAggregationMeta } from "./types.js";

describe("formatStatus", () => {
  it("有 statusLabel 时渲染「中文（英文）」", () => {
    expect(formatStatus({ status: "resolved", statusLabel: "已解决" })).toBe("已解决（resolved）");
  });

  it("无 statusLabel 时回退为原始英文状态", () => {
    expect(formatStatus({ status: "resolved" })).toBe("resolved");
  });

  it("statusLabel 为空字符串时回退为英文状态（工作流未配中文名）", () => {
    expect(formatStatus({ status: "resolved", statusLabel: "" })).toBe("resolved");
  });
});

describe("formatBugList", () => {
  it("无聚合元数据的空列表：通用「未找到」文案", () => {
    expect(formatBugList([])).toBe("未找到符合条件的缺陷。");
  });

  it("聚合查询命中 0 个项目：提示排查处理人 nick", () => {
    const aggregation: TapdWorkspaceAggregationMeta = {
      total: 0,
      succeeded: 0,
      failed: 0,
      workspaceNames: {},
      failedWorkspaces: [],
    };
    expect(formatBugList([], { aggregation })).toContain("未找到该处理人参与的 TAPD 项目");
  });

  it("聚合查询有项目失败但无结果：报告失败项目数与明细", () => {
    const aggregation: TapdWorkspaceAggregationMeta = {
      total: 2,
      succeeded: 1,
      failed: 1,
      workspaceNames: { "1": "A", "2": "B" },
      failedWorkspaces: [{ id: "2", name: "B", reason: "限流" }],
    };
    const text = formatBugList([], { aggregation });
    expect(text).toContain("已查询 2 个项目，其中 1 个查询失败");
    expect(text).toContain("B（2）");
  });

  it("聚合查询有结果：标题带项目覆盖数，正文展示 workspaceNames 与失败摘要", () => {
    const bug = normalizeBug(
      {
        id: "100",
        title: "登录失败",
        status: "resolved",
        reporter: "张三",
        created: "2026-06-01",
        current_owner: "李四",
      } as never,
      "1"
    );
    const aggregation: TapdWorkspaceAggregationMeta = {
      total: 2,
      succeeded: 1,
      failed: 1,
      workspaceNames: { "1": "A" },
      failedWorkspaces: [{ id: "2", name: "B", reason: "超时" }],
    };
    const text = formatBugList([bug], { aggregation });
    expect(text).toContain("找到 1 个缺陷（覆盖 1/2 个项目，1 个查询失败）：");
    // Markdown 表格：序号、id 为前两列，项目列展示 名称（id），缺陷名内嵌超链接
    expect(text).toContain("| 序号 | id | 缺陷 | 项目 | 状态 | 报告人 | 处理人 | 创建时间 |");
    expect(text).toContain("| 1 | 100 | [登录失败](http");
    expect(text).toContain("A（1）");
    expect(text).toContain("⚠️ 以下 1 个项目查询失败");
  });

  it("非聚合结果：缺陷名内嵌超链接、无独立链接列、创建时间含完整时分秒", () => {
    const bug = normalizeBug(
      { id: "7", title: "支付按钮无响应", status: "open", reporter: "钱七", created: "2026-06-02 09:30:00", current_owner: "周八" } as never,
      "1"
    );
    const text = formatBugList([bug]);
    expect(text).toContain("找到 1 个缺陷：");
    expect(text).toContain("| 序号 | id | 缺陷 | 状态 | 报告人 | 处理人 | 创建时间 |");
    expect(text).not.toContain("链接 |");
    expect(text).toContain("| 1 | 7 | [支付按钮无响应](http");
    expect(text).toContain("2026-06-02 09:30:00");
    expect(text).not.toContain("| 项目 |");
  });

  it("单元格转义：标题含竖线/换行不会破坏表格列", () => {
    const bug = normalizeBug(
      { id: "8", title: "A | B\n换行", status: "open", reporter: "甲", created: "2026-06-03", current_owner: "乙" } as never,
      "1"
    );
    const text = formatBugList([bug]);
    expect(text).toContain("A \\| B 换行");
    expect(text).not.toContain("A | B\n换行");
  });
});

describe("formatStoryList", () => {
  it("空列表回退通用文案", () => {
    expect(formatStoryList([])).toBe("未找到符合条件的需求。");
  });

  it("非聚合结果：需求名内嵌超链接、无独立链接列、创建时间含完整时分秒", () => {
    const story = normalizeStory(
      { id: "9", name: "登录优化", status: "developing", creator: "王五", owner: "赵六", created: "2026-06-11 16:50:49" } as never,
      "1"
    );
    const text = formatStoryList([story]);
    expect(text).toContain("找到 1 个需求：");
    // 表头去掉了「链接」列
    expect(text).toContain("| 序号 | id | 需求 | 状态 | 创建人 | 处理人 | 创建时间 |");
    expect(text).not.toContain("链接 |");
    // 需求名内嵌为 Markdown 超链接，替代裸 URL 列
    expect(text).toContain("| 1 | 9 | [登录优化](https://www.tapd.cn/tapd_fe/1/story/detail/9) |");
    // 创建时间保留完整时分秒
    expect(text).toContain("2026-06-11 16:50:49");
    expect(text).toContain("赵六");
  });

  it("聚合查询有结果：标题带项目覆盖数，表格含项目列、需求名内嵌超链接", () => {
    const story = normalizeStory(
      { id: "9", name: "登录优化", status: "developing", creator: "王五", owner: "赵六", created: "2026-06-11 16:50:49" } as never,
      "1"
    );
    const aggregation: TapdWorkspaceAggregationMeta = {
      total: 2,
      succeeded: 1,
      failed: 1,
      workspaceNames: { "1": "A" },
      failedWorkspaces: [{ id: "2", name: "B", reason: "超时" }],
    };
    const text = formatStoryList([story], { aggregation });
    expect(text).toContain("找到 1 个需求（覆盖 1/2 个项目，1 个查询失败）：");
    // 聚合时表格多出「项目」列，展示 名称（id）
    expect(text).toContain("| 序号 | id | 需求 | 项目 | 状态 | 创建人 | 处理人 | 创建时间 |");
    expect(text).toContain("| 1 | 9 | [登录优化](http");
    expect(text).toContain("A（1）");
    expect(text).toContain("⚠️ 以下 1 个项目查询失败");
  });
});

describe("formatWorkspaceList", () => {
  it("空列表回退文案", () => {
    expect(formatWorkspaceList([])).toBe("未找到该用户参与的 TAPD 项目。");
  });

  it("非空列表带 workspace_id 使用提示", () => {
    const text = formatWorkspaceList([
      { id: "1", name: "项目A", status: "normal", created: "2026-01-01", url: "http://x", isOrganization: false } as never,
    ]);
    expect(text).toContain("找到 1 个参与的 TAPD 项目");
    expect(text).toContain("[1] 项目A");
  });
});

describe("formatBugChangeList", () => {
  it("空列表回退文案", () => {
    expect(formatBugChangeList([])).toBe("未找到符合条件的 bug 变更历史。");
  });

  it("status 变更渲染为「中文（英文）」，非 status 字段原样展示", () => {
    // 用真实归一化器生成基础变更，再补 client 侧富化的中文名 label（spread-and-extend），
    // 避免手写字面量与 normalizeBugChange 的真实输出脱节。
    const statusChange = {
      ...normalizeBugChange(
        {
          id: "c1",
          bug_id: "9",
          author: "tester",
          created: "2026-06-01",
          change_field: "status",
          field_label: "状态",
          value_before: "open",
          value_after: "resolved",
        } as never,
        "20"
      ),
      oldValueLabel: "新建",
      newValueLabel: "已解决",
    };
    const text = formatBugChangeList([statusChange]);
    expect(text).toContain("找到 1 条 bug 变更历史：");
    expect(text).toContain("新建（open） => 已解决（resolved）");
  });

  it("含结构化 fieldChanges 时展开字段详情", () => {
    const change = normalizeBugChange(
      {
        id: "c2",
        bug_id: "9",
        author: "tester",
        created: "2026-06-01",
        change_field: "custom",
        field_label: "多字段",
        memo: "备注X",
        field_changes: JSON.stringify([{ field: "status", value_before: "a", value_after: "b" }]),
      } as never,
      "20"
    );
    const text = formatBugChangeList([change]);
    expect(text).toContain("字段详情:");
    expect(text).toContain("a => b");
    expect(text).toContain("说明: 备注X");
  });
});

describe("formatStoryChangeList", () => {
  it("空列表回退文案", () => {
    expect(formatStoryChangeList([])).toBe("未找到符合条件的需求变更历史。");
  });

  it("非空展示需求 id 与变更字段", () => {
    const change = normalizeStoryChange(
      {
        id: "s1",
        story_id: "5",
        creator: "王五",
        created: "2026-06-01",
        change_field: "status",
        old_value: "open",
        new_value: "done",
      } as never,
      "20"
    );
    const text = formatStoryChangeList([change]);
    expect(text).toContain("找到 1 条需求变更历史：");
    expect(text).toContain("需求: 5");
    expect(text).toContain("open => done");
  });
});

describe("formatIterationList", () => {
  it("空列表回退文案", () => {
    expect(formatIterationList([])).toBe("未找到符合条件的迭代。");
  });

  it("无起止日期时周期显示「未设置」", () => {
    const text = formatIterationList([
      { id: "1", name: "Sprint 1", status: "open", startdate: "", enddate: "", creator: "u" } as never,
    ]);
    expect(text).toContain("[1] Sprint 1");
    expect(text).toContain("周期: 未设置");
  });
});

describe("formatStoryTestCaseList", () => {
  it("空列表回退文案", () => {
    expect(formatStoryTestCaseList([])).toBe("未找到该需求关联的测试用例。");
  });

  it("非空展示用例 id/状态/优先级", () => {
    const text = formatStoryTestCaseList([
      { id: "t1", name: "登录用例", status: "normal", priority: "High", type: "功能", categoryId: "0" } as never,
    ]);
    expect(text).toContain("[t1] 登录用例");
    expect(text).toContain("优先级: High");
  });
});

describe("formatWorkspaceUsers", () => {
  it("空列表回退文案", () => {
    expect(formatWorkspaceUsers([])).toBe("未找到匹配的 TAPD 项目成员。");
  });

  it("isActive 渲染为「有效」，展示 nick 与邮箱", () => {
    const text = formatWorkspaceUsers([
      { nick: "tester", name: "测试员", email: "t@x.com", status: "1", isActive: true } as never,
    ]);
    expect(text).toContain("测试员 (tester)");
    expect(text).toContain("状态: 有效");
    expect(text).toContain("邮箱: t@x.com");
  });
});

// 详情渲染：构造含空媒体/附件/评论的最小详情对象
const makeBugDetail = () => ({
  ...normalizeBug({ id: "1", title: "登录失败", status: "open", current_owner: "u", reporter: "r" } as never, "1"),
  mediaReferences: [],
  attachments: [],
  comments: [],
});

describe("formatBugDetail / formatBugDetails", () => {
  it("单条详情包含标题、状态行与空媒体/附件/评论提示", () => {
    const text = formatBugDetail(makeBugDetail() as never);
    expect(text).toContain("# [1] 登录失败");
    expect(text).toContain("- 状态: open");
    expect(text).toContain("未发现描述或评论中的图片、视频、链接引用。");
    expect(text).toContain("未找到附件。");
  });

  it("批量详情给出成功/失败统计并渲染失败段", () => {
    const text = formatBugDetails([
      { bugId: "1", bug: makeBugDetail() as never },
      { bugId: "2", error: "无权限" },
    ]);
    expect(text).toContain("共请求 2 个 bug，成功 1 个，失败 1 个。");
    expect(text).toContain("# [2] 获取失败");
    expect(text).toContain("无权限");
  });
});

const makeStoryDetail = () => ({
  ...normalizeStory({ id: "5", name: "需求A", status: "open", owner: "o", creator: "c" } as never, "1"),
  mediaReferences: [],
  attachments: [],
  comments: [],
});

describe("formatStoryDetail / formatStoryDetails", () => {
  it("单条需求详情对齐 bug 详情结构", () => {
    const text = formatStoryDetail(makeStoryDetail() as never);
    expect(text).toContain("# [5] 需求A");
    expect(text).toContain("- 负责人: o");
  });

  it("批量需求详情统计成功/失败", () => {
    const text = formatStoryDetails([
      { storyId: "5", story: makeStoryDetail() as never },
      { storyId: "6", error: "不存在" },
    ]);
    expect(text).toContain("共请求 2 个需求，成功 1 个，失败 1 个。");
    expect(text).toContain("# [6] 获取失败");
  });
});
