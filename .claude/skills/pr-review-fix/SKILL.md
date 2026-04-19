---
name: pr-review-fix
description: Applies fixes to a pull request based on an existing PR review comment. Use when the user asks to address PR review feedback, fix a PR from review comments, or update a branch based on PR feedback.
---

When fixing a pull request from review feedback, follow this workflow:

1. Start from the actual PR review comment.
   - Read the PR comment carefully before making any changes.
   - Extract only the explicitly requested fixes.
   - If there is no review comment, or no clear fix request is available, stop and say that you need the PR comment or a clear list of what to fix.

2. Only act on these categories by default:
   - Must Fix
   - Should Fix

3. Must Fix items are mandatory.
   - Always address all explicit Must Fix items.
   - Do not skip them unless the user explicitly tells you not to, or the request is impossible or incorrect.
   - If a Must Fix item cannot be implemented safely, explain why clearly.

4. Should Fix items should also be addressed.
   - Apply explicit Should Fix items as part of the update.
   - Treat them as in scope unless the user says otherwise.

5. Nice to Have items are out of scope by default.
   - Do not implement Nice to Have suggestions unless the user explicitly asks for them in the prompt.
   - Do not silently include optional cleanup, refactors, or polish work just because it seems beneficial.

6. Do not invent extra work.
   - Do not add unrelated refactors.
   - Do not make opportunistic cleanup changes.
   - Do not broaden the PR scope beyond the review feedback.
   - Keep the branch focused on the requested review fixes.

7. Review the relevant code before editing.
   - Understand the intent of the original PR.
   - Inspect only the files needed to implement the requested fixes.
   - Preserve the PR’s purpose and avoid changing behavior outside the requested scope.

8. Apply the fixes carefully.
   - Make the smallest useful changes that fully resolve the requested feedback.
   - Prefer targeted edits over broad rewrites.
   - Maintain consistency with the repository’s existing patterns and conventions.

9. Validate the fixes.
   - Run relevant tests, checks, or validation steps when possible.
   - If no validation is possible, say so explicitly.
   - If a fix changes behavior, verify that the requested issue is actually resolved.

10. Check whether the PR description or docs need updating.
   - Update the PR description only if the implemented fixes materially change the current PR summary.
   - Update documentation only if the requested fixes affect setup, usage, configuration, workflow, or documented behavior.
   - Do not update docs for unrelated reasons.

11. Summarize the applied fixes in this format:

## Fixed
- List all Must Fix items that were addressed
- List all Should Fix items that were addressed

## Not Fixed
- List any requested item that could not be implemented
- Explain why clearly
- Write `None` if everything in scope was addressed

## Validation
- List tests, checks, or manual validation performed
- If none, state that explicitly

## Notes
- Mention whether the PR description or docs were updated
- Mention any follow-up the reviewer or author should know
- Write `None` if there is nothing extra to note

12. If there is no clear review feedback to act on, respond with:
   - a concise statement that you need the PR review comment or a clear list of fixes before making changes

13. Final behavior:
   - Read the review comment
   - Fix all explicit Must Fix items
   - Fix all explicit Should Fix items
   - Ignore Nice to Have items unless explicitly requested in the prompt
   - Keep the changes narrow, relevant, and review-driven
