"""
scripts/explore_organes.py

Explores the AN open-data exports to locate organe (political group) data.
Tries two sources:
  1. The deputies ZIP (already known URL) — inspect its internal structure
  2. A dedicated organes ZIP (AMO30_tous_les_organes.json.zip)

Prints raw JSON structure so we can identify correct field names before parsing.
"""

import io
import json
import sys
import zipfile

import requests
from dotenv import load_dotenv

load_dotenv()

AN_BASE = "https://data.assemblee-nationale.fr"

CANDIDATES = [
    # Known deputies+organes ZIP (already used for ingestion)
    "/static/openData/repository/17/amo/deputes_actifs_mandats_actifs_organes"
    "/AMO10_deputes_actifs_mandats_actifs_organes.json.zip",
    # Dedicated organes export (17th legislature)
    "/static/openData/repository/17/amo/tous_les_organes" "/AMO30_tous_les_organes.json.zip",
    # Alternative naming
    "/static/openData/repository/17/amo/tous_les_organes" "/AMO20_tous_les_organes.json.zip",
    "/static/openData/repository/17/amo/organes" "/AMO30_organes.json.zip",
]


def try_download(path: str) -> bytes | None:
    url = AN_BASE + path
    print(f"  Trying: {url}")
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 200:
            print(f"  ✓ OK — {len(r.content):,} bytes")
            return r.content
        print(f"  ✗ HTTP {r.status_code}")
    except Exception as e:
        print(f"  ✗ Error: {e}")
    return None


def inspect_zip(raw: bytes, label: str) -> None:
    print(f"\n{'='*60}")
    print(f"  ZIP contents — {label}")
    print(f"{'='*60}")

    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = zf.namelist()
        print(f"\n  Files in ZIP ({len(names)} total):")
        for n in names[:30]:
            info = zf.getinfo(n)
            print(f"    {n:<60}  {info.file_size:>8,} B")
        if len(names) > 30:
            print(f"    ... and {len(names) - 30} more")

        # Look for organe-type files
        organe_files = [n for n in names if "organe" in n.lower() and n.endswith(".json")]
        print(f"\n  Files containing 'organe' in name: {len(organe_files)}")

        # Find GP (Groupe Parlementaire) entries
        gp_samples = []
        parpol_samples = []
        other_types = {}

        for fname in names:
            if not fname.endswith(".json"):
                continue
            try:
                data = json.loads(zf.read(fname))
            except Exception:
                continue

            # The data might be nested under a key or be a list
            # Normalise to list of organe-like dicts
            candidates = []
            if isinstance(data, dict):
                # Look for common wrapper keys
                for key in ("organe", "acteur", "Organe", "Acteur", "export"):
                    if key in data:
                        inner = data[key]
                        candidates = inner if isinstance(inner, list) else [inner]
                        break
                else:
                    # No known wrapper — treat the dict itself
                    candidates = [data]
            elif isinstance(data, list):
                candidates = data

            for item in candidates:
                if not isinstance(item, dict):
                    continue
                code_type = (
                    item.get("codeType")
                    or item.get("typeOrgane")
                    or item.get("type")
                    or (item.get("organe") or {}).get("codeType")
                    or ""
                )
                if code_type == "GP" and len(gp_samples) < 3:
                    gp_samples.append((fname, item))
                elif code_type == "PARPOL" and len(parpol_samples) < 2:
                    parpol_samples.append((fname, item))
                elif code_type:
                    other_types[code_type] = other_types.get(code_type, 0) + 1

        print("\n  organe types found (sample):")
        for t, c in sorted(other_types.items(), key=lambda x: -x[1])[:15]:
            print(f"    {t:<20} {c:>4} entries")

        if gp_samples:
            print(f"\n{'='*60}")
            print(f"  GP (Groupe Parlementaire) samples — {len(gp_samples)} found")
            print(f"{'='*60}")
            for fname, item in gp_samples:
                print(f"\n  File: {fname}")
                print(json.dumps(item, ensure_ascii=False, indent=2)[:2000])

        if parpol_samples:
            print(f"\n{'='*60}")
            print(f"  PARPOL samples — {len(parpol_samples)} found")
            print(f"{'='*60}")
            for fname, item in parpol_samples:
                print(f"\n  File: {fname}")
                print(json.dumps(item, ensure_ascii=False, indent=2)[:1000])

        if not gp_samples and not parpol_samples:
            # No GP found — print first 3 JSON files raw to understand structure
            print("\n  No GP/PARPOL found. Printing first 3 JSON files raw:")
            count = 0
            for fname in names:
                if not fname.endswith(".json"):
                    continue
                try:
                    data = json.loads(zf.read(fname))
                    print(f"\n  --- {fname} ---")
                    print(json.dumps(data, ensure_ascii=False, indent=2)[:1500])
                    count += 1
                    if count >= 3:
                        break
                except Exception:
                    continue

        return gp_samples


if __name__ == "__main__":
    print("=== AN Organes Explorer ===\n")

    found_raw = None
    found_label = None

    for path in CANDIDATES:
        print("\nTrying candidate:")
        raw = try_download(path)
        if raw:
            found_raw = raw
            found_label = path.split("/")[-1]
            break

    if not found_raw:
        print("\nAll candidates failed. Trying index page...")
        # Try to find the correct URL from the portal index
        index_url = f"{AN_BASE}/static/openData/repository/17/amo/"
        try:
            r = requests.get(index_url, timeout=30)
            print(f"Index page HTTP {r.status_code}")
            if r.status_code == 200:
                import re

                zips = re.findall(r'href="([^"]*\.zip)"', r.text)
                print("ZIP files listed on index page:")
                for z in zips:
                    print(f"  {z}")
        except Exception as e:
            print(f"Index page error: {e}")
        sys.exit(1)

    inspect_zip(found_raw, found_label)
