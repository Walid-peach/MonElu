---
name: pr-create
description: Creates or updates a pull request using reviewer-friendly best practices. Use when opening a PR, updating an existing PR, or when the user asks to prepare a pull request.
---

When handling a pull request, follow this workflow:

1. Detect whether a PR already exists for the current branch.
   - If no PR exists, prepare to create one.
   - If a PR already exists, update the existing PR instead of creating a new one.
   - Only suggest creating a new PR if the branch purpose changed substantially, the base branch is wrong, or the user explicitly asks for a separate PR.

2. Identify the correct base branch.
   - Prefer the PR base branch if one already exists.
   - Otherwise use the repository default branch or the intended target branch.
   - Do not assume it is always `master`.

3. Review the branch before creating or updating the PR.
   - Run `git diff --stat <base>...HEAD` for a concise summary.
   - Run `git diff <base>...HEAD` to inspect the full change set.
   - Review recent commits if needed to better understand intent and scope.

4. Validate branch quality before proceeding.
   - Check that the branch has one coherent purpose.
   - Flag unrelated changes, debug code, temporary comments, generated noise, or accidental edits.
   - Confirm whether tests, documentation, configuration, migrations, or changelog updates are needed.
   - If the branch is too broad or mixed, recommend splitting it before creating or heavily revising the PR.

5. Prepare a strong PR title.
   - Use a clear, specific, action-oriented title.
   - Prefer the format:
     - `<area>: <change>`
   - Examples:
     - `airflow: add retry handling for trustpair ingestion`
     - `dbt: standardize casting in cognos employee details model`
   - Avoid vague titles like `updates`, `fixes`, or `changes`.

6. Prepare the PR description in `notes/pr_<sanitized-branch-name>.md`
   - Replace `/` with `_`
   - Use lowercase
   - Keep the name concise and filesystem-safe

7. Use this PR description structure:

## What
One or two sentences describing what this PR changes.

## Why
Explain the problem, context, or reason the change is needed.

## Changes
- Group related changes together
- Summarize meaningful implementation changes
- Mention deleted, renamed, or moved files when relevant
- Focus on reviewer-relevant changes, not raw diff noise

## Testing
- List automated tests run
- List manual validation steps
- If not tested, say so explicitly

## Risks / Notes
- Mention rollout concerns, edge cases, follow-ups, or reviewer attention points

## Breaking Changes
- State `None` if there are no breaking changes
- Otherwise explain the impact clearly

8. If a PR already exists:
   - Read the existing PR title and description first
   - Compare them against the current diff
   - Update only the parts that are no longer accurate or are missing
   - Preserve useful reviewer context that is still valid
   - Do not rewrite a good PR description unnecessarily

9. Check whether documentation should be updated.
   - Update `README.md` only if setup, usage, configuration, examples, or user-facing behavior changed
   - Update `CLAUDE.md` only if repo instructions, workflow rules, or agent guidance changed
   - Do not update documentation unless the code changes justify it

10. Apply a reviewer-first quality bar.
   - Make the PR easy to review quickly
   - Highlight the main purpose, important changes, testing, and risks
   - Keep the title and description concise, accurate, and easy to scan

11. Do not guess silently when context is missing.
   - State what is unknown
   - Ask for confirmation only when necessary
   - Otherwise use the branch diff and repository context to produce the strongest possible draft

12. Final deliverables:
   - A proposed or updated PR title
   - A PR description saved in `notes/pr_<sanitized-branch-name>.md`
   - A short reviewer summary explaining what to review first
