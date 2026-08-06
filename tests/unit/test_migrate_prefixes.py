"""
Guards the migration numeric-prefix ordering contract (MON-226): two files
sharing a prefix would sort ambiguously once a later migration depends on order.
"""

import glob
import os

import pytest

from scripts.migrate import (
    MIGRATIONS_DIR,
    assert_unique_numeric_prefixes,
)


def test_current_migration_files_pass():
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    assert_unique_numeric_prefixes(migration_files)


def test_new_duplicate_prefix_is_rejected():
    with pytest.raises(AssertionError, match="010"):
        assert_unique_numeric_prefixes(["010_x.sql", "010_y.sql", "011_z.sql"])


def test_grandfathered_005_duplicate_is_allowed():
    assert_unique_numeric_prefixes(["005_feedback.sql", "005_verifications.sql"])


def test_non_matching_filenames_are_ignored():
    assert_unique_numeric_prefixes(["README.sql", "001_init.sql"])
