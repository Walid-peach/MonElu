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

from api.config import DEFAULT_FRONTEND_BASE_URL

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
                "presence_rate": 0.954,
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
    total_votes: int = Field(
        description="Scrutins the deputy has a recorded position on, nonVotant included. "
        "This is presence_rate's numerator, not its denominator."
    )
    present_votes: int = Field(
        description="Recorded positions excluding 'nonVotant' (in chamber but did not "
        "vote). Deliberately the opposite convention to presence_rate — not its numerator."
    )
    presence_rate: float = Field(
        description="Canonical presence (ADR-019), 0–1: recorded positions "
        "(nonVotant included) over the scrutins held during this deputy's mandate "
        "window. That denominator is not returned, so this is NOT present_votes / "
        "total_votes — present_votes uses the opposite convention. 0 when the "
        "mandate window contains no scrutins in the dataset."
    )
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
                "presence_rate": 0.954,
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
    scrutin_kind: Optional[str] = Field(
        default=None,
        description=(
            "What the scrutin decided: ensemble | motion | amendement | article | autre; "
            "null for a scrutin not yet classified"
        ),
    )


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
                        "scrutin_kind": "ensemble",
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
                "presence_rate": 0.954,
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
                "presence_rate": 0.954,
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


class VoteDossierRef(_Base):
    """The bill a scrutin belongs to, embedded in GET /votes/{vote_id} (#369)."""

    dossier_uid: str
    titre: Optional[str] = None
    status: Optional[str] = None
    lois_url: Optional[str] = Field(
        default=None,
        description="MonÉlu bill page; null when the dossier has no page (no row, or no scrutin)",
    )


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
                "dossier": {
                    "dossier_uid": "DLR5L17N53980",
                    "titre": "Réponses immédiates aux phénomènes troublant l'ordre public",
                    "status": "promulguee",
                    "lois_url": f"{DEFAULT_FRONTEND_BASE_URL}/lois/DLR5L17N53980",
                },
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
    dossier: Optional[VoteDossierRef] = Field(
        default=None, description="The scrutin's bill; null when dossier_id is absent"
    )
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


# ---------------------------------------------------------------------------
# Bills - "où en est cette loi ?" (#369, ADR-035)
# ---------------------------------------------------------------------------

_LOI_SCRUTIN_EXAMPLE = {
    "vote_id": "VTANR5L17V7894",
    "voted_at": "2026-06-30T00:00:00Z",
    "vote_title": (
        "l'ensemble de la proposition de loi relative au droit à l'aide à mourir "
        "(nouvelle lecture)."
    ),
    "scrutin_kind": "ensemble",
    "result": "adopté",
    "votes_for": 295,
    "votes_against": 232,
    "abstentions": 35,
    "total_voters": 562,
    "summary_plain": "La proposition de loi sur l'aide à mourir est adoptée en nouvelle lecture.",
    "theme": "Santé",
}


class LoiScrutin(_Base):
    """A headline scrutin - a vote on the whole text, a motion, or another non-amendment vote."""

    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: Optional[str] = None
    scrutin_kind: Optional[str] = Field(
        default=None,
        description="ensemble | motion | autre (amendment kinds are never listed here)",
    )
    result: Optional[str] = None
    votes_for: Optional[int] = None
    votes_against: Optional[int] = None
    abstentions: Optional[int] = None
    total_voters: Optional[int] = None
    summary_plain: Optional[str] = None
    theme: Optional[str] = None


class LoiActe(_Base):
    """One step of the parcours. The tree is flat: rebuild it from parent_uid / depth."""

    acte_uid: str
    parent_uid: Optional[str] = None
    depth: int
    ordinal: int
    code_acte: str
    libelle: Optional[str] = None
    date_acte: Optional[date] = Field(
        default=None, description="Null on grouping nodes such as a reading stage"
    )
    statut_label: Optional[str] = Field(
        default=None, description="The AN's verbatim outcome, on decision actes"
    )
    scrutins: list[LoiScrutin] = []
    amendement_count: int = 0
    article_count: int = 0


class LoiDetail(_Base):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "dossier_uid": "DLR5L17N51670",
                "titre": "Fin de vie",
                "procedure_label": "Proposition de loi ordinaire",
                "initiateur": "PA605694",
                "status": "promulguee",
                "status_label": "adoptée",
                "current_stage": "PROM",
                "parcours_start": "2025-03-11",
                "parcours_end": "2026-08-18",
                "an_dossier_url": (
                    "https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N51670"
                ),
                "scrutin_coverage_start": "2026-03-26",
                "parcours_predates_coverage": True,
                "first_scrutin_at": "2026-06-22",
                "amendement_count": 358,
                "article_count": 19,
                "parcours": [
                    {
                        "acte_uid": "L17-VD224407DI",
                        "parent_uid": "L17-AN1-51670",
                        "depth": 1,
                        "ordinal": 1,
                        "code_acte": "AN1-DEPOT",
                        "libelle": "1er dépôt d'une initiative.",
                        "date_acte": "2025-03-11",
                        "scrutins": [],
                        "amendement_count": 0,
                        "article_count": 0,
                    },
                    {
                        "acte_uid": "L17-VD232853DEC",
                        "parent_uid": "L17-ANNLEC-DEBATS-51670",
                        "depth": 2,
                        "ordinal": 133,
                        "code_acte": "ANNLEC-DEBATS-DEC",
                        "libelle": "Décision",
                        "date_acte": "2026-06-30",
                        "statut_label": "adoptée",
                        "scrutins": [_LOI_SCRUTIN_EXAMPLE],
                        "amendement_count": 0,
                        "article_count": 0,
                    },
                ],
                "unattached_scrutins": [],
                "unattached_collapsed_count": 0,
            }
        }
    )

    dossier_uid: str
    titre: Optional[str] = None
    procedure_label: Optional[str] = None
    initiateur: Optional[str] = None
    status: Optional[str] = Field(default=None, description="Derived by ADR-035 §5's rules")
    status_label: Optional[str] = Field(
        default=None, description="The AN's verbatim wording of the deciding acte"
    )
    current_stage: Optional[str] = None
    parcours_start: Optional[date] = None
    parcours_end: Optional[date] = None
    an_dossier_url: Optional[str] = None
    scrutin_coverage_start: Optional[date] = Field(
        default=None, description="First date the AN linked scrutins to their bill"
    )
    parcours_predates_coverage: Optional[bool] = Field(
        default=None,
        description="True when earlier stages cannot carry scrutins - an upstream gap",
    )
    first_scrutin_at: Optional[date] = None
    amendement_count: int = 0
    article_count: int = 0
    parcours: list[LoiActe] = []
    unattached_scrutins: list[LoiScrutin] = Field(
        default=[], description="Headline scrutins no AN séance acte precedes; normally empty"
    )
    unattached_collapsed_count: int = Field(
        default=0,
        description="Amendment and article scrutins no AN séance acte precedes; normally 0",
    )


class LoiListItem(_Base):
    dossier_uid: str
    titre: Optional[str] = None
    status: Optional[str] = None
    status_label: Optional[str] = None
    current_stage: Optional[str] = None
    parcours_start: Optional[date] = None
    parcours_end: Optional[date] = None
    last_scrutin_at: Optional[datetime] = None
    scrutin_count: Optional[int] = None
    headline_scrutin_count: Optional[int] = None
    theme: Optional[str] = None
    lois_url: Optional[str] = None


class LoiListResponse(_Base):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total": 70,
                "limit": 50,
                "offset": 0,
                "items": [
                    {
                        "dossier_uid": "DLR5L17N51670",
                        "titre": "Fin de vie",
                        "status": "promulguee",
                        "status_label": "adoptée",
                        "current_stage": "PROM",
                        "parcours_start": "2025-03-11",
                        "parcours_end": "2026-08-18",
                        "last_scrutin_at": "2026-07-15T00:00:00Z",
                        "scrutin_count": 380,
                        "headline_scrutin_count": 3,
                        "theme": "Santé",
                        "lois_url": f"{DEFAULT_FRONTEND_BASE_URL}/lois/DLR5L17N51670",
                    }
                ],
            }
        }
    )

    total: int
    limit: int
    offset: int
    items: list[LoiListItem]


class LoiAmendementScrutin(_Base):
    vote_id: str
    voted_at: Optional[datetime] = None
    vote_title: Optional[str] = None
    scrutin_kind: Optional[str] = Field(default=None, description="amendement | article")
    result: Optional[str] = Field(
        default=None, description="The fate of the amendment or article, not of the bill"
    )
    votes_for: Optional[int] = None
    votes_against: Optional[int] = None
    abstentions: Optional[int] = None
    total_voters: Optional[int] = None
    acte_uid: Optional[str] = Field(default=None, description="The parcours step it falls under")


class LoiAmendementsResponse(_Base):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "dossier_uid": "DLR5L17N51670",
                "acte_uid": "L17-VD232363S52856",
                "total": 21,
                "limit": 100,
                "offset": 0,
                "items": [
                    {
                        "vote_id": "VTANR5L17V7433",
                        "voted_at": "2026-06-22T00:00:00Z",
                        "vote_title": (
                            "l'amendement n° 31 de M. Bentz et les amendements "
                            "identiques suivants de suppression de l'article premier (...)."
                        ),
                        "scrutin_kind": "amendement",
                        "result": "rejeté",
                        "votes_for": 88,
                        "votes_against": 110,
                        "abstentions": 2,
                        "total_voters": 200,
                        "acte_uid": "L17-VD232363S52856",
                    }
                ],
            }
        }
    )

    dossier_uid: str
    acte_uid: Optional[str] = None
    total: int
    limit: int
    offset: int
    items: list[LoiAmendementScrutin]


# ---------------------------------------------------------------------------
# Accounts (#413, ADR-040)
# ---------------------------------------------------------------------------


class AccountProfile(_Base):
    """The signed-in caller's own profile, read through the restricted role.

    `id` is MonÉlu's profile id, never the Supabase user id. No token, claim or
    email is ever part of this response.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "7c1d9a52-3f0e-4c1b-9a7e-2b8f6d4e1a30",
                "display_name": "Camille",
                "preferred_language": "fr",
                "department_code": "83",
                "circonscription": "1",
                "created_at": "2026-09-25T08:30:00Z",
                "updated_at": "2026-09-25T08:30:00Z",
            }
        }
    )

    id: Optional[str] = None
    display_name: Optional[str] = None
    preferred_language: Optional[str] = None
    department_code: Optional[str] = None
    circonscription: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AccountFollowedDeputy(_Base):
    """A deputy the caller follows, with the public fields needed to render it."""

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
                "followed_at": "2026-09-25T08:31:00Z",
            }
        }
    )

    deputy_id: Optional[str] = None
    full_name: Optional[str] = None
    party: Optional[str] = None
    party_short: Optional[str] = None
    department: Optional[str] = None
    circonscription: Optional[str] = None
    photo_url: Optional[str] = None
    followed_at: Optional[datetime] = None


class AccountFollowedTheme(_Base):
    """A theme the caller follows. `slug` is one of the ten in /themes/{slug}."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "slug": "energie-environnement",
                "name": "Énergie & Environnement",
                "followed_at": "2026-09-25T08:32:00Z",
            }
        }
    )

    slug: Optional[str] = None
    name: Optional[str] = None
    followed_at: Optional[datetime] = None


class AccountBookmark(_Base):
    """A vote the caller saved, with the public fields needed to render it."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "vote_id": "VTANR5L17V1234",
                "vote_title": "l'ensemble du projet de loi de finances pour 2026",
                "voted_at": "2026-09-18T15:04:00Z",
                "result": "adopté",
                "bookmarked_at": "2026-09-25T08:33:00Z",
            }
        }
    )

    vote_id: Optional[str] = None
    vote_title: Optional[str] = None
    voted_at: Optional[datetime] = None
    result: Optional[str] = None
    bookmarked_at: Optional[datetime] = None


class AccountNotificationPreferences(_Base):
    """Stored notification choices. Nothing is sent on their basis (ADR-040).

    `updated_at` is absent until the caller first saves a preference; until then
    every flag reads as its default, false.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "followed_deputy_votes": True,
                "followed_theme_votes": False,
                "weekly_digest": False,
                "updated_at": "2026-09-25T08:34:00Z",
            }
        }
    )

    followed_deputy_votes: Optional[bool] = None
    followed_theme_votes: Optional[bool] = None
    weekly_digest: Optional[bool] = None
    updated_at: Optional[datetime] = None


class AccountExportProfile(AccountProfile):
    """The stored profile row, including the Supabase user id it is linked to."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "7c1d9a52-3f0e-4c1b-9a7e-2b8f6d4e1a30",
                "auth_user_id": "0b6f3c5e-1111-4a2b-9c3d-000000000001",
                "display_name": "Camille",
                "preferred_language": "fr",
                "department_code": "83",
                "circonscription": "1",
                "created_at": "2026-09-25T08:30:00Z",
                "updated_at": "2026-09-25T08:30:00Z",
            }
        }
    )

    auth_user_id: Optional[str] = None


class AccountExportFollowedDeputy(_Base):
    deputy_id: Optional[str] = None
    created_at: Optional[datetime] = None


class AccountExportFollowedTheme(_Base):
    theme_slug: Optional[str] = None
    created_at: Optional[datetime] = None


class AccountExportBookmark(_Base):
    vote_id: Optional[str] = None
    created_at: Optional[datetime] = None


class AccountExportNotificationPreferences(_Base):
    followed_deputy_votes: Optional[bool] = None
    followed_theme_votes: Optional[bool] = None
    weekly_digest: Optional[bool] = None
    updated_at: Optional[datetime] = None


class AccountExport(_Base):
    """Every row MonÉlu stores about the caller, as stored (RGPD article 20).

    Column names match the `app_private` tables, and no public data is joined
    in: this is the caller's data, not a rendering of it.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "exported_at": "2026-09-25T09:00:00Z",
                "profile": {
                    "id": "7c1d9a52-3f0e-4c1b-9a7e-2b8f6d4e1a30",
                    "auth_user_id": "0b6f3c5e-1111-4a2b-9c3d-000000000001",
                    "display_name": "Camille",
                    "preferred_language": "fr",
                    "department_code": "83",
                    "circonscription": "1",
                    "created_at": "2026-09-25T08:30:00Z",
                    "updated_at": "2026-09-25T08:30:00Z",
                },
                "followed_deputies": [
                    {"deputy_id": "PA720892", "created_at": "2026-09-25T08:31:00Z"}
                ],
                "followed_themes": [
                    {"theme_slug": "energie-environnement", "created_at": "2026-09-25T08:32:00Z"}
                ],
                "bookmarks": [{"vote_id": "VTANR5L17V1234", "created_at": "2026-09-25T08:33:00Z"}],
                "notification_preferences": {
                    "followed_deputy_votes": True,
                    "followed_theme_votes": False,
                    "weekly_digest": False,
                    "updated_at": "2026-09-25T08:34:00Z",
                },
            }
        }
    )

    exported_at: Optional[datetime] = None
    profile: Optional[AccountExportProfile] = None
    followed_deputies: list[AccountExportFollowedDeputy] = []
    followed_themes: list[AccountExportFollowedTheme] = []
    bookmarks: list[AccountExportBookmark] = []
    # None when the caller never saved a preference: nothing is stored, so
    # nothing is exported.
    notification_preferences: Optional[AccountExportNotificationPreferences] = None


# ---------------------------------------------------------------------------
# Native app configuration (ADR-041 §5, #438)
# ---------------------------------------------------------------------------


class AppFeatures(_Base):
    """Remote switches for features that depend on a third party."""

    chat: bool = True
    verify: bool = True


class AppCaveat(_Base):
    """One caveat, keyed by a stable id so the app can place it by the number it qualifies."""

    id: str
    text: str


class AppConfig(_Base):
    """Configuration a native app reads at launch instead of hardcoding it."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "min_ios_version": "1.0.0",
                "features": {"chat": True, "verify": True},
                "data_horizon": "2025-07-01",
                "caveats": [
                    {
                        "id": "vote_result",
                        "text": (
                            "Le résultat d'un scrutin (adopté / rejeté) est repris tel quel "
                            "de l'Assemblée nationale, jamais recalculé."
                        ),
                    }
                ],
            }
        }
    )

    min_ios_version: str
    features: AppFeatures
    data_horizon: date
    caveats: list[AppCaveat] = []
