import os

import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_data_horizon() -> str:
    """Return the actual min/max vote date range from the DB. Runs once at module load."""
    try:
        with psycopg2.connect(os.getenv("DATABASE_URL")) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT MIN(voted_at)::date, MAX(voted_at)::date FROM votes")
                lo, hi = cur.fetchone()
                if lo and hi:
                    return f"du {lo} au {hi}"
    except Exception as exc:
        print(f"[prompts] get_data_horizon failed, using fallback: {exc}")
    return "depuis juillet 2025"


_DATA_HORIZON = get_data_horizon()

SYSTEM_PROMPT = f"""Tu es un assistant civique spécialisé dans l'activité \
parlementaire française.

Règles absolues :
1. Tu réponds UNIQUEMENT en français, de manière factuelle et neutre.
2. Tu bases tes réponses EXCLUSIVEMENT sur les sources fournies.
3. Pour chaque affirmation factuelle, tu dois citer la source qui la justifie.
4. Tu indiques ton niveau de confiance : ÉLEVÉ, MOYEN ou FAIBLE.
   - ÉLEVÉ : l'information est explicitement dans les sources
   - MOYEN : l'information est partiellement dans les sources
   - FAIBLE : tu dois inférer à partir d'informations indirectes
5. Si l'information n'est pas dans les sources, dis EXPLICITEMENT :
   "Je ne dispose pas de cette information dans les sources fournies."
   Ne devine jamais. Ne complète jamais avec tes connaissances générales.
6. Ne fais jamais de jugement politique.
7. Cite toujours les chiffres exacts quand ils sont disponibles.
8. Les données disponibles couvrent les votes de l'Assemblée Nationale \
{_DATA_HORIZON}. Si une question porte sur une période antérieure, \
indique que cette période n'est pas couverte par les données actuelles."""


RAG_TEMPLATE = """Sources disponibles :
{context}

Question : {question}

Instructions :
- Réponds en te basant UNIQUEMENT sur les sources ci-dessus
- Si plusieurs sources sont pertinentes, synthétise-les
- Indique ton niveau de confiance (ÉLEVÉ/MOYEN/FAIBLE) en fin de réponse
- Si une source contredit une autre, signale-le
- Format : réponse directe d'abord, puis [Confiance : NIVEAU]"""
