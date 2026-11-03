"""Vote list items carry their bill block, from one query per page (#371)."""

from unittest.mock import MagicMock

from api.routers.votes import _attach_dossiers


def test_one_query_names_every_bill_and_only_a_bill_with_a_page_links_to_it():
    cur = MagicMock()
    cur.fetchall.return_value = [
        {
            "dossier_uid": "DLR5L17N1",
            "titre": "Fin de vie",
            "status": "promulguee",
            "has_scrutins": True,
        },
        {
            "dossier_uid": "DLR5L17N2",
            "titre": "Sans page",
            "status": "deposee",
            "has_scrutins": False,
        },
    ]
    rows = [
        {"vote_id": "V1", "dossier_id": "DLR5L17N1"},
        {"vote_id": "V2", "dossier_id": "DLR5L17N2"},
        {"vote_id": "V3", "dossier_id": "DLR5L17N1"},
        {"vote_id": "V4", "dossier_id": None},
        {"vote_id": "V5", "dossier_id": "DLR5L16N9"},
    ]
    _attach_dossiers(cur, rows)

    assert cur.execute.call_count == 1
    assert cur.execute.call_args.args[1] == {
        "dossier_uids": ["DLR5L16N9", "DLR5L17N1", "DLR5L17N2"]
    }
    assert rows[0]["dossier"].lois_url.endswith("/lois/DLR5L17N1")
    assert rows[1]["dossier"].lois_url is None
    assert rows[3]["dossier"] is None
    assert rows[4]["dossier"].dossier_uid == "DLR5L16N9" and rows[4]["dossier"].lois_url is None


def test_a_page_with_no_bill_makes_no_query():
    cur = MagicMock()
    rows = [{"vote_id": "V1", "dossier_id": None}]
    _attach_dossiers(cur, rows)
    cur.execute.assert_not_called()
    assert rows[0]["dossier"] is None
