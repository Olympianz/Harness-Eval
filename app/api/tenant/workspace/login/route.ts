import { randomBytes } from "node:crypto";
import { z } from "zod";
import { withWorkspaceDb } from "#workspace-db";
import { username, password } from "@/lib/member-access";
import { digest, reply } from "@/lib/tenant-auth";
import { fromWorkspacePage, setDeviceKey } from "@/lib/tenant-device";

const input = z.object({tenant:z.string().uuid(), username, password, remember:z.boolean().default(false)});
export async function POST(request: Request) {
  if (!fromWorkspacePage(request)) return reply(403,{error:"请从企业工作区登录"});
  const values = input.safeParse(await request.json().catch(() => null));
  const rejected = () => reply(401, {error:"企业 ID、账号或密码无效，或账号暂不可用"});
  if (!values.success) return rejected();
  const {tenant, username:name, password:secret, remember} = values.data;
  try {
    return await withWorkspaceDb(sql => sql.begin(async tx => {
      const [member] = await tx`SELECT m.id FROM public.eval_member m
        JOIN public.eval_tenant t ON t.id=m.tenant_id
        WHERE m.tenant_id=${tenant} AND m.username=${name} AND m.active AND t.active
        AND (m.locked_until IS NULL OR m.locked_until <= now()) FOR UPDATE OF m`;
      if (!member) return rejected();
      const [verified] = await tx`SELECT id FROM public.eval_member WHERE id=${member.id}
        AND password_hash = public.crypt(${secret}, password_hash)`;
      if (!verified) {
        await tx`UPDATE public.eval_member SET failures=(failures+1)%5,
          locked_until=CASE WHEN failures>=4 THEN now()+interval '10 minutes' END WHERE id=${member.id}`;
        return rejected();
      }
      await tx`UPDATE public.eval_member SET failures=0, locked_until=NULL WHERE id=${member.id}`;
      const token = "hes_" + randomBytes(32).toString("base64url");
      await tx`DELETE FROM public.eval_member_session WHERE member_id=${member.id} AND expires_at<=now()`;
      await tx`INSERT INTO public.eval_member_session(token_digest,member_id,expires_at)
        VALUES (${digest(token)},${member.id},now()+${remember ? 720 : 12}*interval '1 hour')`;
      return setDeviceKey(reply(200,{ok:true}),token,remember);
    }));
  } catch { return reply(503,{error:"账号服务暂不可用，请核对数据库迁移"}); }
}
