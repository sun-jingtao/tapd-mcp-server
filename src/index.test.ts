import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// MCP 工具层（src/index.ts）测试：只 mock client 业务层，config/formatters 用真实实现，
// 经 in-memory transport 走完整的「schema 校验 → handler → 文本整形」链路，
// 覆盖 handler 内独有的跨字段必填校验、catch 分支与成功文案拼装。
vi.mock("./tapd/client.js");
import * as client from "./tapd/client.js";
import { normalizeBug, normalizeStory } from "./tapd/utils.js";
import { server } from "./index.js";

// 详情渲染对象：复用真实 normalizer + 空媒体/附件/评论，避免手写字面量与 formatter 期望脱节。
const makeBugDetail = () => ({
  ...normalizeBug({ id: "9", title: "登录失败", status: "open", current_owner: "u", reporter: "r" } as never, "1"),
  mediaReferences: [],
  attachments: [],
  comments: [],
});
const makeStoryDetail = () => ({
  ...normalizeStory({ id: "5", name: "需求A", status: "open", owner: "o", creator: "c" } as never, "1"),
  mediaReferences: [],
  attachments: [],
  comments: [],
});

let mcp: Client;

// server 是模块级单例，只能 connect 一条 transport：整套用例复用同一连接，
// 用例间用 resetAllMocks 隔离 client 返回，而非重连 server。
beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  mcp = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
});

afterAll(async () => {
  await mcp.close();
});

beforeEach(() => {
  vi.resetAllMocks();
});

// callTool 返回 content 为宽松类型，统一在此取首条文本，避免每处断言重复断言转型。
const callText = (res: Awaited<ReturnType<Client["callTool"]>>) =>
  (res.content as Array<{ type: string; text: string }>)[0]!.text;

describe("读取类工具：成功透传 formatter 输出", () => {
  it("tapd_list_bugs 透传空列表文案", async () => {
    vi.mocked(client.listBugs).mockResolvedValue({ bugs: [] } as never);
    const res = await mcp.callTool({ name: "tapd_list_bugs", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("未找到符合条件的缺陷");
  });

  it("tapd_list_bugs client 抛错时收敛为 查询失败 并标记 isError", async () => {
    vi.mocked(client.listBugs).mockRejectedValue(new Error("限流"));
    const res = await mcp.callTool({ name: "tapd_list_bugs", arguments: {} });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("查询失败：限流");
  });

  it("tapd_list_workspaces 透传空列表文案", async () => {
    vi.mocked(client.listWorkspaces).mockResolvedValue([] as never);
    const res = await mcp.callTool({ name: "tapd_list_workspaces", arguments: {} });
    expect(callText(res)).toContain("未找到该用户参与的 TAPD 项目");
  });

  it("tapd_list_stories 透传空列表文案", async () => {
    vi.mocked(client.listStories).mockResolvedValue({ stories: [] } as never);
    const res = await mcp.callTool({ name: "tapd_list_stories", arguments: {} });
    expect(callText(res)).toContain("未找到符合条件的需求");
  });

  it("tapd_list_iterations 透传空列表文案", async () => {
    vi.mocked(client.listIterations).mockResolvedValue([] as never);
    const res = await mcp.callTool({ name: "tapd_list_iterations", arguments: { workspace_id: "1" } });
    expect(callText(res)).toContain("未找到符合条件的迭代");
  });

  it("tapd_list_story_test_cases 透传空列表文案", async () => {
    vi.mocked(client.listStoryTestCases).mockResolvedValue([] as never);
    const res = await mcp.callTool({
      name: "tapd_list_story_test_cases",
      arguments: { story_id: "5", workspace_id: "1" },
    });
    expect(callText(res)).toContain("未找到该需求关联的测试用例");
  });

  it("tapd_search_users 透传空列表文案", async () => {
    vi.mocked(client.searchWorkspaceUsers).mockResolvedValue([] as never);
    const res = await mcp.callTool({
      name: "tapd_search_users",
      arguments: { workspace_id: "1" },
    });
    expect(callText(res)).toContain("未找到匹配的 TAPD 项目成员");
  });
});

describe("变更历史工具：handler 内二选一必填校验", () => {
  it("tapd_list_bug_changes 缺 bug_id、created 与 id 时直接 isError（不调 client）", async () => {
    const res = await mcp.callTool({ name: "tapd_list_bug_changes", arguments: { workspace_id: "1" } });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("bug_id、created 和 id 至少需要提供一个");
    expect(vi.mocked(client.listBugChanges)).not.toHaveBeenCalled();
  });

  it("tapd_list_bug_changes 传 bug_id 时正常查询", async () => {
    vi.mocked(client.listBugChanges).mockResolvedValue([] as never);
    const res = await mcp.callTool({
      name: "tapd_list_bug_changes",
      arguments: { bug_id: "9", workspace_id: "1" },
    });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("未找到符合条件的 bug 变更历史");
  });

  it("tapd_list_story_changes 缺 story_id、created 与 id 时直接 isError", async () => {
    const res = await mcp.callTool({ name: "tapd_list_story_changes", arguments: { workspace_id: "1" } });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("story_id、created 和 id 至少需要提供一个");
  });

  it("tapd_list_story_changes 传 story_id + include_details 正常查询", async () => {
    vi.mocked(client.listStoryChanges).mockResolvedValue([] as never);
    const res = await mcp.callTool({
      name: "tapd_list_story_changes",
      arguments: { story_id: "5", workspace_id: "1", include_details: true },
    });
    expect(callText(res)).toContain("未找到符合条件的需求变更历史");
  });
});

describe("批量详情工具：workspace 预校验与全失败聚合", () => {
  it("tapd_get_bugs 去重并发查询，渲染批量详情", async () => {
    vi.mocked(client.getBug).mockResolvedValue(makeBugDetail() as never);
    const res = await mcp.callTool({
      name: "tapd_get_bugs",
      arguments: { bug_ids: ["9", "9"], workspace_id: "20" },
    });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("共请求 1 个 bug，成功 1 个");
    expect(vi.mocked(client.getBug)).toHaveBeenCalledTimes(1); // 去重生效
  });

  it("tapd_get_bugs 全部失败时 isError 为 true", async () => {
    vi.mocked(client.getBug).mockRejectedValue(new Error("无权限"));
    const res = await mcp.callTool({
      name: "tapd_get_bugs",
      arguments: { bug_ids: ["9"], workspace_id: "20" },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("无权限");
  });

  it("tapd_get_bugs workspace_id 为纯空白时预校验失败、不触达 getBug", async () => {
    const res = await mcp.callTool({
      name: "tapd_get_bugs",
      arguments: { bug_ids: ["9"], workspace_id: "   " },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("缺少 TAPD 项目 ID");
    expect(vi.mocked(client.getBug)).not.toHaveBeenCalled();
  });

  it("tapd_get_stories 渲染批量需求详情", async () => {
    vi.mocked(client.getStory).mockResolvedValue(makeStoryDetail() as never);
    const res = await mcp.callTool({
      name: "tapd_get_stories",
      arguments: { story_ids: ["5"], workspace_id: "20" },
    });
    expect(callText(res)).toContain("共请求 1 个需求，成功 1 个");
  });
});

describe("创建类工具：成功文案与 catch 分支", () => {
  it("tapd_create_bug 成功并展示关联需求信息", async () => {
    vi.mocked(client.createBug).mockResolvedValue({
      bug: { id: "200", title: "新建缺陷", status: "open", currentOwner: "tester", url: "http://x/200" },
      relatedStoryId: "5",
      relationId: "rel1",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_create_bug",
      arguments: { title: "新建缺陷", description: "d", workspace_id: "20", confirmed: true },
    });
    expect(res.isError).toBeFalsy();
    const text = callText(res);
    expect(text).toContain("bug 创建成功");
    expect(text).toContain("- ID: 200");
    expect(text).toContain("关联需求: 5 | 关联 ID: rel1");
  });

  it("tapd_create_bug client 抛错时收敛为 创建失败", async () => {
    vi.mocked(client.createBug).mockRejectedValue(new Error("字段非法"));
    const res = await mcp.callTool({
      name: "tapd_create_bug",
      arguments: { title: "x", description: "d", workspace_id: "20", confirmed: true },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("创建失败：字段非法");
  });

  it("tapd_create_bug 传 is_apply_template_default_value=1 但缺 template_id 时直接 isError", async () => {
    const res = await mcp.callTool({
      name: "tapd_create_bug",
      arguments: {
        title: "x",
        description: "d",
        workspace_id: "20",
        is_apply_template_default_value: 1,
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("需与 template_id 一起提供");
    expect(vi.mocked(client.createBug)).not.toHaveBeenCalled();
  });

  it("tapd_create_bug 传 is_apply_template_default_value=2 被 schema 拒绝（不调 client）", async () => {
    const res = await mcp.callTool({
      name: "tapd_create_bug",
      arguments: {
        title: "x",
        description: "d",
        workspace_id: "20",
        template_id: "t1",
        is_apply_template_default_value: 2,
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("Input validation error");
    expect(vi.mocked(client.createBug)).not.toHaveBeenCalled();
  });

  it("tapd_create_bug 传 is_apply_template_default_value=0 无 template_id 时正常放行", async () => {
    vi.mocked(client.createBug).mockResolvedValue({
      bug: { id: "204", title: "x", status: "open", currentOwner: "tester", url: "http://x/204" },
    } as never);
    const res = await mcp.callTool({
      name: "tapd_create_bug",
      arguments: {
        title: "x",
        description: "d",
        workspace_id: "20",
        is_apply_template_default_value: 0,
        confirmed: true,
      },
    });
    expect(res.isError).toBeFalsy();
    expect(vi.mocked(client.createBug)).toHaveBeenCalled();
  });

  it("tapd_create_story 成功展示需求信息", async () => {
    vi.mocked(client.createStory).mockResolvedValue({
      id: "300",
      name: "新需求",
      status: "open",
      owner: "tester",
      url: "http://x/300",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_create_story",
      arguments: { name: "新需求", description: "d", workspace_id: "20", confirmed: true },
    });
    expect(callText(res)).toContain("需求创建成功");
    expect(callText(res)).toContain("- ID: 300");
  });

  it("tapd_create_story 传 apply_template 但缺 templated_id 时直接 isError", async () => {
    const res = await mcp.callTool({
      name: "tapd_create_story",
      arguments: {
        name: "x",
        description: "d",
        workspace_id: "20",
        apply_template: "preset_tasks",
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("需与 templated_id 一起提供");
    expect(vi.mocked(client.createStory)).not.toHaveBeenCalled();
  });

  it("tapd_create_story 传 is_apply_template_default_value=1 但缺 templated_id 时直接 isError", async () => {
    const res = await mcp.callTool({
      name: "tapd_create_story",
      arguments: {
        name: "x",
        description: "d",
        workspace_id: "20",
        is_apply_template_default_value: 1,
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("需与 templated_id 一起提供");
    expect(vi.mocked(client.createStory)).not.toHaveBeenCalled();
  });

  it("tapd_create_story 传 is_apply_template_default_value=-1 被 schema 拒绝（不调 client）", async () => {
    const res = await mcp.callTool({
      name: "tapd_create_story",
      arguments: {
        name: "x",
        description: "d",
        workspace_id: "20",
        templated_id: "t1",
        is_apply_template_default_value: -1,
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("Input validation error");
    expect(vi.mocked(client.createStory)).not.toHaveBeenCalled();
  });

  it("tapd_create_story 传 is_apply_template_default_value=0 无 templated_id 时正常放行", async () => {
    vi.mocked(client.createStory).mockResolvedValue({
      id: "300",
      name: "x",
      status: "open",
      owner: "tester",
      url: "http://x/300",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_create_story",
      arguments: {
        name: "x",
        description: "d",
        workspace_id: "20",
        is_apply_template_default_value: 0,
        confirmed: true,
      },
    });
    expect(res.isError).toBeFalsy();
    expect(vi.mocked(client.createStory)).toHaveBeenCalledTimes(1);
  });
});

describe("tapd_writeback：组合必填校验与各更新分支", () => {
  it("comment/title/description/status/owners/标准字段/custom_fields 全缺时直接 isError", async () => {
    const res = await mcp.callTool({
      name: "tapd_writeback",
      arguments: { bug_id: "1", workspace_id: "20", confirmed: true },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("至少需要提供一个");
    expect(vi.mocked(client.writeback)).not.toHaveBeenCalled();
  });

  it("仅传标准字段（priority_label）即可通过组合必填校验", async () => {
    vi.mocked(client.writeback).mockResolvedValue({
      bugId: "1",
      fieldsUpdated: true,
      updatedFields: ["priority_label"],
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback",
      arguments: { bug_id: "1", workspace_id: "20", priority_label: "High", confirmed: true },
    });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("字段已更新：priority_label");
  });

  it("comment_root_id 缺少 comment 时直接 isError", async () => {
    const res = await mcp.callTool({
      name: "tapd_writeback",
      arguments: { bug_id: "1", workspace_id: "20", comment_root_id: "root1", confirmed: true },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("需与 comment 一起提供");
    expect(vi.mocked(client.writeback)).not.toHaveBeenCalled();
  });

  it("状态更新成功渲染状态行", async () => {
    vi.mocked(client.writeback).mockResolvedValue({
      bugId: "1",
      targetStatus: "resolved",
      statusUpdated: true,
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback",
      arguments: { bug_id: "1", workspace_id: "20", target_status: "resolved", confirmed: true },
    });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("状态已更新为 resolved");
  });

  it("处理人 append 渲染完整列表，评论+状态部分失败时 isError", async () => {
    vi.mocked(client.writeback).mockResolvedValue({
      bugId: "1",
      commentCreated: true,
      author: "tester",
      commentId: "c1",
      targetStatus: "x",
      statusUpdated: false,
      statusUpdateError: "不在项目工作流",
      targetOwners: ["bob"],
      finalOwners: ["alice", "bob"],
      ownerUpdated: true,
      ownerUpdateMode: "append",
      partialFailure: true,
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback",
      arguments: {
        bug_id: "1",
        workspace_id: "20",
        comment: "fix",
        target_status: "x",
        target_owners: ["bob"],
        owner_update_mode: "append",
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true); // partialFailure 透传
    const text = callText(res);
    expect(text).toContain("评论已回填");
    expect(text).toContain("状态更新为 x 失败：不在项目工作流");
    expect(text).toContain("处理人已追加 bob。当前完整处理人列表: alice, bob");
  });

  it("client 抛错时收敛为 回填失败", async () => {
    vi.mocked(client.writeback).mockRejectedValue(new Error("网络异常"));
    const res = await mcp.callTool({
      name: "tapd_writeback",
      arguments: { bug_id: "1", workspace_id: "20", comment: "x", confirmed: true },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("回填失败：网络异常");
  });
});

describe("tapd_writeback_story：组合必填校验与更新分支", () => {
  it("comment/description/status/owners/标准字段/custom_fields 全缺时直接 isError", async () => {
    const res = await mcp.callTool({
      name: "tapd_writeback_story",
      arguments: { story_id: "5", workspace_id: "20", confirmed: true },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("至少需要提供一个");
  });

  it("评论 + 处理人 replace 成功渲染", async () => {
    vi.mocked(client.writebackStory).mockResolvedValue({
      storyId: "5",
      commentCreated: true,
      author: "tester",
      targetOwners: ["bob"],
      finalOwners: ["bob"],
      ownerUpdated: true,
      ownerUpdateMode: "replace",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback_story",
      arguments: {
        story_id: "5",
        workspace_id: "20",
        comment: "done",
        target_owners: ["bob"],
        owner_update_mode: "replace",
        confirmed: true,
      },
    });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("处理人已替换为 bob");
  });

  it("仅传标准字段 name 也通过组合校验并渲染字段更新文案", async () => {
    vi.mocked(client.writebackStory).mockResolvedValue({
      storyId: "5",
      author: "tester",
      updatedFields: ["name", "priority_label"],
      fieldsUpdated: true,
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback_story",
      arguments: {
        story_id: "5",
        workspace_id: "20",
        name: "新标题",
        priority_label: "High",
        confirmed: true,
      },
    });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("字段已更新：name、priority_label");
  });

  it("comment_root_id 缺少 comment 时直接 isError", async () => {
    const res = await mcp.callTool({
      name: "tapd_writeback_story",
      arguments: {
        story_id: "5",
        workspace_id: "20",
        comment_root_id: "root1",
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("需与 comment 一起提供");
  });

  it("is_auto_close_task 缺少 target_status 时直接 isError（不调 client）", async () => {
    const res = await mcp.callTool({
      name: "tapd_writeback_story",
      arguments: {
        story_id: "5",
        workspace_id: "20",
        is_auto_close_task: 1,
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("需与 target_status 一起提供");
    expect(vi.mocked(client.writebackStory)).not.toHaveBeenCalled();
  });

  it("is_auto_close_task 传 0/1 之外的值被 schema 拒绝（不调 client）", async () => {
    const res = await mcp.callTool({
      name: "tapd_writeback_story",
      arguments: {
        story_id: "5",
        workspace_id: "20",
        target_status: "resolved",
        is_auto_close_task: 2,
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("Input validation error");
    expect(vi.mocked(client.writebackStory)).not.toHaveBeenCalled();
  });
});

describe("上传类工具", () => {
  it("tapd_upload_bug_attachment 成功展示附件信息", async () => {
    vi.mocked(client.uploadBugAttachment).mockResolvedValue({
      id: "att9",
      filename: "log.txt",
      content_type: "text/plain",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_upload_bug_attachment",
      arguments: { bug_id: "9", workspace_id: "20", file_base64: "AAAA", filename: "log.txt", confirmed: true },
    });
    expect(callText(res)).toContain("附件 ID: att9");
  });

  it("tapd_upload_bug_image 成功返回 html_code", async () => {
    vi.mocked(client.uploadBugImage).mockResolvedValue({
      imageSrc: "/tfl/x.png",
      htmlCode: "<img>",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_upload_bug_image",
      arguments: { workspace_id: "20", file_base64: "AAAA", filename: "x.png", confirmed: true },
    });
    expect(callText(res)).toContain("可嵌入描述的 html_code: <img>");
  });

  it("tapd_append_bug_description_image 描述追加成功", async () => {
    vi.mocked(client.appendBugDescriptionImage).mockResolvedValue({
      imageSrc: "/x",
      descriptionUpdated: true,
    } as never);
    const res = await mcp.callTool({
      name: "tapd_append_bug_description_image",
      arguments: { bug_id: "9", workspace_id: "20", file_base64: "AAAA", filename: "x.png", confirmed: true },
    });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("已追加到缺陷描述末尾");
  });

  it("tapd_append_bug_description_image 描述写入失败时回退提示 html_code 且 isError", async () => {
    vi.mocked(client.appendBugDescriptionImage).mockResolvedValue({
      imageSrc: "/x",
      descriptionUpdated: false,
      descriptionUpdateError: "写入失败",
      htmlCode: "<img>",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_append_bug_description_image",
      arguments: { bug_id: "9", workspace_id: "20", file_base64: "AAAA", filename: "x.png", confirmed: true },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("描述追加失败：写入失败");
    expect(callText(res)).toContain("手动写回描述：<img>");
  });
});

describe("prompt: tapd_prd_analysis 三种目标分支", () => {
  const promptText = (res: Awaited<ReturnType<Client["getPrompt"]>>) =>
    (res.messages[0]!.content as { type: string; text: string }).text;

  it("提供 story_id 时给出按 ID 定位的指引", async () => {
    const res = await mcp.getPrompt({ name: "tapd_prd_analysis", arguments: { story_id: "5", workspace_id: "20" } });
    const text = promptText(res);
    expect(text).toContain("目标 TAPD 需求 ID：5");
    expect(text).toContain("TAPD 项目 ID：20");
  });

  it("只提供 keyword 时给出按关键词搜索的指引", async () => {
    const res = await mcp.getPrompt({ name: "tapd_prd_analysis", arguments: { keyword: "登录" } });
    const text = promptText(res);
    expect(text).toContain("目标需求关键词：登录");
    expect(text).toContain("TAPD 项目 ID：未提供");
  });

  it("均不提供时提示先询问用户", async () => {
    const res = await mcp.getPrompt({ name: "tapd_prd_analysis", arguments: {} });
    expect(promptText(res)).toContain("用户尚未提供需求 ID 或关键词");
  });
});

describe("prompt: tapd_bug_fix_writeback 修复回填流程", () => {
  const promptText = (res: Awaited<ReturnType<Client["getPrompt"]>>) =>
    (res.messages[0]!.content as { type: string; text: string }).text;

  it("完整参数会进入回填草稿工作流并要求确认后写回", async () => {
    const res = await mcp.getPrompt({
      name: "tapd_bug_fix_writeback",
      arguments: {
        bug_id: "9",
        workspace_id: "20",
        fix_summary: "修复登录态过期后的重试逻辑",
      },
    });

    const text = promptText(res);
    expect(text).toContain("目标 TAPD bug ID：9");
    expect(text).toContain("TAPD 项目 ID：20");
    expect(text).toContain("修复说明：修复登录态过期后的重试逻辑");
    expect(text).toContain("没有对应修复 diff，不要强行分类");
    expect(text).toContain("不要求附带 PR、commit 或其他链接");
    expect(text).toContain('target_status="resolved"');
    expect(text).toContain("resolved 对应 TAPD 页面上的“已解决”");
    expect(text).toContain("未经确认，不要调用 tapd_writeback");
    expect(text).toContain("confirmed=true");
  });

  it("缺少 bug_id 时提示先询问用户并保留状态确认约束", async () => {
    const res = await mcp.getPrompt({ name: "tapd_bug_fix_writeback", arguments: {} });
    const text = promptText(res);

    expect(text).toContain("用户尚未提供 bug ID，请先询问用户");
    expect(text).toContain("先调用 tapd_list_bugs 精确查询");
    expect(text).toContain("状态写入值固定为 resolved");
  });
});

describe("prompt: tapd_test_doc 提测文档生成", () => {
  const promptText = (res: Awaited<ReturnType<Client["getPrompt"]>>) =>
    (res.messages[0]!.content as { type: string; text: string }).text;

  it("完整参数会带入测试环境、自定义基线、TAPD 联动与已知问题", async () => {
    const res = await mcp.getPrompt({
      name: "tapd_test_doc",
      arguments: {
        test_url: "https://example.com/checkout.html",
        base_branch: "develop",
        story_id: "5",
        workspace_id: "20",
        known_issues: "卡输入框聚焦时双框同时高亮",
      },
    });

    const text = promptText(res);
    expect(text).toContain("测试环境地址：https://example.com/checkout.html");
    expect(text).toContain("diff 基线分支：develop");
    expect(text).toContain("git diff develop...HEAD");
    expect(text).toContain("关联 TAPD 需求 ID：5（项目 ID：20）");
    expect(text).toContain("用户补充的已知问题：卡输入框聚焦时双框同时高亮");
    expect(text).toContain("tapd_get_stories");
    expect(text).toContain("tapd_list_story_test_cases");
    expect(text).toContain("tapd_list_bugs（传入 story_id + workspace_id）");
    expect(text).toContain("该工具默认返回全部状态，只把仍未关闭/未解决的缺陷计入");
    expect(text).toContain("若用户此前已确认跳过准入，则跳过本分支这三个工具调用");
    expect(text).toContain("不要套用固定清单");
    expect(text).toContain("### 本次提测");
    expect(text).toContain("写入项目根目录的 提测文档.md");
  });

  it("先做准入判断，不达标时给出三选一并要求用户决策后才生成文档", async () => {
    const res = await mcp.getPrompt({
      name: "tapd_test_doc",
      arguments: { story_id: "5", workspace_id: "20" },
    });
    const text = promptText(res);

    expect(text).toContain("阶段一 · 提测准入判断（先于生成文档；用户可在本阶段确认跳过准入）");
    expect(text).toContain("tapd_list_story_test_cases 获取 PRD 关联测试用例");
    expect(text).toContain("A. 继续提测，并把这些未达标项记入文档「已知问题 / 正在跟进」");
    expect(text).toContain("B. 继续提测，忽略风险");
    expect(text).toContain("C. 终止提测");
    expect(text).toContain("得到明确选择前不要进入阶段二、不要生成文档");
  });

  it("阶段二把文档写入项目根目录 提测文档.md，且不含过程信息", async () => {
    const res = await mcp.getPrompt({
      name: "tapd_test_doc",
      arguments: { story_id: "5", workspace_id: "20" },
    });
    const text = promptText(res);

    expect(text).toContain("把最终提测文档写入项目根目录的 提测文档.md（整体覆盖同名文件）");
    expect(text).toContain("文件内容严格只包含下方模板的章节");
    expect(text).toContain("文档不写「提测准入 / Diff 基线 / 关联需求」等过程信息");
    expect(text).not.toContain("### 提测准入");
  });

  it("有 story_id 缺 workspace_id 时要求先 tapd_list_stories 跨项目定位再查询", async () => {
    const res = await mcp.getPrompt({
      name: "tapd_test_doc",
      arguments: { story_id: "5" },
    });
    const text = promptText(res);

    expect(text).toContain("先用 tapd_list_stories(id=story_id) 跨项目定位 workspace_id 再查询");
    expect(text).toContain("先调用 tapd_list_stories 传入 id=story_id 跨项目定位需求");
    expect(text).toContain("不要直接调用它们");
  });

  it("关联缺陷仅在做了准入对照时查询，跳过/无 story 时不调 tapd_list_bugs", async () => {
    const res = await mcp.getPrompt({
      name: "tapd_test_doc",
      arguments: { story_id: "5", workspace_id: "20" },
    });
    const text = promptText(res);

    expect(text).toContain("仅当完成了阶段一准入对照、且用户未选择跳过准入时");
    expect(text).toContain("用户跳过准入、或缺 story_id/workspace_id 时不要调用 tapd_list_bugs");
    expect(text).toContain("只列入未关闭/未解决的缺陷（排除终态）");
    expect(text).toContain("不把准入未达标项写入文档（仅在对话中说明）");
  });

  it("跳过准入是进入阶段二的合法前提之一", async () => {
    const res = await mcp.getPrompt({
      name: "tapd_test_doc",
      arguments: { story_id: "5", workspace_id: "20" },
    });
    const text = promptText(res);

    expect(text).toContain("用户确认跳过准入");
    expect(text).toContain("阶段二 · 生成提测文档（准入通过 / 用户选择 A 或 B / 用户确认跳过准入后才执行）");
    expect(text).toContain("跳过准入即不做准入对照、不查关联缺陷");
  });

  it("非法 base_branch 被 schema 拒绝（防命令注入）", async () => {
    await expect(
      mcp.getPrompt({ name: "tapd_test_doc", arguments: { base_branch: "main; rm -rf /" } })
    ).rejects.toThrow();
  });

  it("未提供 story_id 时先列出名下需求供用户选择，或确认跳过准入", async () => {
    const res = await mcp.getPrompt({ name: "tapd_test_doc", arguments: {} });
    const text = promptText(res);

    expect(text).toContain("测试环境地址：未提供");
    expect(text).toContain("未指定——请自动探测仓库默认分支");
    expect(text).toContain("git symbolic-ref --short refs/remotes/origin/HEAD");
    expect(text).toContain("检查 main、master 是否存在");
    expect(text).toContain("先调用 tapd_list_stories 列出你名下的候选需求供选择");
    expect(text).toContain("默认按当前登录用户聚合名下各项目需求");
    expect(text).toContain("请用户选定目标需求");
    expect(text).toContain("跳过准入、直接基于代码改动生成文档");
    expect(text).toContain("不要凭分支名臆测对应需求");
    expect(text).toContain("测试环境：（待补充）");
  });
});

// 覆盖 writeback/writeback_story 各更新项的成功/失败两态文案拼装，以及 create 的关联分支，
// 把 index.ts 的分支覆盖补到门禁线以上（这些都是纯文案分支，逻辑由 client 层另测）。
describe("回填工具：各更新项成功/失败两态文案", () => {
  it("tapd_writeback 评论/标题/描述/状态/处理人全部成功（append）", async () => {
    vi.mocked(client.writeback).mockResolvedValue({
      bugId: "1",
      commentCreated: true,
      author: "tester",
      commentId: "c1",
      targetTitle: "新标题",
      titleUpdated: true,
      descriptionUpdated: true,
      targetStatus: "resolved",
      statusUpdated: true,
      targetOwners: ["bob"],
      finalOwners: ["alice", "bob"],
      ownerUpdated: true,
      ownerUpdateMode: "append",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback",
      arguments: {
        bug_id: "1",
        workspace_id: "20",
        comment: "fix",
        title: "新标题",
        description: "<p>新</p>",
        target_status: "resolved",
        target_owners: ["bob"],
        owner_update_mode: "append",
        confirmed: true,
      },
    });
    expect(res.isError).toBeFalsy();
    const text = callText(res);
    expect(text).toContain("评论已回填。评论人: tester | 评论 ID: c1");
    expect(text).toContain("标题已更新为 新标题");
    expect(text).toContain("描述正文已更新（整体覆盖）");
    expect(text).toContain("状态已更新为 resolved");
    expect(text).toContain("处理人已追加 bob");
  });

  it("tapd_writeback 评论/标题/描述/状态/处理人全部失败", async () => {
    vi.mocked(client.writeback).mockResolvedValue({
      bugId: "1",
      commentCreated: false,
      commentCreateError: "评论接口错误",
      targetTitle: "新标题",
      titleUpdated: false,
      titleUpdateError: "标题接口错误",
      descriptionUpdated: false,
      descriptionUpdateError: "描述接口错误",
      targetStatus: "resolved",
      statusUpdated: false,
      statusUpdateError: "状态非法",
      targetOwners: ["bob"],
      ownerUpdated: false,
      ownerUpdateError: "处理人接口错误",
      partialFailure: true,
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback",
      arguments: {
        bug_id: "1",
        workspace_id: "20",
        comment: "fix",
        title: "新标题",
        description: "<p>新</p>",
        target_status: "resolved",
        target_owners: ["bob"],
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    const text = callText(res);
    expect(text).toContain("评论回填失败：评论接口错误");
    expect(text).toContain("标题更新为 新标题 失败：标题接口错误");
    expect(text).toContain("描述正文更新失败：描述接口错误");
    expect(text).toContain("状态更新为 resolved 失败：状态非法");
    expect(text).toContain("处理人更新为 bob 失败：处理人接口错误");
  });

  it("tapd_writeback_story 描述/状态全部成功", async () => {
    vi.mocked(client.writebackStory).mockResolvedValue({
      storyId: "5",
      descriptionUpdated: true,
      targetStatus: "resolved",
      statusUpdated: true,
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback_story",
      arguments: {
        story_id: "5",
        workspace_id: "20",
        description: "<p>新</p>",
        target_status: "resolved",
        confirmed: true,
      },
    });
    expect(res.isError).toBeFalsy();
    const text = callText(res);
    expect(text).toContain("描述正文已更新（整体覆盖）");
    expect(text).toContain("状态已更新为 resolved");
  });

  it("tapd_writeback_story 评论/描述/状态/处理人全部失败", async () => {
    vi.mocked(client.writebackStory).mockResolvedValue({
      storyId: "5",
      commentCreated: false,
      commentCreateError: "评论接口错误",
      descriptionUpdated: false,
      descriptionUpdateError: "描述接口错误",
      targetStatus: "resolved",
      statusUpdated: false,
      statusUpdateError: "状态非法",
      targetOwners: ["bob"],
      ownerUpdated: false,
      ownerUpdateError: "处理人接口错误",
      partialFailure: true,
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback_story",
      arguments: {
        story_id: "5",
        workspace_id: "20",
        comment: "x",
        description: "<p>新</p>",
        target_status: "resolved",
        target_owners: ["bob"],
        confirmed: true,
      },
    });
    expect(res.isError).toBe(true);
    const text = callText(res);
    expect(text).toContain("评论回填失败：评论接口错误");
    expect(text).toContain("描述正文更新失败：描述接口错误");
    expect(text).toContain("状态更新为 resolved 失败：状态非法");
    expect(text).toContain("处理人更新为 bob 失败：处理人接口错误");
  });

  it("tapd_writeback_story client 抛错时收敛为 需求回填失败", async () => {
    vi.mocked(client.writebackStory).mockRejectedValue(new Error("超时"));
    const res = await mcp.callTool({
      name: "tapd_writeback_story",
      arguments: { story_id: "5", workspace_id: "20", comment: "x", confirmed: true },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("需求回填失败：超时");
  });

  it("tapd_create_bug 关联需求失败时保留缺陷并提示关联失败", async () => {
    vi.mocked(client.createBug).mockResolvedValue({
      bug: { id: "202", title: "x", status: "open", currentOwner: "tester", url: "http://x/202" },
      relatedStoryId: "5",
      relationError: "关联失败",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_create_bug",
      arguments: { title: "x", description: "d", workspace_id: "20", story_id: "5", confirmed: true },
    });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("关联需求失败: 5 | 关联失败");
  });

  it("tapd_upload_bug_attachment client 抛错时收敛为 附件上传失败", async () => {
    vi.mocked(client.uploadBugAttachment).mockRejectedValue(new Error("超过大小上限"));
    const res = await mcp.callTool({
      name: "tapd_upload_bug_attachment",
      arguments: { bug_id: "9", workspace_id: "20", file_base64: "AAAA", filename: "x", confirmed: true },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("附件上传失败：超过大小上限");
  });

  it("tapd_upload_bug_image client 抛错时收敛为 图片上传失败", async () => {
    vi.mocked(client.uploadBugImage).mockRejectedValue(new Error("格式不支持"));
    const res = await mcp.callTool({
      name: "tapd_upload_bug_image",
      arguments: { workspace_id: "20", file_base64: "AAAA", filename: "x.png", confirmed: true },
    });
    expect(res.isError).toBe(true);
    expect(callText(res)).toContain("图片上传失败：格式不支持");
  });

  it("tapd_writeback 处理人 replace 成功渲染替换文案（区别于 append）", async () => {
    vi.mocked(client.writeback).mockResolvedValue({
      bugId: "1",
      targetOwners: ["bob"],
      finalOwners: ["bob"],
      ownerUpdated: true,
      ownerUpdateMode: "replace",
    } as never);
    const res = await mcp.callTool({
      name: "tapd_writeback",
      arguments: {
        bug_id: "1",
        workspace_id: "20",
        target_owners: ["bob"],
        owner_update_mode: "replace",
        confirmed: true,
      },
    });
    expect(res.isError).toBeFalsy();
    expect(callText(res)).toContain("处理人已替换为 bob");
  });

  it("tapd_create_bug 不关联需求时不渲染关联行", async () => {
    vi.mocked(client.createBug).mockResolvedValue({
      bug: { id: "210", title: "独立缺陷", status: "open", currentOwner: "tester", url: "http://x/210" },
    } as never);
    const res = await mcp.callTool({
      name: "tapd_create_bug",
      arguments: { title: "独立缺陷", description: "d", workspace_id: "20", confirmed: true },
    });
    expect(res.isError).toBeFalsy();
    const text = callText(res);
    expect(text).toContain("bug 创建成功");
    expect(text).not.toContain("关联需求");
  });
});
