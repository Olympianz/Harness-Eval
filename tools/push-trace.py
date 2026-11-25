#!/usr/bin/env python3
"""Send a finalized .trace.json to a project-scoped Harness Eval HTTPS endpoint."""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib import error, parse, request


class NoRedirect(request.HTTPRedirectHandler):
    # An Access login redirect must never forward an Agent's service credentials.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def push(path, base):
    url = parse.urlsplit(base)
    if (url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("127.0.0.1","localhost","::1"))) or not url.hostname:
        raise ValueError("expected HTTPS origin (or HTTP loopback for local tests)")
    if url.username or url.password or url.path not in ("","/") or url.query or url.fragment:
        raise ValueError("supply the Eval origin only")
    with path.open("rb") as stream:
        body = stream.read(5*1024*1024+1)
    if len(body)>5*1024*1024:
        raise ValueError("file exceeds 5 MiB")
    record = json.loads(body)
    if not isinstance(record,dict) or record.get("schema")!="harness.local-run/v1":
        raise ValueError("expected a finalized .trace.json")
    key = os.environ.get("TRACE_INGEST_TOKEN")
    if not key:
        raise ValueError("set TRACE_INGEST_TOKEN")
    headers = {"Content-Type":"application/json","Authorization":"Bearer "+key}
    client, secret = os.environ.get("CF_ACCESS_CLIENT_ID"), os.environ.get("CF_ACCESS_CLIENT_SECRET")
    if bool(client) != bool(secret):
        raise ValueError("set both Cloudflare Access service token variables")
    if client:
        headers.update({"CF-Access-Client-Id":client,"CF-Access-Client-Secret":secret})
    query = parse.urlencode({"project":record["projectId"]})
    req = request.Request(base.rstrip("/")+"/api/traces?"+query,body,headers,method="POST")
    opener = request.build_opener(NoRedirect)
    for attempt in range(4):
        try:
            with opener.open(req,timeout=20) as res:
                receipt = json.load(res)
                if res.status not in (200,201) or receipt.get("status") not in ("created","duplicate"):
                    raise ValueError("invalid server acknowledgement")
                print(json.dumps(receipt,ensure_ascii=False))
                return
        except error.HTTPError as exc:
            if exc.code not in (429,500,502,503,504) or attempt==3:
                detail = "检查 Access 服务令牌及项目密钥" if exc.code in (301,302,303,307,308,401,403) else ""
                if exc.headers.get_content_type()=="application/json":
                    try:
                        detail = json.loads(exc.read(8192)).get("error",detail)
                    except (ValueError,AttributeError):
                        pass
                raise ValueError(f"HTTP {exc.code} {detail}") from None
        except (error.URLError, TimeoutError, ConnectionError):
            if attempt==3:
                raise ValueError("connection failed after four attempts") from None
        time.sleep(2**attempt)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("file",type=Path)
    p.add_argument("--url",default=os.environ.get("HARNESS_EVAL_URL"))
    args = p.parse_args()
    if not args.url:
        p.error("set HARNESS_EVAL_URL or pass --url")
    try:
        push(args.file,args.url)
    except (ValueError,OSError,KeyError,TypeError,AttributeError) as exc:
        sys.exit(f"上报失败，本地文件保留。{exc}")
