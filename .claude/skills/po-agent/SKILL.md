---
name: po-agent
description: Reconciles MonÉlu GitHub issues with verified PR state, detects the current issue without writes, or drafts and creates deduplicated backlog issues. Use /po-agent sync (default), detect, or fill.
---

Act as a Product Owner assistant for `Walid-peach/MonElu`. Read [the GitHub backlog conventions](../solve-issue/references/github-issues.md), including legacy-ID resolution, state reasons, pagination, and verified writes. Linear is historical only; never write to it.

ARGUMENTS: `[mode] [args]`

- `/po-agent` or `/po-agent sync`: reconcile GitHub issues with PR evidence.
- `/po-agent detect`: identify the current issue and propose a transition, read-only.
- `/po-agent fill <description>`: draft and create scoped backlog issues.

## sync

1. Paginate issues and PRs in all states (exclude PR records from the issue list). Include closed issues when checking stale workflow labels. Check each selected issue's linked PRs/timeline, including older merged work; do not impose an arbitrary recent-PR cutoff.
2. Establish actual issue-to-PR relationships: closing links/keywords for this repository, or an explicit legacy mapping with full-scope evidence. Title/branch/body mentions are discovery hints, not proof of completion. Distinguish `Refs #N` from `Closes #N`, and GitHub issues from PRs sharing the number namespace.
3. For each confirmed match:
   - Open PR genuinely implementing the issue, issue still open: replace backlog/todo labels with `status: in progress`. Do not close it.
   - PR merged into the repository default branch and all issue acceptance criteria covered: GitHub normally closes it automatically. If still open, verify it was not deliberately reopened after that merge before closing as completed, with an evidence comment linking the PR.
   - Already closed as completed: remove stale active workflow labels only when the matched merged PR supports completion. Do not create a redundant Done label or repeat comments.
   - Closed as not planned/duplicate, deliberately reopened, partial implementation, multiple unresolved PRs, or ambiguous evidence: leave unchanged and report for user review.
   - Local branch only, unmerged closed PR, no match, or merge into a non-default branch: leave unchanged. None proves delivery.
4. Re-read state, comments, and labels before a write to detect intervening edits; read back afterward. Reconcile uncertain results before retrying.
5. Report issue number/URL, old and new state/labels, linked evidence, and skipped/ambiguous cases.

An invocation of sync authorizes these narrowly evidenced tracker updates, not merging PRs or guessing completion from any MON mention. Without merged full-scope evidence, propose closure and ask for confirmation instead.

## detect

1. Read current branch, recent commits, working-tree diff, and any existing PR without switching branches.
2. Resolve candidate GitHub numbers or exact migrated MON IDs; verify issue content against the diff. Search title keywords only as a fallback discovery aid.
3. Report the match, current issue state, branch/PR, and proposed transition with reasoning. Do not write. Ask for confirmation before applying a change.
4. If missing or ambiguous, report it and offer fill; never create automatically.

## fill

1. Parse the requested work. Split only genuinely distinct deliverables; do not expand scope.
2. Paginate open and closed GitHub issues, compare title/content and historical reports, and check merged work. Report near-duplicates and ask whether a distinct issue is intended before creating.
3. Draft each issue with a concise action-oriented title, context, **Scope**, and checkable **Acceptance criteria**. Apply existing layer/type labels, `status: backlog`, and a justified priority label (medium by default; high for a demonstrated break/blocker, low for explicitly deferred polish). Use an existing appropriate milestone or flag the missing mapping.
4. Show drafts before creation; proceed within the requested fill scope unless redirected. Use `gh issue create --repo Walid-peach/MonElu` with body files.
5. Read back creations and report real GitHub numbers/URLs. If only part succeeds, report exactly what exists and dedupe before retrying.

## Boundaries

- Never commit, push, open/merge PRs, or write to production; this skill only changes GitHub issues in sync/fill. Detect is read-only.
- Do not infer that lack of GitHub history means completed Linear work must be recreated.
- If access is unavailable, return proposed updates/drafts clearly marked unapplied; do not fall back to Linear.
