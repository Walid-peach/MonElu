"""Unit tests for the claim-verification chain (MON-126) — no DB, no LLM."""

import json
from unittest.mock import MagicMock, patch

import rag.chain.verify as verify_mod
from rag.chain.verify import _parse_llm_verdict, detect_deputy, verify_claim

_DEPUTY_MAP = {
    "PA1": {"full_name": "Marine Le Pen", "party": "Rassemblement National"},
    "PA2": {"full_name": "Gabriel Attal", "party": "Ensemble pour la République"},
    "PA3": {"full_name": "Jean Martin", "party": "Les Républicains"},
    "PA4": {"full_name": "Claire Martin", "party": "Socialistes"},
    "PA5": {"full_name": "Li Wu", "party": None},
}

_CANDIDATE = {
    "vote_id": "VTANR5L17V1",
    "title": "Vote sur l'augmentation du SMIC",
    "voted_at": "2025-09-01",
    "result": "rejeté",
    "deputy_position": "contre",
}


# ---------------------------------------------------------------------------
# detect_deputy
# ---------------------------------------------------------------------------


def test_detect_deputy_unique_last_name():
    assert detect_deputy("Attal a voté contre le SMIC", _DEPUTY_MAP) == "PA2"


def test_detect_deputy_full_name_wins_over_ambiguous_last_name():
    assert detect_deputy("Jean Martin a voté pour ce texte", _DEPUTY_MAP) == "PA3"


def test_detect_deputy_ambiguous_last_name_returns_none():
    # Two deputies named Martin and no full name — guessing would misattribute.
    assert detect_deputy("le député Martin a voté pour", _DEPUTY_MAP) is None


def test_detect_deputy_short_last_name_skipped():
    # "Wu" is under the 3-char floor; substring "wu" in other words must not match.
    assert detect_deputy("wu a voté pour", _DEPUTY_MAP) is None


def test_detect_deputy_no_match():
    assert detect_deputy("le SMIC a été rejeté", _DEPUTY_MAP) is None


def test_detect_deputy_multiword_last_name_via_full_name():
    assert detect_deputy("Marine Le Pen a voté contre", _DEPUTY_MAP) == "PA1"


# ---------------------------------------------------------------------------
# _parse_llm_verdict
# ---------------------------------------------------------------------------


def test_parse_valid_json():
    raw = json.dumps(
        {
            "verdict": "faux",
            "explanation": "Le vote cité montre le contraire.",
            "cited_vote_ids": ["V1"],
        }
    )
    parsed = _parse_llm_verdict(raw)
    assert parsed == {
        "verdict": "faux",
        "explanation": "Le vote cité montre le contraire.",
        "cited_vote_ids": ["V1"],
    }


def test_parse_fenced_json():
    raw = '```json\n{"verdict": "vrai", "explanation": "ok", "cited_vote_ids": []}\n```'
    assert _parse_llm_verdict(raw)["verdict"] == "vrai"


def test_parse_unknown_verdict_rejected():
    raw = '{"verdict": "peut-être", "explanation": "ok", "cited_vote_ids": []}'
    assert _parse_llm_verdict(raw) is None


def test_parse_missing_explanation_rejected():
    raw = '{"verdict": "vrai", "cited_vote_ids": []}'
    assert _parse_llm_verdict(raw) is None


def test_parse_non_string_ids_rejected():
    raw = '{"verdict": "vrai", "explanation": "ok", "cited_vote_ids": [1]}'
    assert _parse_llm_verdict(raw) is None


def test_parse_garbage_rejected():
    assert _parse_llm_verdict("Je pense que c'est vrai.") is None


# ---------------------------------------------------------------------------
# verify_claim guards
# ---------------------------------------------------------------------------


def _mock_groq(payload: dict | str) -> MagicMock:
    content = payload if isinstance(payload, str) else json.dumps(payload)
    client = MagicMock()
    client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content=content))]
    )
    return client


def _run_verify(claim: str, *, chunks, candidates, groq_payload) -> tuple[dict, MagicMock]:
    client = _mock_groq(groq_payload)
    with (
        patch.object(verify_mod, "get_deputy_map", return_value=_DEPUTY_MAP),
        patch.object(verify_mod, "retrieve", return_value=chunks),
        patch.object(verify_mod, "_fetch_candidates", return_value=candidates),
        patch.object(verify_mod, "get_data_horizon_start", return_value="2025-07-01"),
        patch.object(verify_mod, "_groq_client", client),
    ):
        return verify_claim(claim), client


_STRONG_CHUNK = {
    "content": "…",
    "metadata": {"chunk_type": "vote", "vote_id": "VTANR5L17V1"},
    "similarity": 0.72,
}


def test_low_similarity_skips_llm_and_returns_inverifiable():
    weak = [{"content": "…", "metadata": {"vote_id": "V9"}, "similarity": 0.2}]
    result, client = _run_verify(
        "Attal a voté contre le SMIC", chunks=weak, candidates=[], groq_payload={}
    )
    assert result["verdict"] == "inverifiable"
    assert result["citations"] == []
    assert result["confidence"] == "FAIBLE"
    client.chat.completions.create.assert_not_called()


def test_no_candidates_returns_inverifiable_without_llm():
    result, client = _run_verify(
        "Attal a voté contre le SMIC", chunks=[_STRONG_CHUNK], candidates=[], groq_payload={}
    )
    assert result["verdict"] == "inverifiable"
    client.chat.completions.create.assert_not_called()


def test_valid_verdict_keeps_only_db_backed_citations():
    payload = {
        "verdict": "faux",
        "explanation": "Il a voté contre.",
        "cited_vote_ids": ["VTANR5L17V1", "FABRICATED"],
    }
    result, _ = _run_verify(
        "Attal a voté pour le SMIC",
        chunks=[_STRONG_CHUNK, _STRONG_CHUNK],
        candidates=[_CANDIDATE],
        groq_payload=payload,
    )
    assert result["verdict"] == "faux"
    assert [c["vote_id"] for c in result["citations"]] == ["VTANR5L17V1"]
    assert result["deputy"] == {
        "deputy_id": "PA2",
        "name": "Gabriel Attal",
        "party": "Ensemble pour la République",
    }
    assert result["confidence"] == "ÉLEVÉ"
    assert result["data_horizon"] == "2025-07-01"


def test_factual_verdict_without_valid_citation_downgraded_to_inverifiable():
    payload = {"verdict": "vrai", "explanation": "C'est vrai.", "cited_vote_ids": ["FABRICATED"]}
    result, _ = _run_verify(
        "Attal a voté contre le SMIC",
        chunks=[_STRONG_CHUNK],
        candidates=[_CANDIDATE],
        groq_payload=payload,
    )
    assert result["verdict"] == "inverifiable"
    assert result["citations"] == []


def test_unparseable_llm_output_returns_inverifiable():
    result, _ = _run_verify(
        "Attal a voté contre le SMIC",
        chunks=[_STRONG_CHUNK],
        candidates=[_CANDIDATE],
        groq_payload="désolé, je ne peux pas répondre en JSON",
    )
    assert result["verdict"] == "inverifiable"
    assert result["citations"] == []


def test_retrieval_disables_auto_result_filter():
    """A claim's own "adopté"/"rejeté" wording must not exclude the scrutin
    that would contradict it — verify_claim opts out of the auto filter."""
    with (
        patch.object(verify_mod, "get_deputy_map", return_value=_DEPUTY_MAP),
        patch.object(verify_mod, "retrieve", return_value=[]) as mock_retrieve,
        patch.object(verify_mod, "get_data_horizon_start", return_value="2025-07-01"),
    ):
        verify_claim("Attal a voté pour la loi rejetée")
    assert mock_retrieve.call_args.kwargs["auto_result_filter"] is False


def test_inverifiable_verdict_allowed_without_citations():
    payload = {
        "verdict": "inverifiable",
        "explanation": "Les scrutins fournis ne couvrent pas ce sujet.",
        "cited_vote_ids": [],
    }
    result, _ = _run_verify(
        "Attal a voté contre le SMIC en 2010",
        chunks=[_STRONG_CHUNK],
        candidates=[_CANDIDATE],
        groq_payload=payload,
    )
    assert result["verdict"] == "inverifiable"
    assert result["data_horizon"] == "2025-07-01"
