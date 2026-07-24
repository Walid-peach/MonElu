"""
api/routers/quiz.py

"Quel député vote comme vous ?" — vote-matching quiz (MON-109, MON-137, MON-139, ADR-025).

Five endpoints:
- GET  /quiz/questions  : the curated question set (repo file, api/quiz_data.py),
                          enriched with live vote tallies from the votes table (MON-180).
- GET  /quiz/weekly     : "scrutin de la semaine" — auto-picked one-question widget
                          (MON-185, MON-178 step 7). No question content is curated
                          here; the DB is the sole source (unlike /questions).
- POST /quiz/match      : stateless agreement computation over vote_positions.
- POST /quiz/share      : store an immutable snapshot of a match result.
- GET  /quiz/share/{id} : serve a stored snapshot (plain SELECT, no recompute).

ADR-025 constraints: /match persists and logs nothing about the request —
answers in, results out. The question *content* is never read from the DB —
only its per-question tallies are (MON-180), one SELECT joined at request time.
/share re-runs the same server-side computation from the submitted answers
before storing — client-computed percentages are never trusted, which is what
keeps MonÉlu-branded share cards non-forgeable. The stored snapshot is the
rendered result only: no user identity, no postal code, no raw answers beyond
what the card shows.

ADR-028 (MON-184): /share accepts an opt-in `include_answers` flag (default
False). When set, the already-validated answers used for the match
computation are added into the stored `result` JSONB so a later visitor can
run a friend comparison. A share created without the opt-in is byte-identical
to a pre-ADR-028 share — no "answers" key is written at all, not a null one.
Comparison itself stays entirely client-side; there is no /quiz/compare.

Denominator rules (consistent with ADR-019's presence framing):
- Only expressed positions compare: pour / contre / abstention. `nonVotant`
  (present but not voting) and absence never count as agreement or disagreement;
  they simply shrink a deputy's comparable-vote count.
- A deputy (or group) ranks only with at least half of the answered questions
  comparable, floor 2 — one shared scrutin is not a political profile.
"""

import logging
import os
import re
import uuid
from collections import Counter, defaultdict
from datetime import date, timedelta
from math import ceil, sqrt
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from psycopg2.extras import Json
from pydantic import BaseModel, Field, field_validator
from starlette.requests import Request

from api.db import get_conn
from api.departments_data import DEPT_NAMES, db_department_values, normalize_code
from api.limiter import limiter, tiered_limit
from api.quiz_data import QUIZ_QUESTIONS, QUIZ_VERSION, QUIZ_VOTE_IDS

logger = logging.getLogger(__name__)

router = APIRouter()

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "https://mon-elu.vercel.app").rstrip("/")

EXPRESSED_POSITIONS = ("pour", "contre", "abstention")
MIN_ANSWERS = 3
TOP_MATCHES_LIMIT = 10

# --- /quiz/weekly selection thresholds (MON-185) — same rule as docs/quiz-curation.md
# criteria 1, 3, 4 for the curated question set, applied automatically here instead
# of by hand. Criterion 2 (must exist in prod) is moot: this endpoint only ever
# reads from whichever DB it's running against.
WEEKLY_CANDIDATE_LIMIT = 500
WEEKLY_MIN_VOTERS = 400
WEEKLY_MIN_MINORITY_SHARE = 0.35
WHOLE_TEXT_RE = re.compile(r"^l['’]ensemble", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class QuizQuestion(BaseModel):
    vote_id: str
    theme: str
    question: str
    context: str
    # Live aggregates joined from the votes table at request time (MON-180) —
    # the question content stays a repo file (ADR-025), only these are DB-backed.
    votes_for: Optional[int] = None
    votes_against: Optional[int] = None
    abstentions: Optional[int] = None
    result: Optional[str] = None
    vote_date: Optional[str] = None


class QuizQuestionsResponse(BaseModel):
    version: str
    count: int
    questions: list[QuizQuestion]


class QuizWeeklyQuestion(BaseModel):
    vote_id: str
    question: str
    vote_title: str
    votes_for: Optional[int] = None
    votes_against: Optional[int] = None
    abstentions: Optional[int] = None
    result: Optional[str] = None
    vote_date: Optional[str] = None


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
    focus_deputy_id: Optional[str] = Field(
        None,
        description=(
            "Identifiant d'un député à mettre en avant dans la réponse (entrée quiz "
            "personnalisée depuis sa page profil, MON-183)"
        ),
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


class QuizVoteDetail(BaseModel):
    vote_id: str
    # None when the deputy has no expressed position on this vote (nonVotant
    # or absent) — the frontend renders that as "non comparable", not disagreement.
    deputy_position: Optional[Literal["pour", "contre", "abstention"]] = None


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
    # Per-question breakdown (MON-181) — populated only for the best match and
    # the opposite; never persisted in quiz_shares (ADR-025 — see share_result).
    detail: Optional[list[QuizVoteDetail]] = None


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
    # Set only when the request carries focus_deputy_id (MON-183) — the
    # requested deputy's match, returned even below the ranking threshold
    # (a personalized entry answers "how well do I match *this* deputy?",
    # not "who ranks in my top matches").
    focus: Optional[QuizDeputyMatch] = None


# ---------------------------------------------------------------------------
# Pure computation helpers — no DB, unit-testable in isolation
# ---------------------------------------------------------------------------
def eligibility_threshold(answered: int) -> int:
    return max(2, ceil(answered / 2))


def week_start(today: date) -> date:
    """Monday of `today`'s ISO week — the cutoff for /quiz/weekly.

    Only scrutins before this cutoff are eligible, so the pick for a given
    ISO week never changes as new votes get ingested mid-week.
    """
    return today - timedelta(days=today.weekday())


def is_whole_text_vote(vote_title: str) -> bool:
    return bool(WHOLE_TEXT_RE.match(vote_title.strip()))


def is_divisive_vote(votes_for: Optional[int], votes_against: Optional[int]) -> bool:
    if not votes_for or not votes_against:
        return False
    expressed = votes_for + votes_against
    if expressed <= 0:
        return False
    return (min(votes_for, votes_against) / expressed) >= WEEKLY_MIN_MINORITY_SHARE


def select_weekly_vote(candidates: list[dict]) -> Optional[dict]:
    """First candidate (latest-first order) passing the quiz-curation thresholds,
    never one from the curated question set (MON-185).
    """
    for row in candidates:
        if row["vote_id"] in QUIZ_VOTE_IDS:
            continue
        if (row.get("total_voters") or 0) < WEEKLY_MIN_VOTERS:
            continue
        if not is_whole_text_vote(row.get("vote_title") or ""):
            continue
        if not is_divisive_vote(row.get("votes_for"), row.get("votes_against")):
            continue
        return row
    return None


def build_weekly_question(summary_plain: Optional[str], vote_title: str) -> str:
    """Plain question derived from summary_plain, with vote_title as fallback."""
    base = (summary_plain or vote_title).strip().rstrip(". ")
    return f"Auriez-vous voté pour ou contre : {base} ?"


WILSON_Z = 1.96  # 95% confidence — standard default, not tuned for this corpus


def ranking_score(matches: int, compared: int) -> float:
    """Wilson score lower bound — coverage-aware ranking (MON-172).

    Raw `matches/compared` lets a deputy compared on only the eligibility
    threshold (e.g. 5/5) outrank one compared on nearly every question
    (e.g. 9/10), because the two ratios don't encode how much evidence
    backs them. The Wilson lower bound does: at a fixed raw ratio, more
    comparisons produce a tighter interval and a higher lower bound, so
    9/10 (0.596) ranks above 5/5 (0.565) even though 5/5 is the bigger raw
    percentage. Only the sort order changes — `agreement_pct` on the
    response is still the raw, unadjusted ratio.
    """
    if compared == 0:
        return 0.0
    phat = matches / compared
    denom = 1 + WILSON_Z**2 / compared
    center = phat + WILSON_Z**2 / (2 * compared)
    margin = WILSON_Z * sqrt((phat * (1 - phat) + WILSON_Z**2 / (4 * compared)) / compared)
    return (center - margin) / denom


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
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT vote_id, votes_for, votes_against, abstentions, result, voted_at
                FROM votes
                WHERE vote_id = ANY(%s)
                """,
                (list(QUIZ_VOTE_IDS),),
            )
            tallies = {row["vote_id"]: row for row in cur.fetchall()}

    questions = []
    for q in QUIZ_QUESTIONS:
        row = tallies.get(q["vote_id"], {})
        voted_at = row.get("voted_at")
        questions.append(
            QuizQuestion(
                **q,
                votes_for=row.get("votes_for"),
                votes_against=row.get("votes_against"),
                abstentions=row.get("abstentions"),
                result=row.get("result"),
                vote_date=voted_at.date().isoformat() if voted_at else None,
            )
        )

    return QuizQuestionsResponse(
        version=QUIZ_VERSION,
        count=len(QUIZ_QUESTIONS),
        questions=questions,
    )


@router.get(
    "/weekly",
    response_model=QuizWeeklyQuestion,
    summary="Le scrutin de la semaine — un scrutin qualifiant, choisi automatiquement",
    responses={404: {"description": "Aucun scrutin qualifiant cette semaine"}},
)
@limiter.limit(tiered_limit(30))
def get_weekly(request: Request) -> QuizWeeklyQuestion:
    cutoff = week_start(date.today())
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT vote_id, vote_title, summary_plain, votes_for, votes_against,
                       abstentions, result, voted_at, total_voters
                FROM votes
                WHERE voted_at IS NOT NULL AND voted_at < %s
                ORDER BY voted_at DESC
                LIMIT %s
                """,
                (cutoff, WEEKLY_CANDIDATE_LIMIT),
            )
            candidates = cur.fetchall()

    row = select_weekly_vote(candidates)
    if row is None:
        raise HTTPException(status_code=404, detail="Aucun scrutin qualifiant cette semaine.")

    voted_at = row["voted_at"]
    return QuizWeeklyQuestion(
        vote_id=row["vote_id"],
        question=build_weekly_question(row.get("summary_plain"), row["vote_title"]),
        vote_title=row["vote_title"],
        votes_for=row["votes_for"],
        votes_against=row["votes_against"],
        abstentions=row["abstentions"],
        result=row["result"],
        vote_date=voted_at.date().isoformat() if voted_at else None,
    )


def _normalized_department(body: QuizMatchRequest) -> Optional[str]:
    if body.department is None:
        return None
    dept_code = normalize_code(body.department)
    if dept_code is None:
        raise HTTPException(status_code=422, detail="Code de département inconnu")
    return dept_code


def _compute_match(body: QuizMatchRequest) -> QuizMatchResponse:
    """Full agreement computation — shared by /match and /share (ADR-025)."""
    dept_code = _normalized_department(body)
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

            focus_row: Optional[dict] = None
            if body.focus_deputy_id is not None:
                cur.execute(
                    """
                    SELECT deputy_id, full_name, party, party_short, department, photo_url
                    FROM deputies
                    WHERE deputy_id = %s
                    """,
                    (body.focus_deputy_id,),
                )
                focus_row = cur.fetchone()
                if focus_row is None:
                    raise HTTPException(status_code=422, detail="Député inconnu")

    stats = compute_deputy_stats(rows, answers)
    position_by_deputy_vote = {(r["deputy_id"], r["vote_id"]): r["position"] for r in rows}

    def detail_for(deputy_id: str) -> list[QuizVoteDetail]:
        return [
            QuizVoteDetail(
                vote_id=vote_id,
                deputy_position=position_by_deputy_vote.get((deputy_id, vote_id)),
            )
            for vote_id in answers
        ]

    eligible = [e for e in stats.values() if e["compared"] >= threshold]
    eligible.sort(
        key=lambda e: (
            -ranking_score(e["matches"], e["compared"]),
            -e["compared"],
            e["full_name"] or "",
        )
    )

    top_matches = [to_match(e) for e in eligible[:TOP_MATCHES_LIMIT]]
    if top_matches:
        top_matches[0].detail = detail_for(top_matches[0].deputy_id)

    opposite = None
    if eligible:
        opposite = to_match(
            min(
                eligible,
                key=lambda e: (ranking_score(e["matches"], e["compared"]), -e["compared"]),
            )
        )
        opposite.detail = detail_for(opposite.deputy_id)

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

    focus = None
    if focus_row is not None:
        focus = to_match(
            stats.get(focus_row["deputy_id"], {**focus_row, "matches": 0, "compared": 0})
        )

    return QuizMatchResponse(
        version=QUIZ_VERSION,
        answered=len(answers),
        eligible_deputies=len(eligible),
        top_matches=top_matches,
        opposite=opposite,
        groups=compute_group_alignment(rows, answers, threshold),
        my_department=my_department,
        focus=focus,
    )


@router.post(
    "/match",
    response_model=QuizMatchResponse,
    summary="Calcule votre accord avec chaque député et chaque groupe",
)
@limiter.limit(tiered_limit(10))
def match(request: Request, body: QuizMatchRequest) -> QuizMatchResponse:
    return _compute_match(body)


# ---------------------------------------------------------------------------
# Shares — immutable snapshots (MON-139, ADR-025)
# ---------------------------------------------------------------------------
class QuizShareRequest(QuizMatchRequest):
    include_answers: bool = Field(
        False,
        description="Inclut les réponses dans le snapshot pour permettre une comparaison "
        "amicale (ADR-028) — opt-in, refusé par défaut.",
    )


class QuizShareResult(QuizMatchResponse):
    # Present only on shares created with include_answers=True (ADR-028).
    # Omitted entirely (not null) on every other share, so a share created
    # without the opt-in stays byte-identical to a pre-ADR-028 snapshot.
    answers: Optional[list[QuizAnswer]] = None


class QuizShareResponse(BaseModel):
    id: str
    result: QuizShareResult
    shared_at: str
    share_url: str


def _to_share_response(row: dict) -> QuizShareResponse:
    share_id = str(row["id"])
    return QuizShareResponse(
        id=share_id,
        result=QuizShareResult(**row["result"]),
        shared_at=row["created_at"].isoformat(),
        share_url=f"{FRONTEND_BASE_URL}/quiz/s/{share_id}",
    )


def _strip_detail(data: dict) -> dict:
    """Remove the per-question detail (MON-181) before persisting a share.

    `detail` is a derived, redundant encoding of the sharer's own answers
    (their position on each vote_id) — distinct from the raw `answers` field
    ADR-028 (MON-184) may add on opt-in. Always stripped regardless of
    include_answers: it's never reconstructed from `body.answers` server-side.
    """
    for match in data.get("top_matches", []):
        match.pop("detail", None)
    if data.get("opposite"):
        data["opposite"].pop("detail", None)
    if data.get("my_department"):
        for match in data["my_department"].get("deputies", []):
            match.pop("detail", None)
    return data


@router.post(
    "/share",
    response_model=QuizShareResponse,
    summary="Partagez votre résultat (recalculé côté serveur, snapshot immuable)",
)
@limiter.limit(tiered_limit(10))
def share_result(request: Request, body: QuizShareRequest) -> QuizShareResponse:
    # Same input shape as /match: the result is recomputed here, never taken
    # from the client (ADR-025) — a share can only contain server-computed
    # numbers. Nothing else about the request is persisted.
    result = _compute_match(body)
    stored_result = _strip_detail(result.model_dump())
    if body.include_answers:
        # The already-validated answers used for the computation above — never
        # a separate client-supplied payload (ADR-028).
        stored_result["answers"] = [a.model_dump() for a in body.answers]
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO quiz_shares (version, result)
                    VALUES (%s, %s)
                    RETURNING id, result, created_at
                    """,
                    (result.version, Json(stored_result)),
                )
                row = cur.fetchone()
            conn.commit()
    except Exception:
        logger.exception("Failed to persist quiz share")
        raise HTTPException(
            status_code=500,
            detail="Service temporairement indisponible. Réessayez dans quelques secondes.",
        ) from None
    return _to_share_response(row)


@router.get(
    "/share/{share_id}",
    response_model=QuizShareResponse,
    summary="Relisez un résultat partagé (aucun recalcul)",
)
# Immutable public snapshot behind an unguessable UUID (MON-173): OG scrapers
# (X, WhatsApp, Facebook, Telegram) and Vercel edge egress funnel through few
# IPs, so the base per-IP limit was tripping during viral spikes.
@limiter.limit(tiered_limit(300))
def get_share(request: Request, share_id: uuid.UUID) -> QuizShareResponse:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, result, created_at FROM quiz_shares WHERE id = %s",
                (str(share_id),),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Résultat partagé introuvable.")
    return _to_share_response(row)
