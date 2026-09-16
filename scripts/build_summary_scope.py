"""Print the cache-invalidation scope for a summary-only run (GH #353).

``summarize_backfill.yml`` retries vote summaries that failed earlier. It writes
nothing but ``summary_plain`` / ``theme``, so it must purge the frontend's
summary-dependent caches and nothing else - in particular not the ``votes``
family, which carries the ``health`` tag that the root layout's freshness badge
reads and would therefore purge every page on the site.

Usage::

    python3 scripts/build_summary_scope.py /tmp/summarized_vote_ids.txt

Prints the JSON body to POST, or nothing when the file is missing or empty. An
empty body is what ``/api/revalidate`` reads as the full conservative purge, so
the caller is never left silently under-purging.
"""

import sys

try:
    from scripts._cache_scope import CacheScope, read_changed_ids
except ImportError:  # running as a plain file: python scripts/build_summary_scope.py
    from _cache_scope import CacheScope, read_changed_ids


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: build_summary_scope.py <changed-ids-file>", file=sys.stderr)
        raise SystemExit(2)

    ids = read_changed_ids(sys.argv[1])
    if not ids:
        # No file, or nothing written: say nothing and let the caller fall back
        # to the full purge rather than inventing an empty targeted scope.
        return

    scope = CacheScope()
    scope.add_summaries(ids)
    print(scope.to_json())


if __name__ == "__main__":
    main()
