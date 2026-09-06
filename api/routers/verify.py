"""
api/routers/verify.py

Fact-check endpoints (MON-126, ADR-022). POST /verify/ runs the verification
chain and persists the verdict as an immutable snapshot; GET /verify/{id}
serves stored verdicts with no LLM call — this is what the share page and
OG card read (share URL /verifier/v/<id>).
"""

import json
import logging
import os
import uuid
from typing import Literal

import groq
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.config import frontend_base_url
from api.db import get_conn
from api.limiter import limiter, tiered_limit
from rag.chain.verify import verify_claim

logger = logging.getLogger(__name__)

router = APIRouter()

# Mirrors the startup check in api.main — the chain needs both providers.
_PLACEHOLDER_PREFIXES = ("sk-...", "gsk_...", "your-", "changeme")


def _is_placeholder(value: str | None) -> bool:
    return (
        not value
        or not value.strip()
        or any(value.strip().startswith(p) for p in _PLACEHOLDER_PREFIXES)
    )


class VerifyRequest(BaseModel):
    claim: str = Field(
        ...,
        min_length=10,
        max_length=500,
        description="Affirmation à vérifier, en français (ex: 'le député X a voté contre Y')",
    )


class DeputyRef(BaseModel):
    deputy_id: str
    name: str
    party: str | None = None


class CitationItem(BaseModel):
    vote_id: str
    title: str
    voted_at: str
    result: str | None = None
    deputy_position: str | None = None


class VerifyResponse(BaseModel):
    id: str
    claim: str
    verdict: Literal["vrai", "faux", "trompeur", "inverifiable"]
    explanation: str
    deputy: DeputyRef | None = None
    citations: list[CitationItem]
    confidence: Literal["ÉLEVÉ", "MOYEN", "FAIBLE"]
    data_horizon: str | None = None
    verified_at: str
    share_url: str


def _to_response(row: dict) -> VerifyResponse:
    verification_id = str(row["id"])
    return VerifyResponse(
        id=verification_id,
        claim=row["claim"],
        verdict=row["verdict"],
        explanation=row["explanation"],
        deputy=DeputyRef(**row["deputy"]) if row["deputy"] else None,
        citations=[CitationItem(**c) for c in row["citations"]],
        confidence=row["confidence"],
        data_horizon=str(row["data_horizon"]) if row["data_horizon"] else None,
        verified_at=row["created_at"].isoformat(),
        share_url=f"{frontend_base_url()}/verifier/v/{verification_id}",
    )


@router.post(
    "/",
    response_model=VerifyResponse,
    summary="Vérifiez une affirmation sur les votes d'un député",
)
@limiter.limit(tiered_limit(10))
def verify(request: Request, body: VerifyRequest):
    """Check a factual claim about how a deputy voted, and store the verdict.

    Give it a claim, not a question ("X a voté pour la loi Y"). It resolves the
    named deputy, retrieves the relevant scrutins, joins their recorded
    positions, and returns one of four verdicts: `vrai`, `faux`, `trompeur`, or
    `inverifiable`.

    `inverifiable` is the deliberate fallback and is common: it is returned
    whenever the deputy cannot be resolved, retrieval similarity is too low, or
    the model produced a factual verdict without a citation that survives
    validation against the votes table. Read it as "this API declines to rule",
    never as evidence the claim is false.

    `trompeur` is the mixed-record case - true of some scrutins on the bill and
    false of others, which a blanket claim obscures.

    Every cited `vote_id` is checked against the database before the response is
    returned, so citations point at real scrutins. Verdicts are stored immutably
    and readable at `/verifier/v/<id>`. Costs an LLM call; 10/min; 503 when the
    server has no LLM credentials.
    """
    # Plain `def` on purpose: the chain does blocking psycopg2 + OpenAI + Groq
    # I/O, so FastAPI must run it in the threadpool, not on the event loop.
    if _is_placeholder(os.getenv("GROQ_API_KEY")) or _is_placeholder(os.getenv("OPENAI_API_KEY")):
        raise HTTPException(
            status_code=503,
            detail="La vérification IA n'est pas configurée sur ce serveur.",
        )
    try:
        result = verify_claim(body.claim)
    except groq.APITimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail=(
                "Le service de vérification est temporairement indisponible. "
                "Réessayez dans quelques secondes."
            ),
        ) from e
    except Exception:
        logger.exception("Verification pipeline error for claim %r", body.claim)
        raise HTTPException(
            status_code=500,
            detail="Service temporairement indisponible. Réessayez dans quelques secondes.",
        ) from None

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO verifications
                    (claim, verdict, explanation, deputy, citations, confidence, data_horizon)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, claim, verdict, explanation, deputy, citations,
                          confidence, data_horizon, created_at
                """,
                (
                    result["claim"],
                    result["verdict"],
                    result["explanation"],
                    json.dumps(result["deputy"]) if result["deputy"] else None,
                    json.dumps(result["citations"]),
                    result["confidence"],
                    result["data_horizon"],
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return _to_response(row)


@router.get(
    "/{verification_id}",
    response_model=VerifyResponse,
    summary="Relisez un verdict enregistré (aucun appel IA)",
)
# Immutable public snapshot behind an unguessable UUID (MON-173): OG scrapers
# (X, WhatsApp, Facebook, Telegram) and Vercel edge egress funnel through few
# IPs, so the base per-IP limit was tripping during viral spikes.
@limiter.limit(tiered_limit(300))
def get_verification(request: Request, verification_id: uuid.UUID):
    """Read back a stored verdict by id. No LLM call, no re-verification.

    The verdict is frozen as it was issued; `data_horizon` records the window it
    was judged against, which may be narrower than today's data. 404 when the id
    is unknown.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, claim, verdict, explanation, deputy, citations,
                       confidence, data_horizon, created_at
                FROM verifications
                WHERE id = %s
                """,
                (str(verification_id),),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Vérification introuvable.")
    return _to_response(row)
