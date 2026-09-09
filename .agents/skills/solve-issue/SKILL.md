---
name: solve-issue
description: Resolves a MonÉlu GitHub issue through implementation, verification, a PR, CI, review, and review fixes. Stops before merge. Use /solve-issue number or /solve-issue next for the next unblocked issue with a three-open-PR WIP limit.
---

Resolve issues in `Walid-peach/MonElu`. Read [the GitHub backlog conventions](references/github-issues.md) before selecting or updating an issue.

ARGUMENTS: GitHub issue number(s), repository issue URL(s), or `next`. Multiple issues share one branch/PR only when small and related; otherwise ask which to start. Resolve legacy MON identifiers exactly as described in the reference, never as GitHub numbers.

## Select the next issue

For `next` only:

1. Count all of the user's open PRs in this repository, including drafts, with pagination. At three or more, stop and list them.
2. Read the full open backlog, including issues without migration/status labels. Exclude epics (route to `/plan-epic`), unresolved decisions (route to `adr-skill`), in-progress work, incomplete or unknown blockers, and unmet manual/external prerequisites.
3. Order by priority (urgent, high, medium, low, none), then milestone sequence (M0, M1, M2…), then creation time. Use preserved original creation dates for migrated issues when available.
4. Check open PR diffs and skip overlapping candidates. Announce the selected number, title, and reason. Do not change skipped issues.

## Workflow

### 1. Read and check prior work

- Fetch full body, comments, state, labels, assignees, milestone, parent, sub-issues, blockers, and linked PRs. Follow pagination, including comments and relations.
- Scope and acceptance criteria define completion. Read referenced code and `docs/decisions.md`; an old issue's proposed fix does not override an ADR.
- Stop and recommend `/plan-epic` for scope too broad for one reviewable PR. Surface unresolved architecture decisions before implementation.
- Search existing branches and all PR states using the GitHub number and any preserved MON identifier; confirm actual links/content, not numeric substring matches. Continue verified existing work instead of duplicating it.
- If a merged PR or current default-branch code already covers the issue, report evidence and comment on the issue. Do not make a no-op PR or automatically close it.

### 2. Branch and implement

- Inspect the working tree; preserve user changes. Fetch the default branch and create `codex/issue-<number>-<short-slug>` from its current remote tip unless continuing existing work or the user chose another base. Disclose a stale base if fetching is unavailable.
- Never commit to the default branch. Read every file before editing. Make the smallest change satisfying acceptance criteria.
- Flag schema/deployment risks. Ask before non-idempotent migrations, destructive operations, production configuration changes, or actions costing money. Writing a migration does not authorize running it in production.

### 3. Verify

- Inspect current CI configuration and run relevant gates. Distinguish baseline/environment failures from regressions; report unverified checks instead of assuming historical failures remain normal.
- Known local baselines to investigate: the full pytest suite can fail with database connection errors when Docker is down; frontend builds have previously failed during `sitemap.xml` prerendering. Reproduce on the current default branch in a separate worktree/environment before classifying either as baseline noise. These are diagnostic clues, not permission to waive a new failure or call an unrun check green.
- Backend defaults: `venv/bin/python -m pytest tests/ -m "not integration" -q`, `venv/bin/ruff check .`, and `venv/bin/ruff format --check .`. Run relevant integration tests when prerequisites are available. Report unrelated lint drift instead of silently changing unrelated files.
- Frontend changes: run current frontend lint, type-check, tests, and relevant build/smoke checks from `frontend/`.
- Exercise the changed behavior, not only mocks. Use `docs-sync` when documentation describes the changed behavior.

### 4. Commit, push, and create the PR

- Stage only this task's files, honor pre-commit hooks, and use factual commit authorship; do not invent co-author identities.
- Check concurrent/automatic commits and the cumulative diff against the base before pushing. Do not reset, squash, or remove suspected duplicate files without verifying ownership and authorization.
- Never squash, reset, or stash on shared branches: the user may commit in parallel; use per-branch worktrees for isolation. This repository has experienced auto-committer/iCloud sync creating `"<name> 2.<ext>"` duplicates, committing under its own messages, and reverting files to stale content. Inspect the log, status, and cumulative diff before pushing; verify provenance before restoring edits or removing duplicates.
- Use the project `pr-create` skill. Title: `<type>: <headline> (#<number>)`. Body: changes and rationale, acceptance-criterion evidence, tests, risks, and `Closes #<number>` for fully covered issues. Use `Refs #<number>` for partial work and parent epics.

### 5. Update GitHub, check CI, and review

- Keep the issue open. Set `status: in progress`, removing contradictory status labels. Assign the authenticated user when appropriate and comment with the PR link, approach, and deferred scope. Keep original migration metadata as history.
- Watch checks with bounded waits and progress updates. Diagnose run logs and fix regressions on the same branch.
- Use project `pr-review`, apply Must Fix and Should Fix findings, push, and verify CI again. Do not implement unrelated nice-to-haves automatically.
- Stop before merge. Report issues, branch, PR, acceptance coverage, review verdict, CI, and outstanding prerequisites. Do not close issues merely because a PR exists.
- After the user merges, GitHub closing keywords normally close fully linked issues. Explicit `/po-agent sync` in Claude Code can reconcile missed closures and stale status labels using verified merged-PR evidence; it is not an instruction to run sync or merge during this workflow.

## Boundaries

- Never skip hooks or force-push shared work. Scope growth requires user direction, not automatic extra issues.
- Failed GitHub writes are not success. Re-read after writes and reconcile uncertain results before retrying. If access remains blocked, report the unfinished update; never fall back to Linear writes.
