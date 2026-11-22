# Split Mess

**Mobile-first PWA expense ledger & settlement engine for shared flats and communal dining messes.**

Built around **UAE Dirhams (AED / Fils)**, Split Mess replaces error-prone spreadsheets and generic bill-splitting apps with isolated **Expense Pools**, strict **zero-float integer Fils arithmetic**, instant **out-of-pocket credit offsets**, and automated **monthly billing cycle rollovers**.

---

## Core Features

- **Multi-Pool Expense Splitting:** Every expense belongs to a discrete pool — **Mess & Groceries (`MESS`)**, **Cooking Gas (`GAS`)**, **Drinking Water (`WATER`)**, or **Flat Maintenance (`MAINTENANCE`)** — and is split exclusively among active members enrolled in that pool.
- **Role-Based Participation:** Supports **Room Admins**, **Full Resident Members**, **Utility-Only Residents** (excluded from mess groceries), and **External Utility Members** (e.g., neighbors sharing only drinking water).
- **Zero-Float Integer Arithmetic (Fils Precision):** All amounts are stored and calculated as integer **Fils** (`1 AED = 100 Fils`) with deterministic remainder distribution so member shares always sum to the exact expense total without rounding drift.
- **Instant Out-of-Pocket Offsets:** Paying a vendor out of pocket immediately credits the payer's net position (`Opening Balance + Out-of-Pocket Paid − Pool Obligation`), showing live Credit/Debit status on the dashboard.
- **Monthly Billing Cycles & Rollovers:** Admins can audit the settlement matrix, close a billing cycle, snapshot final balances, and automatically carry over unpaid debits or overpaid credits as opening balances into the next cycle.
- **Receipt & Avatar Uploads:** Mobile camera capture (`<input capture="environment">`) and image uploads with 5MB size gating, magic-byte file verification, UUID filenames, authenticated receipt serving, and full-screen lightbox preview.
- **Mobile-First PWA Experience:** Designed for `375px–430px` viewports with a branded launch splash loader, thumb-friendly bottom navigation, 4-digit PIN keypad login, offline status indicator, and installable PWA manifest.

---

## Security Architecture

- **4-Digit PIN + HttpOnly JWT Sessions:** PINs are hashed with `bcryptjs`; sessions use `HS256` JWTs in `HttpOnly`, `SameSite` cookies validated against active database users on every request.
- **Brute-Force & Abuse Protection:** Multi-layer `express-rate-limit` rules (general API, IPv6-safe per-IP + per-account login lockouts, and strict auth mutation limits).
- **Defense-in-Depth Headers & Validation:** Strict CSP, `X-Frame-Options: DENY`, `nosniff`, sandboxed upload serving, `zod` input validation, and 100KB request body limits.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Vite PWA Plugin |
| **Backend** | Node.js, Express, TypeScript, Zod, Multer, bcryptjs, jsonwebtoken, express-rate-limit |
| **Database** | PostgreSQL 16 (`pg` pool + Docker Compose) with automatic persistent embedded PostgreSQL (**PGlite**) fallback |

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and update values as needed:
```bash
cp .env.example .env
```

*(Optional)* Start PostgreSQL 16 via Docker Compose — if PostgreSQL isn't running locally, the server automatically falls back to persistent embedded **PGlite** storage in `server/data/pgdata`:
```bash
docker compose up -d
```

### 3. Run in Development
Start the API server (`http://localhost:4000`) and Vite client (`http://localhost:5173`) in separate terminals:
```bash
npm run server:dev
npm run client:dev
```

### 4. Production Build
```bash
npm run build
npm start
```

---

## Project Structure

```text
split-mess/
├── client/          # React 19 + Tailwind CSS mobile-first PWA
├── server/          # Express + TypeScript REST API & settlement engine
├── docs/            # PRD, Architecture, Database, Security & Design System docs
├── uploads/         # Local receipt & avatar storage (gitignored)
├── docker-compose.yml
└── .env.example
```

For full technical documentation, see the [`docs/`](./docs) directory.
