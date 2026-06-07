# USYD Computing Unit Reviews

A review platform for University of Sydney computing units, with anonymous review posting and AI summaries.

Live demo: [https://usyd-unit-reviews.vercel.app](https://usyd-unit-reviews.vercel.app)

## Highlights

- Browse units by category:
  - Undergraduate units (1000, 2000, 3000, 4000 level) — `/units/undergraduate`
  - Postgraduate units (5000, 6000, 9000 level) — `/units/postgraduate`
  - Legacy URL `/units/level5plus` redirects to `/units/postgraduate`
- Submit anonymous reviews (no account required) with:
  - Title, coordinator, lecturer, tutor (optional), year taken
  - Grade (H, D, C, P, F)
  - Star ratings (1–5): Unit Content, Overall Workload, Exam Difficulty, Final Result
  - Free-text review content
  - Google reCAPTCHA v2 verification (when configured)
- AI summary generated from review content when a unit has more than one review
- Built-in moderation flow:
  - Report review (public, one report per device per review)
  - Admin API to list reported reviews and hide/unhide them

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- Turso (libSQL) via `@libsql/client` for persistent storage on Vercel
- Ollama Cloud (`https://ollama.com`) for production AI summaries; local Ollama optional for dev
- Google reCAPTCHA v2 for review-submission bot protection

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env
```

3. Start development server

```bash
npm run dev
```

4. Open:

- `http://127.0.0.1:3000`

Locally, if `TURSO_DATABASE_URL` is not set, reviews are stored in `data/reviews.db` automatically.

## Required Environment Variables

Use `.env` locally or your deployment secret manager (e.g. Vercel) to set:

### Database (required on Vercel)

- `TURSO_DATABASE_URL` — libSQL database URL from [Turso](https://turso.tech)
- `TURSO_AUTH_TOKEN` — auth token for the Turso database

### Security

- `RATE_LIMIT_COOKIE_SECRET`
  - Secret used to sign anonymous session/device cookies.
  - Generate with: `openssl rand -hex 32`
- `ALLOWED_ORIGINS`
  - Comma-separated allowed hosts for POST origin checks.
  - Example: `ALLOWED_ORIGINS=yourdomain.com,www.yourdomain.com`
  - On Vercel, `*.vercel.app` hosts are auto-allowed via `VERCEL_URL` — only needed for custom domains.
- `ADMIN_REVIEW_TOKEN`
  - Bearer token required for moderation APIs.
  - Generate with: `openssl rand -hex 32`
- `TRUSTED_PROXY_COUNT`
  - Number of trusted reverse proxies in front of app.
  - Set `0` for direct local/dev use.
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` (recommended for production)
  - Google reCAPTCHA keys for review submission.
  - Create at [google.com/recaptcha/admin/create](https://www.google.com/recaptcha/admin/create) — use **reCAPTCHA v2 "I'm not a robot" Checkbox**.
  - Add your production domain, `*.vercel.app` (if using Vercel previews), and `localhost` for local dev.
  - `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is public (browser widget).
  - `RECAPTCHA_SECRET_KEY` is private (server verification only).
  - If unset, CAPTCHA is skipped (convenient for local development).

### AI Summary Variables

- `OLLAMA_BASE_URL` — `https://ollama.com` for production; `http://127.0.0.1:11434` for local dev
- `OLLAMA_API_KEY` — API key from [ollama.com/settings/keys](https://ollama.com/settings/keys) (required on Vercel)
- `OLLAMA_MODEL` — designated model used for every summary request
  - **Production (Vercel):** must be a model available on [Ollama Cloud](https://ollama.com/search?c=cloud), e.g. `gemma3:4b-cloud`, `rnj-1:8b-cloud`, `ministral-3:3b-cloud`
  - **Local dev:** any model your local Ollama server has pulled

The app passes `OLLAMA_MODEL` exactly as configured. On Vercel, only cloud-available models work — local-only models will fail. In production with an API key set, failed AI requests return an error instead of silently falling back. In local dev without a key, a simple excerpt fallback is used.

## reCAPTCHA Setup

1. Go to [google.com/recaptcha/admin/create](https://www.google.com/recaptcha/admin/create).
2. Create a site with type **reCAPTCHA v2 → "I'm not a robot" Checkbox** (not v3).
3. Add domains:
   - Production: `yourdomain.com`
   - Vercel: `usyd-unit-reviews.vercel.app` (and `*.vercel.app` if needed)
   - Local dev: `localhost`
4. Copy the **Site key** and **Secret key**.
5. Set in `.env` (local) or Vercel project settings (production):

```
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<site-key>
RECAPTCHA_SECRET_KEY=<secret-key>
```

When both keys are set, the review form shows a CAPTCHA widget and `POST /api/reviews` verifies the token server-side before accepting a submission.

## Ollama Setup

### Production (Vercel + Ollama Cloud)

Production calls the Ollama Cloud API at `https://ollama.com`. Use a model from the [cloud model catalog](https://ollama.com/search?c=cloud) — these are the models available for hosted inference on Vercel. Cloud model names typically end in `-cloud` (e.g. `gemma3:4b-cloud`).

1. Create an API key at [ollama.com/settings/keys](https://ollama.com/settings/keys)
2. Pick a cloud model from [ollama.com/search?c=cloud](https://ollama.com/search?c=cloud)
3. Set on Vercel:

```
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=<ollama-api-key>
OLLAMA_MODEL=<ollama-model-cloud>
```

Set `OLLAMA_MODEL` to the cloud model you want. Local-only models (not listed in the cloud catalog) will not work in production.

### Local development (optional)

```bash
ollama pull gemma3:4b
ollama serve
```

Set in `.env`:

```
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
```

Leave `OLLAMA_API_KEY` unset locally to allow the excerpt fallback when Ollama is unavailable.

## Vercel Deployment

1. Push the repo to GitHub and import the project in Vercel.
2. Set all required environment variables (see above).
3. Deploy — Vercel runs `npm run build` automatically.

Minimum Vercel env vars:

```
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
RATE_LIMIT_COOKIE_SECRET=
ADMIN_REVIEW_TOKEN=
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=
OLLAMA_MODEL=gemma3:4b-cloud
```

Recommended for production (spam protection):

```
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
```

## Security Notes

The project includes multiple hardening controls:

- Strict input validation and sanitization for all review/report payloads
- Origin/host validation for state-changing endpoints
- Signed session/device cookies for abuse controls
- Persistent, Turso-backed rate limiting with maintenance and caps
- CSP and additional browser hardening headers via `src/proxy.ts` (includes Google reCAPTCHA domains)
- Google reCAPTCHA v2 on review submission with server-side token verification
- Admin token verification using constant-time comparison
- Report deduplication and per-review report flood control
- LLM prompt hardening (reviews wrapped in tags; metadata excluded from summaries)

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

- `data/units.json` — unit catalog (code, name, level, display order)
- `data/reviews.db` — local SQLite fallback (created automatically when Turso is not configured)

For git hygiene, keep local DB files and real env secrets out of source control.

## Project Structure

| Path | Purpose |
|---|---|
| `data/units.json` | Unit catalog |
| `src/lib/db.ts` | Database layer (Turso / local SQLite) |
| `src/lib/captcha.ts` | Google reCAPTCHA server-side verification |
| `src/lib/requestSecurity.ts` | Origin checks, rate-limit fingerprints, request parsing |
| `src/lib/summarizer.ts` | Ollama AI summarization |
| `src/lib/types.ts` | Types, grades, browse categories |
| `src/proxy.ts` | Security headers (CSP, cookies) |
| `src/components/ReviewForm.tsx` | Review submission form |
| `src/components/ReCaptcha.tsx` | Google reCAPTCHA v2 widget |
| `src/components/UnitReviews.tsx` | Review list, modal form overlay |
| `src/components/ReviewCard.tsx` | Review display card |
| `src/components/AISummary.tsx` | AI summary UI |
| `src/app/units/[category]/` | Unit browse pages |
| `src/app/api/reviews/` | Review CRUD and summarize APIs |
