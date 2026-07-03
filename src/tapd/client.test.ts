import { describe, it, expect, vi, beforeEach } from "vitest";

// 工厂自动 mock api.ts 全部导出（每个导出变为 vi.fn()）。
vi.mock("./api.js");
import * as api from "./api.js";
import {
  appendBugDescriptionImage,
  createBug,
  createStory,
  getBug,
  getStory,
  listBugChanges,
  listBugs,
  listIterations,
  listStories,
  listStoryChanges,
  listStoryTestCases,
  listWorkspaces,
  resetTapdCaches,
  searchWorkspaceUsers,
  uploadBugAttachment,
  uploadBugImage,
  writeback,
  writebackStory,
} from "./client.js";

// 构造 TAPD 成功响应信封。mock 载荷只给用例关心的字段，类型差异在此统一收敛。
const tapdOk = (data: unknown) => ({ status: 1, data }) as never;

beforeEach(() => {
  vi.resetAllMocks(); // 清空 auto-mock 的调用历史与上个用例残留的实现
  resetTapdCaches(); // 清空 client 模块级缓存（cachedCurrentUser / cachedWorkflowStatuses…）
  vi.mocked(api.fetchCurrentUser).mockResolvedValue(
    tapdOk({ id: "1", name: "测试", nick: "tester" })
  );
  // 大多数读取路径都会经过 withStatusLabels → getWorkflowStatusMap，默认给空枚举避免真实请求。
  vi.mocked(api.fetchWorkflowStatusMap).mockResolvedValue(tapdOk({}));
});

describe("listBugs", () => {
  it("跨项目聚合：单个项目失败不影响整体，并记入 failedWorkspaces", async () => {
    vi.mocked(api.fetchUserParticipantProjects).mockResolvedValue(
      tapdOk([{ Workspace: { id: "1", name: "A" } }, { Workspace: { id: "2", name: "B" } }])
    );
    vi.mocked(api.fetchBugs)
      .mockResolvedValueOnce(tapdOk([{ Bug: { id: "1", modified: "2026-06-01" } }]))
      .mockRejectedValueOnce(new Error("限流"));

    const { bugs, aggregation } = await listBugs({});

    expect(bugs).toHaveLength(1);
    expect(aggregation?.total).toBe(2);
    expect(aggregation?.failed).toBe(1);
    expect(aggregation?.failedWorkspaces[0]).toMatchObject({ id: "2", name: "B", reason: "限流" });
  });

  it("单项目查询返回该项目缺陷列表", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(
      tapdOk([{ Bug: { id: "5", title: "崩溃", modified: "2026-06-01" } }])
    );

    const { bugs, aggregation } = await listBugs({ workspace_id: "59787500" });

    expect(aggregation).toBeUndefined(); // 单项目不返回聚合元数据
    expect(bugs[0]).toMatchObject({ id: "5", title: "崩溃" });
  });

  it("传 id 且未显式指定 current_owner 时不附加处理人过滤", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "888" } }]));

    await listBugs({ id: "888", workspace_id: "59787500" });

    const params = vi.mocked(api.fetchBugs).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("id")).toBe("888");
    expect(params.get("current_owner")).toBeNull();
  });

  it("按 story_id 查关联缺陷时不附加处理人过滤（返回全部处理人的缺陷）", async () => {
    vi.mocked(api.fetchStoryRelatedBugs).mockResolvedValue(tapdOk([{ bug_id: "1" }]));
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "1" } }]));

    await listBugs({ story_id: "100", workspace_id: "59787500" });

    const params = vi.mocked(api.fetchBugs).mock.calls[0]![0] as URLSearchParams;
    // story_id 解析为关联缺陷 ID 后按 id 查询，关键是不附加 current_owner（不漏他人名下缺陷）
    expect(params.get("current_owner")).toBeNull();
  });

  it("按 story_id 查关联缺陷但显式指定 current_owner 时，仍按该处理人过滤（取交集）", async () => {
    vi.mocked(api.fetchStoryRelatedBugs).mockResolvedValue(tapdOk([{ bug_id: "1" }]));
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "1" } }]));

    await listBugs({ story_id: "100", current_owner: "alice", workspace_id: "59787500" });

    const params = vi.mocked(api.fetchBugs).mock.calls[0]![0] as URLSearchParams;
    // 显式 current_owner 优先于 story_id 的“不限处理人”默认，仍会附加该处理人过滤
    expect(params.get("current_owner")).toContain("alice");
  });

  it("透传高价值过滤字段与自定义字段", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "1" } }]));

    await listBugs({
      workspace_id: "59787500",
      severity: "fatal",
      v_status: "已解决",
      iteration_id: "1001",
      te: "qa1",
      resolved: ">2026-01-01",
      custom_fields: { custom_field_1: "x" },
    });

    const params = vi.mocked(api.fetchBugs).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("severity")).toBe("fatal");
    expect(params.get("v_status")).toBe("已解决");
    expect(params.get("iteration_id")).toBe("1001");
    expect(params.get("te")).toBe("qa1");
    expect(params.get("resolved")).toBe(">2026-01-01");
    expect(params.get("custom_field_1")).toBe("x");
  });

  it("透传 get_bugs 长尾过滤维度（版本/基线/环境/流转时间等）", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "1" } }]));

    await listBugs({
      workspace_id: "59787500",
      release_id: "301",
      version_fix: "v2",
      baseline_close: "b1",
      fixer: "dev1",
      os: "iOS",
      testtype: "功能测试",
      in_progress_time: ">2026-01-01",
    });

    const params = vi.mocked(api.fetchBugs).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("release_id")).toBe("301");
    expect(params.get("version_fix")).toBe("v2");
    expect(params.get("baseline_close")).toBe("b1");
    expect(params.get("fixer")).toBe("dev1");
    expect(params.get("os")).toBe("iOS");
    expect(params.get("testtype")).toBe("功能测试");
    expect(params.get("in_progress_time")).toBe(">2026-01-01");
  });

  it("order 可覆盖默认 modified desc", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "1" } }]));

    await listBugs({ workspace_id: "59787500", order: "created desc" });

    const params = vi.mocked(api.fetchBugs).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("order")).toBe("created desc");
  });

  it("不传 order 时保持默认 modified desc", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "1" } }]));

    await listBugs({ workspace_id: "59787500" });

    const params = vi.mocked(api.fetchBugs).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("order")).toBe("modified desc");
  });

  it("custom_fields 含非命名空间前缀的 key 时抛错且不发请求", async () => {
    await expect(
      listBugs({ workspace_id: "59787500", custom_fields: { id: "999" } })
    ).rejects.toThrow(/不合法/);
    expect(vi.mocked(api.fetchBugs)).not.toHaveBeenCalled();
  });
});

describe("getBug", () => {
  it("聚合评论/附件/媒体，空上下文时返回空数组", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(
      tapdOk([{ Bug: { id: "9", title: "登录失败", description: "纯文本无媒体" } }])
    );
    vi.mocked(api.fetchComments).mockResolvedValue(tapdOk([]));
    vi.mocked(api.fetchAttachments).mockResolvedValue(tapdOk([]));

    const detail = await getBug("9", "59787500");

    expect(detail).toMatchObject({ id: "9", title: "登录失败" });
    expect(detail.comments).toEqual([]);
    expect(detail.attachments).toEqual([]);
    expect(detail.mediaReferences).toEqual([]);
  });

  it("描述含图片、带附件时补齐下载链接", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(
      tapdOk([{ Bug: { id: "9", title: "x", description: '<img src="/tfl/a.png">' } }])
    );
    vi.mocked(api.fetchComments).mockResolvedValue(tapdOk([]));
    vi.mocked(api.fetchAttachments).mockResolvedValue(
      tapdOk([{ Attachment: { id: "att1", filename: "f.png" } }])
    );
    vi.mocked(api.fetchAttachmentDownload).mockResolvedValue(
      tapdOk({ Attachment: { download_url: "https://dl/att1" } })
    );
    vi.mocked(api.fetchImageDownload).mockResolvedValue(
      tapdOk({ Attachment: { download_url: "https://dl/img", filename: "a.png" } })
    );

    const detail = await getBug("9", "59787500");

    expect(detail.attachments[0]).toMatchObject({ id: "att1", downloadUrl: "https://dl/att1" });
    expect(detail.mediaReferences[0]).toMatchObject({ kind: "image", downloadUrl: "https://dl/img" });
  });

  it("bug 不存在时抛出带 id/workspace 的错误", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([]));

    await expect(getBug("404", "59787500")).rejects.toThrow(/未找到/);
  });
});

describe("getStory", () => {
  it("聚合需求详情，返回评论/附件/媒体", async () => {
    vi.mocked(api.fetchStories).mockResolvedValue(
      tapdOk([{ Story: { id: "5", name: "需求A", description: "无媒体" } }])
    );
    vi.mocked(api.fetchComments).mockResolvedValue(tapdOk([]));
    vi.mocked(api.fetchAttachments).mockResolvedValue(tapdOk([]));

    const detail = await getStory("5", "59787500");

    expect(detail).toMatchObject({ id: "5", name: "需求A" });
    expect(detail.comments).toEqual([]);
  });
});

describe("listStories", () => {
  it("跨项目聚合容错", async () => {
    vi.mocked(api.fetchUserParticipantProjects).mockResolvedValue(
      tapdOk([{ Workspace: { id: "1", name: "A" } }, { Workspace: { id: "2", name: "B" } }])
    );
    vi.mocked(api.fetchStories)
      .mockResolvedValueOnce(tapdOk([{ Story: { id: "1", modified: "2026-06-01" } }]))
      .mockRejectedValueOnce(new Error("超时"));

    const { stories, aggregation } = await listStories({});

    expect(stories).toHaveLength(1);
    expect(aggregation?.failedWorkspaces[0]).toMatchObject({ id: "2", reason: "超时" });
  });

  it("传 id 时不附加 owner 过滤", async () => {
    vi.mocked(api.fetchStories).mockResolvedValue(tapdOk([{ Story: { id: "7" } }]));

    await listStories({ id: "7", workspace_id: "59787500" });

    const params = vi.mocked(api.fetchStories).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("id")).toBe("7");
    expect(params.get("owner")).toBeNull();
  });

  it("透传高价值过滤字段、布尔开关映射 0/1、自定义字段", async () => {
    vi.mocked(api.fetchStories).mockResolvedValue(tapdOk([{ Story: { id: "9" } }]));

    await listStories({
      workspace_id: "59787500",
      iteration_id: "1001",
      module: "支付",
      v_status: "已实现",
      include_sub_iteration: true,
      include_leaf_stories: false,
      ancestor_id: "5",
      custom_fields: { custom_field_1: "abc", custom_field_2: 3 },
    });

    const params = vi.mocked(api.fetchStories).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("iteration_id")).toBe("1001");
    expect(params.get("module")).toBe("支付");
    expect(params.get("v_status")).toBe("已实现");
    expect(params.get("include_sub_iteration")).toBe("1");
    expect(params.get("include_leaf_stories")).toBe("0");
    expect(params.get("ancestor_id")).toBe("5");
    expect(params.get("custom_field_1")).toBe("abc");
    expect(params.get("custom_field_2")).toBe("3");
  });

  it("透传 get_stories 长尾过滤维度（feature/tech_risk/工时等）", async () => {
    vi.mocked(api.fetchStories).mockResolvedValue(tapdOk([{ Story: { id: "9" } }]));

    await listStories({
      workspace_id: "59787500",
      feature: "支付",
      tech_risk: "high",
      workitem_type_id: "77",
      release_id: "301",
      developer: "dev1",
      effort: "8",
    });

    const params = vi.mocked(api.fetchStories).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("feature")).toBe("支付");
    expect(params.get("tech_risk")).toBe("high");
    expect(params.get("workitem_type_id")).toBe("77");
    expect(params.get("release_id")).toBe("301");
    expect(params.get("developer")).toBe("dev1");
    expect(params.get("effort")).toBe("8");
  });

  it("order 可覆盖默认 modified desc", async () => {
    vi.mocked(api.fetchStories).mockResolvedValue(tapdOk([{ Story: { id: "9" } }]));

    await listStories({ workspace_id: "59787500", order: "created desc" });

    const params = vi.mocked(api.fetchStories).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("order")).toBe("created desc");
  });

  it("不传 order 时保持默认 modified desc", async () => {
    vi.mocked(api.fetchStories).mockResolvedValue(tapdOk([{ Story: { id: "9" } }]));

    await listStories({ workspace_id: "59787500" });

    const params = vi.mocked(api.fetchStories).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("order")).toBe("modified desc");
  });
});

describe("createBug", () => {
  it("默认以当前用户为报告人，返回归一化缺陷", async () => {
    vi.mocked(api.createBug).mockResolvedValue(
      tapdOk({ Bug: { id: "200", title: "新建缺陷", status: "open" } })
    );

    const result = await createBug({
      title: "新建缺陷",
      description: "desc",
      workspaceId: "59787500",
    });

    expect(result.bug).toMatchObject({ id: "200", title: "新建缺陷" });
    const body = vi.mocked(api.createBug).mock.calls[0]![0] as URLSearchParams;
    expect(body.get("reporter")).toBe("tester");
  });

  it("传 storyId 时创建需求-缺陷关联并回填 relationId", async () => {
    vi.mocked(api.createBug).mockResolvedValue(
      tapdOk({ Bug: { id: "201", title: "x", status: "open" } })
    );
    vi.mocked(api.createRelation).mockResolvedValue(tapdOk({ Relation: { id: "rel1" } }));

    const result = await createBug({
      title: "x",
      description: "d",
      workspaceId: "59787500",
      storyId: "5",
    });

    expect(result.relatedStoryId).toBe("5");
    expect(result.relationId).toBe("rel1");
  });

  it("关联创建失败时保留缺陷并记录 relationError", async () => {
    vi.mocked(api.createBug).mockResolvedValue(
      tapdOk({ Bug: { id: "202", title: "x", status: "open" } })
    );
    vi.mocked(api.createRelation).mockRejectedValue(new Error("关联失败"));

    const result = await createBug({
      title: "x",
      description: "d",
      workspaceId: "59787500",
      storyId: "5",
    });

    expect(result.bug.id).toBe("202");
    expect(result.relationError).toBe("关联失败");
  });

  it("标准字段与自定义字段透传并做 camelCase→snake_case 映射", async () => {
    vi.mocked(api.createBug).mockResolvedValue(
      tapdOk({ Bug: { id: "203", title: "x", status: "open" } })
    );

    await createBug({
      title: "x",
      description: "d",
      workspaceId: "59787500",
      te: "qa1",
      versionFix: "v2",
      iterationId: "1001",
      size: 5,
      customFields: { custom_field_1: "abc" },
    });

    const body = vi.mocked(api.createBug).mock.calls[0]![0] as URLSearchParams;
    expect(body.get("te")).toBe("qa1");
    expect(body.get("version_fix")).toBe("v2");
    expect(body.get("iteration_id")).toBe("1001");
    expect(body.get("size")).toBe("5");
    expect(body.get("custom_field_1")).toBe("abc");
  });

  it("custom_fields 含非命名空间前缀的 key 时抛错且不发请求", async () => {
    await expect(
      createBug({ title: "x", description: "d", workspaceId: "59787500", customFields: { status: "open" } })
    ).rejects.toThrow(/不合法/);
    expect(vi.mocked(api.createBug)).not.toHaveBeenCalled();
    // 校验在函数开头执行，getCurrentUser 也不应被消耗（与 createStory/writeback 一致）。
    expect(vi.mocked(api.fetchCurrentUser)).not.toHaveBeenCalled();
  });
});

describe("createStory", () => {
  it("默认以当前用户为创建人，返回归一化需求", async () => {
    vi.mocked(api.createStory).mockResolvedValue(
      tapdOk({ Story: { id: "300", name: "新需求", status: "open" } })
    );

    const story = await createStory({
      name: "新需求",
      description: "d",
      workspaceId: "59787500",
    });

    expect(story).toMatchObject({ id: "300", name: "新需求" });
    const body = vi.mocked(api.createStory).mock.calls[0]![0] as URLSearchParams;
    expect(body.get("creator")).toBe("tester");
  });

  it("透传标准字段与自定义字段，数值转字符串、camelCase→snake_case 映射", async () => {
    vi.mocked(api.createStory).mockResolvedValue(
      tapdOk({ Story: { id: "301", name: "子需求", status: "open" } })
    );

    await createStory({
      name: "子需求",
      description: "d",
      workspaceId: "59787500",
      parentId: "300",
      label: "前端|紧急",
      businessValue: 8,
      due: "2026-07-01",
      techRisk: "高",
      workitemTypeId: "1001",
      customFields: { custom_field_1: "abc", "cus_预算": 100 },
    });

    const body = vi.mocked(api.createStory).mock.calls[0]![0] as URLSearchParams;
    expect(body.get("parent_id")).toBe("300");
    expect(body.get("label")).toBe("前端|紧急");
    expect(body.get("business_value")).toBe("8");
    expect(body.get("due")).toBe("2026-07-01");
    expect(body.get("tech_risk")).toBe("高");
    expect(body.get("workitem_type_id")).toBe("1001");
    expect(body.get("custom_field_1")).toBe("abc");
    expect(body.get("cus_预算")).toBe("100");
  });

  it("owners 经 formatOwners 拼成分号结尾字符串", async () => {
    vi.mocked(api.createStory).mockResolvedValue(
      tapdOk({ Story: { id: "302", name: "x", status: "open" } })
    );

    await createStory({
      name: "x",
      description: "d",
      workspaceId: "59787500",
      owners: ["alice", "bob"],
    });

    const body = vi.mocked(api.createStory).mock.calls[0]![0] as URLSearchParams;
    expect(body.get("owner")).toBe("alice;bob;");
  });

  it("模板字段 templated_id/apply_template/is_apply_template_default_value 透传", async () => {
    vi.mocked(api.createStory).mockResolvedValue(
      tapdOk({ Story: { id: "303", name: "x", status: "open" } })
    );

    await createStory({
      name: "x",
      description: "d",
      workspaceId: "59787500",
      templatedId: "77",
      applyTemplate: "preset_stories,preset_tasks",
      isApplyTemplateDefaultValue: 1,
    });

    const body = vi.mocked(api.createStory).mock.calls[0]![0] as URLSearchParams;
    expect(body.get("templated_id")).toBe("77");
    expect(body.get("apply_template")).toBe("preset_stories,preset_tasks");
    expect(body.get("is_apply_template_default_value")).toBe("1");
  });
});

describe("listBugChanges", () => {
  it("bug_id、created 与 id 都缺失时抛错", async () => {
    await expect(listBugChanges({ workspace_id: "59787500" })).rejects.toThrow(
      "bug_id、created 和 id 至少需要提供一个"
    );
  });

  it("status 变更补齐前后值中文名", async () => {
    vi.mocked(api.fetchWorkflowStatusMap).mockResolvedValue(
      tapdOk({ open: "新建", resolved: "已解决" })
    );
    vi.mocked(api.fetchBugChanges).mockResolvedValue(
      tapdOk([
        {
          BugChange: {
            id: "c1",
            bug_id: "9",
            change_field: "status",
            value_before: "open",
            value_after: "resolved",
          },
        },
      ])
    );

    const changes = await listBugChanges({ bug_id: "9", workspace_id: "59787500" });

    expect(changes[0]).toMatchObject({
      fieldKey: "status",
      oldValueLabel: "新建",
      newValueLabel: "已解决",
    });
  });

  it("仅传 id 时按变更记录 id 定位，并透传 order/include_add_bug", async () => {
    vi.mocked(api.fetchBugChanges).mockResolvedValue(tapdOk([]));

    await listBugChanges({
      id: "555",
      workspace_id: "59787500",
      order: "created desc",
      include_add_bug: true,
    });

    const params = vi.mocked(api.fetchBugChanges).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("id")).toBe("555");
    expect(params.get("order")).toBe("created desc");
    expect(params.get("include_add_bug")).toBe("1");
    expect(params.get("bug_id")).toBeNull();
  });
});

describe("listStoryChanges", () => {
  it("story_id、created 与 id 都缺失时抛错", async () => {
    await expect(listStoryChanges({ workspace_id: "59787500" })).rejects.toThrow(
      "story_id、created 和 id 至少需要提供一个"
    );
  });

  it("正常解析需求变更，include_details 映射 need_parse_changes", async () => {
    vi.mocked(api.fetchStoryChanges).mockResolvedValue(
      tapdOk([{ WorkitemChange: { id: "s1", story_id: "5", change_field: "status" } }])
    );

    const changes = await listStoryChanges({
      story_id: "5",
      workspace_id: "59787500",
      include_details: true,
    });

    expect(changes[0]).toMatchObject({ id: "s1", storyId: "5" });
    const params = vi.mocked(api.fetchStoryChanges).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("need_parse_changes")).toBe("1");
  });

  it("仅传 id 也可查询，并透传 change_type/order", async () => {
    vi.mocked(api.fetchStoryChanges).mockResolvedValue(
      tapdOk([{ WorkitemChange: { id: "s2", story_id: "5" } }])
    );

    await listStoryChanges({
      id: "s2",
      workspace_id: "59787500",
      change_type: "status",
      order: "created desc",
    });

    const params = vi.mocked(api.fetchStoryChanges).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("id")).toBe("s2");
    expect(params.get("change_type")).toBe("status");
    expect(params.get("order")).toBe("created desc");
    expect(params.get("story_id")).toBeNull();
  });
});

describe("listIterations", () => {
  it("归一化迭代列表", async () => {
    vi.mocked(api.fetchIterations).mockResolvedValue(
      tapdOk([{ Iteration: { id: "i1", name: "Sprint 1", status: "open" } }])
    );

    const iterations = await listIterations({ workspace_id: "59787500" });

    expect(iterations[0]).toMatchObject({ id: "i1", name: "Sprint 1" });
  });

  it("透传过滤维度、自定义字段并翻页", async () => {
    vi.mocked(api.fetchIterations).mockResolvedValue(tapdOk([{ Iteration: { id: "i1" } }]));

    await listIterations({
      workspace_id: "59787500",
      creator: "alice",
      startdate: ">2026-01-01",
      workitem_type_id: "77",
      page: 2,
      custom_fields: { custom_field_1: "x" },
    });

    const params = vi.mocked(api.fetchIterations).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("creator")).toBe("alice");
    expect(params.get("startdate")).toBe(">2026-01-01");
    expect(params.get("workitem_type_id")).toBe("77");
    expect(params.get("page")).toBe("2");
    expect(params.get("custom_field_1")).toBe("x");
  });

  it("order 可覆盖默认 modified desc，不传时保持默认", async () => {
    vi.mocked(api.fetchIterations).mockResolvedValue(tapdOk([{ Iteration: { id: "i1" } }]));

    await listIterations({ workspace_id: "59787500", order: "created desc" });
    expect((vi.mocked(api.fetchIterations).mock.calls[0]![0] as URLSearchParams).get("order")).toBe("created desc");

    await listIterations({ workspace_id: "59787500" });
    expect((vi.mocked(api.fetchIterations).mock.calls[1]![0] as URLSearchParams).get("order")).toBe("modified desc");
  });

  it("custom_fields 含非命名空间前缀的 key 时抛错且不发请求", async () => {
    await expect(
      listIterations({ workspace_id: "59787500", custom_fields: { id: "999" } })
    ).rejects.toThrow(/不合法/);
    expect(vi.mocked(api.fetchIterations)).not.toHaveBeenCalled();
  });
});

describe("listStoryTestCases", () => {
  it("关系接口拿 tcase_id 后二次查询补齐用例详情", async () => {
    vi.mocked(api.fetchStoryTestCaseRelations).mockResolvedValue(
      tapdOk([
        {
          TestPlanStoryTcaseRelation: {
            id: "r1",
            tcase_id: "t1",
            story_id: "5",
            test_plan_id: "0",
          },
        },
      ])
    );
    vi.mocked(api.fetchTestCases).mockResolvedValue(
      tapdOk([{ Tcase: { id: "t1", name: "登录用例", status: "normal" } }])
    );

    const testCases = await listStoryTestCases({ storyId: "5", workspaceId: "59787500" });

    expect(testCases[0]).toMatchObject({ id: "t1", name: "登录用例", storyId: "5", relationId: "r1" });
  });

  it("无关联关系时返回空数组且不二次查询", async () => {
    vi.mocked(api.fetchStoryTestCaseRelations).mockResolvedValue(tapdOk([]));

    const testCases = await listStoryTestCases({ storyId: "5", workspaceId: "59787500" });

    expect(testCases).toEqual([]);
    expect(vi.mocked(api.fetchTestCases)).not.toHaveBeenCalled();
  });
});

describe("uploadBugImage", () => {
  it("返回 html_code 与 imageSrc", async () => {
    vi.mocked(api.uploadImage).mockResolvedValue(
      tapdOk({ html_code: '<img src="x">', image_src: "/tfl/x.png" })
    );

    const result = await uploadBugImage({
      workspaceId: "59787500",
      fileBase64: "data:image/png;base64,AAAA",
      filename: "x.png",
    });

    expect(result).toMatchObject({ htmlCode: '<img src="x">', imageSrc: "/tfl/x.png" });
  });

  it("未返回 html_code 时抛错", async () => {
    vi.mocked(api.uploadImage).mockResolvedValue(tapdOk({}));

    await expect(
      uploadBugImage({ workspaceId: "59787500", fileBase64: "AAAA", filename: "x.png" })
    ).rejects.toThrow(/html_code/);
  });
});

describe("appendBugDescriptionImage", () => {
  it("上传图片后读取原描述并追加 html_code 回写", async () => {
    vi.mocked(api.uploadImage).mockResolvedValue(tapdOk({ html_code: "<img>", image_src: "/x" }));
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "9", description: "原描述" } }]));
    vi.mocked(api.updateBug).mockResolvedValue(tapdOk({}));

    const result = await appendBugDescriptionImage({
      bugId: "9",
      workspaceId: "59787500",
      fileBase64: "AAAA",
      filename: "x.png",
    });

    expect(result.descriptionUpdated).toBe(true);
    const body = vi.mocked(api.updateBug).mock.calls[0]![0] as URLSearchParams;
    expect(body.get("description")).toBe("原描述<img>"); // 追加而非覆盖
  });
});

describe("writeback（bug）", () => {
  it("评论成功、非法状态被拒时 partialFailure 为 true 且不写入状态", async () => {
    vi.mocked(api.createComment).mockResolvedValue(tapdOk({ Comment: { id: "c1" } }));
    vi.mocked(api.fetchWorkflowStatusMap).mockResolvedValue(
      tapdOk({ open: "新建", resolved: "已解决" })
    );

    const result = await writeback({
      bugId: "123",
      workspaceId: "59787500",
      comment: "fix commit abc",
      targetStatus: "invalid_status",
    });

    expect(result.commentCreated).toBe(true);
    expect(result.statusUpdated).toBe(false);
    expect(result.partialFailure).toBe(true);
    expect(result.statusUpdateError).toContain("不在项目工作流");
    expect(vi.mocked(api.updateBug)).not.toHaveBeenCalled();
  });

  it("append 处理人模式先读当前处理人并去重，写回以分号结尾", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(
      tapdOk([{ Bug: { id: "123", current_owner: "alice;" } }])
    );
    vi.mocked(api.updateBug).mockResolvedValue(tapdOk({}));

    const result = await writeback({
      bugId: "123",
      workspaceId: "59787500",
      targetOwners: ["alice", "bob"],
      ownerUpdateMode: "append",
    });

    expect(result.ownerUpdated).toBe(true);
    expect(result.finalOwners).toEqual(["alice", "bob"]);
    const params = vi.mocked(api.updateBug).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("current_owner")).toBe("alice;bob;");
  });

  it("标准字段聚合为一次更新请求并做 camelCase→snake_case 映射", async () => {
    vi.mocked(api.updateBug).mockResolvedValue(tapdOk({}));

    const result = await writeback({
      bugId: "123",
      workspaceId: "59787500",
      priorityLabel: "High",
      severity: "fatal",
      versionFix: "v2",
      te: "qa1",
      size: 5,
    });

    expect(result.fieldsUpdated).toBe(true);
    expect(result.updatedFields).toEqual(["priority_label", "severity", "version_fix", "te", "size"]);
    // 聚合为单次请求（无 title/description/status/owner）
    expect(vi.mocked(api.updateBug)).toHaveBeenCalledTimes(1);
    const params = vi.mocked(api.updateBug).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("id")).toBe("123");
    expect(params.get("current_user")).toBe("tester");
    expect(params.get("priority_label")).toBe("High");
    expect(params.get("version_fix")).toBe("v2");
    expect(params.get("size")).toBe("5");
  });

  it("custom_fields 的 key 原样作为 TAPD 字段名透传", async () => {
    vi.mocked(api.updateBug).mockResolvedValue(tapdOk({}));

    const result = await writeback({
      bugId: "123",
      workspaceId: "59787500",
      customFields: { custom_field_1: "abc", "cus_预算": 100 },
    });

    expect(result.fieldsUpdated).toBe(true);
    const params = vi.mocked(api.updateBug).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("custom_field_1")).toBe("abc");
    expect(params.get("cus_预算")).toBe("100");
  });

  it("custom_fields 含非命名空间前缀的 key 时抛错且不发请求（防止撞 id 等保留参数）", async () => {
    await expect(
      writeback({ bugId: "123", workspaceId: "59787500", customFields: { id: "999" } })
    ).rejects.toThrow(/不合法/);
    expect(vi.mocked(api.updateBug)).not.toHaveBeenCalled();
  });

  it("评论传入 root_id/reply_id 时一并提交", async () => {
    vi.mocked(api.createComment).mockResolvedValue(tapdOk({ Comment: { id: "c1" } }));

    const result = await writeback({
      bugId: "123",
      workspaceId: "59787500",
      comment: "回复内容",
      commentRootId: "root1",
      commentReplyId: "reply1",
    });

    expect(result.commentCreated).toBe(true);
    const params = vi.mocked(api.createComment).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("entry_type")).toBe("bug");
    expect(params.get("root_id")).toBe("root1");
    expect(params.get("reply_id")).toBe("reply1");
  });

  it("未传入任何标准/自定义字段时不发起聚合更新请求", async () => {
    vi.mocked(api.createComment).mockResolvedValue(tapdOk({ Comment: { id: "c1" } }));

    const result = await writeback({ bugId: "123", workspaceId: "59787500", comment: "只评论" });

    expect(result.fieldsUpdated).toBeUndefined();
    expect(vi.mocked(api.updateBug)).not.toHaveBeenCalled();
  });
});

describe("writebackStory（需求）", () => {
  it("合法状态写入成功", async () => {
    vi.mocked(api.fetchWorkflowStatusMap).mockResolvedValue(
      tapdOk({ open: "规划中", resolved: "已实现" })
    );
    vi.mocked(api.updateStory).mockResolvedValue(tapdOk({}));

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      targetStatus: "resolved",
    });

    expect(result.statusUpdated).toBe(true);
  });

  it("owner append 模式读取当前处理人并去重写回", async () => {
    vi.mocked(api.fetchStories).mockResolvedValue(tapdOk([{ Story: { id: "5", owner: "alice;" } }]));
    vi.mocked(api.updateStory).mockResolvedValue(tapdOk({}));

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      targetOwners: ["alice", "bob"],
      ownerUpdateMode: "append",
    });

    expect(result.finalOwners).toEqual(["alice", "bob"]);
    const params = vi.mocked(api.updateStory).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("owner")).toBe("alice;bob;");
  });

  it("标准字段聚合为一次更新请求并做 camelCase→snake_case 映射", async () => {
    vi.mocked(api.updateStory).mockResolvedValue(tapdOk({}));

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      name: "新标题",
      priorityLabel: "High",
      iterationId: "1001",
      businessValue: 8,
    });

    expect(result.fieldsUpdated).toBe(true);
    expect(result.updatedFields).toEqual([
      "name",
      "priority_label",
      "business_value",
      "iteration_id",
    ]);
    // 聚合为单次请求
    expect(vi.mocked(api.updateStory)).toHaveBeenCalledTimes(1);
    const params = vi.mocked(api.updateStory).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("id")).toBe("5");
    expect(params.get("current_user")).toBe("tester");
    expect(params.get("name")).toBe("新标题");
    expect(params.get("priority_label")).toBe("High");
    expect(params.get("iteration_id")).toBe("1001");
    expect(params.get("business_value")).toBe("8");
  });

  it("custom_fields 的 key 原样作为 TAPD 字段名透传", async () => {
    vi.mocked(api.updateStory).mockResolvedValue(tapdOk({}));

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      customFields: { custom_field_1: "abc", "cus_预算": 100 },
    });

    expect(result.fieldsUpdated).toBe(true);
    const params = vi.mocked(api.updateStory).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("custom_field_1")).toBe("abc");
    expect(params.get("cus_预算")).toBe("100");
  });

  it("custom_fields 含非命名空间前缀的 key 时抛错且不发请求（防止撞 id 等保留参数）", async () => {
    await expect(
      writebackStory({
        storyId: "5",
        workspaceId: "59787500",
        customFields: { id: "999" },
      })
    ).rejects.toThrow(/不合法/);
    expect(vi.mocked(api.updateStory)).not.toHaveBeenCalled();
  });

  it("评论传入 root_id/reply_id 时一并提交", async () => {
    vi.mocked(api.createComment).mockResolvedValue(tapdOk({ Comment: { id: "c1" } }));

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      comment: "回复内容",
      commentRootId: "root1",
      commentReplyId: "reply1",
    });

    expect(result.commentCreated).toBe(true);
    const params = vi.mocked(api.createComment).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("entry_type")).toBe("stories");
    expect(params.get("root_id")).toBe("root1");
    expect(params.get("reply_id")).toBe("reply1");
  });

  it("未传入任何标准/自定义字段时不发起聚合更新请求", async () => {
    vi.mocked(api.createComment).mockResolvedValue(tapdOk({ Comment: { id: "c1" } }));

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      comment: "只评论",
    });

    expect(result.fieldsUpdated).toBeUndefined();
    expect(vi.mocked(api.updateStory)).not.toHaveBeenCalled();
  });

  it("同时传 target_status 时 is_auto_close_task 并入状态请求而非聚合批次", async () => {
    vi.mocked(api.fetchWorkflowStatusMap).mockResolvedValue(tapdOk({ resolved: "已实现" }));
    vi.mocked(api.updateStory).mockResolvedValue(tapdOk({}));

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      targetStatus: "resolved",
      isAutoCloseTask: 1,
    });

    expect(result.statusUpdated).toBe(true);
    // 只发起状态这一次请求，聚合批次因无其它字段不发起
    expect(vi.mocked(api.updateStory)).toHaveBeenCalledTimes(1);
    const params = vi.mocked(api.updateStory).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("status")).toBe("resolved");
    expect(params.get("is_auto_close_task")).toBe("1");
    expect(result.fieldsUpdated).toBeUndefined();
  });

  it("无 target_status 时单独的 is_auto_close_task 被忽略，不发起任何更新请求", async () => {
    // is_auto_close_task 仅在状态流转时生效，单独提交是 no-op；工具层会直接拦截报错，
    // client 层兜底为「不并入聚合批次、不单独成请求」，避免发出无效请求。
    vi.mocked(api.updateStory).mockResolvedValue(tapdOk({}));

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      isAutoCloseTask: 0,
    });

    expect(result.fieldsUpdated).toBeUndefined();
    expect(vi.mocked(api.updateStory)).not.toHaveBeenCalled();
  });

  it("混合场景：name 进聚合批次、is_auto_close_task 随 status 拆分到两次请求", async () => {
    vi.mocked(api.fetchWorkflowStatusMap).mockResolvedValue(tapdOk({ resolved: "已实现" }));
    vi.mocked(api.updateStory).mockResolvedValue(tapdOk({}));

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      name: "新标题",
      targetStatus: "resolved",
      isAutoCloseTask: 1,
    });

    expect(result.fieldsUpdated).toBe(true);
    expect(result.statusUpdated).toBe(true);
    // 聚合批次 + 状态各一次，共两次请求
    expect(vi.mocked(api.updateStory)).toHaveBeenCalledTimes(2);
    const fieldsParams = vi.mocked(api.updateStory).mock.calls[0]![0] as URLSearchParams;
    expect(fieldsParams.get("name")).toBe("新标题");
    expect(fieldsParams.get("is_auto_close_task")).toBeNull(); // 不混入聚合批次
    const statusParams = vi.mocked(api.updateStory).mock.calls[1]![0] as URLSearchParams;
    expect(statusParams.get("status")).toBe("resolved");
    expect(statusParams.get("is_auto_close_task")).toBe("1");
    expect(statusParams.get("name")).toBeNull();
  });
});

describe("getWorkflowStatusMap 缓存防毒化", () => {
  it("首次枚举失败后再次调用应重新请求（rejected Promise 不被永久缓存）", async () => {
    // listBugChanges 的 withBugChangeStatusLabels 会触发 getWorkflowStatusMap
    vi.mocked(api.fetchBugChanges).mockResolvedValue(
      tapdOk([{ BugChange: { id: "c1", bug_id: "9", change_field: "status", value_before: "a", value_after: "b" } }])
    );
    vi.mocked(api.fetchWorkflowStatusMap)
      .mockRejectedValueOnce(new Error("瞬时故障"))
      .mockResolvedValueOnce(tapdOk({ a: "甲", b: "乙" }));

    // 第一次：枚举失败被静默吞掉，labels 缺失
    const first = await listBugChanges({ bug_id: "9", workspace_id: "59787500" });
    expect(first[0]!.oldValueLabel).toBeUndefined();

    // 第二次：缓存已因失败被清除，重新请求成功并补齐 labels
    const second = await listBugChanges({ bug_id: "9", workspace_id: "59787500" });
    expect(second[0]).toMatchObject({ oldValueLabel: "甲", newValueLabel: "乙" });
    expect(vi.mocked(api.fetchWorkflowStatusMap)).toHaveBeenCalledTimes(2);
  });
});

describe("searchWorkspaceUsers", () => {
  it("按 keyword 匹配 nick/name/email，并按 limit 截断", async () => {
    vi.mocked(api.fetchWorkspaceUsers).mockResolvedValue(
      tapdOk([
        { UserWorkspace: { user: "alice", name: "爱丽丝", email: "a@x.com", status: "1" } },
        { UserWorkspace: { user: "bob", name: "鲍勃", email: "b@y.com", status: "1" } },
      ])
    );

    const matched = await searchWorkspaceUsers({ workspace_id: "59787500", keyword: "爱丽丝" });
    expect(matched).toHaveLength(1);
    expect(matched[0]).toMatchObject({ nick: "alice", isActive: true });

    const limited = await searchWorkspaceUsers({ workspace_id: "59787500", limit: 1 });
    expect(limited).toHaveLength(1); // 无 keyword 返回全部后按 limit 截断
  });

  it("丢弃 user(nick) 为空的成员记录", async () => {
    vi.mocked(api.fetchWorkspaceUsers).mockResolvedValue(
      tapdOk([{ UserWorkspace: { user: "", name: "幽灵" } }, { UserWorkspace: { user: "real" } }])
    );

    const users = await searchWorkspaceUsers({ workspace_id: "59787500" });
    expect(users.map((u) => u.nick)).toEqual(["real"]);
  });
});

describe("listWorkspaces", () => {
  it("默认过滤 organization 条目，只返回可查询的具体项目", async () => {
    vi.mocked(api.fetchUserParticipantProjects).mockResolvedValue(
      tapdOk([
        { Workspace: { id: "1", name: "公司", category: "organization" } },
        { Workspace: { id: "2", name: "项目A", category: "normal" } },
      ])
    );

    const workspaces = await listWorkspaces({ nick: "tester" });
    expect(workspaces.map((w) => w.id)).toEqual(["2"]);
    const params = vi.mocked(api.fetchUserParticipantProjects).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("nick")).toBe("tester"); // nick 透传
  });

  it("include_organization 为 true 时保留 organization 条目", async () => {
    vi.mocked(api.fetchUserParticipantProjects).mockResolvedValue(
      tapdOk([
        { Workspace: { id: "1", name: "公司", category: "organization" } },
        { Workspace: { id: "2", name: "项目A", category: "normal" } },
      ])
    );

    const workspaces = await listWorkspaces({ nick: "tester", include_organization: true });
    expect(workspaces.map((w) => w.id)).toEqual(["1", "2"]);
  });
});

describe("uploadBugAttachment", () => {
  it("上传后归一化返回附件，snake_case 转 camelCase", async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(
      tapdOk({ Attachment: { id: "att9", entry_id: "9", filename: "log.txt", content_type: "text/plain" } })
    );

    const att = await uploadBugAttachment({
      workspaceId: "59787500",
      bugId: "9",
      fileBase64: "data:text/plain;base64,aGVsbG8=",
      filename: "log.txt",
    });

    expect(att).toMatchObject({ id: "att9", entryId: "9", filename: "log.txt" });
  });

  it("未返回 Attachment 时抛错", async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(tapdOk({}));

    await expect(
      uploadBugAttachment({ workspaceId: "59787500", bugId: "9", fileBase64: "AAAA", filename: "x" })
    ).rejects.toThrow(/未返回附件内容/);
  });
});

describe("listBugs（story_id 关联交集）", () => {
  it("传 id 时取「需求关联 bug」与「请求 id」的交集后查询", async () => {
    vi.mocked(api.fetchStoryRelatedBugs).mockResolvedValue(
      tapdOk([{ bug_id: "1" }, { bug_id: "2" }])
    );
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "1" } }]));

    await listBugs({ story_id: "5", id: "1,3", workspace_id: "59787500" });

    const params = vi.mocked(api.fetchBugs).mock.calls[0]![0] as URLSearchParams;
    expect(params.get("id")).toBe("1"); // 仅 1 同时在关联集与请求 id 中（3 被滤除）
  });

  it("交集为空时直接返回空数组，不发起 fetchBugs", async () => {
    vi.mocked(api.fetchStoryRelatedBugs).mockResolvedValue(tapdOk([{ bug_id: "1" }]));

    const { bugs } = await listBugs({ story_id: "5", id: "999", workspace_id: "59787500" });

    expect(bugs).toEqual([]);
    expect(vi.mocked(api.fetchBugs)).not.toHaveBeenCalled();
  });
});

describe("getBug 下载链接单条降级", () => {
  it("附件与内嵌图片下载失败时，保留实体并记录 downloadError，不拖垮整条详情", async () => {
    vi.mocked(api.fetchBugs).mockResolvedValue(
      tapdOk([{ Bug: { id: "9", title: "x", description: '<img src="/tfl/a.png">' } }])
    );
    vi.mocked(api.fetchComments).mockResolvedValue(tapdOk([]));
    vi.mocked(api.fetchAttachments).mockResolvedValue(
      tapdOk([{ Attachment: { id: "att1", filename: "f.png" } }])
    );
    vi.mocked(api.fetchAttachmentDownload).mockRejectedValue(new Error("附件链接失效"));
    vi.mocked(api.fetchImageDownload).mockRejectedValue(new Error("图片链接失效"));

    const detail = await getBug("9", "59787500");

    expect(detail.attachments[0]).toMatchObject({ id: "att1", downloadError: "附件链接失效" });
    expect(detail.attachments[0]!.downloadUrl).toBeUndefined();
    expect(detail.mediaReferences[0]).toMatchObject({ kind: "image", downloadError: "图片链接失效" });
  });
});

describe("appendBugDescriptionImage 描述写入失败路径", () => {
  it("图片已上传但描述回写失败时，标记 descriptionUpdated=false 并保留图片信息", async () => {
    vi.mocked(api.uploadImage).mockResolvedValue(tapdOk({ html_code: "<img>", image_src: "/x" }));
    vi.mocked(api.fetchBugs).mockResolvedValue(tapdOk([{ Bug: { id: "9", description: "原描述" } }]));
    vi.mocked(api.updateBug).mockRejectedValue(new Error("更新被拒"));

    const result = await appendBugDescriptionImage({
      bugId: "9",
      workspaceId: "59787500",
      fileBase64: "AAAA",
      filename: "x.png",
    });

    expect(result.descriptionUpdated).toBe(false);
    expect(result.descriptionUpdateError).toBe("更新被拒");
    expect(result.htmlCode).toBe("<img>"); // 图片已上传，信息不丢
  });
});

describe("writebackStory 非法状态（与 bug 侧对称）", () => {
  it("目标状态不在需求工作流时拒绝写入，partialFailure 为 true", async () => {
    vi.mocked(api.fetchWorkflowStatusMap).mockResolvedValue(
      tapdOk({ open: "规划中", resolved: "已实现" })
    );

    const result = await writebackStory({
      storyId: "5",
      workspaceId: "59787500",
      targetStatus: "bogus",
    });

    expect(result.statusUpdated).toBe(false);
    expect(result.partialFailure).toBe(true);
    expect(result.statusUpdateError).toContain("不在项目工作流");
    expect(vi.mocked(api.updateStory)).not.toHaveBeenCalled();
  });
});
