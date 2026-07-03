/**
 * TAPD 运行时配置。
 * 这些值由 MCP 客户端从 mcp.json 的 env 字段注入到 server 进程。
 */
export const TAPD_CONFIG = {
  // OAuth access token，由 MCP 配置 env 注入，用于调用 TAPD OpenAPI。
  accessToken: process.env.TAPD_ACCESS_TOKEN ?? "",
  // TAPD OpenAPI 基础地址，所有 REST 请求都会基于它拼接路径。
  apiBase: "https://api.tapd.cn",
};

/**
 * MCP Server 启动时只校验全局必需配置。
 * 项目 ID 可以在单次工具调用中传入，因此不应阻止 server 启动。
 */
export function validateTapdConfig(): void {
  if (!TAPD_CONFIG.accessToken) {
    throw new Error("缺少 TAPD_ACCESS_TOKEN，请在 MCP 配置 env 中填写。");
  }
}

// 「如何获取项目 ID」的统一指引短语，供工具参数描述与运行时错误提示共享，避免两处文案漂移。
export const WORKSPACE_ID_HINT =
  "可先用 tapd_list_bugs / tapd_list_stories 跨项目查询，或 tapd_list_workspaces 获取目标项目 ID";

/**
 * 校验项目级 TAPD 接口需要的 workspace_id。
 * 项目级工具必须显式传入 workspace_id；获取方式见 WORKSPACE_ID_HINT。
 */
export function resolveWorkspaceId(workspaceId?: string): string {
  const resolvedWorkspaceId = workspaceId?.trim();

  if (!resolvedWorkspaceId) {
    throw new Error(`缺少 TAPD 项目 ID，请传入 workspace_id（${WORKSPACE_ID_HINT}）。`);
  }

  return resolvedWorkspaceId;
}
