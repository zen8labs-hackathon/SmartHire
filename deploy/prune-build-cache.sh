#!/usr/bin/env bash
# Drop old BuildKit cache on the shared EC2 disk. Develop and production use one Docker daemon.
# Keeps the newest 10GB so the next deploy can still reuse layers.
# Does not remove containers, volumes, or images in use.
set -u

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found, skip build cache prune"
  exit 0
fi

echo "==> Prune Docker build cache (keep 10GB)"
help="$(docker builder prune --help 2>&1 || true)"
if grep -q -- '--keep-storage' <<<"$help"; then
  docker builder prune -af --keep-storage 10GB || echo "WARN: build cache prune failed"
else
  docker builder prune -af --filter until=72h || echo "WARN: build cache prune failed"
fi
