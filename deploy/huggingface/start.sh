#!/bin/sh
set -e

mkdir -p /app/services/api/uploads/products

node /app/services/api/dist/index.js &
API_PID=$!

cd /app/apps/customer-web && npx next start -p 3001 &
CUSTOMER_PID=$!

cd /app/apps/admin-web && npx next start -p 3002 &
ADMIN_PID=$!

cd /app/apps/cashier-web && npx next start -p 3003 &
CASHIER_PID=$!

cleanup() {
  kill "$API_PID" "$CUSTOMER_PID" "$ADMIN_PID" "$CASHIER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for i in $(seq 1 60); do
  if wget -q -O - http://127.0.0.1:4000/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for i in $(seq 1 60); do
  if wget -q -O - http://127.0.0.1:3001/ >/dev/null 2>&1 \
    && wget -q -O - http://127.0.0.1:3002/admin >/dev/null 2>&1 \
    && wget -q -O - http://127.0.0.1:3003/cashier/ >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

exec nginx -g 'daemon off;'
