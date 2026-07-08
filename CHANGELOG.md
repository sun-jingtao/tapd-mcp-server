# Changelog

## 1.0.7

- `tapd_call_api` 识别 TAPD「Hello world」占位响应：TAPD 对不存在的 path 不报 404 而是返回 `status: 1` + 占位字符串，此前会被当成调用成功返回；现改为报错并提示以 open.tapd.cn 官方文档 path 为准（实测 84 个 path 中 13 个此前误判为调通）。
- `tapd_call_api` 工具描述补充 path 反例（如 Wiki 列表是 `/wikis` 而非 `/wiki`），减少模型按 REST 直觉猜错路径。

## 1.0.6

- README 优化：写操作工具表格移除逐行「（需确认）」标注，改为在「工具」标题下统一说明，避免误读为功能未完成；同步补齐上传类工具的确认说明。
- README「快速开始」补充可选环境变量 `TAPD_ALLOW_RAW_WRITE`（控制 `tapd_call_api` 的 POST 写操作），并合并原重复的令牌说明段落。
- README 安全提示与示例文案完善：点明 `tapd_call_api` POST 需 `TAPD_ALLOW_RAW_WRITE=true` 这道环境变量闸，示例中标明 `tapd_bug_fix_writeback` 为内置 Prompt。

## 1.0.5

- 新增通用透传工具 `tapd_call_api`：直接调用任意 TAPD OpenAPI 接口（任务、工时、测试计划、模块/版本配置、Wiki、看板等），兜底 17 个专用工具未覆盖的官方接口；path/参数以官方文档为准，由调用方模型按需拼装。
- 写保护双闸：POST 写操作默认禁用，需在 MCP 配置 env 设置 `TAPD_ALLOW_RAW_WRITE=true`（环境级开关），且每次调用需显式传入 `confirmed: true`（调用级确认，沿用现有写工具约定），任一缺失都在发出请求前拦截。
- 支持 `body_format: "form" | "json"`：默认表单提交；`batch_update_story` 等要求 JSON 请求体（含数组/对象参数）的接口传 `json`（官方文档确认其「支持格式 JSON/XML，默认 JSON」）。form 模式遇到数组/对象参数会报错并提示改用 json，不会静默序列化为无效值。
- 请求层 `tapdRequest` 的 `body` 支持 JSON 字符串（自动补 `Content-Type: application/json`），表单路径行为不变。
- 查询结果超 5 万字符自动截断并提示缩小查询范围，防止 list 类接口撑爆模型上下文；文件上传（multipart）不经本工具，仍走专用上传工具。

## 1.0.4

- `tapd_writeback_story` 补全所用 TAPD 接口的全量参数：`/stories` 新增标题、优先级、业务价值、版本、模块、测试重点、规模、抄送人、开发人员、预计起止、迭代、工时、分类、发布计划、来源、类型、标签、是否自动关闭任务等标准字段，以及自定义字段透传（`custom_fields`，覆盖 `custom_field_*`/`cus_*`/`custom_plan_field_*`）；`/comments` 新增 `comment_root_id`/`comment_reply_id`。标准与自定义字段聚合为单次请求提交。
- `is_auto_close_task` 仅在状态流转时生效，故当同时指定 `target_status` 时随状态变更在同一次请求提交；缺少 `target_status` 时直接报错，不再发出无效请求。
- `custom_fields` 的字段名校验：仅接受 `custom_field_*`/`cus_*`/`custom_plan_field_*` 前缀，非法 key（如误传 `id`、`status`）提前报错，避免覆盖保留参数；`tapd_create_bug` 的该校验前移到函数开头，非法 key 本地快速失败、不消耗任何网络请求。
- `is_auto_close_task`/`is_apply_template_default_value` 三处 0/1 开关收紧为 `z.union([z.literal(0), z.literal(1)])`，`2`、`-1` 等非法值在 schema 层直接拒绝（TAPD 官方文档确认二者仅 0/1 语义）。
- `category_id`/`release_id` 统一为字符串类型，与 `tapd_create_story` 对齐。
- `tapd_create_story` 补全 `/stories` 创建接口的全量参数：新增父需求（`parent_id`）、标签、抄送人、开发人员、预计起止、业务价值、版本、规模、测试重点、工时、发布计划、来源、类型、特性、技术风险、需求类别、模板（`templated_id`/`apply_template` 等）等标准字段，以及自定义字段透传（`custom_fields`）。
- `tapd_list_stories` 扩展高价值查询过滤维度：优先级、中文状态（`v_status`）、标签、版本、模块、迭代（含子迭代）、分类（含子分类）、预计起止/修改/完成时间、父子需求（`parent_id`/`ancestor_id`/`children_id`/`include_leaf_stories`）、特性、技术风险、需求类别、发布计划、规模、测试重点、抄送/开发人、来源/类型、工时（`effort`/`effort_completed`/`remain`/`exceed`）、自定义字段过滤，并开放 `order` 自定义排序（默认仍 `modified desc`）。
- `tapd_list_story_changes` 新增 `change_type`（变更类型过滤）、`order`（自定义排序）与 `id`（变更记录 ID）参数，定位条件放宽为 `story_id`/`created`/`id` 三选一。
- `tapd_writeback`（缺陷）补全 `/bugs` 标准字段：优先级、严重程度、模块、特性、版本/基线、抄送/参与/测试/开发/修复/验证/审核/关闭人、预计起止与解决期限、迭代、规模、操作系统/平台、测试方式/阶段/类型、缺陷根源/类型/重现规律/发现阶段/引入阶段/解决方法、预计解决时间、工时、标签等，以及自定义字段透传（`custom_fields`）；`/comments` 新增 `comment_root_id`/`comment_reply_id`。标准与自定义字段聚合为单次请求提交。
- `tapd_create_bug` 补全 `/bugs` 创建接口的全量参数：在原有优先级/严重程度/模块/缺陷类型/发现版本基础上，新增特性、发布计划、版本/基线、各类人员、预计起止/解决期限、迭代、规模、操作系统/平台、测试方式/阶段/类型、缺陷根源/发现阶段/引入阶段/解决方法/重现规律、预计解决时间、工时、标签、模板（`template_id`/`is_apply_template_default_value`）等标准字段，以及自定义字段透传（`custom_fields`）。
- `tapd_list_bugs` 扩展高价值查询过滤维度：优先级、严重程度、中文状态（`v_status`）、标签、迭代、模块、发现版本、特性、缺陷类型/根源/解决方法/重现规律、测试/开发/参与人、预计起止/解决期限/解决/关闭/修改时间、发布计划、验证/合入/关闭版本与各基线、抄送/审核/验证/修复/关闭/最后修改人、接受处理/验证/拒绝时间、操作系统/平台、测试方式/阶段/类型、预计解决时间、自定义字段过滤，并开放 `order` 自定义排序（默认仍 `modified desc`）。
- `tapd_list_bug_changes` 新增 `id`（变更记录 ID）、`order`（自定义排序）、`include_add_bug`（返回创建缺陷记录）参数，定位条件放宽为 `bug_id`/`created`/`id` 三选一。
- `tapd_list_iterations` 扩展查询过滤维度：详细描述、起止时间（`startdate`/`enddate`）、迭代类别（`workitem_type_id`）、计划应用（`plan_app_id`）、创建人、创建/修改/完成时间、锁定人、自定义字段过滤，并开放 `order` 自定义排序（默认仍 `modified desc`）与 `page` 翻页。

## 1.0.3

- 内部重构：将单文件 `src/index.ts` 按业务域拆分为 `tools/`（bug / story / workspace）与 `prompts/` 模块，并抽出 `server.ts` 单独创建实例；各模块采用 `register(server)` 注入式注册。工具与 Prompt 的名称、参数、文案和行为均无变化，新增工具只需在对应模块追加。
- 同步仓库与作者主页地址至新的 GitHub 用户名（`scizuixiangsis` → `sun-jingtao`）。

## 1.0.2

- 做了一些细微的优化。

<!--
  版本约定：顶部条目（如下方 0.1.14）是「下一个待发布版本」，此时 package.json 仍停留在上一发布版本，
  二者不一致是预期状态，并非发布阻塞。`pnpm release`（scripts/release.sh）会读取 package.json 当前版本、
  自增后匹配此处标题再发布。请勿为「对齐」手动 bump package.json，否则脚本会算出再下一个版本号、发错版本。
-->

## 1.0.1

- 添加 MIT License 文件，并纳入 npm 发布包。
- 同步 `package.json` 与 MCPB manifest 的作者信息。
- 精简 README 中需求评估、提测文档说明，移除不再需要的示例截图引用。
- 更新 README 保留的示例截图资产，删除未引用的旧截图。

## 1.0.0

首个正式版本 🎉。能力覆盖「需求 — 开发 — 修复 — 提测」全链路（17 个工具 + 3 套工作流 Prompt）：

- 缺陷 / 需求的查询、详情、创建、回填，列表查询跨项目自动聚合并标注归属。
- 内置 Prompt：`tapd_prd_analysis`（需求宣讲前研发评估）、`tapd_bug_fix_writeback`（Bug 修复回填）、`tapd_test_doc`（提测准入判断 + 生成提测文档）。
- 团队视角：借助跨项目聚合与成员搜索，一句话统计全组 bug / 需求。
- 所有写操作均需用户确认；更新处理人前先核验 TAPD 成员，避免重名误写。
- 完善 README（核心亮点、能力总览、6 大使用场景配图）与发布流程文档。

## 0.1.14

- `tapd_list_bugs` / `tapd_list_stories` 列表输出改为 Markdown 表格，首两列固定为「序号、id」，避免宿主渲染成表格时丢失序号与 ID；聚合查询时附带「项目」列。空结果与失败摘要文案保持不变。
- `tapd_list_bugs` 按 `story_id` 查询关联缺陷时不再附加「当前登录用户」处理人过滤，改为返回该需求全部处理人名下的关联缺陷（与按 `id` 精确查询一致）；修复此前会漏掉他人名下关联/阻断缺陷的问题，同时利好 `tapd_prd_analysis`、`tapd_test_doc` 的关联缺陷分析。

- 新增 Prompt `tapd_test_doc`：分两阶段生成提测文档。基线分支不传时自动探测仓库默认分支（`main`/`master` 等，不写死 main）。阶段一「提测准入判断」基于分支 diff 对照 `story_id` 关联的 PRD 用例（`tapd_list_story_test_cases`）、验收要点（`tapd_get_stories`）和未关闭关联缺陷（`tapd_list_bugs`）判断是否达标，不达标时列出未达标项并要求用户三选一（记为已知问题继续 / 忽略风险继续并留痕 / 终止提测），决策前不生成文档；未提供 `story_id` 时先用 `tapd_list_stories` 列出名下候选需求供用户选定（不凭分支名臆测），或确认跳过准入。阶段二把「测试环境 / 本次提测 / 测试重点 / 已知问题」的 Markdown 文档写入项目根目录的 `提测文档.md`（整体覆盖）；准入结论、diff 基线、关联需求等过程信息只在对话中说明、不写入文件。该 Prompt 只读代码、不调用任何 TAPD 写入工具。
- 新增 Prompt `tapd_bug_fix_writeback`：基于 TAPD bug 上下文与用户提供的修复信息生成简洁回填草稿，用户确认后将状态改为已解决并写入评论；只编排现有查询/写回工具，不新增自动写入能力。

## 0.1.13

- 行为变更（breaking）：移除 `TAPD_DEFAULT_WORKSPACE_ID` 配置项。项目面向「一人负责多个动态项目」场景，不再使用单一默认项目。
  - 列表查询 `tapd_list_bugs` / `tapd_list_stories` 不传 `workspace_id` 时仍自动跨项目聚合（不受影响）。
  - 其余需要具体项目的工具（详情、写入、上传、变更历史、迭代、测试用例、成员搜索等）的 `workspace_id` 改为**必填**：请复用列表结果里的项目 ID，或先用 `tapd_list_workspaces` 获取。
  - 迁移：删除 MCP 配置 env 中的 `TAPD_DEFAULT_WORKSPACE_ID`；原先依赖默认值的调用需显式传入 `workspace_id`。

## 0.1.12

- 修复 `tapd_list_stories` 按 `id` 精确查询时仍受默认处理人过滤约束的问题：传入 `id` 且未显式指定 `owner` 时跳过处理人过滤，与 `tapd_list_bugs` 行为对齐，可查到已转给他人的需求。

## 0.1.11

- 修复 `tapd_list_bugs` 按 `id` 精确查询时仍受默认处理人过滤约束的问题：传入 `id` 且未显式指定 `current_owner` 时跳过处理人过滤，可查到已转给他人的缺陷。
- 修复全部工具对外暴露的 inputSchema 为空对象的问题（`registerTool` 改传裸 zod shape）：MCP 宿主现在能拿到完整参数定义，自动补全与参数校验恢复正常。
- `tapd_writeback` / `tapd_writeback_story` 在更新状态前，先校验目标状态是否属于项目工作流的合法状态；非法状态会被拒绝并返回可选状态清单，避免非法状态被静默写入。
- `tapd_writeback` / `tapd_writeback_story` 新增 `description` 参数，支持更新缺陷/需求描述正文（整体覆盖语义）。
- 新增缺陷多媒体上传工具：`tapd_upload_bug_attachment`（附件区，支持 png/mp4 等，≤250MB）、`tapd_upload_bug_image`（描述内嵌图，≤5MB，返回 html_code）、`tapd_append_bug_description_image`（上传图片并自动追加到缺陷描述，先读后写避免覆盖）。HTTP 层新增 multipart/form-data 支持。
- `tapd_list_bugs` / `tapd_get_bugs` / `tapd_list_stories` / `tapd_get_stories` 及创建接口返回的状态，会附带项目工作流中文名（如「已解决（resolved）」），工作流状态映射按项目缓存。
- `tapd_list_bug_changes` 的状态变更（status 字段）前后值会附带工作流中文名（如「接受/处理（in_progress） => 已解决（resolved）」）。

## 0.1.10

- 做了一些细微的优化。

## 0.1.9

- 新增 `tapd_list_workspaces` 工具：查询当前用户参与的所有 TAPD 项目，默认过滤掉公司/组织级条目。
- `tapd_list_bugs` / `tapd_list_stories` 支持跨项目聚合：不传 `workspace_id` 时自动聚合你参与的所有项目并合并结果，聚合结果会标注每条记录所属项目，并在出现部分项目查询失败时给出提示。
- 行为变更（breaking）：上述列表查询不再默认只查 `TAPD_DEFAULT_WORKSPACE_ID` 单个项目；如需限定单项目，请显式传入 `workspace_id`。聚合查询时 `page` / `limit` 为每个项目分别生效，并非跨项目全局分页。

## 0.1.8

- 做了一些细微的优化。

## 0.1.7

- 做了一些细微的优化。

## 0.1.6

- 自动同步 MCP 展示元数据并发布 npm 包。

## 0.1.5

- 同步 MCP 展示元数据、图标资源和发布前校验流程。

## 0.1.4

- 增加 MCP Registry / VS Code MCP 详情页所需的服务器元数据。
- 增加 PNG 图标资源，提升 Cursor / VS Code MCP 视图中的图标兼容性。

## 0.1.3

- 将 MCP server 展示名改为「TAPD MCP」（用于 Cursor / VS Code MCP 视图）。
- 更新 npm 发布说明文档。

## 0.1.2

- 新增需求宣讲前研发评估 Prompt `tapd_prd_analysis`。
- 新增工具：`tapd_list_iterations`（项目迭代）、`tapd_list_bug_changes`（缺陷变更历史）、`tapd_list_story_changes`（需求变更历史）、`tapd_list_story_test_cases`（需求关联测试用例）、`tapd_writeback_story`（需求评论/状态/处理人回填）、`tapd_get_stories`（批量需求详情）。
- 增加缺陷与需求的关联查询能力。
- 增加默认项目 ID（`TAPD_DEFAULT_WORKSPACE_ID`）支持并优化 workspace_id 解析（注：该配置已于 0.1.13 移除）。
- 合并 Bug 与 Story 重复的获取与格式化逻辑。
- 增加 icon.svg 图标资源。

## 0.1.1

- 新增需求查询与创建能力（`tapd_list_stories` / `tapd_create_story`），与 bug 能力对齐。
- 完善 bug 批量详情获取与回填。
- 增加评论、附件、描述内嵌媒体的归一化与展示。
- 增加搜索项目成员功能（`tapd_search_users`）。
- 优化 bug 列表展示：补充创建人与链接、按 ID 去重、附查询结果摘要。
- 新增 npm 发布脚本与发布流程。

## 0.1.0

- 初始发布 TAPD MCP Server。
- 支持查询、获取与回填 TAPD bug（写操作经用户确认）。
