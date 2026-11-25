#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
host=${NAS_SSH_TARGET:?Set NAS_SSH_TARGET to user@host}
nas_ip=${NAS_PG_IPV4:?Set NAS_PG_IPV4 to the PostgreSQL origin IPv4 address}
if ! [[ "$nas_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo 'NAS_PG_IPV4 must be an IPv4 address.' >&2
  exit 2
fi
if ! command -v pnpm >/dev/null; then
  for bin in "$HOME"/.nvm/versions/node/*/bin; do
    if [[ -x "$bin/pnpm" ]]; then export PATH="$bin:$PATH"; break; fi
  done
fi
if ! pnpm exec wrangler whoami --json >/dev/null; then pnpm cf:login; fi
pnpm exec wrangler whoami
echo '请在同一 Cloudflare 账号打开 harness-eval-nas 隧道的连接器安装页面。'
echo '新连接器需要控制台提供的 Tunnel token。随后会在 NAS 终端隐藏输入。'
# Pass only the connector setup code. No application source or secret is uploaded.
command_text="nas_ip='$nas_ip'
$(cat deploy/cloudflare/postgres-tls.sh deploy/cloudflare/prepare-nas.sh)"
case "${1:-}" in
  --from-mac)
    # Collect the upload location only. Progress and prompts stay on the terminal.
    archive=$(bash deploy/cloudflare/upload-connector-image.sh "$host")
    [[ "$archive" =~ ^/tmp/harness-cloudflared\.[a-zA-Z0-9]+$ ]] || exit 1
    command_text="connector_archive='$archive'
$command_text"
    ;;
  '') ;;
  *) echo '用法：connect-from-mac.command [--from-mac]' >&2; exit 2 ;;
esac
cert_tmp=$(mktemp /tmp/harness-public-ca.XXXXXXXX)
trap 'rm -f "$cert_tmp"' EXIT
result=0
ssh -t -p 22 "$host" "$command_text" | tee /dev/tty | tr -d '\r' |
  awk '/^-----BEGIN CERTIFICATE-----$/{show=1} show{print} /^-----END CERTIFICATE-----$/{show=0}' > "$cert_tmp" || result=$?
if [[ -s "$cert_tmp" ]] && openssl x509 -in "$cert_tmp" -noout; then
  ca_dir="$HOME/Downloads"
  mkdir -p "$ca_dir"
  fingerprint=$(openssl x509 -in "$cert_tmp" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':')
  ca_path="$ca_dir/harness-eval-nas-ca-${fingerprint:0:12}.pem"
  cp "$cert_tmp" "$ca_path"
  echo "Cloudflare VPC 使用的公开 CA 证书：$ca_path"
fi
exit "$result"
