from __future__ import annotations

import great_expectations as gx


def get_votes_suite():
    """
    Great Expectations suite for raw votes data.
    Called by Airflow DAG before Bronze write.
    """
    suite = gx.ExpectationSuite(expectation_suite_name="votes_bronze")
    suite.add_expectation(
        gx.core.ExpectationConfiguration(
            expectation_type="expect_table_row_count_to_be_between",
            kwargs={"min_value": 1, "max_value": 10_000},
        )
    )
    suite.add_expectation(
        gx.core.ExpectationConfiguration(
            expectation_type="expect_column_to_exist",
            kwargs={"column": "uid"},
        )
    )
    suite.add_expectation(
        gx.core.ExpectationConfiguration(
            expectation_type="expect_column_to_exist",
            kwargs={"column": "dateScrutin"},
        )
    )
    suite.add_expectation(
        gx.core.ExpectationConfiguration(
            expectation_type="expect_column_to_exist",
            kwargs={"column": "sort"},
        )
    )
    suite.add_expectation(
        gx.core.ExpectationConfiguration(
            expectation_type="expect_column_values_to_not_be_null",
            kwargs={"column": "dateScrutin"},
        )
    )
    suite.add_expectation(
        gx.core.ExpectationConfiguration(
            expectation_type="expect_column_values_to_be_in_set",
            kwargs={
                "column": "sort",
                "value_set": ["adopté", "rejeté", "Adopté", "Rejeté"],
            },
        )
    )
    return suite


def validate_votes(data: list[dict]) -> dict:
    """
    Validate votes data against expectations.
    Returns: {"success": bool, "results": list}
    """
    import pandas as pd

    context = gx.get_context()
    df = pd.DataFrame(data)
    validator = context.sources.pandas_default.read_dataframe(df)
    suite = get_votes_suite()
    results = validator.validate(expectation_suite=suite)
    return {
        "success": results.success,
        "evaluated": len(results.results),
        "failed": sum(1 for r in results.results if not r.success),
        "results": [
            {
                "expectation": r.expectation_config.expectation_type,
                "success": r.success,
            }
            for r in results.results
        ],
    }
