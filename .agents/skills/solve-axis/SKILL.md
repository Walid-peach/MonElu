---
name: solve-axis
description: Fixes all open diagnostic issues for one project axis end-to-end — gathers scope from Linear and notes/dispatch, branches, implements, opens a PR, updates Linear, watches CI, runs pr-review and applies the fixes, then marks the axis solved in the diagnostic roadmap. Stops before merge. Use as /solve-axis <axis>, e.g. /solve-axis database.
---

Resolve every open diagnostic finding for one axis of the MonÉlu project, following the
exact cycle proven on the ingestion axis (PR #139). Work through the PR review and its
fixes, but **never merge** — merging and closing Linear issues stay the user's call.

ARGUMENTS: the axis (category) to solve — one of:
`ingestion, database, api, transform, rag, cicd, deploy-config, infra, frontend, tests`.
These match the Linear labels in the MonElu team and the report names in `notes/dispatch/`.

Linear writes (`mcp__linear-server__save_issue`, `save_comment`) are allowlisted in
`.Codex/settings.local.json` — apply Linear updates directly, no need to ask or to
hand the user a manual list unless the MCP itself is down.

## Workflow

### 0. Sync Linear with merged remediation PRs

Before scoping, reconcile the board: `gh pr list --state merged` and match
`fix: <axis> diagnostics … (MON-x..y)` titles against issue statuses. Any issue
whose remediation PR has **merged** but still sits In Progress → move to **Done**
(merge is the user's act of approval; moving the issue afterwards is bookkeeping,
not a decision). Issues on still-open PRs stay In Progress; never touch Backlog
issues here.

### 1. Gather scope — two sources, always both

- **Linear** (project "Diagnostic Remediation 2026-06", team MonElu): list issues
  filtered by the axis label, excluding Done/Canceled. Capture each issue's ID
  (MON-x), title, priority, and description.
  If the Linear MCP is unavailable this session, say so, fall back to the
  diagnostic report alone, and note that Linear updates will be listed for manual
  application instead.
- **`notes/dispatch/`**: read the axis's diagnostic report
  (`<axis>_diagnostic_<date>.md` — e.g. `database_diagnostic_2026-06-11.md`; the
  transform and rag axes share `transform_rag_diagnostic_*.md`) for file paths,
  line references, and the recommended fixes. Also read
  `notes/dispatch/diagnostic_roadmap.md` for the axis's headline summary.

Present the scoped issue list (ID, title, priority). Separate two kinds of items:
- **Code fixes** — implement them.
- **Decisions** (e.g. "archive infra/", "pick one presence definition") — ask the
  user before acting on these; they change project direction, not just code.

Line numbers in the reports may have drifted since the diagnostic date — always
re-read the affected code and adapt; say so when the report no longer matches.

### 2. Branch

Confirm a clean tree (`git status`), then `git checkout -b fix/<axis>-diagnostics`
off the default branch. Never commit to master.

### 3. Implement

For each issue: read the affected files before editing; make the smallest change
that resolves the finding; follow the diagnostic's recommended fix unless the code
has drifted. No unrelated refactors. Flag DB-migration or deploy-risky changes
(schema edits, railway.json, workflow triggers) explicitly before applying them.

### 4. Verify locally — lessons baked in from the ingestion run

- **Baseline before judging**: the full suite has known rot (6 stale tests) and
  local-DB connection errors when Docker is down. Run
  `venv/bin/python -m pytest tests/ -q` before or right after changes and compare —
  only *new* failures block. `tests/unit/` must stay green:
  `venv/bin/python -m pytest tests/unit/ -q`.
- **Lint repo-wide, not just touched files**: CI runs `ruff format --check` over
  the whole repo, so pre-existing drift in untouched files fails the PR. Run
  `venv/bin/ruff check .` and `venv/bin/ruff format --check .`; if an unrelated
  file has drifted, format it and include it (mention it in the PR body).
- Smoke-test entry points (`--help`, imports) whenever CLIs or signatures change.

### 5. Commit & push — watch for the auto-committer

Known repo quirk: an auto-committer/iCloud sync may commit your edits under its own
messages, occasionally **reverts** files to stale states, and creates duplicate
`"<name> 2.<ext>"` files. Before pushing:
- Check `git log` for commits you didn't make and `git status` for `" 2."` files
  (delete the duplicates).
- Verify the **cumulative** diff is what you intend: `git diff master...HEAD`.
- Re-apply anything that got reverted, then push. Commit messages end with:
  `Co-Authored-By: Codex Fable 5 <noreply@anthropic.com>`.

### 6. Create the PR

`gh pr create`, title `fix: <axis> diagnostics — <headline> (MON-x..y)`. Body: one
section per Linear issue mapping finding → fix, a testing section, and the footer
`🤖 Generated with [Codex](https://Codex.com/Codex)`.

### 7. Update Linear

For each issue in scope (`save_issue` + `save_comment`, pre-allowlisted):
status → **In Progress** (Done only happens after merge — see step 0), assignee →
the workspace user, and a comment linking the PR. For issues found already fixed
on master or won't-fix, say so in the comment instead. If the MCP is down, output
the exact list of updates for the user to apply manually.

### 8. Watch CI

`gh pr checks <number> --watch`. If a check fails, diagnose from the run logs
(`gh run view <id> --log-failed`) and fix on the same branch — as was needed for
the repo-wide format gate on PR #139.

### 9. Review and apply fixes

Invoke the `pr-review` skill on the PR. Then apply all **Must Fix** and
**Should Fix** findings (use judgment on Nice-to-haves), push, and confirm CI is
green again.

### 10. Mark the axis solved in the roadmap

Edit `notes/dispatch/diagnostic_roadmap.md`:
- Axis heading: `## N. <Axis> — ✅ done (<diag date>) · ✅ solved (<today's date>)`
- Add a line under the section: `**Remediation:** PR #<n> (<url>) — fixes MON-x, MON-y, …`
- If the Legend doesn't yet document the `solved` marker, add it once:
  `✅ solved — remediation PR opened and reviewed`.
- `notes/` is gitignored — this edit is local-only, no commit needed.

### 11. Stop and report — do not merge

Final report: branch name, PR URL, issues fixed (MON-IDs), review verdict, CI
status, and any decision-items deferred to the user. Do **not** merge the PR and do
**not** move this run's issues to Done — the next run's step 0 (or the user asking
to sync) does that once the PR has merged.

## Guard rails

- Never commit or push to master; never skip pre-commit hooks (`--no-verify`).
- Ask before: schema migrations that aren't idempotent, deleting directories,
  changing deploy config semantics (railway.json, workflow cron/triggers).
- If an issue turns out to be already fixed on master, say so, skip it, and note
  it in the PR body and the Linear comment instead of making a no-op change.
