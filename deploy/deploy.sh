#!/usr/bin/env bash
# Redeploy app on the EC2 box. Run from the repo root as ubuntu.
set -euo pipefail

BRANCH="${1:-refactor/database-queries-and-schemas}"
COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "==> Fetch / checkout ${BRANCH}"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Build app image"
"${COMPOSE[@]}" build app

echo "==> Ensure db is up"
"${COMPOSE[@]}" up -d db

echo "==> Run migrations"
"${COMPOSE[@]}" --profile migrate run --rm migrate

echo "==> Start / recreate app"
"${COMPOSE[@]}" up -d app

echo "==> Status"
"${COMPOSE[@]}" ps
curl -fsS -o /dev/null -w "app HTTP %{http_code}\n" http://127.0.0.1:3100/ || true
echo "Done."
