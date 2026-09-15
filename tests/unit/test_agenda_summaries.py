"""
Tests for scripts/generate_agenda_summaries.py (MON-211, ADR-030 §5).

The Groq client is stubbed throughout - no test here spends a token. Three
properties carry the ADR and are each worth a failing test:

* a stub `objet` produces **no LLM call at all**, not merely a discarded one -
  the cost and the invented-specifics risk are both in the call itself;
* a second run over already-summarized items issues zero calls;
* a reworded item is picked up again, which is a property of the ingest
  upsert rather than of this script, so it is asserted against the SQL.
"""

from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from scripts.generate_agenda_summaries import (
    CANDIDATE_SQL,
    STUB_OBJET_MAX_LEN,
    is_stub,
    process_batch,
)

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"

SUBSTANTIVE = (
    "Suite de la discussion du projet de loi de financement de la sécurité sociale pour 2026"
)


def _client(payload: str) -> Mock:
    """A Groq stub whose every completion returns `payload`."""
    client = Mock()
    message = Mock()
    message.content = payload
    choice = Mock()
    choice.message = message
    response = Mock()
    response.choices = [choice]
    client.chat.completions.create.return_value = response
    return client


def _ok_payload(
    summary: str = "Le texte finance la sécurité sociale.", theme: str = "Santé & Social"
):
    return f'{{"summary": "{summary}", "theme": "{theme}"}}'


def _conn() -> Mock:
    conn = Mock()
    conn.cursor.return_value.__enter__ = Mock(return_value=Mock())
    conn.cursor.return_value.__exit__ = Mock(return_value=False)
    return conn


def _stats() -> dict:
    return {"generated": 0, "errors": 0, "stubs": 0}


class TestIsStub:
    """ADR-030 §5: no LLM call where there is nothing to summarize."""

    @pytest.mark.parametrize(
        "objet",
        ["Discussion", "Questions au Gouvernement", "", "   ", None],
    )
    def test_bare_labels_are_stubs(self, objet):
        assert is_stub(objet) is True

    def test_objet_identical_to_point_type_is_a_stub(self):
        # Even a longer value says nothing the point type did not already say.
        assert is_stub("Déclaration du Gouvernement", "déclaration du gouvernement") is True

    def test_substantive_objet_is_not_a_stub(self):
        assert is_stub(SUBSTANTIVE, "Discussion") is False

    def test_threshold_is_the_measured_one(self):
        """The 30-char bound comes from the MON-208 spike, not from taste."""
        assert STUB_OBJET_MAX_LEN == 30
        assert is_stub("x" * STUB_OBJET_MAX_LEN) is True
        assert is_stub("x" * (STUB_OBJET_MAX_LEN + 1)) is False


class TestProcessBatch:
    def test_stub_items_never_reach_the_llm(self):
        client = _client(_ok_payload())
        stats = _stats()
        batch = [
            {"point_uid": "PT1", "objet": "Discussion", "point_type": "Discussion"},
            {"point_uid": "PT2", "objet": "Questions au Gouvernement", "point_type": None},
        ]

        process_batch(client, batch, dry_run=False, conn=_conn(), stats=stats)

        client.chat.completions.create.assert_not_called()
        assert stats == {"generated": 0, "errors": 0, "stubs": 2}

    def test_substantive_item_is_summarized_and_written(self):
        client = _client(_ok_payload())
        conn = _conn()
        stats = _stats()
        batch = [{"point_uid": "PT1", "objet": SUBSTANTIVE, "point_type": "Discussion"}]

        with patch("scripts.generate_agenda_summaries.psycopg2.extras.execute_batch") as batched:
            process_batch(client, batch, dry_run=False, conn=conn, stats=stats)

        assert client.chat.completions.create.call_count == 1
        assert stats["generated"] == 1
        # The write is one batched UPDATE, then a commit - not a commit per item.
        assert batched.call_count == 1
        conn.commit.assert_called_once()

    def test_dry_run_calls_the_model_but_writes_nothing(self):
        client = _client(_ok_payload())
        conn = _conn()
        stats = _stats()
        batch = [{"point_uid": "PT1", "objet": SUBSTANTIVE, "point_type": "Discussion"}]

        process_batch(client, batch, dry_run=True, conn=conn, stats=stats)

        assert client.chat.completions.create.call_count == 1
        assert stats["generated"] == 1
        conn.commit.assert_not_called()

    def test_procedural_objet_gets_the_procedural_prompt(self):
        from rag.chain.prompts import SUMMARY_PROMPT_PROCEDURAL

        client = _client(_ok_payload(theme="Institutions"))
        batch = [
            {
                "point_uid": "PT1",
                "objet": "Discussion de la motion de censure déposée le 3 mars 2026",
                "point_type": "Discussion",
            }
        ]

        process_batch(client, batch, dry_run=True, conn=_conn(), stats=_stats())

        sent = client.chat.completions.create.call_args.kwargs["messages"]
        assert sent[0]["content"] == SUMMARY_PROMPT_PROCEDURAL
        assert "motion de censure" in sent[1]["content"]

    def test_substantive_objet_gets_the_standard_prompt(self):
        from rag.chain.prompts import SUMMARY_PROMPT

        client = _client(_ok_payload())
        batch = [{"point_uid": "PT1", "objet": SUBSTANTIVE, "point_type": "Discussion"}]

        process_batch(client, batch, dry_run=True, conn=_conn(), stats=_stats())

        sent = client.chat.completions.create.call_args.kwargs["messages"]
        assert sent[0]["content"] == SUMMARY_PROMPT
        # An agenda item has not been voted yet - promising a result would be a lie.
        assert "Résultat" not in sent[1]["content"]

    def test_theme_outside_the_vocabulary_is_remapped_before_writing(self):
        """A theme the model invented must never reach the column the UI filters on."""
        client = _client(_ok_payload(theme="Sport & Loisirs"))
        conn = _conn()
        stats = _stats()
        batch = [{"point_uid": "PT1", "objet": SUBSTANTIVE, "point_type": "Discussion"}]

        with patch("scripts.generate_agenda_summaries.psycopg2.extras.execute_batch") as batched:
            process_batch(client, batch, dry_run=False, conn=conn, stats=stats)

        rows = batched.call_args.args[2]
        assert rows == [("Le texte finance la sécurité sociale.", "Autre", "PT1")]
        assert stats["generated"] == 1

    def test_unparseable_response_is_counted_as_an_error_not_written(self):
        client = _client("je ne sais pas")
        conn = _conn()
        stats = _stats()
        batch = [{"point_uid": "PT1", "objet": SUBSTANTIVE, "point_type": "Discussion"}]

        process_batch(client, batch, dry_run=False, conn=conn, stats=stats)

        assert stats == {"generated": 0, "errors": 1, "stubs": 0}
        conn.commit.assert_not_called()


class TestIdempotence:
    def test_candidate_query_only_selects_unsummarized_items(self):
        """Second run, zero LLM calls: the sweep is scoped by summary_plain IS NULL."""
        assert "summary_plain IS NULL" in CANDIDATE_SQL

    def test_candidate_query_mirrors_the_api_visibility_filter(self):
        """Summarizing an item GET /agenda hides is spend with nothing to show."""
        assert "last_seen_at = (SELECT MAX(last_seen_at) FROM agenda_items)" in CANDIDATE_SQL
        assert "reunion_etat NOT IN" in CANDIDATE_SQL
        assert "point_etat IS NULL OR point_etat NOT IN" in CANDIDATE_SQL
        assert "sitting_start >=" in CANDIDATE_SQL


class TestRegenerationOnRewordedObjet:
    """The regeneration trigger lives in the ingest upsert, so assert it there.

    Without this, a reworded item keeps a summary describing text it no longer
    carries, and nothing in the pipeline would ever notice: objet_hash is
    overwritten on every upsert, so it cannot by itself report staleness.
    """

    def test_upsert_clears_both_summary_columns_when_objet_hash_changes(self):
        source = (SCRIPTS_DIR / "ingest_agenda.py").read_text(encoding="utf-8")
        assert "summary_plain   = CASE" in source
        assert "theme           = CASE" in source
        assert source.count("agenda_items.objet_hash IS DISTINCT FROM EXCLUDED.objet_hash") == 2

    def test_upsert_preserves_the_summary_when_the_objet_is_unchanged(self):
        """The other half: an unchanged item must not be re-summarized daily."""
        source = (SCRIPTS_DIR / "ingest_agenda.py").read_text(encoding="utf-8")
        assert "ELSE agenda_items.summary_plain END" in source
        assert "ELSE agenda_items.theme END" in source


class TestPipelineWiring:
    def test_step_runs_in_the_prod_pipeline_and_is_non_critical(self):
        """A Groq outage must not abort the run before dbt and the RAG rebuild."""
        source = (SCRIPTS_DIR / "run_ingestion_prod.py").read_text(encoding="utf-8")
        assert "generate_agenda_summaries.py" in source
        agenda_step = source.split('"Agenda summaries"', 1)[1].split(")", 1)[0]
        assert "critical=False" in agenda_step
        assert 'soft_failures.append("Agenda summaries")' in source
