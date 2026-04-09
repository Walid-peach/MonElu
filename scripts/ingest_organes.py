"""
scripts/ingest_organes.py

Builds a mapping {organe_uid: party_name} for all GP (Groupe Parlementaire)
entries in the AN export, then derives {deputy_id: gp_name} for every deputy
by scanning their acteur mandats for typeOrgane == "GP".

Returns both dicts so update_party.py can use them without re-downloading.
Can also be run standalone to verify the mapping before updating the DB.
"""

import io
import json
import zipfile

import requests

AN_BASE = "https://data.assemblee-nationale.fr"
ZIP_PATH = (
    "/static/openData/repository/17/amo"
    "/deputes_actifs_mandats_actifs_organes"
    "/AMO10_deputes_actifs_mandats_actifs_organes.json.zip"
)


def download_zip() -> zipfile.ZipFile:
    url = AN_BASE + ZIP_PATH
    print(f"Downloading {url} …")
    raw = requests.get(url, timeout=120).content
    print(f"  {len(raw):,} bytes downloaded.")
    return zipfile.ZipFile(io.BytesIO(raw))


def build_gp_map(zf: zipfile.ZipFile) -> dict[str, str]:
    """
    Returns {organe_uid: libelle} for every organe of codeType GP or PARPOL.
    GP is preferred (Groupe Parlementaire = actual parliamentary group).
    Files are wrapped: {"organe": {...}} — must unwrap before reading fields.
    """
    gp_map = {}
    organe_files = [n for n in zf.namelist() if n.startswith("json/organe/") and n.endswith(".json")]
    for fname in organe_files:
        try:
            raw = json.loads(zf.read(fname))
        except Exception:
            continue
        # Unwrap {"organe": {...}} wrapper
        data = raw.get("organe", raw)
        code_type = data.get("codeType")
        if code_type in ("GP", "PARPOL"):
            uid = data.get("uid")
            libelle = data.get("libelle") or data.get("libelleAbrege")
            if uid and libelle:
                gp_map[uid] = libelle
    return gp_map


def build_deputy_party_map(zf: zipfile.ZipFile, gp_map: dict[str, str]) -> dict[str, str]:
    """
    Returns {deputy_id: party_name} by scanning each acteur's mandats.
    Priority: GP mandat > PARPOL mandat > None.
    """
    deputy_map: dict[str, str] = {}
    acteur_files = [n for n in zf.namelist() if n.startswith("json/acteur/") and n.endswith(".json")]

    for fname in acteur_files:
        try:
            data = json.loads(zf.read(fname))
        except Exception:
            continue

        # Acteur files are wrapped: {"acteur": {...}}
        acteur = data.get("acteur", data)
        uid_field = acteur.get("uid", {})
        deputy_id = uid_field.get("#text") if isinstance(uid_field, dict) else uid_field
        if not deputy_id:
            continue

        mandats_raw = acteur.get("mandats", {}).get("mandat", [])
        if isinstance(mandats_raw, dict):
            mandats_raw = [mandats_raw]

        gp_party = None
        parpol_party = None

        for mandat in mandats_raw:
            type_organe = mandat.get("typeOrgane")
            date_fin = mandat.get("dateFin")
            if date_fin:  # skip ended mandats
                continue
            organe_ref = mandat.get("organes", {}).get("organeRef")
            if not organe_ref:
                continue
            if type_organe == "GP" and organe_ref in gp_map:
                gp_party = gp_map[organe_ref]
            elif type_organe == "PARPOL" and organe_ref in gp_map and not gp_party:
                parpol_party = gp_map[organe_ref]

        party = gp_party or parpol_party
        if party:
            deputy_map[deputy_id] = party

    return deputy_map


def main():
    import json as _json

    zf = download_zip()

    print("\nBuilding GP/PARPOL organe map …")
    gp_map = build_gp_map(zf)
    print(f"\n{'='*50}")
    print(f"  Organe map ({len(gp_map)} entries)")
    print(f"{'='*50}")
    for uid, name in sorted(gp_map.items(), key=lambda x: x[1]):
        print(f"  {uid}  →  {name}")

    print("\nBuilding deputy → party map …")
    deputy_map = build_deputy_party_map(zf, gp_map)

    print(f"\n{'='*50}")
    print(f"  Deputy party map: {len(deputy_map)} deputies resolved")
    print(f"{'='*50}")

    # Party breakdown
    from collections import Counter
    breakdown = Counter(deputy_map.values())
    print("\n  Party breakdown:")
    for party, count in breakdown.most_common():
        print(f"    {party:<50}  {count}")

    print(f"\n  Sample — Yaël Braun-Pivet: {deputy_map.get('PA721908', 'NOT FOUND')}")
    return gp_map, deputy_map


if __name__ == "__main__":
    main()
