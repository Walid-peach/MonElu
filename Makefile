.PHONY: start stop migrate ingest ingest-prod api psql check-db fix-deputies rag-index rag-stats rag-clear rag-test rag-eval rag-notable rag-test-sql rag-laws mlflow-ui venv dbt-run dbt-test dbt-docs dbt-lineage dbt-clean frontend-dev frontend-build frontend-start

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
	venv/bin/python3 scripts/run_ingestion_prod.py --since $$(python3 -c "from datetime import date, timedelta; print(date.today() - timedelta(days=90))")

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

rag-notable:
	venv/bin/python3 -m rag.pipeline.chunk_notable_deputies

rag-laws:
	venv/bin/python3 -m rag.pipeline.chunk_law_summaries

rag-test-sql:
	venv/bin/python3 -c "\
from rag.chain.sql_router import route; \
questions = [\
  'Combien de députés appartiennent à chaque groupe parlementaire ?',\
  'Quel groupe parlementaire s abstient le plus ?',\
  'Quel est le taux de présence moyen par parti ?',\
  'Combien de votes ont été adoptés et rejetés ?',\
  'Quel est le taux de présence de Yaël Braun-Pivet ?',\
]; \
[print(f'Q: {q}') or print(f'SQL: {route(q) is not None}') or print('---') for q in questions]"

mlflow-ui:
	venv/bin/mlflow ui --port 5001

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

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-start:
	cd frontend && npm start
