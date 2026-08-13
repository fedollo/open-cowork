#!/usr/bin/env bash
# Kill Open Loop API/UI processes and restart pnpm dev.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${PORT:-8787}"
WEB_PORT="${WEB_PORT:-5173}"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "→ killing port $port (PID: $pids)"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  else
    echo "→ port $port already free"
  fi
}

echo "Open Loop — restart"
echo "root: $ROOT"

kill_port "$API_PORT"
kill_port "$WEB_PORT"

pkill -9 -f "$ROOT/apps/api.*tsx watch" 2>/dev/null || true
pkill -9 -f "$ROOT/apps/web.*vite" 2>/dev/null || true

sleep 0.5
kill_port "$API_PORT"
kill_port "$WEB_PORT"

cd "$ROOT"
echo "→ pnpm dev"
exec pnpm dev
