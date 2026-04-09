"""
scripts/update_party.py

Steps 3 + 4:
  - Updates deputies.party using the GP mapping from ingest_organes.py
  - Updates deputies.department codes → full French names

Run: venv/bin/python3 scripts/update_party.py
"""

import os
from collections import Counter

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# ---------------------------------------------------------------------------
# Step 4 data — department code → full name
# ---------------------------------------------------------------------------
DEPT_NAMES = {
    "01": "Ain", "02": "Aisne", "03": "Allier", "04": "Alpes-de-Haute-Provence",
    "05": "Hautes-Alpes", "06": "Alpes-Maritimes", "07": "Ardèche", "08": "Ardennes",
    "09": "Ariège", "10": "Aube", "11": "Aude", "12": "Aveyron",
    "13": "Bouches-du-Rhône", "14": "Calvados", "15": "Cantal", "16": "Charente",
    "17": "Charente-Maritime", "18": "Cher", "19": "Corrèze", "2A": "Corse-du-Sud",
    "2B": "Haute-Corse", "21": "Côte-d'Or", "22": "Côtes-d'Armor", "23": "Creuse",
    "24": "Dordogne", "25": "Doubs", "26": "Drôme", "27": "Eure",
    "28": "Eure-et-Loir", "29": "Finistère", "30": "Gard", "31": "Haute-Garonne",
    "32": "Gers", "33": "Gironde", "34": "Hérault", "35": "Ille-et-Vilaine",
    "36": "Indre", "37": "Indre-et-Loire", "38": "Isère", "39": "Jura",
    "40": "Landes", "41": "Loir-et-Cher", "42": "Loire", "43": "Haute-Loire",
    "44": "Loire-Atlantique", "45": "Loiret", "46": "Lot", "47": "Lot-et-Garonne",
    "48": "Lozère", "49": "Maine-et-Loire", "50": "Manche", "51": "Marne",
    "52": "Haute-Marne", "53": "Mayenne", "54": "Meurthe-et-Moselle", "55": "Meuse",
    "56": "Morbihan", "57": "Moselle", "58": "Nièvre", "59": "Nord",
    "60": "Oise", "61": "Orne", "62": "Pas-de-Calais", "63": "Puy-de-Dôme",
    "64": "Pyrénées-Atlantiques", "65": "Hautes-Pyrénées", "66": "Pyrénées-Orientales",
    "67": "Bas-Rhin", "68": "Haut-Rhin", "69": "Rhône", "70": "Haute-Saône",
    "71": "Saône-et-Loire", "72": "Sarthe", "73": "Savoie", "74": "Haute-Savoie",
    "75": "Paris", "76": "Seine-Maritime", "77": "Seine-et-Marne",
    "78": "Yvelines", "79": "Deux-Sèvres", "80": "Somme", "81": "Tarn",
    "82": "Tarn-et-Garonne", "83": "Var", "84": "Vaucluse", "85": "Vendée",
    "86": "Vienne", "87": "Haute-Vienne", "88": "Vosges", "89": "Yonne",
    "90": "Territoire de Belfort", "91": "Essonne", "92": "Hauts-de-Seine",
    "93": "Seine-Saint-Denis", "94": "Val-de-Marne", "95": "Val-d'Oise",
    "971": "Guadeloupe", "972": "Martinique", "973": "Guyane",
    "974": "La Réunion", "976": "Mayotte",
    "99": "Français établis hors de France",
}


def update_parties(conn, deputy_map: dict[str, str]) -> None:
    print(f"\nUpdating party for {len(deputy_map)} deputies …")
    rows = [(party, deputy_id) for deputy_id, party in deputy_map.items()]
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE deputies SET party = %s WHERE deputy_id = %s",
            rows,
            page_size=200,
        )
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM deputies WHERE party IS NULL")
        null_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM deputies WHERE party IS NOT NULL")
        filled_count = cur.fetchone()[0]

    print(f"  Updated : {filled_count}")
    print(f"  Still NULL: {null_count}")


def update_departments(conn) -> None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT deputy_id, department FROM deputies")
        deputies = cur.fetchall()

    to_update = []
    for d in deputies:
        code = (d["department"] or "").strip()
        full_name = DEPT_NAMES.get(code)
        if full_name:
            to_update.append((full_name, d["deputy_id"]))

    print(f"\nUpdating department names for {len(to_update)} deputies …")
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE deputies SET department = %s WHERE deputy_id = %s",
            to_update,
            page_size=200,
        )
    conn.commit()
    print(f"  Done — {len(to_update)} departments expanded to full names.")


def print_summary(conn) -> None:
    print(f"\n{'='*56}")
    print("  VERIFICATION")
    print(f"{'='*56}")

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        print("\n  Party breakdown:")
        cur.execute(
            "SELECT party, COUNT(*) as n FROM deputies GROUP BY party ORDER BY n DESC"
        )
        for r in cur.fetchall():
            label = r["party"] or "(NULL)"
            print(f"    {label:<50}  {r['n']}")

        print("\n  Top 10 departments:")
        cur.execute(
            "SELECT department, COUNT(*) as n FROM deputies GROUP BY department ORDER BY n DESC LIMIT 10"
        )
        for r in cur.fetchall():
            print(f"    {(r['department'] or 'NULL'):<35}  {r['n']}")

        print("\n  Yaël Braun-Pivet:")
        cur.execute(
            "SELECT full_name, party, department FROM deputies WHERE full_name LIKE '%Braun-Pivet%'"
        )
        for r in cur.fetchall():
            print(f"    name       : {r['full_name']}")
            print(f"    party      : {r['party']}")
            print(f"    department : {r['department']}")


if __name__ == "__main__":
    # Import here so the ZIP is only downloaded once
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from scripts.ingest_organes import download_zip, build_gp_map, build_deputy_party_map

    zf = download_zip()
    gp_map = build_gp_map(zf)
    deputy_map = build_deputy_party_map(zf, gp_map)

    print(f"\n  GP map: {len(gp_map)} organes")
    print(f"  Deputy→party: {len(deputy_map)} resolved")

    conn = psycopg2.connect(DATABASE_URL)
    try:
        update_parties(conn, deputy_map)
        update_departments(conn)
        print_summary(conn)
    finally:
        conn.close()

    print("\nDone.")
