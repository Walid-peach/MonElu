"""
rag/experiments/mlflow_eval.py

Evaluates the RAG pipeline against golden Q&A pairs using keyword scoring.
Runs three MLflow configs:
  - OLD: k=5, SQL router disabled (baseline)
  - A:   k=5, SQL router + citation prompt
  - B:   k=3, SQL router + citation prompt
"""

import mlflow

from rag.chain.rag_chain import ask
from rag.chain.sql_router import route as sql_route

GOLDEN_QA = [
    # existing 10 pairs
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
    # 5 new pairs testing A1 SQL router
    {
        "question": "Combien de députés appartiennent à chaque groupe parlementaire ?",
        "keywords": ["Rassemblement National", "122", "Ensemble"],
        "label": "A1 — répartition groupes",
    },
    {
        "question": "Quel groupe parlementaire s'abstient le plus ?",
        "keywords": ["abstention", "%"],
        "label": "A1 — abstentions groupes",
    },
    {
        "question": "Quel est le taux de présence moyen par groupe parlementaire ?",
        "keywords": ["%", "présence"],
        "label": "A1 — présence par groupe",
    },
    {
        "question": "Gabriel Attal a-t-il voté pour le PLFSS 2026 ?",
        "keywords": ["Attal", "pour", "PLFSS"],
        "label": "A3 — Attal PLFSS vote",
    },
    {
        "question": "Quel est le taux de discipline de vote du Rassemblement National ?",
        "keywords": ["Rassemblement National", "%"],
        "label": "A1 — discipline RN",
    },
]


def _score_answer(answer: str, keywords: list[str]) -> float:
    answer_lower = answer.lower()
    found = sum(1 for kw in keywords if kw.lower() in answer_lower)
    return found / len(keywords)


def run_experiment(k: int, label: str, sql_router_enabled: bool = True) -> dict:
    scores = []
    similarities = []
    sql_routed = 0
    per_question = []

    mlflow.set_experiment("monelu-rag-eval")
    with mlflow.start_run(run_name=f"phase-a-{label}"):
        mlflow.log_param("k", k)
        mlflow.log_param("llm", "llama-3.3-70b-versatile")
        mlflow.log_param("embedding_model", "text-embedding-3-small")
        mlflow.log_param("sql_router", "enabled" if sql_router_enabled else "disabled")
        mlflow.log_param("citation_prompt", "enabled")
        mlflow.log_param("notable_deputies", "top_100")

        for qa in GOLDEN_QA:
            # For OLD config: bypass SQL router even if ask() would call it
            if not sql_router_enabled:
                sql_check = None
            else:
                sql_check = sql_route(qa["question"])

            if sql_check is not None:
                result = sql_check
                sql_routed += 1
            else:
                result = ask(qa["question"])

            score = _score_answer(result["answer"], qa["keywords"])
            top_sim = result["sources"][0]["similarity"] if result.get("sources") else 0.0

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
                    "sql_routed": sql_check is not None,
                }
            )

        avg_score = sum(scores) / len(scores)
        avg_sim = sum(similarities) / len(similarities)

        mlflow.log_metric("keyword_score", avg_score)
        mlflow.log_metric("avg_similarity", avg_sim)
        mlflow.log_metric("sql_routed_count", sql_routed)

    return {
        "label": label,
        "k": k,
        "keyword_score": avg_score,
        "avg_similarity": avg_sim,
        "sql_routed": sql_routed,
        "per_question": per_question,
    }


if __name__ == "__main__":
    print("\nRunning Config OLD (k=5, no SQL router — baseline)...")
    result_old = run_experiment(k=5, label="OLD-k5-no-sql", sql_router_enabled=False)

    print("\nRunning Config A (k=5 + SQL router + citation prompt)...")
    result_a = run_experiment(k=5, label="A-k5-sql", sql_router_enabled=True)

    print("\nRunning Config B (k=3 + SQL router + citation prompt)...")
    result_b = run_experiment(k=3, label="B-k3-sql", sql_router_enabled=True)

    scores = {
        "OLD": result_old["keyword_score"],
        "A": result_a["keyword_score"],
        "B": result_b["keyword_score"],
    }
    best = max(scores, key=scores.get)

    print("\n" + "=" * 44)
    print("  MonÉlu RAG — Phase A Optimization Results")
    print("=" * 44)
    print(f"  Baseline (no SQL router):  score = {result_old['keyword_score']:.2f}")
    print(f"  Config A (k=5 + SQL):      score = {result_a['keyword_score']:.2f}")
    print(f"  Config B (k=3 + SQL):      score = {result_b['keyword_score']:.2f}")
    print(f"  SQL routed questions:       {result_a['sql_routed']}/15")
    print(f"  Best config: {best}")
    print("=" * 44)

    print("\n  Per-question breakdown (Config A k=5):")
    for pq in result_a["per_question"]:
        total = len(pq["keywords"])
        found = len(pq["found"])
        routing = "[SQL]" if pq["sql_routed"] else "     "
        check = "✓" if found == total else "← retrieval gap" if found == 0 else "△ partial"
        print(f"  {routing} {pq['label']:<38} → {found}/{total} {check}")
