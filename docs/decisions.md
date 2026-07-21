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

## Rules for future development sessions

1. Read this file before writing any code
2. If a prompt contradicts a decision here — flag it, don't build it
3. Kafka is not part of this project (ADR-001, ADR-005)
4. Airflow is local only (ADR-006) — do not write Railway/cloud Airflow config
5. Terraform IaC is archived, not live (ADR-004, ADR-021) — do not add terraform apply steps or resurrect infra/
6. Phase 5 alerts are deferred (ADR-002) — do not build email dispatch
7. Never auto-run `POST /verify/` from intent detection (ADR-023) — detection only nudges; verification is an explicit user action
8. Quiz matching is stateless and quiz shares store only server-computed results (ADR-025) - never persist answers or trust client-computed percentages
9. Group profile pages use live SQL aggregation over existing marts and a hardcoded slug map, not a new mart or a groups table (ADR-026) - never link a group page for a NULL-party deputy
10. Dark mode is approved and being built (ADR-027, MON-103) — landing page stays light-only by design
11. When in doubt: check what's actually deployed before writing new code
