---
name: pr-description
description: Writes high-quality pull request descriptions. Use when creating a PR, summarizing branch changes, or when the user asks for a PR description.
---

This skill writes the PR description body only. For the full PR creation workflow (opening, updating, saving to `notes/prs/`), use the `pr-create` skill instead.

When writing a PR description:

1. Identify the correct base branch before diffing.
   - Prefer the PR base branch if known.
   - Otherwise use the repository default branch.
   - Do not assume it is always `master`.

2. Review the change set before writing.
   - Run `git diff <base>...HEAD` to inspect all branch changes.
   - Run `git diff --stat <base>...HEAD` for a concise summary.
   - Review commit messages if helpful to understand intent.

3. Check whether documentation needs updating.
   - Update `README.md` only if user-facing behavior, setup, usage, configuration, or examples changed.
   - Update `CLAUDE.md` only if workflow instructions, repo conventions, or agent guidance changed.
   - Do not modify documentation unless the changes actually require it.

4. Use this structure:

## What
One or two sentences explaining what this PR changes.

## Why
Brief context on the problem, goal, or motivation behind the change.

## Changes
- Summarize the important code, config, test, and documentation changes
- Group related changes together
- Mention deleted, renamed, or restructured files when relevant
- Focus on meaningful changes, not every small diff detail

## Testing
- List how the change was validated
- Mention tests added/updated, manual checks, or why no testing was needed

## Screenshots
- Required when the PR adds or changes anything a user sees: a screen, component, layout, copy, color or interaction, in `frontend/` or `ios/`.
  Omit the section only when nothing visible changed.
- Show each changed state in light and dark mode, and before/after when the change alters an existing screen.
- iOS: run the flow that reaches the change with the `ios-run` skill (`make ios-flow FLOW=<flow>`), which saves both appearances under `ios/build/screenshots/<flow>/`.
- Web: capture the changed route at 390px and 1280px, light and dark, against `next dev` or the Vercel preview, e.g. from `frontend/`: `npx playwright screenshot --viewport-size=390,844 --color-scheme=dark <url> <file>.png`.
- Publish them with `scripts/pr-screenshots.sh <pr-number> <image>...` and paste the Markdown it prints, so the images show inline.
  It pushes to the orphan `pr-screenshots` branch and pins each link to that commit; never commit screenshots to the PR branch.
  A new PR needs its number first: create it, publish, then edit the description.
- Label each image with the flow or route, the appearance and the state (a small table reads well), so a reviewer can check them without running anything.

## Risks / Notes
- Mention edge cases, rollout concerns, follow-ups, or anything reviewers should pay attention to

## Breaking Changes
- State `None` if there are no breaking changes
- Otherwise describe the impact clearly

5. Keep the description concise but useful.
   - Prefer clarity over exhaustiveness
   - Avoid repeating raw diff output
   - Write for reviewers, not for the author

6. If the branch changes are unclear or mixed, first infer the main objective of the PR and organize the description around that objective.
