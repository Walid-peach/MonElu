"""
explore_an_exports.py
Downloads the AN open-data votes index page and lists all ZIP export URLs.

Usage:
    python scripts/explore_an_exports.py
"""

import re
import sys

import requests

BASE = "https://data.assemblee-nationale.fr"
PAGE = f"{BASE}/travaux-parlementaires/votes"


def main() -> None:
    print(f"Fetching: {PAGE}\n")
    resp = requests.get(PAGE, timeout=30)
    resp.raise_for_status()
    html = resp.text

    # Extract all href values that end with .zip
    hrefs = re.findall(r'href="(/[^"]+\.(?:json|xml|csv)\.zip)"', html)
    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for h in hrefs:
        if h not in seen:
            seen.add(h)
            unique.append(h)

    if not unique:
        print("No ZIP links found — the page structure may have changed.")
        sys.exit(1)

    print(f"Found {len(unique)} ZIP export(s):\n")
    for path in unique:
        filename = path.split("/")[-1]
        url = f"{BASE}{path}"
        print(f"  {filename}")
        print(f"  {url}\n")


if __name__ == "__main__":
    main()
