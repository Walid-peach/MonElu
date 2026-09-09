"""
rag/experiments/verify_eval.py

Golden-claim evaluation for the verification chain (MON-126).

Claims are built from the live DB at eval time (same anti-rot approach as
mlflow_eval.py): a real deputy/vote/position pair yields one true claim and
its negated false claim; two fixed claims cover the unverifiable cases
(period outside the data window, unknown person).

A mixed-record claim (deputy voted pour on some scrutins of a dossier and
contre on others) covers the vrai/trompeur boundary (MON-129): under the
prompt's mixed-record decision rule it must come back "trompeur", and it is
repeated STABILITY_RUNS times to measure verdict stability across runs.

Scores per claim:
  - verdict_ok:        the verdict matches the expected set
  - citations_valid:   every cited vote_id exists in the votes table

Run-level metrics:
  - verdict_accuracy, citation_validity: means over the golden claims
  - mixed_verdict_stability: 1.0 iff all STABILITY_RUNS repetitions of the
    mixed-record claim return the same verdict

Usage:
    venv/bin/python -m rag.experiments.verify_eval
Requires DATABASE_URL, OPENAI_API_KEY, GROQ_API_KEY. Costs a few cents at most
(one embedding + one Groq call per claim, plus STABILITY_RUNS extra
verifications of the mixed-record claim).
"""

import os

import mlflow
import psycopg2

from rag.chain.verify import verify_claim

# Repetitions of the mixed-record claim used to measure verdict stability.
STABILITY_RUNS = 5


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


def _mixed_record_claim() -> dict | None:
    """Build a mixed-record golden claim from the live DB (MON-129).

    Finds a sitting deputy who voted pour on some well-attended scrutins of a
    dossier and contre on others. A blanket "a voté pour" claim over that
    dossier is true for some scrutins only; under the prompt's mixed-record
    decision rule the verdict must be "trompeur", deterministically.

    Returns None when the DB window holds no such pair (small local windows);
    the eval then skips the stability metric instead of failing.
    """
    with psycopg2.connect(os.getenv("DATABASE_URL")) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.full_name,
                    (array_agg(v.vote_title ORDER BY v.total_voters DESC))[1] AS bill_title
                FROM vote_positions vp
                JOIN deputies d ON d.deputy_id = vp.deputy_id
                JOIN votes v ON v.vote_id = vp.vote_id
                WHERE v.dossier_id IS NOT NULL
                  AND v.total_voters >= 300
                  AND d.mandate_end IS NULL
                GROUP BY d.full_name, v.dossier_id
                HAVING COUNT(*) FILTER (WHERE vp.position = 'pour') >= 1
                   AND COUNT(*) FILTER (WHERE vp.position = 'contre') >= 1
                ORDER BY COUNT(*) DESC, d.full_name
                LIMIT 1
                """
            )
            row = cur.fetchone()
    if not row:
        return None
    full_name, bill_title = row
    # The bill label is the title of the dossier's best-attended scrutin - the
    # vote on the whole text rather than on an amendment. It used to be read out
    # of dossier_id, which held the repr of the AN dict; that corruption is fixed
    # and dossier_id now holds the bare ref only (MON-258).
    if not bill_title:
        return None
    return {
        "label": "mixed record (pour on some scrutins, contre on others)",
        "claim": f"{full_name} a voté pour : {bill_title}",
        "expected": {"trompeur"},
        "expect_citation": None,
    }


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
    mixed = _mixed_record_claim()
    if mixed:
        golden.append(mixed)
    else:
        print("WARN: no mixed-record pair in the DB window - stability metric skipped")
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

        if mixed:
            # Same claim, repeated: a fact-check tool must give the same
            # answer to the same question (MON-129).
            verdicts = [verify_claim(mixed["claim"])["verdict"] for _ in range(STABILITY_RUNS)]
            stability = 1.0 if len(set(verdicts)) == 1 else 0.0
            mlflow.log_metric("mixed_verdict_stability", stability)
            mlflow.log_param("stability_runs", STABILITY_RUNS)
            print(f"\nstability over {STABILITY_RUNS} runs: {verdicts}")
            print(f"mixed_verdict_stability={stability:.2f}")


if __name__ == "__main__":
    main()
