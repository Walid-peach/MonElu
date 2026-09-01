import logging

from fastapi import APIRouter, HTTPException, Request
from psycopg2.extras import Json
from pydantic import BaseModel, Field

from api.db import get_conn
from api.limiter import limiter, tiered_limit
from api.routers.search import ShareSourceItem

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatFeedbackRequest(BaseModel):
    vote: str = Field(..., pattern="^(up|down)$")
    question: str = Field(..., min_length=1, max_length=500)
    answer: str = Field(..., min_length=1, max_length=8000)
    sources: list[ShareSourceItem] = Field(default_factory=list, max_length=10)


class ErrorReportRequest(BaseModel):
    entity_type: str = Field(..., pattern="^(deputy|vote|page)$")
    entity_id: str | None = Field(None, max_length=60)
    entity_label: str | None = Field(None, max_length=300)
    page_url: str | None = Field(None, max_length=300)
    message: str = Field(..., min_length=1, max_length=2000)
    email: str | None = Field(None, max_length=200)


class FeedbackResponse(BaseModel):
    status: str = "ok"


@router.post(
    "/chat",
    response_model=FeedbackResponse,
    summary="Envoyer un retour (pouce haut/bas) sur une réponse du chat",
)
@limiter.limit(tiered_limit(10))
def submit_chat_feedback(request: Request, body: ChatFeedbackRequest):
    """Record a thumbs up/down on a chat answer. Write-only.

    Feeds a manual triage queue for tuning retrieval and prompts; nothing is
    served back out and there is no read endpoint. Meant for the site's own UI.
    """
    payload = {
        "vote": body.vote,
        "question": body.question,
        "answer": body.answer,
        "sources": [s.model_dump() for s in body.sources],
    }
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO feedback (type, payload) VALUES (%s, %s)",
                    ("chat", Json(payload)),
                )
            conn.commit()
    except Exception:
        logger.exception("Failed to persist chat feedback")
        raise HTTPException(
            status_code=500,
            detail="Service temporairement indisponible. Réessayez dans quelques secondes.",
        ) from None
    return FeedbackResponse()


@router.post(
    "/report",
    response_model=FeedbackResponse,
    summary="Signaler une erreur sur une page de données (MON-101)",
)
@limiter.limit(tiered_limit(10))
def submit_error_report(request: Request, body: ErrorReportRequest):
    """Report a data error on a deputy, vote or other entity page. Write-only.

    Goes to the same manual triage queue as chat feedback; nothing is served back
    out and there is no read endpoint. `email` is optional and only used to reply
    about the report. Corrections are applied upstream, so a report does not
    change what the API returns.
    """
    payload = {
        "entity_type": body.entity_type,
        "entity_id": body.entity_id,
        "entity_label": body.entity_label,
        "page_url": body.page_url,
        "message": body.message,
        "email": body.email,
    }
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO feedback (type, payload) VALUES (%s, %s)",
                    ("report", Json(payload)),
                )
            conn.commit()
    except Exception:
        logger.exception("Failed to persist error report")
        raise HTTPException(
            status_code=500,
            detail="Service temporairement indisponible. Réessayez dans quelques secondes.",
        ) from None
    return FeedbackResponse()
