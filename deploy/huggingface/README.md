---
title: ZippMart
emoji: 🛒
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# ZippMart — Self-checkout demo

Customer self-checkout shop backed by the ZippMart Express API and Supabase Postgres.

Open **/shop** after the Space finishes building.

## Required secrets

Set these in **Settings → Repository secrets** (or Space variables):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase pooler URI (port 6543) |
| `JWT_SECRET` | Long random string |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Staff login for admin (if deployed separately) |
| `MANAGER_USERNAME` / `MANAGER_PASSWORD` | Manager login |
| `PUBLIC_API_URL` | `https://adi576-zippmart.hf.space/checkout-api` |

Optional: `DEFAULT_STORE_CODE` (default `BLR001`), `CASHIER_API_KEY`, Razorpay / email webhooks.

## Stack

- **Frontend:** Next.js customer shop on port 7860
- **API:** Express on internal port 4000, proxied at `/checkout-api`
- **Database:** Supabase Postgres (run `supabase/migrations/20260513180000_checkout_mvp.sql` once)
