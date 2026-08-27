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

Since MON-250 the data-quality assertions no longer fail the job directly.
`dbt snapshot`, `dbt test`, `dbt source freshness` and the quiz vote_id
validation each run with `continue-on-error`, and a final `Data-quality gate`
step re-fails the job when any of them reports `failure`, naming which one in
the run summary.
The alerting is unchanged — `Notify failure` and `Email failure alert` still
fire, because the gate itself is what turns the job red.
What changed is that a failing assertion no longer skips the steps after it:
cache revalidation, the quiz gate and the database-size probe now run on every
attempt, which matters most during a recess, when `source freshness` errors on
the same stale data every single day.
The database-size probe stays outside the gate: a transient `/health` hiccup is
a monitoring gap, not an ingestion failure, and must not send a false
"ingestion failed" alert.
A failed cache revalidation is likewise not fatal, but the gate now emits a
`::warning::` and a step-summary note for it — pages keep serving the previous
build until their `revalidate` window expires, which is worth seeing.

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

## 5. Supporter API tier: bumping `rate_limit_multiplier` on payment (MON-190, ADR-029)

Per ADR-029: no Stripe/webhook billing is built until a real paying commercial
API customer exists. Until then, a heavy commercial user is moved to a paid
tier by hand, reusing MON-98's existing `api_keys.rate_limit_multiplier`
column and manual issuance flow. This is the runbook for that manual step.

### Step 1 — the customer pays

A commercial user asking for a higher rate limit is pointed at one of:

- **HelloAsso** (default) — the same donation link used on the `/couts`
  cost-transparency page. Fits a recurring or one-off contribution from an
  organisation comfortable giving through an association donation rail.
- **A one-off Stripe payment link**, for a business that needs a proper
  invoice/receipt HelloAsso doesn't produce. Create a single Stripe Payment
  Link by hand in the Stripe Dashboard for the agreed amount — no MonÉlu-side
  Stripe integration, webhook, or API key is involved. Delete or let the link
  expire after use.

Either way, payment confirmation is a manual check (HelloAsso dashboard /
Stripe Dashboard / bank statement) — there is no automated hook.

### Step 2 — issue or find their API key

If the customer already has a free-tier key (issued per the process on
`/developpeurs` — email request to walidelkhoukh99@gmail.com, then a manual
row insert), skip to Step 3. Otherwise, issue one first:

```bash
# Generate a raw key and its sha256 hash (never store the raw key).
# Run in a shell with history disabled/cleared afterward, e.g. `set +o history` first.
python3 -c "import secrets, hashlib; raw = secrets.token_urlsafe(32); print('raw:', raw); print('hash:', hashlib.sha256(raw.encode()).hexdigest())"
```

```sql
INSERT INTO api_keys (key_hash, label, contact_email, rate_limit_multiplier)
VALUES ('<hash from above>', '<customer/org name>', '<their email>', 4);
```

Send the customer the raw key over a private channel (email) — it is never
recoverable from the database afterwards.

### Step 3 — bump the multiplier

`contact_email` is neither unique nor required, so confirm the exact row
first rather than matching on email alone:

```sql
SELECT id, label, contact_email, rate_limit_multiplier
FROM api_keys
WHERE contact_email = '<their email>' AND revoked_at IS NULL;
```

Once payment is confirmed, raise that key's multiplier by `id` (effective
limit is `base * rate_limit_multiplier`, see
`data/migrations/004_api_keys.sql`):

```sql
UPDATE api_keys
SET rate_limit_multiplier = <agreed multiplier>
WHERE id = <id from the SELECT above>;
```

Pick the multiplier by agreement with the customer (e.g. 10x-20x for a small
commercial integration); there is no fixed pricing tier table yet — this is
one-off, negotiated per customer, consistent with ADR-029 not building a
`plan` column. The in-process key cache (`api/auth.py`) picks up the change
within 5 minutes (`_CACHE_TTL_SECONDS`), no deploy needed.

### Step 4 — revoke on non-payment / offboarding

If a paid arrangement ends, either revoke the key entirely or drop it back to
the default multiplier. Again, confirm the `id` via the `SELECT` above first:

```sql
-- Revoke outright:
UPDATE api_keys SET revoked_at = now() WHERE id = <id>;

-- Or just drop back to the free-tier default:
UPDATE api_keys SET rate_limit_multiplier = 4 WHERE id = <id>;
```
