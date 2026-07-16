# Monitoring setup (MON-99)

This repo now ships the code half of uptime/error monitoring: Sentry in the
API and frontend, and a real email alert on ingestion failure or stale data
(see `api/main.py`, `frontend/instrumentation-client.ts` /
`frontend/sentry.server.config.ts` / `frontend/sentry.edge.config.ts`, and
`.github/workflows/ingest_prod.yml`).

The uptime-checker half is external SaaS configuration, not code — do this
once, by hand:

## 1. Sentry (error tracking)

1. Create a free org/project at <https://sentry.io> — one project for the
   API (Python/FastAPI platform), one for the frontend (Next.js platform).
2. Set these as **Railway** environment variables (API project):
   - `SENTRY_DSN`
   - `SENTRY_ENVIRONMENT=production`
   - `SENTRY_TRACES_SAMPLE_RATE=0.1` (optional, defaults to `0.1`)
3. Set these as **Vercel** environment variables (frontend project):
   - `NEXT_PUBLIC_SENTRY_DSN`
   - `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`
   - `SENTRY_DSN` (server-side; can be the same DSN as the public one)
   - `SENTRY_ENVIRONMENT=production`
   - `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (build-time source
     map upload — generate the token under User Settings → Auth Tokens with
     `project:releases` and `org:read` scopes)
4. Redeploy both. Trigger a test error (e.g. a bad request) and confirm it
   shows up in each Sentry project with request context attached.

## 2. Ingestion failure email

Add these as **GitHub Actions repository secrets** (Settings → Secrets and
variables → Actions):

- `MAIL_SERVER`, `MAIL_PORT` — your SMTP provider (e.g. Gmail SMTP,
  SendGrid, or any transactional email provider)
- `MAIL_USERNAME`, `MAIL_PASSWORD` — SMTP credentials (for Gmail, use an
  [app password](https://myaccount.google.com/apppasswords), not your normal
  password)
- `NOTIFY_EMAIL_TO` — where alerts should land

Until these are set, the `Email failure alert` step in `ingest_prod.yml` is
skipped silently — the existing job-log `::error::` and step-summary output
still fire either way. Once set, a failed ingestion step *or* a `dbt source
freshness` failure (stale data past the thresholds in
`transform/models/staging/_sources.yml`) both trigger an email.

## 3. Uptime checker (UptimeRobot or Better Stack — either free tier works)

Create two monitors:

1. **API health** — `GET https://monelu-production.up.railway.app/health`
   - Assert HTTP status is `200`. Note: `/health` also returns `207` when
     degraded (e.g. dbt marts absent) — treat `207` as a warning-level alert,
     not a hard failure, since it can be expected right after a fresh deploy.
   - If the provider supports a keyword/body assertion, also check the
     response body contains `"status":"ok"`.
   - Check interval: 5 minutes (matches the acceptance criterion "downtime
     produces an alert within 5 minutes").
2. **Frontend homepage** — the production Vercel URL, plain HTTP-200 uptime
   check, same interval.

Set the alert contact to email for both monitors.

### Optional: public status page

Both UptimeRobot and Better Stack offer a free public status page backed by
these same monitors — worth turning on for customer-facing trust once the
above two monitors are live and stable.

## 4. User feedback triage (MON-101)

Every user signal lands in one generic `feedback` table (see
`data/migrations/005_feedback.sql`), discriminated by a `type` column:

- `type = 'chat'` — thumbs up/down on a RAG chat answer (MON-70). Payload:
  `{vote, question, answer, sources}`.
- `type = 'report'` — a "Signaler une erreur" report from a data page (MON-101).
  Payload: `{entity_type, entity_id, entity_label, page_url, message, email}`.

There is no dashboard yet — review is a weekly manual query. Run this against
prod Supabase to list the last week's feedback, newest first:

```sql
SELECT
  created_at,
  type,
  payload ->> 'entity_type' AS entity_type,
  payload ->> 'entity_label' AS entity_label,
  payload ->> 'vote'         AS chat_vote,
  left(coalesce(payload ->> 'message', payload ->> 'question'), 200) AS text,
  payload ->> 'email'        AS reply_to
FROM feedback
WHERE created_at >= now() - interval '7 days'
ORDER BY created_at DESC;
```

Error reports (`type = 'report'`) that carry a `reply_to` e-mail are the ones a
user expects a response to. Build a dashboard only once weekly volume makes the
manual query impractical.
