import { withWorkspaceDb } from "#workspace-db";
import { revisionSchema, workspaceSchema } from "@/lib/workspace";
import { memberSession } from "@/lib/member-access";
import { bearer, digest, reply } from "@/lib/tenant-auth";

import { deviceKey, fromWorkspacePage, setDeviceKey } from "@/lib/tenant-device";

export const dynamic = "force-dynamic";
const saveSchema = revisionSchema.extend({ data: workspaceSchema });
const denied = () => reply(401, { error: "企业访问密钥无效或租户已停用" });

export async function GET(request: Request) {
  const key = request.headers.has("authorization") ? bearer(request) : deviceKey(request);
  const member = key.startsWith("hes_");
  if (!member && !key.startsWith("hew_")) return denied();
  try {
    const [row] = await withWorkspaceDb(sql => member ? sql`SELECT t.id,t.name,t.data,t.revision,p.role,p.username
      FROM (${memberSession(sql,key)}) AS p JOIN public.eval_tenant t ON t.id=p.tenant_id` : sql`
      SELECT id, name, data, revision FROM public.eval_tenant
      WHERE active AND workspace_digest = ${digest(key)} FOR SHARE`);
    if (!row) {
      const response = denied();
      return !request.headers.has("authorization") ? setDeviceKey(response, "") : response;
    }
    const response = reply(200, row);
    if (fromWorkspacePage(request) && request.headers.has("authorization")) {
      return setDeviceKey(response, request.headers.get("x-remember-key") === "1" ? key : "");
    }
    return response;
  } catch {
    return reply(503, { error: "企业工作区暂时无法读取" });
  }
}

export async function PUT(request: Request) {
  const key = request.headers.has("authorization") ? bearer(request) : deviceKey(request);
  const member = key.startsWith("hes_");
  if (!member && !key.startsWith("hew_")) return denied();
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
      const [tenant] = member ? await tx`SELECT t.id,t.revision,p.role FROM (${memberSession(tx,key)}) AS p
        JOIN public.eval_tenant t ON t.id=p.tenant_id FOR UPDATE OF t` : await tx`SELECT id, revision FROM public.eval_tenant
        WHERE active AND workspace_digest = ${digest(key)} FOR UPDATE`;
      if (!tenant) return denied();
      if (member && tenant.role==="viewer") return reply(403,{error:"只读成员无法修改工作区"});
      // A different tab can change the remembered tenant while this page is open.
      if (!request.headers.has("authorization") && request.headers.get("x-tenant-id") !== tenant.id)
        return reply(409, { error: "本机登录的企业已更改，请备份修改并重新登录" });
      if (tenant.revision !== revision) return reply(409, { error: "工作区已有更新，请备份修改后重新载入" });
      const [row] = await tx`UPDATE public.eval_tenant SET data = ${JSON.stringify(data)}::text::jsonb,
        revision = revision + 1 WHERE id = ${tenant.id} RETURNING revision`;
      return reply(200, row);
    }));
  } catch {
    return reply(503, { error: "企业工作区暂时无法保存" });
  }
}


export async function DELETE(request: Request) {
  if (!fromWorkspacePage(request)) return reply(403, { error: "请从企业工作区退出" });
  const token=deviceKey(request);
  if (token.startsWith("hes_")) {
    try { await withWorkspaceDb(sql => sql`DELETE FROM public.eval_member_session WHERE token_digest=${digest(token)}`); }
    catch { return reply(503,{error:"退出失败，请重试"}); }
  }
  return setDeviceKey(reply(200, { ok: true }), "");
}
