# Harness Eval Lab

中文交互实验台，用于研究 **Trace → Dataset → Eval**：导入脱敏运行轨迹、按六阶段标注失败、选择评测样本，并比较基线与候选版本。

## 企业 SaaS

首页介绍服务，企业从 `/workspace` 登录，管理员通过 `/admin` 开通和配置租户。交互演示位于 `/demo`，已有私有工作区位于 `/legacy`。开通、迁移和生产验收见[企业租户上线与使用](docs/enterprise-saas.md)。

## 功能

- 粘贴或上传 JSON / JSONL Trace，支持搜索与筛选。
- 按意图、规划、Skill、Tool、聚合、验证阶段记录失败与备注。
- 管理 Dataset 并导出 JSONL。
- 按 caseId 配对版本，展示 Trigger Precision / Recall、Tool Accuracy、成功率、平均 Token 和 Latency。
- 内置 6 个虚构任务、12 条 Trace，可直接体验成功、修复和持续失败案例。

## 下载后推送到 GitHub

请先阅读 [GitHub 推送指南](docs/GitHub推送指南.md)，包含空仓库、已有提交两种操作步骤。

## 本地运行

推荐 Node.js 24 LTS 和 pnpm 11.25.0。安装对应版本的 pnpm 后执行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://localhost:5173`。本地开发不需要模型密钥或数据库。

```bash
pnpm typecheck
pnpm build
pnpm start
```

`start` 使用 Vite 在本地 Workers 运行时预览构建产物；端口以命令输出为准。项目使用 React、TypeScript、Vinext / Vite 和 Tailwind，依赖锁文件随仓库提供。

## 十分钟体验

1. 打开 `/demo`，在「Trace 观察」选择 TR-102，查看 Skill 漏触发。
2. 修改失败标注，保留「纳入 Dataset」，保存。
3. 在「Dataset 构建」查看样本并导出数据集。
4. 在「Eval 与回归」选择 v1 基线与 v2 候选，查看配对指标。
5. 移除某条 Trace 的 Dataset 标记，观察配对数与指标变化。
6. 使用 `examples/traces/import-practice.jsonl` 练习导入；用「重置示例」恢复初始数据。

完整说明见 [操作手册与底层原理](docs/操作手册与底层原理.md)。

## 指标口径与实现边界

Trigger 指标按预期和实际 Skill 名称计算；选错 Skill 同时产生一个 FP 和一个 FN。Tool Accuracy 只比较工具名称，不验证参数或执行结果。成功率来自人工维护的 `success` 字段。Token 与 Latency 来自输入记录，不代表本应用实时测量的成本。

回归仅使用两版本都存在、且纳入 Dataset 的 case。每个 case / version 应只有一条 Trace；重复运行需要先在外部选定代表记录。内置成功率为 2/6 → 5/6，Skill Precision / Recall 为 80% → 100%，工具名称准确率为 4/6 → 6/6。

这是离线交互原型，不运行 Agent、调用模型、自动评分或自动脱敏。默认模式的数据保存在当前浏览器 localStorage，换设备或清除浏览器数据不会自动恢复，当前 JSONL 仅导出当前项目 Dataset，不是全部项目和 Trace 的完整备份。

## 将应用数据库部署到 NAS

在 Mac 本机终端运行 `NAS_SSH_TARGET=user@nas-host bash deploy/nas/from-mac.command`，将示例 SSH 目标换成自己的 NAS 账号和地址。该入口通过 SSH 连接 NAS，在已有容器 `harness-eval-postgres` 中初始化数据库 `harness_eval`、账号 `harness_app` 和表 `public.harness_workspace`。它仅传送数据库初始化脚本。应用继续在现有环境构建和运行。

首次设置应用账号密码时请保存在密码管理器中。验证阶段使用该账号连接数据库，在事务内写入并读回标记，再回滚。看到 `PASS` 表示本次数据库读写验证通过。输出还包括容器端口的实际映射。后续应在现有应用后端配置连接并测试从页面保存和重新打开后的读回。

云端应用使用 Hyperdrive 和 Workers VPC 接入这台 NAS。连接步骤和读写验收见 [Cloudflare 与 NAS 私网连接](docs/cloudflare-nas.md)。

## 独立私有部署

本项目已移除 ChatGPT Sites 托管与登录依赖。使用自己的 GitHub 和 Cloudflare Workers 账号，通过 Cloudflare Access 管理访问权限。

完整步骤见 [独立部署与管理](docs/independent-deployment.md)。初始配置关闭公网和预览入口；先部署 Worker，再配置 Access，最后启用访问地址。仓库包含 GitHub Actions 检查流程，自动发布需配置生产密钥并显式启用。

```bash
pnpm cf:login
pnpm cf:whoami
pnpm deploy:dry-run
pnpm deploy
```

首次 deploy 不会自动创建 Access 策略或公开网站。`private: true` 仅防止 npm 误发布，不控制网站权限。

## 目录

| 路径 | 内容 |
| --- | --- |
| `app/page.tsx`、`app/workbench.tsx` | 落地页和工作区交互 |
| `app/data.ts` | Trace 类型、示例数据、导入校验、指标计算 |
| `app/globals.css` | 样式 |
| `components/ui/` | UI 组件 |
| `docs/` | 完整操作手册及底层原理 |
| `examples/traces/` | 合成 Trace 和导入练习 |
| `wrangler.jsonc`、`.github/workflows/` | 独立托管和自动发布配置 |
| `db/`、`examples/d1/` | 模板可选数据库示例；当前实验台未使用 |

第三方组件和构建支持文件的许可声明保留在对应文件中。

## 需求管理

[Linear · Harness Eval](https://linear.app/1w1p/project/harness-eval-7fa2667662e8) 管理需求、验收和后续规划；GitHub 管理代码。提交或 PR 应引用对应的 Linear 编号。

- 1W1-157：独立部署配置与 Sites 解耦
- 1W1-158：多项目数据隔离
- 1W1-159：导入弹窗修复
- 1W1-160：Cloudflare 上线、Access 与 CI 验证
- 1W1-161：D1 持久化规划（未实现）
- 1W1-162：完整备份恢复（未实现）

## 接入本地 Agent 的运行记录

Codex、Hermes、OTLP/JSON 文件和自研 Agent 可以按项目接入。采集器生成可重试的本地文件，通过项目密钥上报 NAS，也可以在页面中导入。运行先进入 Trace 观察，人工确认后纳入 Dataset。详见[多 Agent Trace 接入与验证](docs/local-agent-traces.md)。
