---
name: pr-description
description: Writes pull request descriptions. Use when creating a PR, writing a PR, or when the user asks to summarize changes for a pull request.
---

When writing a PR description:

1. Run `git diff master...HEAD` to see all changes on this branch
2. Update the README.md file to include the changes also the CLAUDE.md file if needed.
3. Write a description following this format in the notes folder and use pr_nameofbranch.md as aname of file:

## What
One sentence explaining what this PR does.

## Why
Brief context on why this change is needed

## Changes
- Bullet points of specific changes made
- Group related changes together
- Mention any files deleted or renamed
