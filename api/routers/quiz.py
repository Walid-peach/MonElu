"""
api/routers/quiz.py

"Quel député vote comme vous ?" — vote-matching quiz (MON-109, MON-137, ADR-025).

Two endpoints:
- GET  /quiz/questions : the curated question set (repo file, api/quiz_data.py).
- POST /quiz/match     : stateless agreement computation over vote_positions.

ADR-025 constraints: /match persists and logs nothing about the request —
answers in, results out. The question set is never read from the DB.

Denominator rules (consistent with ADR-019's presence framing):
- Only expressed positions compare: pour / contre / abstention. `nonVotant`
  (present but not voting) and absence never count as agreement or disagreement;
  they simply shrink a deputy's comparable-vote count.
- A deputy (or group) ranks only with at least half of the answered questions
  comparable, floor 2 — one shared scrutin is not a political profile.
"""

from collections import Counter, defaultdict
from math import ceil
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from starlette.requests import Request

from api.db import get_conn
from api.departments_data import DEPT_NAMES, db_department_values, normalize_code
from api.limiter import limiter, tiered_limit
from api.quiz_data import QUIZ_QUESTIONS, QUIZ_VERSION, QUIZ_VOTE_IDS

router = APIRouter()

EXPRESSED_POSITIONS = ("pour", "contre", "abstention")
MIN_ANSWERS = 3
TOP_MATCHES_LIMIT = 10


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class QuizQuestion(BaseModel):
    vote_id: str
    theme: str
    question: str
    context: str


class QuizQuestionsResponse(BaseModel):
    version: str
    count: int
    questions: list[QuizQuestion]


class QuizAnswer(BaseModel):
    vote_id: str
    position: Literal["pour", "contre", "abstention"]


class QuizMatchRequest(BaseModel):
    answers: list[QuizAnswer] = Field(
        ...,
        min_length=MIN_ANSWERS,
        max_length=len(QUIZ_QUESTIONS),
        description="Réponses au quiz — au moins 3 pour un résultat significatif",
    )
    department: Optional[str] = Field(
        None, description="Code de département pour la comparaison « vos députés » (optionnel)"
    )

    @field_validator("answers")
    @classmethod
    def _answers_known_and_unique(cls, answers: list[QuizAnswer]) -> list[QuizAnswer]:
        seen: set[str] = set()
        for a in answers:
            if a.vote_id not in QUIZ_VOTE_IDS:
                raise ValueError(f"vote_id inconnu du questionnaire: {a.vote_id}")
            if a.vote_id in seen:
                raise ValueError(f"vote_id en double: {a.vote_id}")
            seen.add(a.vote_id)
        return answers


class QuizDeputyMatch(BaseModel):
    deputy_id: str
    full_name: Optional[str] = None
    party: Optional[str] = None
    party_short: Optional[str] = None
    department: Optional[str] = None
    photo_url: Optional[str] = None
    # None when the deputy has no comparable expressed position at all.
    agreement_pct: Optional[float] = None
    matches: int
    compared: int


class QuizGroupAlignment(BaseModel):
    party: str
    party_short: Optional[str] = None
    agreement_pct: float
    matches: int
    compared: int
    deputy_count: int


class QuizDepartmentResult(BaseModel):
    code: str
    name: str
    deputies: list[QuizDeputyMatch]


class QuizMatchResponse(BaseModel):
    version: str
    answered: int
    eligible_deputies: int
    top_matches: list[QuizDeputyMatch]
    # The eligible deputy who agrees with you the least — same threshold as
    # the ranking, so a 0% on two shared votes never headlines the card.
    opposite: Optional[QuizDeputyMatch] = None
    groups: list[QuizGroupAlignment]
    my_department: Optional[QuizDepartmentResult] = None


# ---------------------------------------------------------------------------
# Pure computation helpers — no DB, unit-testable in isolation
# ---------------------------------------------------------------------------
def eligibility_threshold(answered: int) -> int:
    return max(2, ceil(answered / 2))


def compute_deputy_stats(rows: list[dict], answers: dict[str, str]) -> dict[str, dict]:
    """Per-deputy agreement over expressed positions.

    `rows` carry one expressed position per (deputy, vote); `answers` maps
    vote_id -> user position. Returns {deputy_id: {profile fields, matches,
    compared}}.
    """
    stats: dict[str, dict] = {}
    for row in rows:
        entry = stats.setdefault(
            row["deputy_id"],
            {
                "deputy_id": row["deputy_id"],
                "full_name": row["full_name"],
                "party": row["party"],
                "party_short": row["party_short"],
                "department": row["department"],
                "photo_url": row["photo_url"],
                "matches": 0,
                "compared": 0,
            },
        )
        entry["compared"] += 1
        if row["position"] == answers[row["vote_id"]]:
            entry["matches"] += 1
    return stats


def to_match(entry: dict) -> QuizDeputyMatch:
    pct = round(100 * entry["matches"] / entry["compared"], 1) if entry["compared"] else None
    return QuizDeputyMatch(**entry, agreement_pct=pct)


def compute_group_alignment(
    rows: list[dict], answers: dict[str, str], threshold: int
) -> list[QuizGroupAlignment]:
    """Agreement with each group's majority line, vote by vote.

    A group's position on a scrutin is the strict plurality of its members'
    expressed positions; scrutins where the group's top two positions tie are
    skipped for that group (no majority line to compare against).
    """
    # (party, vote_id) -> Counter of expressed positions
    votes_by_group: dict[tuple[str, str], Counter] = defaultdict(Counter)
    members_by_group: dict[str, set[str]] = defaultdict(set)
    short_by_party: dict[str, Optional[str]] = {}
    for row in rows:
        party = row["party"]
        if not party:
            continue
        votes_by_group[(party, row["vote_id"])][row["position"]] += 1
        members_by_group[party].add(row["deputy_id"])
        short_by_party.setdefault(party, row["party_short"])

    tallies: dict[str, dict] = defaultdict(lambda: {"matches": 0, "compared": 0})
    for (party, vote_id), counter in votes_by_group.items():
        ranked = counter.most_common(2)
        if len(ranked) > 1 and ranked[0][1] == ranked[1][1]:
            continue  # tied plurality — the group has no line on this scrutin
        majority_position = ranked[0][0]
        tallies[party]["compared"] += 1
        if majority_position == answers[vote_id]:
            tallies[party]["matches"] += 1

    groups = [
        QuizGroupAlignment(
            party=party,
            party_short=short_by_party.get(party),
            agreement_pct=round(100 * t["matches"] / t["compared"], 1),
            matches=t["matches"],
            compared=t["compared"],
            deputy_count=len(members_by_group[party]),
        )
        for party, t in tallies.items()
        if t["compared"] >= threshold
    ]
    groups.sort(key=lambda g: (-g.agreement_pct, -g.compared, g.party))
    return groups


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get(
    "/questions",
    response_model=QuizQuestionsResponse,
    summary="Le questionnaire du quiz « Quel député vote comme vous ? »",
)
@limiter.limit(tiered_limit(30))
def get_questions(request: Request) -> QuizQuestionsResponse:
    return QuizQuestionsResponse(
        version=QUIZ_VERSION,
        count=len(QUIZ_QUESTIONS),
        questions=[QuizQuestion(**q) for q in QUIZ_QUESTIONS],
    )


@router.post(
    "/match",
    response_model=QuizMatchResponse,
    summary="Calcule votre accord avec chaque député et chaque groupe",
)
@limiter.limit(tiered_limit(10))
def match(request: Request, body: QuizMatchRequest) -> QuizMatchResponse:
    dept_code: Optional[str] = None
    if body.department is not None:
        dept_code = normalize_code(body.department)
        if dept_code is None:
            raise HTTPException(status_code=422, detail="Code de département inconnu")

    answers = {a.vote_id: a.position for a in body.answers}
    threshold = eligibility_threshold(len(answers))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT vp.deputy_id, vp.vote_id, vp.position,
                       d.full_name, d.party, d.party_short, d.department, d.photo_url
                FROM vote_positions vp
                JOIN deputies d ON d.deputy_id = vp.deputy_id
                WHERE vp.vote_id = ANY(%s)
                  AND vp.position = ANY(%s)
                  AND d.mandate_end IS NULL
                """,
                (list(answers), list(EXPRESSED_POSITIONS)),
            )
            rows = cur.fetchall()

            # A department's deputies can be absent from every quiz scrutin;
            # fetch the roster separately so they still appear (compared=0).
            dept_rows: list[dict] = []
            if dept_code is not None:
                cur.execute(
                    """
                    SELECT deputy_id, full_name, party, party_short,
                           department, photo_url
                    FROM deputies
                    WHERE department = ANY(%s) AND mandate_end IS NULL
                    ORDER BY last_name, first_name
                    """,
                    (db_department_values(dept_code),),
                )
                dept_rows = cur.fetchall()

    stats = compute_deputy_stats(rows, answers)

    eligible = [e for e in stats.values() if e["compared"] >= threshold]
    eligible.sort(
        key=lambda e: (-e["matches"] / e["compared"], -e["compared"], e["full_name"] or "")
    )

    opposite = None
    if eligible:
        opposite = to_match(
            min(eligible, key=lambda e: (e["matches"] / e["compared"], -e["compared"]))
        )

    my_department = None
    if dept_code is not None:
        my_department = QuizDepartmentResult(
            code=dept_code,
            name=DEPT_NAMES[dept_code],
            deputies=[
                to_match(stats.get(r["deputy_id"], {**r, "matches": 0, "compared": 0}))
                for r in dept_rows
            ],
        )

    return QuizMatchResponse(
        version=QUIZ_VERSION,
        answered=len(answers),
        eligible_deputies=len(eligible),
        top_matches=[to_match(e) for e in eligible[:TOP_MATCHES_LIMIT]],
        opposite=opposite,
        groups=compute_group_alignment(rows, answers, threshold),
        my_department=my_department,
    )
