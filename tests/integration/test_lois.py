"""
Integration tests for GET /lois, GET /lois/{uid} and /votes/{id}'s dossier
block (#369, ADR-035), through the real app against a live Postgres.

The fixture dossier mirrors the shape that makes bill pages hard: a parcours
that opens a year before the AN's scrutin-tagging cutover, 400 amendment votes
on one séance, a Sénat acte sharing the AN decision's date, and a stale acte
that vanished from the export. A mocked cursor can check none of that.
"""

from datetime import date, datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app
from scripts.ingest_dossiers import UPSERT_ACTE_SQL, UPSERT_DOSSIER_SQL

LOI = "IT-LOI-PAGE"
LOI_OTHER = "IT-LOI-OTHER"
LOI_NO_PAGE = "IT-LOI-NOPAGE"
AMENDMENT_VOTES = 400


def _dossier(uid: str, status: str, has_scrutins: bool, **overrides) -> dict:
    row = {
        "dossier_uid": uid,
        "legislature": "17",
        "titre": f"Loi de test {uid}",
        "titre_chemin": None,
        "procedure_code": "2",
        "procedure_label": "Proposition de loi ordinaire",
        "initiateur": "PA001",
        "status": status,
        "status_label": "adoptée" if status == "promulguee" else None,
        "current_stage": "PROM" if status == "promulguee" else "AN1",
        "parcours_start": "2025-03-11",
        "parcours_end": "2026-07-01",
        "_has_scrutins": has_scrutins,
    }
    row.update(overrides)
    return row


def _acte(acte_uid, code_acte, date_acte, ordinal, depth=1, parent=None, statut=None) -> dict:
    return {
        "dossier_uid": LOI,
        "acte_uid": acte_uid,
        "parent_uid": parent,
        "depth": depth,
        "ordinal": ordinal,
        "code_acte": code_acte,
        "acte_type": "Decision_Type" if code_acte.endswith("-DEC") else "Etape_Type",
        "libelle": code_acte,
        "date_acte": date_acte,
        "statut_label": statut,
        "organe_ref": None,
    }


ACTES = [
    _acte("IT-A-AN1", "AN1", None, 0, depth=0),
    _acte("IT-A-DEPOT", "AN1-DEPOT", "2025-03-11", 1, parent="IT-A-AN1"),
    _acte("IT-A-SEANCE", "AN1-DEBATS-SEANCE", "2026-06-22", 2, depth=2, parent="IT-A-AN1"),
    _acte(
        "IT-A-DEC", "AN1-DEBATS-DEC", "2026-06-30", 3, depth=2, parent="IT-A-AN1", statut="adoptée"
    ),
    # Same date as the AN decision, later in the tree: must not win the vote.
    _acte("IT-A-SN-DEPOT", "SN1-DEPOT", "2026-06-30", 4, parent=None),
]
STALE_ACTE = _acte("IT-A-STALE", "AN1-COM-FOND-REUNION", "2025-04-01", 5)

_VOTE_SQL = """
INSERT INTO votes (vote_id, voted_at, vote_title, result, votes_for, votes_against,
                   abstentions, total_voters, dossier_id, scrutin_kind, theme)
VALUES (%(vote_id)s, %(voted_at)s, %(vote_title)s, %(result)s, 10, 5, 1, 16,
        %(dossier_id)s, %(scrutin_kind)s, %(theme)s)
ON CONFLICT (vote_id) DO UPDATE SET dossier_id = EXCLUDED.dossier_id
"""

_MART_SQL = """
INSERT INTO analytics_marts.mart_vote_summary
    (vote_id, voted_at, vote_title, result, votes_for, votes_against, abstentions,
     total_voters, summary_plain, theme, dossier_id)
VALUES (%(vote_id)s, %(voted_at)s, %(vote_title)s, %(result)s, 10, 5, 1, 16,
        'Résumé de test.', %(theme)s, %(dossier_id)s)
ON CONFLICT (vote_id) DO NOTHING
"""


def _vote(vote_id, day: date, kind, dossier_id=LOI, theme="Santé") -> dict:
    return {
        "vote_id": vote_id,
        "voted_at": datetime(day.year, day.month, day.day, tzinfo=timezone.utc),
        "vote_title": f"Scrutin de test {vote_id}",
        "result": "adopté",
        "dossier_id": dossier_id,
        "scrutin_kind": kind,
        "theme": theme,
    }


VOTES = [
    _vote("VT-LOI-MOTION", date(2026, 6, 22), "motion"),
    _vote("VT-LOI-ENSEMBLE", date(2026, 6, 30), "ensemble"),
    _vote("VT-LOI-ARTICLE", date(2026, 6, 22), "article"),
    *[
        _vote(f"VT-LOI-AMDT-{i:03d}", date(2026, 6, 22), "amendement")
        for i in range(AMENDMENT_VOTES)
    ],
    _vote("VT-LOI-OTHER", date(2026, 7, 2), "ensemble", dossier_id=LOI_OTHER, theme="Économie"),
    _vote("VT-LOI-L16", date(2026, 7, 3), "ensemble", dossier_id="DLR5L16N-IT", theme=None),
]


@pytest.fixture(scope="module")
def seeded(db_conn):
    with db_conn.cursor() as cur:
        for d in (
            _dossier(LOI, "promulguee", True),
            _dossier(LOI_OTHER, "en_navette", True, parcours_start="2026-05-01"),
            _dossier(LOI_NO_PAGE, "en_commission", False),
        ):
            cur.execute(UPSERT_DOSSIER_SQL, {k: v for k, v in d.items() if k != "_has_scrutins"})
            cur.execute(
                "UPDATE dossiers SET has_scrutins = %s WHERE dossier_uid = %s",
                (d["_has_scrutins"], d["dossier_uid"]),
            )
        # The stale acte is written first, then pushed into the past: a later
        # run's upsert of the dossier leaves it behind, as a vanished acte is.
        cur.execute(UPSERT_ACTE_SQL, STALE_ACTE)
        cur.execute(
            "UPDATE dossier_actes SET last_seen_at = NOW() - INTERVAL '1 day' WHERE acte_uid = %s",
            (STALE_ACTE["acte_uid"],),
        )
        for acte in ACTES:
            cur.execute(UPSERT_ACTE_SQL, acte)
        for v in VOTES:
            cur.execute(_VOTE_SQL, v)
            cur.execute(_MART_SQL, v)
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM analytics_marts.mart_vote_summary WHERE vote_id LIKE 'VT-LOI-%'")
        cur.execute("DELETE FROM votes WHERE vote_id LIKE 'VT-LOI-%'")
        cur.execute("DELETE FROM dossiers WHERE dossier_uid LIKE 'IT-LOI-%'")


@pytest.fixture(scope="module")
def api(seeded):
    with patch("api.main._warm_sql_pool"), TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def page(api):
    resp = api.get(f"/lois/{LOI}")
    assert resp.status_code == 200
    return resp


@pytest.mark.integration
def test_parcours_is_complete_and_ordered(page):
    parcours = page.json()["parcours"]
    assert [a["acte_uid"] for a in parcours] == [a["acte_uid"] for a in ACTES]
    assert parcours[1]["date_acte"] == "2025-03-11"


@pytest.mark.integration
def test_stale_acte_is_hidden(page):
    assert STALE_ACTE["acte_uid"] not in {a["acte_uid"] for a in page.json()["parcours"]}


@pytest.mark.integration
def test_headline_scrutins_attach_to_their_acte(page):
    by_acte = {a["acte_uid"]: a for a in page.json()["parcours"]}
    assert [s["vote_id"] for s in by_acte["IT-A-SEANCE"]["scrutins"]] == ["VT-LOI-MOTION"]
    assert [s["vote_id"] for s in by_acte["IT-A-DEC"]["scrutins"]] == ["VT-LOI-ENSEMBLE"]
    assert by_acte["IT-A-SN-DEPOT"]["scrutins"] == []
    assert by_acte["IT-A-DEPOT"]["scrutins"] == []
    assert by_acte["IT-A-DEC"]["scrutins"][0]["summary_plain"] == "Résumé de test."


@pytest.mark.integration
def test_amendments_are_counted_never_inlined(page):
    body = page.json()
    listed = {s["vote_id"] for a in body["parcours"] for s in a["scrutins"]}
    assert listed == {"VT-LOI-MOTION", "VT-LOI-ENSEMBLE"}
    seance = next(a for a in body["parcours"] if a["acte_uid"] == "IT-A-SEANCE")
    assert seance["amendement_count"] == AMENDMENT_VOTES
    assert seance["article_count"] == 1
    assert body["amendement_count"] == AMENDMENT_VOTES
    # 400 amendment votes must not inflate the page: well under a tenth of
    # what inlining them would cost.
    assert len(page.content) < 10_000


@pytest.mark.integration
def test_coverage_boundary_is_stated(page):
    body = page.json()
    assert body["scrutin_coverage_start"] == "2026-03-26"
    assert body["parcours_predates_coverage"] is True
    assert body["first_scrutin_at"] == "2026-06-22"
    assert body["status"] == "promulguee"
    assert body["status_label"] == "adoptée"


@pytest.mark.integration
def test_amendements_endpoint_lists_them_on_demand(api):
    body = api.get(f"/lois/{LOI}/amendements", params={"limit": 50}).json()
    assert body["total"] == AMENDMENT_VOTES + 1
    assert len(body["items"]) == 50
    assert {i["acte_uid"] for i in body["items"]} == {"IT-A-SEANCE"}
    other_acte = api.get(f"/lois/{LOI}/amendements", params={"acte_uid": "IT-A-DEC"}).json()
    assert other_acte["total"] == 0


@pytest.mark.integration
@pytest.mark.parametrize("uid", [LOI_NO_PAGE, "IT-LOI-UNKNOWN", "DLR5L16N-IT"])
def test_no_page_is_404(api, uid):
    assert api.get(f"/lois/{uid}").status_code == 404
    assert api.get(f"/lois/{uid}/amendements").status_code == 404


@pytest.mark.integration
def test_list_holds_only_dossiers_with_a_page(api):
    body = api.get("/lois", params={"limit": 200}).json()
    uids = [i["dossier_uid"] for i in body["items"]]
    assert LOI_NO_PAGE not in uids
    # Most recent scrutin first.
    assert uids.index(LOI_OTHER) < uids.index(LOI)
    mine = next(i for i in body["items"] if i["dossier_uid"] == LOI)
    assert mine["scrutin_count"] == AMENDMENT_VOTES + 3
    assert mine["headline_scrutin_count"] == 2
    assert mine["theme"] == "Santé"


@pytest.mark.integration
def test_list_filters_and_paginates(api):
    everything = api.get("/lois", params={"limit": 200}).json()["total"]
    by_status = api.get("/lois", params={"status": "en_navette", "limit": 200}).json()
    by_theme = api.get("/lois", params={"theme": "Santé", "limit": 200}).json()
    assert LOI_OTHER in {i["dossier_uid"] for i in by_status["items"]}
    assert LOI not in {i["dossier_uid"] for i in by_status["items"]}
    assert LOI in {i["dossier_uid"] for i in by_theme["items"]}
    assert LOI_OTHER not in {i["dossier_uid"] for i in by_theme["items"]}
    assert by_status["total"] < everything and by_theme["total"] < everything
    one = api.get("/lois", params={"limit": 1}).json()
    assert len(one["items"]) == 1 and one["total"] == everything
    assert api.get("/lois", params={"status": "adoptee"}).status_code == 422


@pytest.mark.integration
def test_vote_dossier_block(api):
    with_page = api.get("/votes/VT-LOI-ENSEMBLE").json()["dossier"]
    assert with_page["dossier_uid"] == LOI
    assert with_page["titre"] == f"Loi de test {LOI}"
    assert with_page["lois_url"].endswith(f"/lois/{LOI}")

    dangling = api.get("/votes/VT-LOI-L16").json()["dossier"]
    assert dangling["dossier_uid"] == "DLR5L16N-IT"
    assert dangling["titre"] is None and dangling["lois_url"] is None

    no_dossier = api.get("/votes/VTANR5L17V0001").json()
    assert no_dossier["dossier"] is None
    assert no_dossier["vote_title"] == "Vote de test numéro 1"
