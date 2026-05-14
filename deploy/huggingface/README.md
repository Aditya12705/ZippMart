---
title: ZippMart
emoji: 🛒
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
health_check: /health
pinned: false
---

# ZippMart — Full checkout platform

All apps run in one Docker Space behind nginx on port **7860**.

| App | URL |
|-----|-----|
| Customer shop | [/shop](https://adi576-zippmart.hf.space/shop) |
| Admin HQ | [/admin](https://adi576-zippmart.hf.space/admin) |
| Cashier terminal | [/cashier](https://adi576-zippmart.hf.space/cashier) |
| API (proxied) | `/checkout-api` |

## Required secrets

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase pooler URI (port 6543) |
| `JWT_SECRET` | Long random string |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Staff login |
| `MANAGER_USERNAME` / `MANAGER_PASSWORD` | Manager login |
| `PUBLIC_API_URL` | `https://adi576-zippmart.hf.space/checkout-api` |

Optional: `DEFAULT_STORE_CODE`, `CASHIER_API_KEY` (+ same value as `NEXT_PUBLIC_CASHIER_API_KEY` at build if you protect cashier routes).

## Stack

- **nginx** on 7860 routes traffic to three Next.js apps + Express API
- **Database:** Supabase Postgres
