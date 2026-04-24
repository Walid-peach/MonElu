from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from rag.chain.rag_chain import ask

router = APIRouter()


class SearchRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Question en français sur l'activité parlementaire",
    )
    deputy_id: str | None = Field(None, description="Filtrer par député (optionnel)")
    chunk_type: str | None = Field(None, description="'vote' ou 'deputy' (optionnel)")


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
async def search(request: SearchRequest):
    try:
        result = ask(
            question=request.question,
            deputy_id=request.deputy_id,
            chunk_type=request.chunk_type,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG pipeline error: {str(e)}") from e
