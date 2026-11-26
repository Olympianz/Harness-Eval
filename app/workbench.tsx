"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Activity,ArrowRight,Check,Database,Download,Filter,GitCompareArrows,Layers3,Plus,RotateCcw,Search,ShieldCheck,Upload,CircleHelp} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from "@/components/ui/sheet";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {Toaster} from "@/components/ui/sonner";
import {revisionSchema,workspaceResponseSchema} from "@/lib/workspace";
import {toast} from "sonner";
import {exampleTraces,metrics,normalize,pairCases,comparisonVersions,parseTraces,stages,type Stage,type Trace} from "./data";

import {LocalInbox} from "./local-inbox";
import {fileLimit, localRun, mergeLocal} from "./local-runs";

const verdict=(s:boolean|null)=>s===null?"待标注":s?"成功":"失败";
const labelName=(s:string|null)=>s===null?"待确认":s||"∅";
const difference=(a:number|null,b:number|null,suffix="")=>a===null||b===null?"—":sign(b-a,suffix);
const failureTypes=["误触发","漏触发","路由错误","参数错误","执行失败","计划偏离","结果不完整","校验遗漏","其他"];
const pct=(n:number|null)=>n===null?"—":Math.round(n*100)+"%";
const sign=(n:number,suffix="")=>(n>0?"+":"")+Number(n.toFixed(1))+suffix;
function saveFile(name:string,content:string){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type:"application/x-ndjson"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

type Project = {id:string;name:string;rows:Trace[]};
const projectKey="harness-eval-projects-v1";
type Mode = "tenant" | "legacy" | "demo" | "local";
type View = "traces" | "dataset" | "eval";
export default function Workspace({mode,accessKey="",onExit,initialView="traces"}:{mode:Mode;initialView?:View;accessKey?:string;onExit?:()=>void}){
  const [tenantName,setTenantName]=useState("");
  const endpoint=mode==="tenant"?"/api/tenant/workspace":"/api/workspace";
  const nas=mode==="tenant"||mode==="legacy";
  const [projects,setProjects]=useState<Project[]>([{id:"default",name:"默认项目",rows:exampleTraces}]);
  const [active,setActive]=useState("default");
  const [ready,setReady]=useState(false);
  const [error,setError]=useState("");
  const revision=useRef(0), saving=useRef(false), conflicted=useRef(false);
  const [syncStatus,setSyncStatus]=useState("");
  const [lastSaved,setLastSaved]=useState("");
  const serialized=useMemo(()=>JSON.stringify({projects,active}),[projects,active]);
  const waitingToSave=nas && serialized!==lastSaved && ["已保存到 NAS","已从 NAS 加载"].includes(syncStatus);
  // Browser storage is restored after hydration, before enabling edits.
  useEffect(()=>{async function restore(){try{
    if(nas){
      const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${accessKey}`}});
      if(!response.ok)throw Error("读取 NAS 数据失败：请检查访问密钥、数据库连接及初始化。刷新页面重试。");
      const payload=await response.json();
      if(mode==="tenant" && payload && typeof payload==="object" && "name" in payload && typeof payload.name==="string")setTenantName(payload.name);
      const remote=workspaceResponseSchema.parse(payload);revision.current=remote.revision;
      if(remote.data){
        const restored=remote.data.projects.map(p=>({id:p.id,name:p.name,rows:p.rows.map(normalize)}));
        setProjects(restored);setActive(remote.data.active);
        setLastSaved(JSON.stringify({projects:restored,active:remote.data.active}));
        setSyncStatus("已从 NAS 加载");
        setReady(true);
        return;
      }
      setProjects([{id:"default",name:"默认项目",rows:[]}]);
      setSyncStatus("正在初始化工作区");setReady(true);return;
    }
    if(mode==="demo"){setReady(true);return;}
    const saved=localStorage.getItem(projectKey);
    if(saved){const data=JSON.parse(saved);if(!Array.isArray(data.projects)||!data.projects.length||data.projects.some((p:Project)=>!p||typeof p.id!=="string"||typeof p.name!=="string"||!Array.isArray(p.rows))||new Set(data.projects.map((p:Project)=>p.id)).size!==data.projects.length)throw Error("invalid projects");setProjects(data.projects.map((p:Project)=>({...p,rows:p.rows.map(normalize)})));setActive(data.projects.some((p:Project)=>p.id===data.active)?data.active:data.projects[0].id);}
    else{const legacy=localStorage.getItem("harness-eval-lab-v1");if(legacy){const rows=JSON.parse(legacy);if(!Array.isArray(rows))throw Error("invalid traces");setProjects([{id:"default",name:"默认项目",rows:rows.map(normalize)}]);}}
    setReady(true);
  }catch(e){setError(e instanceof Error?e.message:"读取失败，原始数据已保留。");}}void restore();},[nas,endpoint,accessKey,mode]);
  useEffect(()=>{if(ready && mode==="local")try{localStorage.setItem(projectKey,JSON.stringify({projects,active}));}catch{toast.error("项目保存失败：浏览器存储空间不足");}},[projects,active,ready,mode]);
  useEffect(()=>{
    if(!nas||!ready)return;
    const data={projects,active};
    const timer=setInterval(async()=>{
      if(conflicted.current||saving.current||lastSaved===serialized)return;
      saving.current=true;setSyncStatus("正在保存到 NAS…");
      try{const response=await fetch(endpoint,{method:"PUT",headers:{"Content-Type":"application/json",Authorization:`Bearer ${accessKey}`},body:JSON.stringify({data,revision:revision.current})});const result=await response.json();if(!response.ok){if(response.status===409||response.status===401){conflicted.current=true;clearInterval(timer);}throw Error(result && typeof result==="object" && "error" in result && typeof result.error==="string" ? result.error : "保存失败");}revision.current=revisionSchema.parse(result).revision;setLastSaved(serialized);setSyncStatus("已保存到 NAS");}catch(e){setSyncStatus(e instanceof Error?e.message:"保存失败，请备份本页修改");}finally{saving.current=false;}
    },1000);return()=>clearInterval(timer);
  },[projects,active,ready,nas,serialized,lastSaved,endpoint,accessKey]);
  async function importWorkspace(file:File){try{const data=JSON.parse(await file.text());if(!Array.isArray(data.projects)||!data.projects.length||data.projects.some((p:Project)=>!p||!p.id||!p.name||p.name.length>60||!Array.isArray(p.rows))||new Set(data.projects.map((p:Project)=>p.id)).size!==data.projects.length||!data.projects.some((p:Project)=>p.id===data.active))throw Error("备份格式无效");const imported=data.projects.map((p:Project)=>({...p,rows:p.rows.map(normalize)}));if(confirm("用备份替换当前全部项目？请先导出当前工作区备份。")){setProjects(imported);setActive(data.active);}}catch(e){alert(e instanceof Error?e.message:"导入失败");}}
  const project=projects.find(p=>p.id===active)??projects[0];
  function nameProject(create:boolean){const name=prompt(create?"新项目名称":"修改项目名称",create?"":project.name)?.trim();if(!name)return;if(name.length>60){alert("项目名称最多60个字符");return;}if(projects.some(p=>p.name===name&&(create||p.id!==active))){alert("已存在同名项目");return;}if(create){const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,"0")).join("");setProjects(old=>[...old,{id,name,rows:[]}]);setActive(id);}else setProjects(old=>old.map(p=>p.id===active?{...p,name}:p));}
  if(!ready)return <div className="content">{error||"正在载入项目…"} {onExit&&<button onClick={onExit}>返回登录</button>}</div>;
  return <><div style={{padding:"8px 24px"}}>{tenantName&&<strong>{tenantName}　</strong>}{onExit&&<button onClick={onExit}>退出　</button>}{nas?(waitingToSave?"等待保存到 NAS…":syncStatus):mode==="demo"?"演示空间 · 刷新还原":"浏览器本地存储"} <button onClick={()=>saveFile("harness-workspace-backup.json",JSON.stringify({projects,active}))}>备份全部项目</button> <label style={{cursor:"pointer"}}>导入工作区备份<input type="file" accept=".json" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];if(file)void importWorkspace(file);e.target.value="";}}/></label></div><Home initialView={initialView} storage={nas?"数据保存到当前工作区":mode==="demo"?"演示数据仅在本页保留":"数据保存在当前浏览器"} key={project.id} project={project} projects={projects} onSwitch={setActive} onCreate={()=>nameProject(true)} onRename={()=>nameProject(false)} setRows={update=>setProjects(old=>old.map(p=>p.id===project.id?{...p,rows:typeof update==="function"?update(p.rows):update}:p))}/></>;
}
function Home({initialView,storage,project,projects,onSwitch,onCreate,onRename,setRows}:{initialView:View;storage:string;project:Project;projects:Project[];onSwitch:(id:string)=>void;onCreate:()=>void;onRename:()=>void;setRows:(update:Trace[]|((old:Trace[])=>Trace[]))=>void}){
  const rows=project.rows;
  const [view,setView]=useState<View>(initialView),[selectedId,setSelectedId]=useState<string|null>(null),[draft,setDraft]=useState<Trace|null>(null);
  const [importOpen,setImportOpen]=useState(false),[paste,setPaste]=useState(""),[search,setSearch]=useState(""),[filter,setFilter]=useState("all");
  const [preferredBase,setBaseVersion]=useState(""),[preferredCandidate,setCandidateVersion]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const dataset=rows.filter(r=>r.inDataset),versions=[...new Set(rows.map(r=>r.version))];
  const evalVersions=[...new Set(dataset.map(row=>row.version).filter(Boolean))];
  const [baseVersion,candidateVersion]=comparisonVersions(evalVersions,preferredBase,preferredCandidate);
  const visible=useMemo(()=>rows.filter(r=>(filter==="all"||filter==="failed"&&r.success===false||filter==="labeled"&&!!r.failureStage||filter==="dataset"&&r.inDataset)&&[r.id,r.caseId,r.title,r.input,r.origin?.source,r.origin?.runId].join(" ").toLowerCase().includes(search.toLowerCase())),[rows,search,filter]);
  const {pairs,ambiguous}=pairCases(dataset,baseVersion,candidateVersion);
  const base=metrics(pairs.map(p=>p.base)),candidate=metrics(pairs.map(p=>p.candidate));
  const selected=rows.find(r=>r.id===selectedId);
  function open(r:Trace){setSelectedId(r.id);setDraft({...r})}
  function commit(){if(!draft)return;setRows(old=>old.map(r=>r.id===draft.id?draft:r));setSelectedId(null);toast.success("标注已保存")}
  function receive(batch:Trace[]){ setRows(old=>mergeLocal(old,batch).rows); }
  async function importText(text:string){try{
    if(new Blob([text]).size>fileLimit)throw Error("每次最多导入 5 MiB");
    let value;
    try{value=JSON.parse(text)}catch{/* legacy JSONL is parsed below */}
    if(value && typeof value==="object" && !Array.isArray(value) && "schema" in value){
      const row=await localRun(value,project.id), result=mergeLocal(rows,[row]);
      if(result.conflicts.length)throw Error("相同运行 ID 的内容有变化");
      receive([row]);setPaste("");setImportOpen(false);
      toast.success(result.added?"已接收本地运行":"此运行已接收");return;
    }
    const incoming=parseTraces(text);const known=new Set(rows.map(r=>r.id)),seen=new Set<string>();for(const r of incoming){if(known.has(r.id)||seen.has(r.id))throw Error("重复 Trace ID："+r.id);seen.add(r.id)}setRows(old=>[...incoming,...old]);setPaste("");setImportOpen(false);toast.success("已导入 "+incoming.length+" 条 Trace")}catch(e){toast.error(e instanceof Error?e.message:"导入失败")}}
  function exportData(){if(!dataset.length)return toast.error("Dataset 为空");saveFile(`harness-eval-${project.id}-dataset.jsonl`,dataset.map(r=>JSON.stringify(r)).join("\n")+"\n");toast.success("已导出 "+dataset.length+" 条样本")}
  function reset(){if(confirm("恢复当前项目的虚构示例数据？仅当前项目的导入和标注会被覆盖。")){setRows(exampleTraces);setBaseVersion("v1 基线");setCandidateVersion("v2 候选");toast.success("已恢复示例")}}
  const metricCards:[string,keyof ReturnType<typeof metrics>,"pct"|"token"|"sec"][]=[["Trigger Precision","precision","pct"],["Trigger Recall","recall","pct"],["Tool Accuracy","tool","pct"],["成功率","success","pct"],["平均 Token","tokens","token"],["平均 Latency","latency","sec"]];
  const title=view==="traces"?"运行轨迹":view==="dataset"?"评测数据集":"评测与回归";
  return <div className="app"><Toaster position="top-right" richColors/>
    <aside className="sidebar"><div className="brand"><div className="brand-icon"><Layers3 size={19}/></div><div><b>HARNESS <em>/ LAB</em></b><small>Eval 交互实验台</small></div></div><div className="project-picker"><label htmlFor="project-select">当前项目</label><select id="project-select" value={project.id} onChange={e=>onSwitch(e.target.value)}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><div><Button variant="outline" size="sm" onClick={onCreate}>新建项目</Button><Button variant="ghost" size="sm" onClick={onRename}>重命名</Button></div></div><div className="nav-label">工作区</div>
      <button className={view==="traces"?"nav active":"nav"} onClick={()=>setView("traces")}><Activity size={17}/> Trace 观察 <span>{rows.length}</span></button>
      <button className={view==="dataset"?"nav active":"nav"} onClick={()=>setView("dataset")}><Database size={17}/> Dataset 构建 <span>{dataset.length}</span></button>
      <button className={view==="eval"?"nav active":"nav"} onClick={()=>setView("eval")}><GitCompareArrows size={17}/> Eval 与回归</button>
      <div className="sidebar-foot"><ShieldCheck size={18}/><div><b>私有实验空间</b><small>{storage}</small><p>示例为虚构场景。导入前请先脱敏。</p></div></div>
    </aside>
    <main className="main"><header className="topbar"><div>Workspace <span>/</span> {project.name} <span>/</span> <b>{title}</b></div><div className="top-actions"><Button variant="outline" size="sm" onClick={reset}><RotateCcw size={14}/> 重置示例</Button></div></header>
      <div className="content"><div className="heading"><div><span className="eyebrow">TRACE → DATASET → EVAL</span><h1>{title}</h1><p>{view==="traces"?"检查每一步的实际行为，定位首要失败环节。":view==="dataset"?"从已检查的 Trace 中挑选样本，保留预期结果与人工标注。":"用相同 case ID 配对两个版本，观察质量、成本和未修复问题。"}</p></div><div>{view==="traces"?<Button className="primary-btn" onClick={()=>setImportOpen(true)}><Plus size={17}/> 导入 Trace</Button>:view==="dataset"?<Button className="primary-btn" onClick={exportData}><Download size={16}/> 导出 JSONL</Button>:null}</div></div>
      <div className="flow"><span className={view==="traces"?"chosen":""}><i>01</i> Trace 观察</span><ArrowRight size={14}/><span className={view==="dataset"?"chosen":""}><i>02</i> Dataset 标注</span><ArrowRight size={14}/><span className={view==="eval"?"chosen":""}><i>03</i> Eval 回归</span><small>{rows.length} 条运行记录 · {dataset.length} 条样本</small></div>
      <div hidden={view!=="traces"}><LocalInbox projectId={project.id} rows={rows} receive={receive}/></div>
      {view==="traces"&&<><div className="stat-grid">{[["运行记录",rows.length,"跨 "+versions.length+" 个版本"],["失败记录",rows.filter(r=>r.success===false).length,"需要定位首要原因"],["已标注失败",rows.filter(r=>r.failureStage).length,"覆盖 "+stages.filter(s=>rows.some(r=>r.failureStage===s)).length+" 个阶段"],["进入 Dataset",dataset.length,"可用于版本评测"]].map(([name,value,note])=><div className="stat" key={name}><span>{name}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
        <section className="panel"><div className="panel-head"><div><h2>Trace 列表</h2><p>点击记录查看分阶段轨迹与标注</p></div><div className="filters"><div className="search"><Search size={15}/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索 ID、Agent、任务"/></div><Select value={filter} onValueChange={v=>setFilter(v||"all")}><SelectTrigger><Filter size={14}/><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">全部记录</SelectItem><SelectItem value="failed">仅失败</SelectItem><SelectItem value="labeled">已标注</SelectItem><SelectItem value="dataset">Dataset 内</SelectItem></SelectContent></Select></div></div>
        <div className="table-scroll"><table><thead><tr><th>TRACE / 任务</th><th>版本</th><th>首要失败阶段</th><th>结果</th><th>Token</th><th>Latency</th><th></th></tr></thead><tbody>{visible.map(r=><tr key={r.id} tabIndex={0} onClick={()=>open(r)} onKeyDown={e=>e.key==="Enter"&&open(r)}><td><b>{r.title}</b><small className="mono">{r.origin ? r.origin.source+" · "+r.origin.runId : r.id} · {r.caseId}</small></td><td><span className="version">{r.version}</span></td><td>{r.failureStage?<span className="stage">{r.failureStage}</span>:<span className="muted">—</span>}</td><td><span className={r.success===null?"muted":r.success?"result pass":"result fail"}>● {verdict(r.success)}</span></td><td className="mono">{r.tokens?.toLocaleString()??"—"}</td><td className="mono">{r.latency===null?"—":r.latency.toFixed(1)+"s"}</td><td><ArrowRight size={15}/></td></tr>)}</tbody></table>{!visible.length&&<div className="empty">没有符合条件的 Trace。</div>}</div></section><p className="hint"><CircleHelp size={15}/> 指标只按 Dataset 内样本计算；修改预期字段后，Eval 会立即更新。</p></>}
      {view==="dataset"&&<><div className="banner"><Database size={23}/><div><b>从 Trace 到可复用样本</b><p>纳入的数据携带任务输入、预期与实际 Skill / Tool、阶段标注和版本信息。失败样本建议填写首要失败阶段及原因。</p></div><strong>{dataset.length} / {rows.length} 已纳入</strong></div><section className="panel"><div className="panel-head"><div><h2>样本清单</h2><p>点击样本可修订预期、失败标签与备注</p></div><Button variant="outline" onClick={exportData}><Download size={15}/> 导出数据集</Button></div><div className="table-scroll"><table><thead><tr><th>CASE / 样本</th><th>版本</th><th>预期 → 实际 Skill</th><th>预期 → 实际 Tool</th><th>标注</th><th></th></tr></thead><tbody>{dataset.map(r=><tr key={r.id} tabIndex={0} onClick={()=>open(r)} onKeyDown={e=>e.key==="Enter"&&open(r)}><td><b>{r.title}</b><small className="mono">{r.caseId} · {r.id}</small></td><td><span className="version">{r.version}</span></td><td className="mono">{labelName(r.expectedSkill)} → <span className={r.expectedSkill===r.predictedSkill?"":"wrong"}>{labelName(r.predictedSkill)}</span></td><td className="mono">{labelName(r.expectedTool)} → <span className={r.expectedTool===r.predictedTool?"":"wrong"}>{labelName(r.predictedTool)}</span></td><td>{r.failureStage?<span className="stage">{r.failureStage} · {r.failureType||"未分类"}</span>:<span className="muted">成功 / 未标注</span>}</td><td><ArrowRight size={15}/></td></tr>)}</tbody></table>{!dataset.length&&<div className="empty">Dataset 暂无样本。前往 Trace 列表打开记录，并开启「纳入 Dataset」。</div>}</div></section><div className="links"><button onClick={()=>setView("traces")}>返回 Trace 观察 →</button><button onClick={()=>setView("eval")}>查看 Eval 回归 →</button></div></>}
      {view==="eval"&&<><div className="eval-toolbar"><div>对比版本 <Select value={baseVersion} onValueChange={v=>setBaseVersion(v||"")}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{evalVersions.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select><ArrowRight size={16}/><Select value={candidateVersion} onValueChange={v=>setCandidateVersion(v||"")}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{evalVersions.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div><small>{pairs.length} 组匹配 case ID · 仅统计 Dataset 样本</small></div>
        {ambiguous.length>0&&baseVersion!==candidateVersion&&<div className="notice">以下 case 在同一版本有多条样本，请在 Dataset 中各保留一条再对比：{ambiguous.join("、")}</div>}{baseVersion===candidateVersion||!pairs.length?<div className="notice">{evalVersions.length<2?"请先将两个不同版本的样本纳入 Dataset，并为同一任务填写相同的 case ID。":baseVersion===candidateVersion?"请选择两个不同版本进行回归对比。":"暂无可唯一配对的样本。请检查两个版本在 Dataset 中的 case ID。"}</div>:<><div className="metric-grid">{metricCards.map(([label,key,kind])=>{const a=base[key],b=candidate[key],delta=a!==null&&b!==null?b-a:null,good=kind==="pct"?(delta??0)>=0:(delta??0)<=0;const fmt=(n:number|null)=>n===null?"—":kind==="pct"?pct(n):kind==="sec"?n.toFixed(1)+"s":Math.round(n).toLocaleString();return <div className="metric" key={label}><span>{label}</span><strong>{fmt(b)}</strong><div>基线 {fmt(a)} <b className={good?"good":"bad"}>{delta===null?"—":kind==="pct"?sign(Math.round(delta*100)," pp"):kind==="sec"?sign(delta,"s"):sign(Math.round(delta))}</b></div></div>})}</div><div className="eval-lower"><section className="panel"><div className="panel-head"><div><h2>首要失败阶段</h2><p>按已标注失败样本分布</p></div></div><div className="bars">{stages.map(s=>{const a=pairs.filter(p=>p.base.failureStage===s).length,b=pairs.filter(p=>p.candidate.failureStage===s).length;return <div className="bar-row" key={s}><span>{s}</span><div><i style={{width:(a/pairs.length*100)+"%"}}/><em style={{width:(b/pairs.length*100)+"%"}}/></div><small>{a} → {b}</small></div>})}<div className="legend">■ 基线　 <span>■ 候选</span></div></div></section><section className="insight"><h2>回归观察</h2><p>{pairs.filter(p=>p.base.success===false&&p.candidate.success===true).length} 个失败 case 已修复；{pairs.filter(p=>p.base.success===true&&p.candidate.success===false).length} 个成功 case 出现退化。</p><hr/><b>仍需关注</b>{pairs.filter(p=>p.candidate.success===false).map(p=><button key={p.candidate.id} onClick={()=>open(p.candidate)}>{p.candidate.caseId} · {p.candidate.title} →</button>)}{pairs.every(p=>p.candidate.success)&&<p>候选版本的配对样本全部成功。</p>}<small>样本量较小，指标仅用于体验工作流。</small></section></div><section className="panel"><div className="panel-head"><div><h2>逐 Case 回归</h2><p>相同 case ID 对齐，查看修复和退化</p></div></div><div className="table-scroll"><table><thead><tr><th>CASE</th><th>基线</th><th>候选</th><th>变化</th><th>Token 变化</th><th>Latency 变化</th></tr></thead><tbody>{pairs.map(({base:b,candidate:c})=><tr key={b.id} tabIndex={0} onClick={()=>open(c)} onKeyDown={e=>e.key==="Enter"&&open(c)}><td><b>{b.title}</b><small className="mono">{b.caseId}</small></td><td className={b.success===null?"muted":b.success?"good":"bad"}>{verdict(b.success)}</td><td className={c.success===null?"muted":c.success?"good":"bad"}>{verdict(c.success)}</td><td className={b.success===false&&c.success===true?"good":b.success===true&&c.success===false?"bad":"muted"}>{b.success===false&&c.success===true?"已修复":b.success===true&&c.success===false?"退化":b.success===null||c.success===null?"待标注":"持平"}</td><td className="mono">{difference(b.tokens,c.tokens)}</td><td className="mono">{difference(b.latency,c.latency,"s")}</td></tr>)}</tbody></table></div></section><p className="hint"><CircleHelp size={16}/> Trigger Precision = 正确触发 / 所有触发；Recall = 正确触发 / 所有应触发。Tool Accuracy = 预期与实际工具完全一致的样本占比。成功率来自 success 字段；各指标仅统计相应字段有观测值的样本。空 Skill 表示无需专门 Skill。</p></>}</>}
      </div></main>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent className="import-dialog"><DialogHeader><DialogTitle>导入脱敏 Trace</DialogTitle><DialogDescription>支持本地采集器的 .trace.json 文件，以及原有 JSON、JSON 数组或 JSONL。{storage}。</DialogDescription></DialogHeader><div className="import-body"><div><Button variant="outline" onClick={()=>fileRef.current?.click()}><Upload size={16}/> 选择 .json / .jsonl 文件</Button><input hidden ref={fileRef} type="file" accept=".json,.jsonl,.ndjson,application/json" onChange={async e=>{const field=e.currentTarget;const f=field.files?.[0];field.value="";if(f){if(f.size>5*1024*1024)toast.error("文件不能超过 5 MB");else try{await importText(await f.text())}catch{toast.error("读取文件失败")}}}}/><Button variant="ghost" onClick={()=>setPaste(JSON.stringify({...exampleTraces[1],id:"IM-EXAMPLE-01",caseId:"C-NEW",inDataset:false},null,2))}>填入格式示例</Button></div><label htmlFor="paste">或粘贴 Trace</label><Textarea id="paste" rows={9} value={paste} onChange={e=>setPaste(e.target.value)} placeholder='{"caseId":"C-01","version":"v1","title":"...","input":"...","expectedSkill":"...","predictedSkill":"...","expectedTool":"...","predictedTool":"...","success":false,"tokens":1200,"latency":4.5}'/><p>必填：caseId、version、title、input、预期与实际 Skill / Tool、success、tokens、latency。相同任务的不同版本使用相同 caseId。</p><div className="dialog-buttons"><Button variant="outline" onClick={()=>setImportOpen(false)}>取消</Button><Button className="primary-btn" disabled={!paste.trim()} onClick={()=>importText(paste)}>解析并导入</Button></div></div></DialogContent></Dialog>
    <Sheet open={!!selectedId} onOpenChange={v=>{if(!v)setSelectedId(null)}}><SheetContent side="right" className="trace-sheet"><SheetHeader><div className="drawer-kicker">TRACE INSPECTOR · {selected?.id}</div><SheetTitle>{selected?.title}</SheetTitle><SheetDescription>{selected?.caseId} · {selected?.version} · {selected?.tokens?.toLocaleString()??"—"} tokens · {selected?.latency==null?"—":selected.latency.toFixed(1)+"s"}</SheetDescription></SheetHeader>{draft&&<div className="drawer-scroll"><div className="request"><b>用户请求</b><p>{draft.input || "未采集请求正文"}</p>{draft.outputSummary&&<><b>交付结果摘要</b><p>{draft.outputSummary}</p></>}{draft.origin&&<p>来源 {draft.origin.source} · 运行 {draft.origin.runId} · 进程状态 {{completed:"已完成",failed:"失败",interrupted:"中断"}[draft.origin.state]}</p>}</div><section className="drawer-section"><h3>执行轨迹 <span>{draft.steps.length} 步</span></h3>{draft.steps.length?<div className="timeline">{draft.steps.map((s,i)=><div key={i} className="timeline-item"><i className={s.status}/><b>{s.stage}</b><p>{s.observation}</p></div>)}</div>:<p className="muted">导入记录没有 steps；可根据字段和原始记录标注。</p>}</section><section className="drawer-section"><h3>预期与实际</h3><div className="field-grid">{([["expectedSkill","预期 Skill"],["predictedSkill","实际 Skill"],["expectedTool","预期 Tool"],["predictedTool","实际 Tool"]] as const).map(([key,label])=><label key={key}>{label}<Input value={draft[key]??""} placeholder={draft[key]===null?"待确认":"无"} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>{draft[key]===null&&<button type="button" onClick={()=>setDraft({...draft,[key]:""})}>确认无{key.endsWith("Skill")?" Skill":" Tool"}</button>}</label>)}<label>case ID <Input value={draft.caseId} onChange={e=>setDraft({...draft,caseId:e.target.value})}/></label><label>版本 <Input value={draft.version} onChange={e=>setDraft({...draft,version:e.target.value})}/></label></div><label className="check-line">任务结果 <select value={draft.success===null?"pending":String(draft.success)} onChange={e=>setDraft({...draft,success:e.target.value==="pending"?null:e.target.value==="true"})}>{draft.origin&&<option value="pending">待标注</option>}<option value="true">成功</option><option value="false">失败</option></select></label></section><section className="drawer-section"><h3>失败标注</h3><p className="guidance">标记最早导致任务偏离的主要阶段；下游症状写入备注。</p><div className="field-grid"><label>首要失败阶段<Select value={draft.failureStage||"none"} onValueChange={v=>setDraft({...draft,failureStage:v==="none"?"":v as Stage})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">无 / 未标注</SelectItem>{stages.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></label><label>失败类型<Select value={draft.failureType||"none"} onValueChange={v=>setDraft({...draft,failureType:v==="none"?"":v||""})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">未分类</SelectItem>{failureTypes.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></label></div><label>标注依据 / 修复假设<Textarea rows={3} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})} placeholder="描述首要原因和期望行为…"/></label><label className="check-line"><Checkbox checked={draft.inDataset} onCheckedChange={v=>setDraft({...draft,inDataset:v===true})}/><span><b>纳入 Dataset</b><small>用于 Eval 指标和回归对比</small></span></label></section></div>}<div className="drawer-footer"><Button variant="outline" onClick={()=>setSelectedId(null)}>取消</Button><Button className="primary-btn" onClick={commit}>保存标注 <Check size={16}/></Button></div></SheetContent></Sheet>
  </div>
}
