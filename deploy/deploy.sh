#!/usr/bin/env bash
# Redeploy app on the EC2 box. Run from the repo root as ubuntu.
set -euo pipefail

BRANCH="${1:-chore/aws-ec2-deploy}"
COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "==> Fetch / checkout ${BRANCH}"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Build app image"
"${COMPOSE[@]}" build app

echo "==> Ensure db + MinIO are up"
"${COMPOSE[@]}" up -d db minio
"${COMPOSE[@]}" up minio-init

echo "==> Run migrations"
"${COMPOSE[@]}" --profile migrate run --rm migrate

echo "==> Start / recreate app"
"${COMPOSE[@]}" up -d app --force-recreate

echo "==> Status"
"${COMPOSE[@]}" ps
curl -fsS -o /dev/null -w "app HTTP %{http_code}\n" http://127.0.0.1:3100/ || true
echo "Done."
