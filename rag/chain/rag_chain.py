"""
rag/chain/rag_chain.py

RAG pipeline: retrieve relevant chunks from pgvector, then answer with
Groq llama-3.3-70b-versatile.
"""

import os
import re

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

from rag.chain.hybrid_retriever import retrieve_hybrid  # noqa: E402
from rag.chain.prompts import RAG_TEMPLATE, SYSTEM_PROMPT  # noqa: E402
from rag.chain.retriever import (  # noqa: E402
    detect_notable_deputy,
    detect_result_filter,
    get_notable_deputy_ids,
)
from rag.chain.sql_router import route as sql_route  # noqa: E402
from rag.constants import LLM_MODEL  # noqa: E402

_groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"), timeout=30.0)

_CONFIDENCE_PATTERN = re.compile(r"\[Confiance\s*:\s*(ÉLEVÉ|MOYEN|FAIBLE)\]", re.IGNORECASE)


def extract_confidence(answer: str) -> tuple[str, str]:
    """Extract [Confiance : NIVEAU] tag from answer if present.
    Returns (clean_answer, confidence_level)."""
    match = _CONFIDENCE_PATTERN.search(answer)
    if match:
        level = match.group(1).upper()
        clean = _CONFIDENCE_PATTERN.sub("", answer).strip()
        return clean, level
    return answer, "MEDIUM"


def ask(
    question: str,
    deputy_id: str = None,
    chunk_type: str = None,
) -> dict:
    # A1 — try SQL router first
    sql_result = sql_route(question)
    if sql_result is not None:
        return sql_result

    # B1 — notable deputy pinning before hybrid retrieval
    if deputy_id is None:
        notable_map = get_notable_deputy_ids()
        detected = detect_notable_deputy(question, notable_map)
        if detected:
            deputy_id = detected

    result_filter = detect_result_filter(question)
    chunks = retrieve_hybrid(
        question,
        k=5,
        chunk_type=chunk_type,
        deputy_id=deputy_id,
        result_filter=result_filter,
    )

    context = "\n\n---\n\n".join([c["content"] for c in chunks])

    user_message = RAG_TEMPLATE.format(context=context, question=question)

    response = _groq_client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.2,
        max_tokens=1024,
    )

    clean_answer, confidence = extract_confidence(response.choices[0].message.content)
    return {
        "answer": clean_answer,
        "sources": chunks,
        "question": question,
        "chunks_retrieved": len(chunks),
        "query_type": "rag",
        "confidence": confidence,
        "data_source": "RAG",
        "caveat": None,
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
        print(
            f"Sources: {result['chunks_retrieved']} chunks, top similarity: {result['sources'][0]['similarity']:.3f}"
        )
        print("---")
