# Loaded before prepare-nas.sh on the NAS. All keys stay inside the persistent data directory.
enable_tls() (
  dbdir=$(printf 'SHOW data_directory;\n' | sql)
  mounts=$(d inspect -f '{{range .Mounts}}{{if .RW}}{{println .Destination}}{{end}}{{end}}' "$db")
  mounted=false
  while IFS= read -r mount; do
    [ -n "$mount" ] || continue
    case "$dbdir/" in "$mount/"*) mounted=true;; esac
  done <<MOUNTS
$mounts
MOUNTS
  if [ "$mounted" != true ]; then echo '未确认 PostgreSQL 数据目录的持久可写挂载，未修改 TLS 配置。' >&2; return 1; fi
  command -v openssl >/dev/null
  material=$(mktemp -d /tmp/harness-pg-tls.XXXXXXXX)
  trap 'rm -rf "$material"' EXIT
  cat > "$material/cert.cnf" <<CONF
[req]
distinguished_name = names
[names]
[ca]
basicConstraints = critical,CA:true,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
[server]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = IP:$nas_ip
CONF
  cert_dir="$dbdir/harness-eval-tls"
  # Reuse complete credentials after an interrupted setup; never replace an existing certificate.
  if ! d exec -u postgres "$db" test -d "$cert_dir"; then
    openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj '/CN=Harness Eval NAS CA' \
      -config "$material/cert.cnf" -extensions ca -keyout "$material/ca.key" -out "$material/ca.crt"
    openssl req -new -newkey rsa:2048 -nodes -subj "/CN=$nas_ip" -config "$material/cert.cnf" \
      -keyout "$material/server.key" -out "$material/server.csr"
    openssl x509 -req -in "$material/server.csr" -CA "$material/ca.crt" -CAkey "$material/ca.key" \
      -CAcreateserial -days 365 -sha256 -extfile "$material/cert.cnf" -extensions server -out "$material/server.crt"
    openssl verify -CAfile "$material/ca.crt" "$material/server.crt"
    incoming=$(d exec -u postgres "$db" mktemp -d "$dbdir/harness-cert.XXXXXXXX")
    for file in ca.crt server.crt server.key; do
      d exec -i -u postgres "$db" sh -ec 'umask 077; cat > "$1"' sh "$incoming/$file" < "$material/$file"
    done
    d exec -u postgres "$db" mv "$incoming" "$cert_dir"
  fi
  for file in server.crt server.key ca.crt; do d exec -u postgres "$db" test -s "$cert_dir/$file"; done
  # Capture the effective settings before modifying them. Restore them if reload does not enable TLS.
  restore=$(printf '%s\n' "SELECT format('ALTER SYSTEM SET %I = %L;',name,setting) FROM pg_settings WHERE name IN ('ssl','ssl_cert_file','ssl_key_file');" | sql)
  if ! sql <<'SQL'
ALTER SYSTEM SET ssl_cert_file = 'harness-eval-tls/server.crt';
ALTER SYSTEM SET ssl_key_file = 'harness-eval-tls/server.key';
ALTER SYSTEM SET ssl = 'on';
SELECT pg_reload_conf();
SQL
  then
    printf '%s\nSELECT pg_reload_conf();\n' "$restore" | sql
    return 1
  fi
  for attempt in 1 2 3 4 5; do
    if [ "$(printf 'SHOW ssl;\n' | sql)" = on ]; then return 0; fi
    sleep 1
  done
  printf '%s\nSELECT pg_reload_conf();\n' "$restore" | sql
  echo 'TLS 配置未生效，已恢复此前设置。请查看 PostgreSQL 日志。' >&2
  return 1
)
