import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from rag.pipeline.chunker import dept_preposition


def test_dept_preposition_plural():
    assert dept_preposition("Yvelines") == "des"
    assert dept_preposition("Bouches-du-Rhône") == "des"


def test_dept_preposition_vowel():
    assert dept_preposition("Essonne") == "de l'"
    assert dept_preposition("Aisne") == "de l'"


def test_dept_preposition_default():
    assert dept_preposition("Nord") == "du"
    assert dept_preposition("Gard") == "du"


def test_dept_preposition_empty():
    assert dept_preposition("") == "de"
    assert dept_preposition(None) == "de"
