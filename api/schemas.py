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
    present_votes: int = Field(
        description="Votes where position is not 'nonVotant' (present in chamber but did not vote)"
    )
    presence_rate: float = Field(description="present_votes / total_votes, 0–1")
    votes_for: int
    votes_against: int
    abstentions: int
    votes_for_pct: float = Field(description="votes_for / present_votes, 0–1")
    abstention_pct: float = Field(description="abstentions / present_votes, 0–1")
    eligible_solennels: int = Field(
        description="Scrutins solennels held during the deputy's mandate window"
    )
    solennels_cast: int = Field(description="Of those, how many the deputy voted on")
    solennel_participation_rate: float = Field(
        description="solennels_cast / eligible_solennels, 0–1 (see MON-124)"
    )
    eligible_voting_days: int = Field(
        description="Distinct calendar days with at least one scrutin during the mandate window"
    )
    voting_days_present: int = Field(
        description="Of those, how many days the deputy cast at least one vote"
    )
    voting_days_rate: float = Field(
        description="voting_days_present / eligible_voting_days, 0–1 (see MON-124)"
    )


class DeputyScorecardRow(DeputyScorecard):
    """Scorecard plus party/department context — one row of the dense table (MON-97)."""

    party: Optional[str] = None
    party_short: Optional[str] = None
    department: Optional[str] = None


class DeputyScorecardListResponse(_Base):
    total: int
    items: list[DeputyScorecardRow]


class DeputyAlignment(_Base):
    """Party alignment / dissident rate for a single deputy (mart_party_alignment)."""

    deputy_id: str
    full_name: str
    party: Optional[str] = None
    total_votes: int = Field(description="Votes counted toward alignment (pour/contre/abstention)")
    aligned_votes: int
    dissident_votes: int
    party_alignment_rate: float = Field(description="aligned_votes / total_votes, 0-1")
    dissident_rate: float = Field(description="dissident_votes / total_votes, 0-1")
    updated_at: Optional[datetime] = None


class DissidentVoteItem(_Base):
    """A single vote where the deputy diverged from their party's majority position."""

    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: str
    result: Optional[str] = None
    position: str
    majority_position: str


class DeputyDissidentVotesResponse(_Base):
    deputy_id: str
    total: int
    items: list[DissidentVoteItem]


class DivergingVoteItem(_Base):
    """A vote where two deputies (a and b) cast opposite expressed positions."""

    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: str
    result: Optional[str] = None
    summary_plain: Optional[str] = None
    position_a: str
    position_b: str


class DeputyDivergingVotesResponse(_Base):
    deputy_a_id: str
    deputy_b_id: str
    total: int
    items: list[DivergingVoteItem]


class DeputyStats(_Base):
    avg_presence_rate: Optional[float] = Field(
        None,
        description="Average presence_rate across all deputies, 0–1; null when the mart is empty",
    )
    avg_solennel_participation_rate: Optional[float] = Field(
        None,
        description="Average solennel_participation_rate across all deputies, 0–1 (MON-124)",
    )
    avg_voting_days_rate: Optional[float] = Field(
        None,
        description="Average voting_days_rate across all deputies, 0–1 (MON-124)",
    )
    avg_votes_for_pct: Optional[float] = Field(
        None,
        description="Average votes_for_pct, 0–1; scoped to `party` when set (MON-92)",
    )
    avg_abstention_pct: Optional[float] = Field(
        None,
        description="Average abstention_pct, 0–1; scoped to `party` when set (MON-92)",
    )


class DeputyVoteItem(_Base):
    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: str
    result: Optional[str] = None
    position: str
    summary_plain: Optional[str] = None


class DeputyVotesResponse(_Base):
    deputy_id: str
    total: int
    items: list[DeputyVoteItem]


class DeputyListResponse(_Base):
    total: int
    limit: int
    offset: int
    items: list[DeputySummary]


# ---------------------------------------------------------------------------
# Departments (MON-107)
# ---------------------------------------------------------------------------


class DepartmentDeputy(DeputySummary):
    """Deputy row on a department page — summary plus scorecard highlights.

    Mart-derived rates are None when the dbt marts are absent (the page
    degrades gracefully instead of failing).
    """

    presence_rate: Optional[float] = None
    solennel_participation_rate: Optional[float] = None
    party_alignment_rate: Optional[float] = None
    dissident_rate: Optional[float] = None


class DepartmentPartyCount(_Base):
    party: Optional[str] = None
    count: int


class DepartmentSplitVote(_Base):
    """A recent vote where the department's deputies expressed opposing positions."""

    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: str
    result: Optional[str] = None
    pour: int
    contre: int
    abstention: int


class DepartmentDetail(_Base):
    code: str
    name: str
    deputy_count: int
    deputies: list[DepartmentDeputy]
    avg_presence_rate: Optional[float] = Field(
        default=None,
        description="Mean presence_rate across the department's deputies; "
        "None when the scorecard mart is unavailable.",
    )
    party_distribution: list[DepartmentPartyCount]
    most_dissident: Optional[DepartmentDeputy] = Field(
        default=None,
        description="Deputy with the highest dissident_rate; None when the "
        "alignment mart is unavailable or the department is empty.",
    )
    split_votes: list[DepartmentSplitVote]


# ---------------------------------------------------------------------------
# Themes (MON-106)
# ---------------------------------------------------------------------------


class ThemeVoteItem(_Base):
    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: str
    result: Optional[str] = None
    summary_plain: Optional[str] = None


class ThemePartyPosition(_Base):
    party_short: Optional[str] = None
    pour: int
    contre: int
    abstention: int
    expressed: int = Field(description="pour + contre + abstention")
    pour_rate: float = Field(description="pour / expressed, 0-1")


class ThemeMostDividedVote(_Base):
    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: str
    votes_for: int
    votes_against: int


class ThemeDetail(_Base):
    slug: str
    name: str
    vote_count: int
    adoption_rate: Optional[float] = Field(
        default=None,
        description="Share of votes with result='adopté' among votes with a "
        "known result, 0-1; None when no vote in the theme has a result yet",
    )
    most_divided_vote: Optional[ThemeMostDividedVote] = Field(
        default=None,
        description="Vote with the smallest absolute pour/contre margin in the theme",
    )
    party_positions: list[ThemePartyPosition]
    votes_total: int
    limit: int
    offset: int
    votes: list[ThemeVoteItem]


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
    summary_plain: Optional[str] = None
    theme: Optional[str] = None


class VotePosition(_Base):
    """A single deputy's position on a vote."""

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
    next_cursor: Optional[str] = Field(
        default=None,
        description="Opaque keyset cursor — pass as ?before= to fetch the next page; "
        "null when there are no more rows.",
    )


# ---------------------------------------------------------------------------
# API keys (MON-98)
# ---------------------------------------------------------------------------


class ApiKeyUsageDay(_Base):
    endpoint: str
    day: date
    request_count: int


class ApiKeyUsageResponse(_Base):
    label: str
    rate_limit_multiplier: int
    items: list[ApiKeyUsageDay]
