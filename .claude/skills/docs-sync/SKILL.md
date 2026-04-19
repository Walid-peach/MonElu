---
name: docs-sync
description: Checks whether code changes require documentation updates and applies only the necessary documentation changes. Use when preparing a PR, reviewing branch readiness, or verifying that docs stay aligned with implementation.
---

When syncing documentation with code changes, follow this workflow:

1. Identify the scope of the change.
   - Determine the correct base branch.
   - Do not assume it is always `master`; use the PR base branch or repository default branch when available.
   - Review the change set with:
     - `git diff --stat <base>...HEAD`
     - `git diff <base>...HEAD`

2. Determine whether documentation changes are actually needed.
   Update documentation only if the code changes affect one or more of these:

   - Setup or installation steps
   - Usage instructions
   - Configuration or environment variables
   - Inputs, outputs, or interfaces
   - Examples or commands
   - Architecture or workflow behavior
   - Operational runbooks or troubleshooting steps
   - Team or agent instructions
   - Constraints, assumptions, or supported paths

3. Do not force documentation changes when they are not justified.
   Documentation updates are usually not needed for:
   - Internal refactors with unchanged behavior
   - Naming cleanup with no user or developer impact
   - Pure formatting or linting changes
   - Tests-only changes, unless they change how contributors should work
   - Non-meaningful code movement with no workflow impact

4. Check the right documentation targets.
   Review and update only the files that match the change:

   - `README.md`
     - For setup, usage, configuration, examples, commands, and user-facing behavior

   - `CLAUDE.md`
     - For repository instructions, coding workflow, agent behavior, team conventions, or execution rules

   - Other docs, runbooks, or notes
     - For architecture, operations, troubleshooting, deployment, migrations, or project-specific guidance

5. Prefer minimal, accurate updates.
   - Do not rewrite entire documentation sections if a focused edit is enough.
   - Preserve the current tone and structure of the document.
   - Keep examples, commands, and paths accurate and copy-paste safe.
   - Remove outdated instructions when replacing them with new ones.

6. Cross-check code against docs, not just docs against code.
   Look for:
   - Commands that no longer match reality
   - Missing new flags, parameters, files, or steps
   - Old file names, paths, or branch names
   - Docs describing behavior that changed
   - Missing caveats, rollout notes, or operational warnings

7. If no documentation changes are needed, say so explicitly.
   Do not invent documentation edits just to satisfy the workflow.

8. If documentation changes are needed, produce a clear summary in this format:

## Documentation Impact
One to three sentences explaining whether docs needed updating and why.

## Files to Update
- List the documentation files that should change
- State `None` if no documentation changes are needed

## Required Updates
- Summarize the exact documentation changes needed
- Keep this reviewer-focused and actionable

## Notes
- Mention anything reviewers or maintainers should verify
- State `None` if there are no extra notes

9. If editing documentation directly:
   - Make the smallest useful change that keeps docs aligned with implementation
   - Ensure examples and instructions reflect the current code
   - Avoid speculative wording
   - Keep documentation concise and easy to scan

10. Special rules for `README.md`
   Update `README.md` only when the branch changes:
   - project setup
   - installation
   - usage
   - configuration
   - common commands
   - examples
   - behavior visible to users or contributors

11. Special rules for `CLAUDE.md`
   Update `CLAUDE.md` only when the branch changes:
   - repository workflow
   - coding or review conventions
   - project-specific agent instructions
   - required execution steps
   - documentation or delivery expectations

12. Final output should always make one of these outcomes clear:
   - No documentation changes needed
   - Documentation updates recommended
   - Documentation updates required before merge
