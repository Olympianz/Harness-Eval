"""Run from the repository root with python3 -m unittest discover -s tests."""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "examples/local-agents"


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def collect(self, adapter, file, *args, check=True):
        return subprocess.run([sys.executable, str(ROOT / "tools/collect-trace.py"), adapter,
                               str(file), "--project", "default", "--case", "scope-01",
                               "--version", "v1", "--outbox", self.tmp.name, *args],
                              text=True, capture_output=True, check=check)

    def read(self, adapter, file, *args):
        return json.loads(Path(self.collect(adapter, file, *args).stdout.strip()).read_text())

    def test_sources_and_minimization(self):
        for adapter, expected in (("hermes",100), ("codex",120), ("generic",130), ("otlp",None)):
            with self.subTest(adapter=adapter):
                ext = "jsonl" if adapter in ("hermes","codex") else "json"
                data = self.read(adapter,SAMPLES/f"{adapter}.{ext}")
                self.assertEqual(data.get("tokens"),expected)
                self.assertNotIn("synthetic",json.dumps(data))
                self.assertNotIn("success",data)
                if adapter=="otlp":
                    self.assertEqual(data["durationMs"],2000)
                    self.assertEqual(data["steps"][1]["parentSpanId"],data["steps"][0]["spanId"])

    def test_concurrent_replay_and_conflict(self):
        def submit(_):
            return self.collect("generic",SAMPLES/"generic.json").stdout
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            self.assertEqual(len(set(pool.map(submit,range(12)))),1)
        self.assertEqual(len(list(Path(self.tmp.name).glob("*.trace.json"))),1)
        bad=self.collect("generic",SAMPLES/"generic.json","--title","changed",check=False)
        self.assertNotEqual(bad.returncode,0)

    def test_incomplete_and_multiple_turns(self):
        raw=(SAMPLES/"codex.jsonl").read_text().splitlines()
        path=Path(self.tmp.name)/"input"
        path.write_text("\n".join(raw[:-1]))
        self.assertEqual(self.read("codex",path)["state"],"interrupted")
        path.write_text("\n".join(raw*2))
        self.assertNotEqual(self.collect("codex",path,check=False).returncode,0)

    def test_legacy_review(self):
        data=self.read("hermes",SAMPLES/"hermes.jsonl","--legacy-review",SAMPLES/"review.json")
        self.assertIs(data["success"],True)
        self.assertEqual(data["latency"],1.5)
        self.assertFalse(data["inDataset"])

    def test_otlp_orphan_rejected(self):
        data=json.loads((SAMPLES/"otlp.json").read_text())
        data["resourceSpans"][0]["scopeSpans"][0]["spans"][1]["parentSpanId"]="aaaaaaaaaaaaaaaa"
        path=Path(self.tmp.name)/"orphan.json"
        path.write_text(json.dumps(data))
        self.assertNotEqual(self.collect("otlp",path,check=False).returncode,0)
