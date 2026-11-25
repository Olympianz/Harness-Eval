// Each invocation starts a fresh Chrome profile so a successful read cannot come from localStorage.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";

const [phase, name] = process.argv.slice(2);
if (!["write", "reopen", "restart-read"].includes(phase) || !name) throw Error("Invalid test phase or name");
const token = (await readFile("/dev/stdin", "utf8")).trimEnd();
if (!token) throw Error("Missing application token");
const origin = new URL(process.env.HARNESS_APP_ORIGIN).origin;
const profile = await mkdtemp(join(tmpdir(), "harness-browser-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless", "--disable-background-networking", "--disable-extensions", "--no-first-run",
  "--no-default-browser-check", "--remote-debugging-pipe", "--user-data-dir=" + profile, "about:blank",
], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
const exited = once(chrome, "exit");
const pending = new Map();
let id = 0;
let buffer = "";
chrome.stdio[4].setEncoding("utf8");
chrome.stdio[4].on("data", chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf("\0")) !== -1) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    pending.get(message.id)?.(message);
  }
});

function call(method, params = {}, sessionId) {
  const seq = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(seq); reject(Error(method + " timed out")); }, 15000);
    pending.set(seq, message => {
      clearTimeout(timer);
      pending.delete(seq);
      if (message.error) reject(Error(method + " failed: " + message.error.message));
      else resolve(message.result);
    });
    chrome.stdio[3].write(JSON.stringify({ id: seq, method, params, sessionId }) + "\0");
  });
}

async function verify() {
  const { targetId } = await call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => call(method, params, sessionId);
  await send("Page.enable");
  // Supply the same answers as an operator using the two application prompts.
  await send("Page.addScriptToEvaluateOnNewDocument", { source:
    "if (location.origin === " + JSON.stringify(origin) + ") window.prompt = msg => " +
    "msg.includes('应用访问密钥') ? " + JSON.stringify(token) +
    " : msg === '新项目名称' ? " + JSON.stringify(name) + " : null"
  });
  const { errorText } = await send("Page.navigate", { url: origin });
  if (errorText) throw Error("Page navigation failed: " + errorText);
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw Error("Unexpected page error during " + phase);
    return result.result.value;
  }
  async function waitFor(expression, label) {
    const deadline = Date.now() + 45000;
    do {
      if (await evaluate(expression)) return;
      await delay(200);
    } while (Date.now() < deadline);
    throw Error(phase + ": timed out waiting for " + label);
  }
  async function click(label) {
    const button = "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === " +
      JSON.stringify(label) + " && !b.disabled && b.getClientRects().length)";
    await waitFor("Boolean(" + button + ")", label);
    await evaluate(button + ".click()");
  }
  const status = label => "document.body?.innerText.includes(" + JSON.stringify(label) + ")";
  const selected = "document.querySelector('#project-select')?.selectedOptions[0]?.textContent === " + JSON.stringify(name);
  const trace = "[...document.querySelectorAll('tbody small')].some(el => el.textContent.startsWith('IM-EXAMPLE-01 ·'))";
  await waitFor("Boolean(document.querySelector('#project-select'))", "authenticated workspace");
  if (phase === "write") {
    await waitFor(status("已从 NAS 加载") + " || " + status("已保存到 NAS"), "initial database load or save");
    if (await evaluate("[...document.querySelector('#project-select').options].some(o=>o.textContent===" + JSON.stringify(name) + ")")) {
      throw Error("Test project name already exists");
    }
    await click("新建项目");
    await waitFor(selected, "new project");
    await click("导入 Trace");
    await click("填入格式示例");
    await click("解析并导入");
    await waitFor(trace, "imported trace");
    await waitFor(status("已保存到 NAS"), "database save acknowledgment");
  } else {
    await waitFor(status("已从 NAS 加载"), "database load acknowledgment");
    await waitFor(selected, "previously saved project");
    await waitFor(trace, "previously saved trace");
  }
  console.log("PASS " + phase + " — " + name + " / IM-EXAMPLE-01");
}

try {
  await verify();
} finally {
  chrome.kill("SIGTERM");
  const force = setTimeout(() => chrome.kill("SIGKILL"), 3000);
  try { await exited; } finally { clearTimeout(force); }
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
