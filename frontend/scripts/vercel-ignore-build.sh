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
  base=""
  if git fetch --quiet --depth=100 origin "$production_branch" 2>/dev/null; then
    base="$(git merge-base HEAD FETCH_HEAD 2>/dev/null)" || base=""
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
