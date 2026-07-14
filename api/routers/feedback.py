import logging

from fastapi import APIRouter, HTTPException, Request
from psycopg2.extras import Json
from pydantic import BaseModel, Field

from api.db import get_conn
from api.limiter import limiter, tiered_limit

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatFeedbackRequest(BaseModel):
    vote: str = Field(..., pattern="^(up|down)$")
    question: str = Field(..., min_length=1, max_length=500)
    answer: str = Field(..., min_length=1, max_length=8000)
    sources: list[dict] = Field(default_factory=list)


class FeedbackResponse(BaseModel):
    status: str = "ok"


@router.post(
    "/chat",
    response_model=FeedbackResponse,
    summary="Envoyer un retour (pouce haut/bas) sur une réponse du chat",
)
@limiter.limit(tiered_limit(10))
def submit_chat_feedback(request: Request, body: ChatFeedbackRequest):
    payload = {
        "vote": body.vote,
        "question": body.question,
        "answer": body.answer,
        "sources": body.sources,
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
