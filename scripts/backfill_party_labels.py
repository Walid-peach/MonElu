"""
scripts/backfill_party_labels.py

Normalizes deputies.party to the canonical 17th-legislature parliamentary
group labels.

Why this exists: the daily pipeline resolves party labels from AMO10,
which only lists *active* deputies. Deputies who leave mid-legislature
keep whatever label they had at departure — a mix of PARPOL spellings
("Rassemblement national", "Parti socialiste"), pre-2024 group names
("Ensemble ! (majorité présidentielle)"), and in some cases outright
wrong PARPOL data (Jérôme Nury labeled "Régions et peuples solidaires"
although he sat with Droite Républicaine). This fragments every
party-level aggregate: the same group appears under several labels.

Two normalization layers:
  1. LABEL_MAP    — variant label → canonical GP label, applied only when
                    the correspondence is one-to-one for every deputy
                    carrying the variant.
  2. OVERRIDES    — deputy_id → label, for individually verified deputies
                    whose stored label cannot be mapped safely in bulk.

NULL parties are left NULL — unknown is better than guessed.

Dry-run by default; pass --apply to write. After applying, rebuild the
RAG index (`make rag-index`) so party/deputy chunks pick up the labels.

Usage:
    python -m scripts.backfill_party_labels            # report only
    python -m scripts.backfill_party_labels --apply    # update deputies.party
"""

import argparse
import os

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_batch

load_dotenv()

# Canonical 17th-legislature parliamentary groups + Non inscrit.
# Keep in sync with the dbt accepted_values test on stg_deputies.party.
CANONICAL_LABELS = {
    "Rassemblement National",
    "Ensemble pour la République",
    "La France insoumise - Nouveau Front Populaire",
    "Socialistes et apparentés",
    "Droite Républicaine",
    "Écologiste et Social",
    "Les Démocrates",
    "Horizons & Indépendants",
    "Libertés, Indépendants, Outre-mer et Territoires",
    "Union des droites pour la République",
    "Gauche Démocrate et Républicaine",
    "Non inscrit",
}

# Variant → canonical. Only mappings that hold for every deputy carrying
# the variant label (verified against the deputies concerned, 2026-07).
LABEL_MAP = {
    # case variant of the same group
    "Rassemblement national": "Rassemblement National",
    # PARPOL spelling of the group
    "La France Insoumise": "La France insoumise - Nouveau Front Populaire",
    # PS deputies → their L17 group
    "Parti socialiste": "Socialistes et apparentés",
    # Horizons deputies → their L17 group
    "Horizons": "Horizons & Indépendants",
    # LR deputies → their L17 group (LR group renamed Droite Républicaine)
    "Les Républicains": "Droite Républicaine",
}

# Individually verified deputies whose stored label is wrong or ambiguous.
# Each entry cites why. deputy_id → canonical label.
OVERRIDES = {
    # "Ensemble ! (majorité présidentielle)" holders — all sat with EPR
    # except Philippe Bolo (MoDem, groupe Les Démocrates).
    "PA795144": "Ensemble pour la République",  # Antoine Armand
    "PA719736": "Ensemble pour la République",  # Camille Galliard-Minier
    "PA2960": "Ensemble pour la République",  # Éric Woerth
    "PA335758": "Ensemble pour la République",  # Franck Riester
    "PA677483": "Ensemble pour la République",  # Stéphane Mazars
    "PA793940": "Ensemble pour la République",  # Thomas Cazenave
    "PA720162": "Les Démocrates",  # Philippe Bolo — MoDem
    # Alliance centriste (PARPOL) — Olivier Falorni sat with Les Démocrates
    "PA605694": "Les Démocrates",
    # Régions et peuples solidaires (wrong PARPOL) — Jérôme Nury is LR,
    # sat with Droite Républicaine
    "PA720644": "Droite Républicaine",
}


def compute_changes(rows: list[tuple]) -> tuple[list[tuple], list[tuple]]:
    """Split deputies into (changes, unmapped-non-canonical)."""
    changes = []
    unmapped = []
    for deputy_id, full_name, current in rows:
        if current is None:
            continue
        if current in CANONICAL_LABELS:
            # Already canonical — never touch it, even if an OVERRIDE
            # exists: the deputy may have legitimately changed groups
            # since the override was written.
            continue
        target = OVERRIDES.get(deputy_id) or LABEL_MAP.get(current)
        if target and target != current:
            changes.append((deputy_id, full_name, current, target))
        elif target is None:
            unmapped.append((deputy_id, full_name, current))
    return changes, unmapped


def backfill(apply: bool) -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT deputy_id, full_name, party FROM deputies ORDER BY full_name")
            rows = cur.fetchall()

        changes, unmapped = compute_changes(rows)

        print(f"Deputies in DB       : {len(rows)}")
        print(f"Label changes        : {len(changes)}")
        print(f"Unmapped non-canonical labels remaining: {len(unmapped)}\n")
        for _, full_name, old, new in changes:
            print(f"  {full_name:<32} {old:<42} → {new}")
        for deputy_id, full_name, label in unmapped:
            print(f"  UNMAPPED {deputy_id} {full_name}: {label!r}")

        if apply and changes:
            with conn.cursor() as cur:
                execute_batch(
                    cur,
                    "UPDATE deputies SET party = %s WHERE deputy_id = %s",
                    [(new, deputy_id) for deputy_id, _, _, new in changes],
                    page_size=200,
                )
            conn.commit()
            print(f"\nCommitted {len(changes)} updates.")
            print("Rebuild the RAG index so chunks pick up the labels: make rag-index")
        elif not apply:
            print("\nDry run — re-run with --apply to write.")
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Normalize deputies.party to canonical labels.")
    parser.add_argument("--apply", action="store_true", help="write updates (default: dry run)")
    args = parser.parse_args()
    backfill(apply=args.apply)
