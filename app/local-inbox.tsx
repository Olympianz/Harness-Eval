"use client";
import {useEffect, useEffectEvent, useState} from "react";
import {Button} from "@/components/ui/button";
import {fileLimit, localRun} from "./local-runs";
import type {Trace} from "./data";

type Folder = {name:string; values:()=>AsyncIterable<FileSystemFileHandle|FileSystemDirectoryHandle>};
type Picker = {showDirectoryPicker?:()=>Promise<Folder>};

export function LocalInbox({projectId, rows, receive}:{projectId:string; rows:Trace[]; receive:(batch:Trace[])=>void}) {
  const [folder,setFolder] = useState<Folder|null>(null);
  const [message,setMessage] = useState("");
  const currentRows = useEffectEvent(() => rows);
  const deliver = useEffectEvent(receive);
  async function connect() {
    const picker = (window as Window & Picker).showDirectoryPicker;
    if (!picker) {
      setMessage("此浏览器可通过「导入 Trace」选择 .trace.json 文件。");
      return;
    }
    try { setFolder(await picker.call(window)); }
    catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setMessage("目录授权失败，可改用文件导入。"); }
  }

  useEffect(() => {
    if (!folder) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const cache = new Map<string,{size:number;modified:number;id:string;digest:string}>();
    async function scan() {
      const existing = currentRows();
      const known = new Map(existing.map(row=>[row.id,row.origin?.digest]));
      let checked = 0, errors = 0, firstError = "";
      const batch: Trace[] = [];
      try {
        for await (const entry of folder!.values()) {
          if (stopped) return;
          if (entry.kind !== "file" || !entry.name.endsWith(".trace.json")) continue;
          try {
            const file = await entry.getFile();
            const cached = cache.get(entry.name);
            checked++;
            if (cached && cached.size === file.size && cached.modified === file.lastModified && known.get(cached.id) === cached.digest) continue;
            if (file.size > fileLimit) throw Error("超过 5 MiB");
            const run = await localRun(JSON.parse(await file.text()), projectId);
            const hash = run.origin!.digest;
            if (known.has(run.id) && known.get(run.id) !== hash) throw Error("相同运行 ID 的内容有变化，请核对来源");
            if (!known.has(run.id)) batch.push(run);
            known.set(run.id, hash);
            cache.set(entry.name,{size:file.size,modified:file.lastModified,id:run.id,digest:hash});
            if (batch.length >= 50 && !stopped) deliver(batch.splice(0));
          } catch (err) {
            errors++;
            if (!firstError) firstError = entry.name + " · " + (err instanceof Error ? err.message : "读取失败");
          }
        }
        if (stopped) return;
        if (batch.length) deliver(batch);
        setMessage(`已检查 ${checked} 个文件` + (errors ? `，${errors} 个待处理。首个问题：${firstError}` : "，等待新记录。"));
      } catch {
        if (!stopped) setMessage("读取目录失败，请断开后重新授权。");
      }
      if (!stopped) timer = setTimeout(scan,5000);
    }
    void scan();
    return () => {stopped = true; clearTimeout(timer);};
  },[folder,projectId]);

  return <section className="panel inbox-panel" aria-label="本地 Agent 接入">
    <div><b>本地 Agent 接入</b><p>项目 ID <code>{projectId}</code> · {folder ? folder.name : "选择采集器的输出目录，页面打开期间自动接收。"}</p></div>
    <Button variant="outline" size="sm" onClick={folder ? ()=>{setFolder(null);setMessage("");} : connect}>{folder?"断开目录":"连接本地目录"}</Button>
    {message && <small role="status">{message}</small>}
  </section>;
}
