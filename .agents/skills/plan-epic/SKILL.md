---
name: plan-epic
description: Decomposes a large GitHub (MonElu) issue into ordered, solve-issue-sized sub-issues - explores the codebase to ground the plan, drafts sub-issues with Scope and Acceptance criteria, flags architectural decisions for the ADR first, and creates them in GitHub under the parent. Use as /plan-epic number, e.g. /plan-epic 359.
---

Turn one epic-sized GitHub issue into a sequence of sub-issues that each fit the `/solve-issue` cycle (one branch, one PR, reviewable in one sitting).
This skill only plans and writes to GitHub - it never touches code, branches, or PRs.

ARGUMENTS: one GitHub issue number or repository issue URL. Resolve legacy MON identifiers through the shared reference.

Read [the GitHub backlog conventions](../solve-issue/references/github-issues.md) before proceeding. Use authenticated `gh` in `Walid-peach/MonElu`; if writes are unavailable, report the limitation and provide drafts without claiming creation.

## Workflow

### 1. Read the epic

- Fetch the full GitHub issue: title, body, priority labels, all labels, milestone, comments, state, and relations.
- List native children and body/checklist-linked children, including closed ones, with pagination. Reconcile implemented, planned, and missing scope; never duplicate.
- If the issue is actually solve-issue-sized (clear scope, one surface, existing acceptance criteria), say so and recommend `/solve-issue` directly instead of decomposing.

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

- **Title**: concise, action-verb-first, suffixed with the epic reference (e.g. "Add follow-deputy API endpoints (#359 backend)").
- **Description** in the established format:
  one-line context sentence, then a **Scope** bullet list, then an **Acceptance criteria** bullet list.
  Acceptance criteria must be checkable during `/solve-issue` verification without interpretation.
- **Size check**: if a sub-issue would touch more than ~2 layers or needs its own decomposition, split it again.
- **Priority**: inherit from the epic unless a step is clearly blocking (raise it) or polish (lower it).
- **Dependencies**: record explicit GitHub blocker links and native dependencies where real; preferred ordering alone is not a blocker.

### 5. Review with the user

Present the full plan as a numbered list (title, one-line scope, dependency) before creating anything.
Include: which steps are decision-first ADR items, the suggested order, and anything the epic asked for that is being deferred and why.
Proceed to create unless the user redirects.

### 6. Create in GitHub

For each drafted sub-issue, use `gh issue create --repo Walid-peach/MonElu` with a body file, `status: backlog`, priority, relevant layer/type labels, and the epic's milestone. Do not inherit `epic`, migration markers, or the parent's workflow status.
Attach children and genuine blockers using native GitHub relations per the shared reference, then read them back. Comment on the epic with a linked checklist and execution order. Keep it open; set `status: todo` and remove conflicting status labels. If it is already in progress, preserve that state. On partial failure reconcile existing creations before retrying; disclose text-only fallback relations.

### 7. Report

Print the created sub-issue ids and URLs in execution order, marking which one `/solve-issue` should pick up first and which are blocked on an ADR.

## Guard rails

- This skill never writes code, never branches, never opens PRs.
- Never create sub-issues for work whose data source or upstream dependency is unverified - flag it as a research step instead.
- Check for existing near-duplicate issues (backlog-wide title similarity) before creating; link relations instead of duplicating.
- Do not decompose into more than ~7 sub-issues in one pass; if the epic genuinely needs more, propose milestone-level phasing to the user first.
- Never mutate closed issues as part of decomposition.
