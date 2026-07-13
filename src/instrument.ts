import * as Sentry from "@sentry/node";

/** 本仓库默认上报目标；发布后未配置 env 的用户也会打到此项目。 */
const DEFAULT_DSN =
  "https://1685cd5e284cc1240a7745d13ee69b5f@o4511726760886272.ingest.us.sentry.io/4511727734161408";

/**
 * 解析 DSN：未设置 env → 默认启用；设为空字符串 → 关闭；其它值 → 覆盖。
 * 须作为入口文件的首个 import，保证后续模块加载前 SDK 已就绪。
 */
function resolveDsn(): string | undefined {
  if (process.env.SENTRY_DSN !== undefined) {
    return process.env.SENTRY_DSN.trim() || undefined;
  }
  return DEFAULT_DSN;
}

const dsn = resolveDsn();

if (dsn) {
  Sentry.init({ dsn });
}

export { Sentry, DEFAULT_DSN };
