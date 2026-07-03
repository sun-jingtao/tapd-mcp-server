// ─── TAPD API Response Shapes ────────────────────────────────────────────────

type TapdApiResponse<TData> = {
  status: number;
  data?: TData;
  info?: string;
};

export type TapdRawBug = {
  id: string; // 缺陷 id
  title: string; // 缺陷标题
  description: string | null; // 缺陷详细描述
  status: string; // 缺陷状态
  priority: string; // 优先级
  priority_label?: string; // 优先级展示文案，兼容自定义优先级时推荐使用
  severity: string; // 严重程度
  module: string | null; // 所属模块
  current_owner: string; // 当前处理人
  reporter: string; // 报告人
  created: string; // 创建时间
  modified: string; // 最后修改时间
  workspace_id: string; // TAPD 项目 id
  label?: string | null; // 标签
  iteration_id?: string | null; // 迭代 id
  de?: string | null; // 开发人员
  te?: string | null; // 测试人员
  cc?: string | null; // 抄送人
  participator?: string | null; // 参与人
  bugtype?: string | null; // 缺陷类型
  resolution?: string | null; // 解决方法
  originphase?: string | null; // 发现阶段
  sourcephase?: string | null; // 引入阶段
  source?: string | null; // 缺陷根源
  platform?: string | null; // 软件平台
  os?: string | null; // 操作系统
  testtype?: string | null; // 测试类型
  testphase?: string | null; // 测试阶段
  testmode?: string | null; // 测试方式
  frequency?: string | null; // 重现规律
  version_report?: string | null; // 发现版本
  version_test?: string | null; // 验证版本
  version_fix?: string | null; // 合入版本
  version_close?: string | null; // 关闭版本
  flows?: string | null; // 工作流状态
  created_from?: string | null; // 创建来源
};

export type TapdRawStory = {
  id: string; // 需求 id
  name: string; // 需求名称
  description: string | null; // 需求详细描述
  status: string; // 需求状态
  priority: string; // 优先级
  priority_label?: string; // 优先级展示文案，兼容自定义优先级时推荐使用
  owner: string; // 当前处理人
  creator: string; // 创建人
  created: string; // 创建时间
  modified: string; // 最后修改时间
  workspace_id: string; // TAPD 项目 id
  iteration_id?: string | null; // 迭代 id
  category_id?: string | null; // 分类 id
  module?: string | null; // 所属模块
  version?: string | null; // 版本
  size?: string | null; // 规模
};

export type TapdRawIteration = {
  id: string; // 迭代 id
  name: string; // 迭代名称
  status?: string | null; // 迭代状态
  startdate?: string | null; // 开始日期
  enddate?: string | null; // 结束日期
  description?: string | null; // 迭代描述
  creator?: string | null; // 创建人
  created?: string | null; // 创建时间
  modified?: string | null; // 最后修改时间
  workspace_id: string; // TAPD 项目 id
};

export type TapdRawWorkspace = {
  id: string; // 项目 id（workspace_id）
  name: string; // 项目名称
  pretty_name?: string | null; // 项目英文昵称
  category?: string | null; // 项目类别，organization 表示公司/组织而非具体项目
  status?: string | null; // 项目状态：normal 正常，closed 关闭，suspend 挂起
  description?: string | null; // 项目描述
  creator?: string | null; // 创建人
  created?: string | null; // 创建时间
  company_id?: string | null; // 所属公司 id
};

export type TapdRawTestCase = {
  id: string; // 测试用例 id
  name: string; // 测试用例名称
  status?: string | null; // 用例状态
  priority?: string | null; // 用例等级
  category_id?: string | null; // 用例目录 id
  steps?: string | null; // 用例步骤
  precondition?: string | null; // 前置条件
  expectation?: string | null; // 预期结果
  type?: string | null; // 用例类型
  creator?: string | null; // 创建人
  created?: string | null; // 创建时间
  modifier?: string | null; // 最后修改人
  modified?: string | null; // 最后修改时间
  workspace_id: string; // TAPD 项目 id
};

export type TapdRawStoryTestCaseRelation = {
  id: string; // 关系 id
  workspace_id: string | number; // TAPD 项目 id
  test_plan_id: string; // 测试计划 id，0 表示未挂测试计划
  story_id: string; // 需求 id
  tcase_id: string; // 测试用例 id
  sort?: string; // 显示排序系数
  creator?: string; // 关系创建人
  created?: string; // 关系创建时间
};

export type TapdRawComment = {
  id: string; // 评论 id
  title: string; // 评论标题
  description: string; // 评论内容
  author: string; // 评论人
  entry_type: string; // 评论对象类型，如 bug
  entry_id: string; // 评论所属对象 id
  root_id?: string; // 根评论 id
  reply_id?: string; // 回复评论 id
  created: string; // 创建时间
  modified: string; // 最后修改时间
  workspace_id: string; // TAPD 项目 id
};

export type TapdRawCurrentUser = {
  id: string; // 用户 id
  nick: string; // 英文 id，TAPD 文档说明可作为用户唯一标识
  name: string; // 中文名
  avatar: string; // 头像地址
  enabled: string; // 用户是否有效：1 是，0 否
  status_id: string; // 用户状态 id：1 在职，2 离职，3 冻结
  status_name: string; // 用户状态名称
};

export type TapdRawWorkspaceUser = {
  user: string; // 成员昵称，更新 current_owner 时使用
  role_id?: string[]; // 成员角色 id
  email?: string; // 成员邮箱
  name?: string; // 中文名称
  join_project_time?: string; // 加入项目时间
  real_join_time?: string; // 实际加入时间
  status?: string; // 成员状态，1 通常表示有效
  allocation?: string; // 投入度
};

export type TapdRawAttachment = {
  id: string; // 附件 id
  type: string; // 附件类型
  entry_id: string; // 依赖对象 id
  filename: string; // 附件名称
  description?: string | null; // 附件描述
  content_type: string; // 文件 MIME 类型
  created: string; // 创建时间
  workspace_id: string; // TAPD 项目 id
  owner: string; // 上传人
  download_url?: string; // 临时下载链接
};

export type TapdRawImageDownload = {
  type: string; // 文件类型
  value: string; // 图片路径
  workspace_id: string | number; // TAPD 项目 id
  filename: string; // 图片文件名
  download_url: string; // 临时下载链接
};

export type TapdRawRelation = {
  id: string; // 关联关系 id
  workspace_id: string; // TAPD 项目 id
  source_type: string; // 关联关系源对象类型
  source_id: string; // 关联关系源对象 id
  target_type: string; // 关联关系目标对象类型
  target_id: string; // 关联关系目标对象 id
  created: string; // 创建时间
  modified: string; // 最后修改时间
};

export type TapdRawStoryRelatedBug = {
  workspace_id: string | number; // TAPD 项目 id
  story_id: string; // 需求 id
  bug_id: string; // 缺陷 id
};

export type TapdRawStoryChange = {
  id?: string; // 变更记录 id
  workspace_id?: string | number; // TAPD 项目 id
  story_id?: string; // 需求 id
  creator?: string; // 变更人
  created?: string; // 变更时间
  change_field?: string; // 变更字段
  field?: string; // 部分 TAPD 响应使用 field 表示变更字段
  old_value?: string | null; // 旧值
  new_value?: string | null; // 新值
  memo?: string | null; // 变更说明
  field_changes?: unknown; // need_parse_changes=1 时返回的字段级变更详情
  [key: string]: unknown;
};

export type TapdRawBugChange = TapdRawStoryChange & {
  bug_id?: string; // 缺陷 id
};

// TAPD /bugs 查询接口的原始响应结构
export type TapdBugResponse = TapdApiResponse<Array<{ Bug?: TapdRawBug }>>;

// TAPD /bug_changes 查询接口的原始响应结构
export type TapdBugChangesResponse = TapdApiResponse<Array<{ BugChange?: TapdRawBugChange; WorkitemChange?: TapdRawBugChange }>>;

// TAPD /stories 查询接口的原始响应结构
export type TapdStoryResponse = TapdApiResponse<Array<{ Story?: TapdRawStory }>>;

// TAPD /story_changes 查询接口的原始响应结构
export type TapdStoryChangesResponse = TapdApiResponse<Array<{ WorkitemChange?: TapdRawStoryChange }>>;

// TAPD /iterations 查询接口的原始响应结构
export type TapdIterationResponse = TapdApiResponse<Array<{ Iteration?: TapdRawIteration }>>;

// TAPD /tcases 查询接口的原始响应结构
export type TapdTestCaseResponse = TapdApiResponse<Array<{ Tcase?: TapdRawTestCase }>>;

// TAPD 查询需求与测试用例关联关系接口的原始响应结构
export type TapdStoryTestCaseRelationResponse = TapdApiResponse<Array<{ TestPlanStoryTcaseRelation?: TapdRawStoryTestCaseRelation }>>;

// TAPD 获取评论列表接口的原始响应结构
export type TapdCommentsResponse = TapdApiResponse<Array<{ Comment?: TapdRawComment }>>;

// TAPD 添加评论接口的原始响应结构
export type TapdCommentResponse = TapdApiResponse<{ Comment?: TapdRawComment }>;

// TAPD 更新缺陷接口的原始响应结构
export type TapdMutationResponse = TapdApiResponse<{ Bug?: TapdRawBug }>;

// TAPD 创建需求接口的原始响应结构
export type TapdStoryMutationResponse = TapdApiResponse<{ Story?: TapdRawStory }>;

// TAPD 创建实体关联接口的原始响应结构
export type TapdRelationMutationResponse = TapdApiResponse<{ Relation?: TapdRawRelation }>;

// TAPD 查询需求关联缺陷接口的原始响应结构
export type TapdStoryRelatedBugsResponse = TapdApiResponse<TapdRawStoryRelatedBug[]>;

// TAPD 当前用户接口的原始响应结构
export type TapdCurrentUserResponse = TapdApiResponse<TapdRawCurrentUser>;

// TAPD 获取项目成员列表接口的原始响应结构
export type TapdWorkspaceUsersResponse = TapdApiResponse<Array<{ UserWorkspace?: TapdRawWorkspaceUser }>>;

// TAPD 获取用户参与项目列表接口的原始响应结构
export type TapdUserParticipantProjectsResponse = TapdApiResponse<Array<{ Workspace?: TapdRawWorkspace }>>;

// TAPD 获取附件列表接口的原始响应结构
export type TapdAttachmentsResponse = TapdApiResponse<Array<{ Attachment?: TapdRawAttachment }>>;

// TAPD 获取单个附件下载链接接口的原始响应结构
export type TapdAttachmentDownloadResponse = TapdApiResponse<{ Attachment?: TapdRawAttachment }>;

// TAPD 获取单个图片下载链接接口的原始响应结构
export type TapdImageDownloadResponse = TapdApiResponse<{ Attachment?: TapdRawImageDownload }>;

// TAPD 获取工作流状态中英文名对应关系接口的原始响应结构。
// data 为 { 状态英文名: 状态中文名 } 的映射对象。
export type TapdWorkflowStatusMapResponse = TapdApiResponse<Record<string, string>>;

// TAPD 上传图片接口（/files/upload_image）的原始响应结构。
// image_src 为图片路径，html_code 为可直接拼入描述的 <img> 片段。
export type TapdUploadImageResponse = TapdApiResponse<{ image_src?: string; html_code?: string }>;

// TAPD 上传附件接口（/files/upload_attachment）的原始响应结构。
export type TapdUploadAttachmentResponse = TapdApiResponse<{ Attachment?: TapdRawAttachment }>;
