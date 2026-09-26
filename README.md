# GrocerAI — Ai-Agent-Store

Store management system with a Gemini AI assistant for a Thai grocery shop.
React + TypeScript frontend, Express backend, **SQL Server** database.

## Features

- Customer store with cart, cash and QR / PromptPay checkout
  (QR orders deduct stock only after payment is confirmed)
- AI assistant (Gemini) that recommends products and promotions
- Admin panel (password protected): products, stock, sales, low-stock alerts

## Run on Windows

**Prerequisites:** Node.js 22.5+, SQL Server (Developer / Express, running locally), ODBC Driver 17 or 18 for SQL Server.

Double-click **`start.bat`**. On first run it creates `.env` from `.env.example` (set `GEMINI_API_KEY` and
`ADMIN_PASSWORD`), installs packages, builds, and opens <http://localhost:3000>.

Manual: `npm install`, `npm run build`, `npm start` (or `npm run dev` for hot reload).

## Database

| Setting | Default |
|---|---|
| `MSSQL_CONNECTION_STRING` | `Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=GroceryAI;Trusted_Connection=yes;` |

- On start the server creates the `GroceryAI` database and its tables if they do not exist (Windows login, no password).
- First start with an empty database: imports the old `data/*.json` files if present; otherwise the store starts empty (add products in the Admin Panel). Set `SEED_DEMO_DATA=true` to insert 10 demo products instead.
- Tables: `Products`, `Sales` + `SaleItems`, `PendingCheckouts` + `PendingCheckoutItems`, `StockAlerts`.
- Stock deduction and the sale record are written in one transaction; stock can never go below zero.
- Code: `server/db.ts` (connection), `server/store.ts` (schema and queries).

## API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/products` | — | List products |
| POST | `/api/products` | admin | Create or update a product |
| DELETE | `/api/products/:id` | admin | Delete a product |
| GET | `/api/sales` | — | Sales history with line items |
| POST | `/api/checkout` | — | Cash: complete sale. QR: create pending order |
| POST | `/api/checkout/confirm` | — | Confirm a pending QR order |
| POST | `/api/checkout/cancel` | — | Cancel a pending QR order |
| GET | `/api/alerts` | — | Low-stock alerts |
| POST | `/api/alerts/resolve` | admin | Mark an alert resolved |
| POST | `/api/admin/verify` | admin | Check the admin password |
| POST | `/api/chat` | — | AI assistant |

Admin routes need the `x-admin-password` header matching `ADMIN_PASSWORD`.

## Tests

```bash
npm test
```

Runs against a throwaway `GroceryAI_Test` database on the local SQL Server
(override with `MSSQL_TEST_CONNECTION_STRING`).
