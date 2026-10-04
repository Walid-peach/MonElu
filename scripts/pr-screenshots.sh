#!/usr/bin/env bash
# Publishes a pull request's screenshots and prints the Markdown that shows
# them inline in the PR description (#477).
#
#   scripts/pr-screenshots.sh <pr-number> <image>...
#
# GitHub's CLI cannot attach an image to a PR, so the images go to the
# `pr-screenshots` branch of this repository: an orphan branch that holds
# only images, one folder per PR, and is never merged. Each run adds one
# commit on top of that branch, written with plumbing (no checkout, no
# working tree touched), and the printed links pin that commit, so a later
# run can never change what an older PR shows.
#
# An image is stored as `<pr>/<parent folder>-<file name>`, so the light and
# dark captures of two Maestro flows (`ios/build/screenshots/home/light-1.png`
# and `.../tabs/light-1.png`) keep distinct names.
#
# PR_SCREENSHOTS_REMOTE (default `origin`) and PR_SCREENSHOTS_REPO (default:
# read from that remote's URL) exist for the test in
# tests/unit/test_pr_screenshots.py.
set -euo pipefail

branch="pr-screenshots"
remote="${PR_SCREENSHOTS_REMOTE:-origin}"

usage() {
  echo "usage: $0 <pr-number> <image>..." >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
pr="$1"
shift
[[ "$pr" =~ ^[0-9]+$ ]] || { echo "error: the PR number must be digits, got '$pr'" >&2; exit 2; }

for image in "$@"; do
  [[ -f "$image" ]] || { echo "error: no such file: $image" >&2; exit 1; }
  case "$image" in
    *.png | *.jpg | *.jpeg | *.gif | *.webp) ;;
    *) echo "error: not an image: $image" >&2; exit 1 ;;
  esac
done

# owner/name, from an https or ssh remote URL.
repo="${PR_SCREENSHOTS_REPO:-}"
if [[ -z "$repo" ]]; then
  url="$(git remote get-url "$remote")"
  repo="$(sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##' <<<"$url")"
fi

stored_name() {
  local image="$1"
  echo "$(basename "$(dirname "$image")")-$(basename "$image")"
}

# Names must not collide inside one run.
names="$(for image in "$@"; do stored_name "$image"; done | sort)"
duplicates="$(uniq -d <<<"$names")"
[[ -z "$duplicates" ]] || { echo "error: two images would share a name: $duplicates" >&2; exit 1; }

index="$(mktemp)"
trap 'rm -f "$index"' EXIT

# A rejected push means someone else published in between: rebuild on the
# new tip and try again.
for attempt in 1 2 3; do
  parent=""
  if git ls-remote --exit-code --heads "$remote" "$branch" >/dev/null 2>&1; then
    git fetch --quiet "$remote" "refs/heads/$branch"
    parent="$(git rev-parse FETCH_HEAD)"
  fi

  rm -f "$index"
  if [[ -n "$parent" ]]; then
    GIT_INDEX_FILE="$index" git read-tree "$parent"
  else
    GIT_INDEX_FILE="$index" git read-tree --empty
  fi
  for image in "$@"; do
    blob="$(git hash-object -w "$image")"
    GIT_INDEX_FILE="$index" git update-index --add --cacheinfo "100644,$blob,$pr/$(stored_name "$image")"
  done
  tree="$(GIT_INDEX_FILE="$index" git write-tree)"

  message="Screenshots for #$pr"
  if [[ -n "$parent" ]]; then
    commit="$(git commit-tree "$tree" -p "$parent" -m "$message")"
  else
    commit="$(git commit-tree "$tree" -m "$message")"
  fi

  if git push --quiet "$remote" "$commit:refs/heads/$branch" 2>/dev/null; then
    for image in "$@"; do
      name="$(stored_name "$image")"
      echo "![${name%.*}](https://raw.githubusercontent.com/$repo/$commit/$pr/$name)"
    done
    exit 0
  fi
  echo "push to $branch was rejected (attempt $attempt), retrying on the new tip" >&2
done

echo "error: could not publish to $branch after 3 attempts" >&2
exit 1
