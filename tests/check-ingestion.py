"""Integration check against a disposable NAS-mode instance on localhost:25438.

Initialize an empty harness_workspace table using the project's schema. Set
WORKSPACE_TOKEN and TRACE_INGEST_TOKEN to its test credentials, with ingestion
restricted to the default project. The fixture intentionally remains for UI checks.
"""
import concurrent.futures
import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib import request,error
base="http://127.0.0.1:25438"
project="default"
def api(method,path,token,data=None):
    req=request.Request(base+path,method=method,headers={"Content-Type":"application/json","Authorization":"Bearer "+token},
                        data=None if data is None else json.dumps(data).encode())
    try:
        with request.urlopen(req,timeout=12) as res: return res.status,json.load(res)
    except error.HTTPError as e: return e.code,json.loads(e.read())
ui=os.environ['WORKSPACE_TOKEN']
agent=os.environ['TRACE_INGEST_TOKEN']
route="/api/traces?project=default"
projects=[{"id":p,"name":p,"rows":[]} for p in ["default","two"]]
ws={"projects":projects,"active":"default"}
if api("GET","/api/workspace",ui) != (200,{"data":None,"revision":0}):
    raise SystemExit("Integration check requires an empty disposable workspace on localhost:25438")
assert api("PUT","/api/workspace",ui,{"data":ws,"revision":0})[0]==200
with tempfile.TemporaryDirectory() as tmp:
    records=[]
    for fmt,ext,version in (("hermes","jsonl","v1"),("generic","json","v2"),("codex","jsonl","v1"),("otlp","json","v2")):
        path=subprocess.check_output(["python3","tools/collect-trace.py",fmt,f"examples/local-agents/{fmt}.{ext}","--project",project,"--case","cdd","--version",version,"--outbox",tmp],text=True).strip()
        result=json.loads(subprocess.check_output(["python3","tools/push-trace.py",path,"--url",base]))
        assert result["status"]=="created"
        records.append(json.loads(Path(path).read_text()))
    first=records[0]
    assert api("POST",route,agent,first)[1]["status"]=="duplicate"
    assert api("POST",route,agent,dict(first,title="collision"))[0]==409
    assert api("POST",route,"invalid",first)[0]==401
    assert api("POST","/api/traces?project=two",agent,dict(first,projectId="two"))[0]==401
    assert api("POST",route,agent,dict(first,projectId="two"))[0]==400
    assert api("GET","/api/workspace",agent)[0]==401
    assert api("POST",route,agent,dict(first,steps="bad"))[0]==400
    original=api("GET","/api/workspace",ui)[1]
    def send(i):
        return api("POST",route,agent,dict(first,runId="parallel-"+str(i%4)))[0]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        statuses=list(pool.map(send,range(12)))
    assert statuses.count(201)==4 and statuses.count(200)==8,statuses
    assert api("PUT","/api/workspace",ui,original)[0]==409
    saved=api("GET","/api/workspace",ui)[1]
    rows=saved["data"]["projects"][0]["rows"]
    assert len(rows)==8 and saved["revision"]==9 and not saved["data"]["projects"][1]["rows"]
    row=next(r for r in rows if r["origin"]["source"]=="hermes" and r["origin"]["runId"]==first["runId"])
    assert row["success"] is None and not row["inDataset"]
    row.update(note="human label",inDataset=True,success=True)
    assert api("PUT","/api/workspace",ui,saved)[0]==200
    assert api("POST",route,agent,first)[1]["status"]=="duplicate"
    final=api("GET","/api/workspace",ui)[1]
    assert final["revision"]==10 and any(r["note"]=="human label" for r in final["data"]["projects"][0]["rows"])
print("PASS 4 CLI adapters, real API/PG receipts, replay, conflict, isolation, concurrency, stale UI writes, annotation preservation.")
