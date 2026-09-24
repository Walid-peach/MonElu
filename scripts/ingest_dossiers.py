"""
ingest_dossiers.py
Downloads the Dossiers_Legislatifs ZIP export from the Assemblée Nationale
open-data portal and upserts every legislature-17 dossier and its flattened
acte parcours into the dossiers / dossier_actes tables (MON-243, ADR-035).

The acte parcours - not `votes.dossier_id` - is the spine of a bill page.
The AN only began tagging scrutins with a dossier in March 2026 (ADR-035 §1),
so four bills in five have no scrutin history before that date, while the acte
tree is complete from the start of the legislature.

Refresh is upsert-only, as everywhere else (CLAUDE.md decision 8): every touched
row is stamped with `last_seen_at`, nothing is ever deleted, and an acte that
vanishes from the export keeps its stale stamp for readers to filter out.

The whole run - ~2 900 dossier upserts, ~21 000 acte upserts and the has_scrutins
recompute - commits as a single transaction. That is deliberate and not an
oversight: a half-written parcours renders as a bill that skipped a stage, which
is worse than serving yesterday's complete one. Do not split it into batches to
shorten the transaction.

Usage:
    python scripts/ingest_dossiers.py
    python scripts/ingest_dossiers.py --zip-path /tmp/Dossiers_Legislatifs.json.zip
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import sys
import unicodedata
import zipfile

import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry
except ImportError:  # running as a plain file: python scripts/ingest_dossiers.py
    from _http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
DATABASE_URL = os.getenv("DATABASE_URL")

DOSSIERS_ZIP_PATH = (
    "/static/openData/repository/17/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip"
)

# Ingestion is scoped to legislature 17; the export carries only DLR5L17* today,
# but the prefix is asserted rather than assumed.
DOSSIER_UID_PREFIX = "DLR5L17"

# ── Status derivation (ADR-035 §5) ──────────────────────────────────────────
# `statutConclusion.libelle` is free text, not an enum: more than fifteen
# distinct values across the 617 decision actes, including "adoptée", "Accord",
# "adoptée sans modification" and "adopté, dans les conditions prévues à
# l'article 45, alinéa 3, de la Constitution". So the rules below match on
# codeActe structure and on the *first word* of the normalised label, never on
# equality. They are evaluated top to bottom, first match wins, and rule 7 is a
# total fallback - `derive_status` therefore always resolves and never needs an
# "unknown" value. `test_dossier_parsers.py` asserts that totality property.
DECISION_ACTE_TYPE = "Decision_Type"
PROMULGATION_CODE = "PROM"
CONSEIL_CONSTITUTIONNEL_CODE = "CC"
COMMISSION_MARKER = "-COM"

# The reading stages a dossier can pass through, as top-level codeActe values.
READING_STAGE_CODES = frozenset(
    {
        "AN1",
        "AN2",
        "AN20",
        "AN21",
        "ANNLEC",
        "ANLUNI",
        "ANLDEF",
        "SN1",
        "SN2",
        "SNNLEC",
        "CMP",
    }
)

STATUS_VALUES = (
    "promulguee",
    "conseil_constitutionnel",
    "rejetee",
    "adoptee_definitivement",
    "deposee",
    "en_commission",
    "en_navette",
)


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------


def fetch_all_dossiers(zip_path: str | None = None) -> list[dict]:
    """Load every legislature-17 dossier record from a local ZIP or the AN portal."""
    if zip_path:
        log.info("Reading dossiers ZIP from %s…", zip_path)
        with open(zip_path, "rb") as fh:
            raw = fh.read()
    else:
        url = f"{AN_BASE_URL}{DOSSIERS_ZIP_PATH}"
        log.info("Downloading dossiers ZIP from %s…", url)
        raw = download_with_retry(url, timeout=120)

    dossiers: list[dict] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = [
            n
            for n in zf.namelist()
            if n.startswith(f"json/dossierParlementaire/{DOSSIER_UID_PREFIX}")
            and n.endswith(".json")
        ]
        log.info("ZIP contains %d legislature-17 dossier files.", len(names))
        for name in names:
            with zf.open(name) as f:
                data = json.load(f)
            dossiers.append(data.get("dossierParlementaire") or data)
    return dossiers


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------


def _as_list(value) -> list:
    """`acteLegislatif` is a bare dict when there is one acte and a list otherwise.

    This holds at *every* level of the nesting, including the top, so every walk
    over the tree has to go through here. ``ingest_agenda.py::_odj_points`` is
    the same defence for the agenda feed's `pointODJ`.
    """
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _child_actes(node: dict) -> list[dict]:
    container = node.get("actesLegislatifs")
    if not isinstance(container, dict):
        return []
    return _as_list(container.get("acteLegislatif"))


def _as_date(value: str | None) -> str | None:
    if not value:
        return None
    return str(value)[:10]


def _text(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        value = value.get("#text") or value.get("libelle") or value.get("uid")
    text = str(value).strip() if value is not None else ""
    return text or None


def _initiateur(dossier: dict) -> str | None:
    """First acteurRef, else first organeRef.

    `initiateur` is a nested {acteurs, organes} structure and the ADR's column is
    a single TEXT ref. Both halves occur: 2 147 dossiers carry only acteurs, 526
    carry both, 23 only organes and 246 none at all. The acteur is the more
    specific of the two, so it wins where both are present.
    """
    initiateur = dossier.get("initiateur")
    if not isinstance(initiateur, dict):
        return None
    acteurs = initiateur.get("acteurs")
    if isinstance(acteurs, dict):
        for acteur in _as_list(acteurs.get("acteur")):
            ref = _text(acteur.get("acteurRef")) if isinstance(acteur, dict) else None
            if ref:
                return ref
    organes = initiateur.get("organes")
    if isinstance(organes, dict):
        for organe in _as_list(organes.get("organe")):
            ref = _text(organe.get("organeRef")) if isinstance(organe, dict) else None
            if ref:
                return ref
    return None


def flatten_actes(dossier_uid: str, top_level: list[dict]) -> list[dict]:
    """Flatten the nested acteLegislatif tree into ordered rows.

    `ordinal` is a per-dossier pre-order counter rather than a sibling index:
    both preserve sibling sequence, but only the pre-order form makes
    `ORDER BY ordinal` (the `idx_dossier_actes_order` index) replay the tree in
    the single ordered pass ADR-035 §3 asks the renderer to do.

    `root_code` / `root_uid` are carried on the row for `derive_status` and are
    not columns - psycopg2's named-parameter binding ignores the extra keys.
    """
    rows: list[dict] = []
    counter = 0

    def walk(node: dict, parent_uid: str | None, depth: int, root_code: str, root_uid: str) -> None:
        nonlocal counter
        acte_uid = _text(node.get("uid"))
        code_acte = _text(node.get("codeActe"))
        if not acte_uid or not code_acte:
            # Both are structural: without them the row can neither be keyed nor
            # classified. Counted as a skip by check_dossier_yield.
            return
        own_root_code = root_code or code_acte
        own_root_uid = root_uid or acte_uid
        statut = node.get("statutConclusion")
        libelle_acte = node.get("libelleActe")
        rows.append(
            {
                "dossier_uid": dossier_uid,
                "acte_uid": acte_uid,
                "parent_uid": parent_uid,
                "depth": depth,
                "ordinal": counter,
                "code_acte": code_acte,
                "acte_type": _text(node.get("@xsi:type")),
                "libelle": (
                    _text(libelle_acte.get("nomCanonique"))
                    if isinstance(libelle_acte, dict)
                    else _text(libelle_acte)
                ),
                "date_acte": _as_date(node.get("dateActe")),
                "statut_label": _text(statut.get("libelle")) if isinstance(statut, dict) else None,
                "organe_ref": _text(node.get("organeRef")),
                "root_code": own_root_code,
                "root_uid": own_root_uid,
            }
        )
        counter += 1
        for child in _child_actes(node):
            walk(child, acte_uid, depth + 1, own_root_code, own_root_uid)

    for node in top_level:
        walk(node, None, 0, "", "")
    return rows


def _normalise(value: str | None) -> str:
    """Lowercase and strip accents, so "rejeté", "rejetée" and "Rejet" all agree."""
    decomposed = unicodedata.normalize("NFD", value or "")
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn").lower().strip()


def _first_word(value: str | None) -> str:
    """First word of the normalised label.

    Prefix-matching the *first word only* is what keeps the rule set at seven
    rules: the long constitutional labels ("adopté, dans les conditions prévues à
    l'article 45, alinéa 3, de la Constitution") always lead with the outcome
    word, so matching the whole string would need one rule per variant.
    """
    normalised = _normalise(value)
    return normalised.split(",")[0].split(" ")[0] if normalised else ""


def derive_status(actes: list[dict]) -> tuple[str, str | None]:
    """Resolve ADR-035 §5's seven ordered rules. Returns (status, status_label).

    `status_label` is the raw `statutConclusion.libelle` of the deciding acte,
    stored verbatim alongside the derived enum - never discarded in favour of it
    (ADR-035 "Impact"). It is NULL when the dossier has no decision acte yet.
    """
    top_level = [a for a in actes if a["depth"] == 0]
    decisions = sorted(
        (a for a in actes if a["acte_type"] == DECISION_ACTE_TYPE and a["date_acte"]),
        key=lambda a: (a["date_acte"], a["ordinal"]),
    )
    latest = decisions[-1] if decisions else None
    status_label = latest["statut_label"] if latest else None

    # 1 — promulguée
    if any(a["code_acte"] == PROMULGATION_CODE for a in top_level):
        return "promulguee", status_label
    # 2 — devant le Conseil constitutionnel
    if any(a["code_acte"] == CONSEIL_CONSTITUTIONNEL_CODE for a in top_level):
        return "conseil_constitutionnel", status_label
    # 3 — rejetée
    if latest and _first_word(latest["statut_label"]).startswith("rejet"):
        return "rejetee", status_label
    # 4 — adoptée définitivement. Deliberately conservative: a text adopted at
    # first reading with a second chamber still to come is genuinely in navette,
    # so it needs the dossier's *only* reading stage to also be its last.
    if latest and _first_word(latest["statut_label"]).startswith("adopt"):
        reading_stages = [a for a in top_level if a["code_acte"] in READING_STAGE_CODES]
        if (
            len(reading_stages) == 1
            and top_level
            and reading_stages[0]["acte_uid"] == top_level[-1]["acte_uid"]
            and latest["root_uid"] == reading_stages[0]["acte_uid"]
        ):
            return "adoptee_definitivement", status_label
    # 5 / 6 — nothing decided yet. The two are tested in the opposite order to
    # the ADR's numbering because their conditions are mutually exclusive (rule 5
    # is "no -COM acte", rule 6 is "a -COM acte exists"), so sharing the
    # `not decisions` guard is the same rule set with one test instead of two.
    if not decisions:
        if any(COMMISSION_MARKER in a["code_acte"] for a in actes):
            return "en_commission", status_label  # rule 6
        return "deposee", status_label  # rule 5
    # 7 — total fallback
    return "en_navette", status_label


def parse_dossier(dossier: dict) -> tuple[dict, list[dict]] | None:
    """Flatten one dossier into its `dossiers` row and its `dossier_actes` rows."""
    try:
        dossier_uid = _text(dossier.get("uid"))
        if not dossier_uid or not dossier_uid.startswith(DOSSIER_UID_PREFIX):
            return None

        titre_dossier = dossier.get("titreDossier") or {}
        titre = _text(titre_dossier.get("titre")) if isinstance(titre_dossier, dict) else None
        if not titre:
            # `titre` is NOT NULL and is the page's <h1>; a dossier without one
            # has nothing to render (ADR-035 §8 - the AN title is used verbatim,
            # there is no generation step to fall back on).
            log.warning("Dossier %s has no titreDossier.titre — skipped.", dossier_uid)
            return None

        container = dossier.get("actesLegislatifs")
        top_level = _as_list(container.get("acteLegislatif")) if isinstance(container, dict) else []
        actes = flatten_actes(dossier_uid, top_level)

        dates = sorted(a["date_acte"] for a in actes if a["date_acte"])
        top_rows = [a for a in actes if a["depth"] == 0]
        status, status_label = derive_status(actes)

        procedure = dossier.get("procedureParlementaire") or {}
        if not isinstance(procedure, dict):
            procedure = {}

        row = {
            "dossier_uid": dossier_uid,
            "legislature": _text(dossier.get("legislature")),
            "titre": titre,
            "titre_chemin": (
                _text(titre_dossier.get("titreChemin")) if isinstance(titre_dossier, dict) else None
            ),
            "procedure_code": _text(procedure.get("code")),
            "procedure_label": _text(procedure.get("libelle")),
            "initiateur": _initiateur(dossier),
            "status": status,
            "status_label": status_label,
            "current_stage": top_rows[-1]["code_acte"] if top_rows else None,
            "parcours_start": dates[0] if dates else None,
            "parcours_end": dates[-1] if dates else None,
        }
        return row, actes
    except Exception as exc:
        # WARNING, not DEBUG: basicConfig(level=INFO) never emits a debug line, so
        # a feed reshape would produce zero records with no visible signal in the
        # run log (MON-249).
        log.warning("Could not parse dossier %s — %s", dossier.get("uid"), exc)
        return None


def parse_dossiers(dossiers: list[dict]) -> tuple[list[dict], list[dict]]:
    """Parse every dossier, guarding the yield. Returns (dossier rows, acte rows)."""
    dossier_rows: list[dict] = []
    acte_rows: list[dict] = []
    for dossier in dossiers:
        parsed = parse_dossier(dossier)
        if parsed is None:
            continue
        row, actes = parsed
        dossier_rows.append(row)
        acte_rows.extend(actes)

    log.info(
        "Parsed %d/%d dossiers and %d acte rows.",
        len(dossier_rows),
        len(dossiers),
        len(acte_rows),
    )
    check_dossier_yield(parsed=len(dossier_rows), seen=len(dossiers), actes=len(acte_rows))
    return dossier_rows, acte_rows


def check_dossier_yield(parsed: int, seen: int, actes: int) -> None:
    """Exit 1 when the export stops parsing (MON-220 / MON-249, SKIP_RATE_THRESHOLD).

    An empty record list is a silent no-op downstream: the upserts write nothing,
    `last_seen_at` never advances, and the tables keep serving the previous run's
    parcours forever with nothing in the run log saying the feed changed.

    Two shapes are separated, because a dossier count alone cannot tell them
    apart. A reshape of the *dossier* envelope (`dossierParlementaire`,
    `titreDossier.titre`) drops the dossier rows; a reshape of the nested
    `actesLegislatifs.acteLegislatif` path leaves every dossier parsing fine and
    silently empties the parcours, which is the whole point of the table.
    """
    if seen == 0:
        log.error(
            "No %s* dossier files found in the export. The "
            "json/dossierParlementaire/ path in the AN export has changed.",
            DOSSIER_UID_PREFIX,
        )
        sys.exit(1)

    if parsed == 0:
        log.error(
            "All %d dossiers failed to parse. Check the AN dossiers export for format changes.",
            seen,
        )
        sys.exit(1)

    skip_rate = (seen - parsed) / seen
    if skip_rate > SKIP_RATE_THRESHOLD:
        log.error(
            "High parse failure rate: %d/%d dossiers skipped (%.0f%%). "
            "Check the AN dossiers export for format changes.",
            seen - parsed,
            seen,
            skip_rate * 100,
        )
        sys.exit(1)

    if actes == 0:
        log.error(
            "Parsed %d dossiers but not a single acte. The nested "
            "actesLegislatifs.acteLegislatif path has changed — the parcours, "
            "which is the whole content of a bill page, would be empty.",
            parsed,
        )
        sys.exit(1)


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

UPSERT_DOSSIER_SQL = """
INSERT INTO dossiers (
    dossier_uid, legislature, titre, titre_chemin,
    procedure_code, procedure_label, initiateur,
    status, status_label, current_stage, parcours_start, parcours_end,
    last_seen_at, ingested_at, changed_at
) VALUES (
    %(dossier_uid)s, %(legislature)s, %(titre)s, %(titre_chemin)s,
    %(procedure_code)s, %(procedure_label)s, %(initiateur)s,
    %(status)s, %(status_label)s, %(current_stage)s, %(parcours_start)s, %(parcours_end)s,
    NOW(), NOW(), NOW()
)
ON CONFLICT (dossier_uid) DO UPDATE SET
    legislature     = EXCLUDED.legislature,
    titre           = EXCLUDED.titre,
    titre_chemin    = EXCLUDED.titre_chemin,
    procedure_code  = EXCLUDED.procedure_code,
    procedure_label = EXCLUDED.procedure_label,
    initiateur      = EXCLUDED.initiateur,
    status          = EXCLUDED.status,
    status_label    = EXCLUDED.status_label,
    current_stage   = EXCLUDED.current_stage,
    parcours_start  = EXCLUDED.parcours_start,
    parcours_end    = EXCLUDED.parcours_end,
    last_seen_at    = NOW(),
    ingested_at     = NOW(),
    -- `has_scrutins` is absent on purpose: it is recomputed from `votes` at the
    -- end of the run (ADR-035 §6), not carried in the export.
    -- `ingested_at` stays unconditional and `changed_at` carries the change
    -- signal, the split migration 011 made (GH #353). Never merge the two.
    changed_at      = CASE WHEN (
                        dossiers.legislature, dossiers.titre, dossiers.titre_chemin,
                        dossiers.procedure_code, dossiers.procedure_label,
                        dossiers.initiateur, dossiers.status, dossiers.status_label,
                        dossiers.current_stage, dossiers.parcours_start, dossiers.parcours_end
                      ) IS DISTINCT FROM (
                        EXCLUDED.legislature, EXCLUDED.titre, EXCLUDED.titre_chemin,
                        EXCLUDED.procedure_code, EXCLUDED.procedure_label,
                        EXCLUDED.initiateur, EXCLUDED.status, EXCLUDED.status_label,
                        EXCLUDED.current_stage, EXCLUDED.parcours_start, EXCLUDED.parcours_end
                      ) THEN NOW() ELSE dossiers.changed_at END;
"""

UPSERT_ACTE_SQL = """
INSERT INTO dossier_actes (
    dossier_uid, acte_uid, parent_uid, depth, ordinal,
    code_acte, acte_type, libelle, date_acte, statut_label, organe_ref,
    last_seen_at, ingested_at, changed_at
) VALUES (
    %(dossier_uid)s, %(acte_uid)s, %(parent_uid)s, %(depth)s, %(ordinal)s,
    %(code_acte)s, %(acte_type)s, %(libelle)s, %(date_acte)s, %(statut_label)s, %(organe_ref)s,
    NOW(), NOW(), NOW()
)
ON CONFLICT (dossier_uid, acte_uid) DO UPDATE SET
    parent_uid   = EXCLUDED.parent_uid,
    depth        = EXCLUDED.depth,
    ordinal      = EXCLUDED.ordinal,
    code_acte    = EXCLUDED.code_acte,
    acte_type    = EXCLUDED.acte_type,
    libelle      = EXCLUDED.libelle,
    date_acte    = EXCLUDED.date_acte,
    statut_label = EXCLUDED.statut_label,
    organe_ref   = EXCLUDED.organe_ref,
    last_seen_at = NOW(),
    ingested_at  = NOW(),
    changed_at   = CASE WHEN (
                     dossier_actes.parent_uid, dossier_actes.depth, dossier_actes.ordinal,
                     dossier_actes.code_acte, dossier_actes.acte_type, dossier_actes.libelle,
                     dossier_actes.date_acte, dossier_actes.statut_label,
                     dossier_actes.organe_ref
                   ) IS DISTINCT FROM (
                     EXCLUDED.parent_uid, EXCLUDED.depth, EXCLUDED.ordinal,
                     EXCLUDED.code_acte, EXCLUDED.acte_type, EXCLUDED.libelle,
                     EXCLUDED.date_acte, EXCLUDED.statut_label, EXCLUDED.organe_ref
                   ) THEN NOW() ELSE dossier_actes.changed_at END;
"""

# ADR-035 §6: a bill acquires its page automatically on its first scrutin, so the
# flag is recomputed from `votes` on every run rather than hardcoded or carried
# forward. The WHERE clause restricts the write to rows that actually flip, which
# is also what keeps `changed_at` honest.
RECOMPUTE_HAS_SCRUTINS_SQL = """
UPDATE dossiers d
SET has_scrutins = computed.flag,
    changed_at   = NOW()
FROM (
    SELECT d2.dossier_uid,
           EXISTS (SELECT 1 FROM votes v WHERE v.dossier_id = d2.dossier_uid) AS flag
    FROM dossiers d2
) AS computed
WHERE d.dossier_uid = computed.dossier_uid
  AND d.has_scrutins IS DISTINCT FROM computed.flag;
"""


def upsert_dossiers(dossier_rows: list[dict], acte_rows: list[dict]) -> int:
    """Upsert both tables and recompute has_scrutins. Returns the flipped count."""
    conn = connect_with_retry(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                # Dossiers first: dossier_actes carries a FK onto them.
                psycopg2.extras.execute_batch(cur, UPSERT_DOSSIER_SQL, dossier_rows, page_size=500)
                psycopg2.extras.execute_batch(cur, UPSERT_ACTE_SQL, acte_rows, page_size=1000)
                cur.execute(RECOMPUTE_HAS_SCRUTINS_SQL)
                flipped = cur.rowcount
                cur.execute("SELECT COUNT(*) FROM dossiers WHERE has_scrutins")
                with_scrutins = cur.fetchone()[0]
        log.info(
            "Upsert complete — %d dossiers, %d actes. has_scrutins true on %d dossiers "
            "(%d flipped this run).",
            len(dossier_rows),
            len(acte_rows),
            with_scrutins,
            flipped,
        )
        return flipped
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest AN dossiers législatifs + acte parcours into MonÉlu DB"
    )
    parser.add_argument(
        "--zip-path",
        default=None,
        help="Path to an already-downloaded Dossiers_Legislatifs.json.zip (skips the download).",
    )
    args = parser.parse_args()

    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    log.info("=== Starting dossier ingestion ===")
    dossiers = fetch_all_dossiers(zip_path=args.zip_path)
    dossier_rows, acte_rows = parse_dossiers(dossiers)
    upsert_dossiers(dossier_rows, acte_rows)
    log.info("=== Dossier ingestion finished ===")


if __name__ == "__main__":
    main()
