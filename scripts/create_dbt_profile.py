import os
import pathlib

port = int(os.environ.get("DBT_PORT") or "5432")
host = os.environ["DBT_HOST"]
user = os.environ["DBT_USER"]
password = os.environ["DBT_PASSWORD"]
dbname = os.environ["DBT_DBNAME"]

content = f"""transform:
  target: prod
  outputs:
    prod:
      type: postgres
      host: "{host}"
      port: {port}
      user: "{user}"
      password: "{password}"
      dbname: "{dbname}"
      schema: analytics
      threads: 4
      connect_timeout: 10
"""

pathlib.Path("transform/profiles.yml").write_text(content)
print(f"transform/profiles.yml written (host={host}, dbname={dbname})")
