---
name: adr-skill
description: >
  Create, maintain, and enforce Architecture Decision Records (ADRs) for
  software projects built with AI assistants. Use this skill whenever the
  user wants to document a technical decision, prevent AI from writing code
  based on outdated specs, capture a "we decided not to build X" moment,
  review existing decisions before starting a new feature, or create a
  decisions.md file for their project. Also trigger when the user says things
  like "document this decision", "we changed the architecture", "don't build
  that anymore", "add this to the decisions file", "what did we decide about X",
  or "create a skill for this pattern". This skill is especially valuable for
  solo developers using Claude Code — where the AI assistant has no memory
  between sessions and can repeat mistakes or contradict past decisions without
  a written record.
---

# Architecture Decision Records (ADR) Skill

## What this skill does

Helps you create and maintain a `docs/decisions.md` file that serves as the
single source of truth for your project's architectural decisions. Every future
AI session reads this file first — preventing repeated mistakes, contradicted
decisions, and code written for features you decided not to build.

## When to use it

- Before starting a new phase or feature
- When you change your mind about an architectural choice
- When you decide NOT to build something (the most important ADRs)
- After a Claude Code session produces code that contradicts a past decision
- When onboarding a new AI session to an existing project

---

## ADR Format

Each decision follows this structure:

```markdown
## ADR-NNN — Short title
**Date:** When the decision was made
**Status:** Final | Current | Deferred | Superseded by ADR-NNN

**Decision:** One sentence — what was decided.

**Reason:** Why. Be specific. Include what was rejected and why.

**Impact:** What this means for future development.
  - What TO do
  - What NOT to do (critical for AI assistants)

**Trigger to revisit:** When should this decision be re-evaluated?
```

---

## How to create a new ADR

### Step 1 — Identify the decision type

| Type | Example | Priority |
|------|---------|----------|
| Rejected technology | "No Kafka — using Airflow polling" | 🔴 Critical |
| Deferred feature | "Alerts deferred until real users" | 🔴 Critical |
| Architecture constraint | "Airflow local only, not in prod" | 🟡 High |
| Known limitation | "CI hits prod DB — not isolated" | 🟡 High |
| Data quirk | "AN has no REST API — ZIP exports only" | 🟢 Medium |
| Infrastructure decision | "Terraform validate-only, no apply" | 🟢 Medium |

### Step 2 — Write the ADR

Use the format above. For AI-assisted projects, always include:

1. **What NOT to do** — the most important line for an AI assistant
2. **Trigger to revisit** — when should this decision change?
3. **Impact on related files** — which files should NOT be modified

### Step 3 — Add enforcement rules

At the bottom of `docs/decisions.md`, maintain a "Rules for future sessions"
block:

```markdown
## Rules for future development sessions

1. Read this file before writing any code
2. If a prompt contradicts a decision here — flag it, do not build it
3. [Technology X] is not part of this project (ADR-NNN)
4. [Feature Y] is deferred (ADR-NNN) — do not build [specific thing]
5. When in doubt: check what's actually deployed before writing new code
```

---

## How to audit existing code against decisions

When starting a new session on an existing project:

```
1. Read docs/decisions.md
2. Read CLAUDE.md (or equivalent spec file)
3. Flag any contradictions between the two
4. Flag any code in the repo that contradicts a decision
5. Update the ADR if the code reflects a newer decision
6. Update the code if the ADR reflects the correct decision
```

---

## Common ADR patterns for AI-assisted projects

### Pattern 1 — Rejected technology
Use when you evaluated a technology and chose not to use it.
Critical: without this, AI will suggest it again next session.

```markdown
## ADR-NNN — [Technology] not used
**Status:** Final

**Decision:** [Technology] is not part of this project.

**Reason:** [Specific reason — not just "too complex"].
The data source is [X], which means [Technology] solves
problems we don't have: [list].

**Impact:**
- Do NOT add [technology] to docker-compose.yml
- Do NOT add [technology] packages to requirements.txt
- Do NOT write [technology] producer/consumer code
- If a prompt suggests [technology] — flag ADR-NNN and stop

**What we use instead:** [Alternative] because [reason].
```

### Pattern 2 — Deferred feature
Use when you've decided to build something later, not never.
Include what's already built so resuming is easy.

```markdown
## ADR-NNN — [Feature] deferred
**Status:** Deferred

**Decision:** [Feature] is not built yet.

**Reason:** [Specific trigger missing — e.g. "zero users",
"no revenue", "dependency on ADR-NNN not yet resolved"].

**What's already ready:**
- Database schema: [table names]
- Stub endpoint: [route]
- Full spec: [location]

**Trigger to build:** [Specific condition — not "when ready"].
Example: "First real user requests alerts"
Example: "Revenue > €500/month"
Example: "monelu.fr domain is live with real traffic"

**Do NOT build:** [Specific components] until trigger is met.
```

### Pattern 3 — Infrastructure constraint
Use when a technology or service has a specific limitation
that affects how you write code.

```markdown
## ADR-NNN — [Service] requires [specific setup]
**Status:** Permanent constraint

**Decision:** All [connections/calls/configs] to [Service]
must use [specific approach].

**Reason:** [Service] [specific limitation].
[Alternative approach] fails because [specific error].

**Impact on code:**
- [File/config] must use [specific value]
- Never use [wrong approach] — it will [fail with error]
- Local dev uses [different approach] — see .env.example
```

### Pattern 4 — Known limitation (accepted)
Use when you've identified a real problem and consciously
decided not to fix it yet.

```markdown
## ADR-NNN — [Limitation] accepted
**Status:** Known limitation — acceptable for [current phase]

**Decision:** [Specific thing] has [specific problem].
Not fixing it now.

**Reason:** [Why it's acceptable]. Risk is [low/medium] because
[specific justification].

**Real risk:** [What could go wrong].
**Who it affects:** [Scope].

**Proper fix:** [What the right solution would be].
**Fix when:** [Specific trigger].
```

---

## Updating CLAUDE.md to reference decisions

After creating or updating `docs/decisions.md`, update the
project's main spec file to include:

```markdown
## Architecture decisions

All architectural decisions are documented in `docs/decisions.md`.
Read that file before writing any code for this project.
Key decisions: [list 3-5 most critical ones with ADR numbers]
```

---

## Red flags — when to write an ADR immediately

Write an ADR right now if any of these happen:

- An AI session suggested technology X and you said no
- You built something, then decided to remove it
- You changed infrastructure providers mid-project
- A feature is "coming soon" but not built
- You discovered a constraint in an external API or service
- CI or deployment has a workaround that future devs might "fix"
- You made a cost decision (not deploying, not upgrading)

The best time to write an ADR is immediately after the decision.
The second best time is now.

---

## Template — new decisions.md file

Use this as the starting template for a new project:

```markdown
# [Project Name] — Architecture Decision Records

This file documents real architectural decisions made during the build.
Every future development session should read this file first.
If a decision contradicts the original spec, this file takes precedence.

---

## ADR-001 — [First decision]
[Fill in using the format above]

---

## Rules for future development sessions

1. Read this file before writing any code
2. If a prompt contradicts a decision here — flag it, do not build it
3. When in doubt: check what's actually deployed before writing new code
```

---

## Output format

When creating or updating ADRs, always:

1. Use sequential numbering (ADR-001, ADR-002...)
2. Keep status current — update "Final" if a decision changes
3. Add "Superseded by ADR-NNN" when a decision is reversed
4. Never delete old ADRs — mark them superseded
5. Commit after every update: `docs: add ADR-NNN — [short title]`
