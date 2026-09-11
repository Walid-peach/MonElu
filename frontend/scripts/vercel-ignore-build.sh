#!/usr/bin/env bash
# Vercel Ignored Build Step (#356), wired in via `ignoreCommand` in vercel.json.
#
# Vercel runs this from the project's Root Directory (`frontend/`) and reads the
# exit code: 0 skips the deployment, anything else builds it.
#
# Policy: build only when something under `frontend/` changed. The frontend
# imports nothing from outside this directory - the data it mirrors from the
# backend (departments, groups) lives in its own copies under `src/lib/` - so a
# commit confined to api/, scripts/, transform/, rag/, docs/ or .github/ cannot
# change what Vercel would ship.
#
# Every uncertain case builds: an ignore step that wrongly skips leaves a stale
# production site, one that wrongly builds only costs a build.

set -u

# The repository's default branch, which Vercel deploys to production.
production_branch="master"

# Preferred base: the last successful deployment of this branch. It covers
# every commit since that deploy, including ones whose own builds were skipped
# or failed. Vercel leaves it unset on a branch's first push, and a shallow
# clone may not contain it.
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$base" ] && git cat-file -e "${base}^{commit}" 2>/dev/null; then
  :
elif [ "${VERCEL_ENV:-}" = "production" ]; then
  # A push to the production branch: HEAD^ is its previous tip, and a merge
  # commit's first parent covers the whole merged PR.
  base="HEAD^"
else
  # A preview with no deployed base. HEAD^ would judge the branch on its tip
  # commit alone, so compare the whole branch against where it forked from the
  # production branch instead.
  # Vercel's checkout cannot be relied on to carry an `origin` remote, so fetch
  # from the repository URL its system variables describe. The repository is
  # public, so no credentials are needed. Local runs fall back to `origin`.
  if [ -n "${VERCEL_GIT_REPO_OWNER:-}" ] && [ -n "${VERCEL_GIT_REPO_SLUG:-}" ]; then
    remote="https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}.git"
  else
    remote="origin"
  fi
  # Deepen only a clone that is already shallow: `--depth` on a full clone would
  # make it shallow. Cap the fetch so a slow network cannot stall the deploy.
  depth_arg=""
  if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
    depth_arg="--depth=100"
  fi
  timeout_cmd=""
  if command -v timeout >/dev/null 2>&1; then
    timeout_cmd="timeout 60"
  fi
  base=""
  # shellcheck disable=SC2086 # the optional words must split
  if fetch_error="$(GIT_TERMINAL_PROMPT=0 $timeout_cmd git fetch --quiet $depth_arg "$remote" "$production_branch" 2>&1)"; then
    base="$(git merge-base HEAD FETCH_HEAD 2>/dev/null)" || base=""
  else
    echo "vercel-ignore-build: could not fetch ${production_branch} from ${remote}: ${fetch_error}"
  fi
  if [ -z "$base" ]; then
    echo "vercel-ignore-build: no merge base with ${production_branch} - building."
    exit 1
  fi
fi

if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null; then
  echo "vercel-ignore-build: no base commit to compare against - building."
  exit 1
fi

git diff --quiet "$base" HEAD -- .
status=$?

if [ "$status" -eq 0 ]; then
  echo "vercel-ignore-build: no changes under frontend/ since ${base} - skipping."
  exit 0
fi
if [ "$status" -eq 1 ]; then
  echo "vercel-ignore-build: frontend/ changed since ${base} - building."
  exit 1
fi
echo "vercel-ignore-build: git diff failed (exit ${status}) - building."
exit 1
