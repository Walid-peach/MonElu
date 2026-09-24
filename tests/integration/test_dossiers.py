"""
Integration tests for the dossier upserts (MON-243 / GH #368, ADR-035).

Exercises the real SQL against a live Postgres: the composite `(dossier_uid,
acte_uid)` primary key and the `has_scrutins` recomputation are both things a
mocked cursor cannot check.
"""

import pytest

from scripts.ingest_dossiers import (
    RECOMPUTE_HAS_SCRUTINS_SQL,
    UPSERT_ACTE_SQL,
    UPSERT_DOSSIER_SQL,
)

DOSSIER_A = "IT-DOSSIER-A"
DOSSIER_B = "IT-DOSSIER-B"
SHARED_ACTE = "IT-ACTE-SHARED"


def _dossier(uid: str, status: str = "en_navette", **overrides) -> dict:
    row = {
        "dossier_uid": uid,
        "legislature": "17",
        "titre": f"Dossier de test {uid}",
        "titre_chemin": f"dossier_de_test_{uid.lower()}",
        "procedure_code": "2",
        "procedure_label": "Proposition de loi ordinaire",
        "initiateur": "PA001",
        "status": status,
        "status_label": "adoptée",
        "current_stage": "AN1",
        "parcours_start": "2025-03-11",
        "parcours_end": "2025-05-27",
    }
    row.update(overrides)
    return row


def _acte(dossier_uid: str, acte_uid: str, code_acte: str, **overrides) -> dict:
    row = {
        "dossier_uid": dossier_uid,
        "acte_uid": acte_uid,
        "parent_uid": None,
        "depth": 0,
        "ordinal": 0,
        "code_acte": code_acte,
        "acte_type": "Etape_Type",
        "libelle": "Étape de test",
        "date_acte": "2025-06-10",
        "statut_label": None,
        "organe_ref": "PO838901",
    }
    row.update(overrides)
    return row


@pytest.fixture
def _cleanup_dossiers(db_conn):
    yield
    with db_conn.cursor() as cur:
        # dossier_actes cascades from dossiers.
        cur.execute("DELETE FROM dossiers WHERE dossier_uid LIKE 'IT-DOSSIER-%'")
        cur.execute("DELETE FROM votes WHERE vote_id LIKE 'VT-DOSSIER-%'")


@pytest.mark.integration
def test_same_acte_uid_upserts_under_two_dossiers(db_conn, _cleanup_dossiers):
    """The composite primary key, exercised against the real constraint.

    43 acte uids in the export belong to two different dossiers each (merged
    dossiers sharing one procedural event). A single-column `acte_uid` key would
    raise a unique violation here on first ingestion — ADR-035 §3.
    """
    with db_conn.cursor() as cur:
        cur.execute(UPSERT_DOSSIER_SQL, _dossier(DOSSIER_A))
        cur.execute(UPSERT_DOSSIER_SQL, _dossier(DOSSIER_B))
        cur.execute(UPSERT_ACTE_SQL, _acte(DOSSIER_A, SHARED_ACTE, "AN21-DGVT"))
        cur.execute(UPSERT_ACTE_SQL, _acte(DOSSIER_B, SHARED_ACTE, "ANNLEC-DGVT"))

        cur.execute(
            "SELECT dossier_uid, code_acte FROM dossier_actes "
            "WHERE acte_uid = %s ORDER BY dossier_uid",
            (SHARED_ACTE,),
        )
        rows = cur.fetchall()

    assert [(r["dossier_uid"], r["code_acte"]) for r in rows] == [
        (DOSSIER_A, "AN21-DGVT"),
        (DOSSIER_B, "ANNLEC-DGVT"),
    ]


@pytest.mark.integration
def test_second_run_changes_no_row_count_and_no_changed_at(db_conn, _cleanup_dossiers):
    """Re-running the ingestion is a no-op: same counts, `changed_at` frozen."""
    with db_conn.cursor() as cur:
        cur.execute(UPSERT_DOSSIER_SQL, _dossier(DOSSIER_A))
        cur.execute(UPSERT_ACTE_SQL, _acte(DOSSIER_A, "IT-ACTE-1", "AN1"))
        cur.execute("SELECT changed_at FROM dossiers WHERE dossier_uid = %s", (DOSSIER_A,))
        first_changed_at = cur.fetchone()["changed_at"]

        cur.execute(UPSERT_DOSSIER_SQL, _dossier(DOSSIER_A))
        cur.execute(UPSERT_ACTE_SQL, _acte(DOSSIER_A, "IT-ACTE-1", "AN1"))

        cur.execute(
            "SELECT changed_at, ingested_at, last_seen_at FROM dossiers WHERE dossier_uid = %s",
            (DOSSIER_A,),
        )
        row = cur.fetchone()
        cur.execute("SELECT COUNT(*) AS n FROM dossier_actes WHERE dossier_uid = %s", (DOSSIER_A,))
        assert cur.fetchone()["n"] == 1

    # `changed_at` is frozen while `ingested_at`/`last_seen_at` move: the
    # run stamp and the change stamp are two different signals (GH #353).
    assert row["changed_at"] == first_changed_at
    assert row["ingested_at"] >= first_changed_at
    assert row["last_seen_at"] >= first_changed_at


@pytest.mark.integration
def test_changed_field_moves_changed_at(db_conn, _cleanup_dossiers):
    with db_conn.cursor() as cur:
        cur.execute(UPSERT_DOSSIER_SQL, _dossier(DOSSIER_A, status="en_commission"))
        cur.execute("SELECT changed_at FROM dossiers WHERE dossier_uid = %s", (DOSSIER_A,))
        before = cur.fetchone()["changed_at"]

        cur.execute(UPSERT_DOSSIER_SQL, _dossier(DOSSIER_A, status="promulguee"))
        cur.execute("SELECT status, changed_at FROM dossiers WHERE dossier_uid = %s", (DOSSIER_A,))
        after = cur.fetchone()

    assert after["status"] == "promulguee"
    assert after["changed_at"] > before


@pytest.mark.integration
def test_has_scrutins_is_recomputed_from_votes(db_conn, _cleanup_dossiers):
    """ADR-035 §6: a bill acquires its page automatically on its first scrutin,
    and loses it again if the reference goes away. The flag is recomputed from
    `votes.dossier_id` on every run, never carried forward."""
    with db_conn.cursor() as cur:
        cur.execute(UPSERT_DOSSIER_SQL, _dossier(DOSSIER_A))
        cur.execute(UPSERT_DOSSIER_SQL, _dossier(DOSSIER_B))

        cur.execute(RECOMPUTE_HAS_SCRUTINS_SQL)
        cur.execute(
            "SELECT dossier_uid, has_scrutins FROM dossiers "
            "WHERE dossier_uid IN (%s, %s) ORDER BY dossier_uid",
            (DOSSIER_A, DOSSIER_B),
        )
        assert [r["has_scrutins"] for r in cur.fetchall()] == [False, False]

        cur.execute(
            "INSERT INTO votes (vote_id, voted_at, vote_title, result, dossier_id) "
            "VALUES ('VT-DOSSIER-1', '2026-06-22', 'Vote de test dossier', "
            "'adopté', %s) ON CONFLICT (vote_id) DO UPDATE SET dossier_id = EXCLUDED.dossier_id",
            (DOSSIER_A,),
        )
        cur.execute(RECOMPUTE_HAS_SCRUTINS_SQL)
        cur.execute(
            "SELECT dossier_uid, has_scrutins, changed_at FROM dossiers "
            "WHERE dossier_uid IN (%s, %s) ORDER BY dossier_uid",
            (DOSSIER_A, DOSSIER_B),
        )
        after = cur.fetchall()
        assert [r["has_scrutins"] for r in after] == [True, False]
        # Only the flipped row is written, so only its changed_at moves.
        assert after[0]["changed_at"] is not None

        # A second recompute with nothing new flips nothing.
        cur.execute(RECOMPUTE_HAS_SCRUTINS_SQL)
        assert cur.rowcount == 0

        # The reference goes away: the flag comes back off.
        cur.execute("UPDATE votes SET dossier_id = NULL WHERE vote_id = 'VT-DOSSIER-1'")
        cur.execute(RECOMPUTE_HAS_SCRUTINS_SQL)
        cur.execute("SELECT has_scrutins FROM dossiers WHERE dossier_uid = %s", (DOSSIER_A,))
        assert cur.fetchone()["has_scrutins"] is False


@pytest.mark.integration
def test_acte_rows_cascade_when_a_dossier_is_deleted(db_conn, _cleanup_dossiers):
    """Nothing in the pipeline deletes (CLAUDE.md decision 8), but the FK is what
    keeps an orphaned parcours impossible if anything ever does."""
    with db_conn.cursor() as cur:
        cur.execute(UPSERT_DOSSIER_SQL, _dossier(DOSSIER_A))
        cur.execute(UPSERT_ACTE_SQL, _acte(DOSSIER_A, "IT-ACTE-1", "AN1"))
        cur.execute("DELETE FROM dossiers WHERE dossier_uid = %s", (DOSSIER_A,))
        cur.execute("SELECT COUNT(*) AS n FROM dossier_actes WHERE dossier_uid = %s", (DOSSIER_A,))
        assert cur.fetchone()["n"] == 0
