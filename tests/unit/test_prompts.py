"""
Locks in the anti-extrapolation guardrail (Phase 5): a prompt refactor
must not silently drop the rule that forbids computing rankings or
group comparisons from retrieved extracts.
"""

from unittest.mock import patch

from rag.chain.prompts import RAG_TEMPLATE


def test_system_prompt_contains_anti_extrapolation_rule():
    with patch("rag.chain.prompts.get_data_horizon", return_value="du X au Y"):
        from rag.chain.prompts import build_system_prompt

        prompt = build_system_prompt()
    assert "EXTRAITS" in prompt
    assert "classement" in prompt


def test_rag_template_contains_anti_extrapolation_rule():
    assert "extraits" in RAG_TEMPLATE
    assert "AUCUN classement" in RAG_TEMPLATE
