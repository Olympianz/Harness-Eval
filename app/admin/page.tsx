/* eslint-disable @next/next/no-html-link-for-pages -- The production vinext router fails on client navigation; use document links. */
"use client";
import { useState } from "react";
import { z } from "zod";
import { KeyEntry } from "../key-entry";

type Tenant = { id: string; name: string; active: boolean };
const responseSchema = z.object({ error: z.string().optional(), key: z.string().optional(), tenants: z.array(z.object({id:z.string(),name:z.string(),active:z.boolean()})).optional() });
type Operation =
  | { action: "create"; name: string }
  | { action: "configure"; id: string; name: string; active: boolean }
  | { action: "rotate"; id: string }
  | { action: "ingest"; id: string; projectId: string };

function TenantEditor({ tenant, busy, submit }: {
  tenant: Tenant; busy: boolean; submit: (op: Operation) => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [active, setActive] = useState(tenant.active);
  const [projectId, setProjectId] = useState("default");
  return <article className="tenant-card">
    <h2>{tenant.name}</h2><p>{tenant.active ? "运行中" : "已停用"} · <code>{tenant.id}</code></p>
    <fieldset disabled={busy}>
      <form onSubmit={event => {
        event.preventDefault();
        if (tenant.active && !active && !confirm("停用后，该企业的工作区及 Agent 接入将暂停。确认保存？")) return;
        submit({ action: "configure", id: tenant.id, name, active });
      }}>
        <label>企业名称<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> 启用租户</label>
        <button>保存配置</button>
      </form>
      <button onClick={() => { if (confirm("轮换后原工作区密钥立即失效。继续？")) submit({ action: "rotate", id: tenant.id }); }}>轮换企业访问密钥</button>
      <form onSubmit={e => {
        e.preventDefault();
        if (confirm("签发后，此项目的旧接入密钥立即失效。继续？")) submit({ action: "ingest", id: tenant.id, projectId });
      }}>
        <label>Agent 目标项目 ID<input required value={projectId} maxLength={240} onChange={e => setProjectId(e.target.value)} /></label>
        <button disabled={!tenant.active}>签发项目接入密钥</button>
      </form>
    </fieldset>
  </article>;
}

export default function Admin() {
  const [token, setToken] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [issued, setIssued] = useState<{ label: string; key: string } | null>(null);
  const [name, setName] = useState("");
  async function list(key: string) {
    const res = await fetch("/api/admin/tenants", { headers: { Authorization: "Bearer " + key }, cache: "no-store" });
    const data = responseSchema.parse(await res.json());
    if (!res.ok) throw Error(data.error || "无法读取租户");
    if (!data.tenants) throw Error("租户列表格式错误");
    setTenants(data.tenants);
  }
  async function login(key: string) {
    setMessage(""); setBusy(true);
    try { await list(key); setToken(key); }
    catch (e) { setMessage(e instanceof Error ? e.message : "登录失败"); }
    finally { setBusy(false); }
  }
  async function mutate(op: Operation) {
    if (busy) return;
    setBusy(true); setMessage(""); setIssued(null);
    try {
      const res = await fetch("/api/admin/tenants", { method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(op) });
      const data = responseSchema.parse(await res.json());
      if (!res.ok) throw Error(data.error || "操作失败");
      const company = op.action === "create" ? op.name : tenants.find(t => t.id === op.id)?.name;
      if (data.key) setIssued({ label: company + (op.action === "ingest" ? " · " + op.projectId + " 接入密钥" : " · 企业访问密钥"), key: data.key });
      if (op.action === "create") setName("");
      setMessage("已保存"); await list(token);
    } catch (e) { setMessage(e instanceof Error ? e.message : "请求失败"); }
    finally { setBusy(false); }
  }
  if (!token) return <><KeyEntry title="租户管理后台" description="使用平台管理员密钥管理企业和项目接入权限。" onEnter={login} /><div role="status" className="login-status">{busy ? "正在验证…" : message}</div></>;
  return <main className="portal admin"><header><a href="/">Harness Eval</a><button disabled={busy} onClick={() => { setToken(""); setIssued(null); setTenants([]); setMessage(""); }}>退出管理</button></header>
    <h1>租户管理</h1><form className="create-tenant" onSubmit={e => { e.preventDefault(); void mutate({ action: "create", name }); }}>
      <label>新企业名称<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="例如：星河科技" /></label>
      <button disabled={busy} className="cta">创建租户</button>
    </form>
    <p role="status">{message}</p>
    {issued && <section className="issued"><strong>{issued.label}</strong><p>仅显示一次，请复制到密码管理器。</p><input aria-label="新签发的密钥" readOnly value={issued.key} onFocus={e => e.target.select()} /><button onClick={() => setIssued(null)}>关闭</button></section>}
    {!tenants.length && <p>尚未创建企业租户。</p>}
    <div className="tenant-grid">{tenants.map(t => <TenantEditor key={t.id + t.name + t.active} tenant={t} busy={busy} submit={mutate} />)}</div>
  </main>;
}
