"""
scripts/explore_agenda.py

Measures the Assemblée's agenda export ("ordre du jour") to answer the MON-208
spike: is the feed published far enough ahead, and rich enough, to build the
forward-looking /agenda view of MON-110?

The export is a full snapshot regenerated daily, but every réunion and every ODJ
point carries cycleDeVie.chrono.creation — the date the entry was created. That
makes publication lead time measurable retrospectively from a single download,
with no need for a snapshot series.

Usage:
    python scripts/explore_agenda.py
    python scripts/explore_agenda.py --zip-path /tmp/agenda.zip
    python scripts/explore_agenda.py --type seance_type
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import io
import json
import os
import statistics
import zipfile

from dotenv import load_dotenv

try:
    from scripts._http import download_with_retry
except ImportError:  # running as a plain file: python scripts/explore_agenda.py
    from _http import download_with_retry

load_dotenv()

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
AGENDA_ZIP_PATH = "/static/openData/repository/17/vp/reunions/Agenda.json.zip"

# An objet at or below this length carries no summarizable content: the whole
# value is "Discussion" or "Questions au Gouvernement".
STUB_OBJET_MAX_LEN = 30


def load_reunions(zip_path: str | None = None) -> list[dict]:
    """Load every réunion record from a local ZIP or the AN portal."""
    if zip_path:
        print(f"Reading agenda ZIP from {zip_path}…")
        with open(zip_path, "rb") as fh:
            raw = fh.read()
    else:
        url = f"{AN_BASE_URL}{AGENDA_ZIP_PATH}"
        print(f"Downloading agenda ZIP from {url}…")
        raw = download_with_retry(url)

    out = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = [n for n in zf.namelist() if n.endswith(".json")]
        for name in names:
            with zf.open(name) as fh:
                out.append(json.load(fh)["reunion"])
    print(f"ZIP contains {len(out)} réunion files.\n")
    return out


def odj_points(reunion: dict) -> list[dict]:
    """Return the réunion's ODJ points.

    pointODJ is a bare object when the sitting has a single point and a list
    when it has several — both shapes occur in the feed.
    """
    points = ((reunion.get("ODJ") or {}).get("pointsODJ") or {}).get("pointODJ")
    if points is None:
        return []
    return points if isinstance(points, list) else [points]


def created_on(record: dict) -> dt.date | None:
    chrono = (record.get("cycleDeVie") or {}).get("chrono") or {}
    return _as_date(chrono.get("creation"))


def _as_date(value: str | None) -> dt.date | None:
    if not value:
        return None
    return dt.date.fromisoformat(value[:10])


def describe(values: list[int], label: str) -> None:
    """Print a lead-time distribution in days."""
    if not values:
        print(f"{label}: no data")
        return
    ordered = sorted(values)
    n = len(ordered)

    def pct(p: float) -> int:
        return ordered[min(n - 1, int(p * n))]

    ahead_7 = sum(1 for v in ordered if v >= 7) / n
    ahead_3 = sum(1 for v in ordered if v >= 3) / n
    same_day = sum(1 for v in ordered if v <= 0) / n
    print(
        f"{label}\n"
        f"    n={n}  min={ordered[0]}  p10={pct(0.10)}  median={statistics.median(ordered):.0f}"
        f"  p90={pct(0.90)}  max={ordered[-1]}\n"
        f"    published >=7d ahead: {ahead_7:.0%}   >=3d: {ahead_3:.0%}   "
        f"on/after the sitting: {same_day:.0%}"
    )


def is_stub(objet: str | None) -> bool:
    return len((objet or "").strip()) <= STUB_OBJET_MAX_LEN


def report(reunions: list[dict], xsi_type: str) -> None:
    selected = [r for r in reunions if r.get("@xsi:type") == xsi_type]
    print(f"=== {xsi_type}: {len(selected)} réunions ===\n")

    print("--- record types in the export ---")
    for name, count in collections.Counter(r.get("@xsi:type") for r in reunions).most_common():
        print(f"    {name}: {count}")
    print()

    if not selected:
        print(f"No réunion of type {xsi_type!r} in this export — nothing to analyse.")
        return

    print("--- sitting days per month ---")
    days: dict[str, set[str]] = collections.defaultdict(set)
    for r in selected:
        stamp = (r.get("timeStampDebut") or "")[:10]
        if stamp:
            days[stamp[:7]].add(stamp)
    for month in sorted(days):
        print(f"    {month}: {len(days[month])}")
    print()

    print("--- publication lead time (creation -> sitting, days) ---")
    sitting_leads = []
    point_leads: list[tuple[int, str]] = []
    for r in selected:
        sitting = _as_date(r.get("timeStampDebut"))
        if sitting is None:
            continue
        created = created_on(r)
        if created:
            sitting_leads.append((sitting - created).days)
        for point in odj_points(r):
            point_created = created_on(point)
            if point_created:
                point_leads.append(((sitting - point_created).days, point.get("typePointODJ")))
    describe(sitting_leads, "  réunion")
    describe([lead for lead, _ in point_leads], "  ODJ point")
    print()

    print("--- lead time by ODJ point type ---")
    by_type: dict[str, list[int]] = collections.defaultdict(list)
    for lead, point_type in point_leads:
        by_type[point_type].append(lead)
    for point_type, leads in sorted(by_type.items(), key=lambda kv: -len(kv[1])):
        ordered = sorted(leads)
        p10 = ordered[min(len(ordered) - 1, int(0.10 * len(ordered)))]
        print(
            f"    {str(point_type):46} n={len(leads):5}"
            f"  median={statistics.median(ordered):5.0f}d  p10={p10:5}d"
        )
    print()

    points = [p for r in selected for p in odj_points(r)]
    print(f"--- content quality across {len(points)} ODJ points ---")
    if not points:
        # reunionInitParlementaire_type and most commission records carry a free-text
        # ODJ.convocationODJ.item instead of structured pointsODJ entries.
        print("    no structured ODJ points on this réunion type — nothing to measure.")
        print()
        cancellations(reunions, selected, xsi_type)
        return
    with_dossier = sum(
        1 for p in points if (p.get("dossiersLegislatifsRefs") or {}).get("dossierRef")
    )
    print(f"    carrying a dossierRef: {with_dossier} ({with_dossier / len(points):.0%})")
    print(f"    carrying textesAssocies: {sum(1 for p in points if p.get('textesAssocies'))}")
    print(f"    carrying a procedure: {sum(1 for p in points if p.get('procedure'))}")

    cross: collections.Counter = collections.Counter()
    for p in points:
        has_dossier = bool((p.get("dossiersLegislatifsRefs") or {}).get("dossierRef"))
        cross[(has_dossier, is_stub(p.get("objet")))] += 1
    print("    objet richness x dossier link:")
    for (has_dossier, stub), count in sorted(cross.items()):
        label = ("stub objet" if stub else "descriptive objet") + (
            " + dossier" if has_dossier else ", no dossier"
        )
        print(f"        {label:34} {count:5} ({count / len(points):.0%})")

    stubs = collections.Counter(
        (p.get("objet") or "").strip() for p in points if is_stub(p.get("objet"))
    )
    print("    most common stub objets:", stubs.most_common(5))
    print()

    cancellations(reunions, selected, xsi_type)


def cancellations(reunions: list[dict], selected: list[dict], xsi_type: str) -> None:
    """Report cancellation volume and how much notice a cancellation gives."""
    print("--- cancellations (the mutability question, MON-209) ---")
    print("  across the whole export:")
    for state, count in collections.Counter(
        (r.get("cycleDeVie") or {}).get("etat") for r in reunions
    ).most_common():
        print(f"        {state}: {count}")

    print(f"  within {xsi_type}:")
    for state, count in collections.Counter(
        (r.get("cycleDeVie") or {}).get("etat") for r in selected
    ).most_common():
        print(f"        {state}: {count} ({count / len(selected):.0%})")

    # How long before the sitting is a cancellation decided? This bounds how
    # stale an "upcoming" page can be between refreshes.
    notice = []
    for r in selected:
        life = r.get("cycleDeVie") or {}
        if life.get("etat") not in ("Annulé", "Supprimé"):
            continue
        sitting = _as_date(r.get("timeStampDebut"))
        closed = _as_date((life.get("chrono") or {}).get("cloture"))
        if sitting and closed:
            notice.append((sitting - closed).days)
    if notice:
        ordered = sorted(notice)
        ahead = sum(1 for v in ordered if v >= 1) / len(ordered)
        print(
            f"  cancellation notice (days before the sitting): n={len(ordered)}"
            f"  min={ordered[0]}  median={statistics.median(ordered):.0f}  max={ordered[-1]}\n"
            f"        cancelled >=1d ahead: {ahead:.0%}   on the day or later: {1 - ahead:.0%}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip-path", help="read a local agenda ZIP instead of downloading")
    parser.add_argument(
        "--type",
        default="seance_type",
        help="réunion @xsi:type to analyse (default: seance_type — séance publique)",
    )
    args = parser.parse_args()

    report(load_reunions(args.zip_path), args.type)


if __name__ == "__main__":
    main()
