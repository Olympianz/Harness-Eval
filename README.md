# Harness Eval Lab

中文交互实验台，用于研究 **Trace → Dataset → Eval**：导入脱敏运行轨迹、按六阶段标注失败、选择评测样本，并比较基线与候选版本。

## 功能

- 粘贴或上传 JSON / JSONL Trace，支持搜索与筛选。
- 按意图、规划、Skill、Tool、聚合、验证阶段记录失败与备注。
- 管理 Dataset 并导出 JSONL。
- 按 caseId 配对版本，展示 Trigger Precision / Recall、Tool Accuracy、成功率、平均 Token 和 Latency。
- 内置 6 个虚构任务、12 条 Trace，可直接体验成功、修复和持续失败案例。

## 下载后推送到 GitHub

请先阅读 [GitHub 推送指南](docs/GitHub推送指南.md)，包含空仓库、已有提交两种操作步骤。

## 本地运行

需要 Node.js 22.13+ 和 pnpm 11.25.0。安装对应版本的 pnpm 后执行：

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

`start` 使用 Wrangler 在本地运行构建后的 Worker；端口以命令输出为准。项目使用 React、TypeScript、Vinext / Vite 和 Tailwind，依赖锁文件随仓库提供。

## 十分钟体验

1. 在「Trace 观察」选择 TR-102，查看 Skill 漏触发。
2. 修改失败标注，保留「纳入 Dataset」，保存。
3. 在「Dataset 构建」查看样本并导出数据集。
4. 在「Eval 与回归」选择 v1 基线与 v2 候选，查看配对指标。
5. 移除某条 Trace 的 Dataset 标记，观察配对数与指标变化。
6. 使用 `examples/traces/import-practice.jsonl` 练习导入；用「重置示例」恢复初始数据。

完整说明见 [操作手册与底层原理](docs/操作手册与底层原理.md)。

## 指标口径与实现边界

Trigger 指标按预期和实际 Skill 名称计算；选错 Skill 同时产生一个 FP 和一个 FN。Tool Accuracy 只比较工具名称，不验证参数或执行结果。成功率来自人工维护的 `success` 字段。Token 与 Latency 来自输入记录，不代表本应用实时测量的成本。

回归仅使用两版本都存在、且纳入 Dataset 的 case。每个 case / version 应只有一条 Trace；重复运行需要先在外部选定代表记录。内置成功率为 2/6 → 5/6，Skill Precision / Recall 为 80% → 100%，工具名称准确率为 4/6 → 6/6。

这是离线交互原型，不运行 Agent、调用模型、自动评分或自动脱敏。数据保存在当前浏览器 localStorage，换设备或清除浏览器数据不会自动恢复，请通过 JSONL 导出备份。

## 私有部署

源代码不包含线上部署地址、部署身份或访问凭据。`.openai/hosting.json` 仅保留无资源绑定的配置。原始站点的私有访问由托管平台管理，克隆仓库不会继承该策略。

部署时请在目标平台配置身份认证和访问授权，并验证未授权用户无法访问。仓库没有自动部署工作流，也没有启用 GitHub Pages。`package.json` 的 `private: true` 只防止 npm 误发布，不控制 GitHub 仓库或网站可见性。

## 目录

| 路径 | 内容 |
| --- | --- |
| `app/page.tsx` | 页面和交互 |
| `app/data.ts` | Trace 类型、示例数据、导入校验、指标计算 |
| `app/globals.css` | 样式 |
| `components/ui/` | UI 组件 |
| `docs/` | 完整操作手册及底层原理 |
| `examples/traces/` | 合成 Trace 和导入练习 |
| `scripts/`、`build/` | 构建和本地运行支持 |
| `db/`、`examples/d1/` | 模板可选数据库示例；当前实验台未使用 |

第三方组件和构建支持文件的许可声明保留在对应文件中。
