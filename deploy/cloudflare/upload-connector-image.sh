#!/bin/bash
# Download the NAS platform's image using the Mac's network, without a Docker daemon.
set -euo pipefail
host=${1:?NAS SSH destination required}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
case "$(ssh -p 22 "$host" uname -m)" in
  x86_64) platform=linux/amd64 ;;
  aarch64|arm64) platform=linux/arm64 ;;
  armv7l) platform=linux/arm/v7 ;;
  *) echo '暂不支持此 NAS 处理器架构。' >&2; exit 1 ;;
esac
crane=$(command -v crane || true)
if [[ -z "$crane" ]]; then
  asset="go-containerregistry_Darwin_$(uname -m).tar.gz"
  version=v0.22.1
  fetch() { curl -fsSL --retry 2 --connect-timeout 15 "$1" -o "$2"; }
  fetch "https://api.github.com/repos/google/go-containerregistry/releases/tags/$version" release.json
  digest=$(node -e '
    const asset = require("./release.json").assets.find(item => item.name === process.argv[1])
    if (!asset || !/^sha256:[0-9a-f]{64}$/.test(asset.digest)) process.exit(1)
    console.log(asset.digest.slice(7))
  ' "$asset")
  fetch "https://github.com/google/go-containerregistry/releases/download/$version/$asset" "$asset"
  printf '%s  %s\n' "$digest" "$asset" | shasum -a 256 -c - >&2
  tar -xzf "$asset" crane
  crane="$work/crane"
fi
echo "Mac 正在下载 $platform 的 Cloudflare 连接器镜像。" >&2
if ! "$crane" pull --platform "$platform" cloudflare/cloudflared:latest connector.tar >&2; then
  echo 'Docker Hub 下载失败，尝试 Google 的 Docker Hub 镜像缓存。' >&2
  "$crane" pull --platform "$platform" mirror.gcr.io/cloudflare/cloudflared:latest connector.tar >&2
fi
ssh -p 22 "$host" 'set -eu
  file=$(mktemp /tmp/harness-cloudflared.XXXXXXXX)
  if cat > "$file"; then printf "%s\n" "$file"; else rm -f "$file"; exit 1; fi' < connector.tar
