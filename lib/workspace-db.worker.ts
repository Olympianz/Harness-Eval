import { env } from "cloudflare:workers";
import postgres from "postgres";

// Workers own sockets per request. Hyperdrive pools the origin connections.
export async function withWorkspaceDb<T>(query: (sql: ReturnType<typeof postgres>) => Promise<T>) {
  if (!env.HYPERDRIVE) throw Error("Missing HYPERDRIVE binding");
  const sql = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
  try {
    return await query(sql);
  } finally {
    await sql.end({ timeout: 1 });
  }
}
