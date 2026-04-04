.PHONY: start stop migrate ingest ingest-prod api psql check-db

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
