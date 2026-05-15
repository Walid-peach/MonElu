import logging
from typing import Literal

import groq
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.limiter import limiter
from rag.chain.rag_chain import ask

logger = logging.getLogger(__name__)

router = APIRouter()


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


@router.post(
    "/",
    response_model=SearchResponse,
    summary="Posez une question sur les votes et les députés",
)
@limiter.limit("10/minute")
async def search(request: Request, body: SearchRequest):
    try:
        result = ask(
            question=body.question,
            deputy_id=body.deputy_id,
            chunk_type=body.chunk_type,
        )
        return result
    except groq.APITimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail="Le service de recherche est temporairement indisponible. Réessayez dans quelques secondes.",
        ) from e
    except Exception:
        logger.exception("RAG pipeline error for question %r", body.question)
        raise HTTPException(
            status_code=500,
            detail="Service temporairement indisponible. Réessayez dans quelques secondes.",
        ) from None
