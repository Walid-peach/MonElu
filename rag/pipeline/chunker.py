"""
rag/pipeline/chunker.py

Produces two types of text chunks for embedding:
  - "vote"   : one chunk per scrutin (vote summary in French prose)
  - "deputy" : one chunk per deputy (voting record summary)

Each chunk is {"content": str, "metadata": dict}.
"""

import json
import os
import warnings

import psycopg2
import psycopg2.extras
import tiktoken
from dotenv import load_dotenv

# Must run before os.getenv() calls below so .env is loaded before module-level vars are set.
load_dotenv()

from rag.constants import NOTABLE_DEPUTIES  # noqa: E402

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


def chunk_votes(vote_ids: set[str] | None = None) -> list[dict]:
    conn = _get_conn()
    chunks = []
    try:
        with conn.cursor() as cur:
            if vote_ids:
                cur.execute(
                    """
                    SELECT vote_id, vote_title, result, voted_at,
                           votes_for, votes_against, abstentions, total_voters,
                           summary_plain, theme
                    FROM votes
                    WHERE vote_id = ANY(%s)
                    ORDER BY voted_at DESC
                    """,
                    (list(vote_ids),),
                )
            else:
                cur.execute(
                    """
                    SELECT vote_id, vote_title, result, voted_at,
                           votes_for, votes_against, abstentions, total_voters,
                           summary_plain, theme
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
        if row.get("summary_plain"):
            content += f"\nRésumé : {row['summary_plain']}"
        metadata = {
            "chunk_type": "vote",
            "vote_id": row["vote_id"],
            "voted_at": str(row["voted_at"]) if row["voted_at"] else None,
            "result": row["result"],
            "theme": row.get("theme"),
        }
        chunks.append({"content": content, "metadata": metadata})

    return chunks


# ---------------------------------------------------------------------------
# Strategy B — Deputy summary chunks
# ---------------------------------------------------------------------------


def chunk_deputies(deputy_ids: set[str] | None = None) -> list[dict]:
    conn = _get_conn()
    chunks = []
    _DEPUTY_SELECT = """
                SELECT d.deputy_id, d.full_name, d.party, d.department,
                       COUNT(vp.position_id) AS total_votes,
                       COUNT(vp.position_id) FILTER (WHERE vp.position = 'pour')       AS pour_count,
                       COUNT(vp.position_id) FILTER (WHERE vp.position = 'contre')     AS contre_count,
                       COUNT(vp.position_id) FILTER (WHERE vp.position = 'abstention') AS abstention_count,
                       -- canonical presence: all recorded positions (incl.
                       -- nonVotant) over votes during the mandate window —
                       -- see docs/decisions.md
                       ROUND(LEAST(
                           COUNT(vp.position_id)::numeric
                           / NULLIF((
                               SELECT COUNT(*) FROM votes v
                               WHERE (d.mandate_start IS NULL OR v.voted_at >= d.mandate_start)
                                 AND (d.mandate_end IS NULL OR v.voted_at <= d.mandate_end)
                           ), 0),
                           1
                       ), 3) AS presence_rate
                FROM deputies d
                LEFT JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
                """
    try:
        with conn.cursor() as cur:
            if deputy_ids:
                cur.execute(
                    _DEPUTY_SELECT
                    + "WHERE d.deputy_id = ANY(%s) GROUP BY d.deputy_id ORDER BY d.full_name",
                    (list(deputy_ids),),
                )
            else:
                cur.execute(_DEPUTY_SELECT + "GROUP BY d.deputy_id ORDER BY d.full_name")
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
                -- canonical presence per deputy (incl. nonVotant, mandate-
                -- windowed — see docs/decisions.md), averaged per deputy so
                -- high-vote deputies don't dominate the party mean
                WITH deputy_presence AS (
                    -- Active mandates only: group sizes and presence
                    -- averages describe the current Assemblée
                    SELECT d.deputy_id, d.party,
                           LEAST(
                               COUNT(vp.position_id)::numeric / NULLIF((
                                   SELECT COUNT(*) FROM votes v
                                   WHERE (d.mandate_start IS NULL OR v.voted_at >= d.mandate_start)
                                     AND (d.mandate_end IS NULL OR v.voted_at <= d.mandate_end)
                               ), 0),
                               1
                           ) AS presence_rate
                    FROM deputies d
                    LEFT JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
                    WHERE d.party IS NOT NULL
                      AND d.mandate_end IS NULL
                    GROUP BY d.deputy_id
                ),
                party_positions AS (
                    SELECT
                        d.party,
                        COUNT(vp.position_id) FILTER (WHERE vp.position = 'pour')       AS total_pour,
                        COUNT(vp.position_id) FILTER (WHERE vp.position = 'contre')     AS total_contre,
                        COUNT(vp.position_id) FILTER (WHERE vp.position = 'abstention') AS total_abstention
                    FROM deputies d
                    LEFT JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
                    WHERE d.party IS NOT NULL
                    GROUP BY d.party
                )
                SELECT
                    dp.party,
                    COUNT(*) AS deputy_count,
                    pp.total_pour,
                    pp.total_contre,
                    pp.total_abstention,
                    ROUND(AVG(dp.presence_rate), 3) AS avg_presence
                FROM deputy_presence dp
                JOIN party_positions pp ON pp.party = dp.party
                GROUP BY dp.party, pp.total_pour, pp.total_contre, pp.total_abstention
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
                  (SELECT COUNT(*) FROM deputies WHERE mandate_end IS NULL)   AS active_deputies,
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
                       -- canonical presence — see docs/decisions.md
                       ROUND(LEAST(
                           COUNT(vp.position_id)::numeric
                           / NULLIF((
                               SELECT COUNT(*) FROM votes v
                               WHERE (d.mandate_start IS NULL OR v.voted_at >= d.mandate_start)
                                 AND (d.mandate_end IS NULL OR v.voted_at <= d.mandate_end)
                           ), 0),
                           1
                       ), 3) AS presence_rate
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

    active_dep = int(stats["active_deputies"] or 0)
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
        f"MonÉlu suit {active_dep} députés en exercice à l'Assemblée Nationale française "
        f"({total_dep} au total sur la 17e législature, mandats terminés compris).\n"
        f"Au total, {total_votes:,} votes ont été analysés.\n"
        f"{total_pos:,} positions individuelles de vote sont enregistrées.\n"
        f"Parmi les votes : {adopted:,} ont été adoptés et {rejected:,} ont été rejetés.\n"
        f"\nRépartition par groupe parlementaire :\n{party_lines}"
        f"{ybp_block}"
    )

    metadata = {"chunk_type": "global_stats"}
    return [{"content": content, "metadata": metadata}]


# ---------------------------------------------------------------------------
# Strategy E — Notable deputy chunks (detailed vote-by-vote, top profiles)
# ---------------------------------------------------------------------------


def chunk_notable_deputies() -> list[dict]:
    deputy_ids = list(NOTABLE_DEPUTIES.keys())
    if not deputy_ids:
        return []

    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    vp.deputy_id,
                    d.full_name, d.party, d.department,
                    v.vote_id, v.vote_title, v.voted_at, v.result, vp.position,
                    CASE
                        WHEN v.vote_title ILIKE '%%financement de la sécurité sociale%%' THEN 'plfss'
                        WHEN v.vote_title ILIKE '%%projet de loi de finances%%'           THEN 'plf'
                        WHEN v.vote_title ILIKE '%%motion de censure%%'                   THEN 'censure'
                        ELSE NULL
                    END AS key_category,
                    ROW_NUMBER() OVER (
                        PARTITION BY vp.deputy_id ORDER BY v.voted_at DESC
                    ) AS recent_rn,
                    ROW_NUMBER() OVER (
                        PARTITION BY vp.deputy_id,
                        CASE
                            WHEN v.vote_title ILIKE '%%financement de la sécurité sociale%%' THEN 'plfss'
                            WHEN v.vote_title ILIKE '%%projet de loi de finances%%'           THEN 'plf'
                            WHEN v.vote_title ILIKE '%%motion de censure%%'                   THEN 'censure'
                            ELSE NULL
                        END
                        ORDER BY v.voted_at DESC
                    ) AS cat_rn
                FROM vote_positions vp
                JOIN votes v ON vp.vote_id = v.vote_id
                JOIN deputies d ON vp.deputy_id = d.deputy_id
                WHERE vp.deputy_id = ANY(%s)
                ORDER BY vp.deputy_id, v.voted_at DESC
                """,
                (deputy_ids,),
            )
            all_rows = cur.fetchall()
    finally:
        conn.close()

    # Group rows by deputy then apply per-deputy limits client-side
    by_deputy: dict[str, list] = {did: [] for did in deputy_ids}
    for row in all_rows:
        by_deputy[row["deputy_id"]].append(row)

    chunks: list[dict] = []
    for deputy_id, rows in by_deputy.items():
        info = NOTABLE_DEPUTIES[deputy_id]
        seen_vote_ids: set[str] = set()
        selected: list[dict] = []

        for row in rows:
            if row["recent_rn"] <= 15 and row["vote_id"] not in seen_vote_ids:
                selected.append(row)
                seen_vote_ids.add(row["vote_id"])

        for row in rows:
            if (
                row["key_category"] is not None
                and row["cat_rn"] <= 5
                and row["vote_id"] not in seen_vote_ids
            ):
                selected.append(row)
                seen_vote_ids.add(row["vote_id"])

        if not selected:
            continue

        first = selected[0]
        name = first["full_name"] or info["name"]
        party = first["party"] or "parti non renseigné"
        dept = first["department"] or "département inconnu"
        prep = dept_preposition(dept)
        sep = "" if prep.endswith("'") else " "

        vote_lines = "\n".join(
            f"- {row['vote_title']} ({_fmt_date(row['voted_at'])}) : "
            f"{row['position']} — vote {row['result']}"
            for row in selected
        )
        content = (
            f"{name} est député(e) {prep}{sep}{dept}, "
            f"membre du parti {party}.\n"
            f"{info['bio']}\n\n"
            f"Ses votes récents :\n{vote_lines}"
        )
        metadata = {
            "chunk_type": "notable_deputy",
            "deputy_id": deputy_id,
            "full_name": name,
            "party": party,
        }
        chunks.append({"content": content, "metadata": metadata})

    return chunks


# ---------------------------------------------------------------------------
# Combined
# ---------------------------------------------------------------------------


def chunk_all() -> list[dict]:
    vote_chunks = chunk_votes()
    deputy_chunks = chunk_deputies()
    party_chunks = chunk_party_summaries()
    global_chunks = chunk_global_stats()
    notable_chunks = chunk_notable_deputies()

    all_chunks = vote_chunks + deputy_chunks + party_chunks + global_chunks + notable_chunks

    # Token accounting
    token_counts = [_count_tokens(c["content"]) for c in all_chunks]
    total_tokens = sum(token_counts)
    avg_tokens = total_tokens / len(token_counts) if token_counts else 0

    oversized = [
        (i, t, all_chunks[i]["metadata"].get("chunk_type"))
        for i, t in enumerate(token_counts)
        if t > TOKEN_WARN_THRESHOLD
    ]

    print(f"\n{'=' * 50}")
    print("  Chunker summary")
    print(f"{'=' * 50}")
    print(f"  Vote chunks    : {len(vote_chunks):>6,}")
    print(f"  Deputy chunks  : {len(deputy_chunks):>6,}")
    print(f"  Party chunks   : {len(party_chunks):>6,}")
    print(f"  Global chunks  : {len(global_chunks):>6,}")
    print(f"  Notable chunks : {len(notable_chunks):>6,}")
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
    print(f"{'=' * 50}\n")

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
    notable_chunks = chunk_notable_deputies()
    all_chunks = vote_chunks + deputy_chunks + party_chunks + global_chunks + notable_chunks

    token_counts = [_count_tokens(c["content"]) for c in all_chunks]
    total_tokens = sum(token_counts)
    avg_tokens = total_tokens / len(token_counts) if token_counts else 0

    oversized = [t for t in token_counts if t > TOKEN_WARN_THRESHOLD]

    print(f"\n{'=' * 56}")
    print("  CHUNKER REPORT")
    print(f"{'=' * 56}")
    print(f"  Vote chunks      : {len(vote_chunks):>6,}")
    print(f"  Deputy chunks    : {len(deputy_chunks):>6,}")
    print(f"  Party chunks     : {len(party_chunks):>6,}")
    print(f"  Global chunks    : {len(global_chunks):>6,}")
    print(f"  Notable chunks   : {len(notable_chunks):>6,}")
    print(f"  Total chunks     : {len(all_chunks):>6,}")
    print(f"  Avg tokens/chunk : {avg_tokens:>6.1f}")
    print(f"  Total tokens     : {total_tokens:>6,}")
    print(f"  Chunks > {TOKEN_WARN_THRESHOLD}t     : {len(oversized):>6,}")
    print(f"{'=' * 56}")

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
