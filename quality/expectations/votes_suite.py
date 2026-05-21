from __future__ import annotations

import great_expectations as gx


def get_votes_suite() -> gx.ExpectationSuite:
    """
    Great Expectations suite for raw votes data.
    Called by Airflow DAG before Bronze write.
    """
    suite = gx.ExpectationSuite(name="votes_bronze")
    suite.add_expectation(
        gx.expectations.ExpectTableRowCountToBeBetween(min_value=1, max_value=10_000)
    )
    suite.add_expectation(gx.expectations.ExpectColumnToExist(column="uid"))
    suite.add_expectation(gx.expectations.ExpectColumnToExist(column="dateScrutin"))
    suite.add_expectation(gx.expectations.ExpectColumnToExist(column="sort"))
    suite.add_expectation(gx.expectations.ExpectColumnValuesToNotBeNull(column="dateScrutin"))
    suite.add_expectation(
        gx.expectations.ExpectColumnValuesToBeInSet(
            column="sort",
            value_set=["adopté", "rejeté", "Adopté", "Rejeté"],
        )
    )
    return suite


def validate_votes(data: list[dict]) -> dict:
    """
    Validate votes data against expectations.
    Returns: {"success": bool, "results": list}
    """
    import pandas as pd

    context = gx.get_context(mode="ephemeral")
    data_source = context.data_sources.add_pandas("pandas_source")
    data_asset = data_source.add_dataframe_asset("dataframe_asset")
    batch_definition = data_asset.add_batch_definition_whole_dataframe("batch_def")

    suite = get_votes_suite()
    batch = batch_definition.get_batch(batch_parameters={"dataframe": pd.DataFrame(data)})
    results = batch.validate(suite)

    return {
        "success": results.success,
        "evaluated": len(results.results),
        "failed": sum(1 for r in results.results if not r.success),
        "results": [
            {
                "expectation": r.expectation_config.type,
                "success": r.success,
            }
            for r in results.results
        ],
    }
