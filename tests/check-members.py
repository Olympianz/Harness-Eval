"""Run against a disposable NAS-mode deployment on localhost:25438."""
import json
import os
from urllib import request, error
from uuid import uuid4

origin = "http://127.0.0.1:25438"
admin = "/api/admin/tenants"
workspace = "/api/tenant/workspace"
members = workspace + "/members"
login = workspace + "/login"
operator = {"Authorization": "Bearer " + os.environ["TENANT_ADMIN_TOKEN"]}
page = {"X-Harness-Workspace": "1"}
secret = "Synthetic-" + uuid4().hex


def call(path, headers, expected, body=None, method=None):
    req = request.Request(origin + path, method=method or ("POST" if body is not None else "GET"),
                          headers={**headers, "Content-Type": "application/json"},
                          data=None if body is None else json.dumps(body).encode())
    try:
        response = request.urlopen(req, timeout=30)
    except error.HTTPError as exc:
        response = exc
    with response:
        payload = json.load(response)
        assert response.status == expected, (path, response.status, expected, payload.get("error"))
        return payload, response.headers.get("Set-Cookie", "").split(";")[0]


def signin(tenant, name, pw=secret, status=200):
    _, cookie = call(login, page, status, {"tenant": tenant, "username": name, "password": pw, "remember": True})
    return {**page, "X-Tenant-Id": tenant, "Cookie": cookie}


def account(op, who, status):
    return call(members, who, status, op)[0]


def create_tenant():
    t, _ = call(admin, operator, 201, {"action": "create", "name": "Synthetic " + uuid4().hex})
    tenant = t["tenant"]["id"]
    op = {"action":"bootstrap", "id":tenant, "username":"owner", "password":secret}
    call(admin, operator, 201, op)
    call(admin, operator, 409, op)
    return tenant, signin(tenant, "owner"), t["key"]


a, owner, key = create_tenant()
b, other, _ = create_tenant()
for who in (owner, other):
    account({"action":"create", "username":"reader", "role":"viewer", "password":secret}, who, 201)
reader = signin(a, "READER")
signin(a, "reader", "Incorrect-" + secret, 401)
data, _ = call(workspace, reader, 200)
assert data["role"] == "viewer" and data["id"] == a
body = {"revision": data["revision"], "data": data["data"]}
call(workspace, reader, 403, body, "PUT")
call(members, reader, 403)
call(members, {**page, "Authorization":"Bearer " + key, "X-Tenant-Id":a}, 403)
items = account(None, owner, 200)["members"]
ids = {m["username"]:m["id"] for m in items}
account({"action":"configure","id":ids["owner"],"role":"viewer","active":True}, owner, 409)
account({"action":"password","id":ids["reader"],"password":secret}, other, 404)
account({"action":"configure","id":ids["reader"],"role":"editor","active":True}, owner, 200)
call(workspace, reader, 401)
editor = signin(a,"reader")
call(workspace, {**editor,"X-Tenant-Id":b}, 409, body, "PUT")
call(workspace, editor, 200, body, "PUT")
call(members, editor, 403)
account({"action":"password","id":ids["reader"],"password":secret+"2"}, owner, 200)
call(workspace, editor, 401)
signin(a, "reader", secret, 401)
updated = signin(a, "reader", secret+"2")
call(workspace, updated, 200, method="DELETE")
call(workspace, updated, 401)
account({"action":"configure","id":ids["reader"],"role":"editor","active":False}, owner, 200)
signin(a, "reader", secret+"2", 401)
assert call(workspace, signin(b, "reader"), 200)[0]["role"] == "viewer"
print("PASS tenant-scoped usernames, bootstrap, role rights, last admin, session revocation, credential reset, logout and tenant isolation.")
