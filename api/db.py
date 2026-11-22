import logging
import os
import threading
import time
import uuid
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
import psycopg2.pool
from fastapi import HTTPException

MART_UNAVAILABLE = HTTPException(
    status_code=503,
    detail="Analytics layer unavailable — dbt marts not found. Run `dbt run` to build them.",
)

logger = logging.getLogger(__name__)

_pool: psycopg2.pool.ThreadedConnectionPool | None = None

_STATEMENT_TIMEOUT = "5s"


class _TimedCursor(psycopg2.extras.RealDictCursor):
    """A RealDictCursor that opens every transaction with `SET LOCAL statement_timeout`.

    The timeout cannot ride on the connection: Supabase's transaction-mode pooler
    rejects startup options, and a session `SET` would outlive the request on a
    pooled server connection. Applying it whenever a statement is about to begin a
    new transaction covers the first query, and every query after a caller's own
    `commit()` or `rollback()`.
    """

    def execute(self, query, vars=None):
        self._apply_timeout()
        return super().execute(query, vars)

    def executemany(self, query, vars_list):
        self._apply_timeout()
        return super().executemany(query, vars_list)

    def _apply_timeout(self) -> None:
        conn = self.connection
        if conn.autocommit:
            raise RuntimeError("the public pool runs in transactions; autocommit drops the timeout")
        if conn.info.transaction_status == psycopg2.extensions.TRANSACTION_STATUS_IDLE:
            super().execute("SET LOCAL statement_timeout = %s", (_STATEMENT_TIMEOUT,))


def init_pool(minconn: int = 2, maxconn: int = 10) -> None:
    global _pool
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=minconn,
        maxconn=maxconn,
        dsn=os.getenv("DATABASE_URL"),
        cursor_factory=_TimedCursor,
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


_account_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_account_pool_lock = threading.Lock()

_ACCOUNT_POOL_MINCONN = 1
_ACCOUNT_POOL_MAXCONN = 5
_ACCOUNT_CONNECT_ATTEMPTS = 3
_ACCOUNT_CONNECT_BACKOFF_SECONDS = 0.25
_ACCOUNT_BEGIN_ATTEMPTS = 2
_ACCOUNT_CONNECT_TIMEOUT_SECONDS = 5

_ACCOUNT_STATEMENT_TIMEOUT = "5s"


class AccountStoreUnavailable(Exception):
    """The restricted-role pool is unconfigured, cannot connect, or lost its connection.

    Account routes answer it with 503. Connection-level failures inside a
    transaction (a severed socket, a `statement_timeout` cancellation) are raised
    as this too, so no route can let one fall through to a 500.
    """


def _with_connect_retry(connect):
    for attempt in range(_ACCOUNT_CONNECT_ATTEMPTS):
        try:
            return connect()
        except psycopg2.OperationalError as exc:
            if attempt == _ACCOUNT_CONNECT_ATTEMPTS - 1:
                raise AccountStoreUnavailable("cannot connect as the account role") from None
            logger.warning("Account DB connection failed (%s), retrying", type(exc).__name__)
            time.sleep(_ACCOUNT_CONNECT_BACKOFF_SECONDS * 2**attempt)
    raise AssertionError("unreachable")


def init_account_pool() -> None:
    """Startup hook: reports a missing configuration, opens no connection."""
    if not os.getenv("ACCOUNT_DATABASE_URL"):
        logger.warning(
            "ACCOUNT_DATABASE_URL is not set — account routes will answer 503 "
            "(public routes are unaffected)"
        )


def _get_account_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _account_pool
    if _account_pool is not None:
        return _account_pool
    with _account_pool_lock:
        if _account_pool is None:
            dsn = os.getenv("ACCOUNT_DATABASE_URL")
            if not dsn:
                raise AccountStoreUnavailable("ACCOUNT_DATABASE_URL is not set")
            _account_pool = _with_connect_retry(
                lambda: psycopg2.pool.ThreadedConnectionPool(
                    minconn=_ACCOUNT_POOL_MINCONN,
                    maxconn=_ACCOUNT_POOL_MAXCONN,
                    dsn=dsn,
                    cursor_factory=psycopg2.extras.RealDictCursor,
                    connect_timeout=_ACCOUNT_CONNECT_TIMEOUT_SECONDS,
                )
            )
        return _account_pool


def close_account_pool() -> None:
    if _account_pool and not _account_pool.closed:
        _account_pool.closeall()


def _get_account_conn(pool: psycopg2.pool.ThreadedConnectionPool):
    try:
        return _with_connect_retry(pool.getconn)
    except psycopg2.pool.PoolError as exc:
        raise AccountStoreUnavailable("account pool exhausted") from exc


def _begin_account_transaction(pool: psycopg2.pool.ThreadedConnectionPool, profile_id: uuid.UUID):
    """Check out a connection and open the identity-scoped transaction on it.

    Returns `(conn, cursor)` with `app.user_id` already set. A connection that
    fails here has run nothing of the caller's yet, so it is discarded and the
    transaction is begun again on a fresh one.
    """
    for attempt in range(_ACCOUNT_BEGIN_ATTEMPTS):
        conn = _get_account_conn(pool)
        try:
            conn.autocommit = False
            cur = conn.cursor()
            cur.execute("SET LOCAL app.user_id = %s", (str(profile_id),))
            cur.execute("SET LOCAL statement_timeout = %s", (_ACCOUNT_STATEMENT_TIMEOUT,))
            return conn, cur
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as exc:
            pool.putconn(conn, close=True)
            if attempt == _ACCOUNT_BEGIN_ATTEMPTS - 1:
                raise AccountStoreUnavailable("account connection unusable") from None
            logger.warning("Stale account DB connection (%s), reconnecting", type(exc).__name__)
        except BaseException:
            try:
                conn.rollback()
                pool.putconn(conn, close=False)
            except Exception:
                pool.putconn(conn, close=True)
            raise
    raise AssertionError("unreachable")


@contextmanager
def account_transaction(profile_id: uuid.UUID):
    """Yield a cursor on the restricted pool, inside one transaction scoped to a profile.

    The transaction opens with `SET LOCAL app.user_id`, which is what the
    migration 013 policies read, so every statement in the block sees only that
    profile's rows even without a `WHERE` of its own. Commits on success, rolls
    back on any exception. Connection-level failures, at any point, surface as
    AccountStoreUnavailable (503), never as a raw psycopg2 error.

    `SET LOCAL`, never `SET`: Supabase sits behind PgBouncer in transaction
    pooling mode, so a session-scoped `SET` would outlive this request and hand
    the next caller on that server connection this profile's identity. The GUC
    ends with the transaction, which is also why every authenticated query has
    to run inside this block rather than on a bare connection.

    `profile_id` is MonÉlu's own profile id (`app_private.profiles.id`), not the
    token's `sub` - the policies key on the former (ADR-040 §5, identity keys).
    """
    profile_id = uuid.UUID(str(profile_id))

    pool = _get_account_pool()
    conn, cur = _begin_account_transaction(pool, profile_id)
    broken = False
    try:
        with cur:
            yield cur
        conn.commit()
    except (psycopg2.OperationalError, psycopg2.InterfaceError) as exc:
        broken = True
        try:
            conn.rollback()
        except Exception:
            pass
        logger.warning("Account DB transaction failed (%s)", type(exc).__name__)
        raise AccountStoreUnavailable("account transaction failed") from None
    except BaseException:
        try:
            conn.rollback()
        except Exception:
            broken = True
        raise
    finally:
        pool.putconn(conn, close=broken)
