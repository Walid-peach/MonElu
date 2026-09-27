# Reference data

Small tables that the API, the website and the iOS app all need (ADR-041 §4).

| File | Source | How it stays correct |
|------|--------|----------------------|
| `departments.json` | `api/departments_data.py` | Generated; `tests/unit/test_reference_data.py` fails on drift |
| `groups.json` | `api/groups_data.py` | Generated; same test |
| `themes.json` | `api/themes_data.py` | Generated; same test |
| `vote_positions.json` | Written by hand | `frontend/__tests__/lib/reference-data.test.ts` checks it against `frontend/src/lib/vote-position.ts` |

Regenerate after changing any of the Python sources:

```sh
python scripts/export_reference_data.py
```

The website still keeps its own copies in `frontend/src/lib/`, because the frontend imports nothing from outside `frontend/` (#356).
`frontend/__tests__/lib/reference-data.test.ts` reads these files at test time only, and fails when a copy disagrees.
The iOS app bundles them directly.

Every file is a JSON array, not an object, so the order survives decoders that do not keep key order.
