"""
rag/chain/rag_chain.py

RAG pipeline: retrieve relevant chunks from pgvector, then answer with
Groq openai/gpt-oss-120b.
"""

import os
import re

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

from rag.chain.llm_router import detect_claim, llm_route  # noqa: E402
from rag.chain.prompts import RAG_TEMPLATE, build_system_prompt  # noqa: E402
from rag.chain.retriever import retrieve  # noqa: E402
from rag.chain.sql_router import route as sql_route  # noqa: E402
from rag.constants import LLM_MODEL  # noqa: E402

_groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"), timeout=30.0)

_CONFIDENCE_PATTERN = re.compile(r"\[Confiance\s*:\s*(ÉLEVÉ|MOYEN|FAIBLE)\]", re.IGNORECASE)


def extract_confidence(answer: str) -> tuple[str, str]:
    """Strip any [Confiance : NIVEAU] tag the LLM emits. Returns (clean_answer, stripped_level)."""
    match = _CONFIDENCE_PATTERN.search(answer)
    if match:
        level = match.group(1).upper()
        clean = _CONFIDENCE_PATTERN.sub("", answer).strip()
        return clean, level
    return answer, "medium"


def compute_confidence(chunks: list[dict]) -> str:
    """
    Compute confidence from retrieval quality, not LLM self-rating.
    Based on top chunk similarity and number of supporting chunks.
    """
    if not chunks:
        return "low"
    top_sim = chunks[0].get("similarity", 0)
    strong_chunks = sum(1 for c in chunks if c.get("similarity", 0) >= 0.5)

    if top_sim >= 0.65 and strong_chunks >= 2:
        return "high"
    if top_sim >= 0.5:
        return "medium"
    return "low"


def ask(
    question: str,
    deputy_id: str = None,
    chunk_type: str = None,
) -> dict:
    # A1 — regex SQL router first (fast path, no LLM call)
    sql_result = sql_route(question)
    if sql_result is not None:
        return sql_result

    # A2 — LLM intent classification over the same whitelisted SQL,
    # for phrasings the regex patterns miss. Falls through to RAG on
    # any failure or a "rag" verdict.
    llm_result = llm_route(question)
    if llm_result is not None:
        return llm_result

    # ADR-023 nudge: claim-shaped input still gets a normal RAG answer, but
    # the response is flagged so the UI can offer verification. Detection
    # never calls the verify chain and never creates a verification.
    suggested_action = "verify" if detect_claim(question) else None

    # B1 hybrid retrieval available in rag/chain/hybrid_retriever.py
    # Reverted to cosine-only: after SQL routing fixes, hybrid scored 0.644
    # vs 0.911 for cosine on the 15-question eval. Gaps were data-coverage
    # issues (missing SQL patterns), not retrieval quality. Re-evaluate
    # after Phase C chunks are added.
    chunks = retrieve(question, k=5, chunk_type=chunk_type, deputy_id=deputy_id)

    context = "\n\n---\n\n".join([c["content"] for c in chunks])

    user_message = RAG_TEMPLATE.format(context=context, question=question)

    response = _groq_client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": build_system_prompt()},
            {"role": "user", "content": user_message},
        ],
        temperature=0.2,
        max_tokens=1024,
    )

    clean_answer, _llm_confidence = extract_confidence(response.choices[0].message.content)
    computed_confidence = compute_confidence(chunks)

    return {
        "answer": clean_answer,
        "sources": chunks,
        "question": question,
        "chunks_retrieved": len(chunks),
        "query_type": "rag",
        "confidence": computed_confidence,
        "data_source": "RAG",
        "caveat": None,
        "suggested_action": suggested_action,
    }


if __name__ == "__main__":
    questions = [
        "Quel est le taux de présence de Yaël Braun-Pivet ?",
        "Combien de députés appartiennent au Rassemblement National ?",
        "Quels votes ont été adoptés récemment ?",
    ]
    for q in questions:
        result = ask(q)
        print(f"\nQ: {q}")
        print(f"A: {result['answer']}")
        top_similarity = result["sources"][0]["similarity"]
        print(f"Sources: {result['chunks_retrieved']} chunks, top similarity: {top_similarity:.3f}")
        print("---")
