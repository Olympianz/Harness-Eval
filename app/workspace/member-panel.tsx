"use client";
import { z } from "zod";
import { useCallback, useEffect, useState } from "react";

const labels = {admin:"管理员", editor:"可编辑", viewer:"只读"} as const;
export type MemberRole = keyof typeof labels;
export const roleLabel = (role: MemberRole) => labels[role];
type Member = {id:string;username:string;role:MemberRole;active:boolean};
type Action = {action:"create";username:string;password:string;role:MemberRole}
  | {action:"configure";id:string;role:MemberRole;active:boolean}
  | {action:"password";id:string;password:string};

function Roles({value}:{value:MemberRole}){
  return <select name="role" defaultValue={value}>{Object.entries(labels).map(([key,label])=>
    <option key={key} value={key}>{label}</option>)}</select>;
}
export function MemberPanel({tenant,onClose,onExpired}:{tenant:string;onClose:()=>void;onExpired:()=>void}){
  const [members,setMembers]=useState<Member[]>([]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const request=useCallback(async (op?: Action)=>{
    const res=await fetch("/api/tenant/workspace/members",{method:op?"POST":"GET",cache:"no-store",
      headers:{"X-Harness-Workspace":"1","X-Tenant-Id":tenant,"Content-Type":"application/json"},
      body:op?JSON.stringify(op):undefined});
    const data=z.object({error:z.string().optional(),reauthenticate:z.boolean().optional(),members:z.array(z.object({id:z.string(),username:z.string(),role:z.enum(["admin","editor","viewer"]),active:z.boolean()})).optional()}).parse(await res.json());if(!res.ok)throw Error(data.error||"无法读取成员");return data;
  },[tenant]);
  useEffect(()=>{let live=true;request().then(data=>{if(live)setMembers(data.members??[]);})
    .catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};},[request]);
  async function save(op:Action,form:HTMLFormElement){
    if(busy)return;setBusy(true);setMessage("");
    try {const res=await request(op);if(res.reauthenticate){onExpired();return;}
      if(op.action!=="configure")form.reset();
      setMembers((await request()).members??[]);setMessage("已保存");
    }catch(e){setMessage(e instanceof Error?e.message:"操作失败");}finally{setBusy(false);}
  }
  return <section className="portal admin"><header><h1>成员与权限</h1><button onClick={onClose}>返回工作区</button></header>
    <p>企业 ID <code>{tenant}</code></p>
    <p>管理员管理成员及项目，可编辑成员维护项目和样本，只读成员查看和导出数据。</p>
    <p role="status">{message}</p><fieldset disabled={busy}>
      <form className="member-form" onSubmit={e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f);
        void save({action:"create",username:String(d.get("username")),password:String(d.get("password")),role:d.get("role") as MemberRole},f);}}>
        <label>新账号<input name="username" required minLength={2} maxLength={64} placeholder="字母、数字、点、下划线或短横线" /></label>
        <label>初始密码<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
        <label>角色<Roles value="viewer"/></label><button>创建账号</button>
      </form>
      <div className="tenant-grid">{members.map(m=><article className="tenant-card" key={m.id+m.role+m.active}>
        <h2>{m.username}</h2><p>{roleLabel(m.role)} · {m.active?"已启用":"已停用"}</p>
        <form onSubmit={e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f);
          void save({action:"configure",id:m.id,role:d.get("role") as MemberRole,active:d.has("active")},f);}}>
          <label>角色<Roles value={m.role}/></label>
          <label><input type="checkbox" name="active" defaultChecked={m.active}/> 启用账号</label><button>保存权限</button>
        </form>
        <details><summary>重设密码</summary><form onSubmit={e=>{e.preventDefault();const f=e.currentTarget;
          void save({action:"password",id:m.id,password:String(new FormData(f).get("password"))},f);}}>
          <label>新密码<input type="password" name="password" minLength={12} required autoComplete="new-password"/></label>
          <button>更新密码并撤销已有登录</button></form></details>
      </article>)}</div>
    </fieldset></section>;
}
