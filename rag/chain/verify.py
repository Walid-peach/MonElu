"""
rag/chain/verify.py

Claim-verification chain (MON-126, ADR-022): given a claim about a deputy's
votes, retrieve candidate scrutins, join the named deputy's actual recorded
positions, and ask Groq for a structured verdict. Every cited vote_id is
validated against the votes table in code — the LLM can only cite scrutins
that were fetched from the DB, never fabricate one.

Hard guards force the "inverifiable" verdict (never a guess) when:
  - retrieval finds nothing relevant (top similarity below floor),
  - the LLM output fails to parse or uses an unknown verdict,
  - a vrai/faux/trompeur verdict cites no valid scrutin.
"""

import json
import logging
import os
import re
import threading
import time

import psycopg2.extras
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

from rag.chain.prompts import (  # noqa: E402
    VERIFY_TEMPLATE,
    build_verify_system_prompt,
)
from rag.chain.rag_chain import compute_confidence  # noqa: E402
from rag.chain.retriever import retrieve  # noqa: E402
from rag.chain.sql_router import _get_pool  # noqa: E402
from rag.constants import LLM_MODEL  # noqa: E402

log = logging.getLogger(__name__)

_groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"), timeout=30.0)

VERDICTS = {"vrai", "faux", "trompeur", "inverifiable"}

# ADR-016: confidence comes from retrieval quality; ADR-022 exposes the
# French labels in VerifyResponse.
CONFIDENCE_LABELS = {"high": "ÉLEVÉ", "medium": "MOYEN", "low": "FAIBLE"}

# Below this top similarity the candidates are noise — skip the LLM entirely.
MIN_TOP_SIMILARITY = 0.35

# How many vote chunks to consider as candidate scrutins.
CANDIDATE_K = 8

_INVERIFIABLE_NO_MATCH = (
    "Aucun scrutin de la base MonÉlu ne correspond suffisamment à cette "
    "affirmation pour la confirmer ou l'infirmer."
)
_INVERIFIABLE_PARSE = (
    "L'analyse automatique n'a pas produit de verdict exploitable pour cette "
    "affirmation. Réessayez en reformulant l'affirmation."
)
_INVERIFIABLE_NO_CITATION = (
    " Aucun scrutin précis n'a pu être cité à l'appui : le verdict est donc "
    "invérifiable avec nos données."
)

_DEPUTY_TTL = 3600.0  # refresh the deputy name map at most once per hour
_deputy_cache: dict = {"value": None, "ts": 0.0}
_deputy_lock = threading.Lock()


def get_deputy_map() -> dict:
    """{deputy_id: {"full_name", "party"}} for every deputy (incl. past mandates)."""
    now = time.monotonic()
    if _deputy_cache["value"] is not None and now - _deputy_cache["ts"] < _DEPUTY_TTL:
        return _deputy_cache["value"]
    with _deputy_lock:
        if _deputy_cache["value"] is not None and now - _deputy_cache["ts"] < _DEPUTY_TTL:
            return _deputy_cache["value"]
        pool = _get_pool()
        conn = pool.getconn()
        broken = False
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT deputy_id, full_name, party FROM deputies")
                result = {
                    r["deputy_id"]: {"full_name": r["full_name"], "party": r["party"]}
                    for r in cur.fetchall()
                }
            _deputy_cache["value"] = result
            _deputy_cache["ts"] = now
            return result
        except Exception:
            broken = True
            raise
        finally:
            pool.putconn(conn, close=broken)


def detect_deputy(claim: str, deputy_map: dict) -> str | None:
    """Identify the deputy a claim names.

    Full-name match wins outright; otherwise a last-name match (final word of
    full_name, same heuristic as retriever.detect_notable_deputy) — but only
    when it is unambiguous. Several deputies sharing the matched last name
    with no full-name match returns None: guessing the wrong homonym would
    produce a confidently wrong verdict.
    """
    q_lower = claim.lower()
    last_name_hits: list[str] = []
    for deputy_id, info in deputy_map.items():
        full_name = (info.get("full_name") or "").lower()
        if not full_name:
            continue
        if re.search(r"\b" + re.escape(full_name) + r"\b", q_lower):
            return deputy_id
        last_name = full_name.split()[-1]
        if len(last_name) >= 3 and re.search(r"\b" + re.escape(last_name) + r"\b", q_lower):
            last_name_hits.append(deputy_id)
    if len(last_name_hits) == 1:
        return last_name_hits[0]
    return None


def _fetch_candidates(vote_ids: list[str], deputy_id: str | None) -> list[dict]:
    """Fetch candidate scrutins from the votes table, joined with the named
    deputy's recorded position. Ids missing from the table are dropped here —
    this is the code-level guarantee that every citation exists."""
    if not vote_ids:
        return []
    pool = _get_pool()
    conn = pool.getconn()
    broken = False
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT v.vote_id,
                       v.vote_title AS title,
                       v.voted_at::date::text AS voted_at,
                       v.result,
                       vp.position AS deputy_position
                FROM votes v
                LEFT JOIN vote_positions vp
                       ON vp.vote_id = v.vote_id AND vp.deputy_id = %s
                WHERE v.vote_id = ANY(%s)
                ORDER BY v.voted_at DESC
                """,
                (deputy_id, vote_ids),
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception:
        broken = True
        raise
    finally:
        pool.putconn(conn, close=broken)


def get_data_horizon_start() -> str | None:
    """Earliest vote date in the window, ISO string (VerifyResponse.data_horizon)."""
    pool = _get_pool()
    conn = pool.getconn()
    broken = False
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT MIN(voted_at)::date::text AS start FROM votes")
            row = cur.fetchone()
            return row["start"] if row else None
    except Exception:
        broken = True
        raise
    finally:
        pool.putconn(conn, close=broken)


def _parse_llm_verdict(raw: str) -> dict | None:
    """Strict parse of the LLM JSON. Returns None on anything malformed —
    the caller turns that into an 'inverifiable' verdict, never a guess."""
    text = raw.strip()
    # Tolerate a fenced ```json block, nothing looser.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    verdict = data.get("verdict")
    explanation = data.get("explanation")
    cited = data.get("cited_vote_ids")
    if verdict not in VERDICTS or not isinstance(explanation, str) or not explanation.strip():
        return None
    if not isinstance(cited, list) or not all(isinstance(v, str) for v in cited):
        return None
    return {"verdict": verdict, "explanation": explanation.strip(), "cited_vote_ids": cited}


def _format_candidates(candidates: list[dict], deputy_name: str | None) -> str:
    lines = []
    for c in candidates:
        line = f"- [{c['vote_id']}] {c['title']} ({c['voted_at']}) — résultat : {c['result']}"
        if deputy_name:
            position = c["deputy_position"] or "aucune position enregistrée"
            line += f" — position de {deputy_name} : {position}"
        lines.append(line)
    return "\n".join(lines)


def _result(
    claim: str,
    verdict: str,
    explanation: str,
    deputy: dict | None,
    citations: list[dict],
    confidence: str,
) -> dict:
    return {
        "claim": claim,
        "verdict": verdict,
        "explanation": explanation,
        "deputy": deputy,
        "citations": citations,
        "confidence": CONFIDENCE_LABELS.get(confidence, "FAIBLE"),
        "data_horizon": get_data_horizon_start(),
    }


def verify_claim(claim: str) -> dict:
    """Verify a claim against the vote record. Returns the ADR-022 verdict
    fields (id/verified_at/share_url are added by the API layer on insert)."""
    claim = claim.strip()
    deputy_map = get_deputy_map()
    deputy_id = detect_deputy(claim, deputy_map)
    deputy = None
    if deputy_id:
        deputy = {
            "deputy_id": deputy_id,
            "name": deputy_map[deputy_id]["full_name"],
            "party": deputy_map[deputy_id]["party"],
        }

    # No auto result filter: the claim's own "adopté"/"rejeté" wording must
    # not exclude the scrutin that would contradict it.
    chunks = retrieve(claim, k=CANDIDATE_K, chunk_type="vote", auto_result_filter=False)
    confidence = compute_confidence(chunks)

    if not chunks or chunks[0]["similarity"] < MIN_TOP_SIMILARITY:
        return _result(claim, "inverifiable", _INVERIFIABLE_NO_MATCH, deputy, [], "low")

    candidate_ids = [
        c["metadata"]["vote_id"] for c in chunks if c.get("metadata", {}).get("vote_id")
    ]
    candidates = _fetch_candidates(candidate_ids, deputy_id)
    if not candidates:
        return _result(claim, "inverifiable", _INVERIFIABLE_NO_MATCH, deputy, [], "low")

    deputy_line = (
        f"Député identifié : {deputy['name']} ({deputy['party'] or 'groupe non renseigné'})"
        if deputy
        else "Aucun député identifié dans l'affirmation."
    )
    user_message = VERIFY_TEMPLATE.format(
        claim=claim,
        deputy_line=deputy_line,
        candidates=_format_candidates(candidates, deputy["name"] if deputy else None),
    )

    response = _groq_client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": build_verify_system_prompt()},
            {"role": "user", "content": user_message},
        ],
        # 0 rather than 0.2: verification is a deterministic judgment, not
        # open-ended generation; sampling diversity only adds verdict
        # variance on boundary cases (MON-129).
        temperature=0.0,
        max_tokens=1024,
        response_format={"type": "json_object"},
    )
    parsed = _parse_llm_verdict(response.choices[0].message.content)
    if parsed is None:
        log.warning("verify_claim: unparseable LLM verdict for claim %r", claim)
        return _result(claim, "inverifiable", _INVERIFIABLE_PARSE, deputy, [], "low")

    # Citations restricted to the DB-fetched candidates — anything else is dropped.
    by_id = {c["vote_id"]: c for c in candidates}
    citations = [by_id[v] for v in parsed["cited_vote_ids"] if v in by_id]

    verdict = parsed["verdict"]
    explanation = parsed["explanation"]
    if verdict != "inverifiable" and not citations:
        # A factual verdict without a single valid citation is a guess.
        verdict = "inverifiable"
        explanation += _INVERIFIABLE_NO_CITATION

    return _result(claim, verdict, explanation, deputy, citations, confidence)
