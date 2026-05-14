#!/bin/sh
set -e

mkdir -p /app/services/api/uploads/products

node /app/services/api/dist/index.js &
API_PID=$!

cleanup() {
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for API health before serving the shop
for i in $(seq 1 30); do
  if wget -q -O - http://127.0.0.1:4000/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

cd /app/apps/customer-web
exec npx next start -p 7860
