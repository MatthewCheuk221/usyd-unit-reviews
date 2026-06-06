# USYD Computing Unit Reviews

A review platform for University of Sydney computing units, with anonymous review posting and AI summaries.

## Highlights

- Browse units by category:
  - Undergraduate units (1000, 2000, 3000, 4000 level)
  - Postgraduate units (5000, 6000, 9000 level)
- Submit anonymous reviews (no account required) with:
  - Title, coordinator, lecturer, year taken
  - Grade (H, D, C, P, F)
  - Ratings: content, workload, exam difficulty, final result
  - Free-text review content
- AI summary generated from review content when a unit has more than one review
- Built-in moderation flow:
  - Report review (public)
  - Admin API to list reported reviews and hide/unhide them

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- SQLite via `better-sqlite3`
- Ollama (local model inference) for AI summaries

## Quick Start

1) Install dependencies

```bash
npm install
```

2) Configure environment

```bash
cp .env.example .env
```

3) Start development server

```bash
npm run dev
```

4) Open:

- `http://127.0.0.1:3000`

## Required Environment Variables

Use `.env` (or your deployment secret manager) to set:

- `RATE_LIMIT_COOKIE_SECRET`
  - Secret used to sign anonymous session/device cookies.
  - Generate with: `openssl rand -hex 32`
- `ALLOWED_ORIGINS`
  - Comma-separated allowed hosts for POST origin checks.
  - Example: `ALLOWED_ORIGINS=yourdomain.com,www.yourdomain.com`
- `ADMIN_REVIEW_TOKEN`
  - Bearer token required for moderation APIs.
  - Generate with: `openssl rand -hex 32`
- `TRUSTED_PROXY_COUNT`
  - Number of trusted reverse proxies in front of app.
  - Set `0` for direct local/dev use.

### AI Summary Variables

- `OLLAMA_BASE_URL` (default: `http://127.0.0.1:11434`)
- `OLLAMA_MODEL` (example: `llama3.2:3b`)

If Ollama is unavailable, the app falls back to a local summarizer.

## AI Setup (Ollama)

Install and run Ollama, then pull a model:

```bash
ollama pull llama3.2:3b
ollama serve
```

## Security Notes

The project includes multiple hardening controls:

- Strict input validation and sanitization for all review/report payloads
- Origin/host validation for state-changing endpoints
- Signed session/device cookies for abuse controls
- Persistent, SQLite-backed rate limiting with maintenance and caps
- CSP and additional browser hardening headers via `src/proxy.ts`
- Admin token verification using constant-time comparison
- Report deduplication and per-review report flood control

Anonymous review posting is intentionally allowed by product design.

## Admin Moderation APIs

Require header:

```http
Authorization: Bearer <ADMIN_REVIEW_TOKEN>
```

Endpoints:

- `GET /api/admin/reviews/reported?limit=100`
- `POST /api/admin/reviews/hide`
  - Body: `{ "reviewId": "<uuid>", "hidden": true|false }`

## Build and Run

```bash
npm run build
npm start
```

## Data Files

- `data/units.json`: unit catalog
- `data/reviews.db`: SQLite database (created automatically)

For git hygiene, keep local DB and real env files out of source control.
