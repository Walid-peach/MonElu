---
name: top-issues
description: Surfaces the top 10 Linear issues to attack next, ranked by effort vs impact, with a separate section for issues that need manual/external setup before code can start. Use as /top-issues, or /top-issues <filter> to scope by milestone, label, or priority (e.g. /top-issues frontend, /top-issues M2).
---

Triage the open MonÉlu backlog in Linear and hand back a ranked shortlist to attack next - not a full backlog dump, a decision aid.
This skill only reads Linear and the codebase - it never files, edits, or starts issues. Follow-up work happens via `/solve-mon <id>` or `/plan-epic <id>`.

ARGUMENTS: optional filter - a milestone name (e.g. `M0`, `M2 - Core UX`), a label (`frontend`, `rag`, `tech-debt`), or a priority (`high`). No argument scans the whole open backlog.

## Workflow

### 1. Pull the open backlog

`mcp__linear-server__list_issues` for team MonElu across the open states actually in use (`Backlog`, `Todo`, and any `In Progress` if present - check what states exist, don't assume). Use a high `limit` (100+) to get everything in one pass rather than paging.
If a filter argument was given, apply it via the `project`/`label`/`priority` params where they map directly; otherwise filter client-side after fetching (milestone names don't have a dedicated list_issues param).

Exclude anything already `Done`, `Canceled`, or `Duplicate`.

### 2. Score each issue on effort vs impact

For every open issue, read enough of the description (`get_issue` if the truncated summary isn't enough to judge) to place it on two axes:

**Effort** - infer from scope, not from the Linear priority field:
- *Low*: touches one file or one narrow surface (a component, a query, a single endpoint), no new external dependency, no schema migration with data risk.
- *Medium*: touches a few files or one full vertical slice (API + frontend), may need a small migration or a new table.
- *High*: labeled `epic`, spans ingestion + API + frontend, or requires a product/design decision before implementation can start.

**Impact** - judge from what the issue itself argues (trust, credibility, retention, distribution, correctness-visible-to-users) plus Linear priority as a signal, not the sole input. A Low-priority issue that fixes a visible "looks broken" moment can outrank a Medium-priority nice-to-have.

**Manual-setup flag** - mark an issue as needing manual setup if it requires any of: a new external account or SaaS signup (email provider, payment processor, form service), a secret/API key that must be provisioned and added to Railway/GitHub env vars, DNS changes (domain verification), or non-code work (an audit, a legal/compliance step, a business decision) before code can start. A DB migration alone does *not* count as manual setup - that's routine.

### 2b. Verify before recommending

Before an issue makes the final ten, confirm it's still actionable: re-read its current Linear state (not a stale mental model), and spot-check that any file/function it names still exists (`grep`/`Read`) if the recommendation hinges on it. Drop or flag anything that's stale.

### 3. Rank and select the top 10

Sort by impact-per-effort (favor Low/Medium effort + Medium/High impact over High effort regardless of raw impact - the goal is what to attack *next*, not the most important issue in the abstract). Prefer diversity: don't let one milestone or label dominate all 10 if comparable-value issues exist elsewhere, unless a filter argument narrows scope intentionally.

Cap at 10. If fewer than 10 open issues clear a reasonable impact/effort bar, say so rather than padding with weak picks.

### 4. Report in this format

Two-part answer, matching the shape used in the 2026-07-13 backlog triage:

**Quick wins** - a markdown table: `Issue | What | Why it's easy | Impact`, one row per Low/Medium-effort pick with no manual setup, ranked best-first. Close with a one-line recommendation of which one or two to start with and why (e.g. same page/PR, near-zero risk, most visible fix).

**Higher-impact / bigger scope** (only if any made the top 10) - a short bullet list of picks that are High-impact but not trivial effort, still self-contained (no external accounts needed). Flag `epic`-labeled issues and note they need `/plan-epic <id>` before implementation.

**Needs manual setup** - a bullet list of any top-10 picks (or notable near-misses worth flagging) that need an external account, secret provisioning, DNS, or non-code work first. For each: name the specific manual step (e.g. "Resend/SendGrid account + sender domain verification + API key in Railway env vars"), not just "needs setup."

End with one offer to proceed: start the top pick, or let the user redirect.

## Guard rails

- Read-only against Linear and the codebase - never call `save_issue`, `save_comment`, or any write tool.
- Never invent issues - every pick must be a real, currently-open Linear issue with its MON-id and URL.
- Don't let Linear's `priority` field alone drive ranking - it's one input; the effort/impact judgment call is the point of this skill.
- If the filter argument matches zero open issues, say so plainly instead of silently falling back to the full backlog.
