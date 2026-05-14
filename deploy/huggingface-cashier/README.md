---
title: Zippmart Cashier
emoji: 🧾
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# ZippMart Cashier Terminal

In-store cashier terminal for order lookup and counter settlement.

Uses the API on the main ZippMart Space: `https://adi576-zippmart.hf.space/checkout-api`

## Optional secrets

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CASHIER_API_KEY` | Must match `CASHIER_API_KEY` on the main API if cashier routes are protected |

Set `NEXT_PUBLIC_API_BASE_URL` only if you host the API elsewhere.
