"use client";
import { useState } from "react";
import Link from "next/link";

export function KeyEntry({ title, description, onEnter }: {
  title: string; description: string; onEnter: (key: string) => void;
}) {
  const [value, setValue] = useState("");
  return <main className="portal"><div className="gate">
    <Link href="/">← Harness Eval</Link><h1>{title}</h1><p>{description}</p>
    <form onSubmit={event => { event.preventDefault(); if (value.trim()) onEnter(value.trim()); }}>
      <label>访问密钥<input required type="password" value={value} autoComplete="off" onChange={e => setValue(e.target.value)} /></label>
      <button className="cta">进入 →</button>
    </form>
  </div></main>;
}
