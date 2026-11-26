// Return only known classifications to the authenticated operator. Driver messages may contain connection details.
export function tenantDatabaseFailure(cause: unknown, action: string) {
  const raw = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
  const code = typeof raw === "string" && /^(?:[A-Z0-9]{5}|ECONNRESET|ECONNREFUSED|ETIMEDOUT|CONNECT_TIMEOUT|CONNECTION_CLOSED)$/.test(raw)
    ? raw : "DB_UNKNOWN";
  let detail: string;
  if (cause instanceof Error && cause.message === "Missing HYPERDRIVE binding") {
    detail = "当前 Worker 版本缺少 HYPERDRIVE 绑定";
  } else if (code === "42P01" || code === "42703") {
    detail = "目标库缺少租户表或字段，请核对 Hyperdrive 目标库并执行当前分支的 init.sql";
  } else if (code === "42501") {
    detail = "数据库账号缺少所需权限，请核对 Hyperdrive 使用的角色及租户表授权";
  } else if (code === "28P01" || code === "28000") {
    detail = "数据库拒绝了连接身份，请核对 Hyperdrive 的数据库凭据";
  } else if (code.startsWith("08") || ["ETIMEDOUT", "CONNECT_TIMEOUT", "ECONNRESET", "ECONNREFUSED", "CONNECTION_CLOSED"].includes(code)) {
    detail = "与源数据库的连接失败，请检查 Hyperdrive、Tunnel 和 NAS PostgreSQL";
  } else {
    detail = "请用参考号核对 Worker 日志和同一时间的 PostgreSQL 日志";
  }
  const reference = crypto.randomUUID();
  console.error("tenant-database", { action, code, reference, detail });
  return { error: action + "。" + detail + "（" + code + "，参考号 " + reference + "）" };
}
