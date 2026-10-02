# GrocerAI — grocery storefront, POS and back office

A grocery store system for a small Thai shop: customers order online (with a Gemini shopping assistant and
real PromptPay QR payment), staff sell at the counter with a POS, and managers run products, stock and reports.
Everything is stored in **SQL Server**.

## Features

**Storefront** (`/`, no login)
- Product catalog by category, search, promotions, live availability
- AI assistant "พี่ชำใจดี" (Gemini): answers about stock and promotions and adds items to the cart; simple product search when no API key is set
- Cart kept on the device; order with name + phone; stock is reserved for the order
- Order page with a **real PromptPay QR** (EMVCo, CRC-checked) and live status; unpaid orders expire and release stock

**Back office** (`/staff`, login required)

| Area | Cashier | Manager | Admin |
|---|:-:|:-:|:-:|
| Dashboard, POS (barcode/SKU scan, cash with change, PromptPay QR), receipts + 80 mm printing | ✔ | ✔ | ✔ |
| Online order queue: confirm payment / cancel | ✔ | ✔ | ✔ |
| Products, categories, stock in/adjust with full movement history | | ✔ | ✔ |
| Sales reports (daily, top products, categories, channels) + CSV export for Excel | | ✔ | ✔ |
| Users and roles, store settings (PromptPay, VAT, receipt), audit log | | | ✔ |

- First run: `/staff/setup` creates the first admin (no default passwords)
- Passwords hashed with scrypt; 5 wrong passwords lock the account for 15 minutes; sessions in `httpOnly` cookies
- Every change and every sign-in is written to the audit log
- Receipts: daily running numbers (`R260926-0001`), VAT extracted from VAT-inclusive prices

## Run on Windows

**Prerequisites:** Node.js 22+, SQL Server (Developer / Express) running locally, ODBC Driver 17 or 18 for SQL Server.

Double-click **`start.bat`**. It installs packages on the first run, builds, starts the server and opens
<http://localhost:3000/staff>. The storefront is at <http://localhost:3000>.

The database `GroceryAI` and all tables are created automatically (Windows login, no password).

## Run with Docker (any machine)

**Prerequisite:** Docker Desktop only (no Node.js, SQL Server or ODBC needed).

Double-click **`docker-start.bat`**. It creates `.env` (and a database password) on the first run, builds the app,
starts SQL Server and the web app, and opens <http://localhost:8080/staff>. Data is kept in the Docker volume `db-data`.

- Stop: `docker compose down` · delete all data: `docker compose down -v`
- Without Windows: `cp .env.example .env`, set `SA_PASSWORD`, then `docker compose up -d --build`
- Deploying online (Render + an external SQL Server such as Azure SQL): see [DEPLOY.md](DEPLOY.md)

## Configuration (`.env`)

| Key | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Web port |
| `HOST` | `127.0.0.1` | Address to listen on (`0.0.0.0` in Docker / Render) |
| `TRUST_PROXY` | `loopback` | Express `trust proxy` (`1` behind Render's proxy) |
| `COOKIE_SECURE` | — | `true` to mark the session cookie `Secure` (HTTPS deployments) |
| `SA_PASSWORD` | — | SQL Server password for `docker compose` |
| `MSSQL_CONNECTION_STRING` | `Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=GroceryAI;Trusted_Connection=yes;` | SQL Server database. A `Driver=...` string uses ODBC (Windows login); any other string uses a SQL login, e.g. `Server=host,1433;Database=GroceryAI;User Id=sa;Password={...};TrustServerCertificate=true;` |
| `GEMINI_API_KEY` | — | Enables the AI assistant |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model |
| `SESSION_HOURS` | `12` | Staff session length (sliding) |

Store name, address, tax id, PromptPay number, VAT rate and order hold time are set in **ตั้งค่าร้าน** (admin).

## Project structure

```
shared/src/        zod request schemas, API types, money helpers (used by server and client)
server/src/
  app.ts           express app (helmet, sessions, origin check, routes, error handler)
  index.ts         start: config, database + migrations, background jobs, listen
  config.ts        environment (validated)
  db/              connection pool + transactions (msnodesqlv8), SQL migrations
  middleware/      auth (session → req.user, requireRole), http helpers
  modules/         auth, users, settings, catalog, inventory, sales (POS/receipts),
                   orders (online), reports, chat (Gemini), audit
  lib/             password (scrypt), audit, PromptPay payload + QR, time (Bangkok days)
server/tests/      integration tests against a throwaway GroceryAI_Test database
client/src/
  app/router.tsx   routes (public shop, staff area with role guards)
  layouts/         PublicLayout, StaffLayout (sidebar by role)
  pages/           shop/* and staff/* pages
  features/        auth, cart, receipt view
  components/ui/   small UI kit (Tailwind 4 tokens in index.css)
```

## Development

```bash
npm install
npm run dev              # API on :3000 (tsx watch)
npm run dev -w client    # UI on :5173 (proxies /api to :3000)
npm test                 # server integration tests (needs local SQL Server)
npm run lint             # TypeScript strict checks for shared, server, client
npm run build            # client/dist + server/dist
```
