"""
Display labels for a bill's derived status and its reading stages (ADR-035 §5).

The API returns `status` as one of seven derived values and `current_stage`
(and each top-level parcours acte) as the AN's `codeActe`. Clients show both in
words; this is the one copy of those words, exported to
`data/reference/dossier_statuses.json` and `dossier_stages.json` for the iOS
app (ADR-041 §4) by `scripts/export_reference_data.py`.
"""

DOSSIER_STATUS_LABELS: dict[str, str] = {
    "promulguee": "Promulguée",
    "conseil_constitutionnel": "Devant le Conseil constitutionnel",
    "rejetee": "Rejetée",
    "adoptee_definitivement": "Adoptée définitivement",
    "deposee": "Déposée",
    "en_commission": "En commission",
    "en_navette": "En navette parlementaire",
}

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
