"""
api/schemas.py
Pydantic v2 models for all MonÉlu request/response types.
"""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Shared config — all response models are read from DB rows (dicts/mappings)
# ---------------------------------------------------------------------------


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Deputies
# ---------------------------------------------------------------------------


class DeputySummary(_Base):
    """Lightweight deputy — used in list responses."""

    deputy_id: str
    full_name: str
    party: Optional[str] = None
    party_short: Optional[str] = None
    department: Optional[str] = None
    circonscription: Optional[str] = None
    photo_url: Optional[str] = None


class DeputyDetail(DeputySummary):
    """Full deputy profile — used in GET /deputies/{deputy_id}."""

    first_name: str
    last_name: str
    mandate_start: Optional[date] = None
    mandate_end: Optional[date] = None
    ingested_at: Optional[datetime] = None


class DeputyScorecard(_Base):
    """Computed voting stats for a single deputy."""

    deputy_id: str
    full_name: str
    total_votes: int = Field(description="Votes the deputy was eligible to participate in")
    present_votes: int = Field(description="Votes where position is not 'absent'")
    presence_rate: float = Field(description="present_votes / total_votes, 0–1")
    votes_for: int
    votes_against: int
    abstentions: int
    votes_for_pct: float = Field(description="votes_for / present_votes, 0–1")
    abstention_pct: float = Field(description="abstentions / present_votes, 0–1")


class DeputyListResponse(_Base):
    total: int
    limit: int
    offset: int
    items: list[DeputySummary]


# ---------------------------------------------------------------------------
# Votes (scrutins)
# ---------------------------------------------------------------------------


class VoteSummary(_Base):
    """Lightweight vote — used in list responses."""

    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: str
    result: Optional[str] = None
    votes_for: Optional[int] = None
    votes_against: Optional[int] = None
    abstentions: Optional[int] = None
    total_voters: Optional[int] = None


class VotePosition(_Base):
    """A single deputy's position on a vote."""

    position_id: int
    deputy_id: str
    full_name: str
    party_short: Optional[str] = None
    position: str


class VoteDetail(VoteSummary):
    """Full vote — used in GET /votes/{vote_id}."""

    vote_type: Optional[str] = None
    dossier_id: Optional[str] = None
    ingested_at: Optional[datetime] = None
    positions: list[VotePosition] = []


class VoteListResponse(_Base):
    total: int
    limit: int
    offset: int
    items: list[VoteSummary]
