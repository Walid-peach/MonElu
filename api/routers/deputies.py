from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_deputies() -> dict:
    # TODO: query DB
    return {"deputies": []}
