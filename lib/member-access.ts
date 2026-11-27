import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { z } from "zod";
import { digest, reply } from "./tenant-auth";

export const username = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/);
export const password = z.string().min(12).refine(s => Buffer.byteLength(s, "utf8") <= 72 && !s.includes("\0"));
export const role = z.enum(["admin", "editor", "viewer"]);

export function memberSession(sql: Sql, token: string) {
  return sql`SELECT m.tenant_id, m.id AS member_id, m.username, m.role
    FROM public.eval_member_session s
    JOIN public.eval_member m ON m.id = s.member_id
    JOIN public.eval_tenant t ON t.id = m.tenant_id
    WHERE s.token_digest = ${digest(token)} AND s.expires_at > now() AND m.active AND t.active
    FOR SHARE OF m`;
}

// Call with the tenant row locked, so membership changes serialize per tenant.
export async function createMember(sql: Sql, tenant: string, name: string, secret: string, memberRole: z.infer<typeof role>) {
  const rows = await sql`INSERT INTO public.eval_member(id, tenant_id, username, password_hash, role)
    VALUES (${randomUUID()}, ${tenant}, ${name}, public.crypt(${secret}, public.gen_salt('bf', 12)), ${memberRole})
    ON CONFLICT (tenant_id, username) DO NOTHING RETURNING id`;
  return rows.length ? reply(201, {ok:true}) : reply(409, {error:"本企业已有同名账号"});
}
