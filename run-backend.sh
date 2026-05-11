#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDS=()

start_service() {
  local name="$1"
  local service_dir="$2"
  shift 2

  echo "Starting ${name}..."
  (
    cd "$service_dir"
    exec "$@"
  ) &
  PIDS+=("$!")
}

cleanup() {
  if ((${#PIDS[@]} == 0)); then
    return
  fi

  echo
  echo "Stopping services..."

  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done

  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

start_service "auth-service" "$ROOT_DIR/services/auth-service" php artisan serve --host=127.0.0.1 --port=8001
start_service "form-service" "$ROOT_DIR/services/form-service" php artisan serve --host=127.0.0.1 --port=8002
start_service "document-service" "$ROOT_DIR/services/document-service" php artisan serve --host=127.0.0.1 --port=8003
start_service "frontend-web" "$ROOT_DIR/frontend/web" npm run dev -- --host 127.0.0.1 --port 5173

echo "All services are running."
echo "- Auth: http://127.0.0.1:8001"
echo "- Form: http://127.0.0.1:8002"
echo "- Document: http://127.0.0.1:8003"
echo "- Frontend: http://127.0.0.1:5173"

wait
