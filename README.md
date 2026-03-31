## Project Overview

MonÉlu is a civic data platform that ingests, transforms, and serves data about French elected representatives across all levels of government. At its core, it is a **data engineering showcase** — a production-grade pipeline that demonstrates real-world skills in batch ingestion, streaming, dbt transformations, and LLM-powered search.

## Data Sources
- Deputies: ZIP export from data.assemblee-nationale.fr (AMO10_*json.zip)
  — REST API endpoint returns 404, static export is the correct source.
- Requires psycopg2-binary>=2.9.11 (no wheel for Python 3.14 on 2.9.9)