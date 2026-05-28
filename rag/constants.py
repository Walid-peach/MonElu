import json
import os
from pathlib import Path

EMBEDDING_MODEL = "text-embedding-3-small"
LLM_MODEL = "llama-3.3-70b-versatile"

# probes ≈ sqrt(IVFFlat lists). Default lists=100 → probes=10.
# Raise if chunk count grows significantly past ~50k.
IVFFLAT_PROBES = int(os.getenv("IVFFLAT_PROBES", "10"))

# Notable deputies: {deputy_id: {name, bio, keywords}}
# Edit notable_deputies.json to add/remove entries — no code change needed.
NOTABLE_DEPUTIES: dict[str, dict] = json.loads(
    (Path(__file__).parent / "notable_deputies.json").read_text()
)

# Map each keyword → deputy_id for fast question matching in the retriever.
NOTABLE_DEPUTY_NAMES: dict[str, str] = {
    kw: dep_id for dep_id, info in NOTABLE_DEPUTIES.items() for kw in info["keywords"]
}
