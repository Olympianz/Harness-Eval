# Harness Eval 独立部署与管理

## 架构与范围
代码在自己的 GitHub 仓库，运行在自己的 Cloudflare Workers 账号，Cloudflare Access 负责访问白名单。保留现有 Vinext / React 前端及 localStorage 数据。没有正式数据，本次不做历史数据迁移，不创建 D1/R2，不调用模型。默认仍包含虚构示例。

## 本地运行
安装 Node.js 24 LTS 和 package.json 指定的 pnpm 11.25.0，然后在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

如果沿用从其他机器复制的 node_modules，先执行 `pnpm install --force --frozen-lockfile`，重新安装适合本机架构的原生依赖。不要把 node_modules 提交到 Git。

访问 http://localhost:5173。本地只监听 127.0.0.1，不模拟 ChatGPT 登录。

```sh
pnpm typecheck
pnpm lint
pnpm deploy:dry-run
pnpm start
```

start 预览已构建版本，端口以输出为准。dry-run 构建并检查 Worker 打包，不发布。

## 首次发布（你自己的 Cloudflare 账号）
1. 注册/登录 https://dash.cloudflare.com ，启用 Workers 与 Cloudflare Access。
2. 本地执行 `pnpm cf:login`，在浏览器完成授权；执行 `pnpm cf:whoami` 确认账号。
3. 如果账号中已有同名 Worker，先改 wrangler.jsonc 的 name，避免覆盖其他项目；同时更新 package.json 的 cf:logs/cf:rollback 命令。
4. 在自己的终端设置 `CLOUDFLARE_ACCOUNT_ID` 为目标账号 ID。它不是密码，但不要混用多个账号。
5. 执行 `pnpm deploy`。初始配置 workers_dev=false、preview_urls=false、routes=[]，上传后没有可供浏览器访问的公网入口。这是有意的初始状态，不是部署失败。
6. 在 Cloudflare 对这个 Worker 启用 Access，保护生产访问（如启用预览，也保护预览）。创建只允许本人邮箱的策略；可配置 One-time PIN。不要设置 Everyone 或 Bypass。Access 策略独立保存在 Cloudflare，wrangler.jsonc 不会替你创建策略。
7. 确认保护范围覆盖 Worker 生产入口后，把 wrangler.jsonc 的 workers_dev 改为 true，保留 preview_urls=false，重新执行 `pnpm deploy`。使用部署输出的实际 URL，不要根据账号邮箱猜测 workers.dev 子域名。
8. 如果后台不能在关闭入口时配置 Worker 级 Access，先为预定自定义域名配置 hostname-based Access，再在 wrangler.jsonc 添加该域名；不要先开放一个无保护的入口。
9. 无痕窗口确认先出现 Access 登录；本人邮箱可进入；非白名单邮箱无法进入。页面和静态资源均应被 Access 保护。验收前不要导入正式数据。

应用本身不提供账户密码校验；其私有性依赖 Cloudflare Access。不能只添加登录按钮或信任客户端传来的身份头。

## 可选：自己的域名
将域名接入自己的 Cloudflare zone，在配置中保持 workers_dev=false、preview_urls=false，并将 routes 替换为：

```json
[{ "pattern": "eval.your-domain.com", "custom_domain": true }]
```

用自己的真实子域名替换示例，先配置该域名的 Access 保护，再构建发布。不要只在 Dashboard 修改路由开关；下次代码部署可能覆盖它。

## GitHub 自动检查与发布
仓库已添加 `.github/workflows/cloudflare.yml`：PR/main 执行类型检查、lint、构建和 Worker dry-run。生产发布默认关闭。

首次手动部署及 Access 验收后：
1. GitHub 仓库 Settings → Environments 创建 production，可按需要设置审批人。
2. 在 production 的 Secrets 配置 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。Token 只授权目标账号的 Workers 部署权限；部署域名需要对应 zone 权限。不要提交全局 API Key。
3. 在仓库 Variables 设置 `CLOUDFLARE_DEPLOY_ENABLED=true`。
4. main 分支推送或手动运行 workflow，检查通过后部署。PR 不部署，不读取生产密钥。
5. 关闭自动发布时将上述 Variable 改为 false。不要同时开启另一套 Workers Builds 自动发布，避免重复部署。

## 日常管理
- 日志：`pnpm cf:logs`，或 Cloudflare Worker 后台。
- 回退：`pnpm cf:rollback`，按提示选择/确认版本；后续修正 Git main，否则下一次自动部署仍会发布代码中的版本。
- 权限：在 Cloudflare Access 修改邮箱白名单；GitHub 仓库权限与网站访问权限是两回事。
- 费用：在自己的 Cloudflare 账号查看用量及账单。
- 数据：仍在当前浏览器，换域名或设备不会同步。现有 JSONL 导出仅包含 Dataset 样本，不是全部 Trace 的备份。
- 未来持久化：需要新增 D1 表、后端 API、用户数据隔离及完整备份恢复。本次没有启用数据库。

## 验收清单
- [ ] 干净安装成功；typecheck/lint/build/dry-run 成功。
- [ ] 页面正常；导入 examples/traces/import-practice.jsonl 后可标注、导出 Dataset、切换版本查看指标。
- [ ] 刷新当前浏览器后数据仍存在。
- [ ] 无痕/未授权访问被 Access 拦截；本人登录可用。
- [ ] workers.dev、自定义域名和预览入口不存在未保护的旁路。
- [ ] GitHub 自动部署和 Cloudflare 日志可查看，版本回退可操作。

确认新站可用后再停用旧 ChatGPT Sites。当前操作没有关闭旧站，也不能将旧 chatgpt.site 地址转入个人 Cloudflare 账号。

参考：
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/vite-plugin/reference/api/

## 本次执行状态（2026-11-16）

- 本地代码已移除 Sites 运行依赖，部署配置及 CI 已写入。
- TypeScript 类型检查已通过（tsc --noEmit，exit 0）。
- 静态检查通过：默认关闭公网/预览路由；删除登录与托管绑定；git diff --check 无错误。
- 构建受环境阻碍：现有依赖缺少 ARM64 的 rolldown 原生绑定；Wrangler 检测到 x64 workerd 与 ARM64 Node 不匹配。
- 当前执行环境无法解析 registry.npmjs.org，无法下载匹配依赖；因此构建、dry-run 和浏览器验收尚未通过。
- Cloudflare 账号授权无法通过 Wrangler 检查，未部署到个人账号，未获得新网址。旧站未改动。
- .git 写入被环境限制，改动尚未提交/推送，GitHub workflow 尚未实际运行。

- Lint 在本环境两次限时运行均超时，尚未确认通过。已为页面恢复 localStorage 的初始化 effect 添加单行规则豁免（保留原行为，防止新 CI 将必要的客户端恢复当作错误）。
