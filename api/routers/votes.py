from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_votes() -> dict:
    # TODO: query DB
    return {"votes": []}
