import { TAPD_CONFIG } from "./config.js";

/**
 * TAPD HTTP 请求封装层。
 * 统一处理 base URL、鉴权 header、表单 header、响应解析和错误抛出。
 */

// TAPD 请求默认超时时间，避免接口挂起导致 MCP 工具无限期悬挂。
const REQUEST_TIMEOUT_MS = 30_000;
// 文件上传可能传输较大文件（附件上限 250MB），需要比普通请求更长的超时。
const UPLOAD_TIMEOUT_MS = 120_000;

// TAPD API 响应都包含 status/info 字段，用于判断业务请求是否成功。
type TapdResponsePayload = {
  status?: number;
  info?: string;
};

// 内部请求配置，params 用于查询字符串，body 用于 x-www-form-urlencoded 表单提交。
type TapdRequestOptions = {
  method?: "GET" | "POST";
  params?: URLSearchParams;
  body?: URLSearchParams;
  errorMessage: string;
};

/**
 * 基于 TAPD base URL 构造完整请求地址。
 * params 会被序列化为查询字符串。
 */
function buildTapdUrl(path: string, params?: URLSearchParams): URL {
  const url = new URL(path, TAPD_CONFIG.apiBase);

  if (params) {
    url.search = params.toString();
  }

  return url;
}

/**
 * 构造 TAPD 请求 header。
 * 所有请求都携带 Bearer token，存在 body 时按 TAPD 表单接口要求补充 Content-Type。
 */
function buildTapdHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TAPD_CONFIG.accessToken}`,
  };

  if (hasBody) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  return headers;
}

/**
 * 发送 TAPD 请求并解析响应。
 * HTTP 非 2xx 或 TAPD 业务状态非成功时，会优先使用 TAPD 返回的 info 抛错。
 */
export async function tapdRequest<T extends TapdResponsePayload>(
  path: string,
  { method = "GET", params, body, errorMessage }: TapdRequestOptions
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildTapdUrl(path, params), {
      method,
      headers: buildTapdHeaders(Boolean(body)),
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // 超时（TimeoutError）和网络异常都在这里收敛为带接口语义的错误，避免暴露底层 fetch 细节。
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`${errorMessage}：请求超时（${REQUEST_TIMEOUT_MS / 1000}s）`);
    }
    throw new Error(`${errorMessage}：${error instanceof Error ? error.message : String(error)}`);
  }

  // 先按文本读取，避免 TAPD 在网关错误、限流或鉴权跳转时返回非 JSON 导致解析报错掩盖真实状态。
  const rawBody = await response.text();
  let payload: T;
  try {
    payload = JSON.parse(rawBody) as T;
  } catch {
    const snippet = rawBody.trim().slice(0, 200);
    throw new Error(`${errorMessage}：HTTP ${response.status}，响应非 JSON${snippet ? ` | ${snippet}` : ""}`);
  }

  if (!response.ok || payload.status !== 1) {
    throw new Error(payload.info || errorMessage);
  }

  return payload;
}

/**
 * 发送 TAPD 文件上传请求（multipart/form-data）并解析响应。
 * 不手动设置 Content-Type，交由 fetch 根据 FormData 自动补全 multipart boundary。
 */
export async function tapdMultipartRequest<T extends TapdResponsePayload>(
  path: string,
  formData: FormData,
  errorMessage: string
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildTapdUrl(path), {
      method: "POST",
      headers: { Authorization: `Bearer ${TAPD_CONFIG.accessToken}` },
      body: formData,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`${errorMessage}：请求超时（${UPLOAD_TIMEOUT_MS / 1000}s）`);
    }
    throw new Error(`${errorMessage}：${error instanceof Error ? error.message : String(error)}`);
  }

  const rawBody = await response.text();
  let payload: T;
  try {
    payload = JSON.parse(rawBody) as T;
  } catch {
    const snippet = rawBody.trim().slice(0, 200);
    throw new Error(`${errorMessage}：HTTP ${response.status}，响应非 JSON${snippet ? ` | ${snippet}` : ""}`);
  }

  if (!response.ok || payload.status !== 1) {
    throw new Error(payload.info || errorMessage);
  }

  return payload;
}
