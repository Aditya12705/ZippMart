#!/bin/sh
set -e

mkdir -p /app/services/api/uploads/products

# nginx on 7860 first so HF health checks pass while backends warm up
nginx -g 'daemon off;' &
NGINX_PID=$!

node /app/services/api/dist/index.js &
API_PID=$!

(cd /app/apps/customer-web && exec npx next start -p 3001 -H 127.0.0.1) &
CUSTOMER_PID=$!

(cd /app/apps/admin-web && exec npx next start -p 3002 -H 127.0.0.1) &
ADMIN_PID=$!

(cd /app/apps/cashier-web && exec npx next start -p 3003 -H 127.0.0.1) &
CASHIER_PID=$!

cleanup() {
  kill "$NGINX_PID" "$API_PID" "$CUSTOMER_PID" "$ADMIN_PID" "$CASHIER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait "$NGINX_PID"
