# 现有 Cloudflare Worker 接入 NAS PostgreSQL

应用使用 Worker `harness-eval-lab` 的 `HYPERDRIVE` 绑定，依次经过 Hyperdrive、TCP VPC Service 和 Cloudflare Tunnel 访问 NAS 的 PostgreSQL 端口。GitHub 仍管理应用代码。连接器所在网络须能访问数据库，并能向 Cloudflare 建立出站连接。

## 1. 在 Mac 连接账号和 NAS

在本项目根目录运行：

```sh
NAS_SSH_TARGET=user@nas-host NAS_PG_IPV4=192.0.2.10 bash deploy/cloudflare/connect-from-mac.command
```

将命令中的 SSH 目标和示例 IPv4 换成实际值。按终端提示登录 Cloudflare。打开 [Cloudflare 隧道管理页](https://dash.cloudflare.com/?to=/:account/tunnels)，创建或复用可到达 NAS 的隧道，例如 `harness-eval-nas`。选择 Docker，复制安装命令，在脚本的隐藏提示中粘贴。若已有健康连接器，且 PostgreSQL 已启用受信任的 TLS，可直接进入第 2 步。

脚本通过 SSH 使用 NAS 上已有的 Docker，并检查 PostgreSQL 的 `ssl`。若已启用，沿用现有证书。若关闭，脚本先确认数据目录位于可写持久卷，生成带 与 `NAS_PG_IPV4` 一致的 IP SAN 的服务器证书，写入数据卷并重载 PostgreSQL 配置。现有数据库账号和密码继续有效。Mac 脚本将公开 CA 证书保存到「下载」目录，文件名带证书指纹，并在终端显示完整路径。新签发的服务器证书有效期 365 天，一次性签发密钥在脚本退出时清除。到期前需轮换服务器证书及信任链。

脚本在 NAS 上启动独立的 `harness-eval-cloudflared` 连接器。容器启动后请在控制台核实 Tunnel 为 **Healthy**。若 NAS 从 Docker Hub 拉取镜像超时，在上面的命令末尾追加 `--from-mac` 后在 Mac 重试。该选项按 NAS 的 CPU 架构在 Mac 下载连接器镜像，经 SSH 传入 NAS 后导入。Mac 使用已有的 crane，或临时下载并校验 Google 发布的 crane。Mac 需要能访问这些下载源。若容器启动而 Tunnel 离线，查看 `sudo docker logs --tail 40 harness-eval-cloudflared`，检查到 Cloudflare 的出站 7844/TCP 或 UDP。数据库部署步骤无需重跑。

## 2. 为一个数据库端口创建 VPC Service 和 Hyperdrive

在同一 Cloudflare 账号下创建或复用以下资源：

| 设置 | 填写值 |
|---|---|
| Workers VPC 的 Service | 名称可用 `harness-eval-pg`，类型 `TCP`，应用协议 `PostgreSQL` |
| 网络与源站 | 选择刚才的健康 Tunnel，实际 PostgreSQL 源站 IPv4，TCP 端口 `15432` |
| TLS | 使用 `verify_full`。为自建 CA 上传**公开 CA 证书**并在这个 Service 选中它。已有证书须与 IP 或配置的源站主机名相符 |
| Hyperdrive | 创建配置，选择 **Connect to private database → Workers VPC**，指定上面的 VPC Service |
| 数据库凭据 | PostgreSQL，数据库 `harness_eval`，角色 `harness_app`，密码在控制台输入 |
| 查询缓存 | 对该工作区配置关闭查询缓存，以便立即读回刚提交的版本 |

若控制台没有 CA 上传入口，在本机用支持该参数的 Wrangler 版本（4.164.0 或更新）运行下列命令，记录返回的 CA ID 和 Service ID。将 NAS_PG_IPV4 设为实际源站 IPv4，将 CA_PEM 设为终端显示的公开 CA 文件完整路径。已有 Service 应更新其证书设置。

```sh
npx wrangler@4.164.0 cert upload certificate-authority --ca-cert "$CA_PEM" --name harness-eval-nas-ca
npx wrangler@4.164.0 vpc service create harness-eval-pg --type tcp --app-protocol postgresql \
  --tunnel-id "$TUNNEL_ID" --ipv4 "$NAS_PG_IPV4" --tcp-port 15432 \
  --certificate-authority "$CA_ID" --cert-verification-mode verify_full
```

Hyperdrive 创建并验证源站成功后，复制其配置 ID。此 ID 供 Worker 构建使用。数据库密码由 Hyperdrive 管理。

## 3. 绑定并部署现有 Worker

在项目根目录执行，使用真实 Hyperdrive 配置 ID。确认 Wrangler 所选账号和 Worker 名称与现有应用一致。

```sh
export HARNESS_HYPERDRIVE_ID='替换为真实配置ID'
pnpm deploy:dry-run
```

在输出中核对 `env.HYPERDRIVE` 对应正确配置。已有 `WORKSPACE_TOKEN` 时继续使用。首次使用时通过 Dashboard 在目标 Worker 的 Secrets 增加独立的应用访问密钥，或在已有 Worker 上执行 `pnpm exec wrangler secret put WORKSPACE_TOKEN --name harness-eval-lab`，按隐藏提示输入。首次部署 Worker 时也可先部署至关闭入口的 Worker，再设置 Secret。

核对 `wrangler.jsonc` 的 routes、workers_dev 与现有受 Access 保护的应用入口。仓库默认关闭公网入口。若线上域名只配置在 Dashboard，先将实际受保护路由记录到项目配置，避免发布时改变访问地址。然后执行：

```sh
pnpm deploy
```

GitHub Actions 的现有 production 环境增加变量 `HARNESS_HYPERDRIVE_ID`；沿用原有发布开关和 Cloudflare 部署凭据。绑定 ID 决定 Worker 的数据库连接，也会让客户端在构建时启用 NAS 存储。缺少绑定 ID 时，生产部署命令会停止。局域网 Node 运行方式继续支持 PGHOST、PGPORT、PGDATABASE、PGUSER 和 PGPASSWORD。

## 4. 验收云端真实读写

1. 从现有受保护的应用网址登录，新建名称唯一的测试项目，导入一条示例 Trace 并记录 Trace ID，等待「已保存到 NAS」。
2. 在 NAS 上用下列只读 SQL 查询测试项目。将最后一行的项目名换成页面实际名称。查询须返回刚写入的 Trace ID。
3. 关闭页面，用新的无痕窗口登录同一个云端网址，看到「已从 NAS 加载」，核对项目名、Trace ID 和内容。

```sh
sudo docker exec -i harness-eval-postgres sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d harness_eval' <<'SQL'
SELECT w.revision, p->>'name' AS project_name, r->>'id' AS trace_id
FROM public.harness_workspace w, jsonb_array_elements(w.data->'projects') p,
     jsonb_array_elements(p->'rows') r
WHERE w.id = 1 AND p->>'name' = '换成测试项目名';
SQL
```

应用接口返回 401 时核对应用访问密钥。返回 503 时依次核对 Worker 的 Hyperdrive 绑定、Hyperdrive 的数据库凭据、VPC Service 证书、Tunnel 状态与 NAS 端口。控制台显示 Healthy 只证明连接器已连到 Cloudflare。

[Cloudflare 私有数据库接入说明](https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/)
