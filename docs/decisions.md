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
**Status:** Superseded by ADR-021 (infra/ archived)

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

**Notable deputy pinning (removed MON-76):** Retriever used to bypass cosine
search for known deputy names (Attal, Le Pen) and fetch their chunk
directly, then fill remaining slots with semantic search — a workaround for
an IVFFlat recall gap on rare named entities. Migration 003 dropped IVFFlat
in favor of an exact cosine scan (perfect recall at this corpus size, see
decision 5 in CLAUDE.md), so the pin became scaffolding around a problem
that no longer existed. Re-evaluated with a local MLflow run comparing
pin-on vs pin-off on the retrieval suite: identical keyword_score (0.875 =
0.875) and *higher* average top similarity with the pin off (0.622 vs
0.571) — the plain cosine scan on its own ranks the richer `deputy` chunk
above the hand-authored `notable_deputy` chunk. The pin, its DB-backed
notable-deputy map, and the forced-first-result logic in `retrieve()` were
removed; `get_notable_deputy_ids()` / `detect_notable_deputy()` remain in
`rag/chain/retriever.py` because `rag/chain/llm_router.py` still uses them
to route deputy-specific questions to RAG instead of a ranking-intent SQL
query — that is a routing concern, not a retrieval-ranking one.

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

**Update (MON-219):** the department fix above was a second-pass backfill,
which meant a soft-failed `update_party.py` run left every deputy showing
raw codes for a full day. `scripts/ingest_deputies.py`'s `parse_deputy()`
now expands the code to its full name at insert time, importing the shared
`DEPT_NAMES` map from `api/departments_data.py` (the same map
`update_party.py` now also imports, instead of keeping its own copy).
`update_party.py`'s `update_departments()` step stays as a defensive
backfill for any row still holding a raw code, but is no longer the only
path to a correct value. Party remains a genuine two-phase dependency —
AMO10 has no inline party, so `party`/`party_short` are still NULL at
insert time and only `update_party.py` can fill them.

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
- PWA icons (`public/icon-192.png`, `public/icon-512.png`) were 1×1 placeholders until MON-115 — they are now generated from `src/app/icon.svg` via `frontend/scripts/generate_icons.js` (which also emits `src/app/apple-icon.png`); re-run that script if the icon changes
- Dark mode infrastructure (next-themes, dark: Tailwind classes) is **deferred** — build only when there is real user demand — **superseded by ADR-027**

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

## ADR-022 - Fact-check verdicts are stored, not recomputed (MON-125)
**Date:** 2026-07-14
**Status:** Final

**Decision:** The "Vérifier une affirmation" feature (MON-111) persists each verification in a new `verifications` table.
The share URL is `/verifier/v/<id>` where `<id>` is a server-generated UUID.
A shared verdict is an immutable snapshot; it is never recomputed on view.

**Reason:** The rejected alternative was a stateless share URL that encodes the claim in the query string and re-runs the verification chain on every load.
It fails on three counts:

- **The share moment is the product.** A verdict link posted under a viral claim gets hit by social-media crawlers and burst traffic. Stateless means every preview fetch and every click runs retrieval + a Groq call: seconds of latency behind a 10 req/min rate limit, exactly when the link matters most. Stored verdicts are indexed DB reads.
- **Unauthenticated LLM-cost surface.** A URL that triggers an LLM call on arbitrary attacker-controlled text is an abuse vector (crawler loops, scripted hammering). Stored ids make shared pages LLM-free; only the explicit "vérifier" action costs a model call.
- **Verdict integrity.** A fact-check that silently changes between the moment it was shared and the moment it is read undermines the trust the feature exists to build. The snapshot states "vérifié le \<date\>" and the data horizon; freshness is handled by an explicit "re-vérifier" action that creates a new verification, not by mutating the old one.

Costs accepted: one additive migration (idempotent, follows the `schema_migrations` ledger pattern) and persisting short user-submitted claim text.
Mitigations: no user identity is stored with a claim, UUIDs are unguessable so stored claims are not enumerable, and there is no public listing of verifications.

**Canonical `VerifyResponse` schema** (MON-126 implements this verbatim; all fields present on every verdict, nullable where noted):

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID string | Verification id; path segment of the share URL |
| `claim` | string | The claim as verified (trimmed, length-capped) |
| `verdict` | enum | `vrai` \| `faux` \| `trompeur` \| `inverifiable` |
| `explanation` | string | French prose justification citing the scrutins |
| `deputy` | object \| null | `{deputy_id, name, party}`; null when no deputy was identified |
| `citations` | array | `[{vote_id, title, voted_at, result, deputy_position}]`; may be empty only when verdict is `inverifiable`; every `vote_id` must exist in `votes` (enforced in code) |
| `confidence` | enum | `ÉLEVÉ` \| `MOYEN` \| `FAIBLE`, retrieval-based per ADR-016, never LLM self-rated |
| `data_horizon` | string (ISO date) | Earliest vote date in the production window |
| `verified_at` | string (ISO datetime) | When this verification was computed |
| `share_url` | string | Absolute URL `/verifier/v/<id>` |

**Impact:**
- MON-126 adds the `verifications` table (additive migration) and `POST /verify/` returning this schema; `GET /verify/<id>` serves stored verdicts with no LLM call.
- MON-127/MON-128 build the share page and OG card from the stored verdict only; they must not trigger verification on view.
- Do NOT recompute a verdict on page load, and do NOT add a claim query-string mode that runs the chain on GET.
- Do NOT add listing/browsing of stored verifications without a moderation decision first.

**Trigger to revisit:** if verifications become a moderation or storage problem (spam volume, legal takedown requests), revisit retention and add an expiry policy; if the Supabase free tier nears its limit, verifications are the first table to get a TTL.

---

## ADR-023 - Verifier UI merges into the chat; verify chain and share pages unchanged
**Date:** 2026-07-15
**Status:** Final

**Decision:** The claim-verification UI moves into the chat page as a "Vérifier" input mode plus a `verdict` chat-message type rendering the existing `VerdictCard`.
The standalone `/verifier` form page becomes a redirect to `/chat?mode=verify` (preserving the `?claim=` prefill used by "re-vérifier").
The backend split is untouched: `POST /search` and `POST /verify/` stay separate endpoints with separate rate limits, and `/verifier/v/<id>` share pages remain standalone immutable snapshots per ADR-022.

**Reason:** A chat question and a claim verification are the same user gesture - type French text, get a sourced answer - differing only in which chain runs (`ask()` vs `verify_claim()`) and how the result renders.
Two separate pages force the user to know the taxonomy before typing; one entry point with a mode toggle does not.
Verdicts as chat messages also join the conversation history, so a verification lives next to the exploration that led to it.

The rejected alternative was full auto-routing: the chat silently detects claim-shaped input and runs the verify chain.
It fails on three counts:

- **Misclassification cost is asymmetric.** A question wrongly routed to `/verify` burns the stricter 10 req/min verify budget, adds seconds of latency, and confuses the user; a claim wrongly routed to `/search` just gets a normal answer. Silent routing pays the expensive failure mode.
- **Every `/verify` call writes an immutable row.** Per ADR-022, verification creates a stored snapshot. A classifier should never decide when to create persistent records from user text.
- **Explicit verification is the trust signal.** The product's positioning is that a verdict is a deliberate, citable act against official scrutins - not a chat answer with a badge.

Auto-detection is kept but demoted to a nudge: a `verify_claim` intent added to the `llm_router` classifier makes the chat answer normally and offer a one-click "Vérifier cette affirmation" chip that runs `/verify` only on click.

**Impact:**
- The chat gains a mode toggle (Question | Vérifier), a persisted `verdict` message role, and reuses `VerdictCard` inside assistant bubbles with the `share_url` intact.
- `/verifier` (form page) redirects to `/chat?mode=verify`; its `?claim=` param must keep working.
- Do NOT auto-run `POST /verify/` from intent detection - detection may only render a nudge chip; the LLM call and the stored snapshot happen only on explicit user action.
- Do NOT touch `/verifier/v/[id]` pages or their OG cards - they stay standalone, LLM-free reads of stored verdicts (ADR-022); only their "re-vérifier" link retargets to the chat.
- Do NOT merge the endpoints or their rate limits; the frontend picks the endpoint from the active mode.

**Trigger to revisit:** if nudge click-through shows users overwhelmingly accept the detected intent (say >80% over a meaningful sample), revisit auto-running verification with an undo affordance; if verify traffic through the chat makes the 10 req/min limit a real bottleneck, revisit limits, not the routing.

---

## ADR-024 - Chat answers are shareable via a stored snapshot, mirroring ADR-022 (MON-66)

**Date:** 2026-07-17
**Status:** Final

**Decision:** A chat assistant message gets a "Partager" action that persists the answer the user already saw - question, answer text, sources, confidence, data source, and caveat - into a new `chat_shares` table via `POST /search/share`, and returns a share URL `/chat/s/<id>`. `GET /search/share/<id>` serves the stored snapshot with no LLM call. The share page is a standalone read-only view (`ChatAnswerCard`), not a re-render of the interactive chat bubble.

**Reason:** This is the same shape of decision as ADR-022, applied to `/search` instead of `/verify`: the share moment is unauthenticated, potentially high-traffic, and must not trigger a Groq call. Two design points specific to chat answers:

- **Store the client-submitted answer, don't recompute it.** Unlike `/verify`, which computes its own verdict server-side from the claim, a chat share persists the *exact* answer text the user already received from an earlier `/search` call - the user is sharing what they saw, and the LLM is non-deterministic at temperature 0.2, so recomputing at share time could silently produce a different answer than what was shared. This mirrors the existing `POST /feedback/chat` endpoint (MON-70), which already accepts client-submitted `question`/`answer`/`sources` without recomputation - `chat_shares` uses the same trust boundary, not a new one.
- **A dedicated table, not the generic `feedback` sink.** `feedback` is write-only (moderation triage, never served back to users per row). A share is read back publicly at a stable URL and needs OG metadata, so it gets its own table with the immutable-snapshot shape from `verifications` (UUID PK, no user identity, `created_at`), not a `type`-discriminated `payload` row.

**Impact:**
- MON-66 adds the `chat_shares` table (additive migration `007_chat_shares.sql`) and `POST /search/share` / `GET /search/share/<id>`.
- The chat page's assistant message gains a "Partager" action next to "Copier", reusing the `ShareButton` component's native-share-or-clipboard behavior.
- `mdToHtml`, `mapSource`, and the confidence badge metadata moved from `chat/page.tsx` into `frontend/src/lib/chatFormat.ts` so the share page renders an answer identically to the chat bubble.
- Do NOT recompute the answer on `POST /search/share` or on `GET /search/share/<id>` - both are LLM-free by construction (share stores what was already computed; get is a plain SELECT).
- Do NOT add listing/browsing of stored shares without a moderation decision first (same constraint as ADR-022's verifications).

**Trigger to revisit:** if shared answers become a moderation or impersonation problem (fabricated MonÉlu-branded content circulating), add server-side validation against a real `/search` call or a moderation queue before serving new shares; if storage nears the Supabase free tier limit, `chat_shares` is a TTL candidate alongside `verifications`.

---

## ADR-025 - Quiz matching is server-side, shares are stored snapshots, questions live in the repo (MON-135)

**Date:** 2026-07-17
**Status:** Final

**Decision:** The vote-matching quiz (MON-109) is built on three choices:

1. **Agreement computation is server-side** - one `POST /quiz/match` call in a new `api/routers/quiz.py` computes agreement against all deputies and groups from `vote_positions`. Nothing about the request is persisted or logged: answers in, results out (RGPD-clean by construction).
2. **Shared results are stored immutable snapshots** - a `quiz_shares` table with the exact shape and semantics of `chat_shares` (ADR-024) / `verifications` (ADR-022): UUID PK, no user identity, never updated, served by a plain SELECT at `/quiz/s/<id>` with a per-route OG image.
3. **The curated question set is a versioned repo file, not a DB table** - ~10 entries (vote_id, plain-French question, one-line context) plus a question-set version string (e.g. `2026-Q3`), curated quarterly by PR. The backend serves it via `GET /quiz/questions` so the frontend never hardcodes it.

**Reason:**

- **Server-side over client-side matching.** Client-side needs the full position matrix for the quiz votes (~10 × 577 rows) shipped to every visitor, either as a per-visit fetch or a prebuilt static file that goes stale against the daily ingestion cron. Server-side keeps one source of truth in Postgres, keeps the denominator rules (nonVotant/absent excluded - consistent with ADR-019's presence definition) in one tested place, gets rate limiting for free via the shared limiter, and the share endpoint can trust the result it stores because the server computed it. RGPD is not the differentiator - both variants can avoid storing anything - but server-side makes the "we store nothing" claim auditable in one router.
- **Stored snapshot over URL-encoded results.** A URL-encoded result card is forgeable: anyone can craft "Je vote à 100% comme X" links with arbitrary numbers, and MonÉlu-branded OG images would render whatever the URL claims - unacceptable for a civic-credibility product. Snapshots created by `POST /quiz/share` only ever contain server-computed results, match the two existing share surfaces (one pattern, one moderation story), and keep share URLs short. This deliberately diverges from ADR-024's trust boundary (chat shares store the client-submitted answer without recomputation): that was justified there because LLM answers are non-deterministic and cannot be recomputed faithfully, whereas quiz results are deterministic functions of the answers and can always be recomputed or validated server-side. The snapshot stores the rendered result (top matches, group alignment, department comparison, question-set version) - not the postal code and not any identity; the raw answers are stored only insofar as they appear in the rendered card.
- **Repo file over DB table for questions.** Ten entries touched four times a year need PR review of French phrasing and neutrality, git history, and CI validation (an integration test can assert every vote_id exists) - a DB table would need a migration, seeding logic, and editing tooling for no benefit at this size. The version string stored in each share keeps old share cards attributable to the question set that produced them.

**Impact:**
- MON-137 implements `POST /quiz/match` + `GET /quiz/questions` (no new table); MON-139 adds the `quiz_shares` migration + `POST /quiz/share` / `GET /quiz/share/<id>`.
- Do NOT persist or log quiz answers, postal codes, or department codes on `/quiz/match` - the request must stay stateless.
- Do NOT accept client-computed percentages on `POST /quiz/share` - the share payload must be validated against (or recomputed by) the server-side matching, otherwise the forgery problem returns through the back door.
- Do NOT put the question set in the database or fetch it from the AN portal at runtime - it is a curated editorial artifact, updated by PR (MON-136 documents the curation criteria).
- Do NOT add listing/browsing of stored quiz shares without a moderation decision first (same constraint as ADR-022/024).

**Trigger to revisit:** if the quiz outgrows ~30 questions or needs non-engineer curation, move the question set to a table with an admin surface; if `/quiz/match` traffic makes per-request SQL a bottleneck, precompute the deputy-position matrix for the active question set into a cache (it changes only on ingestion); storage pressure follows the same TTL path as ADR-022/024.

---

## ADR-026 - Group profile pages: no new mart, slugs from a canonical label enum (MON-108/MON-149)

**Date:** 2026-07-21
**Status:** Final

**Decision:** Parliamentary group profile pages (`/groupes/[slug]`) are built on three choices:

1. **Live SQL aggregation over existing marts, not a new dbt mart.** `GET /groups/{slug}` (MON-150) computes group-level participation and cohesion by aggregating `mart_deputy_scorecard` and `mart_party_alignment` `GROUP BY party` at request time, plus a raw `vote_positions`/`votes` query for the most-divided votes - the same shape as the `/departements/[code]` endpoint (MON-107), which needed no new mart either.
2. **Slugs are derived from the canonical `deputies.party` enum, not a new dimension table.** `scripts/backfill_party_labels.py` already enforces exactly 12 canonical `party` string values (`CANONICAL_LABELS`), including the literal group `"Non inscrit"`. `api/groups_data.py` hardcodes a `{slug: canonical_label}` map for these 12 values (mirroring `DEPT_NAMES` in `api/departments_data.py`) rather than introducing a `groups` table or a slug column.
3. **"Non inscrit" gets its own group page; NULL-party deputies get none.** `"Non inscrit"` is a real, enforced canonical label (deputies formally unattached to any group) and is treated as the 12th group with a normal roster page. The 2/577 deputies whose `party` is still `NULL` (ADR-009's documented edge case - ingested but never backfilled) are excluded from every group roster and render with no group link on their own profile, rather than 404s or a 13th synthetic group.

**Reason:**

- **No new mart.** At current scale (577 deputies, 12 groups) a `GROUP BY` over two existing marts plus one raw-table query costs nothing extra and ships in one PR. A new `mart_group_stats` model would need its own dbt test suite, and - per ADR-020 - any new mart column the API reads risks the Railway/dbt deploy race (API deployed before dbt has run against it). Skipping the new mart sidesteps that risk entirely; the existing marts are already live and stable.
- **Enum-based slugs over a dimension table.** Group membership has been a free-text column since ADR-009 (organeRef IDs backfilled to plain names via `scripts/update_party.py`, later tightened to an enforced canonical set by `scripts/backfill_party_labels.py`). Introducing a `groups` table now would need a migration, a foreign key backfill, and a join added to every existing query that reads `deputies.party` - all to serve twelve fixed strings that already have exactly one enforced spelling each. A hardcoded slug map costs one file and mirrors a pattern (`departments_data.py`) already proven in production.
- **Participation/cohesion reuses ADR-019.** The group's presence/participation aggregate is the mean of `mart_deputy_scorecard.presence_rate` over the group's current members - the same canonical formula, not a new definition, per ADR-019's rule.
- **"Non inscrit" as a real group vs. NULL as no group.** Conflating them would either hide "Non inscrit" deputies from the navigation graph (they are real, current deputies who chose no group) or dress up 2 malformed rows as a fake 13th group with no real cohesion signal. Treating them differently keeps the page honest: every deputy with a real group value gets a working link, and the 2 NULL rows are a data-quality artifact, not a group.

**Slug scheme:** lowercase, strip French diacritics, replace `&`/`,`/spaces with `-`, collapse repeats. Canonical label -> slug map (`api/groups_data.py`), e.g.:
- Rassemblement National -> `rassemblement-national`
- Ensemble pour la République -> `ensemble-pour-la-republique`
- La France insoumise - Nouveau Front Populaire -> `lfi-nfp`
- Socialistes et apparentés -> `socialistes-et-apparentes`
- Droite Républicaine -> `droite-republicaine`
- Écologiste et Social -> `ecologiste-et-social`
- Les Démocrates -> `les-democrates`
- Horizons & Indépendants -> `horizons-independants`
- Libertés, Indépendants, Outre-mer et Territoires -> `liot`
- Union des droites pour la République -> `union-des-droites`
- Gauche Démocrate et Républicaine -> `gauche-democrate-republicaine`
- Non inscrit -> `non-inscrits`

These are full human-readable slugs, not the existing `CANONICAL_SHORT_LABELS` codes (`scripts/backfill_party_labels.py`, e.g. `LFI`, `LIOT`, `RN` - already the source `partyShort()` reads on the frontend): the epic's own rationale is citable, SEO-legible URLs ("les frondeurs de X"), which two- or three-letter codes don't serve. `liot` happens to coincide with its existing short code; `lfi-nfp` is a deliberate one-off exception (not a mechanical derivation of `LFI`) chosen for search relevance, since "Nouveau Front Populaire" is the more current, more-searched coalition name for that group. Do not "simplify" `lfi-nfp` to `lfi` to match the short-label table - the two naming schemes serve different purposes and are allowed to diverge.

**Impact:**
- MON-150 (`api/routers/groups.py`, `api/groups_data.py`) implements `GET /groups/{slug}` per this decision - no dbt migration, no new mart.
- MON-151 (`/groupes/[slug]` page) and MON-152 (cross-links) rely on the slug map above; the frontend must use the same twelve slugs (mirrored into `frontend/src/lib/groups.ts`, following the `departments.ts` precedent) rather than re-deriving them.
- Do NOT create a `groups`/`parties` table or a slug column on `deputies` for this feature.
- Do NOT link to a group page for a deputy whose `party` is `NULL` - render the party cell as plain text instead.
- Do NOT slugify `party` strings at request time - the map is a fixed enum matching `CANONICAL_LABELS`, so an unrecognized value is a data bug (flag it), not a new group to render.

**Trigger to revisit:** if `CANONICAL_LABELS` changes (a group renames, splits, or merges - it has happened before with French legislature groups), update the slug map in the same PR that updates `backfill_party_labels.py`. If group-level aggregation ever needs cross-vote joins expensive enough to matter (materialized view or dedicated mart), revisit choice 1 - nothing here blocks adding a mart later.

---

## ADR-027 — Dark mode deferral reversed (MON-103)

**Date:** 2026-07-21
**Status:** Current
**Supersedes:** the dark-mode deferral clause in ADR-018

**Decision:** Build dark mode across the app. The cinematic landing page (`frontend/src/app/page.tsx` and its section components) is explicitly excluded — it keeps its fixed navy/red visual treatment with no dark variant. Every other page gets dark theme tokens, a light/dark toggle, and persistence (localStorage, falling back to `prefers-color-scheme`).

**Reason:** ADR-018 deferred dark mode infrastructure "until there is real user demand," with the trigger to revisit being "dark mode request from users." MON-103 is a direct product decision to build it now — the trigger has been pulled. Since ADR-018's deferral was a single clause inside a decision primarily about the logo rebuild (which remains valid and already ships a `variant="dark"` prop on `MonEluLogo` in anticipation of this), this is recorded as its own ADR rather than rewriting ADR-018.

**Impact:**
- `MON-103` is decomposed into solve-mon-sized sub-issues (theme infra + toggle, per-surface page/component passes, chart/badge contrast audit) — see the epic's sub-issues in Linear.
- Do NOT add a dark variant to the landing page (`frontend/src/app/page.tsx`) or its section components — out of scope by design, not an oversight.
- `MonEluLogo`'s existing `variant="dark"` prop (ADR-018) is the intended way to render the logo on dark surfaces — reuse it, don't fork the logo again.
- Tailwind `darkMode` strategy (class-based, driven by the toggle) and the toggle's persistence mechanism are decided in the first sub-issue (theme infra), not re-litigated per page.

**Trigger to revisit:** N/A — this is the terminal state for the deferral question. Future revisits would only concern the toggle's UX or token values, not whether dark mode gets built.

---

## ADR-028 — Friend comparison: opt-in answer storage in quiz shares, client-side comparison (MON-178/MON-179)

**Date:** 2026-07-23
**Status:** Final
**Amends:** ADR-025's "Stored snapshot over URL-encoded results" reason bullet, which stated raw quiz answers are "stored only insofar as they appear in the rendered card" — friend comparison (MON-184) needs the sharer's full answer set available to a later visitor, so that clause is superseded by this ADR. The rest of ADR-025 (server-side match computation, snapshot immutability, repo-file question set, rate limiting) is unchanged.

**Decision:** Three choices, scoped to the friend-comparison feature (MON-178 step 6 / MON-184):

1. **Storage shape: extend `quiz_shares.result` JSONB with an optional `answers` array — no new column, no new table.** `POST /quiz/share` gains a request field `include_answers: bool = False`. When `false` (the default), the insert is byte-identical to today's `(version, result)` row. When `true`, the server adds the already-validated `answers` (the same `list[QuizAnswer]` submitted for the match computation, never a client-supplied separate payload) into the `result` JSONB before insert. `GET /quiz/share/{id}` returns `answers` when present, `null`/absent otherwise — no schema migration needed since `result` is already JSONB.
2. **Opt-in, default off, surfaced as a checkbox.** The frontend share flow (`QuizClient.tsx` ShareResultButton area) adds a checkbox, unchecked by default, gating `include_answers`. A share created without checking it must be indistinguishable from a pre-MON-184 share.
3. **Comparison is computed client-side — no `POST /quiz/compare` endpoint.** A visitor arriving at `/quiz?compare=<share_id>` fetches the stored share (which includes the sharer's `answers` because the CTA only appears when they're present) and, on completing their own quiz, diffs the two answer sets in the browser. Nothing is persisted or logged for the comparison itself, matching `/quiz/match`'s statelessness.

**Reason:**

- **JSONB extension over a new column/table.** The two answer sets involved (sharer's `QuizAnswer[]`, already validated by the existing `_answers_known_and_unique` validator) are small (~10 entries), have no independent query pattern (never filtered, joined, or indexed on), and are always read as a unit alongside the rest of the snapshot. A new column would need a migration for a field that's optional and structurally identical to data already inside `result`; a separate table would need its own FK, its own retention/moderation story, and buys nothing since answers are only ever fetched together with the share they belong to.
- **Opt-in, not opt-out.** ADR-025 built quiz matching to be RGPD-clean by construction ("answers in, results out"); storing raw answers is a real behavior change, not a rendering detail, so it must be an explicit, visible, off-by-default user choice — consistent with the privacy-first posture the quiz intro copy already promises (see MON-175). This is why `include_answers` defaults to `False` at the API layer, not just in the frontend UI: a client that omits the field must get today's behavior, not an implicit opt-in.
- **Client-side comparison over a new endpoint.** ADR-025's server-side-computation principle exists to make match *results* non-forgeable — a visitor could otherwise claim "je vote à 100% comme X" with fabricated numbers on a MonÉlu-branded card. Friend comparison doesn't have that risk: both answer sets being compared are already server-computed and already in the visitor's possession (their own submitted answers, and the sharer's answers from the fetched snapshot) before any comparison math runs. Counting agreement between two known, trusted sets client-side produces the same output a server endpoint would, without adding persistence, a new rate-limit surface, or a new router — and nothing about the comparison is stored or shareable as its own artifact (the visitor's *own* subsequent share, per MON-184's acceptance criteria, never carries the original sharer's data forward).
- **Privacy copy contract with MON-175.** MON-175 fixes the general share-flow disclosure. The `include_answers` checkbox needs its own line, additive to that base disclosure, not a competing paragraph: base disclosure always shows when sharing; a second line appears only when the checkbox is checked, stating that the sharer's answers will be included and visible to anyone who opens the link (enabling comparison). MON-175 and MON-184 must both reference this same disclosure component rather than each inventing wording. **Resolved (MON-175):** the base disclosure is "Le lien créé est public." — the département clause was pulled out into its own conditional line (only rendered when a `department` was resolved), gated by its own opt-out checkbox (default checked — `includeDepartment`) mirroring `includeAnswers`'s opt-in shape. Unchecking it omits `department` from the `POST /quiz/share` call entirely, so the server never computes or stores `my_department` for that share — no backend change needed, since `_compute_match` already treats a missing `department` as "no department section."

- **The opt-in gates derived encodings too, not just the raw `answers` array (MON-203).**
The curated question set carries exactly one question per `theme` (a hard rule in `docs/quiz-curation.md`),
so naming the themes a taker voted pour / contre identifies their answers exactly — it is the same
information in different words, not a coarser summary.
That is the reasoning `_strip_detail` already applies to the per-question `detail` block, and it generalizes:
any snapshot field from which the sharer's answers can be reconstructed is subject to `include_answers`,
whatever its shape.
The `themes` summary added for the MON-203 share card is therefore stripped from the stored snapshot unless the sharer opted in.
`POST /quiz/match` always returns it — the live results screen is the taker's own browser, not a published document.

**Impact:**
- MON-184 implements: `include_answers` field on `POST /quiz/share`; `answers` returned by `GET /quiz/share/{id}` when present; the opt-in checkbox with the two-tier disclosure copy described above; client-side comparison logic in `QuizClient.tsx` for `/quiz?compare=<share_id>`; version-mismatch (`share.result.version !== QUIZ_VERSION`) falls back to the plain quiz flow with a notice, since answers are keyed to a specific question-set version.
- Do NOT add a `POST /quiz/compare` endpoint or persist/log comparison results — comparison stays exactly as stateless as `/quiz/match`.
- Do NOT default `include_answers` to `true`, and do NOT let a request that omits the field behave as if it were `true`.
- Do NOT let the comparison taker's own share (if they choose to share their result) carry the original sharer's `answers` forward — each share's `answers` field reflects only its own creator's opt-in choice.
- Do NOT invent separate disclosure copy for the opt-in checkbox — it must compose with the base share-link disclosure from MON-175, not contradict it.
- Do NOT add a snapshot field that lets the sharer's answers be reconstructed without gating it on `include_answers` — `detail` (MON-181) and `themes` (MON-203) are both stripped for this reason. Check any new derived field against "could a reader recover which way they answered?", not against whether it literally contains an answers array.

**Trigger to revisit:** if comparison needs to extend beyond two parties (e.g. group/leaderboard comparison), the client-side-diff approach may need a server aggregation step — revisit choice 3. If `answers` storage meaningfully changes `quiz_shares` row size or moderation exposure at scale, revisit choice 1 in favor of a separate table with its own retention policy.

---

## ADR-029 — Sustainability model: donations first, supporter tier on existing infra, grants opportunistic (MON-116)

**Date:** 2026-07-27
**Status:** Final

**Decision:** Three funding tracks, not one, with an explicit priority order:

1. **Donations are the primary mechanism.** A "coûts du projet" page (new `frontend/src/app/couts/`) publishes actual monthly infra spend (Railway ~$5/month, Supabase — free today, paid tier once upgraded) next to a HelloAsso donation link. HelloAsso is chosen over Stripe for the donation flow specifically: no mandatory platform fee (donors get an optional tip prompt instead), and no MonÉlu-run payment code to build, secure, or reconcile — it's an outbound link, not an integration. (HelloAsso primarily serves declared associations, not informal projects — confirming MonÉlu's eligibility for an account is part of the follow-up page issue, not settled by this ADR.) This mirrors the NosDéputés/Wikipedia trust model the issue proposes: donations funding a transparently-costed public good, fully decoupled from content or ranking.
2. **The supporter API tier ships on infrastructure that already exists — no new billing integration.** MON-98 already gives every `api_keys` row a `rate_limit_multiplier` column and a manual issuance flow (email request → row insert). A paid tier reuses this as-is: a heavy commercial user pays via the same HelloAsso (or a Stripe payment link, for a one-off business invoice HelloAsso doesn't fit) and an admin bumps their key's multiplier by hand. No `stripe`/webhook code, no `plan` column, no automated billing is built now.
3. **Institutional grants are pursued opportunistically, not scheduled.** NGI/EU civic-tech funds and French foundations (e.g. Fondation pour le progrès de l'homme) are worth applying to, but grant cycles are external and slow — this track has no code impact and blocks nothing else here.

**First spend target:** once donation income covers it, the Supabase upgrade to backfill the full legislature (`2024-07-07` instead of the free-tier-forced `2025-07-01`, decision 7 in CLAUDE.md / ADR-003's migration trigger). The ingestion pipeline already supports this — `make ingest-prod` with an earlier `--since` — so the upgrade is pure spend, not engineering work.

**Reason:**

- **Why donations over supporter-tier-first:** the API tier already has real technical debt in the other direction — MON-98 shipped it manually-issued specifically because no signup/billing flow exists, and heavy commercial users of a civic-transparency API are a smaller, slower-to-materialize audience than potential individual donors reacting to "your presence rate ignores year one." Donations can start collecting before any code ships (the page is the only build); a monetized API tier needs a paying customer to show up first.
- **Why not build a full billing integration now:** zero paying customers exist today. Wiring Stripe subscriptions or a webhook against `api_keys.rate_limit_multiplier` before a single commercial user has asked to pay is exactly the kind of premature engineering ADR-002 (alerts) and ADR-014 (RAG Phase C) already reject elsewhere in this project — build the trigger, not the infrastructure, first.
- **Why HelloAsso for donations specifically:** Stripe takes a percentage fee on every transaction and is built for commercial checkout, not association giving; HelloAsso is the standard French civic/nonprofit donation rail (used by NosDéputés and similar transparency projects) with no mandatory platform fee, and needs zero MonÉlu-side payment code — just a link and a page stating where the money goes.
- **Why the Supabase backfill is the named first spend target, not left generic:** the issue itself identifies the data horizon (2025-07-01 vs the legislature's 2024-07-07 start) as "the single biggest product weakness vs Datan/NosDéputés" per this ADR's own research — it's the one spend that directly fixes a named competitive gap, is already engineered (idempotent upsert, just needs an earlier `--since`), and gives donors a concrete, achievable target to fund rather than an abstract "support us."

**Impact:**
- Follow-up issues (filed separately, not built under MON-116 itself): a donations/cost-transparency page (`/couts`) with the HelloAsso link and live-ish infra cost figures; a Footer.tsx + `sitemap.ts` entry for that page; a documented manual process for bumping `rate_limit_multiplier` on payment (no code change — an ops runbook note, not a migration).
- Do NOT build Stripe/webhook billing integration or a `plan` column on `api_keys` until a real paying commercial API customer exists — reuse the existing manual `rate_limit_multiplier` flow (MON-98) instead.
- Do NOT block the donations page or the Supabase backfill spend on grant outcomes — grants are a parallel, opportunistic track with no dependency in either direction.
- Do NOT run the Supabase upgrade or `make ingest-prod --since 2024-07-07` backfill until donation (or other) income actually covers the higher tier — this ADR sets the spend target, it does not authorize the spend itself.

**Trigger to revisit:** first paying commercial API customer (build the minimal billing hook then, not before); Supabase free tier hit (500 MB, ADR-003's existing migration trigger) or donation income sufficient to upgrade voluntarily; a grant application actually being awarded (would likely fund the backfill directly, making the donation-funded path moot for that specific spend).

---

## ADR-030 — Agenda: one denormalized table, soft-state refresh, séance publique only (MON-209)

**Date:** 2026-08-02
**Status:** Final

**Decision:** The MON-110 agenda ingestion lands in a single new table, scoped to séance publique, refreshed by upsert with no DELETE.

**1. One denormalized `agenda_items` table, not two, and not an extension of `votes`.**
One row per ODJ point, with the parent réunion's fields inlined.
`votes` is keyed on the AN scrutin uid and only exists once a vote has happened; an agenda item may never become a scrutin at all, and 69 % of them carry no dossier reference to become one by.
The exact column set MON-210 must create:

```sql
CREATE TABLE IF NOT EXISTS agenda_items (
    point_uid       TEXT PRIMARY KEY,        -- ODJ point uid, e.g. RUANR5L17S2026IDS29879PT50907
    reunion_uid     TEXT NOT NULL,           -- parent réunion uid
    sitting_start   TIMESTAMPTZ NOT NULL,    -- réunion timeStampDebut
    sitting_end     TIMESTAMPTZ,             -- réunion timeStampFin
    objet           TEXT,                    -- free text; may be a one-word stub
    point_type      TEXT,                    -- typePointODJ ("Vote solennel", "Discussion", …)
    travaux_nature  TEXT,                    -- natureTravauxODJ (ODJPR | ODJSN | ODJAN)
    procedure_label TEXT,                    -- point procedure; present on ~5 % of points
    dossier_id      TEXT,                    -- dossiersLegislatifsRefs.dossierRef; joins votes.dossier_id
    reunion_etat    TEXT NOT NULL,           -- réunion cycleDeVie.etat (Confirmé | Annulé | Supprimé | Eventuel)
    point_etat      TEXT,                    -- point cycleDeVie.etat
    published_at    DATE,                    -- cycleDeVie.chrono.creation, when the item was scheduled
    cancelled_at    DATE,                    -- cycleDeVie.chrono.cloture, set when cancelled
    objet_hash      TEXT,                    -- sha256 of objet; drives summary regeneration
    summary_plain   TEXT,                    -- Groq one-liner; NULL for stubs, by design
    theme           TEXT,                    -- one of VALID_THEMES, or NULL
    last_seen_at    TIMESTAMPTZ NOT NULL,    -- stamped on every ingestion run
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`point_uid` is verified present and unique across all 3 644 séance ODJ points in the export, so it is a safe natural key and no surrogate is needed (MON-77 removed exactly such a surrogate elsewhere).
Index `sitting_start` (every API query is a date window) and `dossier_id` (the join to `votes`).
No dbt mart: the API reads this table directly, as ADR-026 established for group pages.

**2. Refresh is soft-state plus `last_seen_at`. The upsert-only rule survives intact.**
Ingestion upserts on `point_uid` with `ON CONFLICT DO UPDATE` and stamps `last_seen_at` on every row it touches, including unchanged ones.
Nothing is ever deleted.
The API surfaces an item only when it was seen in the most recent completed ingestion run and its state is not `Annulé`/`Supprimé`.

This covers two distinct disappearance modes, which is why the freshness stamp is not redundant with `etat`:
the Assemblée usually *marks* a cancelled sitting (`Supprimé`, 27 % of séances), but an item silently dropped from the export would otherwise sit on the page as a phantom forever, and MON-208 could not measure how often that happens.

**3. Séance publique only (`@xsi:type = seance_type`).**
Commission réunions are not ingested, despite being the bulk of the export and having better dossier coverage (72 % vs 31 %).

**4. Dossier linking.** An item links to a scrutin through `dossier_id = votes.dossier_id`.
Where a dossier has several scrutins, bind to the earliest one on or after the sitting date, so an item points at the vote it actually scheduled rather than an unrelated later reading of the same bill.
Where no scrutin exists yet, the link falls back to the official AN dossier page, the construction MON-89 already uses on vote cards.

**5. Summaries are generated only where there is something to summarize.**
Groq `llama-3.3-70b-versatile` at temperature 0.1, reusing the prompt and the `VALID_THEMES` set from `scripts/generate_vote_summaries.py`.
Items whose `objet` is a stub get **no LLM call and no summary**; the UI renders `point_type` instead.
A summary is regenerated when `objet_hash` changes.

**Reason:**

- **Why a new table rather than extending `votes`:** the two have different lifecycles and different cardinality. An agenda item exists before, and often without, a vote. Forcing them into `votes` would mean nullable-everything rows that break every existing query's assumption that a row means a vote happened, and would corrupt `mart_vote_summary` and the RAG vote chunks downstream.
- **Why denormalized rather than a `reunions` + `agenda_items` pair:** every read is "points for a date window", so the join would be paid on every request to save roughly 1 000 duplicated sitting rows. At this scale normalization buys nothing. Cancelling a sitting updates its handful of point rows in one statement.
- **Why soft-state over full-replace:** a delete-and-reinsert window breaks the no-DELETE rule outright, discards the record that something *was* scheduled and then pulled (which is itself civic information), and makes a mid-run ingestion failure visible to users as an empty agenda. Upsert keeps the pipeline re-runnable at any time, which is the property CLAUDE.md decision 8 exists to protect.
- **Why `last_seen_at` and not just `etat`:** `etat` covers cancellations the Assemblée announces. It cannot cover an item that quietly vanishes from the export. MON-208 deliberately deferred measuring silent churn because the feed exposes only current values; the freshness stamp makes that unmeasured risk structurally harmless instead of leaving it as an open question the page would eventually expose.
- **Why séance-only, against the better dossier coverage of commissions:** "what your committee is hearing this week" is a different product from "what gets voted this week", and MonÉlu's subject is votes. Ingesting commissions to keep them in reserve would double the summary spend and the ingestion surface for a product decision not yet taken. The parser is type-agnostic, so adding them later is a `--type` argument and a backfill, not a redesign.
- **Why the earliest scrutin on or after the sitting date:** a dossier accumulates scrutins across readings and years. Binding to the latest would make a 2024 agenda item link to a 2026 vote on the same bill; binding to the earliest overall would link forward to a vote that had already happened. Neither is what "here is how that sitting turned out" means.
- **Why no summary for stubs:** 16 % of ODJ points have `objet` values whose entire content is `Discussion` or `Questions au Gouvernement`. Sending one word to an LLM and rendering the result would produce invented specifics on a civic-transparency site, which is worse than showing the type label. Measured in MON-208, raised on MON-211.

**Impact:**
- MON-210 implements exactly the table above in `data/migrations/009_agenda.sql`, with no further schema decisions to make.
- MON-212's `GET /agenda` must filter on both freshness and state; an item not seen in the last run is invisible regardless of its `etat`.
- MON-213 renders `point_type` wherever `summary_plain` is NULL, and never renders a placeholder summary.
- CLAUDE.md decision 8 ("Upsert-only ingestion") is **unchanged and now applies here too**. This ADR does not create an exception to it; it shows the rule holds for a mutable source given a freshness column.
- Out of scope, deliberately: RAG indexing of agenda chunks, alert triggers (MON-91, and ADR-002 still defers the dispatch machinery), and bill-timeline deep links (MON-105).
- Scope note carried from MON-208 for MON-213: `Vote solennel` (84 points over two years) is the headline section and `Suite de la discussion` should be collapsed rather than listed per day, since the latter repeats across consecutive days of one bill.

**Trigger to revisit:** commission agenda demand (the parser already supports it, so this is a product call, not an engineering one); the AN publishing a real REST agenda API, which would supersede ADR-010's ZIP-only constraint; or observed phantom items surviving on the page, which would mean `last_seen_at` is being stamped incorrectly rather than that the model is wrong.

---

## ADR-031 - Null voted_at is a warn-only anomaly, not a hard test failure (MON-232)

**Date:** 2026-08-07
**Status:** Final

**Decision:** `votes.voted_at` stays nullable at ingestion (per ADR from MON-13's remediation), and null-dated rows stay filtered out of `stg_votes` and everything downstream.
The dbt source `not_null` test on `voted_at` (`transform/models/staging/sources.yml`) is downgraded to `severity: warn` instead of being dropped.

**Reason:**
Before this ADR, one upstream scrutin missing `dateScrutin` produced three contradictory outcomes at once: ingestion succeeded (by design, since MON-13 made the column nullable so a single bad record can't abort the whole `execute_batch`), the daily dbt test step failed hard and emailed a "stale data" alert that wasn't about staleness, and the vote itself never reached a mart or the API regardless of the test outcome.
Dropping the test entirely would remove the only visibility into how often this quirk actually happens.
Keeping it at `severity: warn` preserves that visibility in the dbt run output without blocking the daily pipeline or triggering a misleading failure email.
The staging filter is unchanged: a vote with no date is not something the API, marts, or RAG corpus can meaningfully render, so it stays invisible past `stg_votes` by design, not by accident.

**Impact:**
- `api/routers/votes.py`'s `NULLS LAST` keyset-cursor handling over `mart_vote_summary` cannot currently be exercised, since the mart can never contain a null `voted_at` row under this contract.
  It is kept as defense-in-depth rather than removed, since it only matters if the staging filter is ever relaxed, and the code cost of keeping it is small.
- Any future change to relax the `stg_votes` filter (e.g. surfacing undated votes in the UI) must revisit this ADR, since the warn-only test and the "invisible by design" framing both assume the filter stays in place.

**Trigger to revisit:** if the AN source starts omitting `dateScrutin` often enough that the warn becomes noise, or if a product decision surfaces undated votes to users instead of hiding them.

---

## ADR-034 - One canonical group-majority definition; quiz's tie-skip is a deliberate divergence (MON-228)

**Date:** 2026-08-10
**Status:** Final

**Decision:** "What did group X's majority vote on scrutin Y" is defined exactly one way, everywhere that a single majority position must be produced:

- **Formula:** plurality of the group's expressed positions (`pour`/`contre`/`abstention`) on that scrutin.
- **Tiebreak (MON-24):** when two or more positions tie for the top count, the tie resolves alphabetically — `abstention` < `contre` < `pour`. This is arbitrary but deterministic, which is the property that matters: the same tied scrutin must not resolve differently depending on which code path answers the question.

**Where it lives:** `transform/models/intermediate/int_party_vote_majority.sql` is the reference implementation (`select distinct on (party, vote_id) ... order by party, vote_id, position_count desc, position`) — it feeds `mart_party_alignment`, dissident counts, and `/deputies/{id}/dissident-votes`.
`api/routers/groups.py`'s `_majority_position` replicates the same formula and tiebreak in Python, over raw tables, rather than reading the mart — per ADR-026, group pages must keep working when the dbt marts are absent, and at current scale (~1,200 votes) a raw-table query plus in-Python sort is cheap enough that adding a mart dependency here isn't worth the Railway/dbt deploy-race risk (ADR-020).

**Quiz is a deliberate exception, not a bug:** `api/routers/quiz.py`'s `compute_group_alignment` (MON-183/MON-228) skips scrutins where the group's top two positions tie, rather than picking one via the tiebreak. A quiz "you agree with group X on this vote" is a claim about a real stance; on a genuine tie there is no line to agree or disagree with, so asserting one via an arbitrary tiebreak would misrepresent the group's actual position. This means quiz agreement percentages and the group page's majority-line badges can legitimately disagree on a tied scrutin — that is intended, not the MON-228 bug (the bug was groups.py and dbt each using a *different, undocumented* tiebreak; quiz's skip was always intentional, just previously undocumented).

**Reason:** the diagnostic (`api_diagnostic_2026-08-05.md`, Finding #1) found the group majority computed three different ways — dbt's alphabetical tiebreak, groups.py's old pour-first priority order (`pour >= contre >= abstention`, which silently favored `pour` on every tie), and quiz's skip-ties — so a tied scrutin could show a majority position on `/groupes/[slug]` that the mart-derived dissident stats on the same page contradicted, and that the quiz would have excluded entirely. Same shape as ADR-019 (MON-22, presence rate): one civic-credibility metric needs one definition, or the platform contradicts itself depending on which endpoint answered the question.

**Rule:** any new consumer that must produce a single group-majority position either reads `int_party_vote_majority` / `mart_party_alignment` or copies `_majority_position`'s exact formula (max count, alphabetical tiebreak). A consumer that only needs "does the group have a clear line" (not asserting one on ties) may follow quiz's skip-ties pattern instead, but must say so explicitly in a docstring, the way `compute_group_alignment` does now. Do not invent a third behavior.

**Trigger to revisit:** if `int_party_vote_majority` ever changes its tiebreak (e.g. to a non-alphabetical rule), `groups.py`'s `_majority_position` must change in the same PR — the two are required to stay byte-for-byte equivalent, not just similar.

---

## ADR-032 - Snapshot table retention: purgeable past 12 months, purge job deferred until the size alert fires (MON-225)

**Date:** 2026-08-11
**Status:** Deferred - policy decided, automated purge not built

**Decision:** `verifications`, `chat_shares`, `quiz_shares`, and `feedback` are immutable-by-design (never updated) but not immortal-by-design: rows older than 12 months are purgeable, since a share/verdict/feedback row's value is overwhelmingly in the weeks after it is created (viral share spikes, active triage), not a permanent archive obligation.
`api_key_usage` is a rolling per-day-per-key counter, not a user-facing snapshot, so it is purgeable on a much shorter horizon (90 days) once it needs it - accounting only ever looks at the current billing period.
No automated purge job is built in this change. `pg_database_size()` is now surfaced in `/health` (`db_size_mb`, `db_size_warning` at 400 MB) and polled by `ingest_prod.yml`, which emails an alert past that threshold - the purge job is built when that alert actually fires, not preemptively.

**Reason:** These four tables accept anonymous public writes with no delete path, on a 500 MB Supabase free-tier database already dominated by `vote_positions` (~715k rows). Unbounded growth is a real risk (a scripted client could write ~14k rows/day/IP before the existing 10/min rate limit even engages), but at current traffic none of these tables are a meaningful fraction of the 500 MB budget - building a purge job now would be speculative engineering against a threat that hasn't materialized. Deciding the retention window now (rather than improvising it under pressure when the DB is actually full) is the part worth doing today; writing the `DELETE` job is not, per the project's usual "decide now, build on trigger" pattern (see ADR-002).
A `DELETE`-based purge is also a real behavior change worth flagging explicitly: it breaks the "upsert-only, nothing is ever deleted" property these tables have had since launch, and it means old `/chat/s/<id>`, `/verifier/v/<id>`, and `/quiz/s/<id>` share links will eventually 404. That is an acceptable tradeoff for a 12-month horizon on links whose value is front-loaded, but it should not happen silently - the purge job's implementation should link back to this ADR when it's built.

**Impact:**
- `ChatShareRequest.sources` / `ChatFeedbackRequest.sources` now go through a bounded `ShareSourceItem` model (`api/routers/search.py`) instead of `list[dict]`: per-item `content` capped at 4000 chars, `metadata` capped at 20 keys / 2000 serialized bytes with scalar-only values, `similarity` bounded to `[0, 1]`. This closes the "megabytes of arbitrary JSONB in one request" gap independently of the retention question.
- No migration, cron, or script is added by this ADR. A future purge job is a normal follow-up issue (`DELETE FROM <table> WHERE created_at < now() - interval '12 months'`, batched, run from a workflow step) - not urgent today.

**Trigger to build the purge job:** `db_size_warning` in `/health` goes true (>= 400 MB) and the growth is attributable to these tables (check via `scripts/check_db_size.py`), or a scripted-abuse pattern is observed in `api_key_usage`/share row counts well before the size threshold.

---

## ADR-033 — Local Airflow/MinIO stack archived (MON-239)

**Date:** 2026-08-11
**Status:** Final
**Related:** ADR-021 (MON-46, the AWS half of the same dead architecture)

**Decision:** The local Airflow/MinIO stack moves from the live tree to `archive/airflow-local/`, next to `archive/infra-aws/`. This covers `ingestion/dags/` (both DAGs), `ingestion/utils/bronze_writer.py`, `quality/expectations/` (the Great Expectations suites, used only by these DAGs), `Dockerfile.airflow`, `docker-compose.airflow.yml`, `requirements-airflow.txt`, `scripts/setup_minio.py`, and `tests/test_bronze_writer.py`. The nine Makefile targets that drive this stack (`setup-minio`, `airflow-up`, `airflow-down`, `airflow-logs`, `minio-up`, `airflow-ui`, `minio-ui`, `dag-deputies`, `dag-votes`) and the Airflow/MinIO block in `.env.example` are removed rather than archived, since they are pure orchestration with nothing to preserve as reference.

**Reason:**

ADR-021 archived the AWS/Terraform half of the Airflow+Spark architecture ADR-001 decided not to build. The local half survived because it runs (docker compose up works, the DAGs execute against real scripts), so nothing ever forced the question the AWS half faced. That made it look like live infrastructure rather than the other half of the same shelved design — same architecture, same verdict, just not yet applied to this half.

Three concrete costs, all cited in the MON-239 issue and confirmed while implementing this ADR:

- **It breaks under normal cleanup.** PR #145 deleted `requirements-airflow.txt` as apparently-dead and broke the Airflow image build; PR #146 restored it with a warning comment telling future readers not to repeat the mistake. A file that needs a comment to survive routine dead-code sweeps is a sign the architecture around it, not the comment, is the problem.
- **It inflates the ingestion test surface with no production payoff.** `tests/test_bronze_writer.py` stubs the `airflow` package itself just to import the DAG modules, and is excluded from the default pytest run via a `pyproject.toml` `--ignore` addopt (`boto3` isn't installed in CI). The June tests diagnostic found this was the deepest-covered part of ingestion — coverage effort spent on a path nothing in production calls.
- **It carries its own lint carve-out.** `ruff.toml` exempts `ingestion/*` from T201 (no-print) specifically because it's "the Airflow DAG path" — a standing exception whose only justification is that this code exists.

**Why archive over keeping it as a documented sandbox:** the alternative this ADR considered — write down why a local Airflow sandbox stays, with an owner and a smoke test — was rejected because there is no real owner (solo project) and no smoke test would do anything a code read can't: the two DAGs are thin wrappers that hash the fetch, write to MinIO Bronze, run a Great Expectations suite, and call the exact same `scripts/ingest_deputies.py` / `scripts/ingest_votes.py` / `scripts/ingest_positions.py` functions the GitHub Actions cron already calls directly (ADR-006). Keeping it "for local orchestration experiments" (the stack's own docker-compose comment) with no experiment currently running is the deferred-but-never-triggered pattern ADR-002/ADR-014 already reject for other features. Nothing is lost by archiving: the scripts underneath are untouched and still ingest production data every weekday via `ingest_prod.yml`.

**What's salvageable:** all of it, as reference. The DAGs demonstrate a working hash-based change-detection pattern (ADR-011 describes this exact design as "planned, not yet implemented" for a future promoted-to-production Airflow) and a Bronze-layer S3 writer — useful if Airflow is ever actually promoted per ADR-006's migration path (Local Docker → Astronomer → AWS EC2). Nothing here is rewritten or cleaned up before archiving; it moves as-is, same as ADR-021 archived Terraform as-is.

**Impact:**
- `archive/airflow-local/` holds the files listed above under their original relative paths, with its own `README.md` mirroring `archive/infra-aws/README.md`'s framing.
- `ingestion/` and `quality/` are removed from the live tree (both existed solely to support this stack — confirmed no other production code imports either package).
- `ruff.toml`'s `ingestion/*` T201 carve-out is removed along with the directory.
- `pyproject.toml`'s `--ignore=tests/test_bronze_writer.py` addopts line is removed along with the test file.
- `Makefile`, `docker-compose.yml`'s header comment, and `.env.example` lose their Airflow/MinIO references.
- ADR-006 ("Airflow runs locally only") and ADR-011 (hash-based change detection, "planned — not yet implemented") are **not superseded** — they describe what a promoted-to-production Airflow would look like, and stay accurate as forward-looking design notes even with today's sandbox implementation archived.
- Do NOT resurrect `ingestion/dags/`, `quality/`, or the Makefile Airflow/MinIO targets without a new ADR — the trigger below is the bar.

**Trigger to revisit:** GitHub Actions cron scheduling becomes a real bottleneck (finer-than-cron scheduling, DAG-level retries/backfill, or multi-step dependency graphs GitHub Actions can't express) — at that point, restore from `archive/airflow-local/` and follow ADR-006's migration path (Local Docker → Astronomer free tier → AWS EC2) rather than rebuilding from scratch.

---

## ADR-035 - Bill timelines are built on the dossier acte parcours, not on scrutins (MON-242)

**Date:** 2026-08-26
**Status:** Final
**Related:** ADR-030 (agenda storage, the pattern this follows and departs from), ADR-010 (AN publishes ZIPs, not an API), ADR-026 (no new mart for a page-shaped read)

**Decision:** MON-105's `/lois/[dossier_id]` pages are built on the **legislative acte parcours** ingested from the AN `Dossiers_Legislatifs` export, with scrutins attached to it, rather than on a list of scrutins grouped by `votes.dossier_id` as the epic proposed.
Two new tables (`dossiers`, `dossier_actes`) hold the parcours.
All 2 854 legislature-17 dossiers are ingested; only dossiers carrying at least one scrutin get a public page.
The page URL is `/lois/{dossier_uid}`.

### 1. The scrutin-only timeline the epic proposed does not work

MON-105 assumed `votes.dossier_id` is a usable grouping key across the legislature.
It is not, and the reason is a hard cutover in the upstream feed rather than a data-quality defect that can be patched.

Measured over the full `Scrutins.json.zip` export (8 434 scrutins, legislature 17):

| Period | Scrutins | Carrying `objet.dossierLegislatif` |
|---|---|---|
| 2024-10 through 2026-02 | 5 828 | **0 %** (2 rows) |
| 2026-03 through 2026-07 | 2 606 | **100 %** |

The Assemblée began populating `objet.dossierLegislatif` in March 2026 and has populated it on every scrutin since.
Nothing before that date carries it, and there is no evidence the AN intends to backfill.

The consequence is that only **75 distinct dossiers** in the entire legislature have even one linkable scrutin, and **59 of those 75 (79 %) opened before the cutover**.
Their scrutin history therefore begins months or years after the bill itself did.
"Fin de vie" (`DLR5L17N51670`) opened on 2025-03-11; its first linkable scrutin is 2026-06-22, a fifteen-month hole at the front of the page.

A page whose entire content is the post-March-2026 slice cannot answer "où en est cette loi ?" for four bills in five.
It would answer "what did the Assemblée vote on this bill recently", while presenting itself as the bill's full parcours.
On a civic-transparency site that is worse than not shipping the page.

**Why title matching was rejected as a repair.** Matching untagged scrutin `objet.libelle` text against the 75 known short titles recovers 908 of the 5 826 untagged scrutins (16 %) with no ambiguous matches.
That is a real but small gain, and it buys the wrong thing: it adds more amendment votes to pages that already have too many (see section 4), while doing nothing about the missing front half of the parcours, which is not made of scrutins at all.
Fuzzy string matching that silently attributes a vote to the wrong bill is exactly the failure mode this project cannot absorb.

**Why `voteRefs` was rejected as a better join.** The dossier export's decision actes carry a `voteRefs` field pointing at scrutin uids, which would be a cleaner join than `dossier_id`.
It is populated on only 206 of 617 decision actes, and there are just 617 decision actes across all 2 854 dossiers.
It is too sparse to replace the `dossier_id` join and is not ingested.

### 2. The acte parcours is the spine, and it is complete

`Dossiers_Legislatifs.json.zip` (10 MB, 2 854 `DLR5L17*` dossiers) carries, for every dossier, a nested `actesLegislatifs` tree of dated procedural steps from first deposit to promulgation.
Unlike the scrutin tagging, this is complete from the start of the legislature.
It is the only source that can say where a bill actually stands.

Each acte carries `codeActe` (`AN1-DEPOT`, `AN1-COM-FOND-RAPPORT`, `AN1-DEBATS-DEC`, `SN1-...`, `CMP-DEC`, `PROM`), a `libelleActe`, a `dateActe`, and, on decision actes, a `statutConclusion`.
That is enough to render a full vertical parcours with real dates, which is what the page's header question demands.

Scrutins attach to this spine where they exist, by `votes.dossier_id`, and are simply absent where the AN never tagged them.
The page then degrades honestly: the parcours is always complete, and the vote detail is richer for recent stages than for old ones.
This is a visible, explainable gap rather than a silent truncation.

### 3. Two tables, not one, and no JSONB parcours

```sql
CREATE TABLE IF NOT EXISTS dossiers (
    dossier_uid     TEXT PRIMARY KEY,        -- titreDossier uid, e.g. DLR5L17N51670; joins votes.dossier_id
    legislature     TEXT,                    -- carried through from the source; ingestion is scoped to L17, this is not a multi-legislature key
    titre           TEXT NOT NULL,           -- titreDossier.titre; the readable short title, median 94 chars
    titre_chemin    TEXT,                    -- titreDossier.titreChemin; stored for a future slug URL, not routed on
    procedure_code  TEXT,                    -- procedureParlementaire.code
    procedure_label TEXT,                    -- procedureParlementaire.libelle
    initiateur      TEXT,
    status          TEXT NOT NULL,           -- derived enum, section 5
    status_label    TEXT,                    -- raw statutConclusion.libelle of the deciding acte, verbatim
    current_stage   TEXT,                    -- codeActe of the last top-level acte, e.g. AN1, SN1, PROM
    parcours_start  DATE,                    -- earliest dateActe in the tree
    parcours_end    DATE,                    -- latest dateActe in the tree
    has_scrutins    BOOLEAN NOT NULL DEFAULT FALSE,  -- drives page scope, section 6
    last_seen_at    TIMESTAMPTZ NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dossier_actes (
    dossier_uid     TEXT NOT NULL REFERENCES dossiers(dossier_uid) ON DELETE CASCADE,
    acte_uid        TEXT NOT NULL,           -- acteLegislatif uid, e.g. L17-VD223914DEC
    parent_uid      TEXT,                    -- enclosing acte_uid within the same dossier; NULL at top level
    depth           SMALLINT NOT NULL,       -- 0 for a top-level stage
    ordinal         INTEGER NOT NULL,        -- document order within the parent, preserves sibling sequence
    code_acte       TEXT NOT NULL,
    acte_type       TEXT,                    -- @xsi:type, e.g. Decision_Type, Etape_Type
    libelle         TEXT,                    -- libelleActe.nomCanonique
    date_acte       DATE,
    statut_label    TEXT,                    -- statutConclusion.libelle, verbatim
    organe_ref      TEXT,
    last_seen_at    TIMESTAMPTZ NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (dossier_uid, acte_uid)
);

CREATE INDEX IF NOT EXISTS idx_dossiers_status ON dossiers (status);
CREATE INDEX IF NOT EXISTS idx_dossiers_scrutin_pages ON dossiers (dossier_uid) WHERE has_scrutins;
CREATE INDEX IF NOT EXISTS idx_dossier_actes_order ON dossier_actes (dossier_uid, ordinal);
CREATE INDEX IF NOT EXISTS idx_dossier_actes_date ON dossier_actes (date_acte);
```

**The acte primary key is composite, and that is not a formality.**
Measured over the export, the 2 854 legislature-17 dossiers flatten to **20 485 acte rows carrying 20 442 distinct uids**: every acte has a uid, but **43 uids appear in two different dossiers each** (never twice within one dossier).
They are shared procedural events, typically where dossiers were merged: `L17-VD223530` is `AN21-DGVT` on `DLR5L17N51427` and `ANNLEC-DGVT` on `DLR5L17N50588`.
`acte_uid` alone as the primary key would therefore fail on ingestion.
`(dossier_uid, acte_uid)` is verified unique across the whole export and models the real relationship, which is that one procedural event can legitimately belong to two dossiers.

**Why two tables rather than ADR-030's single denormalized one.** ADR-030 denormalized because every agenda read is a date window across many parents, so a join would be paid on every request to save a thousand duplicated sitting rows.
The shape here is the opposite: the parent is always fixed (one dossier) and the children *are* the page content.
The acte is the timeline node, the thing rendered and the thing a scrutin binds to by date.

**Why not a JSONB `parcours` column on `dossiers`.** It would serve the one-dossier read in a single row, but it moves the acte-to-scrutin join out of SQL and into Python, makes the parcours untestable by dbt, and makes "which bills reached CMP" a JSONB scan instead of an index lookup.
At 20 485 acte rows across 2 854 dossiers the normalized form costs nothing.
The nesting is preserved by `parent_uid` / `depth` / `ordinal` rather than by document structure, so the tree can be rebuilt for rendering in one ordered pass.

**Why no dbt mart.** As in ADR-026 (groups) and ADR-030 (agenda), the API reads these tables directly.
The read is page-shaped, not analytical, and a mart would add a build step between ingestion and a page that needs no aggregation.

**Upsert-only, as everywhere else.** Both tables are keyed on the AN's own uids, upserted with `ON CONFLICT DO UPDATE`, and stamped with `last_seen_at` on every run.
Nothing is deleted, so CLAUDE.md decision 8 holds unchanged.
`dossier_actes` rows that vanish from the export keep their stale `last_seen_at` and are filtered out on read, exactly as ADR-030 §2 does for agenda items.

### 4. The timeline is headline-first; amendment scrutins collapse

Of the 2 606 tagged scrutins, **87 % are amendment or article votes** (2 262 amendments, 239 articles) against just 71 "ensemble" votes, 19 motions and 17 others.
The median dossier has **one** headline scrutin; `DLR5L17N54085` has 422 scrutins of which 395 are amendments.

A literal "vertical timeline of every scrutin attached to the dossier", as MON-105 words it, is therefore 400 rows of amendment noise around four meaningful nodes.

Rendering rule: a scrutin is a timeline node when it is a vote on the whole text, a motion, or otherwise not an amendment or single-article vote.
Amendment and article scrutins are collapsed into a count on the acte they fall under, expandable on demand, never listed inline by default.
This is the same judgment ADR-030's scope note made for `Suite de la discussion` on the agenda.

Classification is done from `objet.libelle` at ingestion time and stored on `votes` as `scrutin_kind TEXT` (`ensemble` | `motion` | `amendement` | `article` | `autre`), added by the same migration as the two tables above.
It is not recomputed per request, and it is not a `dossier_actes` column: it is a property of the scrutin, and `GET /votes` benefits from it independently of any bill page.

### 5. Status is derived by ordered prefix rules over free text, and both forms are stored

`statutConclusion.libelle` is **free text, not an enum**.
Across 617 decision actes there are more than fifteen distinct values, including "adoptée", "adopté", "modifiée", "Accord", "adoptée sans modification", "rejeté", "considérée comme définitive en application de l'article 151-7 du Règlement", and "adopté, dans les conditions prévues à l'article 45, alinéa 3, de la Constitution".

So status derivation must not match on equality.
It is an ordered rule list resolving to one of seven values, written against `codeActe` structure rather than against prose.
The thirteen top-level `codeActe` values observed in legislature 17 fall into three groups:

- **Reading stages:** `AN1`, `AN2`, `AN20`, `AN21`, `ANNLEC`, `ANLUNI`, `ANLDEF`, `SN1`, `SN2`, `SNNLEC`, `CMP`
- **Post-parliamentary:** `PROM` (promulgation), `CC` (Conseil constitutionnel)
- **Sub-acte prefixes within a reading stage:** `-DEPOT` (deposit), `-COM` (commission), `-DEBATS` (séance), `-DEC` (decision)

Rules are evaluated **top to bottom, first match wins**, over the dossier's flattened acte tree.
`decisions` means the `Decision_Type` actes carrying a `dateActe`, sorted by that date; `latest` is the last of them.

| # | `status` | Citizen-facing label | Condition |
|---|---|---|---|
| 1 | `promulguee` | Promulguée | a `PROM` top-level acte exists |
| 2 | `conseil_constitutionnel` | Devant le Conseil constitutionnel | a `CC` top-level acte exists |
| 3 | `rejetee` | Rejetée | `latest.statut_label` normalises to a first word starting `rejet` |
| 4 | `adoptee_definitivement` | Adoptée définitivement | `latest.statut_label` first word starts `adopt`, `latest` sits in the only reading stage the dossier has, and that stage is the last in document order |
| 5 | `deposee` | Déposée | there are no decisions and no `-COM` acte |
| 6 | `en_commission` | En commission | there are no decisions and a `-COM` acte exists |
| 7 | `en_navette` | En navette parlementaire | everything else |

Rule 7 is a total fallback, so the rule set always resolves and never needs an "unknown" value.
"Normalises" means lowercased and stripped of accents before the prefix test, so "rejeté", "rejetée" and "rejet du texte par la commission préalable" all satisfy rule 3, and the `article 45, alinéa 3` and `sans modification` variants all satisfy rule 4's first test.
Match the **first word only**: the long constitutional labels always lead with the outcome word, and prefix-matching the whole string would need one rule per variant.

Rule 4 is deliberately conservative: a text adopted at first reading with a second chamber still to come is genuinely in navette, not finished, so it falls to rule 7 rather than claiming a conclusion the parcours does not support.
That is also where "Accord" (CMP), "modifiée", and "considérée comme définitive en application de l'article 151-7 du Règlement" land, each with its raw label displayed.

These rules were run over all 2 854 dossiers before being written down, and over the 75 that actually get a page:

| `status` | All 2 854 | The 75 with a page |
|---|---|---|
| `promulguee` | 107 | **36** |
| `en_navette` | 175 | **32** |
| `rejetee` | 20 | **3** |
| `adoptee_definitivement` | 32 | **2** |
| `deposee` | 428 | 1 |
| `en_commission` | 2 090 | 1 |
| `conseil_constitutionnel` | 2 | 0 |
| unresolved | **0** | **0** |

`en_commission` dominating the full set is expected and harmless: it is the 2 090 propositions de loi that were deposited, referred to committee, and never scheduled, none of which gets a page.
Across the dossiers that do get one the field is well spread and carries real information, which is the test that mattered.

MON-243 must implement these seven rules as written and assert the totality property in a unit test.

### 6. Ingest all 2 854 dossiers, publish pages for the ones with scrutins

Ingestion covers every `DLR5L17*` dossier.
The export is 10 MB and parses in seconds, so filtering at ingestion time would save nothing and would make the `has_scrutins` flag impossible to maintain as new scrutins arrive.

Pages are published only where `has_scrutins` is true, which is 75 dossiers today.
The remaining 2 779 are propositions de loi that were deposited and never debated; a page for one would show a single "déposée" node and nothing else.
Publishing 2 779 near-empty pages would be thin content on a site whose SEO case rests on being the one source that answers the question properly.

`has_scrutins` is recomputed at the end of every ingestion run from `votes.dossier_id`, so a bill acquires its page automatically on its first scrutin.

**`GET /lois` and the sitemap read the flag, not a hardcoded list.**
No slug map is hardcoded here, unlike ADR-026's group slugs: group labels are a closed set of twelve political facts, whereas dossiers are an open, growing set.

### 7. The URL is the dossier uid

`/lois/{dossier_uid}`, for example `/lois/DLR5L17N51670`.

`titreChemin` is unique across all 75 in-scope dossiers and near-unique across all 2 854 (one collision, 19 nulls), which makes it tempting as a readable slug.
It is rejected as the route key: it is only empirically unique, it is up to 134 characters long, and it is an upstream string that can change under us and silently break every inbound link and share card.
The uid is what `votes.dossier_id`, `agenda_items.dossier_id`, and MON-89's external link already carry, so routing on it means no translation layer anywhere.

The SEO cost is small: descriptive words carry far more weight in the `<title>`, `<h1>` and body copy, all of which MON-247 sets from `titre`.
`titre_chemin` is stored so a future `/lois/{slug}` alias that 301s to the canonical uid route is an additive follow-up, not a rewrite.

### 8. No LLM for the header

`titreDossier.titre` is already the short readable name, not a bureaucratic long form: "Fin de vie", "Projet de loi relatif à la protection des enfants".
Median length is 94 characters, p90 is 171.
It is identical to the short `dossierLegislatif.libelle` the scrutin feed carries.

So the header uses the AN title verbatim, with no generation step.
This is the same judgment as ADR-030 §5: do not send an LLM something that is already adequate, and do not invent specifics on a civic-transparency site.
A Groq one-liner for the long-tail titles above p90 is a legitimate later idea and is explicitly **not** part of MON-105.

The epic's premise that this could reuse existing work does not hold.
`rag/pipeline/chunk_law_summaries.py` produces per-vote **party-breakdown** chunks for the top 20 votes by turnout, keyed on `vote_id`.
They are named `law_summary` but they are not per-dossier summaries and cannot seed a bill header.

### 9. Production `votes.dossier_id` is currently corrupt and must be backfilled

`scripts/ingest_votes.py` stored the Python `repr()` of the `dossierLegislatif` dict instead of its `dossierRef` until commit `7e29131` (2026-07-13, MON-89 review).
The AN began tagging in March 2026.
Every scrutin ingested between those two dates was written with the broken form, and the daily cron's 30-day `--since` window has only healed rows from roughly 2026-06-13 onward.

This is confirmed live in production today: `GET /votes/VTANR5L17V5994` returns

```
"{'libelle': 'Projet de loi relatif à la lutte contre les fraudes sociales et fiscales', ...}"
```

where `DLR5L17N52985` is expected.
On the order of 1 700 of the 2 606 usable tagged scrutins are affected, which is the majority of the only data this feature can use.

`frontend/src/app/votes/[id]/VoteDetailClient.tsx:141` masks this with a regex guard, which is why it has not been visible.

This is tracked as **MON-258**, filed separately from the MON-105 epic because it is corrupting live data today and its fix does not depend on anything else here.
It blocks MON-243: `has_scrutins` computed against the corrupt column lands at roughly 8 dossiers instead of 75, and `GET /lois` returns near-empty parcours until it runs.
It must re-extract `dossierRef` from the stored repr where possible, re-ingest with a wide `--since` where not, and add a guard so a non-conforming `dossier_id` cannot ship silently again.

**Reason (summary):**

The epic was written from the shape of the data as it appears today on recent votes, where `dossier_id` is present and clean.
Measuring the full export showed that appearance is four months old, that it covers a fifth of the relevant bills' actual history, and that the field is corrupt in production for most of the period where it exists at all.
Building the page on the acte parcours instead costs one extra table and one extra ingestion step, and produces a page that is correct for every bill rather than for the sixteen that happen to postdate the cutover.

**Impact:**

- MON-243 implements exactly the two tables above, plus `votes.scrutin_kind`. The `votes.dossier_id` backfill is MON-258, which blocks it.
- MON-244's `GET /lois/{dossier_uid}` returns the acte parcours as the primary array, with scrutins attached to actes, not a flat scrutin list. It must expose the amendment counts separately from headline scrutins.
- MON-245 renders actes as the timeline spine and never lists amendment scrutins inline by default. It shows the raw `status_label` next to the derived badge.
- MON-247's sitemap reads `has_scrutins`, so it emits on the order of 75 URLs, not 2 854. The 50 000-URL concern raised on that issue does not materialize.
- The horizon caveat MON-242 was asked to decide is **not** about the Supabase 2025-07-01 limit, which is nearly irrelevant here (74 of 75 dossiers have a scrutin after it). It is about the AN's 2026-03 tagging cutover, and the acte spine is the answer to it rather than a disclaimer.
- Do NOT group votes by `dossier_id` alone to build a bill page. Do NOT fuzzy-match scrutin titles to bills. Do NOT publish a page for a dossier with no scrutins. Do NOT route `/lois` on `titreChemin`. Do NOT discard `statutConclusion.libelle` in favour of the derived enum.
- Out of scope, deliberately: RAG indexing of dossier chunks, "follow this law" (MON-91, still deferred by ADR-002), Sénat-side acte detail beyond what the export already carries, and generated plain-French bill summaries.

**Trigger to revisit:** the Assemblée backfills `objet.dossierLegislatif` onto pre-March-2026 scrutins, which would make the scrutin timeline complete on its own and reduce the acte parcours to supporting context; the AN publishing a real dossier API, which would supersede ADR-010's ZIP-only constraint; or the in-scope dossier count growing past roughly a thousand, at which point the sitemap and the `GET /lois` pagination assumptions in MON-247 need re-checking.

---

## Rules for future development sessions

1. Read this file before writing any code
2. If a prompt contradicts a decision here — flag it, don't build it
3. Kafka is not part of this project (ADR-001, ADR-005)
4. Airflow is local only (ADR-006) — do not write Railway/cloud Airflow config
5. Terraform IaC is archived, not live (ADR-004, ADR-021) — do not add terraform apply steps or resurrect infra/
6. Phase 5 alerts are deferred (ADR-002) — do not build email dispatch
7. Never auto-run `POST /verify/` from intent detection (ADR-023) — detection only nudges; verification is an explicit user action
8. Quiz matching is stateless and quiz shares store only server-computed results (ADR-025) - never trust client-computed percentages; answers may be persisted only via the opt-in path in ADR-028 (see rule 11), never by default
9. Group profile pages use live SQL aggregation over existing marts and a hardcoded slug map, not a new mart or a groups table (ADR-026) - never link a group page for a NULL-party deputy
10. Dark mode is approved and being built (ADR-027, MON-103) — landing page stays light-only by design
11. Quiz share answers may be stored only when the sharer opts in (`include_answers`, default off) for friend comparison (ADR-028) — never store answers by default, never add a server-side compare endpoint, and gate any *derived* field that re-encodes them the same way (`detail`, `themes`)
12. When in doubt: check what's actually deployed before writing new code
13. Sustainability funding is donations-first via HelloAsso, with the existing `api_keys.rate_limit_multiplier` (ADR-029, MON-116/MON-98) as the paid-tier mechanism — do not build Stripe/webhook billing until a real paying commercial API customer exists
14. Agenda ingestion is séance publique only, upserted into one `agenda_items` table and never deleted (ADR-030, MON-110) - an item is visible only when it was seen in the latest ingestion run and is not cancelled; never generate a summary for a stub `objet`
15. Null `voted_at` is a tolerated upstream quirk, not an ingestion failure (ADR-031, MON-232) - the source test is `severity: warn`, `stg_votes` keeps filtering the row out, and undated votes stay invisible past staging by design
16. Snapshot tables (`verifications`, `chat_shares`, `quiz_shares`, `feedback`) are purgeable past 12 months and `api_key_usage` past 90 days, but no purge job exists yet (ADR-032, MON-225) - build it only once `/health`'s `db_size_warning` actually fires, not preemptively; do not add a `DELETE` job to these tables without linking back to this ADR
17. The local Airflow/MinIO stack is archived, not live (ADR-033, MON-239) - do not resurrect `ingestion/dags/`, `quality/`, or the Makefile Airflow/MinIO targets without a new ADR; ADR-006 and ADR-011 still describe the design a promoted-to-production Airflow would use
18. Group-majority position is one formula everywhere: plurality with an alphabetical tiebreak, defined in `int_party_vote_majority` and replicated exactly by `groups.py`'s `_majority_position` (ADR-034, MON-24, MON-228) - never invent a different tiebreak; quiz's skip-ties behavior in `compute_group_alignment` is a documented, deliberate exception, not a bug to "fix" into matching
19. Bill timeline pages are built on the dossier acte parcours from `Dossiers_Legislatifs`, not on votes grouped by `dossier_id` (ADR-035, MON-105/MON-242) - the AN only began tagging scrutins with a dossier in March 2026, so a scrutin-only timeline misses the first four fifths of most bills; never fuzzy-match scrutin titles to bills, never publish a page for a dossier with no scrutins, and never list amendment scrutins inline by default
