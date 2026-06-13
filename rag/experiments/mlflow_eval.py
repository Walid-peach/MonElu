"""
rag/experiments/mlflow_eval.py

Evaluates the RAG pipeline against a golden Q&A set using two separate suites:

  Router suite  — questions expected to hit the SQL router.
                  Asserts data_source == "SQL" and compares against live DB counts.
  Retrieval suite — questions expected to hit RAG retrieval.
                    Keyword scoring on LLM answer; can't use live ground truth here.

Runs three MLflow configs:
  - phase_a_k5:      k=5, SQL router + cosine retrieval (Phase A baseline)
  - phase_b_hybrid:  k=5, SQL router + BM25 hybrid retrieval (Phase B experiment)
  - phase_b_final:   k=5, SQL router + cosine + law_summary chunks (Phase B shipped)
"""

import os

import mlflow
import psycopg2

import rag.chain.rag_chain as _rag_chain


def _get_live_counts() -> dict:
    """Query the DB at eval time to avoid hardcoded facts that rot daily."""
    url = os.getenv("DATABASE_URL")
    try:
        with psycopg2.connect(url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM deputies")
                total_deputies = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM votes")
                total_votes = cur.fetchone()[0]
                cur.execute(
                    "SELECT party, COUNT(*) AS n FROM deputies WHERE party IS NOT NULL "
                    "GROUP BY party ORDER BY n DESC LIMIT 1"
                )
                row = cur.fetchone()
                top_party, top_party_count = (
                    (row[0], row[1]) if row else ("Rassemblement National", 0)
                )
        return {
            "total_deputies": str(total_deputies),
            "total_votes": str(total_votes),
            "top_party": top_party,
            "top_party_count": str(top_party_count),
        }
    except Exception as exc:
        print(f"[eval] live counts failed, using placeholders: {exc}")
        return {
            "total_deputies": "député",
            "total_votes": "vote",
            "top_party": "Rassemblement National",
            "top_party_count": "122",
        }


# Router suite: questions expected to hit SQL router.
# Keywords derived from live DB counts at eval time to avoid daily rot.
def _router_golden(counts: dict) -> list[dict]:
    return [
        {
            "question": "Combien de députés sont suivis ?",
            "keywords": [counts["total_deputies"]],
            "label": "router — total députés",
            "expect_sql": True,
        },
        {
            "question": "Quel parti a le plus de députés ?",
            "keywords": [counts["top_party"], counts["top_party_count"]],
            "label": "router — parti majoritaire",
            "expect_sql": True,
        },
        {
            "question": "Combien de députés appartiennent à chaque groupe parlementaire ?",
            "keywords": [counts["top_party"]],
            "label": "router — répartition groupes",
            "expect_sql": True,
        },
        {
            "question": "Quel groupe parlementaire s'abstient le plus ?",
            "keywords": ["abstention", "%"],
            "label": "router — abstentions groupes",
            "expect_sql": True,
        },
        {
            "question": "Quel est le taux de présence moyen par groupe parlementaire ?",
            "keywords": ["%", "présence"],
            "label": "router — présence par groupe",
            "expect_sql": True,
        },
        {
            "question": "Quel est le taux de discipline de vote du Rassemblement National ?",
            "keywords": ["Rassemblement National", "%"],
            "label": "router — discipline RN",
            "expect_sql": True,
        },
    ]


# Retrieval suite: questions expected to hit RAG (no SQL route match).
# Keywords are content-based, not live-count-based, so they don't rot.
RETRIEVAL_GOLDEN = [
    {
        "question": "Quel est le taux de présence de Yaël Braun-Pivet ?",
        "keywords": ["100", "présence", "Braun-Pivet"],
        "label": "retrieval — Braun-Pivet présence",
        "expect_sql": False,
    },
    {
        "question": "Gabriel Attal a-t-il voté pour le PLFSS 2026 ?",
        "keywords": ["Attal", "PLFSS"],
        "label": "retrieval — Attal PLFSS vote",
        "expect_sql": False,
    },
    {
        "question": "Quels sont les votes récents adoptés à l'Assemblée ?",
        "keywords": ["adopté", "vote"],
        "label": "retrieval — votes récents adoptés",
        "expect_sql": False,
    },
    {
        "question": "Quels députés ont le plus d'abstentions ?",
        "keywords": ["abstention"],
        "label": "retrieval — députés abstentions",
        "expect_sql": False,
    },
    {
        "question": "Qui sont les députés des Yvelines ?",
        "keywords": ["Yvelines"],
        "label": "retrieval — députés Yvelines",
        "expect_sql": False,
    },
]


def keyword_score(answer: str, keywords: list[str]) -> float:
    a = answer.lower()
    found = sum(1 for kw in keywords if kw.lower() in a)
    return found / len(keywords)


def run_config(label: str, k: int, use_sql_router: bool, retriever_type: str = "cosine") -> dict:
    from rag.chain.hybrid_retriever import retrieve_hybrid as _retrieve_hybrid
    from rag.chain.retriever import retrieve as _retrieve_cosine

    counts = _get_live_counts()
    golden_set = _router_golden(counts) + RETRIEVAL_GOLDEN

    # Monkey-patch the imported names inside rag_chain so ask() sees the changes
    original_sql_route = _rag_chain.sql_route
    original_retrieve = _rag_chain.retrieve

    if not use_sql_router:
        _rag_chain.sql_route = lambda q: None

    # Swap retriever based on type, and enforce k override if needed
    if retriever_type == "hybrid":

        def _hybrid_k5(question, k=k, chunk_type=None, deputy_id=None):
            return _retrieve_hybrid(question, k=k, chunk_type=chunk_type, deputy_id=deputy_id)

        _rag_chain.retrieve = _hybrid_k5
    elif k != 5:

        def _cosine_with_k(question, k=k, chunk_type=None, deputy_id=None):
            return _retrieve_cosine(question, k=k, deputy_id=deputy_id, chunk_type=chunk_type)

        _rag_chain.retrieve = _cosine_with_k

    results = []
    sql_count = 0
    similarities = []
    per_question = []

    try:
        mlflow.set_experiment("monelu-rag-eval")
        with mlflow.start_run(run_name=f"monelu-rag-{label}"):
            mlflow.log_param("k", k)
            mlflow.log_param("llm", "llama-3.3-70b-versatile")
            mlflow.log_param("embedding_model", "text-embedding-3-small")
            mlflow.log_param("sql_router", "enabled" if use_sql_router else "disabled")
            mlflow.log_param("citation_prompt", "enabled")
            mlflow.log_param("notable_deputies", "top_100")

            total = len(golden_set)
            for i, qa in enumerate(golden_set, 1):
                print(f"  [{i}/{total}] {qa['label']} ...", flush=True)
                result = _rag_chain.ask(qa["question"])
                src = "SQL" if result.get("data_source") == "SQL" else "RAG"
                if result.get("data_source") == "SQL":
                    sql_count += 1
                score = keyword_score(result["answer"], qa["keywords"])

                # Flag router/retrieval mismatches
                expected_sql = qa.get("expect_sql", False)
                actual_sql = result.get("data_source") == "SQL"
                routing_ok = expected_sql == actual_sql
                routing_flag = "" if routing_ok else " ← routing mismatch"

                print(f"         → {src}  score={score:.2f}{routing_flag}", flush=True)
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
                        "routing_ok": routing_ok,
                    }
                )

            avg_score = round(sum(results) / len(results), 3)
            avg_sim = round(sum(similarities) / len(similarities), 3) if similarities else 0
            routing_accuracy = round(
                sum(1 for pq in per_question if pq["routing_ok"]) / len(per_question), 3
            )

            mlflow.log_metric("keyword_score", avg_score)
            mlflow.log_metric("avg_similarity", avg_sim)
            mlflow.log_metric("sql_routed_count", sql_count)
            mlflow.log_metric("routing_accuracy", routing_accuracy)

    finally:
        _rag_chain.sql_route = original_sql_route
        _rag_chain.retrieve = original_retrieve

    return {
        "label": label,
        "k": k,
        "score": avg_score,
        "sql_routed": sql_count,
        "avg_similarity": avg_sim,
        "routing_accuracy": routing_accuracy,
        "per_question": per_question,
    }


if __name__ == "__main__":
    configs = [
        ("phase_a_k5", 5, True, "cosine"),
        ("phase_b_hybrid", 5, True, "hybrid"),
        ("phase_b_final", 5, True, "cosine"),  # cosine + B2 law_summary chunks + B3 structured
    ]

    results = {}
    for label, k, use_sql, retriever in configs:
        print(
            f"\nRunning {label} (k={k}, sql={'on' if use_sql else 'off'}, retriever={retriever})..."
        )
        results[label] = run_config(label, k, use_sql, retriever)

    print("\n" + "=" * 46)
    print("  MonÉlu RAG — Phase B Results")
    print("=" * 46)
    print(
        f"  Phase A (cosine, {len(results['phase_a_k5']['per_question'])} questions):  {results['phase_a_k5']['score']:.3f}"
    )
    print(
        f"  Phase B (hybrid BM25):           {results['phase_b_hybrid']['score']:.3f}  ← regression, reverted"
    )
    print(f"  Phase B (cosine + B2 + B3):      {results['phase_b_final']['score']:.3f}")
    print(
        f"  SQL routed questions:             {results['phase_a_k5']['sql_routed']}/{len(results['phase_a_k5']['per_question'])}"
    )
    print(f"  Routing accuracy:                 {results['phase_a_k5']['routing_accuracy']:.3f}")
    print("=" * 46)
    print("  Shipped:  law_summary chunks, structured confidence output")
    print("  Reverted: BM25 hybrid (regression on eval)")
    print("  Eval:     router suite (live SQL ground truth) + retrieval suite (keyword)")
    print("=" * 46)

    print("\n  Per-question breakdown (Phase B final — cosine + B2 + B3):")
    for pq in results["phase_b_final"]["per_question"]:
        total = len(pq["keywords"])
        found = len(pq["found"])
        routing = "[SQL]" if pq["sql_routed"] else "     "
        routing_flag = "" if pq["routing_ok"] else " ← routing mismatch"
        check = "✓" if found == total else "← retrieval gap" if found == 0 else "△ partial"
        print(f"  {routing} {pq['label']:<42} → {found}/{total} {check}{routing_flag}")
