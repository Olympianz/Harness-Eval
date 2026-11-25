#!/usr/bin/env python3
"""Convert a finished local run to a project-scoped Harness Eval inbox file."""
import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

MAX_INPUT = 64 * 1024 * 1024
MAX_OUTPUT = 5 * 1024 * 1024
STAGES = {"意图", "规划", "Skill", "Tool", "聚合", "验证"}


def text(value, label, maximum=240):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f"{label} must be a nonempty string (max {maximum})")
    return value


def count(value, label):
    if type(value) is not int or not 0 <= value <= 2**53 - 1:
        raise ValueError(f"invalid {label}")
    return value


def generic(data):
    if not isinstance(data, dict) or data.get("schema") != "agent-run/v1":
        raise ValueError("expected one agent-run/v1 object")
    run = {k: text(data.get(k), k) for k in ("source", "runId", "state")}
    if run["state"] not in ("completed", "failed", "interrupted"):
        raise ValueError("expected a terminal state")
    events = data.get("steps", [])
    if not isinstance(events, list):
        raise ValueError("steps must be an array")
    run["steps"] = []
    for event in events:
        if not isinstance(event, dict) or event.get("stage") not in STAGES or event.get("status") not in ("ok", "error", "warning"):
            raise ValueError("invalid step stage/status")
        run["steps"].append({k: text(event.get(k), k, 500) for k in ("stage", "status", "name")})
    if data.get("tokens") is not None:
        run["tokens"] = count(data["tokens"], "tokens")
    if data.get("durationMs") is not None:
        run["durationMs"] = count(data["durationMs"], "durationMs")
    for key in ("predictedTool", "predictedSkill"):
        if data.get(key) is not None:
            if not isinstance(data[key], str) or len(data[key]) > 240:
                raise ValueError("invalid " + key)
            run[key] = data[key]
    return run


def codex(lines, run_id):
    # One invocation/turn per file. A resumed thread needs its own invocation ID.
    thread = None
    terminal = None
    started = False
    steps = []
    tokens = None
    tool_names = set()
    mapping = {"command_execution": "Tool", "mcp_tool_call": "Tool",
               "web_search": "Tool", "file_change": "Tool", "todo_list": "规划",
               "agent_message": "聚合", "reasoning": "规划"}
    for line_number, line in enumerate(lines.splitlines(), 1):
        if not line.strip():
            continue
        event = json.loads(line)
        if not isinstance(event, dict):
            raise ValueError(f"line {line_number}: expected event object")
        kind = event.get("type")
        if terminal is not None:
            raise ValueError("expected one turn per input; found events after terminal event")
        if kind == "thread.started":
            if thread is not None:
                raise ValueError("multiple threads in one input")
            thread = text(event.get("thread_id"), "thread_id")
        elif kind == "turn.started":
            if started:
                raise ValueError("multiple turns in one input")
            started = True
        elif kind in ("turn.completed", "turn.failed"):
            if not started:
                raise ValueError("missing turn.started")
            terminal = "completed" if kind == "turn.completed" else "failed"
            usage = event.get("usage")
            if isinstance(usage, dict) and all(usage.get(k) is not None for k in ("input_tokens", "output_tokens")):
                tokens = count(usage["input_tokens"], "input_tokens") + count(usage["output_tokens"], "output_tokens")
        elif kind == "item.completed":
            item = event.get("item")
            if not isinstance(item, dict):
                raise ValueError(f"line {line_number}: missing item")
            item_type = item.get("type")
            stage = mapping.get(item_type)
            if stage:
                name = item_type
                if item_type == "mcp_tool_call":
                    name = text(item.get("tool"), "MCP tool")
                    if item.get("server"):
                        name = text(item["server"], "MCP server") + "/" + name
                if stage == "Tool":
                    tool_names.add(name)
                failed = item.get("status") == "failed" or item.get("exit_code") not in (0, None) or bool(item.get("error"))
                steps.append({"stage": stage, "name": name, "status": "error" if failed else "ok"})
    if not thread or not started:
        raise ValueError("missing Codex thread.started or turn.started")
    # Never use process completion as a label for task quality.
    return {"source": "codex", "runId": run_id or thread, "state": terminal or "interrupted",
            "steps": steps, "tokens": tokens,
            "predictedTool": next(iter(tool_names)) if len(tool_names) == 1 else None}


def hermes(lines, run_id):
    session = None
    result = None
    steps = []
    tool_names = set()
    for line in lines.splitlines():
        if not line.strip():
            continue
        event = json.loads(line)
        if not isinstance(event, dict) or result is not None:
            raise ValueError("expected one Hermes stream per invocation")
        kind = event.get("type")
        if kind == "system" and event.get("subtype") == "init":
            if session is not None:
                raise ValueError("multiple Hermes sessions")
            session = text(event.get("session_id"), "session_id")
        elif kind in ("tool_use", "tool_result"):
            name = text(event.get("name"), "tool name")
            tool_names.add(name)
            if kind == "tool_result":
                if type(event.get("is_error")) is not bool:
                    raise ValueError("missing tool_result.is_error")
                steps.append({"stage":"Tool", "name":name, "status":"error" if event["is_error"] else "ok"})
            else:
                steps.append({"stage":"Tool", "name":"调用 " + name, "status":"ok"})
        elif kind == "result":
            if not session or event.get("session_id") != session or type(event.get("exit_code")) is not int:
                raise ValueError("invalid Hermes result/session")
            result = event
    if not session:
        raise ValueError("missing Hermes system.init")
    state = "interrupted" if result is None else "completed" if result["exit_code"] == 0 else "failed"
    final = result or {}
    if final.get("replay_gap"):
        steps.append({"stage":"未分类", "name":"事件流曾中断，轨迹可能不完整", "status":"warning"})
    return {"source":"hermes", "runId":run_id or session, "state":state, "steps":steps,
            "predictedTool":next(iter(tool_names)) if len(tool_names) == 1 and not final.get("replay_gap") else None,
            "tokens":(final.get("tokens") or {}).get("total"), "durationMs":final.get("duration_ms")}


def otlp(data):
    # One complete trace per exported JSON file; reject fragments and duplicate IDs.
    spans = []
    for resource in data["resourceSpans"]:
        for scope in resource["scopeSpans"]:
            spans.extend(scope["spans"])
    if not spans:
        raise ValueError("empty OTLP export")
    def hex_id(value, width):
        if not isinstance(value, str) or not re.fullmatch(f"[a-fA-F0-9]{{{width}}}", value) or not int(value, 16):
            raise ValueError("invalid OTLP ID")
        return value.lower()
    ids = {}
    roots = []
    trace_ids = set()
    children = {}
    for span in spans:
        trace_ids.add(hex_id(span["traceId"], 32))
        sid = hex_id(span["spanId"], 16)
        if sid in ids:
            raise ValueError("duplicate span")
        ids[sid] = span
        parent = span.get("parentSpanId")
        if parent in ("", None, "0000000000000000"):
            roots.append(span)
        else:
            children.setdefault(hex_id(parent, 16), []).append(sid)
    if len(trace_ids) != 1 or len(roots) != 1:
        raise ValueError("export must contain one complete rooted trace")
    root = roots[0]
    pending = [root["spanId"].lower()]
    visited = set()
    while pending:
        sid = pending.pop()
        visited.add(sid)
        pending.extend(children.get(sid, []))
    if len(visited) != len(ids):
        raise ValueError("disconnected spans or missing parent")

    def nanos(span, key):
        value = span[key]
        if isinstance(value, str) and re.fullmatch(r"[0-9]+", value):
            value = int(value)
        if type(value) is not int or value <= 0:
            raise ValueError("invalid " + key)
        return value

    def failed(span):
        return span.get("status", {}).get("code", 0) == 2

    ordered = sorted(spans, key=lambda s: (nanos(s, "startTimeUnixNano"), s["spanId"]))
    steps = []
    for span in ordered:
        if nanos(span, "endTimeUnixNano") < nanos(span, "startTimeUnixNano"):
            raise ValueError("span ends before start")
        attrs = {a["key"]: a["value"].get("stringValue") for a in span.get("attributes", [])}
        stage = attrs.get("harness.stage")
        operation = attrs.get("gen_ai.operation.name")
        if stage is None and operation == "execute_tool":
            stage = "Tool"
        if stage is not None and stage not in STAGES:
            raise ValueError("invalid harness.stage")
        # Unclassified spans stay visible without assigning a fictitious Eval stage.
        steps.append({"stage": stage or "未分类", "name": text(span["name"], "span name", 500),
                      "status": "error" if failed(span) else "ok", "spanId": span["spanId"].lower(),
                      "parentSpanId": (span.get("parentSpanId") or "").lower()})
    duration = nanos(root, "endTimeUnixNano") - nanos(root, "startTimeUnixNano")
    return {"source": "otlp", "runId": next(iter(trace_ids)), "state": "failed" if failed(root) else "completed",
            "durationMs": duration // 1_000_000, "steps": steps}


def publish(run, args):
    if args.source:
        run["source"] = text(args.source, "source")
    if args.run_id:
        run["runId"] = text(args.run_id, "run-id")
    if len(run["steps"]) > 5000:
        raise ValueError("run exceeds 5000 steps")
    record = dict(run, schema="harness.local-run/v1", projectId=text(args.project, "project"),
                  caseId=text(args.case, "case"), version=text(args.version, "version"),
                  title=text(args.title or args.case, "title"))
    if record.get("tokens") is not None:
        count(record["tokens"], "tokens")
    if record.get("durationMs") is not None:
        count(record["durationMs"], "durationMs")
    for step in record["steps"]:
        text(step["name"], "step name", 500)
    identity = [record[k] for k in ("projectId", "source", "runId")]
    key = hashlib.sha256(json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    suffix = ".trace.json"
    if args.context or args.legacy_review:
        with open(args.context or args.legacy_review, encoding="utf-8-sig") as review_file:
            review = json.load(review_file)
        if not isinstance(review, dict):
            raise ValueError("review file must be a JSON object")
        for field in ("inputSummary", "outputSummary"):
            if field in review:
                record[field] = text(review[field], field, 16000)
        if args.legacy_review:
            # The older application requires complete labels and observed costs.
            if type(review.get("success")) is not bool:
                raise ValueError("legacy import requires a reviewed boolean success")
            labels = {}
            for field in ("expectedTool", "expectedSkill", "predictedTool", "predictedSkill"):
                value = review.get(field, record.get(field))
                if not isinstance(value, str):
                    raise ValueError(f"legacy import requires reviewed {field}; empty string means none")
                labels[field] = value
            duration = count(review.get("durationMs", record.get("durationMs")), "observed durationMs")
            tokens = count(review.get("tokens", record.get("tokens")), "observed tokens")
            steps = [{"stage":s["stage"], "observation":s["name"], "status":s["status"]}
                     for s in record["steps"] if s["stage"] in STAGES]
            note = [f'{record["source"]} / {record["runId"]} / {record["state"]}']
            note += [s["name"] for s in record["steps"] if s["stage"] not in STAGES]
            if "outputSummary" in record:
                note.append(record["outputSummary"])
            record = {k:record[k] for k in ("caseId","version","title")} | labels | {
                "id":"AG-"+key, "input":record.get("inputSummary",""), "inDataset":False,
                "steps":steps, "success":review["success"], "tokens":tokens, "latency":duration/1000,
                "failureStage":"", "failureType":"", "note":"\n".join(note)}
            suffix = ".eval.json"
    body = (json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
    if len(body) > MAX_OUTPUT:
        raise ValueError("output exceeds 5 MiB")
    dest = Path(args.outbox).expanduser()
    dest.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = dest / (key + suffix)
    # link publishes a fully written inode and refuses to replace an existing run.
    with tempfile.NamedTemporaryFile(dir=dest) as tmp:
        tmp.write(body)
        tmp.flush()
        os.fsync(tmp.fileno())
        try:
            os.link(tmp.name, target)
        except FileExistsError:
            if target.read_bytes() != body:
                raise ValueError("same project/source/runId has different content; check the run ID")
    return target


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("format", choices=["generic", "codex", "hermes", "otlp"])
    p.add_argument("file", help="finished file or - for stdin")
    for field in ("project", "case", "version", "outbox"):
        p.add_argument("--" + field, required=True)
    for field in ("source", "run-id", "title"):
        p.add_argument("--" + field)
    group = p.add_mutually_exclusive_group()
    group.add_argument("--context", help="optional reviewed inputSummary/outputSummary JSON")
    group.add_argument("--legacy-review", help="write fully labeled JSON for the pre-inbox Eval importer")
    args = p.parse_args()
    try:
        if args.file == "-":
            raw = sys.stdin.buffer.read(MAX_INPUT + 1)
        else:
            with open(args.file, "rb") as stream:
                raw = stream.read(MAX_INPUT + 1)
        if len(raw) > MAX_INPUT:
            raise ValueError("input exceeds 64 MiB")
        payload = raw.decode("utf-8-sig")
        if args.format == "codex":
            run = codex(payload, args.run_id)
        elif args.format == "hermes":
            run = hermes(payload, args.run_id)
        elif args.format == "otlp":
            run = otlp(json.loads(payload))
        else:
            run = generic(json.loads(payload))
        print(publish(run, args))
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as err:
        p.exit(2, f"Trace collection failed: {err}\n")


if __name__ == "__main__":
    main()
