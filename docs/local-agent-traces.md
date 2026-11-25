# 本地 Agent Trace 接入

每次 Agent 运行对应一条 Trace。采集器在运行结束时将事件转换成一份带版本的 JSON 文件，再通过项目密钥上报。Worker 使用现有 Hyperdrive 向 PostgreSQL 的目标项目追加记录。上报可以在浏览器关闭时完成。采集器只用 Python 3.9+ 标准库，可直接复制到 Mac 或 CI。

## 先用样例验证

1. 打开新版实验台，进入目标项目，在「Trace 观察 → 本地 Agent 接入」复制项目 ID。默认项目的 ID 是 `default`。
2. 在仓库根目录运行下面的命令。将 `default` 换成你的项目 ID。
3. 点「连接本地目录」，选择输出目录。页面会在约五秒内显示来源 `hermes`、运行 ID `demo-cdd-01`、100 Token 和 1.5 秒。重复运行同一命令，记录数应保持不变。
4. 打开记录，任务结果应为「待标注」。确认预期 Skill / Tool 和任务结果，再勾选「纳入 Dataset」。同一 case 的其他版本也完成标注后，可在「Eval 与回归」配对查看。

```bash
export PROJECT_ID=default
export OUTBOX="$HOME/HarnessEvalInbox/$PROJECT_ID"
python3 tools/collect-trace.py hermes examples/local-agents/hermes.jsonl \
  --project "$PROJECT_ID" --case CDD-01 --version v1 --outbox "$OUTBOX"
```

连接目录需要支持目录选择器的浏览器以及 HTTPS 或 localhost。切换项目或刷新后，请重新选择目录。没有目录选择器时，在「导入 Trace」选择一个生成的 `.trace.json`。浏览器存储模式会保存在当前浏览器，NAS 模式请等顶部显示「已保存到 NAS」。

## 生产用法：运行结束后自动上报

**一次配置。** 部署此版本，在页面创建项目并等它保存。为每个项目生成独立的随机密钥（例如在本地运行 `openssl rand -hex 32`）。在 Worker 的 Secrets 中设置 `TRACE_INGEST_KEYS`，其值为 JSON 对象，键为项目 ID，值为相应的密钥，长度至少 32 个字符。Node 部署将同名变量传入服务进程。工具端只保存自己项目的 `TRACE_INGEST_TOKEN`。工作区管理密钥继续由实验台使用。

若域名启用了 Cloudflare Access，请为上报路径配置只允许指定服务令牌的 Service Auth 策略，并将服务令牌的两项值设为本机的 `CF_ACCESS_CLIENT_ID` 和 `CF_ACCESS_CLIENT_SECRET`。浏览器的登录方式沿用现有策略。密钥通过本地密钥管理器或环境变量注入。[Cloudflare 服务令牌说明](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)

**每次运行。** 将以下两步放在 Agent 的结束钩子或本地脚本中。示例使用已完成的 Hermes 事件文件。客户端将保留输出文件，上报暂时失败时自动重试，稍后也可以用同一文件补传。

```bash
export HARNESS_EVAL_URL='https://你的实验台域名'
TRACE_FILE=$(python3 tools/collect-trace.py hermes examples/local-agents/hermes.jsonl \
  --project "$PROJECT_ID" --case CDD-01 --version v1 --outbox "$OUTBOX") &&
python3 tools/push-trace.py "$TRACE_FILE"
```

首次成功会返回 `created`、Trace ID 和数据库 revision，重传返回 `duplicate`。重新打开或刷新实验台，即可在项目中看到该记录。已有页面若遇到并发修改提示，请先导出本地工作区备份，再刷新获取最新 NAS 版本。

## 支持的来源

| 采集模式 | 输入及边界 | 已采集的主要信息 |
|---|---|---|
| `codex` | 一次 `codex exec --json` 的标准输出，一份文件一轮 | 线程 ID、完成事件、工具及退出状态、输入与输出 Token 合计。缓存 Token 已含在输入中 |
| `hermes` | 支持 `hermes chat -q "任务" --format stream-json` 的 Hermes CLI，一次调用一个 JSONL | 会话 ID、工具调用与结果、结束状态、总 Token、运行毫秒数 |
| `otlp` | 单份完整的 OTLP JSON trace 导出，包含 `resourceSpans[].scopeSpans[].spans[]` 和一个根 span | Trace ID、父子 span、名称、状态、根 span 耗时。`harness.stage` 或 `execute_tool` 用于阶段映射，其余标为「未分类」 |
| `generic` | 自研 Agent、DeepSeek Harness 或其他框架在结束钩子中按 `agent-run/v1` 导出 | 自定义来源与运行 ID、阶段事件、可选 Token、耗时、实际 Skill / Tool |

每种格式在 `examples/local-agents/` 中都有可运行的合成样例。Codex 与 Hermes 的适配范围是上述 CLI 事件流。已有桌面会话、企业微信聊天记录、其他私有日志可通过各自的导出逻辑转成通用格式。OTLP 适配的是导出文件，实时 gRPC、protobuf 和分批 span 需要先由上游汇集成完整运行。[Codex 事件说明](https://developers.openai.com/codex/noninteractive/) · [Hermes CLI 说明](https://hermes-agent.nousresearch.com/docs/reference/cli-commands) · [OTLP 规范](https://opentelemetry.io/docs/specs/otlp/)

自研 Agent 在结束钩子输出以下结构即可。多个阶段或工具调用可以追加到 `steps`。执行失败或用户中断也可以上报，分别使用 `failed` 和 `interrupted`。

```json
{
  "schema": "agent-run/v1",
  "source": "cdd-request",
  "runId": "run-001",
  "state": "completed",
  "tokens": 130,
  "durationMs": 1200,
  "predictedTool": "scope_lookup",
  "steps": [{"stage":"Tool","name":"scope_lookup","status":"ok"}]
}
```

- `--run-id` 可覆盖默认 ID。在同一 Codex 线程、Hermes 会话中重复执行时，每次调用分配独立 ID，重试上报复用同一个 ID。
- `caseId` 表示评测任务，跨版本复用。多 Agent 比较同一 case 时，可将版本命名为 `hermes-v1`、`dsh-v2`。同一版本同一 case 的多次运行都能进入 Trace，仅将选定代表纳入 Dataset。歧义配对会显示提示。
- 默认保留名称、阶段、状态和测量值。工具参数、输出正文、对话正文、推理文本不随原始 CLI 日志上报。检查自定义名称中是否含客户信息。希望评审交付物时，用 `--context review.json` 附上已脱敏的 `inputSummary` 和 `outputSummary`。
- 进程完成不产生任务成功标签。没有上报的成本和路由字段保持未知，指标按相应字段有观测的样本计算。确认没有使用工具或 Skill 时，在标注界面点「确认无」。
- 升级前的实验台可以使用 `--legacy-review examples/local-agents/review.json` 替换 `--context`，生成旧版可手动导入的 `.eval.json`。需要提供实际测得的 Token、耗时以及完整的人工标签。请按真实运行填写，示例标签仅适用于合成测试。

## 接口与存储

`POST /api/traces?project=<项目ID>` 接受 `Authorization: Bearer <项目接入密钥>` 和单条 `harness.local-run/v1` JSON。采集器输出文件即为请求体，可以在任意语言中直接 POST。必填字段为 `schema, projectId, source, runId, caseId, version, title, state, steps`。每个步骤需含 `stage, name, status`。空步骤数组有效。可选字段包括 `tokens, durationMs, predictedSkill, predictedTool, inputSummary, outputSummary`。退出状态与任务成功标签独立；上报方无法将运行直接加入评测集。

| HTTP | 含义与处理 |
|---|---|
| 201 / 200 | 新增成功 / 已存在且内容一致，回执在数据库提交后返回 |
| 400 / 404 | 校验失败或项目未保存，根据错误修正 |
| 401 / 403 或跳转至登录页 | 核对项目密钥、Access 服务令牌及策略 |
| 409 | 同一项目、来源和运行 ID 已存在且采集内容不同。核对源记录，已有人工标注保留 |
| 413 | 单次文件超过 5 MiB 或工作区达到原有约 10 MiB 容量上限。备份并整理工作区后重试 |
| 503 | 数据库暂不可写或服务端配置错误，保留文件后重试 |

服务端用项目、来源、运行 ID 生成稳定标识，并校验原始采集字段的摘要。PostgreSQL 行锁使并发上报顺序追加；新增记录递增工作区 revision，已有版本保护继续拦截过期的整库覆盖。相同文件重传保留人工标注且不会增加 revision。首版复用现有工作区表，适用于当前实验台的容量。持续高频采集、长期保存大规模完整 span 时，可将运行和事件拆成独立表并分页加载。

## 本地回归

```bash
python3 -B -m unittest discover -s tests -v
node --test tests/eval.test.mjs
pnpm typecheck
pnpm lint
pnpm deploy:dry-run
```

可选的 HTTP 集成检查位于 `tests/check-ingestion.py`。在 `127.0.0.1:25438` 启动使用空测试数据库的 NAS 模式实例，配置测试专用工作区密钥与 default 项目的接入密钥，再运行 `python3 tests/check-ingestion.py`。它会写入合成样本，验证四类上报、并发重传、权限隔离、工作区旧版本写入和人工标注保留。仅在空的临时工作区执行。
