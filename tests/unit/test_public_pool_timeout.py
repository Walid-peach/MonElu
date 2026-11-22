"""The public pool's statement timeout cannot be bypassed from `api/` (#720).

`api.db._TimedCursor` sets the timeout, and only cursors the pool's own factory
builds are timed: an explicit `cursor_factory=` on a `get_conn()` connection would
leave its whole transaction untimed, with nothing reporting it. The live behaviour
is in tests/integration/test_statement_timeout.py.
"""

import re
from pathlib import Path

ROOT = Path(__file__).parents[2]

CURSOR_FACTORY = re.compile(r"cursor_factory\s*=")


def test_api_builds_cursors_only_through_the_pool_factory():
    allowed = {"api/db.py"}
    offenders = [
        f"{path.relative_to(ROOT)}:{n}"
        for path in sorted((ROOT / "api").rglob("*.py"))
        if str(path.relative_to(ROOT)) not in allowed
        for n, line in enumerate(path.read_text().splitlines(), start=1)
        if CURSOR_FACTORY.search(line)
    ]
    assert offenders == [], f"a cursor_factory here skips the statement timeout: {offenders}"


def test_init_pool_has_one_construction_and_it_is_timed():
    source = (ROOT / "api/db.py").read_text()
    init_pool = source[source.index("def init_pool(") : source.index("def close_pool(")]
    assert init_pool.count("ThreadedConnectionPool(") == 1
    assert "cursor_factory=_TimedCursor" in init_pool
    assert "except" not in init_pool
