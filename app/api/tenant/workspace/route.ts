import { withWorkspaceDb } from "#workspace-db";
import { revisionSchema, workspaceSchema } from "@/lib/workspace";
import { bearer, digest, reply } from "@/lib/tenant-auth";

export const dynamic = "force-dynamic";
const saveSchema = revisionSchema.extend({ data: workspaceSchema });
const denied = () => reply(401, { error: "企业访问密钥无效或租户已停用" });

export async function GET(request: Request) {
  const key = bearer(request);
  if (!key.startsWith("hew_")) return denied();
  try {
    const [row] = await withWorkspaceDb(sql => sql`
      SELECT name, data, revision FROM public.eval_tenant
      WHERE active AND workspace_digest = ${digest(key)} FOR SHARE`);
    return row ? reply(200, row) : denied();
  } catch {
    return reply(503, { error: "企业工作区暂时无法读取" });
  }
}

export async function PUT(request: Request) {
  const key = bearer(request);
  if (!key.startsWith("hew_")) return denied();
  let body;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 10 * 1024 * 1024) return reply(413, { error: "工作区超过 10 MiB" });
    body = saveSchema.parse(JSON.parse(raw));
  } catch {
    return reply(400, { error: "工作区格式错误" });
  }
  const { revision, data } = body;
  try {
    return await withWorkspaceDb(sql => sql.begin(async tx => {
      const [tenant] = await tx`SELECT id, revision FROM public.eval_tenant
        WHERE active AND workspace_digest = ${digest(key)} FOR UPDATE`;
      if (!tenant) return denied();
      if (tenant.revision !== revision) return reply(409, { error: "工作区已有更新，请备份修改后重新载入" });
      const [row] = await tx`UPDATE public.eval_tenant SET data = ${JSON.stringify(data)}::text::jsonb,
        revision = revision + 1 WHERE id = ${tenant.id} RETURNING revision`;
      return reply(200, row);
    }));
  } catch {
    return reply(503, { error: "企业工作区暂时无法保存" });
  }
}
