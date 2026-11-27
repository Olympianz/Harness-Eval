"""Exercise tenant lifecycle and isolation against the disposable localhost NAS build."""
import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib import error, request

ORIGIN = "http://127.0.0.1:25438"
ADMIN = "/api/admin/tenants"
WORKSPACE = "/api/tenant/workspace"
TRACE = "/api/traces?project=default"
operator = os.environ["TENANT_ADMIN_TOKEN"]


def call(path, key, status, body=None, method=None):
    req = request.Request(ORIGIN + path, method=method or ("POST" if body else "GET"),
                          headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
                          data=None if body is None else json.dumps(body).encode())
    try:
        response = request.urlopen(req, timeout=10)
    except error.HTTPError as exc:
        response = exc
    with response:
        assert response.status == status, (path, response.status, status)
        return json.load(response)


a, b = [call(ADMIN, operator, 201, {"action": "create", "name": n}) for n in ("Alpha", "Beta")]
aid, bid = a["tenant"]["id"], b["tenant"]["id"]
ak, bk = a["key"], b["key"]
call(ADMIN, ak, 401)
call(ADMIN, bk, 401, {"action": "rotate", "id": aid})
call(WORKSPACE, operator, 401)
call(WORKSPACE, os.environ["WORKSPACE_TOKEN"], 401)
call("/api/workspace", ak, 401)
initial = call(WORKSPACE, ak, 200)
assert initial["data"]["projects"][0]["rows"] == []
initial["data"]["projects"][0]["name"] = "Alpha private"
call(WORKSPACE + "?tenant=" + bid, ak, 200, initial, "PUT")
call(WORKSPACE, ak, 409, initial, "PUT")
assert call(WORKSPACE, bk, 200)["data"]["projects"][0]["name"] == "默认项目"
assert call(WORKSPACE, ak, 200)["data"]["projects"][0]["name"] == "Alpha private"


def issue(target):
    return call(ADMIN, operator, 200, {"action": "ingest", "id": target, "projectId": "default"})["key"]


with tempfile.TemporaryDirectory() as tmp:
    path = subprocess.check_output(["python3", "tools/collect-trace.py", "generic",
                                    "examples/local-agents/generic.json", "--project", "default",
                                    "--outbox", tmp, "--case", "enterprise", "--version", "v1"], text=True)
    run = json.loads(Path(path.strip()).read_text())
ika, ikb = issue(aid), issue(bid)
call(WORKSPACE, ika, 401)
call(TRACE, ak, 401, run)
call(TRACE, ika, 201, run)
call(TRACE, ika, 200, run)
assert not call(WORKSPACE, bk, 200)["data"]["projects"][0]["rows"]
call(TRACE, ikb, 201, run)
new_agent = issue(aid)
call(TRACE, ika, 401, run)
call(TRACE, new_agent, 200, run)
new_key = call(ADMIN, operator, 200, {"action": "rotate", "id": aid})["key"]
call(WORKSPACE, ak, 401)
call(WORKSPACE, new_key, 200)
for active in (False, True):
    call(ADMIN, operator, 200, {"action": "configure", "id": aid, "name": "Alpha updated", "active": active})
    call(WORKSPACE, new_key, 200 if active else 401)
    call(TRACE, new_agent, 200 if active else 401, run)
    assert call(WORKSPACE, bk, 200)["name"] == "Beta"
print("PASS two tenants, same project/run IDs, workspace and agent isolation, replay, revisions, rename, suspend/resume, key rotation and legacy separation")
