# Linear → GitHub parity audit

Date: 2026-09-05. Repository: `Walid-peach/MonElu`.

## Verdict

The 26 unfinished issues in the supplied export were copied accurately, but the two trackers are **not fully equivalent**. Content parity with the export is verified; full historical parity and live Linear parity are not.

Source: `Export Fri Sep 04 2026.csv`, 271 issue records; SHA-256 `49d503ea8e26ec21168fe0f9857a8b08f9e50ad195c8a43f5f86e894e831cf70`.
The export contains 245 Done, 23 Backlog, 2 In Progress, and 1 Todo issues.
Live GitHub was read through all paginated REST issue-list pages, excluding pull requests: 97 issues total, 32 open. The extra six open issues predate the migration.
No connected Linear API or browser session was available for a live comparison. Later Linear edits, discussions, and attachment accessibility remain unverified.
Neither service was changed during this audit.

## Field comparison

Each unfinished CSV record was matched by exact legacy title prefix and UUID migration marker; no missing or duplicate migrated matches were found.

| Check | Result |
| --- | --- |
| Title, including original MON identifier | 26/26 exact |
| Description | 26/26 exact after intended Linear-to-GitHub URL substitutions |
| Open state and original workflow label | 26/26 correct |
| Labels and priority labels | 26/26 exact sets, case-insensitive |
| Assignees | 26/26 correct; two assigned to Walid-peach, 24 unassigned |
| Milestones | 23 named milestones preserved on issues; three correctly empty |
| Project, assignee, created/updated metadata in bodies | All populated values preserved |
| UUID source marker | 26/26 preserved |
| Parent, blocker, and related links in bodies | All exported entries preserved |

The milestone count above is the number of issues with a milestone, not distinct milestone objects. These checks establish faithful copying, not whether every source issue is still actionable.

## Missing or changed semantics

- **History:** the 245 Done records were not imported as migration records. Older GitHub issues may cover some of this work; this was not a complete historical reconciliation.
- **Discussions:** all 26 imported issues have zero GitHub comments. The CSV has no discussion/event/attachment collections; those were not copied or compared. Description links are retained, but linked assets were not downloaded or accessibility-tested.
- **Native relations:** querying sub-issues and blocked-by endpoints on every migrated issue returned zero native relations. Five children of MON-105 (#361) are only body-linked. Two other children point to the completed, unmigrated MON-110 parent.
- **Dependencies:** nine issues have 11 exported blocker edges. Five edges point to unfinished migrated issues; six point to Done records. They are historical links, not all active blockers.
- **Metadata:** original creator (26), started timestamp (2), and time-in-status (26) were not preserved in issue bodies. GitHub authorship and timestamps describe the import. Original created/updated dates are textual metadata, not native timestamps. Team/project/milestone UUIDs have no corresponding native migration mapping beyond issue UUID provenance.
- **Project organization:** project names are text, not a verified GitHub Projects board. Milestone names were compared; milestone-level descriptions, dates, order, and project settings cannot be reconstructed from this issue CSV.
- **Empty source fields:** estimates, cycles, due dates, initiatives, SLA status, duplicate-of, archived/canceled/completed timestamps are empty for all 26 unfinished rows, so no populated issue values were lost there.
- **Archive dependence:** completed-issue links and source links still require Linear access. Do not delete the workspace/export on the assumption GitHub is a complete archive. No read-only workspace permission was enforced.

## Parent and blocker reconciliation

| GitHub issue | Parent | Exported blockers | Interpretation at export time |
| --- | --- | --- | --- |
| #366 / MON-211 | MON-110 (Done) | MON-210 (Done) | Historical prerequisite completed |
| #367 / MON-213 | MON-110 (Done) | MON-212 (Done) | Historical prerequisite completed |
| #368 / MON-243 | #361 | MON-242, MON-258 (Done) | Historical prerequisites completed |
| #369 / MON-244 | #361 | #368 | Still blocked |
| #370 / MON-245 | #361 | #369 | Still blocked |
| #371 / MON-246 | #361 | #370 | Still blocked |
| #372 / MON-247 | #361 | #370 | Still blocked |
| #377 / MON-259 | None | MON-260 (Done) | Historical prerequisite completed |
| #378 / MON-263 | None | #379; MON-273 (Done) | Still blocked by #379 |

Done here means the CSV status, not a fresh Linear check. Verify merged implementation/acceptance evidence before automatic scheduling.

## Extra and stale backlog entries

Six open GitHub issues are outside the 26-record import: [#17](https://github.com/Walid-peach/MonElu/issues/17), [#46](https://github.com/Walid-peach/MonElu/issues/46), [#138](https://github.com/Walid-peach/MonElu/issues/138), [#352](https://github.com/Walid-peach/MonElu/issues/352), [#353](https://github.com/Walid-peach/MonElu/issues/353), and [#356](https://github.com/Walid-peach/MonElu/issues/356). Do not exclude them simply because they lack migration labels, or close them simply to make tracker counts match.

- **#138 contradicts ADR-019:** its proposal excludes nonVotant from presence. The adopted definition includes nonVotant and uses mandate windows. MON-22 and MON-23 are Done in the export. Review remaining scope; do not implement the stale proposed formula.
- **#46 is stale against current master:** it describes DEBUG-only deputy parse failures. The live GitHub source now logs individual failures at WARNING and reports skipped counts/rates, with a high-failure guard. The export records later remediation MON-220 as Done. Reconcile and propose closure rather than reimplementing the old fix.
- **#373 / MON-253 may already be covered:** its root-redirect/environment-variable scope overlaps Done MON-274 and [merged PR #338](https://github.com/Walid-peach/MonElu/pull/338), merged 2026-08-30. A faithful migration can preserve a stale source issue. Verify all acceptance criteria before proposing closure.
- **#358 / MON-42 needs scope reconciliation:** it remains In Progress, but its environment/MinIO scope overlaps Done MON-237 and the archived Airflow/MinIO decisions. Do not assume all of its scope remains applicable.

These are triage findings, not authority to close issues. No issues were closed or relabeled.

## Migration mapping

| Linear | GitHub | Linear | GitHub |
| --- | --- | --- | --- |
| MON-42 | #358 | MON-246 | #371 |
| MON-91 | #359 | MON-247 | #372 |
| MON-93 | #360 | MON-253 | #373 |
| MON-105 | #361 | MON-255 | #374 |
| MON-117 | #362 | MON-256 | #375 |
| MON-188 | #363 | MON-257 | #376 |
| MON-189 | #364 | MON-259 | #377 |
| MON-204 | #365 | MON-263 | #378 |
| MON-211 | #366 | MON-264 | #379 |
| MON-213 | #367 | MON-265 | #380 |
| MON-243 | #368 | MON-266 | #381 |
| MON-244 | #369 | MON-271 | #382 |
| MON-245 | #370 | MON-272 | #383 |

## Workflow handoff

The project skills now use GitHub as the active tracker. `solve-issue` is canonical; `solve-mon` only resolves legacy identifiers and delegates. `top-issues` remains read-only; `plan-epic` and `diagnose` use GitHub creation/deduplication. Shared instructions cover both native and body-only relations, stale historical states, pagination, and stopping before merge.

Optional follow-up to improve operational parity: create the five native parent links and five unresolved native blocker links; reconcile stale issues with acceptance evidence; retain the original export and Linear access for history. A complete historical migration needs separate scope and a source containing comments/attachments.
