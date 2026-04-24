"""
rag/experiments/mlflow_eval.py

Evaluates the RAG pipeline against 10 golden Q&A pairs using keyword scoring.
Runs two MLflow experiments: Config A (k=3) and Config B (k=5).
"""

import mlflow

from rag.chain.rag_chain import ask

GOLDEN_QA = [
    {
        "question": "Quel est le taux de présence de Yaël Braun-Pivet ?",
        "keywords": ["100", "présence", "Braun-Pivet"],
        "label": "Yaël Braun-Pivet présence",
    },
    {
        "question": "Combien de députés appartiennent au Rassemblement National ?",
        "keywords": ["122", "Rassemblement National"],
        "label": "RN deputy count",
    },
    {
        "question": "Combien de votes ont été rejetés depuis 2025 ?",
        "keywords": ["rejeté"],
        "label": "Votes rejetés 2025",
    },
    {
        "question": "Combien de votes ont été adoptés depuis 2025 ?",
        "keywords": ["adopté"],
        "label": "Votes adoptés 2025",
    },
    {
        "question": "Qui sont les députés des Yvelines ?",
        "keywords": ["Yvelines"],
        "label": "Députés Yvelines",
    },
    {
        "question": "Combien de députés sont suivis ?",
        "keywords": ["577"],
        "label": "Total députés",
    },
    {
        "question": "Quel parti a le plus de députés ?",
        "keywords": ["Rassemblement National", "122"],
        "label": "Parti majoritaire",
    },
    {
        "question": "Quels députés ont le plus d'abstentions ?",
        "keywords": ["abstention"],
        "label": "Deputés abstentions",
    },
    {
        "question": "Combien de votes ont eu lieu depuis janvier 2025 ?",
        "keywords": ["3149", "3 149"],
        "label": "Volume votes 2025",
    },
    {
        "question": "Quels sont les votes récents adoptés à l'Assemblée ?",
        "keywords": ["adopté", "vote"],
        "label": "Votes récents adoptés",
    },
]


def _score_answer(answer: str, keywords: list[str]) -> float:
    answer_lower = answer.lower()
    found = sum(1 for kw in keywords if kw.lower() in answer_lower)
    return found / len(keywords)


def run_experiment(k: int) -> dict:
    scores = []
    similarities = []
    per_question = []

    mlflow.set_experiment("monelu-rag-eval")
    with mlflow.start_run(run_name=f"groq-llama3-k{k}"):
        mlflow.log_param("k", k)
        mlflow.log_param("llm", "llama-3.3-70b-versatile")
        mlflow.log_param("embedding_model", "text-embedding-3-small")

        for qa in GOLDEN_QA:
            result = ask(qa["question"])
            score = _score_answer(result["answer"], qa["keywords"])
            top_sim = result["sources"][0]["similarity"] if result["sources"] else 0.0

            scores.append(score)
            similarities.append(top_sim)

            found_kws = [kw for kw in qa["keywords"] if kw.lower() in result["answer"].lower()]
            per_question.append(
                {
                    "label": qa["label"],
                    "keywords": qa["keywords"],
                    "found": found_kws,
                    "score": score,
                    "top_sim": top_sim,
                }
            )

        avg_score = sum(scores) / len(scores)
        avg_sim = sum(similarities) / len(similarities)

        mlflow.log_metric("keyword_score", avg_score)
        mlflow.log_metric("avg_similarity", avg_sim)

    return {
        "k": k,
        "keyword_score": avg_score,
        "avg_similarity": avg_sim,
        "per_question": per_question,
    }


if __name__ == "__main__":
    print("\nRunning Config A (k=3)...")
    result_a = run_experiment(k=3)

    print("\nRunning Config B (k=5)...")
    result_b = run_experiment(k=5)

    winner = "A (k=3)" if result_a["keyword_score"] >= result_b["keyword_score"] else "B (k=5)"

    print("\n" + "=" * 48)
    print("  MonÉlu RAG — Evaluation Results")
    print("=" * 48)
    print(f"  Config A (k=3): keyword_score = {result_a['keyword_score']:.2f}")
    print(f"  Config B (k=5): keyword_score = {result_b['keyword_score']:.2f}")
    print(f"  Winner: config {winner}")
    print("  Run `make mlflow-ui` to explore.")
    print("=" * 48)

    print("\n  Per-question breakdown (Config B k=5):")
    for pq in result_b["per_question"]:
        total = len(pq["keywords"])
        found = len(pq["found"])
        check = "✓" if found == total else "← retrieval gap" if found == 0 else "△ partial"
        print(f"    {pq['label']:<34} → {found}/{total} keywords found {check}")
