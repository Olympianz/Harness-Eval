/* eslint-disable @next/next/no-html-link-for-pages -- The production vinext router fails on client navigation; use document links. */
"use client";
import { useState } from "react";

export function KeyEntry({ title, description, onEnter, allowRemember = false, message, alternative }: {
  title: string; description: string; onEnter: (key: string, remember: boolean) => void; allowRemember?: boolean; message?: string; alternative?: React.ReactNode;
}) {
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);
  return <main className="portal"><div className="gate">
    <a href="/">← Harness Eval</a><h1>{title}</h1><p>{description}</p>
    <form onSubmit={event => { event.preventDefault(); if (value.trim()) onEnter(value.trim(), remember); }}>
      <label>访问密钥<input required type="password" value={value} autoComplete="off" onChange={e => setValue(e.target.value)} /></label>
      {allowRemember && <label><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> 在此设备上记住密钥（30 天）</label>}
      {message && <p role="status">{message}</p>}
      <button className="cta">进入 →</button>
      {alternative}
    </form>
  </div></main>;
}
