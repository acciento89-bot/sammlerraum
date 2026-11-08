#!/usr/bin/env bash
# CI-only, exact owned synthetic volumes. No production host or provider access.
set -euo pipefail
[[ "${CI:-}" = true && "${GITHUB_ACTIONS:-}" = true ]] || { echo 'CI-only stack drill refused' >&2; exit 64; }
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || exit 64
export COMPOSE_PROJECT_NAME="sammlerraum-ci-${GITHUB_RUN_ID}"
export POSTGRES_DB="sammlerraum_stack_${GITHUB_RUN_ID}_test" POSTGRES_USER=test POSTGRES_PASSWORD=disposable-stack-test-only
export DATABASE_URL="postgresql://test:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}"
export SAMMLERRAUM_DB_VOLUME="${COMPOSE_PROJECT_NAME}-database" SAMMLERRAUM_UPLOADS_VOLUME="${COMPOSE_PROJECT_NAME}-uploads"
export SAMMLERRAUM_WEB_PORT=3349 MIGRATION_MODE=scratch SAMMLERRAUM_MIGRATION_APPROVED_SHA="$GITHUB_SHA"
export SAMMLERRAUM_WEB_IMAGE="$(docker image inspect sammlerraum-web-ci --format '{{.Id}}')"
export SAMMLERRAUM_WORKER_IMAGE="$(docker image inspect sammlerraum-worker-ci --format '{{.Id}}')"
export SAMMLERRAUM_MIGRATION_IMAGE="$(docker image inspect sammlerraum-migration-ci --format '{{.Id}}')"
export SAMMLERRAUM_DB_IMAGE="$(docker image inspect postgres:17-bookworm --format '{{index .RepoDigests 0}}')"
export SAMMLERRAUM_ENV_FILE="${RUNNER_TEMP:?}/sammlerraum-stack-${GITHUB_RUN_ID}.env"
private_config="${RUNNER_TEMP}/sammlerraum-stack-${GITHUB_RUN_ID}.json"
umask 077
python3 - <<'PY'
from pathlib import Path
import os,json
policy=json.loads(Path('packages/testing/fixtures/security-billing-policy.json').read_text())
values=dict(DATABASE_URL=os.environ['DATABASE_URL'],APP_ORIGIN='http://127.0.0.1:3349',DEPLOYMENT_SCRATCH='true',UPLOADS_DIR='/data/uploads',LOG_LEVEL='info',BETTER_AUTH_SECRET='owned-synthetic-stack-secret-at-least-thirty-two-characters',GOOGLE_CLIENT_ID='owned-fixture',GOOGLE_CLIENT_SECRET='owned-fixture',APPLE_CLIENT_ID='owned-fixture',APPLE_CLIENT_SECRET='owned-fixture',SMTP_HOST='smtp.example.invalid',SMTP_PORT='587',SMTP_SECURE='false',SMTP_USER='owned-fixture',SMTP_PASSWORD='owned-fixture',SMTP_FROM='noreply@example.invalid',BILLING_PLAN_LIMITS=json.dumps(policy,separators=(',',':')),BILLING_ENVIRONMENT='test',BILLING_ENABLED='false',AI_ANALYSIS_ENABLED='false',MARKET_SYNC_ENABLED='false',SCRYDEX_ENABLED='false',PRICECHARTING_ENABLED='false',NOTIFICATION_EMAIL_ENABLED='false')
Path(os.environ['SAMMLERRAUM_ENV_FILE']).write_text(''.join(k+'='+v+'\n' for k,v in values.items()))
PY
compose=(docker compose -f docker-compose.prod.yml)
# Only create names unique to this CI run. Refuse collisions rather than adopting unknown data.
for volume in "$SAMMLERRAUM_DB_VOLUME" "$SAMMLERRAUM_UPLOADS_VOLUME"; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then echo 'Owned CI volume name collision' >&2; exit 1; fi
  docker volume create --label sammlerraum.synthetic-ci="$GITHUB_RUN_ID" "$volume" >/dev/null
done
cleanup() {
  "${compose[@]}" down --timeout 60 >/dev/null 2>&1 || true
  rm -f "$SAMMLERRAUM_ENV_FILE" "$private_config"
  # Do not delete persistent volumes. Ephemeral runner disposal owns their later lifecycle.
}
trap cleanup EXIT
"${compose[@]}" config --format json > "$private_config"
python3 scripts/verify-production.py --config-json "$private_config"
"${compose[@]}" up -d --wait --wait-timeout 240 db
"${compose[@]}" up --no-deps --exit-code-from migrate migrate
"${compose[@]}" up -d --wait --wait-timeout 240 web worker
python3 scripts/verify-production.py --config-json "$private_config" --health-url http://127.0.0.1:3349/api/health
[[ "$("${compose[@]}" exec -T db psql -U test -d "$POSTGRES_DB" -Atqc "SELECT current_setting('server_version_num')::int/10000")" = 17 ]]
"${compose[@]}" exec -T worker node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
# Prove both named volumes survive an application restart without manufacturing user data.
"${compose[@]}" exec -T db psql -U test -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qc 'CREATE TABLE sammlerraum_ci_restart_receipt (receipt text NOT NULL); INSERT INTO sammlerraum_ci_restart_receipt VALUES ('"'${GITHUB_SHA}'"');'
"${compose[@]}" exec -T web node -e "require('node:fs').writeFileSync('/data/uploads/.ci-restart-receipt',process.argv[1])" "$GITHUB_SHA"
"${compose[@]}" restart web worker
"${compose[@]}" up -d --wait --wait-timeout 240 web worker
[[ "$("${compose[@]}" exec -T db psql -U test -d "$POSTGRES_DB" -Atqc 'SELECT receipt FROM sammlerraum_ci_restart_receipt')" = "$GITHUB_SHA" ]]
"${compose[@]}" exec -T worker node -e "if(require('node:fs').readFileSync('/data/uploads/.ci-restart-receipt','utf8')!==process.argv[1])process.exit(1)" "$GITHUB_SHA"
python3 scripts/verify-production.py --config-json "$private_config" --health-url http://127.0.0.1:3349/api/health

# Connect the actual backup/restored resources to the reviewed application, not a health fixture.
bash scripts/test-production-recovery.sh
