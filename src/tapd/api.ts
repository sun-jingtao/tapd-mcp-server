import type {
  TapdAttachmentDownloadResponse,
  TapdAttachmentsResponse,
  TapdBugChangesResponse,
  TapdBugResponse,
  TapdCommentResponse,
  TapdCommentsResponse,
  TapdCurrentUserResponse,
  TapdImageDownloadResponse,
  TapdIterationResponse,
  TapdMutationResponse,
  TapdRelationMutationResponse,
  TapdStoryChangesResponse,
  TapdStoryRelatedBugsResponse,
  TapdStoryTestCaseRelationResponse,
  TapdStoryMutationResponse,
  TapdStoryResponse,
  TapdTestCaseResponse,
  TapdUploadAttachmentResponse,
  TapdUploadImageResponse,
  TapdUserParticipantProjectsResponse,
  TapdWorkflowStatusMapResponse,
  TapdWorkspaceUsersResponse,
} from "./api-types.js";
import { tapdMultipartRequest, tapdRequest } from "./http.js";

/**
 * TAPD API 方法封装层。
 * 只负责定义具体接口路径、请求参数和默认错误文案。
 */

/**
 * 获取当前 access token 对应的 TAPD 用户信息。
 */
export function fetchCurrentUser(): Promise<TapdCurrentUserResponse> {
  return tapdRequest("/users/info", {
    errorMessage: "TAPD 当前用户信息获取失败",
  });
}

/**
 * 获取指定 TAPD 项目的成员列表。
 * params 直接对应 TAPD /workspaces/users 查询参数。
 */
export function fetchWorkspaceUsers(params: URLSearchParams): Promise<TapdWorkspaceUsersResponse> {
  return tapdRequest("/workspaces/users", {
    params,
    errorMessage: "TAPD 项目成员列表获取失败",
  });
}

/**
 * 获取指定用户参与的项目列表。
 * params 直接对应 TAPD /workspaces/user_participant_projects 查询参数（nick）。
 */
export function fetchUserParticipantProjects(params: URLSearchParams): Promise<TapdUserParticipantProjectsResponse> {
  return tapdRequest("/workspaces/user_participant_projects", {
    params,
    errorMessage: "TAPD 用户参与项目列表获取失败",
  });
}

/**
 * 查询 TAPD 缺陷列表。
 * params 直接对应 TAPD /bugs 查询参数。
 */
export function fetchBugs(params: URLSearchParams): Promise<TapdBugResponse> {
  return tapdRequest("/bugs", {
    params,
    errorMessage: "TAPD 缺陷列表获取失败",
  });
}

/**
 * 查询 TAPD 缺陷变更历史。
 * params 直接对应 TAPD /bug_changes 查询参数。
 */
export function fetchBugChanges(params: URLSearchParams): Promise<TapdBugChangesResponse> {
  return tapdRequest("/bug_changes", {
    params,
    errorMessage: "TAPD 缺陷变更历史获取失败",
  });
}

/**
 * 查询 TAPD 需求列表。
 * params 直接对应 TAPD /stories 查询参数。
 */
export function fetchStories(params: URLSearchParams): Promise<TapdStoryResponse> {
  return tapdRequest("/stories", {
    params,
    errorMessage: "TAPD 需求列表获取失败",
  });
}

/**
 * 查询 TAPD 需求变更历史。
 * params 直接对应 TAPD /story_changes 查询参数。
 */
export function fetchStoryChanges(params: URLSearchParams): Promise<TapdStoryChangesResponse> {
  return tapdRequest("/story_changes", {
    params,
    errorMessage: "TAPD 需求变更历史获取失败",
  });
}

/**
 * 查询 TAPD 迭代列表。
 * params 直接对应 TAPD /iterations 查询参数。
 */
export function fetchIterations(params: URLSearchParams): Promise<TapdIterationResponse> {
  return tapdRequest("/iterations", {
    params,
    errorMessage: "TAPD 迭代列表获取失败",
  });
}

/**
 * 查询指定需求关联的缺陷 ID 列表（只读 GET）。
 * params 直接对应 TAPD GET /stories/get_related_bugs 查询参数。
 */
export function fetchStoryRelatedBugs(params: URLSearchParams): Promise<TapdStoryRelatedBugsResponse> {
  return tapdRequest("/stories/get_related_bugs", {
    params,
    errorMessage: "TAPD 需求关联缺陷获取失败",
  });
}

/**
 * 查询指定需求关联的测试用例关系（只读 GET）。
 * TAPD 该接口返回关联关系和 tcase_id，测试用例详情需再通过 /tcases 批量查询。
 */
export function fetchStoryTestCaseRelations(params: URLSearchParams): Promise<TapdStoryTestCaseRelationResponse> {
  return tapdRequest("/stories/get_story_tcase", {
    params,
    errorMessage: "TAPD 需求关联测试用例获取失败",
  });
}

/**
 * 查询 TAPD 测试用例列表。
 * params 直接对应 TAPD /tcases 查询参数。
 */
export function fetchTestCases(params: URLSearchParams): Promise<TapdTestCaseResponse> {
  return tapdRequest("/tcases", {
    params,
    errorMessage: "TAPD 测试用例列表获取失败",
  });
}

/**
 * 查询 TAPD 评论列表。
 * params 直接对应 TAPD /comments 查询参数。
 */
export function fetchComments(params: URLSearchParams): Promise<TapdCommentsResponse> {
  return tapdRequest("/comments", {
    params,
    errorMessage: "TAPD 评论列表获取失败",
  });
}

/**
 * 查询 TAPD 附件列表。
 * params 直接对应 TAPD /attachments 查询参数。
 */
export function fetchAttachments(params: URLSearchParams): Promise<TapdAttachmentsResponse> {
  return tapdRequest("/attachments", {
    params,
    errorMessage: "TAPD 附件列表获取失败",
  });
}

/**
 * 获取单个 TAPD 附件的临时下载链接。
 */
export function fetchAttachmentDownload(params: URLSearchParams): Promise<TapdAttachmentDownloadResponse> {
  return tapdRequest("/attachments/down", {
    params,
    errorMessage: "TAPD 附件下载链接获取失败",
  });
}

/**
 * 获取描述或评论内嵌图片的临时下载链接。
 */
export function fetchImageDownload(params: URLSearchParams): Promise<TapdImageDownloadResponse> {
  return tapdRequest("/files/get_image", {
    params,
    errorMessage: "TAPD 图片下载链接获取失败",
  });
}

/**
 * 获取项目工作流状态中英文名对应关系（只读 GET）。
 * params 直接对应 TAPD /workflows/status_map 查询参数（workspace_id、system 等）。
 */
export function fetchWorkflowStatusMap(params: URLSearchParams): Promise<TapdWorkflowStatusMapResponse> {
  return tapdRequest("/workflows/status_map", {
    params,
    errorMessage: "TAPD 工作流状态获取失败",
  });
}

/**
 * 上传图片到 TAPD，返回图片地址和可嵌入描述的 html_code（POST multipart）。
 * 仅支持 png/gif/jpg/jpeg/bmp，单张 <5MB，图片仅限 TAPD 平台内使用。
 */
export function uploadImage(body: FormData): Promise<TapdUploadImageResponse> {
  return tapdMultipartRequest("/files/upload_image", body, "TAPD 图片上传失败");
}

/**
 * 上传附件到 TAPD 工作项（需求/缺陷/任务，POST multipart）。
 * body 需包含 workspace_id、type、entry_id、file，单文件 <250MB。
 */
export function uploadAttachment(body: FormData): Promise<TapdUploadAttachmentResponse> {
  return tapdMultipartRequest("/files/upload_attachment", body, "TAPD 附件上传失败");
}

/**
 * 创建 TAPD 缺陷。
 * body 使用 TAPD API 要求的 x-www-form-urlencoded 表单字段。
 */
export function createBug(body: URLSearchParams): Promise<TapdMutationResponse> {
  return tapdRequest("/bugs", {
    method: "POST",
    body,
    errorMessage: "TAPD 缺陷创建失败",
  });
}

/**
 * 创建 TAPD 需求。
 * body 使用 TAPD API 要求的 x-www-form-urlencoded 表单字段。
 */
export function createStory(body: URLSearchParams): Promise<TapdStoryMutationResponse> {
  return tapdRequest("/stories", {
    method: "POST",
    body,
    errorMessage: "TAPD 需求创建失败",
  });
}

/**
 * 创建 TAPD 实体关联关系。
 * 当前用于创建需求与缺陷的关联，body 直接对应 TAPD /relations 表单字段。
 */
export function createRelation(body: URLSearchParams): Promise<TapdRelationMutationResponse> {
  return tapdRequest("/relations", {
    method: "POST",
    body,
    errorMessage: "TAPD 实体关联创建失败",
  });
}

/**
 * 创建 TAPD 评论。
 * body 使用 TAPD API 要求的 x-www-form-urlencoded 表单字段。
 */
export function createComment(body: URLSearchParams): Promise<TapdCommentResponse> {
  return tapdRequest("/comments", {
    method: "POST",
    body,
    errorMessage: "TAPD 评论回写失败",
  });
}

/**
 * 更新 TAPD 缺陷字段。
 * 当前用于回写标题、处理状态和处理人，body 中需包含缺陷 id、workspace_id 等 TAPD 必填字段。
 */
export function updateBug(body: URLSearchParams): Promise<TapdMutationResponse> {
  return tapdRequest("/bugs", {
    method: "POST",
    body,
    errorMessage: "TAPD 缺陷更新失败",
  });
}

/**
 * 更新 TAPD 需求字段。
 * 当前用于回写需求处理状态和处理人，body 中需包含需求 id、workspace_id 等 TAPD 必填字段。
 */
export function updateStory(body: URLSearchParams): Promise<TapdStoryMutationResponse> {
  return tapdRequest("/stories", {
    method: "POST",
    body,
    errorMessage: "TAPD 需求更新失败",
  });
}
