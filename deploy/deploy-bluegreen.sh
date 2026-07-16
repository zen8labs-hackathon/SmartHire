#!/usr/bin/env bash
# Blue-green deploy: build on idle slot, health-check, switch nginx upstream, stop old slot.
set -euo pipefail

BRANCH="${1:-chore/aws-ec2-deploy}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose -f docker-compose.prod.yml -f docker-compose.bluegreen.yml)
STATE_FILE="deploy/.active-slot"
UPSTREAM_DIR="deploy/nginx/upstreams"
ACTIVE_LINK="deploy/nginx/active-app-upstream.conf"

active_slot() {
  if [ -f "$STATE_FILE" ]; then
    cat "$STATE_FILE"
  else
    echo blue
  fi
}

echo "==> Fetch / checkout ${BRANCH}"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Build app image"
"${COMPOSE[@]}" build app_blue

echo "==> Ensure db + MinIO are up"
"${COMPOSE[@]}" up -d db minio
"${COMPOSE[@]}" up minio-init

echo "==> Run migrations"
"${COMPOSE[@]}" --profile migrate run --rm migrate

ACTIVE="$(active_slot)"
if [ "$ACTIVE" = blue ]; then
  TARGET=green
  TARGET_SERVICE=app_green
  TARGET_PORT=3101
  OLD_SERVICE=app_blue
  UPSTREAM_FILE="${UPSTREAM_DIR}/app-green.conf"
else
  TARGET=blue
  TARGET_SERVICE=app_blue
  TARGET_PORT=3100
  OLD_SERVICE=app_green
  UPSTREAM_FILE="${UPSTREAM_DIR}/app-blue.conf"
fi

echo "==> Active slot: ${ACTIVE} → deploying to ${TARGET} (:${TARGET_PORT})"
"${COMPOSE[@]}" up -d --no-deps "${TARGET_SERVICE}"

echo "==> Health check ${TARGET} on 127.0.0.1:${TARGET_PORT}"
for i in $(seq 1 30); do
  code="$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${TARGET_PORT}/" || true)"
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ]; then
    echo "    OK (HTTP ${code})"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "    FAIL: slot ${TARGET} did not become healthy (last HTTP ${code})"
    exit 1
  fi
  sleep 2
done

echo "==> Switch nginx upstream to ${TARGET}"
ln -sf "upstreams/$(basename "$UPSTREAM_FILE")" "$ACTIVE_LINK"
sudo nginx -t
sudo systemctl reload nginx
echo "$TARGET" > "$STATE_FILE"

echo "==> Stop previous slot (${OLD_SERVICE})"
"${COMPOSE[@]}" stop "${OLD_SERVICE}" || true

echo "==> Status"
"${COMPOSE[@]}" ps
echo "Active slot: $(cat "$STATE_FILE")"
echo "Done."
