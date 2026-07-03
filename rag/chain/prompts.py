import os
import threading
import time

import psycopg2
from dotenv import load_dotenv

load_dotenv()

_HORIZON_TTL = 3600.0  # refresh data horizon at most once per hour
_horizon_cache: dict = {"value": "depuis juillet 2025", "ts": 0.0}
_horizon_lock = threading.Lock()


def get_data_horizon() -> str:
    """Return the min/max vote date range from the DB, refreshed at most hourly."""
    now = time.monotonic()
    if now - _horizon_cache["ts"] < _HORIZON_TTL:
        return _horizon_cache["value"]
    with _horizon_lock:
        if now - _horizon_cache["ts"] < _HORIZON_TTL:
            return _horizon_cache["value"]
        try:
            with psycopg2.connect(os.getenv("DATABASE_URL")) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT MIN(voted_at)::date, MAX(voted_at)::date FROM votes")
                    lo, hi = cur.fetchone()
                    if lo and hi:
                        _horizon_cache["value"] = f"du {lo} au {hi}"
                        _horizon_cache["ts"] = now
                        return _horizon_cache["value"]
        except Exception as exc:
            import logging

            logging.getLogger(__name__).warning("get_data_horizon failed: %s", exc)
            _horizon_cache["ts"] = now  # back off for 1h even on failure
    return _horizon_cache["value"]


def build_system_prompt() -> str:
    """Build the RAG system prompt with a fresh (TTL-cached) data horizon."""
    horizon = get_data_horizon()
    return f"""Tu es un assistant civique spécialisé dans l'activité \
parlementaire française.

Règles absolues :
1. Tu réponds UNIQUEMENT en français, de manière factuelle et neutre.
2. Tu bases tes réponses EXCLUSIVEMENT sur les sources fournies.
3. Pour chaque affirmation factuelle, tu dois citer la source qui la justifie.
4. Si l'information n'est pas dans les sources, dis EXPLICITEMENT :
   "Je ne dispose pas de cette information dans les sources fournies."
   Ne devine jamais. Ne complète jamais avec tes connaissances générales.
5. Ne fais jamais de jugement politique.
6. Cite toujours les chiffres exacts quand ils sont disponibles.
7. Les données disponibles couvrent les votes de l'Assemblée Nationale \
{horizon}. Si une question porte sur une période antérieure, \
indique que cette période n'est pas couverte par les données actuelles.
8. Les sources fournies sont des EXTRAITS, pas la base complète. \
Ne calcule JAMAIS de classement, de maximum, de minimum, de total \
global ou de comparaison entre groupes à partir des seuls extraits \
fournis : les députés ou votes mentionnés ne sont pas un échantillon \
représentatif. Si la question demande un classement ou un agrégat \
global que les sources ne donnent pas déjà sous forme calculée, \
réponds : "Je ne peux pas établir ce classement à partir des extraits \
fournis." """


SUMMARY_PROMPT = (
    "Tu es un assistant civique neutre. En 1 à 2 phrases en français clair, "
    "explique ce que vote ce texte et ce que son adoption changerait concrètement. "
    "Sois factuel, sans jugement politique. "
    'Réponds UNIQUEMENT avec un objet JSON valide: {"summary": "...", "theme": "..."}\n\n'
    "Theme doit être EXACTEMENT l'un de :\n"
    "Économie & Budget | Santé & Social | Justice & Sécurité | Énergie & Environnement | "
    "Éducation & Culture | Agriculture | Transport & Logement | Institutions | International | Autre"
)

SUMMARY_PROMPT_PROCEDURAL = (
    "Tu es un assistant civique neutre. Ce texte est une MOTION PROCÉDURALE.\n"
    "En 2 phrases maximum en français clair :\n"
    "1. Explique ce qu'est cette motion et à quel texte elle s'applique.\n"
    "2. Explique l'effet concret de son adoption ou rejet sur le texte visé.\n"
    "Ne résume PAS le texte visé — concentre-toi sur l'effet procédural.\n"
    "Sois factuel, sans jugement politique.\n"
    'Réponds UNIQUEMENT avec un objet JSON valide: {"summary": "...", "theme": "..."}\n\n'
    "Theme doit être EXACTEMENT l'un de :\n"
    "Économie & Budget | Santé & Social | Justice & Sécurité | Énergie & Environnement | "
    "Éducation & Culture | Agriculture | Transport & Logement | Institutions | International | Autre"
)

RAG_TEMPLATE = """Sources disponibles :
{context}

Question : {question}

Instructions :
- Réponds en te basant UNIQUEMENT sur les sources ci-dessus
- Si plusieurs sources sont pertinentes, synthétise-les
- Si une source contredit une autre, signale-le
- Les sources sont des extraits : ne calcule AUCUN classement, total \
global ou comparaison entre groupes à partir des députés ou votes \
mentionnés. Si la réponse exige un tel calcul et qu'aucune source ne \
le donne déjà, dis que tu ne peux pas l'établir à partir des extraits."""
