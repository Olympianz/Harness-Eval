/* eslint-disable @next/next/no-html-link-for-pages -- Native links support the production vinext router. */
"use client";
import { z } from "zod";
import { useState } from "react";
import { KeyEntry } from "../key-entry";

export function MemberLogin({onKey,onLogin,message}:{
  onKey:(key:string,remember:boolean)=>void; onLogin:()=>void; message:string;
}) {
  const [useKey,setUseKey]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  if (useKey) return <KeyEntry title="使用企业密钥登录" description="输入企业访问密钥即可进入共享工作区。"
    allowRemember message={message} onEnter={onKey} alternative={<button type="button" onClick={()=>setUseKey(false)}>使用账号和密码登录</button>} />;
  return <main className="portal"><div className="gate">
    <a href="/">← Harness Eval</a><h1>进入企业工作区</h1>
    <form onSubmit={async event=>{
      event.preventDefault(); if(busy)return;
      const data=new FormData(event.currentTarget);
      setBusy(true);setError("");
      try {
        const response=await fetch("/api/tenant/workspace/login",{method:"POST",
          headers:{"Content-Type":"application/json","X-Harness-Workspace":"1"},
          body:JSON.stringify({tenant:data.get("tenant"),username:data.get("username"),password:data.get("password"),remember:data.has("remember")})});
        if(!response.ok) throw Error(z.object({error:z.string()}).parse(await response.json()).error || "登录失败");
        onLogin();
      } catch(e){setError(e instanceof Error?e.message:"登录失败");}
      finally{setBusy(false);}
    }}>
      <label>企业 ID<input name="tenant" required placeholder="由租户管理员提供" autoCapitalize="none" /></label>
      <label>账号<input name="username" required autoComplete="username" autoCapitalize="none" /></label>
      <label>密码<input name="password" required type="password" autoComplete="current-password" /></label>
      <label><input name="remember" type="checkbox" /> 在此设备上保持登录（30 天）</label>
      {(error||message) && <p role="status">{error||message}</p>}
      <button disabled={busy} className="cta">{busy?"正在登录…":"登录"}</button>
      <button type="button" onClick={()=>setUseKey(true)}>使用企业访问密钥</button>
    </form>
  </div></main>;
}
