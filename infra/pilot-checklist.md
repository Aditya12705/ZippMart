# Pilot Rollout Checklist

## Security
- Rotate `JWT_SECRET` and `RAZORPAY_WEBHOOK_SECRET`.
- Enforce HTTPS at ingress and set CORS allowlist.
- Restrict admin routes behind staff auth proxy.

## Reliability
- Run Postgres and Redis with persistence.
- Configure worker process auto-restart.
- Enable receipt retry policy and dead-letter handling.

## Store Operations
- Train cashier on counter token flow.
- Train gate staff on exit QR scanning behavior.
- Document fallback flow for payment webhook delays.

## Monitoring
- Track checkout success, payment reconciliation, gate rejection rate.
- Alert on API 5xx above threshold.
- Alert on stuck queue jobs older than 5 minutes.
