import { randomUUID } from "node:crypto";
import { tenantDatabaseFailure } from "@/lib/tenant-database-error";
import { createMember, username, password } from "@/lib/member-access";
import { z } from "zod";
import { withWorkspaceDb } from "#workspace-db";
import { digest, isOperator, issueKey, reply } from "@/lib/tenant-auth";

export const dynamic = "force-dynamic";
const name = z.string().trim().min(1).max(80);
const id = z.string().uuid();
const operations = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name }),
  z.object({ action: z.literal("configure"), id, name, active: z.boolean() }),
  z.object({ action: z.literal("bootstrap"), id, username, password }),
  z.object({ action: z.literal("rotate"), id }),
  z.object({ action: z.literal("ingest"), id, projectId: z.string().min(1).max(240) }),
]);
const denied = () => reply(401, { error: "需要平台管理员密钥" });

export async function GET(request: Request) {
  if (!isOperator(request)) return denied();
  try {
    const tenants = await withWorkspaceDb(sql => sql`SELECT id, name, active FROM public.eval_tenant ORDER BY created_at, id`);
    return reply(200, { tenants });
  } catch (error) {
    return reply(503, tenantDatabaseFailure(error, "租户列表暂时无法读取"));
  }
}

export async function POST(request: Request) {
  if (!isOperator(request)) return denied();
  const parsed = operations.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply(400, { error: "请检查企业 ID 及表单。账号须为 2–64 位，密码至少 12 个字符且最多 72 字节。" });
  const op = parsed.data;
  try {
    return await withWorkspaceDb(sql => sql.begin(async tx => {
      if (op.action === "create") {
        const key = issueKey("workspace");
        const [tenant] = await tx`INSERT INTO public.eval_tenant (id, name, workspace_digest)
          VALUES (${randomUUID()}, ${op.name}, ${digest(key)}) RETURNING id, name, active`;
        return reply(201, { tenant, key });
      }
      const [tenant] = await tx`SELECT id,active FROM public.eval_tenant WHERE id = ${op.id} FOR UPDATE`;
      if (!tenant) return reply(404, { error: "租户不存在" });
      if (op.action === "bootstrap") {
        if (!tenant.active) return reply(409,{error:"请先启用租户"});
        const [prior] = await tx`SELECT id FROM public.eval_member WHERE tenant_id=${op.id} AND role='admin' AND active LIMIT 1`;
        if (prior) return reply(409,{error:"本企业已有管理员，请由其管理成员"});
        return createMember(tx, op.id, op.username, op.password, "admin");
      }
      if (op.action === "configure") {
        await tx`UPDATE public.eval_tenant SET name = ${op.name}, active = ${op.active} WHERE id = ${op.id}`;
        return reply(200, { ok: true });
      }
      if (op.action === "rotate") {
        const key = issueKey("workspace");
        await tx`UPDATE public.eval_tenant SET workspace_digest = ${digest(key)} WHERE id = ${op.id}`;
        return reply(200, { key });
      }
      const [project] = await tx`SELECT 1 FROM public.eval_tenant
        WHERE id = ${op.id} AND active AND data->'projects' @> ${JSON.stringify([{id:op.projectId}])}::text::jsonb`;
      if (!project) return reply(404, { error: "该租户已暂停或项目不存在" });
      const key = issueKey("ingest");
      await tx`INSERT INTO public.eval_ingest_key (tenant_id, project_id, key_digest)
        VALUES (${op.id}, ${op.projectId}, ${digest(key)})
        ON CONFLICT (tenant_id, project_id) DO UPDATE SET key_digest = EXCLUDED.key_digest`;
      return reply(200, { key });
    }));
  } catch (error) {
    return reply(503, tenantDatabaseFailure(error, "租户配置未能保存"));
  }
}
