"""
api/main.py
FastAPI application entry point for MonÉlu.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(
    title="MonÉlu API",
    description="Civic data platform — French parliamentary votes and deputies.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow all origins in dev; tighten in production via env var
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers — imported here so they register their routes on the app
# ---------------------------------------------------------------------------
from api.routers import deputies, votes  # noqa: E402  (after app creation)

app.include_router(deputies.router, prefix="/deputies", tags=["Deputies"])
app.include_router(votes.router, prefix="/votes", tags=["Votes"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
def health() -> dict:
    return {"status": "ok"}
