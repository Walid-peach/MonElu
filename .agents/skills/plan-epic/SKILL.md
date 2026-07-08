---
name: plan-epic
description: Decomposes a large Linear (MonElu) issue into ordered, solve-mon-sized sub-issues - explores the codebase to ground the plan, drafts sub-issues with Scope and Acceptance criteria, flags architectural decisions for the ADR first, and creates them in Linear under the parent. Use as /plan-epic <MON-id>, e.g. /plan-epic MON-91.
---

Turn one epic-sized Linear issue into a sequence of sub-issues that each fit the `/solve-mon` cycle (one branch, one PR, reviewable in one sitting).
This skill only plans and writes to Linear - it never touches code, branches, or PRs.

ARGUMENTS: one MON-id of the epic to decompose.

Linear writes (`mcp__linear-server__save_issue`, `save_comment`) are allowlisted in `.claude/settings.local.json`.
If the Linear MCP is unavailable, say so and output the drafted sub-issues for manual creation instead.

## Workflow

### 1. Read the epic

- Fetch the full issue with `mcp__linear-server__get_issue`: title, description, priority, labels, milestone, comments.
- If the issue already has sub-issues (`parentId` children), list them and reconcile: plan only the missing parts, never duplicate.
- If the issue is actually solve-mon-sized (clear scope, one surface, existing acceptance criteria), say so and recommend `/solve-mon` directly instead of decomposing.

### 2. Ground the plan in the codebase

Before drafting anything, explore the code the epic touches:

- Which tables/marts exist vs. need creating (`data/migrations/`, `transform/models/`).
- Which API endpoints exist vs. need adding (`api/routers/`).
- Which frontend pages/components exist vs. need building (`frontend/src/`).
- Whether ingestion needs new data the AN open data portal must provide (`scripts/ingest_*.py`) - verify the source data actually exists before planning around it.
- Read `docs/decisions.md` - the plan must not contradict an ADR.

A plan step that assumes code or data that does not exist is the main failure mode this step prevents.

### 3. Identify decisions before work

Separate two kinds of items:

- **Architectural decisions** (new table vs. new mart, client-side vs. server-side, third-party service adoption, anything with cost or lock-in): these become the *first* step of the plan, resolved via the `adr-skill`, and block the dependent sub-issues.
- **Implementation steps**: everything else.

Never bury a decision inside an implementation sub-issue.

### 4. Draft the sub-issues

Slice by deliverable layer and dependency order - the proven pattern from MON-90 (backend PR #172, then frontend PR #173):

1. Schema/migration or dbt mart changes (if any)
2. API endpoint(s)
3. Frontend page/component(s)
4. Ingestion or RAG index changes (if any)
5. Docs/SEO/polish

Each sub-issue must have:

- **Title**: concise, action-verb-first, suffixed with the epic reference (e.g. "Add follow-deputy API endpoints (MON-91 backend)").
- **Description** in the established format:
  one-line context sentence, then a **Scope** bullet list, then an **Acceptance criteria** bullet list.
  Acceptance criteria must be checkable by `/solve-mon` step 11 without interpretation.
- **Size check**: if a sub-issue would touch more than ~2 layers or needs its own decomposition, split it again.
- **Priority**: inherit from the epic unless a step is clearly blocking (raise it) or polish (lower it).
- **Dependencies**: note "depends on <previous sub-issue>" in the description body; also set `blockedBy` relations where real.

### 5. Review with the user

Present the full plan as a numbered list (title, one-line scope, dependency) before creating anything.
Include: which steps are decision-first ADR items, the suggested order, and anything the epic asked for that is being deferred and why.
Proceed to create unless the user redirects.

### 6. Create in Linear

For each drafted sub-issue: `save_issue` with team MonElu, state Backlog, `parentId` set to the epic, labels carried over from the epic plus the layer label (`api`, `frontend`, `database`, `rag`, `ingestion`), and the epic's milestone.
Set `blockedBy` relations between sequential sub-issues where the dependency is real, not just preferred order.
Then comment on the epic (`save_comment`) with the plan summary and links, and move the epic to **Todo** (it is now planned; it goes In Progress when the first sub-issue does).

### 7. Report

Print the created sub-issue ids and URLs in execution order, marking which one `/solve-mon` should pick up first and which are blocked on an ADR.

## Guard rails

- This skill never writes code, never branches, never opens PRs.
- Never create sub-issues for work whose data source or upstream dependency is unverified - flag it as a research step instead.
- Check for existing near-duplicate issues (backlog-wide title similarity) before creating; link relations instead of duplicating.
- Do not decompose into more than ~7 sub-issues in one pass; if the epic genuinely needs more, propose milestone-level phasing to the user first.
- Never touch Done/Canceled/Duplicate issues.
