#!/bin/sh
set -eu
cd "$(dirname "$0")"
PATH=/usr/local/bin:/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:$PATH
export PATH
db=harness-eval-postgres
docker_cli=$(command -v docker)
if "$docker_cli" inspect "$db" >/dev/null 2>&1; then
  docker_db() { "$docker_cli" "$@"; }
else
  docker_db() { sudo "$docker_cli" "$@"; }
fi
admin() {
  docker_db exec -i "$db" sh -ec 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "$1"' sh "$1"
}
docker_db exec "$db" pg_isready
admin postgres <<'SQL'
SELECT 'CREATE DATABASE harness_eval' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='harness_eval') \gexec
SQL
admin harness_eval < init.sql
needs_password=$(admin postgres <<'SQL'
SELECT rolpassword IS NULL FROM pg_authid WHERE rolname='harness_app';
SQL
)
if [ "$needs_password" = t ]; then
  echo '请为应用数据库账号 harness_app 设置密码，并保存在你的密码管理器中。'
  docker_db exec -it "$db" sh -ec 'exec psql -X -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d harness_eval -c "\\password harness_app"'
fi

# Other sessions cannot see the test marker. ROLLBACK restores the original row (or empty table).
probe=$(cat <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '3s';
DO $$
DECLARE
  marker jsonb := to_jsonb(txid_current());
BEGIN
  INSERT INTO public.harness_workspace AS w (id,data,revision)
  VALUES (1, jsonb_build_object('_harness_db_probe', marker), 1)
  ON CONFLICT (id) DO UPDATE
  SET data = jsonb_set(w.data, '{_harness_db_probe}', marker);
  IF NOT EXISTS (SELECT FROM public.harness_workspace WHERE id=1 AND data->'_harness_db_probe'=marker) THEN
    RAISE EXCEPTION 'workspace readback failed';
  END IF;
END $$;
ROLLBACK;
SQL
)
echo '现在使用 harness_app 验证写入和读回。请输入该账号的数据库密码。'
docker_db exec -it "$db" psql -X -W -v ON_ERROR_STOP=1 -h 127.0.0.1 -U harness_app -d harness_eval -c "$probe"
echo 'PASS — harness_app 已写入并读回工作区表，测试事务已回滚。'
echo 'PostgreSQL 5432/tcp 的 NAS 端口映射：'
docker_db port "$db" 5432/tcp || echo '未检测到宿主机端口映射。'
