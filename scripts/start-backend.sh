#!/usr/bin/env bash
# Start the ORIGIN Asset360 backend API (Express + Postgres).
# Idempotent: safe for both @reboot and the */5 watchdog — exits early if already up.
set -u

DIR=/home/kali/projects/asset
LOG="$DIR/server/server.log"
PORT=3201
DB_CONTAINER=origin-asset360-db

# Already listening? nothing to do.
if ss -ltn 2>/dev/null | grep -q ":${PORT}\b"; then
  exit 0
fi

# Wait for the Postgres container to accept connections (up to ~60s after boot).
for _ in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -U asset360 -d origin_asset360 >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

cd "$DIR" || exit 1
echo "[start-backend $(date -Is)] launching backend on :${PORT}" >> "$LOG"
/usr/bin/npm run server >> "$LOG" 2>&1 &
