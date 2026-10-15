"""
Unit tests for api/routers/feed.py (#562, ADR-042) - no database.

The noise rule, the deduplication between deputy and theme votes, the closest
scrutin and the roll-up are pure functions, pinned here against small weeks.
The HTTP paths (404 on an unknown deputy, 422 on an unknown theme, the empty
and recess weeks) run against a mocked cursor.
"""

from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException

from api.routers import feed
from api.routers.feed import (
    CLOSE_MARGIN,
    build_items,
    closest_scrutin,
    earns_card,
    resolve_themes,
    week_bounds,
    week_recap_counts,
)
from api.schemas import AgendaItem


def _row(vote_id, kind, *, day=13, pour=300, contre=100, result="adopté", theme=None, pos=None):
    return {
        "vote_id": vote_id,
        "voted_at": datetime(2026, 10, day, tzinfo=timezone.utc),
        "vote_title": f"Scrutin {vote_id}",
        "result": result,
        "votes_for": pour,
        "votes_against": contre,
        "abstentions": 0,
        "summary_plain": None,
        "theme": theme,
        "scrutin_kind": kind,
        "dossier_id": None,
        "has_scrutins": None,
        "position": pos,
    }


def _agenda(uid, theme):
    return AgendaItem(
        point_uid=uid,
        sitting_start=datetime(2026, 10, 20, 13, tzinfo=timezone.utc),
        theme=theme,
    )


JUSTICE = "Justice & Sécurité"
BUDGET = "Économie & Budget"


def _ids(items, kind="scrutin"):
    return [i.scrutin.vote_id for i in items if i.type == kind]


# ---------------------------------------------------------------------------
# The noise rule
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kind", ["ensemble", "motion"])
def test_headline_kinds_always_earn_a_card(kind):
    assert earns_card(_row("V1", kind, pour=500, contre=0))


@pytest.mark.parametrize("kind", ["amendement", "article", "autre", None])
def test_other_kinds_earn_a_card_only_when_close(kind):
    assert earns_card(_row("V1", kind, pour=100 + CLOSE_MARGIN, contre=100))
    assert not earns_card(_row("V1", kind, pour=101 + CLOSE_MARGIN, contre=100))


def test_a_close_vote_without_a_result_earns_no_card():
    assert not earns_card(_row("V1", "amendement", pour=100, contre=99, result=None))


def test_a_missing_tally_earns_no_card():
    assert not earns_card(_row("V1", "amendement", pour=None, contre=99))


# ---------------------------------------------------------------------------
# Pour vous
# ---------------------------------------------------------------------------


def test_pour_vous_keeps_carded_deputy_votes_and_rolls_up_the_rest():
    rows = [
        _row("M", "motion", day=13, pour=149, contre=236, result="rejeté", pos="pour"),
        _row("A4", "amendement", day=13, pour=167, contre=177, result="rejeté", pos="pour"),
        _row("A5", "amendement", day=12, pour=50, contre=300, pos="contre"),
        _row("A6", "article", day=12, pos="abstention"),
        _row("X", "autre", day=11, pos="nonVotant"),
        _row("NOT-HERE", "ensemble", day=11),
    ]
    items = build_items("pour_vous", rows, [], has_deputy=True, theme_names=set())

    assert _ids(items) == ["M", "A4"]
    assert items[-1].type == "rollup"
    rollup = items[-1].rollup
    # nonVotant is counted apart: it is not a vote cast.
    assert (rollup.total, rollup.amendement, rollup.article, rollup.autre) == (2, 1, 1, 0)
    assert rollup.non_votant == 1
    assert items[0].scrutin.deputy_position == "pour"


def test_a_vote_in_a_followed_theme_and_voted_by_the_deputy_appears_once():
    rows = [
        _row("L", "ensemble", day=13, pour=503, contre=0, theme=JUSTICE, pos="abstention"),
        _row("B", "ensemble", day=12, theme=BUDGET),
    ]
    items = build_items("pour_vous", rows, [], has_deputy=True, theme_names={JUSTICE, BUDGET})

    assert _ids(items) == ["L", "B"]
    assert items[0].scrutin.deputy_position == "abstention"
    assert items[1].scrutin.deputy_position is None


def test_followed_themes_bring_only_headline_votes():
    rows = [
        _row("AM", "amendement", pour=100, contre=99, theme=JUSTICE),
        _row("EN", "ensemble", theme=JUSTICE),
    ]
    items = build_items("pour_vous", rows, [], has_deputy=False, theme_names={JUSTICE})
    assert _ids(items) == ["EN"]
    assert all(i.type != "rollup" for i in items)


def test_pour_vous_with_nothing_followed_is_empty():
    rows = [_row("EN", "ensemble")]
    agenda = [_agenda("P1", JUSTICE)]
    assert build_items("pour_vous", rows, agenda, has_deputy=False, theme_names=set()) == []


def test_pour_vous_agenda_is_limited_to_followed_themes_and_follows_the_cards():
    rows = [_row("EN", "ensemble", theme=JUSTICE)]
    agenda = [_agenda("P1", JUSTICE), _agenda("P2", BUDGET), _agenda("P3", None)]
    items = build_items("pour_vous", rows, agenda, has_deputy=False, theme_names={JUSTICE})
    assert [i.type for i in items] == ["scrutin", "agenda"]
    assert items[1].agenda.point_uid == "P1"


# ---------------------------------------------------------------------------
# À l'Assemblée
# ---------------------------------------------------------------------------


def test_assemblee_holds_headline_votes_plus_the_closest_one():
    rows = [
        _row("EN", "ensemble", day=13, pour=503, contre=0),
        _row("MO", "motion", day=13, pour=149, contre=236, result="rejeté"),
        _row("A4", "amendement", day=12, pour=167, contre=177, result="rejeté"),
        _row("A9", "amendement", day=11, pour=10, contre=300),
    ]
    agenda = [_agenda("P1", None)]
    items = build_items("assemblee", rows, agenda, has_deputy=True, theme_names=set())

    assert _ids(items) == ["MO", "EN", "A4"]  # same day: vote_id descending
    assert [i.scrutin.closest for i in items if i.type == "scrutin"].count(True) == 1
    assert next(i for i in items if i.type == "scrutin" and i.scrutin.closest).scrutin.vote_id == (
        "A4"
    )
    assert items[-1].type == "agenda"
    assert all(i.type != "rollup" for i in items)


def test_closest_already_a_headline_is_not_added_twice():
    rows = [
        _row("MO", "motion", pour=200, contre=199),
        _row("A9", "amendement", pour=10, contre=300),
    ]
    items = build_items("assemblee", rows, [], has_deputy=False, theme_names=set())
    assert _ids(items) == ["MO"]
    assert items[0].scrutin.closest


def test_closest_ties_go_to_the_most_recent():
    rows = [
        _row("OLD", "amendement", day=12, pour=100, contre=95),
        _row("NEW", "amendement", day=13, pour=95, contre=100),
    ]
    assert closest_scrutin(rows)["vote_id"] == "NEW"


def test_closest_ignores_votes_without_a_result():
    assert closest_scrutin([_row("X", "amendement", pour=1, contre=1, result=None)]) is None


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------


def test_card_fields(monkeypatch):
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://monelu.fr")
    row = _row("VTANR5L17V1", None, pour=100, contre=95, theme=JUSTICE, pos="pour")
    row.update(dossier_id="DLR5L17N1", has_scrutins=True)
    card = build_items("pour_vous", [row], [], has_deputy=True, theme_names=set())[0].scrutin
    assert card.scrutin_kind == "autre"
    assert card.margin == 5
    assert card.theme_slug == "justice-securite"
    assert card.an_url == "https://www.assemblee-nationale.fr/dyn/scrutins/VTANR5L17V1"
    assert card.lois_url == "https://monelu.fr/lois/DLR5L17N1"


def test_no_bill_page_without_scrutins():
    row = _row("V", "ensemble")
    row.update(dossier_id="DLR5L17N1", has_scrutins=False)
    card = build_items("assemblee", [row], [], has_deputy=False, theme_names=set())[0].scrutin
    assert card.lois_url is None


# ---------------------------------------------------------------------------
# Validation and weeks
# ---------------------------------------------------------------------------


def test_themes_are_validated_and_deduplicated():
    slugs, names = resolve_themes(["sante-social", "SANTE-SOCIAL", "justice-securite"])
    assert slugs == ["sante-social", "justice-securite"]
    assert names == {"Santé & Social", JUSTICE}


def test_unknown_theme_is_rejected():
    with pytest.raises(HTTPException) as exc:
        resolve_themes(["budget"])
    assert exc.value.status_code == 422


def test_week_bounds_run_monday_to_sunday():
    # 2026-10-15 is a Thursday.
    assert week_bounds(date(2026, 10, 15)) == (date(2026, 10, 12), date(2026, 10, 18))
    assert week_bounds(date(2026, 10, 12)) == (date(2026, 10, 12), date(2026, 10, 18))


# ---------------------------------------------------------------------------
# HTTP paths over a mocked cursor
# ---------------------------------------------------------------------------


def test_unknown_deputy_is_404(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    assert client.get("/feed?deputy_id=PA0").status_code == 404


def test_unknown_theme_is_422_before_any_query(client, mock_cursor):
    assert client.get("/feed?theme=budget").status_code == 422
    mock_cursor.execute.assert_not_called()


def test_unknown_tab_is_422(client, mock_cursor):
    assert client.get("/feed?tab=tout").status_code == 422


def test_empty_legislature_is_an_empty_feed(client, mock_cursor, monkeypatch):
    monkeypatch.setattr(feed, "paris_today", lambda: date(2026, 10, 15))
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {"latest": None}
    body = client.get("/feed?tab=assemblee").json()
    assert body["items"] == []
    assert body["no_sitting"] is True
    assert body["week_start"] == body["requested_week_start"] == "2026-10-12"


def test_recess_week_falls_back_to_the_last_week_that_sat(client, mock_cursor, monkeypatch):
    monkeypatch.setattr(feed, "paris_today", lambda: date(2026, 10, 15))
    sat = _row("EN", "ensemble", day=2)
    mock_cursor.fetchall.side_effect = [[], [sat], []]  # requested week, fallback, agenda
    mock_cursor.fetchone.return_value = {"latest": sat["voted_at"]}

    body = client.get("/feed?tab=assemblee").json()
    assert body["no_sitting"] is True
    assert body["requested_week_start"] == "2026-10-12"
    assert (body["week_start"], body["week_end"]) == ("2026-09-28", "2026-10-04")
    assert [i["scrutin"]["vote_id"] for i in body["items"]] == ["EN"]


def test_public_read_is_cacheable(client, mock_cursor):
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {"latest": None}
    response = client.get("/feed")
    assert response.status_code == 200
    assert "max-age" in response.headers.get("cache-control", "")


def test_router_is_mounted_under_feed():
    from api.main import app

    assert "/feed" in app.openapi()["paths"]


# ---------------------------------------------------------------------------
# GET /feed/week (#563)
# ---------------------------------------------------------------------------


def _week():
    return [
        _row("MO", "motion", pour=149, contre=236, result="rejeté", pos="pour"),
        _row("EN", "ensemble", pour=503, contre=0, pos="abstention"),
        _row("EN2", "ensemble", pour=100, contre=300, result="rejeté", pos="contre"),
        _row("A1", "amendement", pos="nonVotant"),
        _row("A2", "amendement", pos="pour"),
        _row("A3", "amendement"),  # absent: no recorded position
    ]


def test_recap_counts_the_week():
    counts = week_recap_counts(_week(), has_deputy=False)
    assert counts["scrutins"] == 6
    assert (counts["laws_adopted"], counts["laws_rejected"]) == (1, 1)
    assert (counts["motions_adopted"], counts["motions_rejected"]) == (0, 1)
    assert counts["deputy"] is None


def test_recap_keeps_non_votant_out_of_abstention_and_cast():
    deputy = week_recap_counts(_week(), has_deputy=True)["deputy"]
    assert (deputy.pour, deputy.contre, deputy.abstention) == (2, 1, 1)
    assert deputy.non_votant == 1
    assert deputy.cast == 4  # the absent scrutin and the nonVotant are not votes cast


def test_recap_of_an_empty_week_is_all_zeros():
    counts = week_recap_counts([], has_deputy=True)
    assert counts["scrutins"] == 0
    assert counts["deputy"].cast == 0


def test_recap_unknown_deputy_is_404(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    assert client.get("/feed/week?deputy_id=PA0").status_code == 404


def test_recap_recess_week_reports_no_sitting_with_zero_counts(client, mock_cursor, monkeypatch):
    monkeypatch.setattr(feed, "paris_today", lambda: date(2026, 10, 15))
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {"latest": None}
    body = client.get("/feed/week").json()
    assert body["no_sitting"] is True
    assert body["scrutins"] == 0
    assert body["deputy"] is None
    assert body["next_agenda"] is None


def test_recap_describes_the_same_fallback_week_as_the_feed(client, mock_cursor, monkeypatch):
    monkeypatch.setattr(feed, "paris_today", lambda: date(2026, 10, 15))
    sat = _row("EN", "ensemble", day=2)
    mock_cursor.fetchall.side_effect = [[], [sat], []]
    mock_cursor.fetchone.return_value = {"latest": sat["voted_at"]}
    body = client.get("/feed/week").json()
    assert (body["no_sitting"], body["week_start"], body["laws_adopted"]) == (
        True,
        "2026-09-28",
        1,
    )
