#!/usr/bin/env bash
# Invoked only by the owned CI production stack drill, after its fresh-stack checks.
set -euo pipefail
[[ "${CI:-}" = true && "${GITHUB_ACTIONS:-}" = true && "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]] || exit 64
[[ "${COMPOSE_PROJECT_NAME:-}" = "sammlerraum-ci-${GITHUB_RUN_ID}" && "${POSTGRES_DB:-}" = "sammlerraum_stack_${GITHUB_RUN_ID}_test" ]] || exit 64
: "${RUNNER_TEMP:?}" "${GITHUB_WORKSPACE:?}" "${SAMMLERRAUM_ENV_FILE:?}"
umask 077
compose=(docker compose -f docker-compose.prod.yml)
network="${COMPOSE_PROJECT_NAME}_default"
source_uploads="$SAMMLERRAUM_UPLOADS_VOLUME"
backup_volume="${COMPOSE_PROJECT_NAME}-recovery-backup"
restored_uploads="${COMPOSE_PROJECT_NAME}-recovery-uploads"
export RESTORE_SCRATCH_DATABASE="sammlerraum_recovered_${GITHUB_RUN_ID}_test"
export RESTORE_DATABASE_URL="${DATABASE_URL%/*}/${RESTORE_SCRATCH_DATABASE}"
proof_dir=.superpowers/sdd/2026-09-19-13-integration-hardening-release
mkdir -p "$proof_dir"
private_dir="$(mktemp -d "${RUNNER_TEMP}/sammlerraum-recovery-auth.XXXXXX")"
trap 'rm -rf "$private_dir"' EXIT
export RECOVERY_FIXTURE_PASSWORD=owned-only-recovery-fixture-passphrase
read -r owner collection item asset account < <(python3 - <<'PY'
import uuid
print(' '.join(str(uuid.uuid4()) for _ in range(5)))
PY
)
export RECOVERY_EMAIL="recovery-${owner}@example.test"
password_hash="$(pnpm --dir apps/web exec node --input-type=module -e 'import {hashPassword} from "better-auth/crypto";process.stdout.write(await hashPassword(process.env.RECOVERY_FIXTURE_PASSWORD));')"
"${compose[@]}" exec -T worker node - "$asset" > "$private_dir/media.json" <<'JS'
const sharp=require('sharp'),fs=require('node:fs/promises'),crypto=require('node:crypto');
(async()=>{
 const id=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(id))throw Error('owned fixture ID required');
 const image=sharp({create:{width:8,height:8,channels:3,background:'#4b7965'}});
 const original=await image.png().toBuffer();const variant=await sharp(original).webp().toBuffer();
 const assets=[];
 for(const [name,key,bytes] of [['original',`originals/${id}.png`,original],['thumbnail',`variants/${id}/thumbnail.webp`,variant]]){
  await fs.mkdir(require('node:path').dirname('/data/uploads/'+key),{recursive:true});
  await fs.writeFile('/data/uploads/'+key,bytes,{mode:0o600});
  assets.push({id,variant:name,key,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 process.stdout.write(JSON.stringify(assets));
})().catch(()=>{console.error('Owned recovery image fixture failed');process.exitCode=1;});
JS
read -r original_size original_hash variant_size variant_hash < <(python3 - "$private_dir/media.json" <<'PY'
import json,sys
v=json.load(open(sys.argv[1]));print(v[0]['bytes'],v[0]['sha256'],v[1]['bytes'],v[1]['sha256'])
PY
)
"${compose[@]}" exec -T db psql -U test -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -v owner="$owner" -v collection="$collection" -v item="$item" -v asset="$asset" -v account="$account" \
  -v email="$RECOVERY_EMAIL" -v password_hash="$password_hash" \
  -v original_size="$original_size" -v original_hash="$original_hash" -v variant_size="$variant_size" -v variant_hash="$variant_hash" -q >/dev/null <<'SQL'
BEGIN;
INSERT INTO "user" (id,name,email,"emailVerified","updatedAt") VALUES (:'owner','Owned recovery fixture',:'email',true,now());
INSERT INTO "account" (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES (:'account',:'owner','credential',:'owner',:'password_hash',now(),now());
INSERT INTO "Collection" (id,"ownerId",name,visibility,"updatedAt") VALUES (:'collection'::uuid,:'owner','Owned private recovery collection','PRIVATE',now());
INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,quantity,visibility,"privateNotes","updatedAt") VALUES (:'item'::uuid,:'owner',:'collection'::uuid,'Owned recovery original',1,'PRIVATE','Never public recovery witness',now());
INSERT INTO "MediaAsset" (id,"ownerId",kind,status,"storageKey","mimeType","byteSize","checksumSha256","originalFileName","updatedAt") VALUES (:'asset'::uuid,:'owner','IMAGE','READY','originals/'||:'asset'||'.png','image/png',:'original_size'::bigint,:'original_hash','owned.png',now());
INSERT INTO "MediaLink" (id,"assetId","ownerId","itemId",purpose,position) VALUES (gen_random_uuid(),:'asset'::uuid,:'owner',:'item'::uuid,'GALLERY',0);
INSERT INTO "MediaVariant" (id,"assetId",name,"storageKey","mimeType","byteSize","checksumSha256",width,height) VALUES (gen_random_uuid(),:'asset'::uuid,'THUMBNAIL','variants/'||:'asset'||'/thumbnail.webp','image/webp',:'variant_size'::bigint,:'variant_hash',8,8);
COMMIT;
SQL
unset password_hash
python3 - "$private_dir/login.json" <<'PY'
from pathlib import Path
import os,json,sys
Path(sys.argv[1]).write_text(json.dumps({'email':os.environ['RECOVERY_EMAIL'],'password':os.environ['RECOVERY_FIXTURE_PASSWORD']}))
PY
curl --silent --show-error --fail-with-body --max-time 20 \
  -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3349' \
  --data-binary "@$private_dir/login.json" --cookie-jar "$private_dir/cookies" \
  --output "$private_dir/login-response.json" http://127.0.0.1:3349/api/auth/sign-in/email
unset RECOVERY_FIXTURE_PASSWORD
python3 scripts/verify-restored-app.py --base-url http://127.0.0.1:3349 --cookie-jar "$private_dir/cookies" --assets "$private_dir/media.json" --receipt "$proof_dir/recovery-source-app.json"
# Quiesce both mutation/cleanup writers before the shared SQL/storage snapshot.
"${compose[@]}" stop web worker
for volume in "$backup_volume" "$restored_uploads"; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then echo 'Recovery fixture volume collision' >&2; exit 1; fi
  docker volume create --label sammlerraum.synthetic-ci="$GITHUB_RUN_ID" "$volume" >/dev/null
done
# Only the two empty, just-created scratch roots; never recursive ownership changes on existing data.
docker run --rm --user 0 -v "$backup_volume:/backup" -v "$restored_uploads:/restored" \
  --entrypoint sh sammlerraum-recovery-test -c 'chown 1000:1000 /backup /restored'
docker run --rm --user 1000:1000 --network "$network" -e DATABASE_URL \
  -v "$GITHUB_WORKSPACE:/workspace:ro" -v "$source_uploads:/uploads:ro" -v "$backup_volume:/backup" \
  --entrypoint python3 sammlerraum-recovery-test scripts/recovery.py backup /backup/snapshot --uploads /uploads
"${compose[@]}" exec -T db psql -U test -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"${RESTORE_SCRATCH_DATABASE}\" OWNER test"
docker run --rm --user 1000:1000 --network "$network" -e RESTORE_DATABASE_URL -e RESTORE_SCRATCH_DATABASE \
  -v "$GITHUB_WORKSPACE:/workspace:ro" -v "$backup_volume:/backup:ro" -v "$restored_uploads:/restored" \
  --entrypoint python3 sammlerraum-recovery-test scripts/recovery.py restore /backup/snapshot --uploads /restored
# Same reviewed image, preserved auth secret/origin/session and two restored resources. No dispatcher.
export DATABASE_URL="$RESTORE_DATABASE_URL" SAMMLERRAUM_UPLOADS_VOLUME="$restored_uploads"
python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['SAMMLERRAUM_ENV_FILE'])
p.write_text('\n'.join('DATABASE_URL='+os.environ['DATABASE_URL'] if line.startswith('DATABASE_URL=') else line for line in p.read_text().splitlines())+'\n')
PY
"${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 240 web
# Verify exact DB counts/references/bytes with the actual recovered web health before user activity.
docker run --rm --user 1000:1000 --network "$network" -e RESTORE_DATABASE_URL -e RESTORE_SCRATCH_DATABASE \
  -v "$GITHUB_WORKSPACE:/workspace:ro" -v "$backup_volume:/backup:ro" -v "$restored_uploads:/restored:ro" \
  --entrypoint python3 sammlerraum-recovery-test scripts/recovery.py verify /backup/snapshot --uploads /restored --health-url http://web:3000/api/health
python3 scripts/verify-restored-app.py --base-url http://127.0.0.1:3349 --cookie-jar "$private_dir/cookies" --assets "$private_dir/media.json" --receipt "$proof_dir/recovered-real-app.json"
echo 'PASS: real non-root web image reads authenticated restored original/variant bytes; anonymous clients denied'
# Outer drill stops containers normally. All source, backup and recovered volumes remain intact.
