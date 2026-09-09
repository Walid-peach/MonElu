# MonÉlu GitHub backlog conventions

GitHub Issues in `Walid-peach/MonElu` is the active backlog. Linear links and MON identifiers are historical provenance, not another writable tracker. Never assume `MON-42` means GitHub `#42`.

## Read completely before deciding

Use authenticated `gh` with explicit `--repo Walid-peach/MonElu` (or REST paths for that repository). This repository is public: do not post secrets or private account data. Distinguish network denial, authentication, and authorization failures.

For an exhaustive inventory:

```sh
gh api --paginate --slurp 'repos/Walid-peach/MonElu/issues?state=all&per_page=100'
```

Flatten pages and exclude entries containing `pull_request`. Do not mistake a default CLI page or search limit for the complete backlog. Read full bodies and paginated comments. Query labels and milestones rather than inventing names; compare existing label names case-insensitively.

Resolve legacy IDs across all issue states by exact `MON-N: ` title prefix, checked against the migration marker/source link. Body mentions are not identity. Zero or multiple matches require clarification, not creation. Native GitHub issues do not require a MON identifier.

## State and priority

- GitHub `open`/`closed` is authoritative. Inspect `state_reason`: closed as not planned or duplicate is not proof that a prerequisite was delivered.
- Open workflow labels: `status: backlog`, `status: todo`, `status: in progress`. Missing status means untriaged, not excluded. Investigate conflicting labels.
- Priorities: `priority: urgent`, `priority: high`, `priority: medium`, `priority: low`, `priority: no priority`. Missing priority means none. Priority does not replace effort/impact judgment.
- Use native GitHub milestones. Migration `Project` and `Original status` text is historical, not a live Projects board or workflow state.
- On authorized transitions, retain at most one active status label. Closed state overrides leftover in-progress labels; do not reopen based on labels alone.
- Use `Closes #N` only for fully resolving PRs; `Refs #N` for partial work/epics. Closing keywords take effect when merged into the default branch. Stop before merge unless explicitly asked otherwise.

## Parents and dependencies

Read native relations through the installed CLI if supported, or paginated REST:

```sh
gh api --paginate 'repos/Walid-peach/MonElu/issues/NUMBER/sub_issues?per_page=100'
gh api --paginate 'repos/Walid-peach/MonElu/issues/NUMBER/dependencies/blocked_by?per_page=100'
```

Read the native parent with the supported CLI/API too. The migration initially preserved relations only in body lines (`Parent issue`, `Blocked by`, `Related to`), so inspect those and later comments as well. Absence of native blockers does not prove readiness. Parent/related links are not blockers unless explicitly designated.

Resolve blockers to current issues and acceptance evidence. For completed, unmigrated MON references consult the dated [migration audit](../../../../docs/linear-github-parity-2026-09-05.md) and repository/merged-PR evidence. The export's Done state is historical evidence, not live status. Unknown or inaccessible prerequisites stay unresolved for automatic selection.

When planning authorizes relationships, create native sub-issue/dependency links and verify them. Payloads use the target's database `id`, not visible issue `number`. Check the current [sub-issue API](https://docs.github.com/en/rest/issues/sub-issues) and [dependency API](https://docs.github.com/en/rest/issues/issue-dependencies) before writing. Never silently reparent existing children. If native writes are unavailable, add explicit `Parent: #N` / `Blocked by: #N` lines and a parent checklist; disclose text-only relations. Preserve existing content and reconcile uncertain results before retrying.

## Migration and deduplication

The September 2026 import covered 26 unfinished CSV issues. Completed history and discussions were not imported. GitHub also contains older/native issues. Search open and closed GitHub issues plus available historical reports/ADRs before filing findings. Flag stale issues that contradict later ADRs; do not implement their old proposals. Never recreate completed history merely because no migrated issue exists.
