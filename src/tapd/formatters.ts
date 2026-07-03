import type {
  TapdAttachment,
  TapdBug,
  TapdBugChange,
  TapdBugDetail,
  TapdComment,
  TapdIteration,
  TapdMediaReference,
  TapdStory,
  TapdStoryChange,
  TapdStoryFieldChange,
  TapdStoryDetail,
  TapdStoryTestCase,
  TapdWorkspace,
  TapdWorkspaceAggregationMeta,
  TapdWorkspaceUser,
} from "./types.js";

/**
 * 统一展示状态：有中文名时显示「中文（英文）」，否则回退为原始英文状态值。
 */
export function formatStatus(item: { status: string; statusLabel?: string }): string {
  return item.statusLabel ? `${item.statusLabel}（${item.status}）` : item.status;
}

export type FormatBugDetailResult =
  | {
      bugId: string;
      bug: TapdBugDetail;
      error?: never;
    }
  | {
      bugId: string;
      bug?: never;
      error: string;
    };

export type FormatStoryDetailResult =
  | {
      storyId: string;
      story: TapdStoryDetail;
      error?: never;
    }
  | {
      storyId: string;
      story?: never;
      error: string;
    };

// Bug 和需求详情都带 extraFields，统一格式化可避免两套详情输出出现字段展示差异。
function formatExtraFields(item: Pick<TapdBug | TapdStory, "extraFields">): string[] {
  const fields = Object.entries(item.extraFields).map(([label, value]) => `- ${label}: ${value}`);
  return fields.length > 0 ? ["", "## 扩展字段", "", ...fields] : [];
}

function formatMediaReference(reference: TapdMediaReference, index: number): string {
  const parts = [
    `${index + 1}. ${reference.kind}`,
    `来源: ${reference.source}${reference.sourceId ? ` ${reference.sourceId}` : ""}`,
    `原始地址: ${reference.value}`,
  ];

  if (reference.filename) {
    parts.push(`文件名: ${reference.filename}`);
  }
  if (reference.downloadUrl) {
    parts.push(`下载链接: ${reference.downloadUrl}`);
  }
  if (reference.downloadError) {
    parts.push(`下载链接获取失败: ${reference.downloadError}`);
  }

  return parts.join(" | ");
}

function formatMediaReferences(mediaReferences: TapdMediaReference[]): string[] {
  if (mediaReferences.length === 0) {
    return ["", "## 内嵌媒体", "", "未发现描述或评论中的图片、视频、链接引用。"];
  }

  return ["", "## 内嵌媒体", "", ...mediaReferences.map(formatMediaReference)];
}

function formatAttachment(attachment: TapdAttachment, index: number): string {
  const parts = [
    `${index + 1}. [${attachment.id}] ${attachment.filename || "未命名附件"}`,
    `类型: ${attachment.content_type || attachment.type || "未知"}`,
    `上传人: ${attachment.owner || "未知"}`,
    `创建时间: ${attachment.created || "未知"}`,
  ];

  if (attachment.downloadUrl) {
    parts.push(`下载链接: ${attachment.downloadUrl}`);
  }
  if (attachment.downloadError) {
    parts.push(`下载链接获取失败: ${attachment.downloadError}`);
  }

  return parts.join(" | ");
}

function formatAttachments(attachments: TapdAttachment[]): string[] {
  if (attachments.length === 0) {
    return ["", "## 附件", "", "未找到附件。"];
  }

  return ["", "## 附件", "", ...attachments.map(formatAttachment)];
}

function formatComment(comment: TapdComment, index: number): string {
  return [
    `### ${index + 1}. [${comment.id}] ${comment.title || "评论"}`,
    "",
    `- 评论人: ${comment.author}`,
    `- 类型: ${comment.entry_type}`,
    `- 创建时间: ${comment.created}`,
    "",
    comment.description || "（无评论内容）",
  ].join("\n");
}

function formatComments(comments: TapdComment[]): string[] {
  if (comments.length === 0) {
    return ["", "## 评论与流转记录", "", "未找到评论或流转记录。"];
  }

  return ["", "## 评论与流转记录", "", ...comments.map(formatComment)];
}

/**
 * 转义 Markdown 表格单元格：竖线会破坏列分隔、换行会破坏行，统一处理。
 */
function tableCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

/**
 * 构造 Markdown 表格。列表类输出统一以「序号、id」作为前两列，由调用方在 headers/rows 里给出。
 */
function buildMarkdownTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyLines = rows.map((row) => `| ${row.map(tableCell).join(" | ")} |`);
  return [headerLine, dividerLine, ...bodyLines].join("\n");
}

export function formatBugList(bugs: TapdBug[], options?: { aggregation?: TapdWorkspaceAggregationMeta }): string {
  const aggregation = options?.aggregation;

  if (bugs.length === 0) {
    if (aggregation && aggregation.total === 0) {
      return "未找到该处理人参与的 TAPD 项目，无法聚合查询缺陷。可先用 tapd_list_workspaces 排查处理人 nick 是否正确。";
    }
    if (aggregation && aggregation.failed > 0) {
      return `未找到符合条件的缺陷。已查询 ${aggregation.total} 个项目，其中 ${aggregation.failed} 个查询失败（可能因权限、限流或超时）。${formatFailedWorkspaces(aggregation)}`;
    }
    return "未找到符合条件的缺陷。";
  }

  const headers = aggregation
    ? ["序号", "id", "缺陷", "项目", "状态", "报告人", "处理人", "创建时间"]
    : ["序号", "id", "缺陷", "状态", "报告人", "处理人", "创建时间"];

  const rows = bugs.map((bug, index) => {
    // 缺陷标题内嵌为 Markdown 超链接，替代单独的裸 URL 列，避免长链接撑爆表格。
    const base = [`${index + 1}`, bug.id, formatNameLink(bug.title, bug.url)];
    const tail = [formatStatus(bug), bug.reporter, bug.currentOwner, bug.created];
    if (aggregation) {
      const project = `${aggregation.workspaceNames[bug.workspaceId] || bug.workspaceId}（${bug.workspaceId}）`;
      return [...base, project, ...tail];
    }
    return [...base, ...tail];
  });

  const table = buildMarkdownTable(headers, rows);
  return `${buildListHeader("缺陷", bugs.length, aggregation)}\n\n${table}${formatFailedWorkspaces(aggregation)}`;
}

export function formatWorkspaceList(workspaces: TapdWorkspace[]): string {
  if (workspaces.length === 0) {
    return "未找到该用户参与的 TAPD 项目。";
  }

  const summary = workspaces
    .map((workspace, index) => {
      const parts = [
        `${index + 1}. [${workspace.id}] ${workspace.name}`,
        `状态: ${workspace.status || "未知"}`,
      ];

      if (workspace.created) {
        parts.push(`创建时间: ${workspace.created}`);
      }
      parts.push(`链接: ${workspace.url}`);

      return parts.join(" | ");
    })
    .join("\n");

  return `找到 ${workspaces.length} 个参与的 TAPD 项目。查询 bug 时请使用方括号中的项目 ID（workspace_id）：\n\n${summary}`;
}

// 把名称内嵌为 Markdown 超链接。转义名称中的方括号，避免破坏链接语法；无 URL 时回退为纯文本。
function formatNameLink(name: string, url?: string): string {
  if (!url) {
    return name;
  }
  const safeName = name.replace(/[[\]]/g, (match) => `\\${match}`);
  return `[${safeName}](${url})`;
}

export function formatStoryList(stories: TapdStory[], options?: { aggregation?: TapdWorkspaceAggregationMeta }): string {
  const aggregation = options?.aggregation;

  if (stories.length === 0) {
    if (aggregation && aggregation.total === 0) {
      return "未找到该处理人参与的 TAPD 项目，无法聚合查询需求。可先用 tapd_list_workspaces 排查处理人 nick 是否正确。";
    }
    if (aggregation && aggregation.failed > 0) {
      return `未找到符合条件的需求。已查询 ${aggregation.total} 个项目，其中 ${aggregation.failed} 个查询失败（可能因权限、限流或超时）。${formatFailedWorkspaces(aggregation)}`;
    }
    return "未找到符合条件的需求。";
  }

  const headers = aggregation
    ? ["序号", "id", "需求", "项目", "状态", "创建人", "处理人", "创建时间"]
    : ["序号", "id", "需求", "状态", "创建人", "处理人", "创建时间"];

  const rows = stories.map((story, index) => {
    // 需求名内嵌为 Markdown 超链接，替代单独的裸 URL 列，避免长链接撑爆表格。
    const base = [`${index + 1}`, story.id, formatNameLink(story.name, story.url)];
    const tail = [formatStatus(story), story.creator, story.owner, story.created];
    if (aggregation) {
      const project = `${aggregation.workspaceNames[story.workspaceId] || story.workspaceId}（${story.workspaceId}）`;
      return [...base, project, ...tail];
    }
    return [...base, ...tail];
  });

  const table = buildMarkdownTable(headers, rows);
  return `${buildListHeader("需求", stories.length, aggregation)}\n\n${table}${formatFailedWorkspaces(aggregation)}`;
}

// 构造列表标题。聚合查询时附带项目覆盖数与失败摘要，便于阅读者判断结果完整性。
function buildListHeader(unit: string, count: number, aggregation?: TapdWorkspaceAggregationMeta): string {
  if (!aggregation) {
    return `找到 ${count} 个${unit}：`;
  }
  const failurePart = aggregation.failed > 0 ? `，${aggregation.failed} 个查询失败` : "";
  return `找到 ${count} 个${unit}（覆盖 ${aggregation.succeeded}/${aggregation.total} 个项目${failurePart}）：`;
}

// 在聚合结果末尾追加失败项目明细，避免失败仅停留在 console.error、调用方无法得知具体缺失哪些项目。
function formatFailedWorkspaces(aggregation?: TapdWorkspaceAggregationMeta): string {
  if (!aggregation || aggregation.failed === 0) {
    return "";
  }
  const names = aggregation.failedWorkspaces.map((workspace) => `${workspace.name}（${workspace.id}）`).join("、");
  return `\n\n⚠️ 以下 ${aggregation.failed} 个项目查询失败，结果可能不完整：${names}`;
}

function formatValueChange(oldValue: string, newValue: string): string {
  if (!oldValue && !newValue) {
    return "";
  }

  return `${oldValue || "（空）"} => ${newValue || "（空）"}`;
}

/**
 * 组合变更值展示：有中文名时显示「中文（英文）」，否则原样输出原始值（兜底）。
 */
function formatChangeValue(value: string, label?: string): string {
  return label ? `${label}（${value}）` : value;
}

function formatStoryFieldChange(change: TapdStoryFieldChange, index: number): string {
  const parts = [`${index + 1}. ${change.field || "未知字段"}`];
  const valueChange = formatValueChange(change.oldValue, change.newValue);

  if (valueChange) {
    parts.push(valueChange);
  }
  if (change.memo) {
    parts.push(change.memo);
  }

  return parts.join(" | ");
}

function formatStoryChange(change: TapdStoryChange, index: number): string {
  const fieldChanges =
    change.fieldChanges.length > 0
      ? ["    字段详情:", ...change.fieldChanges.map((fieldChange, fieldIndex) => `    - ${formatStoryFieldChange(fieldChange, fieldIndex)}`)]
      : change.rawFieldChanges
        ? [`    字段详情: ${change.rawFieldChanges}`]
        : [];
  const valueChange = formatValueChange(change.oldValue, change.newValue);
  const parts = [
    `${index + 1}. [${change.id || "无记录 ID"}] 需求: ${change.storyId || "未知"}`,
    `    变更人: ${change.creator || "未知"} | 变更时间: ${change.created || "未知"}`,
    `    字段: ${change.field || "未返回"}${valueChange ? ` | ${valueChange}` : ""}`,
  ];

  if (change.memo) {
    parts.push(`    说明: ${change.memo}`);
  }

  return [...parts, ...fieldChanges].join("\n");
}

export function formatStoryChangeList(changes: TapdStoryChange[]): string {
  if (changes.length === 0) {
    return "未找到符合条件的需求变更历史。";
  }

  return `找到 ${changes.length} 条需求变更历史：\n\n${changes.map(formatStoryChange).join("\n\n")}`;
}

function formatBugChange(change: TapdBugChange, index: number): string {
  const fieldChanges =
    change.fieldChanges.length > 0
      ? ["    字段详情:", ...change.fieldChanges.map((fieldChange, fieldIndex) => `    - ${formatStoryFieldChange(fieldChange, fieldIndex)}`)]
      : change.rawFieldChanges
        ? [`    字段详情: ${change.rawFieldChanges}`]
        : [];
  // 仅状态变更（fieldKey 为 status）展示为「中文（英文）」，其余字段原样展示。
  const isStatusChange = change.fieldKey === "status";
  const oldDisplay = isStatusChange ? formatChangeValue(change.oldValue, change.oldValueLabel) : change.oldValue;
  const newDisplay = isStatusChange ? formatChangeValue(change.newValue, change.newValueLabel) : change.newValue;
  const valueChange = formatValueChange(oldDisplay, newDisplay);
  const parts = [
    `${index + 1}. [${change.id || "无记录 ID"}] bug: ${change.bugId || "未知"}`,
    `    变更人: ${change.author || "未知"} | 变更时间: ${change.created || "未知"}`,
    `    字段: ${change.field || "未返回"}${valueChange ? ` | ${valueChange}` : ""}`,
  ];

  if (change.memo) {
    parts.push(`    说明: ${change.memo}`);
  }

  return [...parts, ...fieldChanges].join("\n");
}

export function formatBugChangeList(changes: TapdBugChange[]): string {
  if (changes.length === 0) {
    return "未找到符合条件的 bug 变更历史。";
  }

  return `找到 ${changes.length} 条 bug 变更历史：\n\n${changes.map(formatBugChange).join("\n\n")}`;
}

export function formatIterationList(iterations: TapdIteration[]): string {
  if (iterations.length === 0) {
    return "未找到符合条件的迭代。";
  }

  const summary = iterations
    .map((iteration, index) => {
      const dates = [iteration.startdate, iteration.enddate].filter(Boolean).join(" ~ ") || "未设置";
      const parts = [
        `${index + 1}. [${iteration.id}] ${iteration.name}`,
        `状态: ${iteration.status || "未知"}`,
        `周期: ${dates}`,
      ];

      if (iteration.creator) {
        parts.push(`创建人: ${iteration.creator}`);
      }
      if (iteration.modified) {
        parts.push(`修改时间: ${iteration.modified}`);
      }

      return parts.join(" | ");
    })
    .join("\n");

  return `找到 ${iterations.length} 个迭代。创建或更新需求时请使用方括号中的迭代 ID：\n\n${summary}`;
}

export function formatStoryTestCaseList(testCases: TapdStoryTestCase[]): string {
  if (testCases.length === 0) {
    return "未找到该需求关联的测试用例。";
  }

  const summary = testCases
    .map((testCase, index) => {
      const parts = [
        `${index + 1}. [${testCase.id}] ${testCase.name}`,
        `状态: ${testCase.status || "未知"}`,
        `优先级: ${testCase.priority || "未设置"}`,
        `类型: ${testCase.type || "未设置"}`,
        `目录: ${testCase.categoryId || "未设置"}`,
        `测试计划: ${testCase.testPlanId || "0"}`,
      ];

      if (testCase.creator) {
        parts.push(`创建人: ${testCase.creator}`);
      }
      if (testCase.modified) {
        parts.push(`修改时间: ${testCase.modified}`);
      }
      if (testCase.relationCreated) {
        parts.push(`关联时间: ${testCase.relationCreated}`);
      }

      return parts.join(" | ");
    })
    .join("\n");

  return `找到 ${testCases.length} 个需求关联测试用例：\n\n${summary}`;
}

export function formatWorkspaceUsers(users: TapdWorkspaceUser[]): string {
  if (users.length === 0) {
    return "未找到匹配的 TAPD 项目成员。";
  }

  const summary = users
    .map((user, index) => {
      const parts = [
        `${index + 1}. ${user.name || user.nick} (${user.nick})`,
        `状态: ${user.isActive ? "有效" : user.status || "未知"}`,
      ];

      if (user.email) {
        parts.push(`邮箱: ${user.email}`);
      }

      return parts.join(" | ");
    })
    .join("\n");

  return `找到 ${users.length} 个 TAPD 项目成员。写回处理人时请使用括号中的 nick：\n\n${summary}`;
}

// Bug 和需求详情下半部分完全相同（描述、媒体、附件、评论），统一格式化避免两套输出出现差异。
function formatDetailBody(item: Pick<TapdBugDetail & TapdStoryDetail, "attachments" | "comments" | "description" | "mediaReferences">): string[] {
  return [
    "",
    "## 描述",
    "",
    item.description || "（无描述）",
    ...formatMediaReferences(item.mediaReferences),
    ...formatAttachments(item.attachments),
    ...formatComments(item.comments),
  ];
}

export function formatBugDetail(bug: TapdBugDetail): string {
  return [
    `# [${bug.id}] ${bug.title}`,
    "",
    `- 状态: ${formatStatus(bug)}`,
    `- 优先级: ${bug.priority}`,
    `- 严重程度: ${bug.severity}`,
    `- 模块: ${bug.module || "未指定"}`,
    `- 负责人: ${bug.currentOwner}`,
    `- 报告人: ${bug.reporter}`,
    `- 创建时间: ${bug.created}`,
    `- 修改时间: ${bug.modified}`,
    `- 链接: ${bug.url}`,
    ...formatExtraFields(bug),
    ...formatDetailBody(bug),
  ].join("\n");
}

export function formatBugDetails(results: FormatBugDetailResult[]): string {
  const successCount = results.filter((result) => result.bug).length;
  const failureCount = results.length - successCount;
  const summary = `共请求 ${results.length} 个 bug，成功 ${successCount} 个，失败 ${failureCount} 个。`;

  const sections = results.map((result) => {
    if (result.bug) {
      return formatBugDetail(result.bug);
    }

    return [`# [${result.bugId}] 获取失败`, "", result.error].join("\n");
  });

  return [summary, "", ...sections.join("\n\n---\n\n").split("\n")].join("\n");
}

export function formatStoryDetail(story: TapdStoryDetail): string {
  // 输出结构刻意对齐 bug 详情，方便 Agent 在 bug 和需求上下文之间切换分析。
  return [
    `# [${story.id}] ${story.name}`,
    "",
    `- 状态: ${formatStatus(story)}`,
    `- 优先级: ${story.priority}`,
    `- 模块: ${story.module || "未指定"}`,
    `- 负责人: ${story.owner}`,
    `- 创建人: ${story.creator}`,
    `- 创建时间: ${story.created}`,
    `- 修改时间: ${story.modified}`,
    `- 链接: ${story.url}`,
    ...formatExtraFields(story),
    ...formatDetailBody(story),
  ].join("\n");
}

export function formatStoryDetails(results: FormatStoryDetailResult[]): string {
  // 批量读取允许部分失败，先给出成功/失败统计，再逐条展开详情或错误。
  const successCount = results.filter((result) => result.story).length;
  const failureCount = results.length - successCount;
  const summary = `共请求 ${results.length} 个需求，成功 ${successCount} 个，失败 ${failureCount} 个。`;

  const sections = results.map((result) => {
    if (result.story) {
      return formatStoryDetail(result.story);
    }

    return [`# [${result.storyId}] 获取失败`, "", result.error].join("\n");
  });

  return [summary, "", ...sections.join("\n\n---\n\n").split("\n")].join("\n");
}
