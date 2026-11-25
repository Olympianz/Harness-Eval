import { withWorkspaceDb } from "#workspace-db";
import { z } from "zod";
import { revisionSchema, workspaceSchema } from "../../../lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveSchema = revisionSchema.extend({ data: workspaceSchema });
function authorized(request: Request) {
  return !!process.env.WORKSPACE_TOKEN &&
    request.headers.get("authorization") === `Bearer ${process.env.WORKSPACE_TOKEN}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [row] = await withWorkspaceDb(sql => sql`SELECT data, revision FROM public.harness_workspace WHERE id = 1`);
    return Response.json(row ?? { data: null, revision: 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "数据库读取失败，请检查连接和初始化" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 10 * 1024 * 1024) {
      return Response.json({ error: "数据超过10MB" }, { status: 413 });
    }
    const { data, revision } = saveSchema.parse(JSON.parse(raw));
    // Bind serialized JSON as text so the driver does not encode it as a JSON string.
    const payload = JSON.stringify(data);
    const [row] = await withWorkspaceDb(sql => revision === 0
      ? sql`
          INSERT INTO public.harness_workspace (id, data, revision)
          VALUES (1, ${payload}::text::jsonb, 1)
          ON CONFLICT (id) DO NOTHING RETURNING revision`
      : sql`
          UPDATE public.harness_workspace
          SET data = ${payload}::text::jsonb, revision = revision + 1, updated_at = now()
          WHERE id = 1 AND revision = ${revision} RETURNING revision`);
    if (!row) return Response.json({ error: "其他窗口已修改数据，请备份当前数据并刷新" }, { status: 409 });
    return Response.json(row);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return Response.json({ error: "数据格式错误" }, { status: 400 });
    }
    return Response.json({ error: "保存失败，请检查数据库连接" }, { status: 503 });
  }
}
