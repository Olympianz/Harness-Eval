import postgres from "postgres";

let client: ReturnType<typeof postgres>;

function db() {
  if (!process.env.PGHOST || !process.env.PGPASSWORD) throw Error("Database not configured");
  return client ??= postgres({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 3,
    connect_timeout: 10,
  });
}

export function withWorkspaceDb<T>(query: (sql: ReturnType<typeof postgres>) => Promise<T>) {
  return query(db());
}
