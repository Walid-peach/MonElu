"""
api/app_config_data.py
What `GET /app/config` serves to native clients (ADR-041 §5, #438).

A shipped app binary cannot be redeployed and a release waits for App Review,
so three things the app would otherwise hardcode live here instead:

* the minimum app version the API still supports, so a breaking change can
  force an update rather than strand old installs;
* feature switches, so a failing dependency (chat and verify run on Groq's free
  tier) can be switched off in minutes instead of days;
* the caveats and data horizon the app shows beside its numbers, so their
  wording can change without an app release.

The caveat texts are the ones the website prints through `CAVEATS` in
`frontend/src/lib/llms.ts`, keyed by a stable id so the app can place each one
next to the number it qualifies. Keep the two in step: #439 adds a drift test
between them.

Every value has a code default; the operator overrides the switches and the
minimum version through environment variables on Railway, which takes effect
on the next deploy or restart.
"""

import logging
import os
import re

logger = logging.getLogger(__name__)

# Production holds scrutins from this date onward (Supabase free tier, CLAUDE.md
# decision 7). The legislature itself began on 2024-07-07.
DATA_HORIZON = "2025-07-01"

DEFAULT_MIN_IOS_VERSION = "1.0.0"

# Semantic version without pre-release or build suffixes: the comparison the app
# does is numeric, component by component.
_VERSION = re.compile(r"\d+\.\d+\.\d+")

# Features that depend on a third party the API does not control. Each maps to
# the env var that switches it off.
FEATURE_ENV_VARS = {
    "chat": "APP_FEATURE_CHAT",
    "verify": "APP_FEATURE_VERIFY",
}

_FALSE = {"0", "false", "no", "off"}
_TRUE = {"1", "true", "yes", "on"}

# (id, text), in the order the website lists them. Markdown emphasis and code
# spans are kept as written: SwiftUI renders inline Markdown natively.
CAVEATS: list[tuple[str, str]] = [
    (
        "non_votant",
        "`nonVotant` n'est pas `abstention`. Un non-votant était présent dans "
        "l'hémicycle sans exprimer de vote ; une abstention est une position exprimée. "
        "Les pourcentages pour/contre/abstention se calculent sur les seules positions "
        "exprimées.",
    ),
    (
        "presence_rate",
        "Le taux de présence compte le `nonVotant` comme présent, et son dénominateur "
        "est limité aux scrutins tenus pendant le mandat du député - un député élu en "
        "cours de législature n'est pas pénalisé pour les votes antérieurs.",
    ),
    (
        "president_presence",
        "Yaël Braun-Pivet affiche 100 % de présence parce qu'elle préside l'Assemblée "
        "et figure sur chaque scrutin par construction des données source. Ce n'est pas "
        "une performance, et ce n'est pas une anomalie.",
    ),
    (
        "data_horizon",
        "La base de production couvre les scrutins depuis le **1er juillet 2025**. La "
        "XVIIe législature a commencé le 7 juillet 2024 ; l'historique antérieur existe "
        "en développement mais n'est pas servi ici.",
    ),
    (
        "group_alignment",
        "L'alignement de groupe compare tout l'historique d'un député à son groupe "
        "**actuel**, même s'il en a changé en cours de mandat.",
    ),
    (
        "vote_result",
        "Le résultat d'un scrutin (adopté / rejeté) est repris tel quel de l'Assemblée "
        "nationale, jamais recalculé.",
    ),
    (
        "deputy_count",
        "Le compteur « députés suivis » dépasse 577 : il dénombre toutes les personnes "
        "ayant siégé depuis le début de la législature, remplacements compris.",
    ),
    (
        "llm_generated",
        "Les résumés en langage clair et les réponses de l'assistant sont générés par "
        "un LLM. Ce sont des aides à la lecture, pas des sources - le scrutin d'origine "
        "fait foi.",
    ),
]


def min_ios_version() -> str:
    """The oldest iOS app version the API still serves correctly.

    A malformed override is ignored with a warning rather than served: an app
    that cannot parse the value would either block every user or none, and the
    code default is the safer of the two.
    """
    raw = os.getenv("APP_MIN_IOS_VERSION", "").strip()
    if not raw:
        return DEFAULT_MIN_IOS_VERSION
    if not _VERSION.fullmatch(raw):
        logger.warning(
            "APP_MIN_IOS_VERSION=%r is not MAJOR.MINOR.PATCH - serving %s",
            raw,
            DEFAULT_MIN_IOS_VERSION,
        )
        return DEFAULT_MIN_IOS_VERSION
    return raw


def feature_enabled(name: str) -> bool:
    """True unless the feature's env var switches it off.

    On by default so a missing variable never silently disables a feature; an
    unrecognised value keeps it on, with a warning, for the same reason.
    """
    raw = os.getenv(FEATURE_ENV_VARS[name], "").strip().lower()
    if not raw or raw in _TRUE:
        return True
    if raw in _FALSE:
        return False
    logger.warning("%s=%r is not a boolean - keeping %s on", FEATURE_ENV_VARS[name], raw, name)
    return True


def app_config() -> dict:
    """The full `GET /app/config` payload."""
    return {
        "min_ios_version": min_ios_version(),
        "features": {name: feature_enabled(name) for name in FEATURE_ENV_VARS},
        "data_horizon": DATA_HORIZON,
        "caveats": [{"id": cid, "text": text} for cid, text in CAVEATS],
    }
