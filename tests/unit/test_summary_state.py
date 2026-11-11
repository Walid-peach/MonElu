"""
The vote summary lifecycle (#681): each transition, its one writer, and that a
rejected summary is queued again by --retry-rejected and by nothing else.

The statements themselves run against a real Postgres in
tests/integration/test_summary_state.py; these tests pin which transition each
vote takes and who is allowed to write it.
"""

from __future__ import annotations

import pathlib
import re
from unittest.mock import MagicMock, patch

import pytest

from scripts import generate_vote_summaries as gen
from scripts._summaries import (
    SOURCE_TABLE_KINDS,
    SQL_QUEUE_MOTIONS,
    SQL_QUEUE_SOURCED,
    SUMMARY_STATES,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
MIGRATION = ROOT / "data" / "migrations" / "018_summary_state.sql"

AMENDMENT = {
    "vote_id": "V1",
    "vote_title": "l'amendement n° 12 de Mme Durand à l'article 3",
    "result": "adopté",
    "scrutin_kind": "amendement",
    "theme": None,
    "summary_state": "queued",
    "summary_attempts": 0,
    "is_sub_amendment": False,
    "dispositif": "Rendre obligatoire l'étiquetage des produits importés.",
    "expose_sommaire": None,
    "article_label": None,
    "article_text": None,
    "bill_text": None,
}
GOOD_REPLY = '{"summary": "Imposer un étiquetage des produits importés.", "theme": "Économie"}'
GUESS_REPLY = '{"summary": "Agir probablement sur les importations.", "theme": "Économie"}'


def vote(**overrides) -> dict:
    return {**AMENDMENT, **overrides}


def run(rows: list[dict], reply: str | None = GOOD_REPLY, dry_run: bool = False):
    client = MagicMock()
    if reply is None:
        client.chat.completions.create.side_effect = RuntimeError("Groq is down")
    else:
        client.chat.completions.create.return_value.choices[0].message.content = reply
    conn = MagicMock()
    stats = {"generated": 0, "errors": 0}
    executed: list[tuple[str, list[dict]]] = []
    with patch(
        "psycopg2.extras.execute_batch",
        lambda cur, sql, batch: executed.append((sql, list(batch))),
    ):
        gen.process_batch(client, rows, dry_run, conn, stats)
    return client, executed, stats


def transitions(executed) -> dict[str, str]:
    """vote_id -> the transition its row was written with."""
    sql_to_transition = {sql: name for name, sql in gen.SQL_TRANSITIONS.items()}
    return {row["vote_id"]: sql_to_transition[sql] for sql, batch in executed for row in batch}


class TestGeneratorTransitions:
    def test_queued_to_published(self):
        _, executed, stats = run([vote()])
        assert transitions(executed) == {"V1": gen.PUBLISH}
        row = executed[0][1][0]
        assert row["basis"] == "official_text" and row["summary"].startswith("Imposer")
        assert stats["generated"] == 1

    def test_queued_to_rejected_stores_the_reason(self):
        _, executed, stats = run([vote()], GUESS_REPLY)
        assert transitions(executed) == {"V1": gen.REJECT}
        assert executed[0][1][0]["reason"] == "guess"
        assert stats["rejected"] == {"guess": 1} and stats["generated"] == 0

    def test_an_llm_error_counts_an_attempt_and_stays_queued(self):
        _, executed, stats = run([vote()], reply=None)
        assert transitions(executed) == {"V1": gen.FAIL}
        assert stats["errors"] == 1 and "stuck" not in stats

    def test_an_unparseable_reply_counts_an_attempt(self):
        _, executed, stats = run([vote()], "pas de json")
        assert transitions(executed) == {"V1": gen.FAIL}
        assert stats["errors"] == 1

    def test_a_queued_motion_is_published_by_code(self):
        motion = vote(
            vote_title="la motion de censure déposée par Mme Le Pen.",
            scrutin_kind="motion",
            result="rejeté",
            theme="Institutions",
            dispositif=None,
        )
        client, executed, _ = run([motion])
        client.chat.completions.create.assert_not_called()
        assert transitions(executed) == {"V1": gen.PUBLISH}
        assert executed[0][1][0]["basis"] == "procedure"

    def test_a_queued_motion_whose_theme_call_fails_stays_queued(self):
        motion = vote(vote_title="la motion de censure", scrutin_kind="motion", dispositif=None)
        _, executed, _ = run([motion], "pas de json")
        assert transitions(executed) == {"V1": gen.FAIL}

    def test_a_queued_vote_with_no_text_is_rejected_not_looped(self):
        """Its kind changed after it was queued; it must not sit in the queue forever."""
        orphan = vote(scrutin_kind="autre", dispositif=None, theme="Autre")
        _, executed, _ = run([orphan])
        assert transitions(executed) == {"V1": gen.REJECT}
        assert executed[0][1][0]["reason"] == "no_source_text"

    def test_a_vote_with_no_source_only_gets_a_theme(self):
        _, executed, _ = run([vote(summary_state="no_source", scrutin_kind="ensemble")])
        assert transitions(executed) == {"V1": gen.THEME}

    def test_a_failed_theme_on_a_vote_with_no_source_writes_nothing(self):
        row = vote(summary_state="no_source", scrutin_kind="ensemble")
        _, executed, stats = run([row], "pas de json")
        assert executed == [] and stats["errors"] == 1

    @pytest.mark.parametrize("reply", [GOOD_REPLY, '{"theme": "Autre"}'])
    def test_a_rejected_vote_is_never_retried_by_a_run(self, reply):
        """Even with official text and a reply that would now pass the guards."""
        row = vote(summary_state="rejected", scrutin_kind="ensemble", bill_text="Article 1 : x")
        client, executed, _ = run([row], reply)
        system = client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
        assert "N'écris aucun résumé" in system
        assert transitions(executed) == {"V1": gen.THEME}

    def test_a_published_vote_is_never_rewritten(self):
        row = vote(summary_state="published", scrutin_kind="ensemble", bill_text="Article 1 : x")
        _, executed, _ = run([row], '{"theme": "Autre"}')
        assert transitions(executed) == {"V1": gen.THEME}

    def test_a_dry_run_writes_nothing(self):
        _, executed, stats = run([vote()], dry_run=True)
        assert executed == [] and stats["generated"] == 1

    def test_failures_are_not_reported_as_changed_pages(self):
        _, _, stats = run([vote(vote_id="V1"), vote(vote_id="V2", dispositif="Autre texte.")])
        assert stats["summarized_vote_ids"] == ["V1", "V2"]
        _, _, stats = run([vote()], reply=None)
        assert stats["summarized_vote_ids"] == []


class TestAttemptThreshold:
    def test_the_failure_that_reaches_the_threshold_is_reported(self):
        row = vote(summary_attempts=gen.MAX_SUMMARY_ATTEMPTS - 1)
        _, _, stats = run([row, vote(vote_id="V2", dispositif="Autre texte.")], reply=None)
        assert stats["stuck"] == ["V1"]

    def test_a_stuck_vote_fails_the_run_even_when_others_succeeded(self):
        with pytest.raises(SystemExit) as exc_info:
            gen.check_summary_yield({"generated": 12, "errors": 1, "stuck": ["V1"]})
        assert exc_info.value.code == 1

    def test_failures_below_the_threshold_stay_green(self):
        _, _, stats = run([vote(summary_attempts=gen.MAX_SUMMARY_ATTEMPTS - 2)], reply=None)
        stats["generated"] = 1
        gen.check_summary_yield(stats)


class TestTransitionSql:
    def test_every_summary_transition_leaves_only_the_queued_state(self):
        for name in (gen.PUBLISH, gen.REJECT, gen.FAIL):
            assert "AND summary_state = 'queued'" in gen.SQL_TRANSITIONS[name], name

    def test_a_theme_never_touches_the_state(self):
        assert "summary_state" not in gen.SQL_TRANSITIONS[gen.THEME]
        assert "summary_plain" not in gen.SQL_TRANSITIONS[gen.THEME]

    def test_no_transition_touches_the_an_facing_columns(self):
        """ADR-039: a summary is our own text, not a new AN record."""
        statements = [
            *gen.SQL_TRANSITIONS.values(),
            gen.SQL_RETRY_REJECTED,
            SQL_QUEUE_MOTIONS,
            *SQL_QUEUE_SOURCED.values(),
        ]
        for sql in statements:
            assert "ingested_at" not in sql and "changed_at" not in sql

    def test_the_pending_query_reads_the_state(self):
        assert "v.summary_state = 'queued'" in gen.SQL_PENDING
        assert "summary_basis" not in gen.SQL_PENDING

    def test_queueing_starts_only_from_no_source(self):
        for sql in (SQL_QUEUE_MOTIONS, *SQL_QUEUE_SOURCED.values()):
            assert "summary_state = 'no_source'" in sql

    def test_each_source_table_queues_the_kinds_the_generator_reads_from_it(self):
        assert SOURCE_TABLE_KINDS == {
            "vote_amendments": ("amendement",),
            "vote_articles": ("article",),
            "vote_bills": ("ensemble", "autre"),
        }
        for table, kinds in SOURCE_TABLE_KINDS.items():
            assert f"FROM {table} s" in SQL_QUEUE_SOURCED[table]
            for kind in kinds:
                assert f"'{kind}'" in SQL_QUEUE_SOURCED[table]


class TestOneWriterPerTransition:
    def _scripts_setting(self, pattern: str) -> dict[str, int]:
        found = {}
        for path in SCRIPTS.glob("*.py"):
            count = len(re.findall(pattern, path.read_text()))
            if count:
                found[path.name] = count
        return found

    def test_only_the_queue_statements_and_the_retry_flag_set_queued(self):
        assert self._scripts_setting(r"SET summary_state = 'queued'") == {
            "_summaries.py": 2,  # the source-table template and the motions
            "generate_vote_summaries.py": 1,  # SQL_RETRY_REJECTED
        }

    def test_the_retry_statement_runs_only_under_its_flag(self):
        source = (SCRIPTS / "generate_vote_summaries.py").read_text()
        assert source.count("SQL_RETRY_REJECTED") == 2  # its definition and one execute
        assert "if args.retry_rejected:\n                cur.execute(SQL_RETRY_REJECTED)" in source

    def test_only_the_generator_publishes_or_rejects(self):
        assert self._scripts_setting(r"summary_state = '(?:published|rejected)'") == {
            "generate_vote_summaries.py": 3,  # publish, reject, and the retry's WHERE
        }

    @pytest.mark.parametrize(
        "script, table",
        [
            ("ingest_amendments.py", "vote_amendments"),
            ("ingest_articles.py", "vote_articles"),
            ("ingest_bills.py", "vote_bills"),
        ],
    )
    def test_each_ingestion_script_queues_what_it_attached(self, script, table):
        assert f'queue_sourced_votes(cur, "{table}")' in (SCRIPTS / script).read_text()

    def test_ingest_votes_queues_motions_after_classifying_them(self):
        source = (SCRIPTS / "ingest_votes.py").read_text()
        main = source[source.index("def main(") :]
        assert main.index("backfill_scrutin_kinds()") < main.index("queue_motion_summaries()")


class TestStatesAgreeWithTheMigration:
    def test_the_check_lists_the_same_states(self):
        sql = MIGRATION.read_text()
        check = re.search(r"CHECK \(summary_state IN \(([^)]*)\)\)", sql).group(1)
        assert tuple(s.strip(" '") for s in check.split(",")) == SUMMARY_STATES

    def test_summary_basis_no_longer_holds_a_rejection(self):
        sql = MIGRATION.read_text()
        assert "CHECK (summary_basis IN ('official_text', 'procedure'))" in sql


class TestStateCounts:
    def test_every_state_is_listed_even_when_empty(self):
        table = gen.state_counts_markdown({"queued": 4, "published": 900})
        assert table.splitlines()[2:] == [
            "| no_source | 0 |",
            "| queued | 4 |",
            "| published | 900 |",
            "| rejected | 0 |",
        ]

    def test_the_backfill_job_summary_prints_them(self):
        yaml = pytest.importorskip("yaml")
        workflow = ROOT / ".github" / "workflows" / "summarize_backfill.yml"
        steps = yaml.safe_load(workflow.read_text())["jobs"]["backfill"]["steps"]
        step = next(s for s in steps if s.get("name") == "Report summary states")
        assert "--state-counts" in step["run"] and "GITHUB_STEP_SUMMARY" in step["run"]
        assert "cancelled()" in step["if"]
