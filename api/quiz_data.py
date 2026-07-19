"""
api/quiz_data.py

Curated question set for the vote-matching quiz (MON-109, ADR-025).

This file is the single source of truth for the quiz: a versioned, repo-committed
editorial artifact updated quarterly by PR — never a DB table, never fetched from
the AN portal at runtime. The frontend reads it through GET /quiz/questions.

Every vote_id must exist in the production votes table (prod holds scrutins from
2025-07-01 onward). Full selection criteria, phrasing rules, and the quarterly
refresh process are documented in docs/quiz-curation.md (MON-136) — read that
before touching this list.
"""

QUIZ_VERSION = "2026-Q3"

# Each entry: the scrutin, a neutral plain-French question, a one-line context
# sentence, and a short theme tag for the UI. Question phrasing must stay
# descriptive of what the text does — no leading or evaluative wording.
QUIZ_QUESTIONS: list[dict] = [
    {
        "vote_id": "VTANR5L17V8280",
        "theme": "Fin de vie",
        "question": "Auriez-vous voté pour ou contre la création d'un droit à l'aide à mourir ?",
        "context": (
            "Proposition de loi relative au droit à l'aide à mourir, "
            "adoptée en lecture définitive le 15 juillet 2026."
        ),
    },
    {
        "vote_id": "VTANR5L17V4758",
        "theme": "Protection sociale",
        "question": ("Auriez-vous voté pour ou contre le budget 2026 de la Sécurité sociale ?"),
        "context": (
            "Projet de loi de financement de la sécurité sociale pour 2026, "
            "adopté en lecture définitive le 16 décembre 2025."
        ),
    },
    {
        "vote_id": "VTANR5L17V2957",
        "theme": "Agriculture",
        "question": (
            "Auriez-vous voté pour ou contre la loi levant certaines contraintes "
            "à l'exercice du métier d'agriculteur ?"
        ),
        "context": (
            "Proposition de loi visant à lever les contraintes à l'exercice du métier "
            "d'agriculteur, adoptée le 8 juillet 2025 (texte de la commission mixte paritaire)."
        ),
    },
    {
        "vote_id": "VTANR5L17V7454",
        "theme": "Institutions",
        "question": (
            "Auriez-vous voté pour ou contre l'autonomie de la Corse au sein de la République ?"
        ),
        "context": (
            "Projet de loi constitutionnelle pour une Corse autonome au sein de la "
            "République, adopté en première lecture le 23 juin 2026."
        ),
    },
    {
        "vote_id": "VTANR5L17V6184",
        "theme": "Économie",
        "question": (
            "Auriez-vous voté pour ou contre la loi de simplification de la vie économique ?"
        ),
        "context": (
            "Projet de loi de simplification de la vie économique, adopté le 14 avril 2026 "
            "(texte de la commission mixte paritaire)."
        ),
    },
    {
        "vote_id": "VTANR5L17V6319",
        "theme": "Finances publiques",
        "question": (
            "Auriez-vous voté pour ou contre le renforcement de la lutte contre "
            "les fraudes sociales et fiscales ?"
        ),
        "context": (
            "Projet de loi relatif à la lutte contre les fraudes sociales et fiscales, "
            "adopté le 5 mai 2026 (texte de la commission mixte paritaire)."
        ),
    },
    {
        "vote_id": "VTANR5L17V7987",
        "theme": "Sécurité",
        "question": (
            "Auriez-vous voté pour ou contre une présomption de légitime défense "
            "pour les forces de l'ordre ?"
        ),
        "context": (
            "Proposition de loi reconnaissant une présomption de légitime défense aux "
            "forces de l'ordre dans l'exercice de leurs fonctions, adoptée en première "
            "lecture le 7 juillet 2026."
        ),
    },
    {
        "vote_id": "VTANR5L17V3182",
        "theme": "Outre-mer",
        "question": (
            "Auriez-vous voté pour ou contre le report des élections provinciales "
            "en Nouvelle-Calédonie ?"
        ),
        "context": (
            "Loi organique reportant le renouvellement du congrès et des assemblées de "
            "province de la Nouvelle-Calédonie pour poursuivre les discussions sur son "
            "avenir institutionnel, adoptée le 28 octobre 2025."
        ),
    },
    {
        "vote_id": "VTANR5L17V2958",
        "theme": "Justice",
        "question": (
            "Auriez-vous voté pour ou contre l'extension du maintien en rétention des "
            "personnes condamnées pour des faits graves ?"
        ),
        "context": (
            "Proposition de loi facilitant le maintien en rétention des personnes condamnées "
            "pour des faits d'une particulière gravité et présentant de forts risques de "
            "récidive, adoptée en première lecture le 8 juillet 2025."
        ),
    },
    {
        "vote_id": "VTANR5L17V7408",
        "theme": "Logement",
        "question": (
            "Auriez-vous voté pour ou contre la loi facilitant l'accès au logement "
            "des travailleurs des services publics ?"
        ),
        "context": (
            "Proposition de loi visant à améliorer l'accès au logement des travailleurs "
            "des services publics, adoptée le 17 juin 2026 (texte de la commission "
            "mixte paritaire)."
        ),
    },
]

QUIZ_VOTE_IDS: frozenset[str] = frozenset(q["vote_id"] for q in QUIZ_QUESTIONS)
