# MonÉlu — Diagnostic Roadmap

Master tracker for full-project diagnostics. One category at a time; each diag
produces a report in `notes/dispatch/` and this file gets updated with status,
the report link, and the headline findings.

**Legend:** ✅ done · 🔄 in progress · ⬜ not started · ✅ solved — remediation PR opened and reviewed

All findings are tracked as Linear issues (MON-5…MON-65) in project
"Diagnostic Remediation 2026-06". Remediation per axis: `/solve-axis <axis>`.

Suggested order (follows the data flow): 2 → 3 → 4 → 5 → 6, then the smaller
ones (7, 8, 10) folded in or done last.

---

## 1. Ingestion — ✅ done (2026-06-11) · ✅ solved (2026-06-11)

**Remediation:** [PR #139](https://github.com/Walid-peach/MonElu/pull/139) — fixes
MON-5 (single ZIP downloads via orchestrator `--zip-path`), MON-6 (dup
update_party workflow step deleted), MON-7 (shared `scripts/_http.py` retry
helper, no sleep on final attempt, ingest_organes gains retries), MON-8
(timeout-minutes, failure-notify, summaries run unconditionally), MON-61
(date guard skips tree-walk). Reviewed via /pr-review, Must/Should fixes
applied (GITHUB_OUTPUT written before summaries, exception chaining), CI
green. Awaiting merge.

**Where:** `scripts/`
- `ingest_deputies.py`, `ingest_votes.py`, `ingest_positions.py` — AN ZIP fetch → parse → upsert
- `ingest_organes.py` + `update_party.py` — party/department resolution
- `generate_vote_summaries.py` — Groq plain-language summaries + themes
- `run_ingestion_prod.py` — orchestrator (advisory lock, subprocess steps, GITHUB_OUTPUT)
- `migrate.py` — schema apply (also Railway start hook)

**Covers:** download retry logic, parsing robustness, upsert idempotency,
orchestration, batch sizes, the daily cron's behavior.

**Report:** [ingestion_diagnostic_2026-06-11.md](ingestion_diagnostic_2026-06-11.md)

**Headline findings:** Scrutins ZIP downloaded twice per run (subprocess
orchestration); `update_party.py` runs twice in prod (pipeline step + duplicate
workflow step); retry helper copy-pasted ×3 with a pointless final sleep;
summaries retry-gate contradiction; no workflow timeout or failure notify;
stale CLAUDE.md note on index truncation. Verdict: solid, no breakage —
recommended fix is #1+#2 (single-download orchestration, drop dup step).

---

## 2. Database & schema — ✅ done (2026-06-11)

**Where:**
- `data/migrations/001_init.sql` (+ any later migrations) — full schema, 4 tables
- `scripts/migrate.py` — migration runner (globs migrations, runs as Railway start hook)
- `docker-compose.yml` — local Postgres 15 + pgAdmin 8
- Production: Supabase (Postgres 15 + pgvector, free tier, 500 MB cap)

**Report:** [database_diagnostic_2026-06-11.md](database_diagnostic_2026-06-11.md)

**Headline findings:** docker-compose still ships a dead Airflow+MinIO stack
(7 services vs the documented 2) — `make start` boots an orchestrator that
orchestrates nothing; ~half the indexes are dead weight (redundant
`idx_positions_vote`, btree-unusable ILIKE indexes, 4-value position index);
ivfflat index built on an empty table → degenerate clustering, plausibly
feeding the notable-deputy pin hack — at 3.7k chunks brute force would beat
it; no `schema_migrations` ledger (every deploy re-runs every file, RLS
policies dropped/recreated on each boot); latent batch-killer: `voted_at`
NOT NULL but parser can emit None; surrogate `position_id` wastes space on
the 500 MB tier. Verdict: schema clean and right-sized, periphery sloppy.
Top fixes: strip compose file, add migration ledger, drop 5 indexes.

---

## 3. API — ✅ done (2026-06-11)

**Where:** `api/`
- `main.py` — app factory, CORS, slowapi rate limits (60/min global, 10/min scorecard), exception handler, HTML landing page, `/health`
- `routers/deputies.py`, `routers/votes.py`, `routers/search.py` — all SQL (direct psycopg2, RealDictCursor)
- `schemas.py` — Pydantic response models
- `limiter.py` — shared Limiter instance

**Report:** [api_diagnostic_2026-06-11.md](api_diagnostic_2026-06-11.md)

**Headline findings:** strongest layer audited so far — zero injection
surface, correct keyset pagination, careful pool/broken-connection handling.
Two real problems: `POST /search` is `async def` calling blocking psycopg2 +
Groq → freezes the whole event loop during every search (fix: make it `def`);
rate limiting keys on `request.client.host` but uvicorn runs without
`--proxy-headers` on Railway → all users likely share one 30/min bucket.
Also: retriever opens a raw unpooled connection per search (3rd connection
mechanism); landing + /health run COUNT(*) full scans (incl. 715k positions)
on every hit with no cache; CLAUDE.md drift (claims 60/min and GET-only
CORS); main.py is ~75% inline HTML/SVG. Top fixes: async→def, proxy-headers,
60s count cache, pool the retriever.

---

## 4. Transform (dbt) — ✅ done (2026-06-11)

**Where:** `transform/`
- `models/staging/` — typed views over raw tables
- `models/intermediate/` — business logic
- `models/marts/` — `mart_deputy_scorecard`, `mart_vote_summary`, `mart_party_alignment`
- `dbt_project.yml`, schema tests, `create_dbt_profile.py` (profile generation in CI)

**Report:** [transform_rag_diagnostic_2026-06-11.md](transform_rag_diagnostic_2026-06-11.md) (joint with #5)

**Headline findings:** layer structure and test coverage genuinely good, but:
marts go stale between merges (daily ingest never runs dbt — deploy.yml only
fires on merge); presence_rate defined 3 different ways across scorecard,
chunker, and SQL router (nonVotant counted as present in some, not others);
presence denominator ignores mandate windows (mid-legislature arrivals
structurally penalized — fairness bug); party alignment scores all historical
votes against the deputy's *current* party, with nondeterministic majority
tiebreaks; no source freshness blocks despite ingested_at existing. Top
fixes: dbt step in ingest_prod.yml, single presence definition in
decisions.md, mandate-windowed denominator.

---

## 5. RAG — ✅ done (2026-06-11)

**Where:** `rag/`
- `pipeline/chunker.py` — 5 chunk strategies (vote, deputy, party, global_stats, notable_deputy)
- `pipeline/embedder.py` — batched OpenAI embedding (100/batch)
- `pipeline/index_manager.py` — build/stats/clear CLI, incremental `--since` builds
- `chain/retriever.py` — pgvector `<=>`, filters, notable-deputy pin, ivfflat.probes=10
- `chain/prompts.py`, `chain/rag_chain.py` — prompts + Groq inference
- `experiments/mlflow_eval.py` — golden Q&A eval (baseline 0.58)

**Report:** [transform_rag_diagnostic_2026-06-11.md](transform_rag_diagnostic_2026-06-11.md) (joint with #4)

**Headline findings:** SQL-router-first architecture and the BM25
revert-with-evidence are the right instincts, but: vote chunks omit
`summary_plain`/`theme` — the plain-French summaries built for searchability
are invisible to search (single highest-leverage fix); ivfflat index at 3.7k
chunks is approximate search where exact would be faster — the entire
notable-pin hack is scaffolding around it, drop the index; incremental
rebuild leaves 3 classes of stale chunks (unaffected deputies' presence,
frozen "votes récents" in notable chunks, corrected votes never re-embedded)
while optimizing a cost of $0.0065; the 0.911 eval mostly measures the regex
router with hardcoded DB facts as keywords that rot daily; greedy router
patterns can confidently answer the wrong question at HIGH confidence;
`_DATA_HORIZON` frozen at process start makes the prompt refuse covered
periods. Top fixes: embed summaries, drop index + pin, daily full rebuild,
live-SQL eval ground truth.

---

## 6. CI/CD & workflows — ✅ done (2026-06-11)

**Where:** `.github/workflows/`
- `ci.yml` — PR gates: ruff + pytest + dbt compile/test + PR comment
- `deploy.yml` — dbt run/test against prod on merge
- `ingest_prod.yml` — daily 06:00 UTC weekday cron (partially reviewed in diag #1)
- `dbt_docs.yml` — lineage docs to GitHub Pages
- `terraform.yml` — fmt + validate on infra PRs

**Report:** [cicd_diagnostic_2026-06-11.md](cicd_diagnostic_2026-06-11.md)

**Headline findings:** the dbt PR gate is silently broken — `dbt test | tee`
without pipefail means the step always succeeds and real dbt failures merge
cleanly (same tee-masking hides summarizer crashes in the backfill); the
daily backfill's progress-log commit to master triggers a full deploy.yml
dbt run *and* a Railway redeploy every day for a one-line markdown change;
deploy.yml vs Railway is an unordered race on merge; dbt profile generator
exists ×3 (script + two drifting heredoc copies); zero concurrency groups,
timeouts only on the newest workflow, failure "notify" is an echo; CI's
dbt-test runs the PR's tests against prod's old-code tables. Diag #1
carry-overs still unfixed (dup update_party step, double ZIP download).
Top fixes: pipefail and stop-backfill-triggering-deploys — both one-liners.

---

## 7. Deployment & config — ✅ done (2026-06-11)

**Where:**
- `railway.json` — start command (`migrate.py` && uvicorn)
- `.env.example` — env contract
- `requirements.txt`, `requirements-ingest.txt`, `requirements-rag.txt` — dependency split
- `ruff.toml`, `.pre-commit-config.yaml`, `Makefile`

**Report:** [deployment_config_diagnostic_2026-06-11.md](deployment_config_diagnostic_2026-06-11.md)

**Headline findings:** prod image bloat — requirements.txt ships mlflow,
great-expectations, boto3, pandas that nothing on Railway imports (aiofiles
imported nowhere at all); Procfile contradicts railway.json (its start
command skips migrate.py — a builder fallback would deploy unmigrated);
failed migration = unbounded restart loop (ON_FAILURE, no maxRetries, no
ledger); env contract drifts both ways (IVFFLAT_PROBES/DBT_* used but
undocumented; MINIO_* documented under the wrong names); pre-commit pins
ruff v0.4.9 (June 2024) vs unpinned in CI, global T201 ignore contradicts
CLAUDE.md, detect-secrets never runs in CI; `make ingest-prod` hard-codes
--since 2025-01-01 vs docs saying "last 3 months"; openai pinned Aug-2024
forcing httpx ceiling, groq has 3 different floors, no lockfiles.

---

## 8. Infra (Terraform) — ✅ done (2026-06-11)

**Where:** `infra/` — modules: `networking`, `s3`, `rds`, `ec2`

**Report:** [infra_diagnostic_2026-06-11.md](infra_diagnostic_2026-06-11.md)

**Headline findings:** the HCL craft is genuinely good — zero 0.0.0.0/0
ingress, admin ports gated behind closed-by-default admin_cidr, RDS only
reachable via app-SG reference, full S3 hardening, no password defaults,
Kafka cleanly removed per ADRs. But the stack models the wrong system: the
ec2 module provisions "Airflow"/"Spark" hosts whose user_data installs only
Docker, and there is no compute for the actual FastAPI app — apply would
yield a ~$250/mo VPC + empty buckets + blank RDS serving nothing. No state
backend even on paper; CI validate proves syntax, not deployability.
**Recommendation: archive** — move/delete `infra/`, drop terraform.yml,
mark Phase 5 "archived"; a real migration would be App Runner/ECS and would
reuse only ~40% of this.

---

## 9. Frontend — ✅ done (2026-06-11)

**Where:** `frontend/` in this repo (Next 15.5, Vercel) + the `FRONTEND_URL`
revalidation hook in `ingest_prod.yml`. The API also serves an HTML landing
page from `api/main.py`.

**Report:** [frontend_diagnostic_2026-06-11.md](frontend_diagnostic_2026-06-11.md)

**Headline findings:** PR #137 shipped nearly all 06-08 Vercel recs (fonts,
analytics, OG, metadata, photos, SSG, revalidation webhook). Two correctness
bugs: SSG of 577 deputy pages collides with the API's own 10/min scorecard
rate limit — builds mass-429 and `.catch(() => null)` silently ships
scorecard-less "static" pages; `apiFetch` hardcodes `revalidate: 300` on
every fetch, making the per-page `revalidate = 86400/3600` exports dead
config and the webhook mostly redundant. Also: summarize_backfill writes
user-visible summaries but never revalidates; `maximumScale: 1` blocks
pinch-zoom (WCAG fail); frontend jest tests + lint exist but CI never runs
them; all four open items from the 06-07 review remain open; Railway
landing page (75% inline HTML, 3× COUNT(*)/hit) is now redundant with the
Vercel app.

---

## 10. Tests — ✅ done (2026-06-11)

**Where:** `tests/`

**Report:** [tests_diagnostic_2026-06-11.md](tests_diagnostic_2026-06-11.md)

**Headline findings:** 50 tests exist but CI runs only `tests/unit/` — 10
trivial ones; the 40 substantive tests are never executed in CI despite
needing no DB or keys, and running them locally gives 6 failures, all rot
(scorecard tests predate the mart rewrite; test_ask predates the sql_router
short-circuit). The riskiest code has zero tests: AN parsers, upsert
idempotency, the 376-line sql_router, hybrid_retriever, all chunkers. The
deepest ingestion tests cover the non-production Airflow/S3 path. All
fixtures synthetic — documented AN quirks (dict-vs-list votant, nonVotant)
untestable. API-layer tests genuinely good. ~25–30% blended coverage,
distributed almost inversely to risk. Top fixes: gate full `pytest tests/`
in CI + repair the 6 stale tests, then parser tests with a real scrutin
fixture, then a Postgres upsert-idempotency integration test.

---

## How to use this file

Say "diag N" → full diagnostic of that category → report written to
`notes/dispatch/<category>_diagnostic_<date>.md` → this file updated with
status ✅, the report link, and headline findings.
