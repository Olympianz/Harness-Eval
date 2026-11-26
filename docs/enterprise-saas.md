# Harness Eval 企业租户上线与使用

## 开通一家企业

1. 平台管理员进入 `/admin`，输入服务端配置的 `TENANT_ADMIN_TOKEN`，填写企业名称后创建租户。复制仅显示一次的企业密钥，通过企业获准的秘密共享渠道交付。
2. 企业成员进入 `/workspace`，使用该企业密钥登录。新租户从一个空的 `default` 项目开始。浏览器刷新后需要重新登录。企业工作区和密钥仅保存在页面内存中，数据由服务器保存。
3. 在工作区创建项目，等待“已保存到 NAS”。管理员使用该项目的实际 ID 在后台签发项目接入密钥。设置采集器的 `TRACE_INGEST_TOKEN` 后，继续使用原有的 `tools/push-trace.py` 与 `/api/traces?project=…` 入口。上报密钥只允许写入绑定的企业和项目。
4. 在后台修改名称或启用状态。停用将阻止后续工作区读写和上报。轮换密钥后请通过原渠道重新分发。已导出的文件和已经打开的页面内容不会被远程清除。

首页 `/` 介绍服务；`/demo` 使用可刷新还原的合成样本。已有私有工作区迁至入口 `/legacy`。其数据继续留在原表；如需转给一家企业，在原空间导出后登录目标企业导入，先核对企业名称和备份覆盖范围。

## 数据边界

本版采用共享 PostgreSQL、每租户一行 JSON 工作区。每个租户拥有独立的 revision、项目、Trace、Dataset 标记及回归输入。租户由服务端解析密钥摘要确定。项目 ID 可在不同企业中重复。每租户工作区写入上限 10 MiB。一个企业内的成员共享一个读写密钥，平台管理员使用单独的管理密钥。目前没有个人账户、SSO 或成员级授权。

## 发布到现有环境

1. 在生产 NAS 核对备份后，以数据库迁移账户对现有 harness_eval 库执行仓库中的 `deploy/nas/init.sql`。该脚本可重复执行，会新增 `eval_tenant` 和 `eval_ingest_key` 并授予应用角色所需权限。既有工作区不会自动复制。回滚 Worker 时保留新表。
2. 为现有 Worker 新增名为 `TENANT_ADMIN_TOKEN` 的 Secret，使用由密码管理器生成的至少 32 字符高熵值。保留既有 `WORKSPACE_TOKEN`、项目上报密钥和 Hyperdrive 绑定。Node 部署使用同名环境变量。
3. 确认生产 Hyperdrive 指向正确的数据库，并沿用关闭查询缓存的配置。使用项目私有配置中的真实绑定 ID 运行 `HARNESS_HYPERDRIVE_ID=… pnpm deploy:dry-run`。核对生成配置中的 Worker 名称和绑定。
4. 核对生产域名、现行 Access 策略和上一版本 ID。需要匿名展示时为首页、演示页及所需静态资源配置公开访问；企业工作区、后台、原私有入口与数据 API 保留既有适用的 Access 策略和应用鉴权。验证 Agent 的服务身份仍可上报。整站受 Access 保护时访客仍会被要求登录。
5. 沿用现有受保护路由的发布可使用 `wrangler versions upload` 上传构建产物，再用 `wrangler versions deploy` 按返回版本号切换流量。记录版本与发布前流量；生产验收独立于构建成功。

## 验收

- 在测试环境配置独立 PostgreSQL 并初始化 schema，使用应用角色运行 NAS 版服务，端口 25438。服务端与测试进程配置相同的 TENANT_ADMIN_TOKEN、WORKSPACE_TOKEN。执行 `python3 tests/check-tenants.py`。该脚本仅连接本机，创建合成测试租户。
- 生产中分别创建两个获准的验收租户，在两者的 default 项目内使用同一条合成运行记录。先只向 A 上报，确认 B 仍为空，再用 B 自己的项目密钥上报。退出重新登录各自的工作区，核对运行 ID、Dataset 标注和保存状态。
- 在 NAS 以只读查询核对同一个租户和 Trace。以下为 psql 示例，通过 `-v tenant_id=… -v trace_id=…` 传入验收值。

```sql
SELECT t.id, t.revision, p->>'id' AS project_id, r->>'id' AS trace_id
FROM public.eval_tenant t,
     jsonb_array_elements(t.data->'projects') p,
     jsonb_array_elements(p->'rows') r
WHERE t.id = :'tenant_id'::uuid AND r->>'id' = :'trace_id';
```

### 当前 Cloudflare Builds 配置

`harness-eval-lab` 已连接此仓库的 `feat/enterprise-tenants` 分支。推送变更触发生产模式构建，使用现有 Hyperdrive 绑定。构建命令完成后，Wrangler 上传候选版本。发布人在 Deployments 选择本次提交对应的版本并切换流量，核对现有域名、Access 和回滚版本。
