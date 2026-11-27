import { z } from "zod";
import { withWorkspaceDb } from "#workspace-db";
import { createMember, memberSession, password, role, username } from "@/lib/member-access";
import { deviceKey } from "@/lib/tenant-device";
import { reply } from "@/lib/tenant-auth";

const operation = z.discriminatedUnion("action", [
  z.object({action:z.literal("create"), username, password, role}),
  z.object({action:z.literal("configure"), id:z.string().uuid(), role, active:z.boolean()}),
  z.object({action:z.literal("password"), id:z.string().uuid(), password}),
]);
const forbidden = () => reply(403, {error:"需要本企业的管理员账号"});
async function manage(request: Request, change?: z.infer<typeof operation>) {
  const token = deviceKey(request);
  if (!token.startsWith("hes_")) return forbidden();
  const tenant = request.headers.get("x-tenant-id");
  if (!z.string().uuid().safeParse(tenant).success || !tenant) return forbidden();
  try {
    return await withWorkspaceDb(sql => sql.begin(async tx => {
      // Serialize admin changes before checking who may perform them.
      const [scope] = await tx`SELECT id FROM public.eval_tenant WHERE id=${tenant} AND active
        AND id IN (SELECT tenant_id FROM (${memberSession(tx,token)}) AS principal WHERE role='admin')
        FOR UPDATE`;
      if (!scope) return forbidden();
      const [actor] = await memberSession(tx,token);
      if (!actor || actor.role!=="admin" || actor.tenant_id!==tenant) return forbidden();
      if (!change) {
        const members = await tx`SELECT id,username,role,active FROM public.eval_member
          WHERE tenant_id=${tenant} ORDER BY username`;
        return reply(200, {members});
      }
      if (change.action==="create") return createMember(tx,tenant,change.username,change.password,change.role);
      const [target] = await tx`SELECT id,role,active FROM public.eval_member
        WHERE tenant_id=${tenant} AND id=${change.id} FOR UPDATE`;
      if (!target) return reply(404,{error:"成员不存在"});
      if (change.action==="password") {
        await tx`UPDATE public.eval_member SET password_hash=public.crypt(${change.password},public.gen_salt('bf',12)),
          failures=0,locked_until=NULL WHERE id=${target.id}`;
      } else {
        if (target.active && target.role==="admin" && (!change.active || change.role!=="admin")) {
          const [other] = await tx`SELECT id FROM public.eval_member WHERE tenant_id=${tenant}
            AND id<>${target.id} AND active AND role='admin' LIMIT 1`;
          if (!other) return reply(409,{error:"企业至少需要一位启用的管理员"});
        }
        if (target.role===change.role && target.active===change.active) return reply(200,{ok:true});
        await tx`UPDATE public.eval_member SET role=${change.role},active=${change.active} WHERE id=${target.id}`;
      }
      await tx`DELETE FROM public.eval_member_session WHERE member_id=${target.id}`;
      return reply(200,{ok:true, reauthenticate:target.id===actor.member_id});
    }));
  } catch { return reply(503,{error:"成员管理暂不可用，请核对数据库迁移"}); }
}
export function GET(request: Request) { return manage(request); }
export async function POST(request: Request) {
  const parsed=operation.safeParse(await request.json().catch(()=>null));
  return parsed.success ? manage(request,parsed.data) : reply(400,{error:"请检查账号、角色和密码（至少 12 个字符，最多 72 字节）"});
}
