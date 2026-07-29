# Quiz question set curation (MON-109 / MON-136)

This document describes how the vote-matching quiz's question set (`api/quiz_data.py`) is
selected, so a future quarterly refresh can be done without re-reading the original issue.

Per ADR-025, the question set is a versioned repo file, not a database table.
It is curated by hand, quarterly, and shipped by PR.

## Selection criteria

A scrutin qualifies for the quiz if it meets all four criteria:

1. **Whole-text vote.** The scrutin title starts with `l'ensemble de ...` (or the
   organic-law/constitutional equivalent) — a vote on the full text, not an amendment
   or a single article. Amendment votes are procedurally noisy and less recognizable
   to a general audience.
2. **In production.** The `vote_id` must exist in the production `votes` table.
   Prod (Supabase free tier) only holds scrutins from 2025-07-01 onward (decision 7
   in `CLAUDE.md`) — a scrutin that only exists in local dev cannot be used.
   Verify with `GET /votes/{vote_id}` against the production API
   (`https://monelu-production.up.railway.app`), not against local Docker data.
3. **High participation.** `total_voters >= 400` (out of 577 seats). Below this,
   the result reflects who showed up more than what the Assembly actually decided.
4. **Divisive.** Of the *expressed* votes (`votes_for + votes_against`, abstentions
   excluded), the losing side holds `>= 35%`. This is what makes agreement/disagreement
   with a deputy actually discriminate between users — a 90/10 vote agrees with
   almost everyone and adds no signal to the match.

Within the votes that pass all four filters, prefer:

- **Topic diversity.** No two questions share a `theme` tag — the quiz should span
  civic ground (institutions, justice, economy, social policy, etc.), not cluster
  on one axis.
- **Recognizability.** Prefer scrutins that received general-audience press coverage
  (aide à mourir, Corse, Nouvelle-Calédonie, fraudes fiscales, etc.) over technical
  or procedural texts a non-specialist wouldn't have an intuition about.

Target set size: ~10 questions (`MIN_ANSWERS = 3` is enforced server-side in
`api/routers/quiz.py`, but the full set should stay close to 10 for quiz-completion time).

## Phrasing rules

Each entry has:

- `question`: `"Auriez-vous voté pour ou contre <description of what the text does> ?"`
  The description must stay **descriptive of the text's actual effect** — no
  evaluative or leading language ("scandaleux", "enfin", "malgré l'opposition...").
  Where possible, phrase it close to the official scrutin title, simplified into
  plain French a non-specialist can parse in one read.
- `context`: one sentence — the official/simplified bill title, the parliamentary
  stage (première lecture / lecture définitive / commission mixte paritaire), and
  the vote date. No commentary on the outcome or on who voted which way.

Before shipping a refresh, re-read every `question`/`context` pair together and ask:
does this text tip the reader toward "pour" or "contre" before they've formed their
own opinion? If yes, rewrite it.

## Process for a quarterly refresh

1. Query recent whole-text scrutins from the production `votes` table (via
   `GET /votes` listing endpoints, or direct SQL against prod if you have the
   `DBT_*`/Supabase credentials) and compute participation and minority-share
   for each candidate using the same formula as above.
2. Shortlist candidates passing all four criteria, then pick ~10 that maximize
   theme diversity and recognizability.
3. Write `question`/`context` for each, review for neutrality per the rules above.
4. Update `api/quiz_data.py`: replace `QUIZ_QUESTIONS`, bump `QUIZ_VERSION` to the
   new quarter (e.g. `2026-Q4`). Old `QUIZ_VERSION` strings remain attached to
   already-stored `quiz_shares` snapshots (ADR-025) — they are never rewritten,
   so a version bump never invalidates a previously shared result card.
5. Ship as a PR.
   Two automated gates validate the set (MON-171):
   CI runs `scripts/check_quiz_votes.py --api https://monelu-production.up.railway.app`
   on every PR, failing if any `vote_id` in `QUIZ_VOTE_IDS` is unknown to the
   production API — a typo'd id cannot merge.
   The daily ingestion workflow (`ingest_prod.yml`) re-runs the same script
   against the production `votes` table, so a curated scrutin later
   corrected or renumbered upstream fails the ingestion job loudly instead
   of silently skewing agreement percentages.
   `tests/unit/test_quiz.py` covers set shape (count, uniqueness, phrasing)
   with a mocked DB — no test needs updating for a content-only refresh.

## Automated weekly selection (`GET /quiz/weekly`, MON-185)

The curated set above refreshes quarterly, which leaves a traffic dead zone between
refreshes. `GET /quiz/weekly` ("scrutin de la semaine") fills that gap with a single
question, auto-picked by the API rather than curated by hand.

The endpoint has no frontend consumer at the moment: the homepage widget it was built
for was removed from the landing page. The endpoint itself stays live and supported —
it is still the intended surface for a future "scrutin de la semaine" placement.

Selection rule (`api/routers/quiz.py`, `select_weekly_vote`):

- Candidates are every scrutin with `voted_at` strictly before the Monday of the
  current ISO week (`week_start()`), most recent first — the cutoff, not "now",
  is what makes the pick stable for every visitor for the rest of the week.
- The first candidate passing all of these qualifies:
  1. **Whole-text vote** — title matches criterion 1 above (`l'ensemble ...`, straight
     or curly apostrophe).
  2. **High participation** — `total_voters >= 400` (criterion 3 above).
  3. **Divisive** — minority share of expressed votes `>= 35%` (criterion 4 above).
  4. **Not already in the curated quiz** — `vote_id` must not be in `QUIZ_VOTE_IDS`
     (`api/quiz_data.py`), so the weekly question never repeats one the full quiz
     already asks.
- Criterion 2 ("in production") doesn't apply here — the endpoint only ever reads
  from whichever database it's running against, so there's nothing to verify against
  a separate prod check.
- If no candidate qualifies (a recess week, or too early in the legislature to have
  400-voter whole-text scrutins yet), the endpoint returns `404` — there is no manual
  override or fallback question, so any consumer must handle the empty case.

The question text is generated, not curated: `build_weekly_question()` takes
`summary_plain` (already generated per-vote by `scripts/generate_vote_summaries.py`)
and wraps it as `"Auriez-vous voté pour ou contre : <summary> ?"`, falling back to the
raw `vote_title` when no summary exists. Nothing is written to any table by this
endpoint — the visitor's answer stays client-side, exactly like the full quiz
(ADR-025).

## Current set (2026-Q3)

Verified against production (`https://monelu-production.up.railway.app`) on 2026-07-19:

| vote_id | theme | for | against | abst. | total | minority % |
|---|---|---|---|---|---|---|
| VTANR5L17V8280 | Fin de vie | 291 | 241 | 29 | 561 | 45.3 |
| VTANR5L17V4758 | Protection sociale | 247 | 232 | 90 | 569 | 48.4 |
| VTANR5L17V2957 | Agriculture | 316 | 223 | 25 | 564 | 41.4 |
| VTANR5L17V7454 | Institutions | 271 | 202 | 64 | 537 | 42.7 |
| VTANR5L17V6184 | Économie | 275 | 225 | 30 | 530 | 45.0 |
| VTANR5L17V6319 | Finances publiques | 335 | 182 | 5 | 522 | 35.2 |
| VTANR5L17V7987 | Sécurité | 313 | 199 | 5 | 517 | 38.9 |
| VTANR5L17V3182 | Outre-mer | 279 | 247 | 9 | 535 | 47.0 |
| VTANR5L17V2958 | Justice | 303 | 168 | 1 | 472 | 35.7 |
| VTANR5L17V7408 | Logement | 292 | 160 | 14 | 466 | 35.4 |

All ten pass the >=400-voter participation floor and the >=35% minority-share
divisiveness floor, and cover ten distinct themes.
