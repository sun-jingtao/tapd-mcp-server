import type {
  TapdRawAttachment,
  TapdRawBug,
  TapdRawBugChange,
  TapdRawComment,
  TapdRawIteration,
  TapdRawStory,
  TapdRawStoryChange,
  TapdRawTestCase,
  TapdRawWorkspace,
  TapdRawWorkspaceUser,
} from "./api-types.js";
import type {
  TapdAttachment,
  TapdBug,
  TapdBugChange,
  TapdComment,
  TapdIteration,
  TapdMediaReference,
  TapdStory,
  TapdStoryChange,
  TapdStoryFieldChange,
  TapdTestCase,
  TapdWorkspace,
  TapdWorkspaceUser,
} from "./types.js";

// ─── 通用字符串工具 ────────────────────────────────────────────────────────────

/**
 * 按分隔符（分号、逗号、空格及其中文等价）解析列表字符串。
 * TAPD 的多人字段（current_owner / owner 等）以分号分隔、常以分号结尾。
 */
export function parseDelimitedList(value: string): string[] {
  return value
    .split(/[;,，；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// ─── TAPD Response Normalizers ───────────────────────────────────────────────

/**
 * 从 TAPD 原始字段对象中安全读取字符串。
 * TAPD API 字段类型较松散，这里统一把非字符串值收敛为空字符串。
 */
function getString(record: object, key: string): string {
  const value = (record as Record<string, unknown>)[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

// TAPD Bug 详情页右侧常见字段到中文展示名的映射，用于 MCP 文本输出前归一化。
const BUG_EXTRA_FIELD_LABELS: Array<[keyof TapdRawBug, string]> = [
  ["label", "标签"],
  ["iteration_id", "迭代"],
  ["te", "测试人员"],
  ["de", "开发人员"],
  ["resolution", "解决方法"],
  ["cc", "抄送人"],
  ["participator", "参与人"],
  ["bugtype", "Bug 类型"],
  ["originphase", "发现阶段"],
  ["sourcephase", "引入阶段"],
  ["source", "缺陷根源"],
  ["platform", "软件平台"],
  ["os", "操作系统"],
  ["testtype", "测试类型"],
  ["testphase", "测试阶段"],
  ["testmode", "测试方式"],
  ["frequency", "重现规律"],
  ["version_report", "发现版本"],
  ["version_test", "验证版本"],
  ["version_fix", "合入版本"],
  ["version_close", "关闭版本"],
  ["flows", "工作流"],
  ["created_from", "创建来源"],
];

// TAPD Story 详情页常见字段到中文展示名的映射，用于 MCP 文本输出前归一化。
const STORY_EXTRA_FIELD_LABELS: Array<[keyof TapdRawStory, string]> = [
  ["iteration_id", "迭代"],
  ["category_id", "分类"],
  ["version", "版本"],
  ["size", "规模"],
];

/**
 * 将 TAPD API 原始 Bug 字段归一化为项目内部使用的 TapdBug 结构。
 * 同时补齐 workspaceId 和可直接打开的 TAPD bug 链接。
 * fallbackWorkspaceId 用于在记录自身未带 workspace_id 时反映当前调用实际使用的项目。
 */
export function normalizeBug(record: TapdRawBug, fallbackWorkspaceId?: string): TapdBug {
  const workspaceId = getString(record, "workspace_id") || fallbackWorkspaceId || "";
  const id = getString(record, "id");
  const extraFields = Object.fromEntries(
    BUG_EXTRA_FIELD_LABELS.map(([key, label]) => [label, getString(record, key)]).filter(([, value]) => value)
  );

  return {
    id,
    workspaceId,
    title: getString(record, "title"),
    description: getString(record, "description"),
    status: getString(record, "status"),
    priority: getString(record, "priority_label") || getString(record, "priority"),
    severity: getString(record, "severity"),
    module: getString(record, "module"),
    currentOwner: getString(record, "current_owner"),
    reporter: getString(record, "reporter"),
    created: getString(record, "created"),
    modified: getString(record, "modified"),
    extraFields,
    url: `https://www.tapd.cn/tapd_fe/${workspaceId}/bug/detail/${id}`,
  };
}

export function normalizeBugChange(record: TapdRawBugChange, fallbackWorkspaceId?: string): TapdBugChange {
  const parsedFieldChanges = normalizeStoryFieldChanges(record.field_changes);
  const field = getString(record, "field_label") || getString(record, "change_field") || getString(record, "field");
  // 英文字段 key 用于稳定识别字段（如 status），不取 field_label，避免被中文名干扰。
  const fieldKey = getString(record, "change_field") || getString(record, "field");

  return {
    id: getString(record, "id"),
    workspaceId: getString(record, "workspace_id") || fallbackWorkspaceId || "",
    bugId: getString(record, "bug_id"),
    author: getString(record, "author"),
    created: getString(record, "created"),
    field,
    fieldKey,
    oldValue: getString(record, "value_before_parsed") || getString(record, "value_before") || getString(record, "old_value"),
    newValue: getString(record, "value_after_parsed") || getString(record, "value_after") || getString(record, "new_value"),
    memo: getString(record, "memo"),
    fieldChanges: parsedFieldChanges.fieldChanges,
    rawFieldChanges: parsedFieldChanges.rawFieldChanges,
  };
}

/**
 * 将 TAPD API 原始 Story 字段归一化为项目内部使用的 TapdStory 结构。
 * 同时补齐 workspaceId 和可直接打开的 TAPD 需求链接。
 * fallbackWorkspaceId 用于在记录自身未带 workspace_id 时反映当前调用实际使用的项目。
 */
export function normalizeStory(record: TapdRawStory, fallbackWorkspaceId?: string): TapdStory {
  const workspaceId = getString(record, "workspace_id") || fallbackWorkspaceId || "";
  const id = getString(record, "id");
  const extraFields = Object.fromEntries(
    STORY_EXTRA_FIELD_LABELS.map(([key, label]) => [label, getString(record, key)]).filter(([, value]) => value)
  );

  return {
    id,
    workspaceId,
    name: getString(record, "name"),
    description: getString(record, "description"),
    status: getString(record, "status"),
    priority: getString(record, "priority_label") || getString(record, "priority"),
    owner: getString(record, "owner"),
    creator: getString(record, "creator"),
    created: getString(record, "created"),
    modified: getString(record, "modified"),
    module: getString(record, "module"),
    extraFields,
    url: `https://www.tapd.cn/tapd_fe/${workspaceId}/story/detail/${id}`,
  };
}

export function normalizeStoryChange(record: TapdRawStoryChange, fallbackWorkspaceId?: string): TapdStoryChange {
  const parsedFieldChanges = normalizeStoryFieldChanges(record.field_changes);
  const field = getString(record, "change_field") || getString(record, "field");

  return {
    id: getString(record, "id"),
    workspaceId: getString(record, "workspace_id") || fallbackWorkspaceId || "",
    storyId: getString(record, "story_id"),
    creator: getString(record, "creator"),
    created: getString(record, "created"),
    field,
    oldValue: getString(record, "old_value"),
    newValue: getString(record, "new_value"),
    memo: getString(record, "memo"),
    fieldChanges: parsedFieldChanges.fieldChanges,
    rawFieldChanges: parsedFieldChanges.rawFieldChanges,
  };
}

function normalizeStoryFieldChanges(value: unknown): { fieldChanges: TapdStoryFieldChange[]; rawFieldChanges: string } {
  if (!value) {
    return { fieldChanges: [], rawFieldChanges: "" };
  }

  const parsedValue = typeof value === "string" ? parseJsonValue(value) : value;
  const fieldChanges = extractStoryFieldChanges(parsedValue);
  const rawFieldChanges = typeof parsedValue === "string" ? parsedValue : fieldChanges.length === 0 ? stringifyUnknown(parsedValue) : "";

  return { fieldChanges, rawFieldChanges };
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractStoryFieldChanges(value: unknown): TapdStoryFieldChange[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const change = normalizeStoryFieldChangeRecord(item);
      return change ? [change] : [];
    });
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([field, detail]) => {
      const change = normalizeStoryFieldChangeRecord(detail, field);
      return change ? [change] : [];
    });
  }

  return [];
}

function normalizeStoryFieldChangeRecord(value: unknown, fallbackField = ""): TapdStoryFieldChange | null {
  if (!isRecord(value)) {
    return null;
  }

  const field = readRecordString(value, "field_label") || readRecordString(value, "field") || readRecordString(value, "change_field") || fallbackField;
  const oldValue = readRecordString(value, "value_before_parsed") || readRecordString(value, "value_before") || readRecordString(value, "old_value");
  const newValue = readRecordString(value, "value_after_parsed") || readRecordString(value, "value_after") || readRecordString(value, "new_value");
  const memo = readRecordString(value, "memo");

  if (!field && !oldValue && !newValue && !memo) {
    return null;
  }

  return { field, oldValue, newValue, memo };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecordString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function stringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 将 TAPD API 原始 Iteration 字段归一化为项目内部使用的 TapdIteration 结构。
 * 迭代接口在不同项目中可能返回字段较少，因此所有可选字段都会收敛为空字符串。
 */
export function normalizeIteration(record: TapdRawIteration, fallbackWorkspaceId?: string): TapdIteration {
  const workspaceId = getString(record, "workspace_id") || fallbackWorkspaceId || "";

  return {
    id: getString(record, "id"),
    workspaceId,
    name: getString(record, "name"),
    status: getString(record, "status"),
    startdate: getString(record, "startdate"),
    enddate: getString(record, "enddate"),
    description: getString(record, "description"),
    creator: getString(record, "creator"),
    created: getString(record, "created"),
    modified: getString(record, "modified"),
  };
}

/**
 * 将 TAPD API 原始 Tcase 字段归一化为项目内部使用的 TapdTestCase 结构。
 * 测试用例字段常被项目自定义扩展，这里只收敛通用字段，保留工具输出的稳定性。
 */
export function normalizeTestCase(record: TapdRawTestCase, fallbackWorkspaceId?: string): TapdTestCase {
  const workspaceId = getString(record, "workspace_id") || fallbackWorkspaceId || "";

  return {
    id: getString(record, "id"),
    workspaceId,
    name: getString(record, "name"),
    status: getString(record, "status"),
    priority: getString(record, "priority"),
    categoryId: getString(record, "category_id"),
    precondition: getString(record, "precondition"),
    steps: getString(record, "steps"),
    expectation: getString(record, "expectation"),
    type: getString(record, "type"),
    creator: getString(record, "creator"),
    created: getString(record, "created"),
    modifier: getString(record, "modifier"),
    modified: getString(record, "modified"),
  };
}

/**
 * 将 TAPD API 原始 Comment 字段归一化为项目内部使用的 TapdComment 结构。
 * 评论正文可能为空或非字符串，这里统一收敛为空字符串。
 */
export function normalizeComment(record: TapdRawComment): TapdComment {
  return {
    id: getString(record, "id"),
    title: getString(record, "title"),
    description: getString(record, "description"),
    author: getString(record, "author"),
    entry_type: getString(record, "entry_type"),
    entry_id: getString(record, "entry_id"),
    root_id: getString(record, "root_id"),
    reply_id: getString(record, "reply_id"),
    created: getString(record, "created"),
    modified: getString(record, "modified"),
    workspace_id: getString(record, "workspace_id"),
  };
}

/**
 * 将 TAPD API 原始 Attachment 字段归一化为项目内部使用的 TapdAttachment 结构。
 * 同时把 entry_id、workspace_id、download_url 转成项目内统一的 camelCase 命名。
 */
export function normalizeAttachment(record: TapdRawAttachment): TapdAttachment {
  return {
    id: getString(record, "id"),
    type: getString(record, "type"),
    entryId: getString(record, "entry_id"),
    filename: getString(record, "filename"),
    description: getString(record, "description"),
    content_type: getString(record, "content_type"),
    created: getString(record, "created"),
    workspaceId: getString(record, "workspace_id"),
    owner: getString(record, "owner"),
    downloadUrl: getString(record, "download_url") || undefined,
  };
}

/**
 * 将 TAPD 项目成员归一化为可用于处理人匹配和 current_owner 写入的结构。
 */
export function normalizeWorkspaceUser(record: TapdRawWorkspaceUser): TapdWorkspaceUser {
  const status = getString(record, "status");

  return {
    nick: getString(record, "user"),
    name: getString(record, "name"),
    email: getString(record, "email"),
    roleIds: Array.isArray(record.role_id) ? record.role_id : [],
    status,
    isActive: status === "1",
  };
}

/**
 * 将 TAPD 原始 Workspace 字段归一化为内部 TapdWorkspace 结构。
 * category 为 organization 时表示公司/组织级条目，需要在列出参与项目时区分。
 */
export function normalizeWorkspace(record: TapdRawWorkspace): TapdWorkspace {
  const id = getString(record, "id");
  const category = getString(record, "category");

  return {
    id,
    name: getString(record, "name"),
    prettyName: getString(record, "pretty_name"),
    category,
    status: getString(record, "status"),
    description: getString(record, "description"),
    creator: getString(record, "creator"),
    created: getString(record, "created"),
    companyId: getString(record, "company_id"),
    isOrganization: category === "organization",
    url: `https://www.tapd.cn/${id}`,
  };
}

/**
 * 从简单 HTML 标签字符串中读取指定属性值。
 * 这里仅用于提取 TAPD 描述/评论中的 src、href、poster 等媒体引用。
 */
function getAttribute(tag: string, attribute: string): string {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ?? "";
}

/**
 * 根据标签名和资源后缀推断媒体类型。
 * TAPD 富文本里部分资源可能通过 a 标签呈现，因此需要同时参考 URL 后缀。
 */
function inferMediaKind(tagName: string, value: string): TapdMediaReference["kind"] {
  const path = value.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";

  if (tagName === "img" || /\.(png|gif|jpe?g|bmp|webp)$/.test(path)) {
    return "image";
  }
  if (tagName === "video" || tagName === "source" || /\.(mp4|mov|m4v|webm|avi)$/.test(path)) {
    return "video";
  }
  return "link";
}

/**
 * 从 TAPD 富文本 HTML 中提取图片、视频和链接引用。
 * 返回的是引用信息本身，图片临时下载链接会在 client 聚合阶段补齐。
 */
export function extractMediaReferences(
  html: string,
  source: TapdMediaReference["source"],
  sourceId?: string
): TapdMediaReference[] {
  const references: TapdMediaReference[] = [];
  const tagPattern = /<(img|video|source|a)\b[^>]*>/gi;

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    const tagName = match[1]?.toLowerCase() ?? "";
    const value = getAttribute(tag, tagName === "a" ? "href" : "src") || getAttribute(tag, "poster");

    if (!value) {
      continue;
    }

    references.push({
      source,
      sourceId,
      kind: inferMediaKind(tagName, value),
      value,
    });
  }

  return references;
}
