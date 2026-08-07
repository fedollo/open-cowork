#!/usr/bin/env bash
# Stop Open Cowork API/UI without restarting.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${PORT:-8787}"
WEB_PORT="${WEB_PORT:-5173}"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "→ kill porta $port (PID: $pids)"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  else
    echo "→ porta $port già libera"
  fi
}

echo "Open Cowork — stop"
kill_port "$API_PORT"
kill_port "$WEB_PORT"
pkill -9 -f "$ROOT/apps/api.*tsx watch" 2>/dev/null || true
pkill -9 -f "$ROOT/apps/web.*vite" 2>/dev/null || true
sleep 0.3
kill_port "$API_PORT"
kill_port "$WEB_PORT"
echo "fatto"
