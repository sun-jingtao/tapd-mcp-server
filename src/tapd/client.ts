/**
 * TAPD API Client
 * 只负责封装 TAPD REST API 调用，不处理 MCP 工具注册和配置校验。
 */

import type {
  TapdRawAttachment,
  TapdRawBug,
  TapdRawBugChange,
  TapdRawComment,
  TapdRawIteration,
  TapdRawStory,
  TapdRawStoryChange,
  TapdRawStoryTestCaseRelation,
  TapdRawTestCase,
  TapdRawWorkspace,
  TapdRawWorkspaceUser,
} from "./api-types.js";
import {
  createBug as createBugRequest,
  createComment,
  createRelation,
  createStory as createStoryRequest,
  fetchAttachmentDownload,
  fetchAttachments,
  fetchBugChanges,
  fetchBugs,
  fetchComments,
  fetchCurrentUser,
  fetchImageDownload,
  fetchIterations,
  fetchStories,
  fetchStoryChanges,
  fetchStoryRelatedBugs,
  fetchStoryTestCaseRelations,
  fetchTestCases,
  fetchUserParticipantProjects,
  fetchWorkflowStatusMap,
  fetchWorkspaceUsers,
  updateBug,
  updateStory,
  uploadAttachment,
  uploadImage,
} from "./api.js";
import { resolveWorkspaceId } from "./config.js";
import type {
  TapdAppendBugDescriptionImageInput,
  TapdAppendBugDescriptionImageResult,
  TapdAttachment,
  TapdBug,
  TapdBugChange,
  TapdBugChangeFilters,
  TapdBugDetail,
  TapdBugFilters,
  TapdBugListResult,
  TapdComment,
  TapdCreateBugInput,
  TapdCreateBugResult,
  TapdCreateStoryInput,
  TapdCurrentUser,
  TapdUploadBugAttachmentInput,
  TapdUploadBugImageInput,
  TapdUploadBugImageResult,
  TapdIteration,
  TapdIterationFilters,
  TapdMediaReference,
  TapdStory,
  TapdStoryChange,
  TapdStoryChangeFilters,
  TapdStoryDetail,
  TapdStoryFilters,
  TapdStoryListResult,
  TapdStoryTestCase,
  TapdStoryTestCaseFilters,
  TapdStoryWritebackInput,
  TapdStoryWritebackResult,
  TapdWorkspace,
  TapdWorkspaceAggregationMeta,
  TapdWorkspaceListInput,
  TapdWorkspaceUser,
  TapdWorkspaceUserSearchInput,
  TapdWritebackInput,
  TapdWritebackResult,
} from "./types.js";
import {
  extractMediaReferences,
  normalizeAttachment,
  normalizeBug,
  normalizeBugChange,
  normalizeComment,
  normalizeIteration,
  normalizeStory,
  normalizeStoryChange,
  normalizeTestCase,
  normalizeWorkspace,
  normalizeWorkspaceUser,
  parseDelimitedList,
} from "./utils.js";

export type {
  TapdBug,
  TapdBugChange,
  TapdBugChangeFilters,
  TapdBugDetail,
  TapdBugFilters,
  TapdBugListResult,
  TapdCreateBugInput,
  TapdCreateBugResult,
  TapdCreateStoryInput,
  TapdIteration,
  TapdIterationFilters,
  TapdStory,
  TapdStoryChange,
  TapdStoryChangeFilters,
  TapdStoryDetail,
  TapdStoryFilters,
  TapdStoryListResult,
  TapdStoryTestCase,
  TapdStoryTestCaseFilters,
  TapdStoryWritebackInput,
  TapdStoryWritebackResult,
  TapdWorkspace,
  TapdWorkspaceListInput,
  TapdWorkspaceUser,
  TapdWorkspaceUserSearchInput,
  TapdWritebackInput,
  TapdWritebackResult,
} from "./types.js";

// TAPD bugs 查询接口的 fields 参数，用来指定返回哪些缺陷字段。
// 详情页分析需要描述、基础字段以及右侧常见人员/版本/分类字段。
const BUG_FIELDS = [
  "id",
  "title",
  "description",
  "status",
  "priority",
  "priority_label",
  "severity",
  "module",
  "current_owner",
  "reporter",
  "created",
  "modified",
  "workspace_id",
  "label",
  "iteration_id",
  "de",
  "te",
  "cc",
  "participator",
  "bugtype",
  "resolution",
  "originphase",
  "sourcephase",
  "source",
  "platform",
  "os",
  "testtype",
  "testphase",
  "testmode",
  "frequency",
  "version_report",
  "version_test",
  "version_fix",
  "version_close",
  "flows",
  "created_from",
].join(",");

// TAPD stories 查询接口的 fields 参数，用来指定返回需求列表和创建结果中需要展示的字段。
const STORY_FIELDS = [
  "id",
  "name",
  "description",
  "status",
  "priority",
  "priority_label",
  "owner",
  "creator",
  "created",
  "modified",
  "workspace_id",
  "iteration_id",
  "category_id",
  "module",
  "version",
  "size",
].join(",");

// TAPD iterations 查询接口的 fields 参数，用来稳定展示创建/更新需求时需要选择的迭代信息。
const ITERATION_FIELDS = [
  "id",
  "name",
  "status",
  "startdate",
  "enddate",
  "description",
  "creator",
  "created",
  "modified",
  "workspace_id",
].join(",");

// TAPD tcases 查询接口的 fields 参数，用来展示需求验收时最常用的测试用例信息。
const TEST_CASE_FIELDS = [
  "id",
  "name",
  "status",
  "priority",
  "category_id",
  "precondition",
  "steps",
  "expectation",
  "type",
  "creator",
  "created",
  "modifier",
  "modified",
  "workspace_id",
].join(",");

// TAPD comments 查询接口的 fields 参数，用来稳定返回评论正文、作者、类型和时间等分析上下文。
const COMMENT_FIELDS = "id,title,description,author,entry_type,entry_id,root_id,reply_id,created,modified,workspace_id";

// 当前用户信息在 server 生命周期内不变，缓存后可避免每次列表查询和回写都请求 /users/info。
let cachedCurrentUser: TapdCurrentUser | null = null;
const cachedWorkspaceUsers = new Map<string, Promise<TapdWorkspaceUser[]>>();
const cachedUserWorkspaces = new Map<string, Promise<TapdWorkspace[]>>();
// 工作流状态枚举在 server 生命周期内基本不变，按 workspace+system 缓存，避免每次回写都请求 /workflows/status_map。
const cachedWorkflowStatuses = new Map<string, Promise<Record<string, string>>>();

/**
 * 清空全部模块级缓存。生产运行无需调用（缓存与 server 进程同生命周期）；
 * 供测试在用例间隔离缓存状态，避免被迫用 resetModules 重建整个模块图。
 */
export function resetTapdCaches(): void {
  cachedCurrentUser = null;
  cachedWorkspaceUsers.clear();
  cachedUserWorkspaces.clear();
  cachedWorkflowStatuses.clear();
}

// ─── API Methods ─────────────────────────────────────────────────────────────

/**
 * 获取当前 access token 对应的 TAPD 用户信息。
 * 列表过滤和评论回填都需要使用当前用户 nick。
 */
export async function getCurrentUser(): Promise<TapdCurrentUser> {
  if (cachedCurrentUser) {
    return cachedCurrentUser;
  }

  const payload = await fetchCurrentUser();

  if (!payload.data?.nick) {
    throw new Error(payload.info || "TAPD 当前用户信息获取失败");
  }

  cachedCurrentUser = {
    id: payload.data.id ?? "",
    name: payload.data.name ?? "",
    nick: payload.data.nick,
  };
  return cachedCurrentUser;
}

/**
 * 查询 TAPD 项目成员列表，并按 nick、中文名、邮箱在本地模糊匹配。
 * TAPD /workspaces/users 一次返回整个项目成员列表，因此按 workspace 缓存，减少重复请求。
 */
export async function searchWorkspaceUsers(input: TapdWorkspaceUserSearchInput): Promise<TapdWorkspaceUser[]> {
  const workspaceId = resolveWorkspaceId(input.workspace_id);
  const limit = input.limit ?? 20;
  const keyword = input.keyword?.trim().toLowerCase();
  const users = await getWorkspaceUsers(workspaceId);
  const matchedUsers = keyword
    ? users.filter((user) =>
        [user.nick, user.name, user.email].some((value) => value.toLowerCase().includes(keyword))
      )
    : users;

  return matchedUsers.slice(0, limit);
}

async function getWorkspaceUsers(workspaceId: string): Promise<TapdWorkspaceUser[]> {
  // 缓存 Promise 而不是结果，避免并发搜索同一 workspace 时重复请求 /workspaces/users。
  if (!cachedWorkspaceUsers.has(workspaceId)) {
    const pending = fetchAndNormalizeWorkspaceUsers(workspaceId);
    // 请求失败时清除缓存，避免把 rejected Promise 永久缓存，导致后续搜索一直拿到同一个失败结果。
    pending.catch(() => cachedWorkspaceUsers.delete(workspaceId));
    cachedWorkspaceUsers.set(workspaceId, pending);
  }

  return cachedWorkspaceUsers.get(workspaceId)!;
}

/**
 * 拉取指定项目成员，并归一化为用于搜索和处理人写回的内部结构。
 * TAPD 成员接口无分页，一次返回当前项目所有成员。
 */
async function fetchAndNormalizeWorkspaceUsers(workspaceId: string): Promise<TapdWorkspaceUser[]> {
  const payload = await fetchWorkspaceUsers(
    new URLSearchParams({
      fields: "user,role_id,email,name,status",
      workspace_id: workspaceId,
    })
  );
  const users = (payload.data ?? [])
    .map((item) => item.UserWorkspace)
    .filter((item): item is TapdRawWorkspaceUser => Boolean(item))
    .map(normalizeWorkspaceUser)
    .filter((user) => user.nick);

  return users;
}

/**
 * 查询指定用户（默认当前登录用户）参与的所有 TAPD 项目。
 * 默认过滤掉 category=organization 的公司/组织条目，只保留可用于查询的具体项目；
 * 列表会缓存到进程生命周期内，避免聚合查询 bug 时重复请求。
 */
export async function listWorkspaces(input: TapdWorkspaceListInput = {}): Promise<TapdWorkspace[]> {
  const nick = input.nick?.trim() || (await getCurrentUser()).nick;
  const workspaces = await getUserParticipantProjects(nick);

  return input.include_organization ? workspaces : workspaces.filter((workspace) => !workspace.isOrganization);
}

async function getUserParticipantProjects(nick: string): Promise<TapdWorkspace[]> {
  // 缓存 Promise 而非结果，避免同一用户的并发聚合查询重复请求参与项目列表。
  if (!cachedUserWorkspaces.has(nick)) {
    const pending = fetchAndNormalizeUserWorkspaces(nick);
    // 请求失败时清除缓存，避免把 rejected Promise 永久缓存。
    pending.catch(() => cachedUserWorkspaces.delete(nick));
    cachedUserWorkspaces.set(nick, pending);
  }

  return cachedUserWorkspaces.get(nick)!;
}

async function fetchAndNormalizeUserWorkspaces(nick: string): Promise<TapdWorkspace[]> {
  const payload = await fetchUserParticipantProjects(new URLSearchParams({ nick }));

  return (payload.data ?? [])
    .map((item) => item.Workspace)
    .filter((item): item is TapdRawWorkspace => Boolean(item))
    .map(normalizeWorkspace)
    .filter((workspace) => workspace.id);
}

/**
 * 查询 TAPD 项目迭代列表。
 * 用于创建或更新需求前确认 iteration_id，避免调用方手填不存在的迭代 ID。
 */
export async function listIterations(filters: TapdIterationFilters): Promise<TapdIteration[]> {
  assertCustomFieldKeys(filters.custom_fields);
  const workspaceId = resolveWorkspaceId(filters.workspace_id);
  const limit = Math.min(filters.limit ?? 50, 200);
  const params = new URLSearchParams({
    fields: ITERATION_FIELDS,
    limit: String(limit),
    // order 可由调用方覆盖；不传时保持默认按最后修改时间倒序。
    order: filters.order?.trim() || "modified desc",
    page: String(filters.page ?? 1),
    workspace_id: workspaceId,
  });

  // 字符串过滤字段：值非空时透传。
  const setParam = (key: string, value: string | null | undefined): void => {
    if (value) params.set(key, value);
  };
  setParam("id", filters.id);
  setParam("name", filters.name);
  setParam("status", filters.status);
  setParam("description", filters.description);
  setParam("startdate", filters.startdate);
  setParam("enddate", filters.enddate);
  setParam("workitem_type_id", filters.workitem_type_id);
  setParam("plan_app_id", filters.plan_app_id);
  setParam("creator", filters.creator);
  setParam("created", filters.created);
  setParam("modified", filters.modified);
  setParam("completed", filters.completed);
  setParam("locker", filters.locker);

  // 自定义字段过滤：key 即 TAPD 字段名，原样透传。
  if (filters.custom_fields) {
    for (const [key, value] of Object.entries(filters.custom_fields)) {
      if (value !== undefined) params.set(key, String(value));
    }
  }

  const payload = await fetchIterations(params);

  return (payload.data ?? [])
    .map((item) => item.Iteration)
    .filter((item): item is TapdRawIteration => Boolean(item))
    .map((iteration) => normalizeIteration(iteration, workspaceId));
}

/**
 * 查询指定需求关联的测试用例。
 * TAPD 关系接口只返回 tcase_id，因此这里会二次批量查询 /tcases 补齐用例详情。
 */
export async function listStoryTestCases(filters: TapdStoryTestCaseFilters): Promise<TapdStoryTestCase[]> {
  const workspaceId = resolveWorkspaceId(filters.workspaceId);
  const relationPayload = await fetchStoryTestCaseRelations(
    new URLSearchParams({
      include_test_plan: filters.includeTestPlan === false ? "0" : "1",
      story_id: filters.storyId,
      workspace_id: workspaceId,
    })
  );
  const relations = (relationPayload.data ?? [])
    .map((item) => item.TestPlanStoryTcaseRelation)
    .filter((item): item is TapdRawStoryTestCaseRelation => Boolean(item?.tcase_id));
  const requestedLimit = Math.min(filters.limit ?? 100, 200);
  const tcaseIds = [...new Set(relations.map((relation) => relation.tcase_id))].slice(0, requestedLimit);

  if (tcaseIds.length === 0) {
    return [];
  }

  const tcasePayload = await fetchTestCases(
    new URLSearchParams({
      fields: TEST_CASE_FIELDS,
      id: tcaseIds.join(","),
      limit: String(tcaseIds.length),
      workspace_id: workspaceId,
    })
  );
  const testCasesById = new Map(
    (tcasePayload.data ?? [])
      .map((item) => item.Tcase)
      .filter((item): item is TapdRawTestCase => Boolean(item))
      .map((testCase) => {
        const normalized = normalizeTestCase(testCase, workspaceId);
        return [normalized.id, normalized] as const;
      })
  );

  const merged = relations.flatMap((relation): TapdStoryTestCase[] => {
    const testCase = testCasesById.get(relation.tcase_id);
    if (!testCase) {
      return [];
    }

    return [
      {
        ...testCase,
        storyId: relation.story_id,
        relationId: relation.id,
        testPlanId: relation.test_plan_id,
        relationCreator: relation.creator ?? "",
        relationCreated: relation.created ?? "",
      },
    ];
  });
  const nameKeyword = filters.name?.trim().toLowerCase();
  const status = filters.status?.trim();
  const filtered = merged.filter(
    (testCase) =>
      (!nameKeyword || testCase.name.toLowerCase().includes(nameKeyword)) &&
      (!status || testCase.status === status)
  );

  return filtered.slice(0, requestedLimit);
}

/**
 * 查询 TAPD bug 列表。
 * 按 TAPD 官方 /bugs 查询参数过滤缺陷；处理人过滤默认使用当前登录用户 nick，
 * 传入 filters.current_owner 时改为查询指定处理人名下的缺陷。
 * 传入 workspace_id（或按 story_id 过滤）时落到单个项目查询；
 * 都不传时聚合处理人参与的所有项目，符合“查我名下所有缺陷”的语义。
 * 聚合查询会在返回结果的 aggregation 中带回项目名映射与失败摘要。
 */
export async function listBugs(filters: TapdBugFilters): Promise<TapdBugListResult> {
  // 在 fan-out 之前一次性校验，避免聚合查询里把非法 key 摊成每个项目各报一次错。
  assertCustomFieldKeys(filters.custom_fields);

  // 显式传入的 current_owner（去除空白后非空）优先；空字符串视为未提供。
  const explicitOwner = filters.current_owner?.trim() || undefined;
  const currentUserNick = (await getCurrentUser()).nick;
  // 按 id 精确查询、或按 story_id 查询关联缺陷时（且未显式指定 current_owner）跳过处理人过滤：
  // - 按 ID：否则缺陷转给他人后仍会被默认的“当前用户”过滤掉，被误判为“缺陷不存在”。
  // - 按 story_id：查的是“该需求的关联缺陷”，应返回全部处理人的缺陷（含他人名下的阻断缺陷），
  //   否则准入判断/需求分析会漏判不在当前用户名下的关联缺陷。
  const ownerFilter = explicitOwner ?? (filters.id || filters.story_id ? undefined : currentUserNick);
  // 跨项目聚合仍需要一个 nick 来枚举处理人参与的项目，与 current_owner 过滤无关。
  const workspaceOwnerNick = explicitOwner ?? currentUserNick;

  // 关联需求属于特定项目，按 story_id 过滤时也必须落到单个项目（需传入 workspace_id）。
  if (filters.workspace_id || filters.story_id) {
    const workspaceId = resolveWorkspaceId(filters.workspace_id);
    return { bugs: await fetchBugsForWorkspace(filters, workspaceId, ownerFilter) };
  }

  return listBugsAcrossWorkspaces(filters, ownerFilter, workspaceOwnerNick);
}

/**
 * 跨处理人参与的所有项目聚合查询缺陷。
 * 单个项目查询失败（如无访问权限、限流、超时）不会中断整体聚合，仅丢弃该项目结果，
 * 并把失败数量与项目名映射通过 aggregation 元数据返回，供展示层提示。
 */
async function listBugsAcrossWorkspaces(
  filters: TapdBugFilters,
  ownerFilter: string | undefined,
  workspaceOwnerNick: string
): Promise<TapdBugListResult> {
  const workspaces = await listWorkspaces({ nick: workspaceOwnerNick });
  const aggregation: TapdWorkspaceAggregationMeta = {
    total: workspaces.length,
    succeeded: 0,
    failed: 0,
    workspaceNames: Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace.name])),
    failedWorkspaces: [],
  };

  if (workspaces.length === 0) {
    return { bugs: [], aggregation };
  }

  const settled = await Promise.allSettled(
    workspaces.map((workspace) => fetchBugsForWorkspace(filters, workspace.id, ownerFilter))
  );

  const bugs: TapdBug[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      aggregation.succeeded += 1;
      bugs.push(...result.value);
    } else {
      aggregation.failed += 1;
      const workspace = workspaces[index];
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      aggregation.failedWorkspaces.push({ id: workspace.id, name: workspace.name, reason });
      console.error(`[tapd] 项目 ${workspace.id}（${workspace.name}）缺陷查询失败：${reason}`);
    }
  });

  // 跨项目按最后修改时间倒序，保证聚合结果阅读顺序稳定。
  bugs.sort((a, b) => b.modified.localeCompare(a.modified));

  return { bugs, aggregation };
}

/**
 * 在单个项目内按过滤条件查询缺陷。
 * ownerFilter 由调用方解析后传入，避免聚合查询时对每个项目重复请求当前用户信息。
 */
async function fetchBugsForWorkspace(
  filters: TapdBugFilters,
  workspaceId: string,
  ownerFilter: string | undefined
): Promise<TapdBug[]> {
  const params = new URLSearchParams({
    fields: BUG_FIELDS,
    limit: String(Math.min(filters.limit ?? 30, 200)),
    // order 可由调用方覆盖；不传时保持默认按最后修改时间倒序。
    order: filters.order?.trim() || "modified desc",
    page: String(filters.page ?? 1),
    workspace_id: workspaceId,
  });

  // ownerFilter 为空表示按 id 精确查询、不限处理人；否则按处理人过滤。
  if (ownerFilter) {
    params.set("current_owner", formatUserOrFilter(ownerFilter));
  }

  const filteredBugIds = filters.story_id ? await getStoryRelatedBugIds(filters.story_id, workspaceId) : undefined;
  if (filteredBugIds) {
    const requestedBugIds = filters.id ? parseDelimitedList(filters.id) : [];
    const finalBugIds = requestedBugIds.length > 0 ? requestedBugIds.filter((id) => filteredBugIds.includes(id)) : filteredBugIds;

    if (finalBugIds.length === 0) {
      return [];
    }
    params.set("id", finalBugIds.join(","));
  } else if (filters.id) {
    params.set("id", filters.id);
  }

  // 字符串过滤字段：值非空时透传。
  const setParam = (key: string, value: string | null | undefined): void => {
    if (value) params.set(key, value);
  };
  setParam("title", filters.title);
  setParam("description", filters.description);
  setParam("status", filters.status);
  setParam("reporter", filters.reporter);
  setParam("created", filters.created);
  setParam("priority_label", filters.priority_label);
  setParam("severity", filters.severity);
  setParam("v_status", filters.v_status);
  setParam("label", filters.label);
  setParam("iteration_id", filters.iteration_id);
  setParam("module", filters.module);
  setParam("version_report", filters.version_report);
  setParam("feature", filters.feature);
  setParam("bugtype", filters.bugtype);
  setParam("source", filters.source);
  setParam("resolution", filters.resolution);
  setParam("frequency", filters.frequency);
  setParam("te", filters.te);
  setParam("de", filters.de);
  setParam("participator", filters.participator);
  setParam("begin", filters.begin);
  setParam("due", filters.due);
  setParam("deadline", filters.deadline);
  setParam("resolved", filters.resolved);
  setParam("closed", filters.closed);
  setParam("modified", filters.modified);
  setParam("release_id", filters.release_id);
  setParam("version_test", filters.version_test);
  setParam("version_fix", filters.version_fix);
  setParam("version_close", filters.version_close);
  setParam("baseline_find", filters.baseline_find);
  setParam("baseline_join", filters.baseline_join);
  setParam("baseline_test", filters.baseline_test);
  setParam("baseline_close", filters.baseline_close);
  setParam("cc", filters.cc);
  setParam("auditer", filters.auditer);
  setParam("confirmer", filters.confirmer);
  setParam("fixer", filters.fixer);
  setParam("closer", filters.closer);
  setParam("lastmodify", filters.lastmodify);
  setParam("in_progress_time", filters.in_progress_time);
  setParam("verify_time", filters.verify_time);
  setParam("reject_time", filters.reject_time);
  setParam("os", filters.os);
  setParam("platform", filters.platform);
  setParam("testmode", filters.testmode);
  setParam("testphase", filters.testphase);
  setParam("testtype", filters.testtype);
  setParam("estimate", filters.estimate);

  // 自定义字段过滤：key 即 TAPD 字段名，原样透传。
  if (filters.custom_fields) {
    for (const [key, value] of Object.entries(filters.custom_fields)) {
      if (value !== undefined) params.set(key, String(value));
    }
  }

  const payload = await fetchBugs(params);

  const bugs = (payload.data ?? [])
    .map((item) => item.Bug)
    .filter((item): item is TapdRawBug => Boolean(item))
    .map((bug) => normalizeBug(bug, workspaceId));

  return withStatusLabels(bugs, workspaceId, "bug");
}

/**
 * 查询 TAPD 缺陷变更历史。
 * TAPD 要求 bug_id 或 created 至少传入一个。
 */
export async function listBugChanges(filters: TapdBugChangeFilters): Promise<TapdBugChange[]> {
  if (!filters.bug_id && !filters.created && !filters.id) {
    throw new Error("bug_id、created 和 id 至少需要提供一个");
  }

  const workspaceId = resolveWorkspaceId(filters.workspace_id);
  const params = new URLSearchParams({
    limit: String(Math.min(filters.limit ?? 30, 200)),
    page: String(filters.page ?? 1),
    workspace_id: workspaceId,
  });

  const setParam = (key: string, value: string | undefined): void => {
    if (value) params.set(key, value);
  };
  setParam("bug_id", filters.bug_id);
  setParam("created", filters.created);
  setParam("id", filters.id);
  setParam("author", filters.author);
  setParam("field", filters.field);
  setParam("order", filters.order);
  if (filters.include_add_bug) {
    params.set("include_add_bug", "1");
  }

  const payload = await fetchBugChanges(params);

  const changes = (payload.data ?? [])
    .map((item) => item.BugChange ?? item.WorkitemChange)
    .filter((item): item is TapdRawBugChange => Boolean(item))
    .map((change) => normalizeBugChange(change, workspaceId));

  return withBugChangeStatusLabels(changes, workspaceId);
}

/**
 * 为状态变更（field 为 status）补充前后值的中文名。
 * 复用 getWorkflowStatusMap 的项目级缓存；枚举不可用、或某值无对应中文名时静默跳过（保留英文原值）。
 */
async function withBugChangeStatusLabels(changes: TapdBugChange[], workspaceId: string): Promise<TapdBugChange[]> {
  // bug_changes 未请求解析，status 变更前后值为英文 key（如 assigned => in_progress）；
  // 用 fieldKey（英文 key）而非 field（可能是 field_label 中文名）识别，避免漏匹配。
  if (!changes.some((change) => change.fieldKey === "status")) {
    return changes;
  }

  let statusMap: Record<string, string>;
  try {
    statusMap = await getWorkflowStatusMap(workspaceId, "bug");
  } catch {
    return changes;
  }

  return changes.map((change) => {
    if (change.fieldKey !== "status") {
      return change;
    }
    return {
      ...change,
      oldValueLabel: statusMap[change.oldValue],
      newValueLabel: statusMap[change.newValue],
    };
  });
}

async function getStoryRelatedBugIds(storyId: string, workspaceId: string): Promise<string[]> {
  // TAPD /stories/get_related_bugs 默认返回全部关联关系，官方接口不支持 page/limit 分页参数。
  const relationPayload = await fetchStoryRelatedBugs(
    new URLSearchParams({
      story_id: storyId,
      workspace_id: workspaceId,
    })
  );
  const relations = relationPayload.data ?? [];
  const bugIds = relations.map((relation) => relation.bug_id).filter(Boolean);
  return [...new Set(bugIds)];
}

/**
 * 把 base64 编码的文件内容解码为 Blob，供 multipart 上传使用。
 * 兼容带 data URI 前缀（data:image/png;base64,...）的输入。
 */
function base64ToBlob(fileBase64: string, contentType?: string): Blob {
  const base64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  return new Blob([buffer], contentType ? { type: contentType } : {});
}

/**
 * 上传图片到 TAPD，返回可嵌入描述富文本的 html_code。
 * 仅支持 png/gif/jpg/jpeg/bmp、单张 <5MB；图片仅限 TAPD 平台内使用，不能外链。
 */
export async function uploadBugImage(input: TapdUploadBugImageInput): Promise<TapdUploadBugImageResult> {
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const form = new FormData();
  form.set("workspace_id", workspaceId);
  form.set("image", base64ToBlob(input.fileBase64, input.contentType), input.filename);

  const payload = await uploadImage(form);
  const data = payload.data;
  if (!data?.html_code) {
    throw new Error(payload.info || "TAPD 图片上传成功但未返回 html_code");
  }

  return { imageSrc: data.image_src ?? "", htmlCode: data.html_code };
}

/**
 * 上传附件到指定缺陷（附件区，type=bug）。支持任意文件类型，单文件 <250MB。
 */
export async function uploadBugAttachment(input: TapdUploadBugAttachmentInput): Promise<TapdAttachment> {
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const form = new FormData();
  form.set("workspace_id", workspaceId);
  form.set("type", "bug");
  form.set("entry_id", input.bugId);
  form.set("file", base64ToBlob(input.fileBase64, input.contentType), input.filename);

  const payload = await uploadAttachment(form);
  const attachment = payload.data?.Attachment;
  if (!attachment) {
    throw new Error(payload.info || "TAPD 附件上传成功但未返回附件内容");
  }

  return normalizeAttachment(attachment);
}

/**
 * 读取缺陷当前描述正文。仅取 id/description，避免拉取评论附件等无关上下文。
 */
async function getBugDescription(bugId: string, workspaceId: string): Promise<string> {
  const payload = await fetchBugs(
    new URLSearchParams({
      fields: "id,description",
      id: bugId,
      workspace_id: workspaceId,
    })
  );
  return payload.data?.[0]?.Bug?.description ?? "";
}

/**
 * 组合操作：上传图片 → 读取缺陷当前描述 → 追加 html_code 后整体回写描述。
 * 先读后写，避免直接覆盖丢失原有正文；图片上传成功但描述写入失败时，结果中标记并保留图片信息。
 */
export async function appendBugDescriptionImage(
  input: TapdAppendBugDescriptionImageInput
): Promise<TapdAppendBugDescriptionImageResult> {
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const uploaded = await uploadBugImage({ ...input, workspaceId });

  const [currentDescription, currentUser] = await Promise.all([
    getBugDescription(input.bugId, workspaceId),
    getCurrentUser(),
  ]);

  try {
    await updateBug(
      new URLSearchParams({
        current_user: currentUser.nick,
        description: `${currentDescription}${uploaded.htmlCode}`,
        id: input.bugId,
        workspace_id: workspaceId,
      })
    );
    return { ...uploaded, descriptionUpdated: true };
  } catch (error) {
    return {
      ...uploaded,
      descriptionUpdated: false,
      descriptionUpdateError: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 创建 TAPD bug。
 * 默认使用当前 access token 对应用户作为报告人，并在未指定处理人时指派给当前用户。
 */
export async function createBug(input: TapdCreateBugInput): Promise<TapdCreateBugResult> {
  // 与 createStory/writeback 一致：本地可判定的参数错误先失败，不消耗 getCurrentUser 网络请求。
  assertCustomFieldKeys(input.customFields);
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const currentUser = await getCurrentUser();
  const currentOwners = input.currentOwners?.length ? input.currentOwners : [currentUser.nick];
  const body = new URLSearchParams({
    current_owner: formatOwners(currentOwners),
    description: input.description,
    reporter: currentUser.nick,
    title: input.title,
    workspace_id: workspaceId,
  });

  // 可选字段统一透传：值为 undefined 时跳过，数值转字符串后写入表单。
  const setField = (key: string, value: string | number | undefined): void => {
    if (value !== undefined) body.set(key, String(value));
  };
  setField("priority_label", input.priorityLabel);
  setField("severity", input.severity);
  setField("module", input.module);
  setField("bugtype", input.bugtype);
  setField("version_report", input.versionReport);
  setField("feature", input.feature);
  setField("release_id", input.releaseId);
  setField("version_test", input.versionTest);
  setField("version_fix", input.versionFix);
  setField("version_close", input.versionClose);
  setField("baseline_find", input.baselineFind);
  setField("baseline_join", input.baselineJoin);
  setField("baseline_test", input.baselineTest);
  setField("baseline_close", input.baselineClose);
  setField("cc", input.cc);
  setField("participator", input.participator);
  setField("te", input.te);
  setField("de", input.de);
  setField("fixer", input.fixer);
  setField("confirmer", input.confirmer);
  setField("auditer", input.auditer);
  setField("closer", input.closer);
  setField("begin", input.begin);
  setField("due", input.due);
  setField("deadline", input.deadline);
  setField("iteration_id", input.iterationId);
  setField("size", input.size);
  setField("os", input.os);
  setField("platform", input.platform);
  setField("testmode", input.testmode);
  setField("testphase", input.testphase);
  setField("testtype", input.testtype);
  setField("source", input.source);
  setField("originphase", input.originphase);
  setField("sourcephase", input.sourcephase);
  setField("resolution", input.resolution);
  setField("frequency", input.frequency);
  setField("estimate", input.estimate);
  setField("effort", input.effort);
  setField("label", input.label);
  setField("template_id", input.templateId);
  setField("is_apply_template_default_value", input.isApplyTemplateDefaultValue);
  // 自定义字段：key 即 TAPD 字段名，原样透传。
  if (input.customFields) {
    for (const [key, value] of Object.entries(input.customFields)) {
      setField(key, value);
    }
  }

  const payload = await createBugRequest(body);
  const bugRecord = payload.data?.Bug;

  if (!bugRecord) {
    throw new Error(payload.info || "TAPD bug 创建成功但未返回缺陷内容");
  }

  const bug = await enrichStatusLabel(normalizeBug(bugRecord, workspaceId), workspaceId, "bug");
  const result: TapdCreateBugResult = { bug };

  if (input.storyId) {
    result.relatedStoryId = input.storyId;
    try {
      const relationPayload = await createRelation(
        new URLSearchParams({
          source_id: input.storyId,
          source_type: "story",
          target_id: bug.id,
          target_type: "bug",
          workspace_id: workspaceId,
        })
      );
      result.relationId = relationPayload.data?.Relation?.id;
    } catch (error) {
      result.relationError = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
}

// 自定义字段 key 必须落在 TAPD 自定义字段命名空间，否则原样透传会误撞 id/workspace_id/status
// 等保留参数（list/create 用 .set 直接覆盖，writeback 数组构造则产生重复 key），故提前拦截。
const CUSTOM_FIELD_KEY_PATTERN = /^(custom_field_|cus_|custom_plan_field_)/;
function assertCustomFieldKeys(customFields: Record<string, string | number> | undefined): void {
  if (!customFields) return;
  for (const key of Object.keys(customFields)) {
    if (!CUSTOM_FIELD_KEY_PATTERN.test(key)) {
      throw new Error(
        `custom_fields 字段名「${key}」不合法，仅支持 custom_field_*、cus_* 或 custom_plan_field_* 前缀的 TAPD 自定义字段`
      );
    }
  }
}

/**
 * 查询 TAPD 需求列表。
 * 按 TAPD 官方 /stories 查询参数过滤需求；处理人过滤默认使用当前登录用户 nick，
 * 传入 filters.owner 时改为查询指定处理人名下的需求。
 * 传入 workspace_id 时落到单个项目查询；不传时聚合处理人参与的所有项目，
 * 符合“查我名下所有需求”的语义。聚合查询会在返回结果的 aggregation 中带回项目名映射与失败摘要。
 */
export async function listStories(filters: TapdStoryFilters): Promise<TapdStoryListResult> {
  // 在 fan-out 之前一次性校验，避免聚合查询里把非法 key 摊成每个项目各报一次错。
  assertCustomFieldKeys(filters.custom_fields);

  // 显式传入的 owner（去除空白后非空）优先；空字符串视为未提供。
  const explicitOwner = filters.owner?.trim() || undefined;
  const currentUserNick = (await getCurrentUser()).nick;
  // 按 id 精确查询时（且未显式指定 owner）跳过处理人过滤，与 listBugs 对齐：
  // 否则需求转给他人后按 ID 仍会被默认的“当前用户”过滤掉，被误判为“需求不存在”。
  const ownerFilter = explicitOwner ?? (filters.id ? undefined : currentUserNick);
  // 跨项目聚合仍需要一个 nick 来枚举处理人参与的项目，与 owner 过滤无关。
  const workspaceOwnerNick = explicitOwner ?? currentUserNick;

  if (filters.workspace_id) {
    return { stories: await fetchStoriesForWorkspace(filters, resolveWorkspaceId(filters.workspace_id), ownerFilter) };
  }

  return listStoriesAcrossWorkspaces(filters, ownerFilter, workspaceOwnerNick);
}

/**
 * 跨处理人参与的所有项目聚合查询需求。
 * 单个项目查询失败（如无访问权限、限流、超时）不会中断整体聚合，仅丢弃该项目结果，
 * 并把失败数量与项目名映射通过 aggregation 元数据返回，供展示层提示。
 */
async function listStoriesAcrossWorkspaces(
  filters: TapdStoryFilters,
  ownerFilter: string | undefined,
  workspaceOwnerNick: string
): Promise<TapdStoryListResult> {
  const workspaces = await listWorkspaces({ nick: workspaceOwnerNick });
  const aggregation: TapdWorkspaceAggregationMeta = {
    total: workspaces.length,
    succeeded: 0,
    failed: 0,
    workspaceNames: Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace.name])),
    failedWorkspaces: [],
  };

  if (workspaces.length === 0) {
    return { stories: [], aggregation };
  }

  const settled = await Promise.allSettled(
    workspaces.map((workspace) => fetchStoriesForWorkspace(filters, workspace.id, ownerFilter))
  );

  const stories: TapdStory[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      aggregation.succeeded += 1;
      stories.push(...result.value);
    } else {
      aggregation.failed += 1;
      const workspace = workspaces[index];
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      aggregation.failedWorkspaces.push({ id: workspace.id, name: workspace.name, reason });
      console.error(`[tapd] 项目 ${workspace.id}（${workspace.name}）需求查询失败：${reason}`);
    }
  });

  // 跨项目按最后修改时间倒序，保证聚合结果阅读顺序稳定。
  stories.sort((a, b) => b.modified.localeCompare(a.modified));

  return { stories, aggregation };
}

/**
 * 在单个项目内按过滤条件查询需求。
 * ownerFilter 由调用方解析后传入，避免聚合查询时对每个项目重复请求当前用户信息。
 */
async function fetchStoriesForWorkspace(
  filters: TapdStoryFilters,
  workspaceId: string,
  ownerFilter: string | undefined
): Promise<TapdStory[]> {
  const params = new URLSearchParams({
    fields: STORY_FIELDS,
    limit: String(Math.min(filters.limit ?? 30, 200)),
    // order 可由调用方覆盖；不传时保持默认按最后修改时间倒序。
    order: filters.order?.trim() || "modified desc",
    page: String(filters.page ?? 1),
    workspace_id: workspaceId,
  });

  // ownerFilter 为空表示按 id 精确查询、不限处理人；否则按处理人过滤。
  if (ownerFilter) {
    params.set("owner", formatUserOrFilter(ownerFilter));
  }

  // 字符串过滤字段：值非空时透传。
  const setParam = (key: string, value: string | null | undefined): void => {
    if (value) params.set(key, value);
  };
  setParam("id", filters.id);
  setParam("name", filters.name);
  setParam("description", filters.description);
  setParam("status", filters.status);
  setParam("creator", filters.creator);
  setParam("created", filters.created);
  setParam("priority_label", filters.priority_label);
  setParam("v_status", filters.v_status);
  setParam("label", filters.label);
  setParam("version", filters.version);
  setParam("module", filters.module);
  setParam("iteration_id", filters.iteration_id);
  setParam("category_id", filters.category_id);
  setParam("begin", filters.begin);
  setParam("due", filters.due);
  setParam("modified", filters.modified);
  setParam("completed", filters.completed);
  setParam("parent_id", filters.parent_id);
  setParam("ancestor_id", filters.ancestor_id);
  setParam("children_id", filters.children_id);
  setParam("feature", filters.feature);
  setParam("tech_risk", filters.tech_risk);
  setParam("workitem_type_id", filters.workitem_type_id);
  setParam("release_id", filters.release_id);
  setParam("size", filters.size);
  setParam("test_focus", filters.test_focus);
  setParam("cc", filters.cc);
  setParam("developer", filters.developer);
  setParam("source", filters.source);
  setParam("type", filters.type);
  setParam("effort", filters.effort);
  setParam("effort_completed", filters.effort_completed);
  setParam("remain", filters.remain);
  setParam("exceed", filters.exceed);

  // 布尔开关：TAPD 取值 0/1，仅在显式传入时设置。
  const setFlag = (key: string, value: boolean | undefined): void => {
    if (value !== undefined) params.set(key, value ? "1" : "0");
  };
  setFlag("include_sub_iteration", filters.include_sub_iteration);
  setFlag("include_sub_category", filters.include_sub_category);
  setFlag("include_leaf_stories", filters.include_leaf_stories);

  // 自定义字段过滤：key 即 TAPD 字段名，原样透传。
  if (filters.custom_fields) {
    for (const [key, value] of Object.entries(filters.custom_fields)) {
      if (value !== undefined) params.set(key, String(value));
    }
  }

  const payload = await fetchStories(params);

  const stories = (payload.data ?? [])
    .map((item) => item.Story)
    .filter((item): item is TapdRawStory => Boolean(item))
    .map((story) => normalizeStory(story, workspaceId));

  return withStatusLabels(stories, workspaceId, "story");
}

/**
 * 查询 TAPD 需求变更历史。
 * TAPD 要求 story_id 或 created 至少传入一个；include_details 会映射为 need_parse_changes=1。
 */
export async function listStoryChanges(filters: TapdStoryChangeFilters): Promise<TapdStoryChange[]> {
  if (!filters.story_id && !filters.created && !filters.id) {
    throw new Error("story_id、created 和 id 至少需要提供一个");
  }

  const workspaceId = resolveWorkspaceId(filters.workspace_id);
  const params = new URLSearchParams({
    limit: String(Math.min(filters.limit ?? 30, 100)),
    page: String(filters.page ?? 1),
    workspace_id: workspaceId,
  });

  const setParam = (key: string, value: string | undefined): void => {
    if (value) params.set(key, value);
  };
  setParam("story_id", filters.story_id);
  setParam("created", filters.created);
  setParam("id", filters.id);
  setParam("creator", filters.creator);
  setParam("change_field", filters.change_field);
  setParam("change_type", filters.change_type);
  setParam("order", filters.order);
  if (filters.include_details) {
    params.set("need_parse_changes", "1");
  }

  const payload = await fetchStoryChanges(params);

  return (payload.data ?? [])
    .map((item) => item.WorkitemChange)
    .filter((item): item is TapdRawStoryChange => Boolean(item))
    .map((change) => normalizeStoryChange(change, workspaceId));
}

/**
 * 创建 TAPD 需求。
 * 默认使用当前 access token 对应用户作为创建人，并在未指定处理人时指派给当前用户。
 */
export async function createStory(input: TapdCreateStoryInput): Promise<TapdStory> {
  assertCustomFieldKeys(input.customFields);
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const currentUser = await getCurrentUser();
  const owners = input.owners?.length ? input.owners : [currentUser.nick];
  const body = new URLSearchParams({
    creator: currentUser.nick,
    description: input.description,
    name: input.name,
    owner: formatOwners(owners),
    workspace_id: workspaceId,
  });

  // 可选字段统一透传：值为 undefined 时跳过，数值转字符串后写入表单。
  const setField = (key: string, value: string | number | undefined): void => {
    if (value !== undefined) body.set(key, String(value));
  };
  setField("priority_label", input.priorityLabel);
  setField("module", input.module);
  setField("iteration_id", input.iterationId);
  setField("category_id", input.categoryId);
  setField("parent_id", input.parentId);
  setField("label", input.label);
  setField("cc", input.cc);
  setField("developer", input.developer);
  setField("begin", input.begin);
  setField("due", input.due);
  setField("business_value", input.businessValue);
  setField("version", input.version);
  setField("size", input.size);
  setField("test_focus", input.testFocus);
  setField("effort", input.effort);
  setField("effort_completed", input.effortCompleted);
  setField("remain", input.remain);
  setField("exceed", input.exceed);
  setField("release_id", input.releaseId);
  setField("source", input.source);
  setField("type", input.type);
  setField("feature", input.feature);
  setField("tech_risk", input.techRisk);
  setField("workitem_type_id", input.workitemTypeId);
  setField("templated_id", input.templatedId);
  setField("is_apply_template_default_value", input.isApplyTemplateDefaultValue);
  setField("apply_template", input.applyTemplate);
  // 自定义字段：key 即 TAPD 字段名，原样透传。
  if (input.customFields) {
    for (const [key, value] of Object.entries(input.customFields)) {
      setField(key, value);
    }
  }

  const payload = await createStoryRequest(body);
  const storyRecord = payload.data?.Story;

  if (!storyRecord) {
    throw new Error(payload.info || "TAPD 需求创建成功但未返回需求内容");
  }

  return enrichStatusLabel(normalizeStory(storyRecord, workspaceId), workspaceId, "story");
}

/**
 * 获取单个 TAPD bug 详情，并聚合评论、附件与描述/评论中的媒体引用。
 * workspaceId 为缺陷所属项目 ID，必填（可从列表查询结果或 tapd_list_workspaces 获取）。
 */
export async function getBug(bugId: string, workspaceId?: string): Promise<TapdBugDetail> {
  const wsId = resolveWorkspaceId(workspaceId);

  const params = new URLSearchParams({
    fields: BUG_FIELDS,
    id: bugId,
    workspace_id: wsId,
  });

  const payload = await fetchBugs(params);
  const bugRecord = payload.data?.[0]?.Bug;

  if (!bugRecord) {
    throw new Error(`TAPD bug ${bugId} 在项目 ${wsId} 中未找到，请确认 bug_id 与 workspace_id 是否匹配`);
  }

  const bug = await enrichStatusLabel(normalizeBug(bugRecord, wsId), wsId, "bug");
  const [comments, attachments] = await Promise.all([fetchEntryComments(bugId, "bug|bug_remark", wsId), fetchEntryAttachments(bugId, wsId)]);
  const [attachmentsWithDownloads, mediaReferences] = await Promise.all([
    attachDownloadUrls(attachments, wsId),
    resolveImageDownloadUrls(
      [
        ...extractMediaReferences(bug.description, "description"),
        ...comments.flatMap((comment) => extractMediaReferences(comment.description, "comment", comment.id)),
      ],
      wsId
    ),
  ]);

  return {
    ...bug,
    comments,
    attachments: attachmentsWithDownloads,
    mediaReferences,
  };
}

/**
 * 获取单个 TAPD 需求详情，并聚合评论、附件与描述/评论中的媒体引用。
 * workspaceId 为需求所属项目 ID，必填（可从列表查询结果或 tapd_list_workspaces 获取）。
 */
export async function getStory(storyId: string, workspaceId?: string): Promise<TapdStoryDetail> {
  const wsId = resolveWorkspaceId(workspaceId);

  const params = new URLSearchParams({
    fields: STORY_FIELDS,
    id: storyId,
    workspace_id: wsId,
  });

  const payload = await fetchStories(params);
  const storyRecord = payload.data?.[0]?.Story;

  if (!storyRecord) {
    throw new Error(`TAPD 需求 ${storyId} 在项目 ${wsId} 中未找到，请确认 story_id 与 workspace_id 是否匹配`);
  }

  const story = await enrichStatusLabel(normalizeStory(storyRecord, wsId), wsId, "story");
  // 评论、附件和媒体解析都属于详情上下文，合并返回能让 Agent 一次拿到完整需求信息。
  const [comments, attachments] = await Promise.all([fetchEntryComments(storyId, "stories", wsId), fetchEntryAttachments(storyId, wsId)]);
  const [attachmentsWithDownloads, mediaReferences] = await Promise.all([
    attachDownloadUrls(attachments, wsId),
    resolveImageDownloadUrls(
      [
        ...extractMediaReferences(story.description, "description"),
        ...comments.flatMap((comment) => extractMediaReferences(comment.description, "comment", comment.id)),
      ],
      wsId
    ),
  ]);

  return {
    ...story,
    comments,
    attachments: attachmentsWithDownloads,
    mediaReferences,
  };
}

/**
 * 获取指定实体的普通评论和流转评论。
 * bug 使用 bug|bug_remark；需求使用 stories（TAPD 官方 entry_type 枚举值）。
 */
async function fetchEntryComments(
  entryId: string,
  entryType: "bug|bug_remark" | "stories",
  workspaceId: string
): Promise<TapdComment[]> {
  const payload = await fetchComments(
    new URLSearchParams({
      entry_id: entryId,
      entry_type: entryType,
      fields: COMMENT_FIELDS,
      limit: "200",
      order: "created asc",
      workspace_id: workspaceId,
    })
  );

  return (payload.data ?? [])
    .map((item) => item.Comment)
    .filter((item): item is TapdRawComment => Boolean(item))
    .map(normalizeComment);
}

/**
 * 获取指定实体的附件列表。
 * 这里只返回附件元信息，具体临时下载链接由 attachDownloadUrls 单独补齐。
 */
async function fetchEntryAttachments(entryId: string, workspaceId: string): Promise<TapdAttachment[]> {
  const payload = await fetchAttachments(
    new URLSearchParams({
      entry_id: entryId,
      limit: "200",
      workspace_id: workspaceId,
    })
  );

  return (payload.data ?? [])
    .map((item) => item.Attachment)
    .filter((item): item is TapdRawAttachment => Boolean(item))
    .map(normalizeAttachment);
}

/**
 * 为每个附件补充 TAPD 临时下载链接。
 * 单个附件失败时保留附件本身并记录 downloadError，避免一个失效附件影响整条 bug 详情。
 */
async function attachDownloadUrls(attachments: TapdAttachment[], workspaceId: string): Promise<TapdAttachment[]> {
  return Promise.all(
    attachments.map(async (attachment) => {
      try {
        const payload = await fetchAttachmentDownload(
          new URLSearchParams({
            id: attachment.id,
            workspace_id: workspaceId,
          })
        );
        const downloadRecord = payload.data?.Attachment;
        const downloadUrl = downloadRecord?.download_url;

        return downloadUrl ? { ...attachment, downloadUrl } : attachment;
      } catch (error) {
        return {
          ...attachment,
          downloadError: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );
}

/**
 * 为描述和评论中解析出的图片引用补充临时下载链接。
 * 相同图片路径会复用同一个请求，减少 TAPD /files/get_image 调用次数。
 */
async function resolveImageDownloadUrls(
  mediaReferences: TapdMediaReference[],
  workspaceId: string
): Promise<TapdMediaReference[]> {
  const seen = new Map<string, Promise<Pick<TapdMediaReference, "downloadError" | "downloadUrl" | "filename">>>();

  return Promise.all(
    mediaReferences.map(async (reference) => {
      if (reference.kind !== "image") {
        return reference;
      }

      if (!seen.has(reference.value)) {
        seen.set(reference.value, fetchImageReferenceDownload(reference.value, workspaceId));
      }

      return {
        ...reference,
        ...(await seen.get(reference.value)),
      };
    })
  );
}

/**
 * 获取单张内嵌图片的临时下载链接。
 * TAPD 要求 image_path 可以是完整 URL 或 /tfl/... 路径，并且下载链接有时效。
 */
async function fetchImageReferenceDownload(
  imagePath: string,
  workspaceId: string
): Promise<Pick<TapdMediaReference, "downloadError" | "downloadUrl" | "filename">> {
  try {
    const payload = await fetchImageDownload(
      new URLSearchParams({
        image_path: imagePath,
        workspace_id: workspaceId,
      })
    );
    const image = payload.data?.Attachment;

    return {
      downloadUrl: image?.download_url,
      filename: image?.filename,
    };
  } catch (error) {
    return {
      downloadError: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatOwners(owners: string[]): string {
  const uniqueOwners = [...new Set(owners.map((owner) => owner.trim().replace(/;+$/g, "")).filter(Boolean))];
  return uniqueOwners.map((owner) => `${owner};`).join("");
}

/**
 * 构造 TAPD 用户字段的 USER_OR 查询条件，匹配处理人列表中包含指定 nick 的记录。
 */
function formatUserOrFilter(nick: string): string {
  return `USER_OR<${nick}>`;
}

async function getBugCurrentOwners(bugId: string, workspaceId: string): Promise<string[]> {
  const payload = await fetchBugs(
    new URLSearchParams({
      fields: "id,current_owner",
      id: bugId,
      workspace_id: workspaceId,
    })
  );
  const currentOwner = payload.data?.[0]?.Bug?.current_owner;

  return parseDelimitedList(currentOwner ?? "");
}

async function getStoryCurrentOwners(storyId: string, workspaceId: string): Promise<string[]> {
  const payload = await fetchStories(
    new URLSearchParams({
      fields: "id,owner",
      id: storyId,
      workspace_id: workspaceId,
    })
  );
  const owner = payload.data?.[0]?.Story?.owner;

  return parseDelimitedList(owner ?? "");
}

/**
 * 获取并缓存项目工作流状态英文名→中文名映射。
 * 缓存 Promise 而非结果，避免并发回写时重复请求；请求失败时清除缓存，避免永久缓存失败结果。
 */
async function getWorkflowStatusMap(workspaceId: string, system: "bug" | "story"): Promise<Record<string, string>> {
  const cacheKey = `${workspaceId}:${system}`;
  if (!cachedWorkflowStatuses.has(cacheKey)) {
    const pending = fetchWorkflowStatusMap(new URLSearchParams({ system, workspace_id: workspaceId })).then(
      (payload) => payload.data ?? {}
    );
    pending.catch(() => cachedWorkflowStatuses.delete(cacheKey));
    cachedWorkflowStatuses.set(cacheKey, pending);
  }

  return cachedWorkflowStatuses.get(cacheKey)!;
}

/**
 * 用项目工作流状态映射为缺陷/需求补充状态中文名（statusLabel）。
 * 枚举接口不可用、或某状态无对应中文名时静默跳过，statusLabel 留空，不阻断查询。
 */
async function withStatusLabels<T extends { status: string; statusLabel?: string }>(
  items: T[],
  workspaceId: string,
  system: "bug" | "story"
): Promise<T[]> {
  if (items.length === 0) {
    return items;
  }

  let statusMap: Record<string, string>;
  try {
    statusMap = await getWorkflowStatusMap(workspaceId, system);
  } catch {
    return items;
  }

  return items.map((item) => {
    const label = statusMap[item.status];
    return label ? { ...item, statusLabel: label } : item;
  });
}

/**
 * withStatusLabels 的单条便捷封装，用于详情/创建等只处理一个对象的场景。
 */
async function enrichStatusLabel<T extends { status: string; statusLabel?: string }>(
  item: T,
  workspaceId: string,
  system: "bug" | "story"
): Promise<T> {
  const [enriched] = await withStatusLabels([item], workspaceId, system);
  return enriched;
}

/**
 * 写入前校验目标状态是否属于项目工作流允许的状态。
 * 返回 null 表示校验通过；返回字符串表示校验失败原因（含可选状态清单）。
 * 工作流枚举接口本身请求失败（或返回空）时放行，避免枚举不可用时阻断正常的状态回写。
 */
async function validateTargetStatus(
  targetStatus: string,
  workspaceId: string,
  system: "bug" | "story"
): Promise<string | null> {
  let statusMap: Record<string, string>;
  try {
    statusMap = await getWorkflowStatusMap(workspaceId, system);
  } catch {
    return null;
  }

  const validStatuses = Object.keys(statusMap);
  if (validStatuses.length === 0 || validStatuses.includes(targetStatus)) {
    return null;
  }

  const options = validStatuses.map((status) => `${status}（${statusMap[status]}）`).join("、");
  return `状态 ${targetStatus} 不在项目工作流允许的状态中。可选状态：${options}`;
}

/**
 * 自由组合 TAPD 评论、标题、状态和处理人更新。
 * 单个动作失败不会阻止其他动作执行，结果中会明确标记部分成功和失败原因。
 */
export async function writeback(input: TapdWritebackInput): Promise<TapdWritebackResult> {
  // 非法自定义字段名提前抛出，避免在部分动作已提交后才失败造成不可预期的半成功。
  assertCustomFieldKeys(input.customFields);
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const currentUser = await getCurrentUser();
  const result: TapdWritebackResult = {
    bugId: input.bugId,
    workspaceId,
    author: currentUser.nick,
    partialFailure: false,
  };

  if (input.comment) {
    try {
      const commentParams = new URLSearchParams({
        author: currentUser.nick,
        description: input.comment,
        entry_id: input.bugId,
        entry_type: "bug",
        workspace_id: workspaceId,
      });
      // 可选：将评论挂到指定评论树或作为某条评论的回复。
      if (input.commentRootId) commentParams.set("root_id", input.commentRootId);
      if (input.commentReplyId) commentParams.set("reply_id", input.commentReplyId);
      const commentPayload = await createComment(commentParams);
      result.commentCreated = true;
      result.commentId = commentPayload.data?.Comment?.id;
    } catch (error) {
      result.commentCreated = false;
      result.commentCreateError = error instanceof Error ? error.message : String(error);
      result.partialFailure = true;
    }
  }

  // 可选：更新标准/自定义字段。这批字段无独立成功语义，聚合为一次 /bugs 更新请求，
  // 与 title/description/status/owner 四个带专门处理逻辑的动作分开。
  {
    const fieldEntries: Array<[string, string]> = [];
    const pushField = (key: string, value: string | number | undefined): void => {
      if (value !== undefined) fieldEntries.push([key, String(value)]);
    };
    pushField("priority_label", input.priorityLabel);
    pushField("severity", input.severity);
    pushField("module", input.module);
    pushField("feature", input.feature);
    pushField("release_id", input.releaseId);
    pushField("version_report", input.versionReport);
    pushField("version_test", input.versionTest);
    pushField("version_fix", input.versionFix);
    pushField("version_close", input.versionClose);
    pushField("baseline_find", input.baselineFind);
    pushField("baseline_join", input.baselineJoin);
    pushField("baseline_test", input.baselineTest);
    pushField("baseline_close", input.baselineClose);
    pushField("cc", input.cc);
    pushField("participator", input.participator);
    pushField("te", input.te);
    pushField("de", input.de);
    pushField("fixer", input.fixer);
    pushField("confirmer", input.confirmer);
    pushField("auditer", input.auditer);
    pushField("closer", input.closer);
    pushField("begin", input.begin);
    pushField("due", input.due);
    pushField("deadline", input.deadline);
    pushField("iteration_id", input.iterationId);
    pushField("size", input.size);
    pushField("os", input.os);
    pushField("platform", input.platform);
    pushField("testmode", input.testmode);
    pushField("testphase", input.testphase);
    pushField("testtype", input.testtype);
    pushField("source", input.source);
    pushField("bugtype", input.bugtype);
    pushField("frequency", input.frequency);
    pushField("originphase", input.originphase);
    pushField("sourcephase", input.sourcephase);
    pushField("resolution", input.resolution);
    pushField("estimate", input.estimate);
    pushField("effort", input.effort);
    pushField("label", input.label);
    // 自定义字段：key 即 TAPD 字段名，原样透传。
    if (input.customFields) {
      for (const [key, value] of Object.entries(input.customFields)) {
        pushField(key, value);
      }
    }

    if (fieldEntries.length > 0) {
      result.updatedFields = fieldEntries.map(([key]) => key);
      try {
        await updateBug(
          new URLSearchParams([
            ["current_user", currentUser.nick],
            ["id", input.bugId],
            ["workspace_id", workspaceId],
            ...fieldEntries,
          ])
        );
        result.fieldsUpdated = true;
      } catch (error) {
        result.fieldsUpdated = false;
        result.fieldsUpdateError = error instanceof Error ? error.message : String(error);
        result.partialFailure = true;
      }
    }
  }

  // 可选：更新标题。TAPD 标题更新走同一个 /bugs 更新接口，与状态/处理人相互独立。
  if (input.title) {
    result.targetTitle = input.title;
    try {
      await updateBug(
        new URLSearchParams({
          current_user: currentUser.nick,
          id: input.bugId,
          title: input.title,
          workspace_id: workspaceId,
        })
      );
      result.titleUpdated = true;
    } catch (error) {
      result.titleUpdated = false;
      result.titleUpdateError = error instanceof Error ? error.message : String(error);
      result.partialFailure = true;
    }
  }

  // 可选：更新描述正文。TAPD description 为整体覆盖语义，调用方需传入完整正文。
  if (input.description) {
    try {
      await updateBug(
        new URLSearchParams({
          current_user: currentUser.nick,
          description: input.description,
          id: input.bugId,
          workspace_id: workspaceId,
        })
      );
      result.descriptionUpdated = true;
    } catch (error) {
      result.descriptionUpdated = false;
      result.descriptionUpdateError = error instanceof Error ? error.message : String(error);
      result.partialFailure = true;
    }
  }

  // 可选：更新状态。写入前先校验目标状态是否属于项目工作流合法状态，
  // 避免把非法状态（如拼写错误或臆造的状态）直接写入（TAPD 对非法状态不会报错，会静默写入）。
  if (input.targetStatus) {
    result.targetStatus = input.targetStatus;
    const statusError = await validateTargetStatus(input.targetStatus, workspaceId, "bug");
    if (statusError) {
      result.statusUpdated = false;
      result.statusUpdateError = statusError;
      result.partialFailure = true;
    } else {
      try {
        await updateBug(
          new URLSearchParams({
            current_user: currentUser.nick,
            id: input.bugId,
            status: input.targetStatus,
            workspace_id: workspaceId,
          })
        );
        result.statusUpdated = true;
      } catch (error) {
        result.statusUpdated = false;
        result.statusUpdateError = error instanceof Error ? error.message : String(error);
        result.partialFailure = true;
      }
    }
  }

  // 可选：更新处理人。TAPD current_owner 使用用户 nick，并以分号结尾。
  if (input.targetOwners?.length) {
    const ownerUpdateMode = input.ownerUpdateMode ?? "append";
    const finalOwners =
      ownerUpdateMode === "append"
        ? [...new Set([...(await getBugCurrentOwners(input.bugId, workspaceId)), ...input.targetOwners])]
        : input.targetOwners;

    result.targetOwners = input.targetOwners;
    result.ownerUpdateMode = ownerUpdateMode;
    result.finalOwners = finalOwners;
    try {
      await updateBug(
        new URLSearchParams({
          current_owner: formatOwners(finalOwners),
          current_user: currentUser.nick,
          id: input.bugId,
          workspace_id: workspaceId,
        })
      );
      result.ownerUpdated = true;
    } catch (error) {
      result.ownerUpdated = false;
      result.ownerUpdateError = error instanceof Error ? error.message : String(error);
      result.partialFailure = true;
    }
  }

  return result;
}

/**
 * 自由组合 TAPD 需求评论、状态和处理人更新。
 * 单个动作失败不会阻止其他动作执行，结果中会明确标记部分成功和失败原因。
 */
export async function writebackStory(input: TapdStoryWritebackInput): Promise<TapdStoryWritebackResult> {
  // 非法自定义字段名提前抛出，避免在部分动作已提交后才失败造成不可预期的半成功。
  assertCustomFieldKeys(input.customFields);
  const workspaceId = resolveWorkspaceId(input.workspaceId);
  const currentUser = await getCurrentUser();
  const result: TapdStoryWritebackResult = {
    storyId: input.storyId,
    workspaceId,
    author: currentUser.nick,
    partialFailure: false,
  };

  if (input.comment) {
    try {
      const commentParams = new URLSearchParams({
        author: currentUser.nick,
        description: input.comment,
        entry_id: input.storyId,
        entry_type: "stories",
        workspace_id: workspaceId,
      });
      // 可选：将评论挂到指定评论树或作为某条评论的回复。
      if (input.commentRootId) commentParams.set("root_id", input.commentRootId);
      if (input.commentReplyId) commentParams.set("reply_id", input.commentReplyId);
      const commentPayload = await createComment(commentParams);
      result.commentCreated = true;
      result.commentId = commentPayload.data?.Comment?.id;
    } catch (error) {
      result.commentCreated = false;
      result.commentCreateError = error instanceof Error ? error.message : String(error);
      result.partialFailure = true;
    }
  }

  // 可选：更新标准/自定义字段。这批字段无独立成功语义，聚合为一次 /stories 更新请求，
  // 与 description/status/owner 三个带专门处理逻辑的动作分开。
  {
    const fieldEntries: Array<[string, string]> = [];
    const pushField = (key: string, value: string | number | undefined): void => {
      if (value !== undefined) fieldEntries.push([key, String(value)]);
    };
    pushField("name", input.name);
    pushField("priority_label", input.priorityLabel);
    pushField("business_value", input.businessValue);
    pushField("version", input.version);
    pushField("module", input.module);
    pushField("test_focus", input.testFocus);
    pushField("size", input.size);
    pushField("cc", input.cc);
    pushField("developer", input.developer);
    pushField("begin", input.begin);
    pushField("due", input.due);
    pushField("iteration_id", input.iterationId);
    pushField("effort", input.effort);
    pushField("effort_completed", input.effortCompleted);
    pushField("remain", input.remain);
    pushField("exceed", input.exceed);
    pushField("category_id", input.categoryId);
    pushField("release_id", input.releaseId);
    pushField("source", input.source);
    pushField("type", input.type);
    pushField("label", input.label);
    // is_auto_close_task 仅在「需求流转到结束状态」时生效，必须随 status 在同一次请求提交，
    // 故不在此聚合批次处理（见下方状态更新分支）；工具层已校验它必与 targetStatus 同时传入。
    // 自定义字段：key 即 TAPD 字段名，原样透传。
    if (input.customFields) {
      for (const [key, value] of Object.entries(input.customFields)) {
        pushField(key, value);
      }
    }

    if (fieldEntries.length > 0) {
      result.updatedFields = fieldEntries.map(([key]) => key);
      try {
        await updateStory(
          new URLSearchParams([
            ["current_user", currentUser.nick],
            ["id", input.storyId],
            ["workspace_id", workspaceId],
            ...fieldEntries,
          ])
        );
        result.fieldsUpdated = true;
      } catch (error) {
        result.fieldsUpdated = false;
        result.fieldsUpdateError = error instanceof Error ? error.message : String(error);
        result.partialFailure = true;
      }
    }
  }

  // 可选：更新描述正文。TAPD description 为整体覆盖语义，调用方需传入完整正文。
  if (input.description) {
    try {
      await updateStory(
        new URLSearchParams({
          current_user: currentUser.nick,
          description: input.description,
          id: input.storyId,
          workspace_id: workspaceId,
        })
      );
      result.descriptionUpdated = true;
    } catch (error) {
      result.descriptionUpdated = false;
      result.descriptionUpdateError = error instanceof Error ? error.message : String(error);
      result.partialFailure = true;
    }
  }

  // 可选：更新需求状态。写入前先校验目标状态是否属于项目工作流合法状态，
  // 与缺陷回写保持一致；需求工作流枚举不可用时放行，避免阻断正常回写。
  if (input.targetStatus) {
    result.targetStatus = input.targetStatus;
    const statusError = await validateTargetStatus(input.targetStatus, workspaceId, "story");
    if (statusError) {
      result.statusUpdated = false;
      result.statusUpdateError = statusError;
      result.partialFailure = true;
    } else {
      try {
        const statusParams = new URLSearchParams({
          current_user: currentUser.nick,
          id: input.storyId,
          status: input.targetStatus,
          workspace_id: workspaceId,
        });
        // is_auto_close_task 依赖本次状态流转，必须与 status 在同一次请求提交才能生效。
        if (input.isAutoCloseTask !== undefined) {
          statusParams.set("is_auto_close_task", String(input.isAutoCloseTask));
        }
        await updateStory(statusParams);
        result.statusUpdated = true;
      } catch (error) {
        result.statusUpdated = false;
        result.statusUpdateError = error instanceof Error ? error.message : String(error);
        result.partialFailure = true;
      }
    }
  }

  // 可选：更新处理人。TAPD story owner 使用用户 nick，并以分号结尾。
  if (input.targetOwners?.length) {
    const ownerUpdateMode = input.ownerUpdateMode ?? "append";
    const finalOwners =
      ownerUpdateMode === "append"
        ? [...new Set([...(await getStoryCurrentOwners(input.storyId, workspaceId)), ...input.targetOwners])]
        : input.targetOwners;

    result.targetOwners = input.targetOwners;
    result.ownerUpdateMode = ownerUpdateMode;
    result.finalOwners = finalOwners;
    try {
      await updateStory(
        new URLSearchParams({
          current_user: currentUser.nick,
          id: input.storyId,
          owner: formatOwners(finalOwners),
          workspace_id: workspaceId,
        })
      );
      result.ownerUpdated = true;
    } catch (error) {
      result.ownerUpdated = false;
      result.ownerUpdateError = error instanceof Error ? error.message : String(error);
      result.partialFailure = true;
    }
  }

  return result;
}
