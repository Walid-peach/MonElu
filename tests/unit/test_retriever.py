import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from rag.chain.retriever import detect_result_filter


def test_detect_adopted():
    assert detect_result_filter("Quels votes ont été adoptés ?") == "adopté"


def test_detect_rejected():
    assert detect_result_filter("Quels votes rejetés récemment ?") == "rejeté"


def test_detect_none():
    assert detect_result_filter("Quel est le taux de présence ?") is None
