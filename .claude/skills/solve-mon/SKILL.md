---
name: solve-mon
description: Compatibility alias for legacy /solve-mon MON-N requests. Resolves the migrated GitHub issue and follows solve-issue without using Linear. Prefer /solve-issue for new work.
---

Read [solve-issue](../solve-issue/SKILL.md) and its linked GitHub backlog reference, then follow that workflow.

- `next` delegates to `/solve-issue next`, including its WIP limit.
- Resolve each `MON-N` by exact migrated title prefix and verified migration marker/source link. Never treat `MON-42` as GitHub `#42` or resolve from a body-only mention.
- If no unique migrated issue exists, report the missing/ambiguous mapping and stop. Do not create a duplicate or fall back to Linear writes.
- Use GitHub numbers for branches, PR closing keywords, comments, and workflow status; retain legacy IDs as history.
