#!/usr/bin/env bash
# Starts the full CEVI stack WITHOUT Docker (lightweight, ~1 GB RAM total):
#   MySQL (:3307)  ->  ML service (:8001)  ->  API (:4000)  ->  Web (:5173)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/.local"; mkdir -p "$LOG"

up() { curl -fsS -o /dev/null --max-time 2 "$1" 2>/dev/null; }
wait_for() { # url name seconds
  for _ in $(seq 1 "$3"); do up "$1" && { echo "  ✓ $2"; return 0; }; sleep 1; done
  echo "  ✗ $2 did not become ready (see $LOG)"; return 1
}

echo "Starting CEVI…"
"$ROOT/scripts/db-start.sh" | sed 's/^/  /'

if ! up http://127.0.0.1:8001/health; then
  (cd "$ROOT/ml-service" && nohup ./run.sh >"$LOG/ml.log" 2>&1 &)
fi
wait_for http://127.0.0.1:8001/health "ML service  http://127.0.0.1:8001" 90

if ! up http://127.0.0.1:4000/api/health; then
  (cd "$ROOT/backend" && npx prisma migrate deploy >"$LOG/migrate.log" 2>&1; nohup npx tsx src/server.ts >"$LOG/api.log" 2>&1 &)
fi
wait_for http://127.0.0.1:4000/api/health "API         http://localhost:4000" 40

if ! up http://127.0.0.1:5173/; then
  (cd "$ROOT/frontend" && nohup npx vite --host 127.0.0.1 >"$LOG/web.log" 2>&1 &)
fi
wait_for http://127.0.0.1:5173/ "Web         http://localhost:5173" 30
echo "Done. Demo logins: clinician@cevi.demo / researcher@cevi.demo / admin@cevi.demo  (password CeviDemo2026!)"
