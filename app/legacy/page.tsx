"use client";
import { useState } from "react";
import Workbench from "../workbench";
import { KeyEntry } from "../key-entry";
export default function Legacy() {
  const [token, setToken] = useState("");
  if (process.env.NEXT_PUBLIC_STORAGE_MODE !== "nas") return <Workbench mode="local" />;
  if (!token) return <KeyEntry title="原私有工作区" description="使用已有 NAS 应用访问密钥登录。" onEnter={setToken} />;
  return <Workbench mode="legacy" accessKey={token} onExit={() => setToken("")} />;
}
