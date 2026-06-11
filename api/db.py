import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
import psycopg2.pool
from fastapi import HTTPException

MART_UNAVAILABLE = HTTPException(
    status_code=503,
    detail="Analytics layer unavailable — dbt marts not found. Run `dbt run` to build them.",
)

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def init_pool(minconn: int = 2, maxconn: int = 10) -> None:
    global _pool
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=minconn,
        maxconn=maxconn,
        dsn=os.getenv("DATABASE_URL"),
        cursor_factory=psycopg2.extras.RealDictCursor,
        # Cap query time so a pathological query can't hold a pooled
        # connection indefinitely.
        options="-c statement_timeout=5000",
    )


def close_pool() -> None:
    if _pool and not _pool.closed:
        _pool.closeall()


@contextmanager
def get_conn():
    if _pool is None:
        raise RuntimeError("DB pool is not initialized — call init_pool() first")
    conn = _pool.getconn()
    broken = False
    try:
        yield conn
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        # Connection-level failure (severed socket, server restart, closed connection):
        # always discard. rollback() can return successfully on a dead socket, so we
        # cannot rely on it raising to detect a broken connection here.
        broken = True
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    except Exception:
        try:
            conn.rollback()
        except Exception:
            broken = True
        raise
    finally:
        _pool.putconn(conn, close=broken)
