export const stages = ["意图", "规划", "Skill", "Tool", "聚合", "验证"] as const;
export type Stage = typeof stages[number];
export type Step = {stage:Stage|"未分类"; spanId?:string; parentSpanId?:string; observation:string; status:"ok"|"warning"|"error"};
export type Trace = {id:string;caseId:string;version:string;title:string;input:string;outputSummary?:string;expectedSkill:string|null;predictedSkill:string|null;expectedTool:string|null;predictedTool:string|null;success:boolean|null;tokens:number|null;latency:number|null;origin?:Origin;steps:Step[];failureStage:Stage|"";failureType:string;note:string;inDataset:boolean};

export type Origin = {source:string;runId:string;projectId:string;state:"completed"|"failed"|"interrupted";digest:string};

type Case = {title:string;input:string;skill:string;tool:string;baseline:[string,string,boolean,number,number,Stage|"",string,string];candidate:[string,string,boolean,number,number,Stage|"",string,string];observations:[string,string,string,string,string,string]};
const cases:Case[]=[
  {title:"归纳公开产品反馈",input:"汇总三条虚构产品反馈，提炼共同主题并附来源。",skill:"feedback_summary",tool:"retrieve_feedback",baseline:["feedback_summary","retrieve_feedback",true,2840,8.4,"","",""],candidate:["feedback_summary","retrieve_feedback",true,2510,7.2,"","",""],observations:["识别为反馈归纳","检索、聚类、附来源","触发归纳 Skill","检索三条资料","归纳为两个主题","来源完整"]},
  {title:"查询版本变更",input:"查询虚构应用本周的版本变更，给出发布日期。",skill:"release_lookup",tool:"search_release_notes",baseline:["","web_search",false,4510,16.8,"Skill","漏触发","未触发专用查询，通用搜索返回过期页面。"],candidate:["release_lookup","search_release_notes",true,2910,9.8,"","",""],observations:["识别为版本查询","查询版本记录","检查是否触发 release_lookup","读取当前版本记录","附发布日期","检查时效"]},
  {title:"估算活动所需时间",input:"按四个环节的预计时长合计活动时间。",skill:"",tool:"calculator",baseline:["calendar_booking","calendar_create",false,3790,13.1,"意图","误触发","误判为安排会议，造成错误 Skill 与 Tool 调用。"],candidate:["","calculator",true,1890,5.1,"","",""],observations:["识别为时长计算","提取时长并求和","无需专门 Skill","调用计算器","输出分项和合计","检查单位"]},
  {title:"比较两个虚构套餐",input:"按给定的价格表比较 A、B 两个套餐的年度费用。",skill:"pricing_compare",tool:"calculate_price",baseline:["pricing_compare","calculate_price",false,5220,20.6,"Tool","参数错误","工具选对但遗漏 billing_period，月费被当作年费。"],candidate:["pricing_compare","calculate_price",true,4010,14.3,"","",""],observations:["识别为费用比较","读取费率、计算、比较","触发 pricing_compare","传入 billing_period=year","列出年度费用","复核单位"]},
  {title:"生成带引用的摘要",input:"将四段虚构资料概括为三点，并列出每点来源。",skill:"source_summary",tool:"retrieve_sources",baseline:["source_summary","retrieve_sources",false,4320,15.2,"聚合","结果不完整","第 3 点遗漏对应来源。"],candidate:["source_summary","retrieve_sources",false,3830,13.8,"聚合","结果不完整","候选版本仍漏掉第 3 点来源，校验也未拦截。"],observations:["识别为带引用摘要","检索、摘要、引用","触发 source_summary","检索四段资料","第 3 点遗漏来源","完整性校验未拦截"]},
  {title:"检查表格字段完整性",input:"检查虚构样表中的必填字段是否齐全。",skill:"table_validate",tool:"validate_schema",baseline:["table_validate","validate_schema",true,2100,6.7,"","",""],candidate:["table_validate","validate_schema",true,1960,5.9,"","",""],observations:["识别为字段校验","读取字段并验证","触发 table_validate","校验规则运行成功","列出缺失字段","输出与规则一致"]}
];
export const exampleTraces:Trace[]=cases.flatMap((c,i)=>[c.baseline,c.candidate].map((v,j)=>({id:`TR-${j?2:1}0${i+1}`,caseId:`C-0${i+1}`,version:j?"v2 候选":"v1 基线",title:c.title,input:c.input,expectedSkill:c.skill,predictedSkill:v[0],expectedTool:c.tool,predictedTool:v[1],success:v[2],tokens:v[3],latency:v[4],steps:stages.map((stage,k)=>({stage,observation:stage==="Tool"?`调用 ${v[1]||"无工具"}${v[5]===stage?` · ${v[6]}`:""}`:c.observations[k]+(v[5]===stage?` · ${v[6]}`:""),status:v[5]===stage?"error":"ok"})),failureStage:v[5],failureType:v[6],note:v[7],inDataset:true})));

export function normalize(raw:unknown,index:number):Trace{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error(`第 ${index+1} 条不是对象`);
  const r=raw as Record<string,unknown>;
  let origin: Origin | undefined;
  if (r.origin !== undefined) {
    const o = r.origin as Partial<Origin> | null;
    if (!o || ![o.projectId, o.source, o.runId].every(v => typeof v === "string" && v.trim())
        || !["completed", "failed", "interrupted"].includes(String(o.state)) || !/^[a-f0-9]{64}$/.test(String(o.digest))) {
      throw Error(`第 ${index+1} 条的来源标记无效`);
    }
    origin = {source:o.source!, runId:o.runId!, projectId:o.projectId!, state:o.state!, digest:o.digest!};
  }
  for (const k of ["caseId","version","title","input"])
    if (typeof r[k] !== "string") throw Error(`第 ${index+1} 条缺少字符串字段 ${k}`);
  for (const k of ["expectedSkill","predictedSkill","expectedTool","predictedTool"])
    if (typeof r[k] !== "string" && !(origin && r[k] === null)) throw Error(`第 ${index+1} 条的 ${k} 无效`);
  const numeric = (v:unknown) => (origin && v === null) || (typeof v === "number" && Number.isFinite(v) && v >= 0);
  if ((typeof r.success !== "boolean" && !(origin && r.success === null)) || !numeric(r.tokens) || !numeric(r.latency))
    throw Error(`第 ${index+1} 条的 success、tokens 或 latency 格式错误`);
  const steps=Array.isArray(r.steps)?r.steps.filter((s):s is Step=>!!s&&typeof s==="object"&&(stages.includes(s.stage)||(!!origin&&s.stage==="未分类"))&&typeof s.observation==="string"&&["ok","warning","error"].includes(s.status)):[];
  return {id:typeof r.id==="string"&&r.id.trim()?r.id:`IM-${Date.now()}-${index}`,caseId:r.caseId as string,version:r.version as string,title:r.title as string,input:r.input as string,...(typeof r.outputSummary==="string"?{outputSummary:r.outputSummary}:{}),expectedSkill:r.expectedSkill as string|null,predictedSkill:r.predictedSkill as string|null,expectedTool:r.expectedTool as string|null,predictedTool:r.predictedTool as string|null,success:r.success as boolean|null,tokens:r.tokens as number|null,latency:r.latency as number|null,steps,failureStage:stages.includes(r.failureStage as Stage)?r.failureStage as Stage:"",failureType:typeof r.failureType==="string"?r.failureType:"",note:typeof r.note==="string"?r.note:"",inDataset:r.inDataset===true,...(origin?{origin}:{})};
}
export function parseTraces(text:string):Trace[]{let parsed:unknown;try{parsed=JSON.parse(text)}catch{parsed=text.trim().split(/\r?\n/).filter(Boolean).map((line,i)=>{try{return JSON.parse(line)}catch{throw Error(`第 ${i+1} 行不是有效 JSON`)}})}const rows=Array.isArray(parsed)?parsed:[parsed];if(!rows.length||rows.length>2000)throw Error("每次需导入 1–2000 条 Trace");return rows.map(normalize)}
export function metrics(rows:Trace[]) {
  const skills = rows.filter(r => r.expectedSkill !== null && r.predictedSkill !== null);
  const tp = skills.filter(r => r.expectedSkill !== "" && r.expectedSkill === r.predictedSkill).length;
  const fp = skills.filter(r => r.predictedSkill !== "" && r.expectedSkill !== r.predictedSkill).length;
  const fn = skills.filter(r => r.expectedSkill !== "" && r.expectedSkill !== r.predictedSkill).length;
  const tools = rows.filter(r => r.expectedTool !== null && r.predictedTool !== null);
  const graded = rows.filter(r => r.success !== null);
  const mean = (key:"tokens"|"latency") => {
    const values = rows.map(r => r[key]).filter((n):n is number => n !== null);
    return values.length ? values.reduce((a,b) => a+b, 0)/values.length : null;
  };
  return {precision:tp+fp?tp/(tp+fp):null, recall:tp+fn?tp/(tp+fn):null,
    tool:tools.length?tools.filter(r=>r.expectedTool===r.predictedTool).length/tools.length:null,
    success:graded.length?graded.filter(r=>r.success===true).length/graded.length:null,
    tokens:mean("tokens"),latency:mean("latency")};
}

export function pairCases(dataset:Trace[], baseVersion:string, candidateVersion:string) {
  const grouped = new Map<string,{base:Trace[];candidate:Trace[]}>();
  for (const row of dataset) {
    if (row.version!==baseVersion && row.version!==candidateVersion) continue;
    const group = grouped.get(row.caseId) ?? {base:[],candidate:[]};
    if (row.version===baseVersion) group.base.push(row);
    if (row.version===candidateVersion) group.candidate.push(row);
    grouped.set(row.caseId,group);
  }
  const pairs:{base:Trace;candidate:Trace}[] = [], ambiguous:string[] = [];
  for (const [id,group] of grouped) {
    if (group.base.length>1 || group.candidate.length>1) ambiguous.push(id);
    else if (group.base.length && group.candidate.length) pairs.push({base:group.base[0],candidate:group.candidate[0]});
  }
  return {pairs,ambiguous};
}
