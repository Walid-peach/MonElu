---
name: diagnose
description: Runs a fresh diagnostic pass on one MonÉlu project axis - inspects the current code (not old reports), writes a dated report to notes/dispatch/, updates the diagnostic roadmap, and files new findings as labeled Linear issues after deduping against the open backlog. No code changes. Use as /diagnose <axis> or /diagnose next to pick the stalest axis.
---

Run one category-deep diagnostic of the MonÉlu codebase, in the style of the 2026-06-11 diagnostic wave, and turn the findings into backlog input.
This skill only inspects, reports, and files issues - it never changes code.
Remediation happens later via `/solve-mon` (single findings) or `/plan-epic` (structural findings).

ARGUMENTS: an axis, or `next`.
Axes match the Linear area labels and the report names in `notes/dispatch/`:
`ingestion, database, api, transform, rag, cicd, deploy-config, infra, frontend, tests`.
`next` picks the axis with the oldest diagnostic date in `notes/dispatch/diagnostic_roadmap.md` (ties broken by how much its code has changed since, via `git log --oneline --since=<last diag date> -- <axis paths>`).

Linear writes (`mcp__linear-server__save_issue`, `save_comment`) are allowlisted in `.claude/settings.local.json`.
If the Linear MCP is unavailable, still write the report and roadmap update, and output the drafted issues for manual creation.

## Workflow

### 1. Establish the baseline

- Read the axis section in `notes/dispatch/diagnostic_roadmap.md`: last diag date, headline findings, remediation PRs.
- Read the axis's previous report (`notes/dispatch/<axis>_diagnostic_<date>.md`; transform and rag share `transform_rag_diagnostic_*.md`) to know what was already found - the new pass must not re-report fixed or known-open findings.
- List what changed since: `git log --oneline --since=<last diag date> -- <axis paths>`.
  If nothing changed and the previous findings are all resolved, say so, stamp the roadmap with a "re-checked, clean" note, and stop - a diagnostic of unchanged code is noise.

### 2. Inspect the current code

Read the axis's actual code, top to bottom, with fresh eyes - the previous report describes the past, not the present.
Per axis, the core surfaces are:

- `ingestion`: `scripts/ingest_*.py`, `run_ingestion_prod.py`, `generate_vote_summaries.py`, `.github/workflows/ingest_prod.yml`
- `database`: `data/migrations/`, `migrate.py`, `docker-compose*.yml`, index and constraint health
- `api`: `api/` (routers, schemas, limiter, main), connection handling, blocking I/O, rate limits
- `transform`: `transform/models/`, tests, sources freshness, marts vs API expectations
- `rag`: `rag/` (chunker, embedder, retriever, prompts, chain, sql_router), eval suite honesty
- `cicd`: `.github/workflows/`, gates that can silently pass, pins, concurrency, notifications
- `deploy-config`: `railway.json`, `Procfile`, `requirements*.txt` pin coherence, env-var contract vs `.env.example`
- `infra`: `archive/infra-aws/` status, Railway/Supabase/Vercel config drift vs docs
- `frontend`: `frontend/src/`, build health, caching/revalidate coherence, accessibility, CI coverage
- `tests`: what CI actually runs vs what exists, rot, mock-only tests, missing tiers

Judge against: correctness, silent-failure modes, drift between docs (CLAUDE.md, `docs/decisions.md`) and reality, performance traps, and security.
Verify every claim against the code - a diagnostic finding with a wrong file reference poisons the remediation later.

### 3. Write the report

Create `notes/dispatch/<axis>_diagnostic_<today>.md` in the established format:
scope inspected, verdict paragraph, then numbered findings - each with severity (critical / high / medium / low), the affected file and line, evidence, and a recommended fix.
Findings must be new or materially changed since the last report; reference the old finding number when one has regressed.
`notes/` is gitignored - the report is local-only.

### 4. Dedupe against the backlog

Before filing anything, `list_issues` (team MonElu, all statuses) and check each finding against existing issues by title and content similarity.
- Already tracked and open: add a comment on the existing issue with the fresh evidence instead of duplicating.
- Tracked and Done but regressed: file a new issue linking the old one (`relatedTo`).
- New: proceed to filing.

### 5. File the findings as Linear issues

For each new finding, `save_issue` (team MonElu, state Backlog) following the po-agent fill conventions:
- Title: concise, defect-first ("X does Y - Z consequence"), action-verb-first for improvements.
- Description: the problem, evidence with `file:line`, the recommended fix, and a `**Source:** <axis>_diagnostic_<today>.md - Finding #N` line.
- Labels: the axis label plus a type label (`Bug` for defects, `tech-debt` for debt, `Improvement` otherwise; add `perf`, `tests`, or `docs-drift` where they apply).
- Priority: critical → Urgent, high → High, medium → Medium, low → Low.
- Milestone: `M0 - Hardening` in project "Product Readiness 2026-07" unless the finding clearly belongs to a feature milestone.

### 6. Update the roadmap

Edit the axis section in `notes/dispatch/diagnostic_roadmap.md`:
refresh the diag date, link the new report, replace the headline findings, and list the filed MON-ids.
Keep the Legend and section structure intact.

### 7. Report

Summarize: axis, verdict, findings count by severity, issues filed (ids + titles), issues commented instead of duplicated, and the single highest-impact finding.
Recommend the follow-up: `/solve-mon <id>` for the top finding, or `/plan-epic` if a finding is structural.

## Guard rails

- Never change code, config, or tests - inspection only. The only writes are the report, the roadmap, and Linear.
- Never re-file a finding that is already an open issue - comment on it instead.
- Never run anything with side effects or cost during inspection (no ingestion runs, no RAG re-index, no prod writes; read-only DB queries against local are fine).
- If a finding suggests an active incident (prod down, data corruption, leaked secret), stop the pass and surface it to the user immediately instead of filing and moving on.
- Cap a single pass at ~10 filed issues; if an axis yields more, file the top 10 by severity and note the remainder in the report.
