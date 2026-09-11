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

# The last successful deployment of this branch. It covers every commit since
# that deploy, including ones whose own builds were skipped or failed. Vercel
# only sets it when an ignore step is configured, and a shallow clone may not
# contain it, so fall back to the parent commit.
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  base="HEAD^"
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
