"""
api/schemas.py
Pydantic v2 models for all MonÉlu request/response types.

Response models carry a `json_schema_extra` example (MON-260): /openapi.json is
read by agents and code generators, and one realistic payload does more for
tool-calling accuracy than any amount of field prose.

Two things to know when editing an example:

* **A `None` value is silently dropped.** FastAPI renders the schema through
  `jsonable_encoder(..., exclude_none=True)`, so a nullable field given `None`
  simply vanishes from the published example, which reads as "never returned".
  Give it a realistic value instead, or leave it out deliberately.
* **Examples are not inherited safely.** Pydantic carries a parent's
  `model_config` down to a subclass, so a subclass that adds fields inherits an
  example missing them. Every subclass that adds a field redeclares its own.
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

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "deputy_id": "PA720892",
                "full_name": "Mathilde Panot",
                "party": "La France insoumise - Nouveau Front Populaire",
                "party_short": "LFI",
                "department": "Val-de-Marne",
                "circonscription": "10",
                "photo_url": (
                    "https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/"
                    "carre/720892.jpg"
                ),
            }
        }
    )

    deputy_id: str
    full_name: str
    party: Optional[str] = None
    party_short: Optional[str] = None
    department: Optional[str] = None
    circonscription: Optional[str] = None
    photo_url: Optional[str] = None


class DeputyDetail(DeputySummary):
    """Full deputy profile — used in GET /deputies/{deputy_id}."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "deputy_id": "PA720892",
                "full_name": "Mathilde Panot",
                "first_name": "Mathilde",
                "last_name": "Panot",
                "party": "La France insoumise - Nouveau Front Populaire",
                "party_short": "LFI",
                "department": "Val-de-Marne",
                "circonscription": "10",
                "photo_url": (
                    "https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/"
                    "carre/720892.jpg"
                ),
                "mandate_start": "2024-07-07",
                "mandate_end": None,
                "ingested_at": "2026-08-20T06:52:54Z",
            }
        }
    )

    first_name: str
    last_name: str
    mandate_start: Optional[date] = None
    mandate_end: Optional[date] = None
    ingested_at: Optional[datetime] = None


class DeputyScorecard(_Base):
    """Computed voting stats for a single deputy."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "deputy_id": "PA720892",
                "full_name": "Mathilde Panot",
                "total_votes": 446,
                "present_votes": 407,
                "presence_rate": 0.9126,
                "votes_for": 116,
                "votes_against": 261,
                "abstentions": 30,
                "votes_for_pct": 0.2850,
                "abstention_pct": 0.0737,
                "eligible_solennels": 24,
                "solennels_cast": 21,
                "solennel_participation_rate": 0.875,
                "eligible_voting_days": 62,
                "voting_days_present": 41,
                "voting_days_rate": 0.6613,
            }
        }
    )

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

    # Explicit rather than inherited: Pydantic would otherwise carry
    # DeputyScorecard's example down here, and it has none of the three
    # fields this model adds.
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "deputy_id": "PA720892",
                "full_name": "Mathilde Panot",
                "party": "La France insoumise - Nouveau Front Populaire",
                "party_short": "LFI",
                "department": "Val-de-Marne",
                "total_votes": 446,
                "present_votes": 407,
                "presence_rate": 0.9126,
                "votes_for": 116,
                "votes_against": 261,
                "abstentions": 30,
                "votes_for_pct": 0.2850,
                "abstention_pct": 0.0737,
                "eligible_solennels": 24,
                "solennels_cast": 21,
                "solennel_participation_rate": 0.875,
                "eligible_voting_days": 62,
                "voting_days_present": 41,
                "voting_days_rate": 0.6613,
            }
        }
    )

    party: Optional[str] = None
    party_short: Optional[str] = None
    department: Optional[str] = None


class DeputyScorecardListResponse(_Base):
    total: int
    items: list[DeputyScorecardRow]


class DeputyAlignment(_Base):
    """Party alignment / dissident rate for a single deputy (mart_party_alignment)."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "deputy_id": "PA720892",
                "full_name": "Mathilde Panot",
                "party": "La France insoumise - Nouveau Front Populaire",
                "total_votes": 446,
                "aligned_votes": 407,
                "dissident_votes": 39,
                "party_alignment_rate": 0.9126,
                "dissident_rate": 0.0874,
                "updated_at": "2026-08-20T06:52:54Z",
            }
        }
    )

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
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "avg_presence_rate": 0.2564,
                "avg_solennel_participation_rate": 0.8447,
                "avg_voting_days_rate": 0.5553,
                "avg_votes_for_pct": 0.4209,
                "avg_abstention_pct": 0.0554,
            }
        }
    )

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
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "deputy_id": "PA720892",
                "total": 446,
                "items": [
                    {
                        "vote_id": "VTANR5L17V8433",
                        "voted_at": "2026-07-21T00:00:00Z",
                        "vote_title": (
                            "l'ensemble du projet de loi visant à offrir des réponses "
                            "immédiates aux phénomènes troublant l'ordre public "
                            "(texte de la commission mixte paritaire)."
                        ),
                        "result": "adopté",
                        "position": "contre",
                        "summary_plain": (
                            "Le texte issu de la commission mixte paritaire a été adopté."
                        ),
                    }
                ],
            }
        }
    )

    deputy_id: str
    total: int
    items: list[DeputyVoteItem]


class DeputyListResponse(_Base):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total": 1,
                "limit": 50,
                "offset": 0,
                "items": [
                    {
                        "deputy_id": "PA720892",
                        "full_name": "Mathilde Panot",
                        "party": "La France insoumise - Nouveau Front Populaire",
                        "party_short": "LFI",
                        "department": "Val-de-Marne",
                        "circonscription": "10",
                        "photo_url": (
                            "https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/"
                            "carre/720892.jpg"
                        ),
                    }
                ],
            }
        }
    )

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

    # Explicit rather than inherited from DeputySummary, which has none of
    # the four rate fields below.
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "deputy_id": "PA720892",
                "full_name": "Mathilde Panot",
                "party": "La France insoumise - Nouveau Front Populaire",
                "party_short": "LFI",
                "department": "Val-de-Marne",
                "circonscription": "10",
                "photo_url": (
                    "https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/"
                    "carre/720892.jpg"
                ),
                "presence_rate": 0.9126,
                "solennel_participation_rate": 0.875,
                "party_alignment_rate": 0.9126,
                "dissident_rate": 0.0874,
            }
        }
    )

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
    limit: int
    offset: int
    votes: list[ThemeVoteItem]


# ---------------------------------------------------------------------------
# Groups (parliamentary groups — MON-150)
# ---------------------------------------------------------------------------


class GroupMember(DeputySummary):
    """A group's current deputy — summary plus scorecard highlights.

    Mart-derived rates are None when the dbt marts are absent (the page
    degrades gracefully instead of failing), mirroring DepartmentDeputy.
    """

    # Explicit rather than inherited from DeputySummary, which has neither
    # of the two rate fields below.
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "deputy_id": "PA720892",
                "full_name": "Mathilde Panot",
                "party": "La France insoumise - Nouveau Front Populaire",
                "party_short": "LFI",
                "department": "Val-de-Marne",
                "circonscription": "10",
                "photo_url": (
                    "https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/"
                    "carre/720892.jpg"
                ),
                "presence_rate": 0.9126,
                "dissident_rate": 0.0874,
            }
        }
    )

    presence_rate: Optional[float] = None
    dissident_rate: Optional[float] = None


class GroupVoteBreakdown(_Base):
    """A vote's outcome among a group's current members: how the group split."""

    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: str
    result: Optional[str] = None
    pour: int
    contre: int
    abstention: int
    majority_position: str = Field(
        description="pour/contre/abstention — whichever the group cast most of on this vote"
    )


class GroupDetail(_Base):
    slug: str
    name: str
    member_count: int
    members: list[GroupMember]
    avg_presence_rate: Optional[float] = Field(
        default=None,
        description="Mean presence_rate across the group's current members; "
        "None when the scorecard mart is unavailable.",
    )
    avg_dissident_rate: Optional[float] = Field(
        default=None,
        description="Mean dissident_rate across the group's current members — the "
        "group's cohesion score, inverted (higher = less cohesive); None when the "
        "alignment mart is unavailable.",
    )
    most_dissident_members: list[GroupMember] = Field(
        default_factory=list,
        description="Current members with the highest dissident_rate, descending.",
    )
    divided_votes: list[GroupVoteBreakdown] = Field(
        default_factory=list,
        description="Recent votes where the group's members split furthest "
        "(smallest of pour/contre is largest), most divided first.",
    )
    recent_scrutins: list[GroupVoteBreakdown] = Field(
        default_factory=list,
        description="The group's most recent scrutins with its aggregate position, newest first.",
    )


# ---------------------------------------------------------------------------
# Votes (scrutins)
# ---------------------------------------------------------------------------


class VoteSummary(_Base):
    """Lightweight vote — used in list responses."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "vote_id": "VTANR5L17V8433",
                "voted_at": "2026-07-21T00:00:00Z",
                "vote_title": (
                    "l'ensemble du projet de loi visant à offrir des réponses "
                    "immédiates aux phénomènes troublant l'ordre public "
                    "(texte de la commission mixte paritaire)."
                ),
                "result": "adopté",
                "votes_for": 351,
                "votes_against": 179,
                "abstentions": 7,
                "total_voters": 537,
                "summary_plain": ("Le texte issu de la commission mixte paritaire a été adopté."),
                "theme": "Justice & Sécurité",
            }
        }
    )

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

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "vote_id": "VTANR5L17V8433",
                "voted_at": "2026-07-21T00:00:00Z",
                "vote_title": (
                    "l'ensemble du projet de loi visant à offrir des réponses "
                    "immédiates aux phénomènes troublant l'ordre public "
                    "(texte de la commission mixte paritaire)."
                ),
                "result": "adopté",
                "votes_for": 351,
                "votes_against": 179,
                "abstentions": 7,
                "total_voters": 537,
                "summary_plain": ("Le texte issu de la commission mixte paritaire a été adopté."),
                "theme": "Justice & Sécurité",
                "vote_type": "sps",
                "dossier_id": "DLR5L17N53980",
                "ingested_at": "2026-07-22T06:12:03Z",
                "positions": [
                    {
                        "deputy_id": "PA720892",
                        "full_name": "Mathilde Panot",
                        "party_short": "LFI",
                        "position": "contre",
                    },
                    {
                        "deputy_id": "PA793214",
                        "full_name": "Audrey Abadie-Amiel",
                        "party_short": "LIOT",
                        "position": "abstention",
                    },
                ],
            }
        }
    )

    vote_type: Optional[str] = None
    dossier_id: Optional[str] = None
    ingested_at: Optional[datetime] = None
    positions: list[VotePosition] = []


class VoteListResponse(_Base):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total": 5561,
                "limit": 50,
                "offset": 0,
                "items": [
                    {
                        "vote_id": "VTANR5L17V8433",
                        "voted_at": "2026-07-21T00:00:00Z",
                        "vote_title": (
                            "l'ensemble du projet de loi visant à offrir des réponses "
                            "immédiates aux phénomènes troublant l'ordre public "
                            "(texte de la commission mixte paritaire)."
                        ),
                        "result": "adopté",
                        "votes_for": 351,
                        "votes_against": 179,
                        "abstentions": 7,
                        "total_voters": 537,
                        "summary_plain": (
                            "Le texte issu de la commission mixte paritaire a été adopté."
                        ),
                        "theme": "Justice & Sécurité",
                    }
                ],
                "next_cursor": "MjAyNi0wNy0yMVQwMDowMDowMCswMDowMHxWVEFOUjVMMTdWODQzMw==",
            }
        }
    )

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


# ---------------------------------------------------------------------------
# Agenda (MON-212, ADR-030)
# ---------------------------------------------------------------------------


class AgendaItem(_Base):
    point_uid: str
    sitting_start: datetime
    sitting_end: Optional[datetime] = None
    objet: Optional[str] = None
    point_type: Optional[str] = None
    summary_plain: Optional[str] = None
    theme: Optional[str] = None
    dossier_id: Optional[str] = None
    dossier_url: Optional[str] = Field(
        default=None, description="Official AN dossier page; set whenever dossier_id is known"
    )
    vote_id: Optional[str] = Field(
        default=None, description="Set once a scrutin exists for this item's dossier"
    )
    result: Optional[str] = None


class AgendaDay(_Base):
    sitting_date: date
    items: list[AgendaItem]


class AgendaResponse(_Base):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "from_date": "2026-09-01",
                "to_date": "2026-09-07",
                "days": [
                    {
                        "sitting_date": "2026-09-02",
                        "items": [
                            {
                                "point_uid": "PTOD17_123456",
                                "sitting_start": "2026-09-02T15:00:00Z",
                                "sitting_end": "2026-09-02T20:00:00Z",
                                "objet": (
                                    "Projet de loi relatif à la lutte contre les fraudes "
                                    "sociales et fiscales (première lecture)"
                                ),
                                "point_type": "Discussion générale",
                                "summary_plain": None,
                                "theme": None,
                                "dossier_id": "DLR5L17N52985",
                                "dossier_url": (
                                    "https://www.assemblee-nationale.fr/dyn/17/dossiers/"
                                    "DLR5L17N52985"
                                ),
                                "vote_id": None,
                                "result": None,
                            }
                        ],
                    }
                ],
            }
        }
    )

    from_date: date
    to_date: date
    days: list[AgendaDay]
