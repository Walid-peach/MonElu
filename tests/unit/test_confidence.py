import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from api.routers.search import SearchResponse
from rag.chain.rag_chain import compute_confidence

VALID_CONFIDENCE_VALUES = {"high", "medium", "low"}


def test_compute_confidence_high():
    chunks = [{"similarity": 0.7}, {"similarity": 0.6}]
    assert compute_confidence(chunks) == "high"


def test_compute_confidence_medium():
    chunks = [{"similarity": 0.55}]
    assert compute_confidence(chunks) == "medium"


def test_compute_confidence_low_on_weak_similarity():
    chunks = [{"similarity": 0.2}]
    assert compute_confidence(chunks) == "low"


def test_compute_confidence_low_on_no_chunks():
    assert compute_confidence([]) == "low"


def test_compute_confidence_returns_only_documented_values():
    cases = [
        [],
        [{"similarity": 0.2}],
        [{"similarity": 0.55}],
        [{"similarity": 0.7}, {"similarity": 0.6}],
    ]
    for chunks in cases:
        assert compute_confidence(chunks) in VALID_CONFIDENCE_VALUES


def test_search_response_default_confidence_is_lowercase():
    response = SearchResponse(answer="a", question="q", chunks_retrieved=0, sources=[])
    assert response.confidence in VALID_CONFIDENCE_VALUES
