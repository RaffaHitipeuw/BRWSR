#!/usr/bin/env bash
# Convenience script for Mac/Linux/WSL. On plain Windows (PowerShell),
# just run the commands in README.md manually — they're the same steps.
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Starting Postgres (docker compose)"
(cd "$ROOT_DIR/infra/docker" && docker compose up -d)

echo "==> Waiting for Postgres to be healthy..."
until docker exec eduos-postgres pg_isready -U eduos -d eduos >/dev/null 2>&1; do
  sleep 1
done

echo "==> Postgres is up. Starting the auth service on :8080"
echo "    (open a second terminal and run: npm run dev:dashboard)"
(cd "$ROOT_DIR/services/auth" && go run main.go)
