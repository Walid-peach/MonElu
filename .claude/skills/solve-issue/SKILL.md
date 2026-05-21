---
name: solve-issue
description: Resolves a GitHub issue end-to-end: reads the issue, creates a branch, implements the fix, commits, creates a PR, reviews the PR, and applies any review fixes. Use when the user asks to solve, fix, or close a GitHub issue by number.
---

When solving a GitHub issue, follow this workflow exactly, in order.

ARGUMENTS: the issue number(s) to solve. Multiple numbers mean they belong in the same branch/PR.

---

## Step 1 — Read the issue(s)

- Fetch each issue with `gh issue view <number>` to get the full body, labels, and context.
- If multiple issues are given, read all of them before doing anything else.
- Understand the stated problem, the proposed fix (if any), and the affected files.
- If the issue body references a specific file and line number, read that file before proceeding.

---

## Step 2 — Identify the branch

- Check whether a branch already exists for these issues: `git branch -a | grep <issue-number>`.
- If a matching branch exists, check it out and continue from there.
- If no branch exists, create one from `master` (or the repo default branch).
- Branch naming convention:
  - `fix/<short-description>` for bugs and security issues
  - `perf/<short-description>` for performance issues
  - `refactor/<short-description>` for refactors
  - `chore/<short-description>` for maintenance and cleanup
  - `test/<short-description>` for test-only changes
- Keep branch names lowercase, hyphen-separated, under 50 characters.
- Include the issue number(s) only if the description would otherwise be ambiguous.

---

## Step 3 — Read relevant code before editing

- Never edit a file you have not read in this session.
- Use `Read` on every file you plan to modify.
- If the issue references a function or line number, verify it still matches before acting.
- If the code has changed since the issue was filed (already fixed, refactored away), report that and stop — do not make unnecessary changes.

---

## Step 4 — Implement the fix

- Apply the smallest change that fully resolves the issue.
- Follow the fix approach described in the issue body when one is given.
- Do not refactor code unrelated to the issue.
- Do not add features, error handling, or abstractions beyond what the issue requires.
- Do not add comments unless the WHY is non-obvious and would genuinely help a future reader.
- After editing, verify the changed files with `git diff` to confirm the output matches intent.

---

## Step 5 — Commit

- Stage only the files changed for this issue.
- Run pre-commit hooks (they run automatically on `git commit`); if a hook fails, fix the issue and re-stage.
- Write a concise commit message:
  - Format: `<type>: <what changed and why in one line>`
  - Types: `fix`, `perf`, `refactor`, `chore`, `test`
  - Reference the issue: append `(closes #<number>)` at the end of the subject line when the commit fully resolves it.
  - No bullet lists in the subject; use the body only for non-obvious context.
- Always append the co-author trailer:
  ```
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```

---

## Step 6 — Create a PR

- Push the branch: `git push -u origin <branch>`.
- Use the `pr-create` skill to generate and open the PR.
- The PR description must:
  - State what changed and why (not just what the issue says).
  - List any deployment, migration, or config risks.
  - Reference the issue with `Closes #<number>` so GitHub auto-closes it on merge.

---

## Step 7 — Review the PR

- Use the `pr-review` skill immediately after creating the PR.
- Post the review as a comment on the PR using `mcp__github__pull_request_review_write`.

---

## Step 8 — Apply review fixes

- Read the review output.
- Apply all **Must Fix** and **Should Fix** items.
- Do not implement **Nice to Have** items unless the user asks.
- Commit the fixes with a message like `fix: address PR review feedback`.
- Push the updated branch.

---

## Step 9 — Report to the user

At the end, output a short summary in this format:

```
## Solved: #<number> — <issue title>

**Branch**: <branch-name>
**PR**: <url>
**Changes**: <one sentence describing what was changed>
**Review status**: Ready to merge / Ready with minor changes / (any open items)
```

---

## Guard rails

- If a fix requires a DB migration, call it out explicitly and confirm with the user before applying.
- If the fix has a deployment risk (env var change, CORS, auth), note it in the PR and pause for confirmation.
- If the issue is already resolved in the current codebase, close it with `gh issue close <number> --comment "Already resolved: <brief explanation>"` and stop.
- Never commit to `master` directly.
- Never skip pre-commit hooks (`--no-verify`).
