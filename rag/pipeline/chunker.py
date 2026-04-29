"""
rag/pipeline/chunker.py

Produces two types of text chunks for embedding:
  - "vote"   : one chunk per scrutin (vote summary in French prose)
  - "deputy" : one chunk per deputy (voting record summary)

Each chunk is {"content": str, "metadata": dict}.
"""

import os
import warnings

import psycopg2
import psycopg2.extras
import tiktoken
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
TOKEN_WARN_THRESHOLD = 500

# text-embedding-3-small uses the cl100k_base tokenizer (same as ada-002)
_enc = tiktoken.get_encoding("cl100k_base")


def _count_tokens(text: str) -> int:
    return len(_enc.encode(text))


def dept_preposition(dept_name: str) -> str:
    if not dept_name:
        return "de"
    d = dept_name.strip()
    if (
        d.startswith("Hautes")
        or d.startswith("Bouches")
        or d.startswith("Alpes")
        or d.startswith("Pyrénées")
        or d.startswith("Côtes")
        or d.startswith("Landes")
        or d == "Yvelines"
        or d == "Vosges"
    ):
        return "des"
    # plain "de" for proper nouns that resist contraction
    no_contraction = {"Paris", "Mayotte", "Guadeloupe", "Martinique", "Guyane"}
    if d in no_contraction:
        return "de"
    vowels = "AEIOUÀÂÉÈÊËÎÏÔÙÛÜaeiouàâéèêëîïôùûü"
    if d[0] in vowels:
        return "de l'"
    return "du"


def _get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ---------------------------------------------------------------------------
# Strategy A — Vote chunks
# ---------------------------------------------------------------------------


def _fmt_date(dt) -> str:
    """Format a date object as JJ/MM/AAAA."""
    if dt is None:
        return "date inconnue"
    return dt.strftime("%d/%m/%Y")


def chunk_votes() -> list[dict]:
    conn = _get_conn()
    chunks = []
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT vote_id, vote_title, result, voted_at,
                       votes_for, votes_against, abstentions, total_voters
                FROM votes
                ORDER BY voted_at DESC
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    for row in rows:
        result_label = row["result"] or "résultat inconnu"
        content = (
            f"Vote du {_fmt_date(row['voted_at'])} : {row['vote_title']}.\n"
            f"Résultat : {result_label}.\n"
            f"{row['votes_for'] or 0} députés ont voté pour, "
            f"{row['votes_against'] or 0} contre, "
            f"{row['abstentions'] or 0} abstentions "
            f"sur {row['total_voters'] or 0} votants."
        )
        metadata = {
            "chunk_type": "vote",
            "vote_id": row["vote_id"],
            "voted_at": str(row["voted_at"]) if row["voted_at"] else None,
            "result": row["result"],
        }
        chunks.append({"content": content, "metadata": metadata})

    return chunks


# ---------------------------------------------------------------------------
# Strategy B — Deputy summary chunks
# ---------------------------------------------------------------------------


def chunk_deputies() -> list[dict]:
    conn = _get_conn()
    chunks = []
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.deputy_id, d.full_name, d.party, d.department,
                       COUNT(vp.position_id) AS total_votes,
                       COUNT(vp.position_id) FILTER (WHERE vp.position = 'pour')       AS pour_count,
                       COUNT(vp.position_id) FILTER (WHERE vp.position = 'contre')     AS contre_count,
                       COUNT(vp.position_id) FILTER (WHERE vp.position = 'abstention') AS abstention_count,
                       ROUND(
                           COUNT(vp.position_id)::numeric
                           / NULLIF((SELECT COUNT(*) FROM votes), 0),
                           3
                       ) AS presence_rate
                FROM deputies d
                LEFT JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
                GROUP BY d.deputy_id
                ORDER BY d.full_name
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    for row in rows:
        name = row["full_name"] or "Député inconnu"
        dept = row["department"] or "département inconnu"
        party = row["party"] or "parti non renseigné"
        total = int(row["total_votes"] or 0)
        pour = int(row["pour_count"] or 0)
        contre = int(row["contre_count"] or 0)
        abst = int(row["abstention_count"] or 0)
        rate = float(row["presence_rate"] or 0)
        rate_pct = round(rate * 100, 1)

        prep = dept_preposition(dept)
        # "de l'" already ends with apostrophe — no extra space before the noun
        sep = "" if prep.endswith("'") else " "
        content = (
            f"{name} est député(e) {prep}{sep}{dept}, membre du parti {party}.\n"
            f"Sur {total} votes enregistrés, il/elle a voté pour {pour} fois, "
            f"contre {contre} fois, abstention {abst} fois.\n"
            f"Taux de présence : {rate_pct}%."
        )
        metadata = {
            "chunk_type": "deputy",
            "deputy_id": row["deputy_id"],
            "full_name": name,
            "party": party,
            "department": dept,
        }
        chunks.append({"content": content, "metadata": metadata})

    return chunks


# ---------------------------------------------------------------------------
# Strategy C — Party summary chunks (1 chunk per parliamentary group)
# ---------------------------------------------------------------------------


def chunk_party_summaries() -> list[dict]:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.party,
                    COUNT(DISTINCT d.deputy_id) AS deputy_count,
                    COUNT(vp.position_id) FILTER (WHERE vp.position = 'pour')       AS total_pour,
                    COUNT(vp.position_id) FILTER (WHERE vp.position = 'contre')     AS total_contre,
                    COUNT(vp.position_id) FILTER (WHERE vp.position = 'abstention') AS total_abstention,
                    ROUND(AVG(
                        d2.total::numeric / NULLIF((SELECT COUNT(*) FROM votes), 0)
                    ), 3) AS avg_presence
                FROM deputies d
                LEFT JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
                LEFT JOIN (
                    SELECT deputy_id,
                           COUNT(*) AS total
                    FROM vote_positions GROUP BY deputy_id
                ) d2 ON d.deputy_id = d2.deputy_id
                WHERE d.party IS NOT NULL
                GROUP BY d.party
                ORDER BY deputy_count DESC
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    chunks = []
    for row in rows:
        party = row["party"]
        n = int(row["deputy_count"] or 0)
        pour = int(row["total_pour"] or 0)
        contre = int(row["total_contre"] or 0)
        abst = int(row["total_abstention"] or 0)
        avg_p = round(float(row["avg_presence"] or 0) * 100, 1)

        content = (
            f'Le groupe parlementaire "{party}" compte {n} députés à l\'Assemblée Nationale.\n'
            f"Sur l'ensemble des votes enregistrés, les membres de ce groupe ont voté :\n"
            f"- Pour : {pour:,} fois\n"
            f"- Contre : {contre:,} fois\n"
            f"- Abstention : {abst:,} fois\n"
            f"Taux de présence moyen du groupe : {avg_p}%."
        )
        metadata = {
            "chunk_type": "party",
            "party": party,
            "deputy_count": n,
        }
        chunks.append({"content": content, "metadata": metadata})

    return chunks


# ---------------------------------------------------------------------------
# Strategy D — Global stats chunk (1 chunk)
# ---------------------------------------------------------------------------


def chunk_global_stats() -> list[dict]:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  (SELECT COUNT(*) FROM deputies)                             AS total_deputies,
                  (SELECT COUNT(*) FROM votes)                                AS total_votes,
                  (SELECT COUNT(*) FROM vote_positions)                       AS total_positions,
                  (SELECT COUNT(*) FROM votes WHERE result = 'adopté')        AS adopted,
                  (SELECT COUNT(*) FROM votes WHERE result = 'rejeté')        AS rejected
                """
            )
            stats = cur.fetchone()

            cur.execute(
                """
                SELECT party, COUNT(*) AS count
                FROM deputies
                WHERE party IS NOT NULL
                GROUP BY party
                ORDER BY count DESC
                """
            )
            parties = cur.fetchall()

            cur.execute(
                """
                SELECT d.full_name, d.party, d.department,
                       COUNT(vp.position_id) AS total_votes,
                       ROUND(
                           COUNT(vp.position_id)::numeric
                           / NULLIF((SELECT COUNT(*) FROM votes), 0),
                           3
                       ) AS presence_rate
                FROM deputies d
                LEFT JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
                WHERE d.full_name ILIKE '%Braun-Pivet%'
                GROUP BY d.deputy_id
                LIMIT 1
                """
            )
            ybp = cur.fetchone()
    finally:
        conn.close()

    total_dep = int(stats["total_deputies"] or 0)
    total_votes = int(stats["total_votes"] or 0)
    total_pos = int(stats["total_positions"] or 0)
    adopted = int(stats["adopted"] or 0)
    rejected = int(stats["rejected"] or 0)

    party_lines = "\n".join(f"- {row['party']} : {int(row['count'])} députés" for row in parties)

    ybp_block = ""
    if ybp:
        ybp_name = ybp["full_name"]
        ybp_party = ybp["party"] or "parti non renseigné"
        ybp_dept = ybp["department"] or "département inconnu"
        ybp_votes = int(ybp["total_votes"] or 0)
        ybp_rate = round(float(ybp["presence_rate"] or 0) * 100, 1)
        prep = dept_preposition(ybp_dept)
        sep = "" if prep.endswith("'") else " "
        ybp_block = (
            f"\n{ybp_name} est la Présidente de l'Assemblée Nationale.\n"
            f"Son taux de présence est de {ybp_rate}% sur {ybp_votes} votes enregistrés.\n"
            f"Elle est membre du parti {ybp_party}, députée {prep}{sep}{ybp_dept}."
        )

    content = (
        f"MonÉlu suit {total_dep} députés de l'Assemblée Nationale française.\n"
        f"Au total, {total_votes:,} votes ont été analysés.\n"
        f"{total_pos:,} positions individuelles de vote sont enregistrées.\n"
        f"Parmi les votes : {adopted:,} ont été adoptés et {rejected:,} ont été rejetés.\n"
        f"\nRépartition par groupe parlementaire :\n{party_lines}"
        f"{ybp_block}"
    )

    metadata = {"chunk_type": "global_stats"}
    return [{"content": content, "metadata": metadata}]


# ---------------------------------------------------------------------------
# Combined
# ---------------------------------------------------------------------------


def chunk_all() -> list[dict]:
    vote_chunks = chunk_votes()
    deputy_chunks = chunk_deputies()
    party_chunks = chunk_party_summaries()
    global_chunks = chunk_global_stats()

    all_chunks = vote_chunks + deputy_chunks + party_chunks + global_chunks

    # Token accounting
    token_counts = [_count_tokens(c["content"]) for c in all_chunks]
    total_tokens = sum(token_counts)
    avg_tokens = total_tokens / len(token_counts) if token_counts else 0

    oversized = [
        (i, t, all_chunks[i]["metadata"].get("chunk_type"))
        for i, t in enumerate(token_counts)
        if t > TOKEN_WARN_THRESHOLD
    ]

    print(f"\n{'='*50}")
    print("  Chunker summary")
    print(f"{'='*50}")
    print(f"  Vote chunks    : {len(vote_chunks):>6,}")
    print(f"  Deputy chunks  : {len(deputy_chunks):>6,}")
    print(f"  Party chunks   : {len(party_chunks):>6,}")
    print(f"  Global chunks  : {len(global_chunks):>6,}")
    print(f"  Total chunks   : {len(all_chunks):>6,}")
    print(f"  Avg tokens     : {avg_tokens:>6.1f}")
    print(f"  Total tokens   : {total_tokens:>6,}")
    if oversized:
        warnings.warn(
            f"{len(oversized)} chunk(s) exceed {TOKEN_WARN_THRESHOLD} tokens "
            f"(max: {max(t for _, t, _ in oversized)} tokens).",
            stacklevel=2,
        )
    else:
        print(f"  Token check    : OK — all chunks within {TOKEN_WARN_THRESHOLD}-token limit")
    print(f"{'='*50}\n")

    return all_chunks


# ---------------------------------------------------------------------------
# CLI preview — run with: python -m rag.pipeline.chunker
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    print("Connecting to database and building chunks...")
    vote_chunks = chunk_votes()
    deputy_chunks = chunk_deputies()
    party_chunks = chunk_party_summaries()
    global_chunks = chunk_global_stats()
    all_chunks = vote_chunks + deputy_chunks + party_chunks + global_chunks

    token_counts = [_count_tokens(c["content"]) for c in all_chunks]
    total_tokens = sum(token_counts)
    avg_tokens = total_tokens / len(token_counts) if token_counts else 0

    oversized = [t for t in token_counts if t > TOKEN_WARN_THRESHOLD]

    print(f"\n{'='*56}")
    print("  CHUNKER REPORT")
    print(f"{'='*56}")
    print(f"  Vote chunks      : {len(vote_chunks):>6,}")
    print(f"  Deputy chunks    : {len(deputy_chunks):>6,}")
    print(f"  Party chunks     : {len(party_chunks):>6,}")
    print(f"  Global chunks    : {len(global_chunks):>6,}")
    print(f"  Total chunks     : {len(all_chunks):>6,}")
    print(f"  Avg tokens/chunk : {avg_tokens:>6.1f}")
    print(f"  Total tokens     : {total_tokens:>6,}")
    print(f"  Chunks > {TOKEN_WARN_THRESHOLD}t     : {len(oversized):>6,}")
    print(f"{'='*56}")

    print("\n--- SAMPLE: vote chunk ---")
    sample_vote = vote_chunks[0]
    print(f"Content:\n{sample_vote['content']}")
    print(f"Metadata: {json.dumps(sample_vote['metadata'], ensure_ascii=False, indent=2)}")
    print(f"Tokens: {_count_tokens(sample_vote['content'])}")

    print("\n--- SAMPLE: deputy chunk ---")
    braun_pivet = next(
        (c for c in deputy_chunks if "Braun-Pivet" in c["content"]),
        deputy_chunks[0],
    )
    print(f"Content:\n{braun_pivet['content']}")
    print(f"Metadata: {json.dumps(braun_pivet['metadata'], ensure_ascii=False, indent=2)}")
    print(f"Tokens: {_count_tokens(braun_pivet['content'])}")

    print("\n--- SAMPLE: global_stats chunk ---")
    gs = global_chunks[0]
    print(f"Content:\n{gs['content']}")
    print(f"Metadata: {json.dumps(gs['metadata'], ensure_ascii=False, indent=2)}")
    print(f"Tokens: {_count_tokens(gs['content'])}")

    cost_estimate = total_tokens * 0.00002 / 1000
    print(f"\n  Estimated embedding cost: ${cost_estimate:.4f}")
    print("  (text-embedding-3-small @ $0.020 per 1M tokens)\n")
