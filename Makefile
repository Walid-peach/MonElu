.PHONY: start stop migrate ingest ingest-prod api psql check-db fix-deputies rag-index rag-stats rag-clear rag-test rag-eval mlflow-ui setup-minio airflow-up airflow-down airflow-logs minio-up airflow-ui minio-ui dag-deputies dag-votes dag-alerts venv dbt-run dbt-test dbt-docs dbt-lineage dbt-clean alerts-run alerts-test

start:
	docker compose up -d

stop:
	docker compose down

migrate:
	venv/bin/python3 scripts/migrate.py

ingest:
	venv/bin/python3 scripts/ingest_deputies.py
	venv/bin/python3 scripts/ingest_votes.py
	venv/bin/python3 scripts/ingest_positions.py

ingest-prod:
	venv/bin/python3 scripts/run_ingestion_prod.py --since 2025-01-01

api:
	venv/bin/uvicorn api.main:app --reload

psql:
	docker exec -it monelu_postgres psql -U monelu monelu

check-db:
	venv/bin/python3 scripts/check_db_size.py

fix-deputies:
	venv/bin/python3 scripts/update_party.py

rag-index:
	venv/bin/python3 -m rag.pipeline.index_manager build

rag-stats:
	venv/bin/python3 -m rag.pipeline.index_manager stats

rag-clear:
	venv/bin/python3 -m rag.pipeline.index_manager clear

rag-test:
	venv/bin/python3 -m rag.chain.rag_chain

rag-eval:
	venv/bin/python3 -m rag.experiments.mlflow_eval

mlflow-ui:
	venv/bin/mlflow ui --port 5001

setup-minio:
	venv/bin/python3 scripts/setup_minio.py

airflow-up:
	@if [ -z "$$AIRFLOW_FERNET_KEY" ]; then echo "WARNING: AIRFLOW_FERNET_KEY is unset — using the public dev default. Set it in .env before deploying to production."; fi
	docker compose up -d airflow-webserver airflow-scheduler

airflow-down:
	docker compose stop airflow-webserver airflow-scheduler airflow-init postgres-airflow

airflow-logs:
	docker compose logs -f airflow-scheduler

minio-up:
	docker compose up -d minio

airflow-ui:
	open http://localhost:8080

minio-ui:
	open http://localhost:9001

dag-deputies:
	docker compose exec airflow-scheduler airflow dags trigger deputies_incremental

dag-votes:
	docker compose exec airflow-scheduler airflow dags trigger votes_batch

dag-alerts:
	docker compose exec airflow-scheduler airflow dags trigger vote_alerts

alerts-run:
	venv/bin/python3 scripts/run_alerts.py

alerts-test:
	venv/bin/python3 scripts/run_alerts.py 525600

venv:
	python3.12 -m venv venv && venv/bin/pip install -r requirements.txt -r requirements-ingest.txt -r requirements-rag.txt

dbt-run:
	cd transform && dbt run --profiles-dir .

dbt-test:
	cd transform && dbt test --profiles-dir .

dbt-docs:
	cd transform && dbt docs generate --profiles-dir . && dbt docs serve --port 8082 --profiles-dir .

dbt-lineage:
	open http://localhost:8082

dbt-clean:
	cd transform && dbt clean --profiles-dir .
