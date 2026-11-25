import {stages, type Origin, type Step, type Trace} from "./data";

export const localSchema = "harness.local-run/v1";
export const fileLimit = 5 * 1024 * 1024;
type RecordValue = Record<string, unknown>;

function object(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("需要 JSON 对象");
  return value as RecordValue;
}
function string(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw Error("无效字段 " + field);
  return value;
}
function optionalName(value: unknown, field: string) {
  return value == null ? null : value === "" ? "" : string(value, field);
}
function measure(value: unknown, field: string) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw Error("无效字段 " + field);
  return value;
}
async function digest(data: unknown) {
  if (!globalThis.crypto?.subtle) throw Error("请通过 HTTPS 或 localhost 打开实验台后导入本地运行");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,"0")).join("");
}
export async function localRun(value: unknown, projectId: string): Promise<Trace> {
  const r = object(value);
  if (r.schema !== localSchema) throw Error("不支持的本地 Trace 版本");
  if (r.projectId !== projectId) throw Error("该记录属于其他项目");
  const source = string(r.source, "source"), runId = string(r.runId, "runId");
  if (r.state !== "completed" && r.state !== "failed" && r.state !== "interrupted") throw Error("无效的运行状态");
  if (!Array.isArray(r.steps) || r.steps.length > 5000) throw Error("steps 需要包含 0–5000 个步骤");
  const steps: Step[] = r.steps.map((raw, index) => {
    const s = object(raw);
    const stage = s.stage as Step["stage"];
    if (stage !== "未分类" && !stages.some(v => v === stage)) throw Error("无效阶段，步骤 " + (index+1));
    if (s.status !== "ok" && s.status !== "error" && s.status !== "warning") throw Error("无效步骤状态");
    const step: Step = {stage, status:s.status, observation:string(s.name, "steps.name", 500)};
    if (s.spanId !== undefined) step.spanId = string(s.spanId, "spanId", 16);
    if (s.parentSpanId) step.parentSpanId = string(s.parentSpanId, "parentSpanId", 16);
    return step;
  });
  const duration = measure(r.durationMs, "durationMs");
  const fields = {caseId:string(r.caseId,"caseId"), version:string(r.version,"version"), title:string(r.title,"title"),
    predictedTool:optionalName(r.predictedTool,"predictedTool"), predictedSkill:optionalName(r.predictedSkill,"predictedSkill"),
    input:r.inputSummary==null?"":string(r.inputSummary,"inputSummary",16000),
    ...(r.outputSummary==null?{}:{outputSummary:string(r.outputSummary,"outputSummary",16000)}),
    steps, tokens:measure(r.tokens,"tokens"), latency:duration === null ? null : duration/1000};
  const origin:Origin = {projectId, source, runId, state:r.state, digest:await digest([r.state, fields])};
  return {id:"AG-"+await digest([projectId,source,runId]), ...fields, origin, success:null,
    expectedSkill:null, expectedTool:null, failureStage:"", failureType:"", note:"", inDataset:false};
}

// Compare the immutable capture, so replay never overwrites subsequent human annotations.
export function mergeLocal(existing: Trace[], incoming: Trace[]) {
  const known = new Map(existing.map(row => [row.id, row]));
  const added:Trace[] = [], conflicts:string[] = [];
  for (const row of incoming) {
    const prior = known.get(row.id);
    if (!prior) {
      known.set(row.id,row);
      added.push(row);
    } else if (!row.origin || prior.origin?.digest !== row.origin.digest) {
      conflicts.push(row.origin?.runId ?? row.id);
    }
  }
  return {rows:added.length ? [...added,...existing] : existing, added:added.length, conflicts};
}
