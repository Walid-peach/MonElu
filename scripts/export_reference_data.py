"""
scripts/export_reference_data.py
Write the small reference tables every client mirrors to data/reference/*.json
(ADR-041 §4, #439).

Departments, parliamentary groups and themes each exist in Python (the API
routes off them) and in TypeScript (the website renders from them), and the
iOS app needs a third copy. Instead of a third hand-maintained copy, the app
bundles this JSON, the website's Jest suite compares its own maps against it,
and tests/unit/test_reference_data.py fails when the committed files drift from
the Python source. Python is the source because the API is: a slug or a name
the API does not know is a broken link on every client.

`vote_positions.json` is not generated here. The position labels have no
Python source today; that file is written by hand and the Jest suite checks it
against `frontend/src/lib/vote-position.ts`.

Usage:
    python scripts/export_reference_data.py          # rewrite the files
    python scripts/export_reference_data.py --check  # exit 1 if they drift
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from api.departments_data import DEPT_NAMES  # noqa: E402
from api.groups_data import GROUP_SLUGS  # noqa: E402
from api.themes_data import THEME_NAMES  # noqa: E402

DEFAULT_OUT_DIR = pathlib.Path(__file__).resolve().parents[1] / "data" / "reference"


def reference_tables() -> dict[str, list[dict[str, str]]]:
    """{file name: rows}. Lists rather than objects so the order survives every
    decoder: Swift's `Dictionary` does not keep insertion order."""
    return {
        "departments.json": [{"code": code, "name": name} for code, name in DEPT_NAMES.items()],
        "groups.json": [{"slug": slug, "name": name} for slug, name in GROUP_SLUGS.items()],
        "themes.json": [{"slug": slug, "name": name} for slug, name in THEME_NAMES.items()],
    }


def render(rows: list[dict[str, str]]) -> str:
    return json.dumps(rows, ensure_ascii=False, indent=2) + "\n"


def drifted(out_dir: pathlib.Path) -> list[str]:
    """File names whose committed content differs from a fresh export."""
    return [
        name
        for name, rows in reference_tables().items()
        if not (out_dir / name).exists()
        or (out_dir / name).read_text(encoding="utf-8") != render(rows)
    ]


def write(out_dir: pathlib.Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in reference_tables().items():
        (out_dir / name).write_text(render(rows), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="exit 1 if the files drift")
    parser.add_argument("--out-dir", type=pathlib.Path, default=DEFAULT_OUT_DIR)
    args = parser.parse_args(argv)

    if args.check:
        stale = drifted(args.out_dir)
        if stale:
            print(
                f"Reference data drifted from api/*_data.py: {', '.join(stale)}. "
                "Run `python scripts/export_reference_data.py` and commit the result."
            )
            return 1
        print("Reference data is current.")
        return 0

    write(args.out_dir)
    print(f"Wrote {len(reference_tables())} files to {args.out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
