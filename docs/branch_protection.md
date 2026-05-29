# Branch Protection Setup

CI runs automatically on every pull request, but GitHub will not *enforce* that
checks pass until a branch protection rule is configured. Branch protection lives
in the GitHub UI (not in code), so it must be set up manually once.

Configure on GitHub: **Settings → Branches → Add branch ruleset** (or **Add rule**)
for the `master` branch.

## Required settings

- **Require a pull request before merging**
- **Require status checks to pass before merging**, selecting both CI jobs:
  - `lint-and-test`
  - `dbt-test`
- **Require branches to be up to date before merging**
- **Do not allow bypassing the above settings**

> Note: the status checks `lint-and-test` and `dbt-test` only appear in the
> selector after they have run at least once. Open a PR first so the jobs
> register, then add them to the required checks list.

## Result

Once enabled, every change to `master` must go through a PR whose CI is green:
ruff lint + unit tests (`lint-and-test`) and dbt compile + dbt test against prod
(`dbt-test`). A failing dbt test blocks the merge, and the results are posted as
a comment on the PR.
