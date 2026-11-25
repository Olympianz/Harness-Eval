#!/bin/bash
# Configure only PostgreSQL on the NAS. Run in the Mac terminal.
set -euo pipefail
cd "$(dirname "$0")"
host=${NAS_SSH_TARGET:?Set NAS_SSH_TARGET to user@host}
local_tmp=$(mktemp -d /tmp/harness-db.XXXXXXXX)
stage=''
opts=(-p 22 -o ConnectTimeout=10 -o ControlMaster=auto -o ControlPersist=60 -o "ControlPath=$local_tmp/ssh")
remote() { ssh "${opts[@]}" "$host" "$@"; }
cleanup() {
  if [[ "$stage" =~ ^/tmp/harness-db\.[a-zA-Z0-9]+$ ]]; then
    remote "rm -f '$stage/init.sql' '$stage/install-on-nas.sh'; rmdir '$stage'" </dev/null || true
  fi
  ssh "${opts[@]}" -O exit "$host" 2>/dev/null || true
  rm -rf "$local_tmp"
}
trap cleanup EXIT
echo '配置已有 PostgreSQL 容器 harness-eval-postgres'
stage=$(remote 'umask 077; mktemp -d /tmp/harness-db.XXXXXXXX')
[[ "$stage" =~ ^/tmp/harness-db\.[a-zA-Z0-9]+$ ]] || { echo 'NAS 临时路径无效。' >&2; exit 1; }
for file in init.sql install-on-nas.sh; do
  remote "umask 077; cat > '$stage/$file'" < "$file"
done
ssh "${opts[@]}" -t "$host" "cd '$stage' && sh ./install-on-nas.sh"
