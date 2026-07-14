"""
rag/experiments/verify_eval.py

Golden-claim evaluation for the verification chain (MON-126).

Claims are built from the live DB at eval time (same anti-rot approach as
mlflow_eval.py): a real deputy/vote/position pair yields one true claim and
its negated false claim; two fixed claims cover the unverifiable cases
(period outside the data window, unknown person).

Scores per claim:
  - verdict_ok:        the verdict matches the expected set
  - citations_valid:   every cited vote_id exists in the votes table

Usage:
    venv/bin/python -m rag.experiments.verify_eval
Requires DATABASE_URL, OPENAI_API_KEY, GROQ_API_KEY. Costs a few cents at most
(one embedding + one Groq call per claim).
"""

import os

import mlflow
import psycopg2

from rag.chain.verify import verify_claim

_POSITION_WORDS = {"pour": "pour", "contre": "contre", "abstention": None, "nonVotant": None}


def _live_golden_claims() -> list[dict]:
    """Build golden claims from a real, clear-cut position in the live DB."""
    url = os.getenv("DATABASE_URL")
    with psycopg2.connect(url) as conn:
        with conn.cursor() as cur:
            # A well-attended vote where a high-participation deputy voted
            # pour or contre — an unambiguous ground truth pair.
            cur.execute(
                """
                SELECT d.full_name, v.vote_title, vp.position, v.vote_id
                FROM vote_positions vp
                JOIN deputies d ON d.deputy_id = vp.deputy_id
                JOIN votes v ON v.vote_id = vp.vote_id
                WHERE vp.position IN ('pour', 'contre')
                  AND v.total_voters >= 400
                  AND d.mandate_end IS NULL
                ORDER BY v.voted_at DESC
                LIMIT 1
                """
            )
            row = cur.fetchone()
    if not row:
        raise RuntimeError("No suitable vote/position pair found — is the DB populated?")
    full_name, vote_title, position, vote_id = row
    opposite = "contre" if position == "pour" else "pour"

    return [
        {
            "label": "true claim (live position)",
            "claim": f"{full_name} a voté {position} sur : {vote_title}",
            "expected": {"vrai"},
            "expect_citation": vote_id,
        },
        {
            "label": "false claim (negated position)",
            "claim": f"{full_name} a voté {opposite} sur : {vote_title}",
            "expected": {"faux", "trompeur"},
            "expect_citation": vote_id,
        },
        {
            "label": "unverifiable — period outside window",
            "claim": f"{full_name} a voté contre l'augmentation du SMIC en 2010",
            "expected": {"inverifiable"},
            "expect_citation": None,
        },
        {
            "label": "unverifiable — unknown person",
            "claim": "Le député Jean Dupontel a voté contre la réforme des retraites",
            "expected": {"inverifiable"},
            "expect_citation": None,
        },
    ]


def _citation_ids_exist(citations: list[dict]) -> bool:
    if not citations:
        return True
    ids = [c["vote_id"] for c in citations]
    with psycopg2.connect(os.getenv("DATABASE_URL")) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM votes WHERE vote_id = ANY(%s)", (ids,))
            return cur.fetchone()[0] == len(ids)


def main() -> None:
    golden = _live_golden_claims()
    mlflow.set_experiment("monelu_verify_eval")

    with mlflow.start_run(run_name="verify_golden_claims"):
        verdict_scores, citation_scores = [], []
        for case in golden:
            result = verify_claim(case["claim"])
            verdict_ok = result["verdict"] in case["expected"]
            citations_valid = _citation_ids_exist(result["citations"])
            cited_ids = [c["vote_id"] for c in result["citations"]]
            expected_cited = case["expect_citation"] is None or case["expect_citation"] in cited_ids
            verdict_scores.append(1.0 if verdict_ok else 0.0)
            citation_scores.append(1.0 if (citations_valid and expected_cited) else 0.0)
            print(f"[{'OK' if verdict_ok else 'MISS'}] {case['label']}")
            print(f"      claim:    {case['claim']}")
            print(f"      verdict:  {result['verdict']} (expected {case['expected']})")
            print(f"      cited:    {cited_ids}")
            print(f"      confidence: {result['confidence']}")

        mlflow.log_metric("verdict_accuracy", sum(verdict_scores) / len(verdict_scores))
        mlflow.log_metric("citation_validity", sum(citation_scores) / len(citation_scores))
        mlflow.log_param("n_claims", len(golden))
        print(
            f"\nverdict_accuracy={sum(verdict_scores) / len(verdict_scores):.2f} "
            f"citation_validity={sum(citation_scores) / len(citation_scores):.2f}"
        )


if __name__ == "__main__":
    main()
