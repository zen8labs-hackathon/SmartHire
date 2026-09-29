#!/usr/bin/env bash
# Drop BuildKit cache older than 7 days on the shared EC2 disk.
# Develop and production use one Docker daemon.
# Does not remove containers, volumes, or images in use.
set -u

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found, skip build cache prune"
  exit 0
fi

echo "==> Prune Docker build cache older than 7 days"
docker builder prune -af --filter until=168h || echo "WARN: build cache prune failed"
