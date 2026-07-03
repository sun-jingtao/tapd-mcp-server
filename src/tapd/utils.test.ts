import { describe, it, expect } from "vitest";
import {
  extractMediaReferences,
  normalizeAttachment,
  normalizeBug,
  normalizeBugChange,
  normalizeComment,
  normalizeIteration,
  normalizeStory,
  normalizeStoryChange,
  normalizeWorkspace,
  normalizeWorkspaceUser,
  parseDelimitedList,
} from "./utils.js";
import bugsResponse from "./__fixtures__/bugs-response.json";

describe("parseDelimitedList", () => {
  it("支持分号/逗号/空格及其中文等价，并去除空项与尾分号", () => {
    expect(parseDelimitedList("alice;bob;")).toEqual(["alice", "bob"]);
    expect(parseDelimitedList("a, b；c　d")).toEqual(["a", "b", "c", "d"]);
    expect(parseDelimitedList("")).toEqual([]);
  });
});

describe("extractMediaReferences", () => {
  it("按标签名与 URL 后缀推断 image/video/link", () => {
    const html = `<img src="/tfl/a.png"><video src="/v.mp4"></video><a href="/doc.pdf">x</a>`;
    expect(extractMediaReferences(html, "description").map((r) => r.kind)).toEqual([
      "image",
      "video",
      "link",
    ]);
  });

  it("a 标签取 href，后缀为图片时仍判定为 image，并带上来源评论 id", () => {
    const [ref] = extractMediaReferences('<a href="/x.png">x</a>', "comment", "c1");
    expect(ref).toMatchObject({ kind: "image", source: "comment", sourceId: "c1", value: "/x.png" });
  });

  it("无 src/href/poster 的标签被跳过", () => {
    expect(extractMediaReferences("<img alt='x'>", "description")).toEqual([]);
  });

  it("空 HTML 返回空数组", () => {
    expect(extractMediaReferences("", "comment")).toEqual([]);
  });
});

describe("normalizeBug", () => {
  it("priority_label 优先于 priority，并拼出详情链接", () => {
    const bug = normalizeBug({ id: "1", priority_label: "High", priority: "1" } as never, "20");
    expect(bug.priority).toBe("High");
    expect(bug.url).toBe("https://www.tapd.cn/tapd_fe/20/bug/detail/1");
  });

  it("priority_label 缺省时回退到 priority", () => {
    const bug = normalizeBug({ id: "2", priority: "1" } as never, "20");
    expect(bug.priority).toBe("1");
  });

  it("非字符串字段统一收敛为空字符串，extraFields 仅保留有值项", () => {
    const bug = normalizeBug(
      { id: 1, title: null, version_report: "v1.2", os: "" } as never,
      "20"
    );
    expect(bug.title).toBe("");
    expect(bug.id).toBe("1"); // number 收敛为字符串
    expect(bug.extraFields).toEqual({ 发现版本: "v1.2" }); // os 为空被过滤
  });

  it("记录自带 workspace_id 时优先于 fallback", () => {
    const bug = normalizeBug({ id: "1", workspace_id: "99" } as never, "20");
    expect(bug.workspaceId).toBe("99");
    expect(bug.url).toContain("/tapd_fe/99/bug/detail/1");
  });
});

describe("normalizeBugChange", () => {
  it("field_changes 为 JSON 字符串时解析为结构化字段变更", () => {
    const change = normalizeBugChange(
      {
        id: "9",
        field_changes: JSON.stringify([
          { field: "status", value_before: "new", value_after: "resolved" },
        ]),
      } as never,
      "20"
    );
    expect(change.fieldChanges[0]).toMatchObject({
      field: "status",
      oldValue: "new",
      newValue: "resolved",
    });
  });

  it("fieldKey 取英文 change_field，不被中文 field_label 干扰", () => {
    const change = normalizeBugChange(
      { id: "9", change_field: "status", field_label: "状态" } as never,
      "20"
    );
    expect(change.fieldKey).toBe("status"); // 用于稳定识别 status 变更
    expect(change.field).toBe("状态"); // 展示名优先 field_label
  });

  it("field_changes 为非法 JSON 时回退原始串、不抛错", () => {
    const change = normalizeBugChange(
      { id: "9", field_changes: "not-json" } as never,
      "20"
    );
    expect(change.fieldChanges).toEqual([]);
    expect(change.rawFieldChanges).toBe("not-json");
  });
});

describe("normalizeBug × 脱敏 fixture（贴近真实 /bugs 响应形态）", () => {
  it("批量归一化真实样本：priority_label 优先、空字段过滤、currentOwner 原样保留", () => {
    const [first, second] = bugsResponse.data.map((item) => normalizeBug(item.Bug as never));

    expect(first.priority).toBe("High"); // priority_label 优先
    expect(first.extraFields).toMatchObject({ 发现版本: "v1.2.0" });
    expect(first.extraFields).not.toHaveProperty("操作系统"); // os 为空被过滤
    expect(first.currentOwner).toBe("tester;"); // normalizeBug 不切分，保留原始分号串

    expect(second.priority).toBe("2"); // 无 priority_label 时回退 priority
  });
});

describe("normalizeStory", () => {
  it("priority_label 优先、拼出需求详情链接、extraFields 映射中文名", () => {
    const story = normalizeStory(
      { id: "5", priority_label: "High", priority: "1", version: "v2", size: "" } as never,
      "20"
    );
    expect(story.priority).toBe("High");
    expect(story.url).toBe("https://www.tapd.cn/tapd_fe/20/story/detail/5");
    expect(story.extraFields).toEqual({ 版本: "v2" }); // size 为空被过滤
  });
});

describe("normalizeStoryChange", () => {
  it("field_changes 为对象映射时按字段名解析为结构化变更", () => {
    const change = normalizeStoryChange(
      {
        id: "7",
        story_id: "5",
        field_changes: JSON.stringify({ status: { value_before: "open", value_after: "done" } }),
      } as never,
      "20"
    );
    expect(change.storyId).toBe("5");
    expect(change.fieldChanges[0]).toMatchObject({
      field: "status",
      oldValue: "open",
      newValue: "done",
    });
  });
});

describe("normalizeWorkspaceUser", () => {
  it("nick 取 user 字段，status 为 '1' 时 isActive 为 true", () => {
    const user = normalizeWorkspaceUser({
      user: "alice",
      name: "爱丽丝",
      email: "a@x.com",
      status: "1",
      role_id: ["10", "20"],
    } as never);
    expect(user).toMatchObject({ nick: "alice", name: "爱丽丝", isActive: true, roleIds: ["10", "20"] });
  });

  it("status 非 '1' 时 isActive 为 false，role_id 非数组时归一为空数组", () => {
    const user = normalizeWorkspaceUser({ user: "bob", status: "0" } as never);
    expect(user.isActive).toBe(false);
    expect(user.roleIds).toEqual([]);
  });
});

describe("normalizeWorkspace", () => {
  it("category 为 organization 时 isOrganization 为 true，并拼出项目链接", () => {
    const ws = normalizeWorkspace({ id: "10", name: "公司", category: "organization" } as never);
    expect(ws).toMatchObject({ id: "10", isOrganization: true, url: "https://www.tapd.cn/10" });
  });

  it("普通项目 isOrganization 为 false", () => {
    const ws = normalizeWorkspace({ id: "11", name: "项目A", category: "normal" } as never);
    expect(ws.isOrganization).toBe(false);
  });
});

describe("normalizeAttachment", () => {
  it("snake_case 字段转 camelCase，有 download_url 时填入 downloadUrl", () => {
    const att = normalizeAttachment({
      id: "a1",
      type: "bug",
      entry_id: "9",
      filename: "f.png",
      content_type: "image/png",
      download_url: "https://dl/a1",
    } as never);
    expect(att).toMatchObject({ id: "a1", entryId: "9", content_type: "image/png", downloadUrl: "https://dl/a1" });
  });

  it("无 download_url 时 downloadUrl 为 undefined（而非空串）", () => {
    const att = normalizeAttachment({ id: "a2", filename: "g.png" } as never);
    expect(att.downloadUrl).toBeUndefined();
  });
});

describe("normalizeIteration", () => {
  it("基本字段映射，workspace_id 缺省时回退 fallback", () => {
    const iter = normalizeIteration(
      { id: "i1", name: "Sprint 1", status: "open", startdate: "2026-06-01", enddate: "2026-06-14" } as never,
      "20"
    );
    expect(iter).toMatchObject({
      id: "i1",
      workspaceId: "20",
      name: "Sprint 1",
      startdate: "2026-06-01",
      enddate: "2026-06-14",
    });
  });
});

describe("normalizeComment", () => {
  it("基本字段映射，非字符串字段收敛为空串", () => {
    const comment = normalizeComment({
      id: "c1",
      author: "tester",
      description: "<p>评论</p>",
      entry_type: "bug",
      title: null,
    } as never);
    expect(comment).toMatchObject({ id: "c1", author: "tester", entry_type: "bug", title: "" });
  });
});
