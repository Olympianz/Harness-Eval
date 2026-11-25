#!/bin/sh
# Run on the NAS after saving a uniquely named test project in the browser.
set -eu
if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo 'Usage: sh deploy/nas/verify-persistence.sh "saved test project name"' >&2
  exit 2
fi

name=$1
app=harness-eval-app
db=harness-eval-postgres
database=$(docker exec "$app" printenv PGDATABASE)

db_project_id() {
  docker exec -i "$db" sh -ec '
    exec psql -X -qAt -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "$1" -v "project_name=$2"
  ' sh "$database" "$name" <<'SQL'
SELECT project->>'id'
FROM public.harness_workspace AS w, jsonb_array_elements(w.data->'projects') AS project
WHERE w.id = 1 AND project->>'name' = :'project_name';
SQL
}

api_snapshot() {
  docker exec -i "$app" node --input-type=module - "$name" <<'JS'
import { createHash } from "node:crypto";
const response = await fetch("http://127.0.0.1:3000/api/workspace", {
  headers: { Authorization: "Bearer " + process.env.WORKSPACE_TOKEN },
  signal: AbortSignal.timeout(5000),
});
if (!response.ok) throw Error("Workspace GET returned " + response.status);
const { data } = await response.json();
const matches = data?.projects.filter(p => p.name === process.argv[2]);
if (matches?.length !== 1) throw Error("Expected one saved test project");
const project = matches[0];
const digest = createHash("sha256").update(JSON.stringify(project)).digest("hex");
console.log(project.id + " " + digest);
JS
}

before=$(api_snapshot)
id=$(db_project_id)
if [ -z "$id" ] || [ "${before% *}" != "$id" ]; then
  echo 'The API and PostgreSQL do not identify the same test project.' >&2
  exit 1
fi
echo 'Test project confirmed by both the application and PostgreSQL.'
docker restart "$app" >/dev/null
attempt=0
until after=$(api_snapshot 2>/dev/null); do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo 'Application did not return the test project after restart.' >&2
    exit 1
  fi
  sleep 2
done
if [ "$before" != "$after" ] || [ "$(db_project_id)" != "$id" ]; then
  echo 'Test project changed during restart.' >&2
  exit 1
fi
echo 'PASS: the application returned the same project and contents after restart.'
