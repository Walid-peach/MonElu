import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from rag.chain.retriever import detect_recency_intent, detect_result_filter


def test_detect_adopted():
    assert detect_result_filter("Quels votes ont été adoptés ?") == "adopté"


def test_detect_rejected():
    assert detect_result_filter("Quels votes rejetés récemment ?") == "rejeté"


def test_detect_none():
    assert detect_result_filter("Quel est le taux de présence ?") is None


def test_detect_recency_recemment():
    assert detect_recency_intent("Quels votes ont été rejetés récemment ?") is True


def test_detect_recency_dernier():
    assert detect_recency_intent("Quel est le dernier vote à l'Assemblée ?") is True


def test_detect_recency_none():
    assert detect_recency_intent("Quel est le taux de présence de Braun-Pivet ?") is False
