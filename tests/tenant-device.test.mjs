import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceKey, fromWorkspacePage, setDeviceKey } from "../lib/tenant-device.ts";

const url = "https://example.test/api/tenant/workspace";
const page = { "X-Harness-Workspace": "1" };
const cookie = "__Secure-harness-eval-workspace=hew_test";

test("device cookie is restricted to HTTPS workspace requests for 30 days", () => {
  const header = setDeviceKey(new Response(), "hew_test").headers.get("set-cookie");
  for (const part of [cookie, "Path=/api/tenant/workspace", "Max-Age=2592000", "HttpOnly", "Secure", "SameSite=Strict"])
    assert.ok(header.split("; ").includes(part));
  const forgotten = setDeviceKey(new Response(), "").headers.get("set-cookie");
  assert.match(forgotten, /Max-Age=0;/);
  assert.ok(!forgotten.includes("hew_test"));
});

test("cookie authentication requires an application request and matching origin", () => {
  const req = headers => new Request(url, {headers});
  assert.equal(deviceKey(req({...page, Cookie: cookie})), "hew_test");
  assert.equal(deviceKey(req({...page, Cookie: cookie, Origin: "https://other.test"})), "");
  assert.equal(deviceKey(req({Cookie: cookie})), "");
  assert.equal(deviceKey(req(page)), "");
  assert.ok(fromWorkspacePage(req({...page, Origin: "https://example.test"})));
});
