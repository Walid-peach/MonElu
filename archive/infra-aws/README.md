# Archived — AWS Terraform IaC

This is the AWS IaC written for the pre-ADR-001 Airflow/Spark architecture.
It is validate-passing but was never applied, and is superseded by the
Railway + Supabase stack the project actually runs on (see
[`docs/decisions.md`](../../docs/decisions.md), decision 1).

Kept as reference, not as a live deployment target. If/when an AWS migration
becomes real, start from scratch with a state backend and an App Runner/ECS
module for the FastAPI app — almost none of the `ec2` module here survives
that design; `networking`/`s3`/`rds` are the only modules worth salvaging.
