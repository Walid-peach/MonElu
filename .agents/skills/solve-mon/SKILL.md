---
name: solve-mon
description: Resolves a Linear (MonElu) issue end-to-end - reads the MON issue, branches on its gitBranchName, implements, verifies, opens a PR, updates Linear, watches CI, runs pr-review and applies the fixes. Stops before merge. Use as /solve-mon <MON-id>, e.g. /solve-mon MON-75. Replaces the retired solve-axis skill.
---

Resolve one Linear backlog issue for the MonÉlu project end-to-end, following the cycle proven on the diagnostic axes (PRs #139-#151) and the feature waves (PRs #154-#174).
Work through the PR review and its fixes, but **never merge** - merging and moving the issue to Done stay the user's call.

ARGUMENTS: one or more MON-ids (e.g. `MON-75` or `MON-66 MON-68`).
Multiple ids mean the issues are small and related enough to share one branch and one PR - if they are not, say so and ask which one to start with.

Linear writes (`mcp__linear-server__save_issue`, `save_comment`) are allowlisted in `.claude/settings.local.json` - apply Linear updates directly.
If the Linear MCP is unavailable, say so and output the exact updates for manual application instead.

## Workflow

### 1. Read the issue

- Fetch the full issue with `mcp__linear-server__get_issue` (team MonElu): title, description, priority, labels, milestone, `gitBranchName`, and any comments.
- The description usually carries a **Scope** and **Acceptance criteria** section - treat the acceptance criteria as the definition of done.
- If the issue is an epic (multiple pages, schema + API + frontend, or vague scope with no acceptance criteria), stop and recommend `/plan-epic` instead of forcing it into one PR.
- If the issue references files or line numbers, read that code before proceeding.
  Descriptions may have drifted since filing - always re-read the affected code and adapt; say so when the issue no longer matches reality.

### 2. Check for prior work

- Search for an existing branch: `git branch -a | grep -i mon-<n>` and check merged PRs (`gh pr list --state all --search "MON-<n>"`).
- If a merged PR already covers the issue, report it, propose moving the issue to Done via `/po-agent sync` semantics, and stop.
- If an open branch or PR exists, continue from it rather than starting over.

### 3. Branch

Confirm a clean tree (`git status`), then branch off the default branch using the issue's `gitBranchName` (e.g. `feature/mon-75-run-the-22-postgres-integration-tests-in-ci`).
This keeps Linear's branch autolinking working.
Never commit to master.

### 4. Implement

- Read every file before editing it.
- Make the smallest change that satisfies the acceptance criteria - no unrelated refactors, no speculative abstractions.
- Follow `docs/decisions.md`; if the work contradicts an ADR or requires a new architectural decision, pause and raise it (optionally via the `adr-skill`) before coding around it.
- Flag DB-migration or deploy-risky changes (schema edits, `railway.json`, workflow triggers, CORS/env semantics) explicitly before applying them.

### 5. Verify locally - lessons baked in from previous runs

- **Baseline before judging**: the full suite has known local-DB connection errors when Docker is down.
  Run `venv/bin/python -m pytest tests/ -q` before or right after changes and compare - only *new* failures block.
  The CI blocking gate is `pytest tests/ -m "not integration"` (plus a separate integration job) - that selection must stay green: `venv/bin/python -m pytest tests/ -m "not integration" -q`.
- **Lint repo-wide, not just touched files**: CI runs `ruff format --check` over the whole repo, so pre-existing drift in untouched files fails the PR.
  Run `venv/bin/ruff check .` and `venv/bin/ruff format --check .`; if an unrelated file has drifted, format it and include it (mention it in the PR body).
- **Frontend work**: `cd frontend && npm run lint && npm test && npm run build` (CI runs lint, `tsc --noEmit`, and the Jest suite; `next build` covers the type check).
  A `sitemap.xml` prerender error that reproduces identically on master is known noise - confirm on master before blaming the change.
- Exercise the change for real (via the global `verify` skill when available), not just tests: hit the endpoint, load the page, run the script.
- Run the `docs-sync` skill if the change touches anything CLAUDE.md, `docs/`, or the README describes.

### 6. Commit and push - watch for the auto-committer

Known repo quirk: an auto-committer/iCloud sync may commit edits under its own messages, occasionally **reverts** files to stale states, and creates duplicate `"<name> 2.<ext>"` files.
Before pushing:

- Check `git log` for commits you didn't make and `git status` for `" 2."` files (delete the duplicates).
- Verify the **cumulative** diff is what you intend: `git diff master...HEAD`.
- Never squash or reset existing commits on the branch - the user may be committing in parallel; verify the cumulative diff and push as-is.
- Re-apply anything that got reverted, then push.

### 7. Create the PR

Use the `pr-create` skill.
Title format: `<type>: <headline> (MON-<n>)` where type is `feat`/`fix`/`perf`/`chore`/`test`.
Body: what changed and why, a mapping from each acceptance criterion to how it is met, a test plan, any deploy/migration risks, and the standard footer.

### 8. Update Linear

For each issue in scope (`save_issue` + `save_comment`):
status to **In Progress** (Done only happens after the user merges), assignee to the workspace user, and a comment linking the PR with a one-paragraph summary of the approach.
If part of the scope was intentionally deferred, say so in the comment.

### 9. Watch CI

`gh pr checks <number> --watch`.
If a check fails, diagnose from the run logs (`gh run view <id> --log-failed`) and fix on the same branch.

### 10. Review and apply fixes

Invoke the `pr-review` skill on the PR.
Apply all **Must Fix** and **Should Fix** findings (use judgment on Nice-to-haves), push, and confirm CI is green again.

### 11. Stop and report - do not merge

Final report: MON-id(s), branch name, PR URL, how each acceptance criterion was met, review verdict, CI status, and anything deferred.
Do **not** merge the PR and do **not** move the issue to Done - `/po-agent sync` does that once the PR has merged.

## Guard rails

- Never commit or push to master; never skip pre-commit hooks (`--no-verify`).
- Never squash, reset, or stash on shared branches (per-branch worktrees; user commits in parallel).
- Ask before: non-idempotent schema migrations, deleting directories, changing deploy config semantics (`railway.json`, workflow cron/triggers), anything that costs money (RAG re-index, paid API usage).
- If the issue turns out to be already fixed on master, say so and update Linear with a comment instead of making a no-op change.
- If scope grows mid-implementation beyond the acceptance criteria, stop and propose splitting via `/plan-epic` or a follow-up issue via `/po-agent fill`.
