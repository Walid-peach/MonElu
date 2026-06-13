import os
import pathlib

import yaml

profile = {
    "transform": {
        "target": "prod",
        "outputs": {
            "prod": {
                "type": "postgres",
                "host": os.environ["DBT_HOST"],
                "port": int(os.environ.get("DBT_PORT") or "5432"),
                "user": os.environ["DBT_USER"],
                "password": os.environ["DBT_PASSWORD"],
                "dbname": os.environ["DBT_DBNAME"],
                "schema": "analytics",
                "threads": 4,
                "connect_timeout": 10,
            }
        },
    }
}

pathlib.Path("transform/profiles.yml").write_text(yaml.safe_dump(profile))
print(
    f"transform/profiles.yml written (host={os.environ['DBT_HOST']}, dbname={os.environ['DBT_DBNAME']})"
)
