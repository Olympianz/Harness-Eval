import {withWorkspaceDb} from "#workspace-db";
import {bearer, digest} from "@/lib/tenant-auth";
import {timingSafeEqual} from "node:crypto";
import {fileLimit, localRun} from "../../local-runs";
import {workspaceSchema} from "../../../lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(status:number, data:object) {
  return Response.json(data, {status, headers:{"Cache-Control":"no-store"}});
}

function allowed(project:string, request:Request) {
  const keys = JSON.parse(process.env.TRACE_INGEST_KEYS || "{}");
  const key = keys && Object.hasOwn(keys,project) ? keys[project] : null;
  if (typeof key !== "string" || key.length < 32) return false;
  const expected = Buffer.from("Bearer "+key);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  return supplied.length === expected.length && timingSafeEqual(supplied,expected);
}

async function readRun(request:Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("缺少请求体");
  const chunks = [];
  let size = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > fileLimit) {
      await reader.cancel();
      throw new RangeError("单次上报上限为 5 MiB");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(request:Request) {
  const projectId = new URL(request.url).searchParams.get("project");
  if (!projectId || projectId.length > 240) return reply(400,{error:"请提供目标项目 ID"});
  const key = bearer(request);
  const enterprise = /^hei_[A-Za-z0-9_-]{43}$/.test(key);
  try {
    if (!enterprise && !allowed(projectId,request)) return reply(401,{error:"项目接入密钥无效"});
  } catch { return reply(503,{error:"服务端接入密钥配置错误"}); }
  let trace;
  try {
    trace = await localRun(await readRun(request),projectId);
  } catch (e) {
    return reply(e instanceof RangeError?413:400,{error:e instanceof SyntaxError?"JSON 无效":e instanceof Error?e.message:"Trace 无效"});
  }
  const run = trace;
  try {
    return await withWorkspaceDb(sql => sql.begin(async tx => {
      // The browser's revision-checked PUT and other collectors serialize on this same row.
      const [row] = enterprise
        ? await tx`SELECT t.id, t.data, t.revision FROM public.eval_tenant t
            JOIN public.eval_ingest_key k ON k.tenant_id = t.id
            WHERE t.active AND k.key_digest = ${digest(key)} AND k.project_id = ${projectId}
            FOR UPDATE OF t, k`
        : await tx`SELECT data, revision FROM public.harness_workspace WHERE id=1 FOR UPDATE`;
      if (enterprise && !row) return reply(401,{error:"项目接入密钥无效或租户已停用"});
      if (!row) return reply(404,{error:"请先在实验台创建并保存项目"});
      workspaceSchema.parse(row.data);
      const data = row.data as {projects:{id:string;rows:Record<string,unknown>[]}[]};
      const project = data.projects.find(p=>p.id===projectId);
      if (!project) return reply(404,{error:"目标项目不存在"});
      const prior = project.rows.find(r=>r.id===run.id);
      if (prior) {
        const origin = prior.origin as {digest?:string}|undefined;
        return origin?.digest === run.origin!.digest
          ? reply(200,{status:"duplicate",id:run.id,revision:row.revision})
          : reply(409,{error:"相同来源和运行 ID 已存在，内容不一致"});
      }
      project.rows.unshift(run);
      const payload = JSON.stringify(data);
      if (Buffer.byteLength(payload)+128 > 10*1024*1024) return reply(413,{error:"工作区已达 10 MiB 容量限制"});
      const [saved] = enterprise
        ? await tx`UPDATE public.eval_tenant SET data=${payload}::text::jsonb,
            revision=revision+1 WHERE id=${row.id} RETURNING revision`
        : await tx`UPDATE public.harness_workspace SET data=${payload}::text::jsonb,
        revision=revision+1, updated_at=now() WHERE id=1 RETURNING revision`;
      return reply(201,{status:"created",id:run.id,revision:saved.revision});
    }));
  } catch {
    return reply(503,{error:"NAS 工作区暂不可写，可稍后重试"});
  }
}
