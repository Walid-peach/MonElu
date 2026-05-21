import os

EMBEDDING_MODEL = "text-embedding-3-small"
LLM_MODEL = "llama-3.3-70b-versatile"

# probes ≈ sqrt(IVFFlat lists). Default lists=100 → probes=10.
# Raise if chunk count grows significantly past ~50k.
IVFFLAT_PROBES = int(os.getenv("IVFFLAT_PROBES", "10"))
