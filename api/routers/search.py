import logging
import os
import uuid
from typing import Literal

import groq
from fastapi import APIRouter, HTTPException, Request
from psycopg2.extras import Json
from pydantic import BaseModel, Field

from api.db import get_conn
from api.limiter import limiter, tiered_limit
from rag.chain.rag_chain import ask

logger = logging.getLogger(__name__)

router = APIRouter()

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "https://mon-elu.vercel.app").rstrip("/")


class SearchRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Question en français sur l'activité parlementaire",
    )
    deputy_id: str | None = Field(None, description="Filtrer par député (optionnel)")
    chunk_type: Literal["vote", "deputy"] | None = Field(
        None, description="'vote' ou 'deputy' (optionnel)"
    )


class SourceItem(BaseModel):
    content: str
    metadata: dict
    similarity: float


class SearchResponse(BaseModel):
    answer: str
    question: str
    chunks_retrieved: int
    sources: list[SourceItem]
    query_type: str = "rag"
    confidence: str = "medium"
    data_source: str = "RAG"
    caveat: str | None = None
    # ADR-023: "verify" when the input looks like a claim to fact-check -
    # a UI nudge only; the API never runs verification from this path.
    suggested_action: Literal["verify"] | None = None


@router.post(
    "/",
    response_model=SearchResponse,
    summary="Posez une question sur les votes et les députés",
)
@limiter.limit(tiered_limit(10))
def search(request: Request, body: SearchRequest):
    # Plain `def` on purpose: ask() does blocking psycopg2 + Groq I/O, so FastAPI
    # must run it in the threadpool, not on the event loop.
    try:
        result = ask(
            question=body.question,
            deputy_id=body.deputy_id,
            chunk_type=body.chunk_type,
        )
        return SearchResponse(
            answer=result["answer"],
            question=result["question"],
            chunks_retrieved=result["chunks_retrieved"],
            sources=[SourceItem(**s) for s in result.get("sources", [])],
            query_type=result.get("query_type", "rag"),
            confidence=result.get("confidence", "medium"),
            data_source=result.get("data_source", "RAG"),
            caveat=result.get("caveat"),
            suggested_action=result.get("suggested_action"),
        )
    except groq.APITimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail=(
                "Le service de recherche est temporairement indisponible. "
                "Réessayez dans quelques secondes."
            ),
        ) from e
    except Exception:
        logger.exception("RAG pipeline error for question %r", body.question)
        raise HTTPException(
            status_code=500,
            detail="Service temporairement indisponible. Réessayez dans quelques secondes.",
        ) from None


class ShareRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    answer: str = Field(..., min_length=1, max_length=8000)
    sources: list[dict] = Field(default_factory=list, max_length=20)
    confidence: str | None = Field(None, max_length=50)
    data_source: str | None = Field(None, max_length=50)
    caveat: str | None = Field(None, max_length=500)


class ShareResponse(BaseModel):
    id: str
    question: str
    answer: str
    sources: list[dict]
    confidence: str | None = None
    data_source: str | None = None
    caveat: str | None = None
    shared_at: str
    share_url: str


def _to_share_response(row: dict) -> ShareResponse:
    share_id = str(row["id"])
    return ShareResponse(
        id=share_id,
        question=row["question"],
        answer=row["answer"],
        sources=row["sources"],
        confidence=row["confidence"],
        data_source=row["data_source"],
        caveat=row["caveat"],
        shared_at=row["created_at"].isoformat(),
        share_url=f"{FRONTEND_BASE_URL}/chat/s/{share_id}",
    )


@router.post(
    "/share",
    response_model=ShareResponse,
    summary="Partagez une réponse du chat (aucun appel IA - snapshot de la réponse déjà obtenue)",
)
@limiter.limit(tiered_limit(30))
def share_answer(request: Request, body: ShareRequest):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO chat_shares
                        (question, answer, sources, confidence, data_source, caveat)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, question, answer, sources, confidence, data_source,
                              caveat, created_at
                    """,
                    (
                        body.question,
                        body.answer,
                        Json(body.sources),
                        body.confidence,
                        body.data_source,
                        body.caveat,
                    ),
                )
                row = cur.fetchone()
            conn.commit()
    except Exception:
        logger.exception("Failed to persist chat share")
        raise HTTPException(
            status_code=500,
            detail="Service temporairement indisponible. Réessayez dans quelques secondes.",
        ) from None
    return _to_share_response(row)


@router.get(
    "/share/{share_id}",
    response_model=ShareResponse,
    summary="Relisez une réponse partagée (aucun appel IA)",
)
# Immutable public snapshot behind an unguessable UUID (MON-173): OG scrapers
# (X, WhatsApp, Facebook, Telegram) and Vercel edge egress funnel through few
# IPs, so the base per-IP limit was tripping during viral spikes.
@limiter.limit(tiered_limit(300))
def get_share(request: Request, share_id: uuid.UUID):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, question, answer, sources, confidence, data_source,
                       caveat, created_at
                FROM chat_shares
                WHERE id = %s
                """,
                (str(share_id),),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Réponse partagée introuvable.")
    return _to_share_response(row)
