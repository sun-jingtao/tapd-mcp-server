// ─── Domain Types ────────────────────────────────────────────────────────────

import type {
  TapdRawAttachment,
  TapdRawBug,
  TapdRawComment,
  TapdRawCurrentUser,
  TapdRawIteration,
  TapdRawStory,
  TapdRawStoryChange,
  TapdRawTestCase,
} from "./api-types.js";

// 从 TAPD 原始 Bug 中保留不需要改名或归一化的字段，其他字段在 TapdBug 中重新定义为内部命名。
type TapdBugSharedFields = Omit<
  TapdRawBug,
  | "bugtype"
  | "cc"
  | "created_from"
  | "current_owner"
  | "de"
  | "description"
  | "flows"
  | "frequency"
  | "iteration_id"
  | "label"
  | "module"
  | "originphase"
  | "os"
  | "participator"
  | "platform"
  | "priority_label"
  | "resolution"
  | "source"
  | "sourcephase"
  | "te"
  | "testmode"
  | "testphase"
  | "testtype"
  | "version_close"
  | "version_fix"
  | "version_report"
  | "version_test"
  | "workspace_id"
>;

// 项目内部使用的单个缺陷数据结构，由 TAPD 原始 Bug 字段归一化得到
export type TapdBug = TapdBugSharedFields & {
  workspaceId: string; // 所属 TAPD 项目 id
  description: string; // 缺陷描述，已归一化为空字符串
  module: string; // 所属模块，已归一化为空字符串
  currentOwner: string; // 当前处理人
  statusLabel?: string; // 状态中文名（由项目工作流状态映射补全；枚举不可用时留空）
  extraFields: Record<string, string>; // 页面右侧常用扩展字段
  url: string; // 缺陷详情页地址
};

// 从 TAPD 原始 Story 中保留不需要改名或归一化的字段，其他字段在 TapdStory 中重新定义为内部命名。
type TapdStorySharedFields = Omit<TapdRawStory, "category_id" | "description" | "iteration_id" | "module" | "owner" | "workspace_id">;

// 项目内部使用的单个需求数据结构，由 TAPD 原始 Story 字段归一化得到。
export type TapdStory = TapdStorySharedFields & {
  workspaceId: string; // 所属 TAPD 项目 id
  description: string; // 需求描述，已归一化为空字符串
  owner: string; // 当前处理人
  module: string; // 所属模块，已归一化为空字符串
  statusLabel?: string; // 状态中文名（由项目工作流状态映射补全；枚举不可用时留空）
  extraFields: Record<string, string>; // 页面右侧常用扩展字段
  url: string; // 需求详情页地址
};

export type TapdStoryFieldChange = {
  field: string; // 字段名
  oldValue: string; // 旧值
  newValue: string; // 新值
  memo: string; // 字段变更说明
};

export type TapdStoryChange = {
  id: string; // 变更记录 id
  workspaceId: string; // 所属 TAPD 项目 id
  storyId: string; // 需求 id
  creator: string; // 变更人
  created: string; // 变更时间
  field: string; // 变更字段
  oldValue: string; // 旧值
  newValue: string; // 新值
  memo: string; // 变更说明
  fieldChanges: TapdStoryFieldChange[]; // need_parse_changes=1 返回的字段级变更详情
  rawFieldChanges: string; // 未能结构化解析时保留原始详情
};

export type TapdBugFieldChange = TapdStoryFieldChange;

export type TapdBugChange = {
  id: string; // 变更记录 id
  workspaceId: string; // 所属 TAPD 项目 id
  bugId: string; // 缺陷 id
  author: string; // 变更人（TAPD /bug_changes 响应字段）
  created: string; // 变更时间
  field: string; // 变更字段（展示用，可能是 field_label 中文名）
  fieldKey: string; // 英文字段 key（change_field || field，绕开 field_label），用于稳定识别 status 等字段
  oldValue: string; // 旧值
  newValue: string; // 新值
  oldValueLabel?: string; // 状态变更旧值的中文名（仅 status 字段由工作流状态映射补全）
  newValueLabel?: string; // 状态变更新值的中文名（仅 status 字段由工作流状态映射补全）
  memo: string; // 变更说明
  fieldChanges: TapdBugFieldChange[]; // 字段级变更详情
  rawFieldChanges: string; // 未能结构化解析时保留原始详情
};

// 从 TAPD 原始 Iteration 中保留不需要改名或归一化的字段，其他字段在 TapdIteration 中重新定义为内部命名。
type TapdIterationSharedFields = Omit<TapdRawIteration, "description" | "workspace_id">;

// 项目内部使用的单个迭代数据结构，由 TAPD 原始 Iteration 字段归一化得到。
export type TapdIteration = TapdIterationSharedFields & {
  workspaceId: string; // 所属 TAPD 项目 id
  description: string; // 迭代描述，已归一化为空字符串
};

// 从 TAPD 原始 TestCase 中保留不需要改名或归一化的字段，其他字段在 TapdTestCase 中重新定义为内部命名。
type TapdTestCaseSharedFields = Omit<TapdRawTestCase, "category_id" | "expectation" | "precondition" | "steps" | "workspace_id">;

// 项目内部使用的单个测试用例数据结构，由 TAPD 原始 Tcase 字段归一化得到。
export type TapdTestCase = TapdTestCaseSharedFields & {
  workspaceId: string; // 所属 TAPD 项目 id
  categoryId: string; // 用例目录 id
  precondition: string; // 前置条件，已归一化为空字符串
  steps: string; // 用例步骤，已归一化为空字符串
  expectation: string; // 预期结果，已归一化为空字符串
};

// 需求关联测试用例列表输出项，合并关联关系和测试用例详情。
export type TapdStoryTestCase = TapdTestCase & {
  storyId: string; // 关联需求 id
  relationId: string; // 需求-测试用例关系 id
  testPlanId: string; // 测试计划 id，0 表示未挂测试计划
  relationCreator: string; // 关系创建人
  relationCreated: string; // 关系创建时间
};

// 项目内部使用的评论数据结构，评论正文统一收敛为字符串，便于 MCP 输出。
export type TapdComment = Omit<TapdRawComment, "description"> & {
  description: string; // 评论内容，已归一化为空字符串
};

// 项目内部使用的附件数据结构，将 TAPD snake_case 字段转换为 camelCase，并可携带下载链接结果。
export type TapdAttachment = Omit<TapdRawAttachment, "download_url" | "entry_id" | "workspace_id"> & {
  entryId: string; // 依赖对象 id
  workspaceId: string; // TAPD 项目 id
  downloadUrl?: string; // 临时下载链接，有效期由 TAPD 控制
  downloadError?: string; // 单个附件下载链接获取失败时的错误
};

// 描述和评论正文中解析出的媒体引用，用于让 Agent 定位内嵌图片、视频和外链。
export type TapdMediaReference = {
  source: "description" | "comment"; // 媒体引用来源
  sourceId?: string; // 来源为评论时的评论 id
  kind: "image" | "video" | "link"; // 媒体类型
  value: string; // 原始 src/href/poster 值
  filename?: string; // TAPD 返回的文件名
  downloadUrl?: string; // 图片临时下载链接
  downloadError?: string; // 图片下载链接获取失败时的错误
};

// 单个 bug 的完整分析上下文，聚合基础字段、评论、附件和正文内嵌媒体。
export type TapdBugDetail = TapdBug & {
  comments: TapdComment[]; // bug 评论与流转评论
  attachments: TapdAttachment[]; // bug 附件及临时下载链接
  mediaReferences: TapdMediaReference[]; // 描述和评论里的内嵌图片、视频、链接
};

// 单个需求的完整分析上下文，聚合基础字段、评论、附件和正文内嵌媒体。
export type TapdStoryDetail = TapdStory & {
  comments: TapdComment[]; // 需求评论与流转评论
  attachments: TapdAttachment[]; // 需求附件及临时下载链接
  mediaReferences: TapdMediaReference[]; // 描述和评论里的内嵌图片、视频、链接
};

// TAPD 项目成员，处理人回填必须使用 nick 字段。
export type TapdWorkspaceUser = {
  nick: string; // 成员昵称，写入 current_owner 时使用
  name: string; // 中文名称
  email: string; // 邮箱
  roleIds: string[]; // 成员角色 id
  status: string; // 成员状态
  isActive: boolean; // 是否有效
};

// 当前 MCP 暴露的 TAPD /bugs 查询参数子集
export type TapdBugFilters = Partial<
  Pick<TapdRawBug, "created" | "description" | "id" | "reporter" | "status" | "title" | "workspace_id">
> & {
  story_id?: string; // 关联需求 id，返回该需求关联的缺陷；默认不按当前用户过滤（与按 id 一致），仅显式传 current_owner 时取交集
  current_owner?: string; // 单个处理人 nick，不传默认查询当前登录用户负责的缺陷
  page?: number; // 页码，默认 1
  limit?: number; // 每页数量，默认 30，最大 200
  // 以下为高价值查询过滤维度。
  priority_label?: string; // 优先级（推荐字段，兼容自定义优先级）
  severity?: string; // 严重程度
  v_status?: string; // 状态（支持中文状态名）
  label?: string; // 标签
  iteration_id?: string; // 迭代 id
  module?: string; // 模块
  version_report?: string; // 发现版本
  feature?: string; // 特性
  bugtype?: string; // 缺陷类型
  source?: string; // 缺陷根源
  resolution?: string; // 解决方法
  frequency?: string; // 重现规律
  te?: string; // 测试人员
  de?: string; // 开发人员
  participator?: string; // 参与人
  begin?: string; // 预计开始（支持时间查询）
  due?: string; // 预计结束（支持时间查询）
  deadline?: string; // 解决期限
  resolved?: string; // 解决时间（支持时间查询）
  closed?: string; // 关闭时间（支持时间查询）
  modified?: string; // 最后修改时间（支持时间查询）
  // 以下为 get_bugs 支持的其余长尾过滤维度。
  release_id?: string; // 发布计划 id
  version_test?: string; // 验证版本
  version_fix?: string; // 合入版本
  version_close?: string; // 关闭版本
  baseline_find?: string; // 发现基线
  baseline_join?: string; // 合入基线
  baseline_test?: string; // 验证基线
  baseline_close?: string; // 关闭基线
  cc?: string; // 抄送人
  auditer?: string; // 审核人
  confirmer?: string; // 验证人
  fixer?: string; // 修复人
  closer?: string; // 关闭人
  lastmodify?: string; // 最后修改人
  in_progress_time?: string; // 接受处理时间（支持时间查询）
  verify_time?: string; // 验证时间（支持时间查询）
  reject_time?: string; // 拒绝时间（支持时间查询）
  os?: string; // 操作系统
  platform?: string; // 软件平台
  testmode?: string; // 测试方式
  testphase?: string; // 测试阶段
  testtype?: string; // 测试类型
  estimate?: string; // 预计解决时间
  order?: string; // 排序规则，如 "created desc"，不传默认 "modified desc"
  custom_fields?: Record<string, string | number>; // 自定义字段过滤透传，key 为 TAPD 字段名
};

export type TapdBugChangeFilters = {
  bug_id?: string; // 缺陷 id，与 created/id 三选一必填
  created?: string; // 变更创建时间查询，与 bug_id/id 三选一必填
  id?: string; // 变更历史记录 id（支持多 id），与 bug_id/created 三选一必填
  workspace_id?: string; // TAPD 项目 id
  author?: string; // 变更人（TAPD /bug_changes 使用 author）
  field?: string; // 变更字段（TAPD /bug_changes 使用 field）
  order?: string; // 排序规则，如 "created desc"
  include_add_bug?: boolean; // 是否返回创建缺陷的变更记录（映射 include_add_bug=1）
  page?: number; // 页码，默认 1
  limit?: number; // 每页数量，默认 30，最大 200
};

// 当前 MCP 暴露的 TAPD /stories 查询参数子集
export type TapdStoryFilters = Partial<
  Pick<TapdRawStory, "created" | "description" | "id" | "name" | "creator" | "status" | "workspace_id">
> & {
  owner?: string; // 单个处理人 nick，不传默认查询当前登录用户负责的需求
  page?: number; // 页码，默认 1
  limit?: number; // 每页数量，默认 30，最大 200
  // 以下为高价值查询过滤维度。
  priority_label?: string; // 优先级（推荐字段，兼容自定义优先级）
  v_status?: string; // 状态（支持中文状态名）
  label?: string; // 标签
  version?: string; // 版本
  module?: string; // 模块
  iteration_id?: string; // 迭代 id
  include_sub_iteration?: boolean; // 是否包含子迭代（映射 0/1）
  category_id?: string; // 需求分类 id
  include_sub_category?: boolean; // 是否包含子分类（映射 0/1）
  begin?: string; // 预计开始（支持时间查询）
  due?: string; // 预计结束（支持时间查询）
  modified?: string; // 最后修改时间（支持时间查询）
  completed?: string; // 完成时间（支持时间查询）
  parent_id?: string; // 父需求 id
  ancestor_id?: string; // 祖先需求 id，查询其下所有子需求
  children_id?: string; // 子需求 id
  include_leaf_stories?: boolean; // 是否包含子需求（映射 0/1）
  // 以下为 get_stories 支持的其余长尾过滤维度。
  feature?: string; // 特性
  tech_risk?: string; // 技术风险
  workitem_type_id?: string; // 需求类别 id
  release_id?: string; // 发布计划 id
  size?: string; // 规模
  test_focus?: string; // 测试重点
  cc?: string; // 抄送人
  developer?: string; // 开发人员
  source?: string; // 来源
  type?: string; // 类型
  effort?: string; // 预估工时
  effort_completed?: string; // 完成工时
  remain?: string; // 剩余工时
  exceed?: string; // 超出工时
  order?: string; // 排序规则，如 "created desc"，不传默认 "modified desc"
  custom_fields?: Record<string, string | number>; // 自定义字段过滤透传，key 为 TAPD 字段名
};

export type TapdStoryChangeFilters = {
  story_id?: string; // 需求 id，与 created/id 三选一必填
  created?: string; // 变更创建时间查询，与 story_id/id 三选一必填
  id?: string; // 变更历史记录 id（支持多 id），与 story_id/created 三选一必填
  workspace_id?: string; // TAPD 项目 id
  creator?: string; // 变更人
  change_field?: string; // 变更字段
  change_type?: string; // 变更类型
  order?: string; // 排序规则，如 "created desc"
  page?: number; // 页码，默认 1
  limit?: number; // 每页数量，默认 30，最大 100
  include_details?: boolean; // 是否通过 need_parse_changes=1 请求字段级变更详情
};

// 当前 MCP 暴露的 TAPD /iterations 查询参数子集。
export type TapdIterationFilters = Partial<Pick<TapdRawIteration, "id" | "name" | "status" | "workspace_id">> & {
  limit?: number; // 返回数量上限，默认 50，最大 200
  page?: number; // 页码，默认 1
  // 以下为 /iterations 查询过滤维度。
  description?: string; // 详细描述
  startdate?: string; // 开始时间（支持时间查询）
  enddate?: string; // 结束时间（支持时间查询）
  workitem_type_id?: string; // 迭代类别 id
  plan_app_id?: string; // 计划应用 id
  creator?: string; // 创建人
  created?: string; // 创建时间（支持时间查询）
  modified?: string; // 最后修改时间（支持时间查询）
  completed?: string; // 完成时间
  locker?: string; // 锁定人
  order?: string; // 排序规则，如 "created desc"，不传默认 "modified desc"
  custom_fields?: Record<string, string | number>; // 自定义字段过滤透传，key 为 TAPD 字段名
};

// 用户参与的 TAPD 项目（workspace），归一化后供工具列出 workspace_id。
export type TapdWorkspace = {
  id: string; // 项目 id（workspace_id）
  name: string; // 项目名称
  prettyName: string; // 项目英文昵称
  category: string; // 项目类别，organization 表示公司/组织
  status: string; // 项目状态
  description: string; // 项目描述
  creator: string; // 创建人
  created: string; // 创建时间
  companyId: string; // 所属公司 id
  isOrganization: boolean; // 是否为公司/组织级条目（category === organization）
  url: string; // 项目在 TAPD 中的访问地址
};

export type TapdWorkspaceListInput = {
  nick?: string; // 目标用户 nick，不传默认查询当前登录用户参与的项目
  include_organization?: boolean; // 是否包含 category=organization 的公司/组织条目，默认 false
};

// 跨项目聚合查询时的项目维度元数据，用于展示项目名映射与失败摘要。
export type TapdWorkspaceAggregationMeta = {
  total: number; // 参与项目总数
  succeeded: number; // 成功查询的项目数
  failed: number; // 查询失败的项目数（权限/限流/超时等）
  workspaceNames: Record<string, string>; // workspace_id -> 项目名，用于展示
  failedWorkspaces: Array<{ id: string; name: string; reason: string }>; // 查询失败的项目明细，用于在返回文本中提示具体哪些项目缺失
};

// listBugs 返回结果。aggregation 仅在跨项目聚合查询时存在。
export type TapdBugListResult = {
  bugs: TapdBug[];
  aggregation?: TapdWorkspaceAggregationMeta;
};

// listStories 返回结果。aggregation 仅在跨项目聚合查询时存在。
export type TapdStoryListResult = {
  stories: TapdStory[];
  aggregation?: TapdWorkspaceAggregationMeta;
};

export type TapdStoryTestCaseFilters = {
  storyId: string; // 需求 id
  workspaceId?: string; // TAPD 项目 id
  includeTestPlan?: boolean; // 是否包含测试计划关联，默认 true
  name?: string; // 可选，本地按用例名称过滤
  status?: string; // 可选，本地按用例状态过滤
  limit?: number; // 返回数量上限，默认 100，最大 200
};

// MCP 内部回写参数，用于自由组合 TAPD 评论、状态和处理人更新。
export type TapdWritebackInput = {
  bugId: string; // 缺陷 id
  workspaceId?: string; // TAPD 项目 id
  comment?: string; // 回写评论内容
  commentRootId?: string; // 评论：根评论 id，传入时本条评论挂到该评论树下
  commentReplyId?: string; // 评论：被回复的评论 id
  title?: string; // 目标标题，传入时更新缺陷标题
  description?: string; // 目标描述正文，传入时整体覆盖缺陷描述
  targetStatus?: string; // 目标状态
  targetOwners?: string[]; // 目标处理人列表，使用 TAPD 用户 nick
  ownerUpdateMode?: "append" | "replace"; // 处理人更新方式，append 为追加，replace 为替换
  // 以下为 /bugs 标准透传字段，传入时聚合为一次更新请求。
  priorityLabel?: string; // 优先级（对应 priority_label，兼容自定义优先级）
  severity?: string; // 严重程度
  module?: string; // 模块
  feature?: string; // 特性
  releaseId?: string; // 发布计划 id
  versionReport?: string; // 发现版本
  versionTest?: string; // 验证版本
  versionFix?: string; // 合入版本
  versionClose?: string; // 关闭版本
  baselineFind?: string; // 发现基线
  baselineJoin?: string; // 合入基线
  baselineTest?: string; // 验证基线
  baselineClose?: string; // 关闭基线
  cc?: string; // 抄送人（多个以分号分隔）
  participator?: string; // 参与人（多个以分号分隔）
  te?: string; // 测试人员
  de?: string; // 开发人员
  fixer?: string; // 修复人
  confirmer?: string; // 验证人
  auditer?: string; // 审核人
  closer?: string; // 关闭人
  begin?: string; // 预计开始（YYYY-MM-DD）
  due?: string; // 预计结束（YYYY-MM-DD）
  deadline?: string; // 解决期限（YYYY-MM-DD）
  iterationId?: string; // 迭代 id
  size?: number; // 规模
  os?: string; // 操作系统
  platform?: string; // 软件平台
  testmode?: string; // 测试方式
  testphase?: string; // 测试阶段
  testtype?: string; // 测试类型
  source?: string; // 缺陷根源
  bugtype?: string; // 缺陷类型
  frequency?: string; // 重现规律
  originphase?: string; // 发现阶段
  sourcephase?: string; // 引入阶段
  resolution?: string; // 解决方法
  estimate?: number; // 预计解决时间
  effort?: string; // 预估工时
  label?: string; // 标签，不存在时自动创建，多个以英文竖线分隔
  // 自定义字段透传：key 为 TAPD 字段名（custom_field_*、cus_*、custom_plan_field_*），原样提交。
  customFields?: Record<string, string | number>;
};

// MCP 内部需求回写参数，用于自由组合 TAPD 评论、状态和处理人更新。
export type TapdStoryWritebackInput = {
  storyId: string; // 需求 id
  workspaceId?: string; // TAPD 项目 id
  comment?: string; // 回写评论内容
  commentRootId?: string; // 评论：根评论 id，传入时本条评论挂到该评论树下
  commentReplyId?: string; // 评论：被回复的评论 id
  description?: string; // 目标描述正文，传入时整体覆盖需求描述
  targetStatus?: string; // 目标状态
  targetOwners?: string[]; // 目标处理人列表，使用 TAPD 用户 nick
  ownerUpdateMode?: "append" | "replace"; // 处理人更新方式，append 为追加，replace 为替换
  // 以下为 /stories 标准透传字段，传入时聚合为一次更新请求。
  name?: string; // 标题
  priorityLabel?: string; // 优先级（对应 priority_label，兼容自定义优先级）
  businessValue?: number; // 业务价值
  version?: string; // 版本
  module?: string; // 模块
  testFocus?: string; // 测试重点
  size?: number; // 规模
  cc?: string; // 抄送人（多个以分号分隔）
  developer?: string; // 开发人员
  begin?: string; // 预计开始（YYYY-MM-DD）
  due?: string; // 预计结束（YYYY-MM-DD）
  iterationId?: string; // 迭代 id
  effort?: string; // 预估工时
  effortCompleted?: string; // 完成工时
  remain?: number; // 剩余工时
  exceed?: number; // 超出工时
  categoryId?: string; // 需求分类 id（与 create 工具一致，使用字符串）
  releaseId?: string; // 发布计划 id（与 create 工具一致，使用字符串）
  source?: string; // 来源
  type?: string; // 类型
  label?: string; // 标签，不存在时自动创建，多个以英文竖线分隔
  isAutoCloseTask?: 0 | 1; // 流转到结束状态时是否自动关闭关联任务（1 关闭，默认 0）
  // 自定义字段透传：key 为 TAPD 字段名（custom_field_*、cus_*、custom_plan_field_*），原样提交。
  customFields?: Record<string, string | number>;
};

// MCP 内部上传缺陷描述内嵌图片参数。Agent 通常无本地文件路径，统一用 base64 传入。
export type TapdUploadBugImageInput = {
  workspaceId?: string; // TAPD 项目 id
  fileBase64: string; // 图片内容的 base64 编码
  filename: string; // 文件名，后缀须为 png/gif/jpg/jpeg/bmp
  contentType?: string; // 文件 MIME 类型，如 image/png
};

// 上传图片结果。html_code 可直接拼入缺陷描述富文本。
export type TapdUploadBugImageResult = {
  imageSrc: string; // TAPD 图片路径
  htmlCode: string; // 可嵌入描述的 <img> 片段
};

// MCP 内部上传缺陷附件参数（附件区，支持 png/mp4 等任意文件）。
export type TapdUploadBugAttachmentInput = {
  bugId: string; // 缺陷 id（作为 entry_id）
  workspaceId?: string; // TAPD 项目 id
  fileBase64: string; // 文件内容的 base64 编码
  filename: string; // 文件名
  contentType?: string; // 文件 MIME 类型，如 image/png、video/mp4
};

// MCP 内部「上传图片并追加到缺陷描述」组合参数。
export type TapdAppendBugDescriptionImageInput = TapdUploadBugImageInput & {
  bugId: string; // 缺陷 id
};

// 组合工具结果：上传得到的图片信息 + 描述是否更新成功。
export type TapdAppendBugDescriptionImageResult = TapdUploadBugImageResult & {
  descriptionUpdated: boolean; // 描述追加图片后是否写入成功
  descriptionUpdateError?: string; // 描述写入失败时的错误信息（此时图片已上传成功）
};

// MCP 内部创建缺陷参数。创建人默认使用当前 TAPD token 对应用户。
export type TapdCreateBugInput = {
  title: string; // 缺陷标题
  description: string; // 缺陷详细描述
  workspaceId?: string; // TAPD 项目 id
  storyId?: string; // 可选，创建后关联的需求 id
  currentOwners?: string[]; // 当前处理人 nick 列表，不传默认指派给当前用户
  priorityLabel?: string; // 优先级（对应 TAPD priority_label 字段，兼容自定义优先级）
  severity?: string; // 严重程度
  module?: string; // 所属模块
  bugtype?: string; // 缺陷类型
  versionReport?: string; // 发现版本
  // 以下为 POST /bugs 创建接口的其余标准字段。
  feature?: string; // 特性
  releaseId?: string; // 发布计划 id
  versionTest?: string; // 验证版本
  versionFix?: string; // 合入版本
  versionClose?: string; // 关闭版本
  baselineFind?: string; // 发现基线
  baselineJoin?: string; // 合入基线
  baselineTest?: string; // 验证基线
  baselineClose?: string; // 关闭基线
  cc?: string; // 抄送人（用户 nick，多个以分号分隔）
  participator?: string; // 参与人（用户 nick，多个以分号分隔）
  te?: string; // 测试人员
  de?: string; // 开发人员
  fixer?: string; // 修复人
  confirmer?: string; // 验证人
  auditer?: string; // 审核人
  closer?: string; // 关闭人
  begin?: string; // 预计开始（YYYY-MM-DD）
  due?: string; // 预计结束（YYYY-MM-DD）
  deadline?: string; // 解决期限（YYYY-MM-DD）
  iterationId?: string; // 迭代 id
  size?: number; // 规模
  os?: string; // 操作系统
  platform?: string; // 软件平台
  testmode?: string; // 测试方式
  testphase?: string; // 测试阶段
  testtype?: string; // 测试类型
  source?: string; // 缺陷根源
  originphase?: string; // 发现阶段
  sourcephase?: string; // 引入阶段
  resolution?: string; // 解决方法
  frequency?: string; // 重现规律
  estimate?: number; // 预计解决时间
  effort?: string; // 预估工时
  label?: string; // 标签，不存在时自动创建，多个以英文竖线分隔
  templateId?: string; // 模板 id
  isApplyTemplateDefaultValue?: 0 | 1; // 是否从模板继承默认值（1 继承），需配合 templateId
  // 自定义字段透传：key 为 TAPD 字段名（custom_field_*、cus_*、custom_plan_field_*），原样提交。
  customFields?: Record<string, string | number>;
};

// MCP 内部创建缺陷结果。关联需求是创建缺陷后的独立 TAPD relation。
export type TapdCreateBugResult = {
  bug: TapdBug; // 已创建的缺陷
  relatedStoryId?: string; // 请求关联的需求 id
  relationId?: string; // TAPD 返回的需求-缺陷关联关系 id
  relationError?: string; // 关联关系创建失败时的错误信息，此时缺陷本身已创建
};

// MCP 内部创建需求参数。创建人默认使用当前 TAPD token 对应用户。
export type TapdCreateStoryInput = {
  name: string; // 需求名称
  description: string; // 需求详细描述
  workspaceId?: string; // TAPD 项目 id
  owners?: string[]; // 需求处理人 nick 列表，不传默认指派给当前用户
  priorityLabel?: string; // 优先级（对应 TAPD priority_label 字段，兼容自定义优先级）
  module?: string; // 所属模块
  iterationId?: string; // 迭代 id
  categoryId?: string; // 分类 id
  // 以下为 POST /stories 创建接口的其余标准字段。
  parentId?: string; // 父需求 id
  label?: string; // 标签，不存在时自动创建，多个以英文竖线分隔
  cc?: string; // 抄送人（用户 nick，多个以分号分隔）
  developer?: string; // 开发人员（用户 nick，多个以分号分隔）
  begin?: string; // 预计开始（YYYY-MM-DD）
  due?: string; // 预计结束（YYYY-MM-DD）
  businessValue?: number; // 业务价值
  version?: string; // 版本
  size?: number; // 规模
  testFocus?: string; // 测试重点
  effort?: string; // 预估工时
  effortCompleted?: string; // 完成工时
  remain?: number; // 剩余工时
  exceed?: number; // 超出工时
  releaseId?: string; // 发布计划 id
  source?: string; // 来源
  type?: string; // 类型
  feature?: string; // 特性
  techRisk?: string; // 技术风险
  workitemTypeId?: string; // 需求类别 id
  templatedId?: string; // 模板 id
  isApplyTemplateDefaultValue?: 0 | 1; // 是否从模板继承默认值/保密设置（1 继承），需配合 templatedId
  applyTemplate?: string; // 模板选项，逗号分隔，如 preset_stories,preset_tasks，需配合 templatedId
  // 自定义字段透传：key 为 TAPD 字段名（custom_field_*、cus_*、custom_plan_field_*），原样提交。
  customFields?: Record<string, string | number>;
};

// TAPD 回写结果。评论、状态和处理人更新互相独立，需要把部分成功明确返回给用户。
export type TapdWritebackResult = {
  bugId: string; // 缺陷 id
  workspaceId: string; // 实际写入的 TAPD 项目 id
  author: string; // 评论写入人
  commentCreated?: boolean; // 传入 comment 时表示评论是否成功写入
  commentId?: string; // TAPD 返回的评论 id
  commentCreateError?: string; // 评论写入失败时的错误信息
  targetTitle?: string; // 请求更新的目标标题
  titleUpdated?: boolean; // 传入 title 时表示标题更新是否成功
  titleUpdateError?: string; // 标题更新失败时的错误信息
  descriptionUpdated?: boolean; // 传入 description 时表示描述更新是否成功
  descriptionUpdateError?: string; // 描述更新失败时的错误信息
  targetStatus?: string; // 请求更新的目标状态
  statusUpdated?: boolean; // 传入 targetStatus 时表示状态更新是否成功
  statusUpdateError?: string; // 状态更新失败时的错误信息
  targetOwners?: string[]; // 请求更新的目标处理人列表
  ownerUpdateMode?: "append" | "replace"; // 实际使用的处理人更新方式
  finalOwners?: string[]; // 实际写入的完整处理人列表
  ownerUpdated?: boolean; // 传入 targetOwners 时表示处理人更新是否成功
  ownerUpdateError?: string; // 处理人更新失败时的错误信息
  updatedFields?: string[]; // 本次聚合更新涉及的标准/自定义字段名（TAPD 字段名）
  fieldsUpdated?: boolean; // 传入标准/自定义字段时表示聚合更新是否成功
  fieldsUpdateError?: string; // 聚合字段更新失败时的错误信息
  partialFailure: boolean; // 是否发生部分失败
};

// TAPD 需求回写结果。结构与 bug 回写保持一致，只把实体 id 换成 storyId。
export type TapdStoryWritebackResult = Omit<TapdWritebackResult, "bugId"> & {
  storyId: string; // 需求 id
};

// 当前登录用户信息
export type TapdCurrentUser = Pick<TapdRawCurrentUser, "id" | "name" | "nick">;

export type TapdWorkspaceUserSearchInput = {
  workspace_id?: string; // TAPD 项目 id
  keyword?: string; // 按 nick、中文名、邮箱模糊匹配
  limit?: number; // 返回数量上限
};
