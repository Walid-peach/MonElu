---
name: pr-review
description: Reviews a branch or pull request like a careful reviewer before or during code review. Use when the user asks for a PR review, review readiness check, or wants feedback before merging.
---

When reviewing a pull request or branch, follow this workflow:

1. Identify the review target.
   - Prefer the existing PR if one exists.
   - Otherwise review the current branch against the intended base branch.
   - Do not assume the base branch is always `master`; use the PR base branch or repository default branch when available.

2. Review the actual change set.
   - Run `git diff --stat <base>...HEAD` for a high-level summary.
   - Run `git diff <base>...HEAD` for the full changes.
   - Review recent commits if they help explain the change history or intent.

3. Understand the purpose of the change before judging details.
   - Infer the main objective of the PR.
   - Identify whether the implementation matches the stated or implied goal.
   - If the scope is unclear, say so explicitly.

4. Review with a reviewer-first lens.
   Evaluate the PR for:

   - Correctness
     - Does the implementation appear to solve the intended problem?
     - Are there obvious logic errors, broken assumptions, or incomplete paths?

   - Scope
     - Is the PR focused on one coherent purpose?
     - Are there unrelated changes mixed in?

   - Readability
     - Is the code understandable and reasonably structured?
     - Are naming, comments, and organization clear?

   - Maintainability
     - Does the change introduce avoidable complexity?
     - Are there duplicated patterns, hardcoded values, or brittle logic?

   - Safety
     - Are there migration, deployment, rollback, data, or config risks?
     - Are there edge cases that could fail in production?

   - Testing
     - Are tests present where needed?
     - Are manual validation steps or automated checks sufficient?
     - Call out missing tests clearly.

   - Documentation
     - Should `README.md`, internal docs, runbooks, or `CLAUDE.md` be updated?
     - Do not require docs changes unless the code changes justify them.

5. Distinguish issue severity.
   Categorize findings as:

   - Must fix
     - Likely bug, broken behavior, unsafe change, or serious gap before merge

   - Should fix
     - Important quality, maintainability, or clarity issue that should ideally be addressed before merge

   - Nice to have
     - Non-blocking suggestion, cleanup, or polish

6. Be precise and evidence-based.
   - Reference concrete files, patterns, or behaviors when possible.
   - Do not make vague comments like "this looks bad" or "maybe improve this".
   - Explain why something is risky, confusing, or incorrect.

7. Avoid low-value review noise.
   - Do not comment on purely stylistic preferences unless they affect readability or conflict with project conventions.
   - Do not restate what the code already says without adding insight.
   - Focus on the highest-signal review feedback first.

8. Flag review readiness.
   Conclude with one of:
   - Ready to merge
   - Ready with minor changes
   - Needs changes before merge
   - Scope should be reduced or split

9. Compute an attention score.
   Follow the rule table in `docs/pr-attention-score.md` exactly — it is a deterministic formula, not a separate judgment call:
   - Start at 100 and apply every penalty that matches (Must Fix / Should Fix counts, verdict, high-risk paths touched, diff size, missing tests, non-empty Testing/Validation Gaps, anything you could not verify).
   - Clamp to `[0, 100]`.
   - Score >= 70 → `SAFE TO SKIM`. Score < 70 → `NEEDS YOUR ATTENTION`.
   - Show the arithmetic line by line so the number is auditable, and write one sentence explaining why the PR can be skimmed or needs a closer look.

10. Produce the review in this format:

## Attention Score
**<score>/100 - <SAFE TO SKIM | NEEDS YOUR ATTENTION>**
- Base 100
- <penalty line per signal that applied>
Reason: <one sentence>

## Summary
Two to four sentences summarizing what the PR does and the overall review outcome.

## Must Fix
- Blocking issues that should be resolved before merge
- State `None` if there are no blocking issues

## Should Fix
- Important non-blocking improvements
- State `None` if there are no important improvements

## Nice to Have
- Optional improvements or follow-ups
- State `None` if there are no optional suggestions

## Testing / Validation Gaps
- Missing or weak validation
- State `None` if validation looks sufficient

## Documentation / Reviewer Notes
- Needed docs changes, rollout notes, or areas reviewers should pay attention to
- State `None` if nothing special is needed

## Verdict
One of:
- Ready to merge
- Ready with minor changes
- Needs changes before merge
- Scope should be reduced or split

11. If an existing PR description is available, compare it against the diff.
   - Check whether the PR description accurately reflects the implementation.
   - Call out mismatches between the description and the actual changes.
   - Note when the PR title or description should be updated.

12. If the branch is messy or mixed:
   - Explicitly recommend splitting unrelated work
   - Call out accidental edits, debug code, commented-out code, temporary files, or generated noise

13. Final behavior:
   - Review the PR
   - Generate the structured review comment, with the Attention Score section first
   - Post that review comment directly on the pull request using the `mcp__github__pull_request_review_write` tool with `method: create` and `event: COMMENT`. If the MCP tool is unavailable, fall back to `gh pr review <number> --comment -b '<review>'`.
   - Apply exactly one label to the PR via `gh pr edit <number> --add-label <label>`: `needs-attention` if score < 70, `safe-to-skim` if score >= 70. Remove the other of the two labels if it is present from a prior review pass (`gh pr edit <number> --remove-label <other-label>`).
