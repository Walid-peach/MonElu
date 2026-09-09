import json
from pathlib import Path

EMBEDDING_MODEL = "text-embedding-3-small"
LLM_MODEL = "openai/gpt-oss-120b"
# Total completion budget for the generation paths (rag_chain, verify).
# gpt-oss is a reasoning model and Groq bills reasoning tokens against
# max_tokens, so this ceiling is shared between thinking and the answer - it is
# not an answer-length budget the way it was under llama-3.3-70b-versatile.
# Measured spend on a realistic 5-chunk verify prompt is ~220 tokens, so 2048 is
# headroom for a hard case rather than expected cost: Groq bills tokens actually
# generated, and the model stops on its own. Raising it is free; hitting it is
# not, because a truncated verify body fails _parse_llm_verdict and is forced to
# "inverifiable" - a plausible-looking wrong verdict rather than an error.
LLM_MAX_TOKENS = 2048

# Notable deputies: {deputy_id: {name, bio, keywords}}
# Edit notable_deputies.json to add/remove entries — no code change needed.
NOTABLE_DEPUTIES: dict[str, dict] = json.loads(
    (Path(__file__).parent / "notable_deputies.json").read_text()
)

# Map each keyword → deputy_id for fast question matching in the retriever.
NOTABLE_DEPUTY_NAMES: dict[str, str] = {
    kw: dep_id for dep_id, info in NOTABLE_DEPUTIES.items() for kw in info["keywords"]
}
