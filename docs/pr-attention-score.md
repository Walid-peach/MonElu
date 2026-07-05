# PR Attention Score

A deterministic, auditable score computed by the `pr-review` agent/skill on every reviewed PR.
It answers one question: does this PR need the maintainer's own eyes, or is the agent review sufficient on its own?

The score is a rule-based formula, not a separate LLM judgment.
The agent supplies the inputs (findings, verdict, files touched, diff size); the formula decides the output.
This keeps the number auditable — the arithmetic can be checked line by line — instead of being a second vibe-based opinion.

## Formula

Start at 100. Subtract:

| Signal | Penalty |
|---|---|
| Each Must Fix finding | -30 |
| Each Should Fix finding | -10 |
| Verdict is "Needs changes before merge" or "Scope should be reduced or split" | -25 |
| Touches a high-risk path (see below), per category touched | -15 |
| Diff is large: > 400 changed lines or > 15 files | -10 |
| New code with no test changes (`tests/` untouched while `api/`, `rag/`, or `scripts/` changed) | -10 |
| Testing / Validation Gaps section is non-empty | -10 |
| Agent could not verify something (couldn't run code, unclear intent, external dependency) | -15 |

Clamp the result to `[0, 100]`.

### High-risk paths

Each of these counts as its own category (a PR touching two of them takes the penalty twice):

- `data/migrations/`
- `.github/workflows/`
- `scripts/migrate.py`
- `railway.json`
- `api/main.py` (CORS / rate-limit config)
- `requirements*.txt`

## Threshold

- **Score >= 70** → `SAFE TO SKIM`
- **Score < 70** → `NEEDS YOUR ATTENTION`

## Output format

Post this as the *first* section of the review comment, before the Summary, since GitHub truncates long comments in list views:

```markdown
## Attention Score
**72/100 - SAFE TO SKIM**
- Base 100
- -10: 1 Should Fix finding
- -15: touches .github/workflows/
- -3: (rounding / other minor signal, if applicable)
Reason you can skim: findings are cosmetic, no prod-config or migration surface, CI green.
```

Always include the one-sentence "Reason you can [skim / take a closer look]" — that sentence is the part meant to be read at a glance without opening the PR.

After posting the review, apply exactly one label via `gh pr edit --add-label`:

- `needs-attention` — score < 70
- `safe-to-skim` — score >= 70

Remove whichever of the two labels is not the current one if it was left over from a prior review pass on the same PR.

## Calibration

This table is a starting point, not gospel.
If a `SAFE TO SKIM` PR turns out to need a fix post-merge, find which penalty was missing or too small and adjust the table — but keep the structure: deterministic formula, auditable arithmetic, hard floor for high-risk paths.
