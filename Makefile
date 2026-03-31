.PHONY: start stop ingest api psql

start:
	docker compose up -d

stop:
	docker compose down

ingest:
	venv/bin/python3 scripts/ingest_deputies.py
	venv/bin/python3 scripts/ingest_votes.py
	venv/bin/python3 scripts/ingest_positions.py

api:
	venv/bin/uvicorn api.main:app --reload

psql:
	docker exec -it monelu_postgres psql -U monelu monelu
