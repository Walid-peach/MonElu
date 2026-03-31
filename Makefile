.PHONY: start test dbt-docs

# Shortcuts: make start, make test, make dbt-docs

start:
	docker compose up -d

test:
	echo "Running tests..."

dbt-docs:
	echo "Generating dbt docs..."
