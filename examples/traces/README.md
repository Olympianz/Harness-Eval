# 示例数据

所有记录均为合成数据，不包含公司资料或真实用户信息。

- `demo-traces.json`：与页面默认数据一致，6 个 case、12 条 Trace。
- `demo-traces.jsonl`：同一数据的逐行 JSON 格式。
- `import-practice.jsonl`：一个 case 的两版本记录，使用不同 Trace ID 和 caseId，可直接导入默认实验台。

默认数据已经加载。重复导入 `demo-traces.*` 会触发重复 ID 校验；练习导入请使用 `import-practice.jsonl`。练习文件只导入一次，再次导入前需要重置示例或更换 ID。

Latency 单位为秒；Token 为每条记录的总量。预期和成功标签为演示用途，不来自实时模型执行。
