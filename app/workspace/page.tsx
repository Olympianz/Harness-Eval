"use client";
import { useCallback, useState } from "react";
import Workbench from "../workbench";
import { MemberLogin } from "./member-login";

type Login = { key: string; remember: boolean };

export default function EnterpriseWorkspace() {
  // Start by asking the server to restore this browser's HttpOnly cookie.
  const [login, setLogin] = useState<Login | null>({ key: "", remember: false });
  const [message, setMessage] = useState("");
  const denied = useCallback(() => {
    setMessage(login?.key ? "企业密钥无效或租户已停用，请重新输入。" : "");
    setLogin(null);
  }, [login]);
  async function logout() {
    try {
      const res = await fetch("/api/tenant/workspace", {
        method: "DELETE", headers: { "X-Harness-Workspace": "1" },
      });
      if (!res.ok) throw new Error();
      setMessage("");
      setLogin(null);
    } catch {
      setMessage("未能清除设备登录状态，请检查网络后再次退出。");
    }
  }
  if (!login) return <MemberLogin message={message}
    onLogin={() => { setMessage(""); setLogin({key:"",remember:false}); }}
    onKey={(key,remember) => { setMessage(""); setLogin({key,remember}); }} />;
  return <>{message && <p role="status">{message}</p>}
    <Workbench mode="tenant" accessKey={login.key} remember={login.remember} onDenied={denied} onExit={logout} /></>;
}
