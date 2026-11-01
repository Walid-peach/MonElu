"""
Unit tests for api/an_links.py (#617).

The AN serves a scrutin at `/dyn/<legislature>/scrutins/<number>`; the full uid
in that path is a 404. `frontend/__tests__/lib/an.test.ts` pins the same cases
for the website's copy.
"""

import pytest

from api.an_links import an_scrutin_url


def test_builds_the_url_from_legislature_and_number():
    assert an_scrutin_url("VTANR5L17V9025") == (
        "https://www.assemblee-nationale.fr/dyn/17/scrutins/9025"
    )
    assert an_scrutin_url("VTANR5L16V1") == "https://www.assemblee-nationale.fr/dyn/16/scrutins/1"


@pytest.mark.parametrize("vote_id", [None, "", "9025", "VTANR5L17V9025/../admin", "NONEXISTENT"])
def test_returns_none_rather_than_a_guessed_url(vote_id):
    assert an_scrutin_url(vote_id) is None
