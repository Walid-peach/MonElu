"""The placeholder-secret check has one definition, in `api/config.py` (#725)."""

import ast
from pathlib import Path

import pytest

from api import config
from api import main as api_main
from api.routers import verify

API_DIR = Path(__file__).resolve().parents[2] / "api"


@pytest.mark.parametrize(
    "value",
    [None, "", "   ", "sk-...", "gsk_...", "your-key", "changeme"],  # pragma: allowlist secret
)
def test_placeholder_values_are_detected(value):
    assert config.is_placeholder(value)


@pytest.mark.parametrize("value", ["sk-real", "gsk_real", "postgresql://u@h/db"])
def test_real_values_are_not_placeholders(value):
    assert not config.is_placeholder(value)


def test_callers_use_the_shared_check():
    assert api_main.is_placeholder is config.is_placeholder
    assert verify.is_placeholder is config.is_placeholder


def test_prefixes_are_defined_once_in_api():
    defining = []
    for path in sorted(API_DIR.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name.lstrip("_") == "is_placeholder":
                defining.append(path.relative_to(API_DIR).as_posix())
            if isinstance(node, ast.Tuple) and any(
                isinstance(elt, ast.Constant) and elt.value == "gsk_..." for elt in node.elts
            ):
                defining.append(path.relative_to(API_DIR).as_posix())
    assert defining == ["config.py", "config.py"]
