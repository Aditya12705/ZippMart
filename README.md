# SeamLine Checkout System

Monorepo for a self-checkout apparel & merchandising platform: customer shop, admin dashboard, cashier terminal, Express API, and optional background worker.

| App | Local URL | Purpose |
|-----|-----------|---------|
| Customer shop | http://localhost:3001 | Scan, browse, bag, checkout |
| Admin HQ | http://localhost:3002 | Products, stock, discounts, orders |
| Cashier | http://localhost:3003 | Counter lookup & settle |
| API | http://localhost:4000 | Sessions, cart, orders, uploads |

## Repository layout

```
apps/
  customer-web/     Next.js — customer self-checkout
  admin-web/        Next.js — staff / manager dashboard
  cashier-web/      Next.js — in-store cashier terminal
services/
  api/              Express + Postgres (Supabase)
  worker/           Optional BullMQ jobs (Redis)
packages/
  shared/           Zod schemas shared with the API
supabase/
  migrations/       SQL schema — run once in Supabase
```

## Prerequisites

- **Node.js 20+**
- **Supabase** project (Postgres) — or any Postgres with the migration applied
- **Redis** (optional) — only for the background worker

## Local development

### 1. Install

```bash
git clone <your-repo-url>
cd checkout-system
npm install
```

### 2. Database

1. Create a [Supabase](https://supabase.com) project.
2. Open **SQL Editor** and run migrations in order:
   - `supabase/migrations/20260513180000_checkout_mvp.sql`
   - `supabase/migrations/20260528120000_stock_ledger_reservations.sql`
   - `supabase/migrations/20260615120000_apparel_catalog.sql`
3. Copy the **pooler** connection string (Settings → Database → Connection string, URI mode, port **6543**). URL-encode special characters in the password (`@` → `%40`).

### 3. API environment

```bash
npm run setup:api
```

Edit `services/api/.env`:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Supabase pooler URI |
| `JWT_SECRET` | Yes (prod) | Long random string |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Prod | Staff login |
| `MANAGER_USERNAME` / `MANAGER_PASSWORD` | Prod | Manager login |
| `PUBLIC_API_URL` | Prod | Public API origin (for image URLs) |
| `CASHIER_API_KEY` | Optional | Protects cashier routes |
| `REDIS_URL` | Optional | Worker only |

### 4. Frontend environment (optional locally)

Defaults to `http://localhost:4000`. To override:

```bash
cp apps/customer-web/.env.example apps/customer-web/.env.local
cp apps/admin-web/.env.example apps/admin-web/.env.local
cp apps/cashier-web/.env.example apps/cashier-web/.env.local
```

### 5. Run everything

```bash
npm run dev
```

Or individual services:

```bash
npm run dev:api
npm run dev:customer
npm run dev:admin
npm run dev:cashier
```

### Admin login (dev defaults)

- Open http://localhost:3002/admin
- **Staff:** `admin` / `admin123` (override via API `.env`)
- **Manager:** `manager` / `manager123` — void, refund, audit, CSV export

## Git — first push

The repo is ready to initialize and push. **Never commit** real `.env` files (they are gitignored).

```bash
git init
git add .
git status   # confirm no .env or node_modules
git commit -m "Initial commit: SeamLine checkout monorepo"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## Production deployment overview

| Component | Recommended host | Why |
|-----------|------------------|-----|
| `customer-web` | **Vercel** | Next.js |
| `admin-web` | **Vercel** | Next.js |
| `cashier-web` | **Vercel** | Next.js |
| `api` | **Render / Railway / Fly.io** | Long-running Express, Postgres, local file uploads |
| Postgres | **Supabase** | Managed Postgres |
| `worker` | Optional (Render/Railway + Redis) | Receipt queues; API runs fine without it |

The API is **not** a good fit for Vercel serverless (persistent Express process, `uploads/` on disk). Deploy it as a Node web service.

### Deploy the API (Render example)

1. Push this repo to GitHub.
2. [Render](https://render.com) → **New Blueprint** → connect repo (uses root `render.yaml`), or create a **Web Service** manually:
   - **Root directory:** `services/api`
   - **Build:** `cd ../.. && npm ci && npm run build -w @checkout/shared && npm run build -w api`
   - **Start:** `cd ../.. && npm run start -w api`
   - **Health check path:** `/health`
3. Set environment variables from `services/api/.env.example` (use real secrets).
4. Set `PUBLIC_API_URL` to your Render URL (e.g. `https://seamline-api.onrender.com`).
5. Note: free-tier disks are ephemeral — product image uploads may not persist across restarts. For production, move uploads to Supabase Storage or S3.

### Deploy frontends on Vercel (three projects)

Create **one Vercel project per app**, all linked to the **same** GitHub repo.

#### Customer shop

| Setting | Value |
|---------|-------|
| Root Directory | `apps/customer-web` |
| Framework | Next.js |
| Build Command | `npm run build -w customer-web` (or use included `vercel.json`) |
| Install Command | `npm install` (runs from monorepo root) |

**Environment variables:**

```
NEXT_PUBLIC_API_BASE_URL=https://your-api.onrender.com
```

#### Admin dashboard

| Setting | Value |
|---------|-------|
| Root Directory | `apps/admin-web` |

```
NEXT_PUBLIC_API_BASE_URL=https://your-api.onrender.com
```

#### Cashier terminal

| Setting | Value |
|---------|-------|
| Root Directory | `apps/cashier-web` |

```
NEXT_PUBLIC_API_BASE_URL=https://your-api.onrender.com
NEXT_PUBLIC_CASHIER_API_KEY=<same as API CASHIER_API_KEY>
```

In each Vercel project, enable **Include source files outside of the Root Directory** so workspace dependencies resolve from the repo root.

After deploy, open the customer Vercel URL at `/shop`.

### CORS

The API uses `cors()` with default open settings. For stricter production, restrict origins in `services/api/src/index.ts` to your Vercel domains.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API + worker + all three web apps |
| `npm run setup:api` | Copy `services/api/.env.example` → `.env` |
| `npm run build` | Build all workspaces |
| `npm run test` | Run workspace tests |

## Features

- **Customer:** barcode scan, search, cart, checkout, visit recovery by phone, offline cart queue
- **Admin:** product CRUD, image upload, stock adjust, discounts, metrics, order management
- **Cashier:** order lookup by ID / counter token, settle at counter
- **API:** JWT admin auth, Razorpay webhook hook, receipt / low-stock webhooks
