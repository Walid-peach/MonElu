"""The comment ratchet of ADR-050: what counts as a comment, and that it only tightens."""

import json

import pytest

from scripts import comments


def texts(found):
    return [c.text.strip() for c in found]


def test_python_counts_comments_not_strings_docstrings_or_directives():
    source = (
        '"""A docstring # with a hash."""\n'
        "x = '# not a comment'\n"
        "# a comment\n"
        "y = 1  # trailing\n"
        "import os  # noqa: F401\n"
        "z = 2  # type: ignore[assignment]\n"
        'KEY = "sk-x"  # pragma: allowlist secret\n'
    )
    found = comments.python_comments("m.py", source)
    assert texts(found) == ["# a comment", "# trailing"]
    assert [c.full_line for c in found] == [True, False]


def test_sql_counts_line_block_and_jinja_comments_outside_strings():
    source = (
        "-- depends_on: {{ ref('stg_votes') }}\n"
        "SELECT '-- not a comment', 'it''s' -- trailing\n"
        "/* block\n   two */\n"
        "{# jinja #}\n"
    )
    assert texts(comments.sql_comments("m.sql", source)) == [
        "-- trailing",
        "/* block",
        "two */",
        "{# jinja #}",
    ]


def test_swift_skips_strings_and_nests_block_comments():
    source = (
        'let url = "https://example.org" // trailing\n'
        '"""\n// inside a multi-line string\n"""\n'
        "/* outer /* inner */ still outer */\n"
        "// swiftlint:disable:next force_unwrapping\n"
    )
    found = comments.c_like_comments("m.swift", source, nested=True, line_comments=True)
    assert texts(found) == ["// trailing", "/* outer /* inner */ still outer */"]


def test_hash_languages_ignore_quoted_hashes_and_shebangs():
    source = (
        "#!/usr/bin/env bash\n"
        "# own line\n"
        'echo "#not" # trailing\n'
        "url: https://example.org/#anchor\n"
        "color: '#fff'\n"
    )
    assert texts(comments.hash_comments("m.sh", source)) == ["# own line", "# trailing"]


@pytest.fixture
def ratchet(tmp_path, monkeypatch):
    baseline = tmp_path / "comment-baseline.json"
    monkeypatch.setattr(comments, "BASELINE", baseline)
    found = {}
    monkeypatch.setattr(comments, "tracked_files", lambda: sorted(found))
    monkeypatch.setattr(
        comments,
        "scan",
        lambda paths: {
            p: [comments.Comment(p, i + 1, "# c", True) for i in range(found[p])]
            for p in paths
            if found.get(p)
        },
    )
    return baseline, found


def test_check_fails_on_a_new_comment_and_on_a_stale_allowance(ratchet, capsys):
    baseline, found = ratchet
    baseline.write_text(json.dumps({"a.py": 2}))
    found.update({"a.py": 2})
    assert comments.check(None) == 0
    found["b.py"] = 1
    assert comments.check(None) == 1
    found.pop("b.py")
    found["a.py"] = 1
    assert comments.check(None) == 1
    assert "comments.py update" in capsys.readouterr().out


def test_check_on_named_files_ignores_the_others(ratchet):
    baseline, found = ratchet
    baseline.write_text(json.dumps({"a.py": 1}))
    found.update({"a.py": 1, "b.py": 2})
    assert comments.check(None, ["a.py"]) == 0
    assert comments.check(None, ["b.py"]) == 1


def test_update_lowers_but_never_raises_an_allowance(ratchet):
    baseline, found = ratchet
    baseline.write_text(json.dumps({"a.py": 2}))
    found.update({"a.py": 1})
    assert comments.update() == 0
    assert json.loads(baseline.read_text()) == {"a.py": 1}
    found["a.py"] = 3
    assert comments.update() == 1
    assert json.loads(baseline.read_text()) == {"a.py": 1}


def test_api_carries_no_comments():
    assert comments.scan([p for p in comments.tracked_files() if p.startswith("api/")]) == {}


def test_baseline_has_no_allowance_for_api():
    baseline = json.loads(comments.BASELINE.read_text())
    assert not [path for path in baseline if path.startswith("api/")]
