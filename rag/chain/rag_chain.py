"""
rag/chain/rag_chain.py

RAG pipeline: retrieve relevant chunks from pgvector, then answer with
Groq llama-3.3-70b-versatile.
"""

import os

from dotenv import load_dotenv
from groq import Groq

from rag.chain.prompts import RAG_TEMPLATE, SYSTEM_PROMPT
from rag.chain.retriever import retrieve

load_dotenv()


def ask(
    question: str,
    deputy_id: str = None,
    chunk_type: str = None,
) -> dict:
    chunks = retrieve(question, k=5, deputy_id=deputy_id, chunk_type=chunk_type)

    context = "\n\n---\n\n".join([c["content"] for c in chunks])

    user_message = RAG_TEMPLATE.format(context=context, question=question)

    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.2,
        max_tokens=1024,
    )

    return {
        "answer": response.choices[0].message.content,
        "sources": chunks,
        "question": question,
        "chunks_retrieved": len(chunks),
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
