#!/bin/sh
# Run from a NAS SSH terminal. The only new container is the Cloudflare connector.
set -eu
umask 077
PATH=/usr/local/bin:/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:$PATH
export PATH
db=harness-eval-postgres
connector=harness-eval-cloudflared
docker_cli=$(command -v docker)
if "$docker_cli" inspect "$db" >/dev/null 2>&1; then
  d() { "$docker_cli" "$@"; }
else
  d() { sudo "$docker_cli" "$@"; }
fi
if [ -n "${connector_archive:-}" ]; then
  # Read the exact reference from this archive, including a possible mirror prefix.
  loaded=$(d load -i "$connector_archive") || { rm -f "$connector_archive"; exit 1; }
  rm -f "$connector_archive"
  imported=$(printf '%s\n' "$loaded" | sed -n 's/^Loaded image: //p')
  case "$imported" in
    cloudflare/cloudflared:latest) ;;
    docker.io/cloudflare/cloudflared:latest|index.docker.io/cloudflare/cloudflared:latest|mirror.gcr.io/cloudflare/cloudflared:latest)
      d tag "$imported" cloudflare/cloudflared:latest ;;
    *) printf '无法识别导入的镜像：%s\n' "$loaded" >&2; exit 1 ;;
  esac
  d image inspect cloudflare/cloudflared:latest >/dev/null
fi
sql() { d exec -i "$db" sh -ec 'exec psql -XAtq -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d harness_eval'; }
ssl=$(printf 'SHOW ssl;\n' | sql)
echo "PostgreSQL ssl=$ssl"
d port "$db" 5432/tcp
if [ "$ssl" != on ]; then
  echo '正在为 NAS 数据库配置 TLS，用于 VPC 源站身份校验。'
  enable_tls
fi

# Export only the public CA certificate for the Cloudflare VPC service.
dbdir=$(printf 'SHOW data_directory;\n' | sql)
if d exec -u postgres "$db" test -s "$dbdir/harness-eval-tls/ca.crt"; then
  echo '将以下公开 CA 证书保存为 harness-eval-nas-ca.pem，用于 Cloudflare VPC 的受信任 CA。'
  d exec -u postgres "$db" cat "$dbdir/harness-eval-tls/ca.crt"
else
  echo '数据库沿用已有 TLS 证书，请核对颁发机构及其 SAN 是否匹配 VPC 源站地址。'
fi

if d inspect "$connector" >/dev/null 2>&1; then
  image=$(d inspect -f '{{.Config.Image}}' "$connector")
  case "$image" in cloudflare/cloudflared:*|cloudflare/cloudflared@*) ;; *) echo '已有同名容器，请核对来源。' >&2; exit 1;; esac
  d start "$connector" >/dev/null
else
  image=cloudflare/cloudflared:latest
  if ! d image inspect "$image" >/dev/null 2>&1; then d pull "$image"; fi
  printf '请粘贴 Cloudflare 页面复制的完整 Docker 命令或 Tunnel token（输入隐藏）：' >/dev/tty
  old=$(stty -g </dev/tty)
  trap 'stty "$old" </dev/tty' EXIT
  stty -echo </dev/tty
  IFS= read -r token </dev/tty
  stty "$old" </dev/tty
  trap - EXIT
  printf '\n' >/dev/tty
  case "$token" in *' --token '*) token=${token##* --token } ;; esac
  case "$token" in
    *[!A-Za-z0-9_=/+-]*|'') echo '未识别 token，请重新复制 Cloudflare 的 Docker 命令。' >&2; exit 1 ;;
    eyJ*) ;;
    *) echo '请输入 Cloudflare 的 Docker 命令或以 eyJ 开头的运行 token。' >&2; exit 1 ;;
  esac
  # Docker receives the token via stdin. No token is placed in shell history or CLI arguments.
  printf 'TUNNEL_TOKEN=%s\n' "$token" | d run -d --name "$connector" --restart unless-stopped \
    --label app=harness-eval --env-file /dev/stdin "$image" tunnel --no-autoupdate run >/dev/null
  unset token
fi
echo '连接器已启动。请在 Cloudflare 核对同一 Tunnel 显示 Healthy，再创建 TCP 服务。'
