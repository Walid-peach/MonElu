# MonÉlu — Architecture Decision Records

This file documents real architectural decisions made during the build.
Every future development session should read this file first before writing any code.
If a decision contradicts the original CLAUDE.md spec, this file takes precedence.

---

## ADR-001 — No Kafka, no Spark Streaming
**Date:** Phase 5
**Status:** Final

**Decision:** Kafka + Spark Structured Streaming removed from the architecture.
Replaced by Airflow DAG polling every 5 minutes on session days.

**Reason:** The AN data source publishes static ZIP exports updated every few
minutes — not a real event stream. Kafka solves problems MonÉlu doesn't have:
- One producer, one consumer — no fan-out needed
- Data is reproducible from AN — no need for message replay
- 2-3 vote events per hour — Spark is designed for millions/second

Using Kafka + Spark would be simulated streaming over a batch source.
Airflow polling is the architecturally honest choice.

**Impact on Terraform:** Remove the Kafka/MSK module from infra/.
Do not add it back unless streaming is explicitly re-scoped.

---

## ADR-002 — Phase 5 vote alerts deferred
**Date:** Phase 5
**Status:** Deferred — will build when real users exist

**Decision:** The full alert system (SendGrid emails, subscription confirmation,
Airflow alert DAG) is not built. The database schema (subscriptions +
alert_log tables) is ready. A stub FastAPI endpoint exists at POST /alerts/subscribe.

**Reason:** Zero subscribers at this stage. The engineering investment is not
justified before real user demand. GitHub PR #[number] is left open and labeled
deferred.

**Trigger to build:** First real user asks for alerts, or monelu.fr is live
with real traffic.

**What's ready when we resume:**
- subscriptions + alert_log tables in Postgres (migrated to prod)
- Full implementation spec exists in this conversation history
- SendGrid free tier: 100 emails/day, no credit card needed
- Airflow DAG spec: dag_vote_alerts.py, schedule */5 * * * 1-5

---

## ADR-003 — Railway + Supabase instead of AWS
**Date:** Phase 1
**Status:** Current — migrate to AWS when justified by traffic or revenue

**Decision:** Production runs on Railway ($5/month for FastAPI) +
Supabase (free tier for PostgreSQL + pgvector).

**Reason:** No real users yet. AWS costs ~$130/month minimum for the full
stack. Railway + Supabase costs $5/month and covers all current needs.

**Migration trigger:** Real users, revenue, or Supabase free tier limits hit
(500MB — currently at ~135MB).

**Current production architecture:**
```
Vercel (Next.js — future)     ← Free
│
Railway (FastAPI)              ← $5/month
│
Supabase (PostgreSQL           ← Free tier
         + pgvector)
│
GitHub Actions                 ← Free
(ingestion cron every 6h)
```

---

## ADR-004 — Terraform validate-only (no apply)
**Date:** Phase 6A
**Status:** Final for portfolio phase

**Decision:** Terraform IaC is written and validated but never applied.
`terraform apply` is explicitly not run.

**Reason:** Portfolio value comes from having correct, reviewable IaC on GitHub.
Applying would cost ~$130/month on AWS with no current justification.

**What runs in CI:** terraform fmt + terraform init -backend=false +
terraform validate on every PR touching infra/.

**Apply trigger:** Same as ADR-003 — real users or revenue.

---

## ADR-005 — Kafka module removed from Terraform
**Date:** Phase 6A
**Status:** Final

**Decision:** infra/modules/kafka/ deleted. MSK not included in the
Terraform stack.

**Reason:** Follows from ADR-001. IaC should reflect actual architecture,
not aspirational features. Having an MSK module implies Kafka is planned —
it is not. An interviewer asking "why MSK?" deserves an honest answer,
and the honest answer is "we don't use Kafka."

**Future:** If streaming is ever re-scoped, add the module at that point
with a clear ADR explaining the decision.

---

## ADR-006 — Airflow runs locally only (not in production)
**Date:** Phase 3
**Status:** Current

**Decision:** Airflow runs in Docker locally for development and demos.
GitHub Actions is the production scheduler.

**Reason:** Airflow needs 4 always-on processes. Railway free tier sleeps
inactive services — the scheduler cannot sleep. Astronomer free tier
(5 DAGs, limited runs) is the next step when real scheduling is needed.

**Production scheduling today:**
- GitHub Actions cron: every 6h on weekdays
- Runs: ingest_deputies + ingest_votes + ingest_positions + dbt run + dbt test + RAG index rebuild

**Migration path:**
Local Docker → Astronomer free tier → AWS EC2 (Phase 6A applied)

---

## ADR-007 — dbt CI runs against production Supabase
**Date:** Phase 6B
**Status:** Known limitation — acceptable for solo project

**Decision:** dbt test in CI (ci.yml) runs against the production Supabase
database, not an isolated CI database.

**Reason:** Setting up an ephemeral CI database (spin up Postgres in GitHub
Actions runner, seed with sample data, test, destroy) adds significant
complexity for a solo portfolio project.

**Risk:** Low — all dbt tests are read-only (not_null, unique, accepted_values,
relationships). No mutations happen. Risk would increase if dbt run
was added to CI (which it is not).

**Proper fix:** Spin up an ephemeral Postgres in the GitHub Actions runner,
seed with a fixture dataset, run dbt against it, destroy on completion.
Implement when CI reliability becomes a real concern.

---

## ADR-008 — RAG chunking strategy
**Date:** Phase 2
**Status:** Final for current corpus

**Decision:** Four chunk types in the RAG index:
- Vote chunks (3,149): one scrutin = one French prose paragraph
- Deputy chunks (577): one deputy = summary with presence rate + vote breakdown
- Party chunks (12): one parliamentary group = aggregate vote stats
- Global stats chunk (1): total deputies, votes, positions, party breakdown

**Reason:** MLflow eval (k=3 vs k=5, keyword scoring on 10 golden Q&A pairs)
revealed that aggregate facts (total deputies = 577, party counts) were not
in any individual chunk, causing 3 of 4 retrieval failures. Adding party
chunks and a global stats chunk raised keyword_score from 0.58 to 0.80+.

**Notable deputy pinning:** Retriever bypasses cosine search for known
deputy names (Attal, Le Pen) and fetches their chunk directly, then fills
remaining slots with semantic search. Solves IVFFlat recall gap on rare
named entities.

**Total index:** 3,739 chunks. Cost: $0.0064 one-time (OpenAI
text-embedding-3-small). Per-query cost: ~$0 (question embedding only).

---

## ADR-009 — party and department data required a secondary parse
**Date:** Phase 2 prep
**Status:** Resolved

**Decision:** Deputies table required two separate fix scripts before
the RAG index could be built.

**What happened:**
- party column: all NULL after initial ingestion. The AN deputy JSON stores
  organeRef IDs (e.g. PO800520), not party names. Required downloading
  Organes.json.zip separately, building a mapping dict, and running
  scripts/update_party.py to backfill.
- department column: stored as numeric codes (e.g. "78" not "Yvelines").
  Fixed with a hardcoded DEPT_NAMES dict in the same script.

**Result:** 575/577 deputies have real party names. 2 NULL deputies have
no active parliamentary group — expected edge case, not a bug.

---

## ADR-010 — AN portal has no REST API
**Date:** Phase 1, Day 2
**Status:** Permanent constraint

**Decision:** All data ingestion uses static ZIP exports, not REST API calls.

**What happened:** The Assemblée Nationale documentation implies REST API
endpoints exist at /api/v2/acteurs/deputes etc. All return 404.
The actual data is published as ZIP exports:
- Deputies: AMO10_*json.zip (individual JSON files per deputy)
- Votes: Scrutins.json.zip (one JSON file per scrutin)
- Orgs: Organes.json.zip (parliamentary groups)

**Impact:** No incremental API polling possible. Every ingestion downloads
the full ZIP. Hash-based change detection (ADR-011) mitigates unnecessary
DB writes.

---

## ADR-011 — Hash-based change detection in Bronze layer
**Date:** Phase 3
**Status:** Planned — not yet implemented. Current production scheduler is GitHub Actions, not Airflow (see ADR-006).

**Decision:** When Airflow is promoted to production (see ADR-006 migration path), DAGs should compute an MD5 hash of each downloaded ZIP before writing to a Bronze storage layer. If the hash matches the last run, skip the write.

**Reason:** The AN exports the full dataset every time — no incremental
endpoint exists. Without change detection, every DAG run would re-ingest
50MB+ of unchanged data and re-upsert 500k+ rows unnecessarily.

---

## ADR-012 — Supabase requires PgBouncer pooler on port 6543
**Date:** Phase 1 (Supabase migration)
**Status:** Permanent constraint

**Decision:** All production connections to Supabase use the PgBouncer
pooler (port 6543, host aws-0-eu-west-3.pooler.supabase.com) not the
direct connection (port 5432).

**Reason:** Supabase free tier blocks direct port 5432 connections from
external IPs. Railway → Supabase fails silently on port 5432.

**Impact on dbt:** dbt prod profile uses port 6543.
PgBouncer transaction mode means no prepared statements — if psycopg2
prepared statement errors appear, add ?options=-c%20statement_timeout%3D0
to the connection string.

**Local dev:** Use direct connection (port 5432) from .env —
PgBouncer transaction mode breaks some local psycopg2 features.

---

## ADR-013 — BM25 hybrid retrieval reverted
**Date:** RAG Phase B
**Status:** Final

**Decision:** BM25 hybrid retrieval (hybrid_retriever.py) is not
used as the default retriever. Cosine similarity (retriever.py)
remains the default.

**Reason:** MLflow eval showed BM25 hybrid scored 0.844 vs 0.911
for cosine on 15 golden questions. Regression driven by noisy
reranking on questions where cosine was already correct.

**Root cause of eval failures:** Data coverage gaps and missing
SQL router patterns — not retrieval algorithm quality.
Fixing 4 SQL patterns raised score from 0.622 to 0.911 with
zero retrieval changes.

**When to revisit:** If semantic multi-hop questions become a real
failure mode after Phase C chunks are added (law summaries,
temporal chunks). hybrid_retriever.py is ready to re-enable.

---

## Rules for future development sessions

1. Read this file before writing any code
2. If a prompt contradicts a decision here — flag it, don't build it
3. Kafka is not part of this project (ADR-001, ADR-005)
4. Airflow is local only (ADR-006) — do not write Railway/cloud Airflow config
5. Terraform is validate-only (ADR-004) — do not add terraform apply steps
6. Phase 5 alerts are deferred (ADR-002) — do not build email dispatch
7. When in doubt: check what's actually deployed before writing new code
