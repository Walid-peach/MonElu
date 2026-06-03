"""
rag/experiments/mlflow_eval.py

Evaluates the RAG pipeline against 15 golden Q&A pairs using keyword scoring.
Runs three MLflow configs:
  - baseline_no_sql: k=5, SQL router disabled (monkey-patched out of ask())
  - phase_a_k5:      k=5, SQL router + citation prompt
  - phase_a_k3:      k=3, SQL router + citation prompt
"""

import mlflow

import rag.chain.rag_chain as _rag_chain

GOLDEN_QA = [
    # original 10 pairs
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


def keyword_score(answer: str, keywords: list[str]) -> float:
    a = answer.lower()
    found = sum(1 for kw in keywords if kw.lower() in a)
    return found / len(keywords)


def run_config(label: str, k: int, use_sql_router: bool) -> dict:
    # Monkey-patch the imported name inside rag_chain so ask() sees the change
    original_sql_route = _rag_chain.sql_route
    original_retrieve = _rag_chain.retrieve

    if not use_sql_router:
        _rag_chain.sql_route = lambda q: None

    # Wrap retrieve to enforce k override when k != 5 (ask() hardcodes k=5)
    if k != 5:

        def _retrieve_with_k(question, k=k, deputy_id=None, chunk_type=None):
            return original_retrieve(question, k=k, deputy_id=deputy_id, chunk_type=chunk_type)

        _rag_chain.retrieve = _retrieve_with_k

    results = []
    sql_count = 0
    similarities = []
    per_question = []

    try:
        mlflow.set_experiment("monelu-rag-eval")
        with mlflow.start_run(run_name=f"phase-a-{label}"):
            mlflow.log_param("k", k)
            mlflow.log_param("llm", "llama-3.3-70b-versatile")
            mlflow.log_param("embedding_model", "text-embedding-3-small")
            mlflow.log_param("sql_router", "enabled" if use_sql_router else "disabled")
            mlflow.log_param("citation_prompt", "enabled")
            mlflow.log_param("notable_deputies", "top_100")

            total = len(GOLDEN_QA)
            for i, qa in enumerate(GOLDEN_QA, 1):
                print(f"  [{i}/{total}] {qa['label']} ...", flush=True)
                result = _rag_chain.ask(qa["question"])
                src = "SQL" if result.get("data_source") == "SQL" else "RAG"
                if result.get("data_source") == "SQL":
                    sql_count += 1
                score = keyword_score(result["answer"], qa["keywords"])
                print(f"         → {src}  score={score:.2f}", flush=True)
                results.append(score)
                top_sim = result["sources"][0].get("similarity", 0) if result.get("sources") else 0
                similarities.append(top_sim)
                found_kws = [kw for kw in qa["keywords"] if kw.lower() in result["answer"].lower()]
                per_question.append(
                    {
                        "label": qa["label"],
                        "keywords": qa["keywords"],
                        "found": found_kws,
                        "score": score,
                        "top_sim": top_sim,
                        "sql_routed": result.get("data_source") == "SQL",
                    }
                )

            avg_score = round(sum(results) / len(results), 3)
            avg_sim = round(sum(similarities) / len(similarities), 3) if similarities else 0

            mlflow.log_metric("keyword_score", avg_score)
            mlflow.log_metric("avg_similarity", avg_sim)
            mlflow.log_metric("sql_routed_count", sql_count)

    finally:
        _rag_chain.sql_route = original_sql_route
        _rag_chain.retrieve = original_retrieve

    return {
        "label": label,
        "k": k,
        "score": avg_score,
        "sql_routed": sql_count,
        "avg_similarity": avg_sim,
        "per_question": per_question,
    }


if __name__ == "__main__":
    configs = [
        ("baseline_no_sql", 5, False),
        ("phase_a_k5", 5, True),
        ("phase_a_k3", 3, True),
    ]

    results = {}
    for label, k, use_sql in configs:
        print(f"\nRunning {label} (k={k}, sql_router={'on' if use_sql else 'off'})...")
        results[label] = run_config(label, k, use_sql)

    best = max(results, key=lambda lbl: results[lbl]["score"])

    print("\n" + "=" * 44)
    print("  MonÉlu RAG — Phase A Optimization Results")
    print("=" * 44)
    print(f"  Baseline (no SQL router):  score = {results['baseline_no_sql']['score']:.2f}")
    print(f"  Config A (k=5 + SQL):      score = {results['phase_a_k5']['score']:.2f}")
    print(f"  Config B (k=3 + SQL):      score = {results['phase_a_k3']['score']:.2f}")
    print(f"  SQL routed questions:       {results['phase_a_k5']['sql_routed']}/15")
    print(f"  Best config: {best}")
    print("=" * 44)

    print("\n  Per-question breakdown (Config A — k=5 + SQL):")
    for pq in results["phase_a_k5"]["per_question"]:
        total = len(pq["keywords"])
        found = len(pq["found"])
        routing = "[SQL]" if pq["sql_routed"] else "     "
        check = "✓" if found == total else "← retrieval gap" if found == 0 else "△ partial"
        print(f"  {routing} {pq['label']:<38} → {found}/{total} {check}")
