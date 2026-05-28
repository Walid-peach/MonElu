import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest
from pydantic import ValidationError

from api.routers.search import SearchRequest


def test_search_request_valid():
    req = SearchRequest(question="Quel est le taux de présence de Braun-Pivet ?")
    assert req.question
    assert req.deputy_id is None


def test_search_request_too_short():
    with pytest.raises(ValidationError):
        SearchRequest(question="abc")


def test_search_request_too_long():
    with pytest.raises(ValidationError):
        SearchRequest(question="x" * 501)
