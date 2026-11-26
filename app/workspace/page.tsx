"use client";
import { useState } from "react";
import Workbench from "../workbench";
import { KeyEntry } from "../key-entry";

export default function EnterpriseWorkspace() {
  const [token, setToken] = useState("");
  if (!token) return <KeyEntry title="进入企业工作区" description="输入平台管理员分配给本企业的访问密钥。" onEnter={setToken} />;
  return <Workbench mode="tenant" accessKey={token} onExit={() => setToken("")} />;
}
