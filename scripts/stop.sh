#!/usr/bin/env bash
# Stops the CEVI processes started by start.sh (only ports 5173, 4000, 8001 and the local MySQL on 3307).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for port in 5173 4000 8001; do
  pid=$(lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null) && [ -n "$pid" ] && kill $pid && echo "stopped :$port"
done
"$ROOT/scripts/db-stop.sh"
