import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";

/** 本仓库默认上报目标；发布后未配置 env 的用户也会打到此项目。 */
const DEFAULT_DSN =
  "https://1685cd5e284cc1240a7745d13ee69b5f@o4511726760886272.ingest.us.sentry.io/4511727734161408";

// 不从 server.ts import 版本号：本模块必须是入口的首个 import，不能提前拉起业务模块。
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name?: string;
  version?: string;
};

/**
 * 解析 DSN：未设置 env → 默认启用；设为空字符串（或纯空白）→ 关闭；其它值 → 覆盖。
 * 须作为入口文件的首个 import，保证后续模块加载前 SDK 已就绪。
 */
function resolveDsn(): string | undefined {
  if (process.env.TAPD_MCP_SENTRY_DSN !== undefined) {
    return process.env.TAPD_MCP_SENTRY_DSN.trim() || undefined;
  }
  return DEFAULT_DSN;
}

/**
 * 事件默认发往维护者的 Sentry 项目，breadcrumb 中的用户业务数据必须剥离：
 * console 输出可能含 TAPD 报错正文，http.query 含 workspace_id 与检索关键词。
 * token 走 Authorization header，SDK 的 breadcrumb 本就不记录 header。
 */
export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.type === "http") {
    delete breadcrumb.data?.["http.query"];
    delete breadcrumb.data?.["http.fragment"];
  }
  return breadcrumb;
}

const dsn = resolveDsn();

if (dsn) {
  Sentry.init({
    dsn,
    release: `${packageJson.name ?? "tapd-mcp-server"}@${packageJson.version ?? "0.0.0"}`,
    sendDefaultPii: false,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

export { Sentry, DEFAULT_DSN };
