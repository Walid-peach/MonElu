import os
from contextlib import contextmanager

import psycopg2.extras
import psycopg2.pool

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def init_pool(minconn: int = 2, maxconn: int = 10) -> None:
    global _pool
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=minconn,
        maxconn=maxconn,
        dsn=os.getenv("DATABASE_URL"),
        cursor_factory=psycopg2.extras.RealDictCursor,
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
    except Exception:
        try:
            conn.rollback()
        except Exception:
            broken = True
        raise
    finally:
        _pool.putconn(conn, close=broken)
