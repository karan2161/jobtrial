# Job Trail: Backend

REST API for Job Trail: resume management, AI resume analysis and tailoring, application tracking, reminders, analytics and an AI career assistant. Node.js + Express, Supabase (Postgres, Auth, Storage), provider-agnostic AI layer.

```
Browser ──► Express REST API ──┬─► Supabase  (Postgres + RLS · Auth · private Storage)
 (Bearer JWT)                  └─► AI service ──► OpenAI | Anthropic (swap with one env var)
```

## Design in one page

| Decision | Why |
|---|---|
| **Modular monolith**, layered `routes → controllers → services` | One small team, clear domain boundaries, trivially deployable. Services take `db` as a parameter, so they are testable without a live database. |
| **Two independent ownership layers** | Every request runs with a Supabase client that carries the *user's* JWT, so Postgres **RLS** applies. Services *also* filter by `user_id` and pre-check every foreign ID. A bug in one layer does not expose data. A DB trigger additionally rejects rows that point at someone else's parent record. |
| **Service-role key used in three places only** | Token validation, Storage operations, account deletion. It is never used for normal data access. |
| **AI extracts; code scores** | The model turns a job description into structured requirements. Matching and the ATS score are computed deterministically in `atsService.js` (configurable weights), so scores are reproducible and cannot be invented by a model. |
| **Every model output is schema-validated** (zod) | Fence/prose recovery → one repair retry → clean `502 AI_INVALID_RESPONSE`. Nothing unvalidated is stored. |
| **No fabricated resume content** | Tailoring only applies suggestions whose `original_text` exists verbatim in the resume; the rest are returned as `unapplied`. The original is never modified. |
| **Provider strategy** | `services/ai/providers/{openai,anthropic,mock}.js` share one two-method interface. |
| **Audit trail lives in the database** | A trigger writes the `application_events` row and `activity_logs` row in the same transaction as any status change, whichever code path caused it. |
| **Analytics aggregated in SQL** (`analytics_overview()`); rates derived with safe division | No client-side maths, no NaN. |

### Metric definitions (denominator = *submitted* applications, i.e. status ≠ `saved`)
- `responseRate`: reached screening, interview, offer or rejected
- `interviewRate`: reached the interview stage at any point (current status **or** event history)
- `offerRate`: reached an offer at any point

### ATS score
Weighted sum over applicable components, weights renormalised when a component is not applicable (e.g. the JD states no years of experience):
`skills 0.30 · keywords 0.25 · experience 0.15 · structure 0.15 · role 0.10 · education 0.05`. Override with `ATS_WEIGHTS` (JSON). The response includes a per-component `score_breakdown`.

## Project layout
```
supabase/migrations/   001_schema.sql  002_rls.sql  003_storage.sql
supabase/seed/         dev_seed.sql        (development only)
server/
  src/config/          env.js (validated at boot) · supabase.js (admin / anon / per-user clients)
  src/middleware/      auth · validation · rateLimiter · errorHandler
  src/routes/          one router per resource
  src/controllers/     thin HTTP adapters
  src/services/        business logic (+ ai/: schemas, json recovery, providers)
  src/utils/           errors · validation schemas · logger (redacting) · skills dictionary · diff
  tests/               36 tests: units + API + ownership
```

## Setup

### 1. Supabase
1. Create a project at supabase.com.
2. **SQL Editor**: run `supabase/migrations/001_schema.sql`, then `002_rls.sql`, then `003_storage.sql` (or `supabase db push`). This creates tables, enums, indexes, triggers, RPC functions, RLS policies and the **private** `resumes` bucket.
3. **Authentication → URL configuration**: Site URL = your frontend URL; add `<frontend>/reset-password` and `<frontend>/login` to redirect URLs.
4. **Project Settings → API**: copy the URL, `anon` key and `service_role` key.

### 2. Backend
```bash
cd server
cp .env.example .env        # fill in the values
npm install
npm run dev                 # http://localhost:4000   (GET /health)
```

### 3. Open the app

The Express server serves `job-trail.html` at the root, so once the backend is running just open:

```
http://localhost:4000
```

No separate frontend build step or dev server is needed. The page makes all API calls with relative paths (`/api/…`) so it always talks to whichever host served it — works the same in production.
Minimum `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY` (or `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`). The server refuses to start with an invalid configuration and never prints secret values.

`SUPABASE_SERVICE_ROLE_KEY` and the AI keys must exist **only** on the backend.

### 3. Optional development data
`select public.dev_seed('<your auth user uuid>');` adds sample applications. **Never run in production**; real users start empty.

### 4. Tests
```bash
cd server && npm test
```
No network or credentials needed (Supabase is replaced by an in-memory fake; AI by a stub).

## API

All responses use `{ "success": true, "data": … }` (lists add `pagination: {page, limit, total, totalPages}`) or `{ "success": false, "error": { "code", "message", "details?" } }`. Everything except `/api/auth/{signup,login,refresh,forgot-password}` and `/health` needs `Authorization: Bearer <access_token>`.

| Area | Endpoints |
|---|---|
| **Auth** | `POST /api/auth/signup` · `login` · `refresh` · `forgot-password` · `reset-password` (Bearer = recovery token) · `logout` · `GET /me` · `GET /export` · `DELETE /account` (`{"confirm":"DELETE"}`) |
| **Profile** | `GET/PUT /api/profiles/me` |
| **Resumes** | `GET /api/resumes` · `POST /api/resumes` (multipart: `file`, optional `name`; PDF/DOCX ≤ 5 MB) · `GET /:id[?include=text]` · `PUT /:id` (rename) · `DELETE /:id` · `GET /:id/download` (60 s signed URL) |
| **Versions** | `GET/POST /api/resume-versions` (`?resume_id=`) · `GET/PUT/DELETE /:id` · `POST /:id/duplicate` · `POST /:id/restore` · `GET /:id/compare[?against=<versionId>]` |
| **Job descriptions** | `GET/POST /api/job-descriptions` · `POST /analyze` · `GET/PUT/DELETE /:id` |
| **Applications** | `GET /api/applications?page&limit&q&status&sort&order` · `POST` · `GET/PUT/DELETE /:id` · `PATCH /:id/status` · `POST /:id/events` · `GET/POST /:id/interviews` |
| **Interviews** | `PUT/DELETE /api/interviews/:id` |
| **Reminders** | `GET /api/reminders?filter=upcoming\|overdue\|today\|all` · `POST` · `PUT /:id` · `PATCH /:id/complete` · `PATCH /:id/snooze` · `DELETE /:id` |
| **Analytics** | `GET /api/analytics/overview?range=7d\|30d\|90d\|all` · `GET /api/analytics/dashboard` · `GET /api/activity` |
| **AI** (per-user rate limit) | `POST /api/ai/analyze-resume` · `tailor-resume` · `improve-bullet` · `chat` · `GET /analyses[/:id]` · `GET /conversations` · `GET /conversations/:id/messages` · `DELETE /conversations/:id` |

Behaviour worth knowing:
- **Analysis is cached** by `sha256(resume text + JD text)`. Unchanged inputs return the stored result with `cached: true` and make **no AI call**. `force: true` re-runs it. Every run is kept.
- **Creating an application** can also create a follow-up reminder (`create_follow_up_reminder: true`); **creating an interview** can create a reminder (`create_reminder`, `reminder_minutes_before`).
- **Restore** creates a *new* version from an older one (non-destructive). Editing a version's `content` clears its `ats_score` until re-analysed.
- **Deleting a master resume** deletes its versions and its Storage file; linked applications keep existing with the link cleared.
- **Search** is server-side (company, role, location, status prefix). Debounce on the client.

## Connecting the existing frontend

Replace each simulation with a call; keep the visuals.

| Prototype (hardcoded) | Replace with |
|---|---|
| Dashboard stats, chart, reminders, recent | `GET /api/analytics/dashboard` (`data.isEmpty` → show the empty state) |
| Kanban cards | `GET /api/applications?limit=100` |
| Drag & drop | `PATCH /api/applications/:id/status` |
| ATS ring, chips, bullet compare | `POST /api/ai/analyze-resume` |
| Chat | `POST /api/ai/chat` |

Optimistic Kanban move with rollback:
```js
async function moveCard(card, toStatus) {
  const from = card.status;
  render(card.id, toStatus);                                   // 1. move instantly
  try {
    await api(`/api/applications/${card.id}/status`, { method: 'PATCH', body: { status: toStatus } });
  } catch (e) {
    render(card.id, from);                                     // 2. roll back
    toast('Could not move the card. Please try again.');
  }
}
```
Session: store `access_token` + `refresh_token` from `/api/auth/login`; on a 401 call `/api/auth/refresh` once, then retry. Render all user text as text (never `innerHTML`); the API strips control characters but does not HTML-escape.

## Security summary
JWT validated with Supabase on every request · RLS on all tables (append-only audit tables) · ownership triggers · strict zod validation with unknown-field rejection on updates · upload checks: extension **and** MIME **and** magic bytes, 5 MB cap, parsed before storing so failures leave no orphan file · private bucket + short-lived signed URLs · helmet, CORS pinned to `FRONTEND_URL`, 200 KB JSON limit · rate limits: general (per IP), auth (per IP), AI (per user) · prompt-injection guard (user text is fenced as data, tags stripped) · log redaction (tokens, passwords, resume/JD text never logged) · generic 500s, no stack traces · signup/reset responses never reveal whether an email exists.

## Deployment
Any Node 18+ host (Render, Railway, Fly.io, a VPS):
```bash
cd server && npm ci --omit=dev && NODE_ENV=production npm start
```
Set the env vars from `.env.example`, `FRONTEND_URL` to the deployed frontend origin, and health-check `GET /health`. `AI_PROVIDER=mock` is rejected in production. The app trusts one proxy hop for rate-limit IPs (`trust proxy = 1`); adjust if you sit behind more.

## Known limits / next steps
- **Verified:** 36 automated tests pass; migrations 001 and 002 were run on a real PostgreSQL 16 with a minimal Supabase stub and behaved as designed (RLS isolation, ownership trigger, atomic status change with audit rows, analytics). **Not verified:** a live Supabase project (Auth emails, Storage upload, `003_storage.sql`), and real OpenAI/Anthropic calls. Do a first end-to-end pass with real keys.
- A successful **resume upload** path (real PDF/DOCX → Storage) is not covered by automated tests; only the rejection paths are.
- Scanned/image-only PDFs are rejected (no OCR).
- AI chat returns a full reply, not a token stream; add SSE later if the UI needs true streaming.
- The skills dictionary (`utils/skills.js`) is a starter list; unknown skills still match by exact term.
- No email/push delivery for reminders yet: the API stores and serves them; a scheduler (e.g. Supabase cron) is the next step.
- Future features (cover letters, browser extension, mobile app, interview prep, LinkedIn optimisation) are intentionally not implemented; services are separated so they can be added as new modules.
