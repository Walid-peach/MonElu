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
**Status:** Superseded by ADR-013 (infra/ archived)

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

## ADR-014 — RAG Phase C deferred
**Date:** Post Phase B
**Status:** Deferred

**Decision:** Phase C (query decomposition, answer verification,
Cohere reranking) not built.

**Reason:** Phase B reached 0.911 keyword score — production quality
for a portfolio RAG. Remaining gap (0.5 on "122" RN deputies) is a
local data artifact, not present on production.

**What Phase C would add:** query decomposition (+0.03-0.05),
answer verification (hallucination detection), Cohere reranking.
Estimated 5-7 days effort for marginal gain.

**Trigger to build:** Real users reporting specific failure patterns
that Phase A + B don't cover.

---

## ADR-016 — Confidence computed from retrieval quality, not LLM self-rating
**Date:** RAG polish (2026-06-04)
**Status:** Final

**Decision:** The `confidence` field returned by `POST /search/` is computed from
chunk similarity scores, not extracted from an LLM-generated `[Confiance]` tag.
Thresholds: top similarity ≥ 0.65 AND ≥ 2 strong chunks → ÉLEVÉ; top ≥ 0.5 → MOYEN;
otherwise → FAIBLE. The LLM tag is still stripped from the answer text but its value
is discarded.

**Reason:** Post-deploy testing showed the LLM always self-rated ÉLEVÉ regardless of
answer quality, making the field meaningless as a reliability signal. Retrieval-based
confidence is deterministic, requires no extra LLM call, and reflects actual evidence
quality rather than LLM overconfidence.

**Impact on `rag/chain/rag_chain.py`:** `compute_confidence(chunks)` replaces the
`extract_confidence()` return value in the `ask()` response dict.

---

## ADR-017 — High-profile deputies always indexed
**Date:** RAG polish
**Status:** Final

**Decision:** ALWAYS_INCLUDE dict in chunk_notable_deputies.py forces
indexing of high-profile deputies (Attal, Le Pen) regardless of vote
count rank, since the production data window (July 2025+) doesn't rank
them in the top 100 by vote count.

**Reason:** These are the names users and journalists actually search.
They must always have dedicated chunks even when their recent vote
count is low.

---

## ADR-018 — Rebuild logo as inline SVG React component (Plan C)
**Date:** 2026-06-09
**Status:** Current

**Decision:** Replace the existing `MonEluLogo.tsx` (a simplified geometric placeholder — 8 rotating squares) with a new inline SVG component that faithfully renders the hemicycle arc + deputy figure + wordmark from the canonical brand asset (`docs/assets/MonElu_LOGO-SVG.png`).

**Reason:** Three options were evaluated:
- **Plan A (use PNG as-is):** Rejected. Rasterized, 162 KB per use, cannot adapt to dark mode.
- **Plan B (keep existing SVG component):** Rejected. Scalable but wrong visual — the nav shows a geometric placeholder that doesn't match the actual brand identity.
- **Plan C (rebuild as SVG component):** Chosen. Pixel-perfect at any size, ~2–4 KB inline, dark mode is free via a `variant` prop, unblocks fixing broken PWA icons.

**Component API:**
```tsx
<MonEluLogo size={32} variant="light" />               // default — navy + red
<MonEluLogo size={32} variant="dark" />                // white + red, for dark backgrounds
<MonEluLogo size={32} variant="light" hideWordmark />  // icon only, no text
```

**Impact:**
- `frontend/src/components/MonEluLogo.tsx` must be replaced with the hemicycle design
- Do NOT use the PNG file (`docs/assets/MonElu_LOGO-SVG.png`) directly in JSX — it exists as reference only
- PWA icons (`public/icon-192.png`, `public/icon-512.png`) are 1×1 placeholders — export proper versions from the SVG when implementing
- Dark mode infrastructure (next-themes, dark: Tailwind classes) is **deferred** — build only when there is real user demand

**Trigger to revisit:** Dark mode request from users, or if the brand asset changes.

---

## ADR-019 — One canonical presence definition
**Date:** 2026-06-12 (transform diagnostics, MON-22/MON-23)
**Status:** Final

**Decision:** Presence rate is defined exactly one way, everywhere:

- **Numerator:** every recorded position — `pour`, `contre`, `abstention`,
  **and `nonVotant`**. A nonVotant deputy was in the chamber; that is the
  documented data quirk and it counts as present.
- **Denominator:** the number of votes held **during the deputy's mandate
  window** (`voted_at` between `mandate_start` and `mandate_end`, unbounded
  when null). A deputy elected mid-legislature is not "absent" for votes that
  happened before they held a seat.
- **Capped at 1** to absorb data quirks (positions recorded outside the
  stored mandate window).

Pour/contre/abstention **percentages** divide by expressed positions only
(`pour + contre + abstention`) — nonVotant is presence, not an opinion.

**Where it lives:** `mart_deputy_scorecard` is the reference implementation.
The RAG chunker (`chunker.py`, `chunk_notable_deputies.py`) and the SQL
router (`sql_router.party_presence_rate`) replicate the same formula inline
because they run against raw tables before the daily dbt run refreshes the
marts.

**Reason:** the diagnostic found presence computed three different ways
(mart/deputy chunks counted nonVotant as present; notable chunks and the SQL
router did not), so the platform's flagship metric contradicted itself
depending on which path answered the question.

**Rule:** any new consumer of presence either reads
`mart_deputy_scorecard.presence_rate` or copies this exact formula. Do not
invent a fourth definition.

---

## ADR-020 — Railway/dbt deploy ordering is a known race, not a bug
**Date:** 2026-06-13
**Status:** Final — documented constraint

**Decision:** On merge to `master`, Railway auto-deploys the API and `deploy.yml`
runs dbt concurrently, with no coordination between them. Railway is typically
faster. This race is accepted at current scale.

**Reason:** At current scale (two small mart tables, no column additions under active
development), the window where the API queries pre-deploy marts is seconds long and
causes only graceful degradation (`/health` degrades, routers return stale counts —
no crash). Sequencing the Railway deploy after dbt would require maintaining a
Railway deploy webhook and adds operational complexity that isn't justified today.

**Constraint:** Any PR that adds a new mart column the API reads must either:
1. Be backward-compatible (API reads the column with a fallback) so the pre-dbt
   window doesn't break anything; or
2. Trigger the Railway deploy explicitly from `deploy.yml` using the Railway deploy
   hook — revisit this ADR at that point.

Do not assume dbt has run before the API starts serving a new deployment.

---

## ADR-021 — infra/ archived (MON-46)
**Date:** 2026-06-16
**Status:** Final

**Decision:** The Terraform IaC moved from `infra/` to `archive/infra-aws/`.
The `terraform.yml` CI workflow was deleted. This supersedes ADR-004.

**Reason:** The diagnostic audit (infra axis, 2026-06-11) found the stack was
well-written and validate-clean but blueprinted the wrong system: an
Airflow+Spark data platform ADR-001 explicitly decided not to build, with no
compute module for the actual FastAPI app. If applied, it would produce a
~$250/mo VPC, four empty buckets, and a blank Postgres serving nothing.
Keeping it validate-only (ADR-004) cost nothing in CI but kept a fourth
deployment story alive that contradicted Railway + Supabase — every future
session reading CLAUDE.md or this file paid a small tax parsing it.

**What's salvageable:** `networking`, `s3`, and `rds` modules are kept as
reference in the archive — roughly 40% of the stack. The `ec2` module
(Airflow/Spark hosts) does not survive a real migration design and should be
rewritten from scratch.

**Future:** If an AWS migration becomes real, start with a state backend
(none exists today, not even commented) and an App Runner/ECS module for the
FastAPI app — a different module set than what's archived here.

---

## Rules for future development sessions

1. Read this file before writing any code
2. If a prompt contradicts a decision here — flag it, don't build it
3. Kafka is not part of this project (ADR-001, ADR-005)
4. Airflow is local only (ADR-006) — do not write Railway/cloud Airflow config
5. Terraform IaC is archived, not live (ADR-004, ADR-021) — do not add terraform apply steps or resurrect infra/
6. Phase 5 alerts are deferred (ADR-002) — do not build email dispatch
7. When in doubt: check what's actually deployed before writing new code
