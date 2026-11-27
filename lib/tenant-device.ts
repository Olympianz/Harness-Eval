const cookieName = "__Secure-harness-eval-workspace";
const cookiePath = "/api/tenant/workspace";
const day = 24 * 60 * 60;

export function fromWorkspacePage(request: Request) {
  const origin = request.headers.get("origin");
  return request.headers.get("x-harness-workspace") === "1" &&
    (!origin || origin === new URL(request.url).origin);
}

export function deviceKey(request: Request) {
  if (!fromWorkspacePage(request)) return "";
  const cookie = (request.headers.get("cookie") ?? "").split(";")
    .map(part => part.trim()).find(part => part.startsWith(cookieName + "="));
  return cookie?.slice(cookieName.length + 1) ?? "";
}

export function setDeviceKey(response: Response, key: string, persistent = true) {
  const lifetime = !key ? "Max-Age=0; " : persistent ? `Max-Age=${30 * day}; ` : "";
  response.headers.append("Set-Cookie",
    `${cookieName}=${key}; Path=${cookiePath}; ${lifetime}HttpOnly; Secure; SameSite=Strict`);
  return response;
}
