---
name: delete-comment
description: Clears the code comments from one area of MonÉlu under ADR-050 - lists every comment, classifies each as tautology, stale, excuse or decision record, deletes them, files a GitHub issue per excuse, moves decision records into docs/decisions.md, and lowers comment-baseline.json. Use as /delete-comment <path> (e.g. /delete-comment rag/) or /delete-comment next for the area with the most comments left.
---

Clear every comment from one area of the codebase, the way ADR-050 says, and tighten the ratchet so they cannot come back.

ARGUMENTS: a path prefix (`rag/`, `scripts/`, `frontend/src/lib/`, `ios/Packages/MonEluCore/`), or `next`.

## Rules

- Read ADR-050 and ADR-051 in `docs/decisions.md` first: they define what a comment is, the four kinds, and the shape of a recovered decision record.
- `scripts/comments.py` is the only definition of a comment.
  Directives (`noqa`, `pragma: allowlist secret`, `eslint-disable`, `@ts-expect-error`, `swiftlint:`, dbt `depends_on:`, shebangs) are not comments and stay.
  Docstrings are not comments and stay; never move a comment into a docstring just to keep it.
- JavaScript and TypeScript need `npm ci` in `frontend/` before any command below reads them.
- One area per run, sized so the classification can be read in full: about 600 comment lines at most.
  When `next` names an area larger than that, take its largest sub-directory instead.
- Never raise an allowance in `comment-baseline.json`; `update` refuses to anyway.
- Never use the em dash; write one sentence per line in Markdown.

## Step 1 - Pick and list the area

For `next`, run `python3 scripts/comments.py stats` and take the area with the most own-line comments that fits the size rule.
Then run `python3 scripts/comments.py list <area>` and read every comment with the code below it.

## Step 2 - Classify every comment

Give each comment block exactly one kind:

- **Tautology**: says what the next line already says (section banners, `# CORS` above the CORS block, `# Guadeloupe` beside a code a table already names).
- **Stale**: describes code, numbers or behaviour that are no longer true (check the claim against the code and the data before deciding).
- **Excuse**: explains why a hack is acceptable instead of fixing it - "keep in sync with" with no test, a silent fallback, "acceptable tradeoff at current volume", a duplicated constant that "mirrors" another, a workaround repeated across files.
- **Decision record**: a non-obvious reason the code cannot show - a measured constant, a rejected alternative, a security or privacy constraint, an upstream quirk.

A decision record that is already stated in an ADR, in `CLAUDE.md` or by a test is a duplicate: treat it as stale.
A comment that describes an API field for its consumers is a decision record whose home is that field's `Field(description=...)`, which reaches `/openapi.json`; rerun `python scripts/export_openapi.py` after adding one.

Write the classification to the scratchpad as a table (file, line range, kind, one-line reason) before changing anything, and show the user the counts per kind.

## Step 3 - File one issue per excuse

Dedupe first: `gh issue list --repo Walid-peach/MonElu --state all --search "<keywords>"`.
Follow [the backlog conventions](../solve-issue/references/github-issues.md) for labels (`technical-debt`, the area label, `status: backlog`).
Each body says it was found by the comment audit (ADR-050), what the comment excused, and carries Scope and Acceptance criteria that remove the hack rather than re-document it.
Verify each claim in the code before filing; an excuse that turns out to be justified is a decision record.

## Step 4 - Move the decision records

Add each decision record to the ADR that owns its area as a bullet naming the symbol it governs, so a grep for the symbol lands on it.
When the area has no owning ADR, add a section for the module to an implementation-notes ADR in the style of ADR-051 (append to ADR-051 for `api/`, or create the next numbered ADR for another area).
Reference the issue number where an entry touches an excuse.

## Step 5 - Delete and tighten

1. `python3 scripts/comments.py strip <area>` deletes every comment under the area: own-line comments lose their line, trailing comments are cut from the code.
2. Format what changed: `ruff format` for Python; TypeScript must still pass `npm run lint` and `npx tsc --noEmit`.
3. Read `git diff` for the area: no line may change except comment removal, and no empty block, dangling `else` or broken JSX may remain.
4. `python3 scripts/comments.py update` lowers the baseline; `python3 scripts/comments.py check` must then pass.
5. Run the area's tests (`pytest tests -m "not integration and not live"`, `npm test`, `make ios-test`) and the linters.

## Step 6 - Report

Tell the user the comment lines removed per kind, the issues filed, the ADR entries added, and how many comment lines the baseline still allows (`python3 scripts/comments.py stats`).
Commit only when the user asks, and open the PR with the `pr-create` skill.
