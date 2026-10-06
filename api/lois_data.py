"""
Display labels for a bill's derived status and its reading stages (ADR-035 §5).

The API returns `status` as one of seven derived values and `current_stage`
(and each top-level parcours acte) as the AN's `codeActe`. Clients show both in
words; this is the one copy of those words, exported to
`data/reference/dossier_statuses.json` and `dossier_stages.json` for the iOS
app (ADR-041 §4) by `scripts/export_reference_data.py`.
"""

# The citizen-facing label of each derived status, in ADR-035 §5's rule order.
# Keys are exactly api.routers.lois.DOSSIER_STATUSES (pinned by
# tests/unit/test_reference_data.py).
DOSSIER_STATUS_LABELS: dict[str, str] = {
    "promulguee": "Promulguée",
    "conseil_constitutionnel": "Devant le Conseil constitutionnel",
    "rejetee": "Rejetée",
    "adoptee_definitivement": "Adoptée définitivement",
    "deposee": "Déposée",
    "en_commission": "En commission",
    "en_navette": "En navette parlementaire",
}

# A top-level codeActe -> (the step of the AN, Sénat, CMP, loi sequence it
# belongs to, a short label for it). Only codes that are a step of that
# sequence: AN20 and AN21 (a debate, not a reading) are left out, and a client
# shows no stage strip for them.
DOSSIER_STAGES: dict[str, tuple[str, str]] = {
    "AN1": ("an", "1re lecture"),
    "AN2": ("an", "2e lecture"),
    "ANNLEC": ("an", "Nouvelle lecture"),
    "ANLUNI": ("an", "Lecture unique"),
    "ANLDEF": ("an", "Lecture définitive"),
    "SN1": ("senat", "1re lecture"),
    "SN2": ("senat", "2e lecture"),
    "SNNLEC": ("senat", "Nouvelle lecture"),
    "CMP": ("cmp", "Commission mixte paritaire"),
    "CC": ("loi", "Conseil constitutionnel"),
    "PROM": ("loi", "Promulgation"),
}
