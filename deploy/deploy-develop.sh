#!/usr/bin/env bash
# Redeploy develop stack on the EC2 box. Run from /opt/smarthire/app-develop as ubuntu.
set -euo pipefail

BRANCH="${1:-develop}"
COMPOSE=(docker compose -f docker-compose.develop.yml)

echo "==> Fetch / checkout ${BRANCH}"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Build app + worker images"
"${COMPOSE[@]}" build app worker

echo "==> Ensure db + MinIO are up"
"${COMPOSE[@]}" up -d db minio
"${COMPOSE[@]}" up minio-init

echo "==> Run migrations"
"${COMPOSE[@]}" --profile migrate run --rm migrate

echo "==> Ensure Redis is up (BullMQ)"
"${COMPOSE[@]}" up -d redis

echo "==> Start / recreate app + worker"
"${COMPOSE[@]}" up -d app worker --force-recreate

echo "==> Status"
"${COMPOSE[@]}" ps
curl -fsS -o /dev/null -w "app HTTP %{http_code}\n" http://127.0.0.1:3200/ || true
echo "Done."
