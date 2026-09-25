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


def init_pool(minconn: int = 2, maxconn: int = 10) -> None:
    global _pool
    try:
        _pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=minconn,
            maxconn=maxconn,
            dsn=os.getenv("DATABASE_URL"),
            cursor_factory=psycopg2.extras.RealDictCursor,
            # Cap query time so a pathological query can't hold a pooled
            # connection indefinitely.
            options="-c statement_timeout=5000",
        )
    except psycopg2.OperationalError:
        # PgBouncer in transaction mode (e.g. Supabase pooler, port 6543)
        # rejects startup parameters like options=. Fall back to a pool
        # without the timeout rather than failing the deploy.
        logger.warning(
            "DB rejected startup options (statement_timeout) — likely a transaction-mode "
            "pooler DSN; initializing pool without statement_timeout"
        )
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


# ---------------------------------------------------------------------------
# The restricted-role pool for account routes (#413, ADR-040 §5)
# ---------------------------------------------------------------------------
# The pool above connects as the table owner, which bypasses row level
# security. Account data lives in `app_private` behind RLS policies keyed on the
# `app.user_id` GUC, and those policies only apply to a role that is neither the
# owner nor BYPASSRLS - `monelu_app_user` from migration 013. This second pool
# connects as that role, and only the account routes use it. Public routes keep
# the owner pool above, unchanged.
#
# Its DSN is ACCOUNT_DATABASE_URL. The role is created NOLOGIN, so an operator
# sets its password out of band (`ALTER ROLE monelu_app_user WITH LOGIN
# PASSWORD …`) before this pool can connect.
#
# Created lazily, on the first account request, never at startup: a missing or
# not yet enabled account role must not stop the public API (and /health) from
# booting. A failed creation leaves the pool absent and is retried by the next
# request, so enabling the role later needs no restart.
#
# minconn must stay >= 1. psycopg2's pool keeps at most `minconn` idle
# connections and *closes* every other one it is handed back, so minconn=0
# would open a fresh connection - a TLS handshake to Supabase - per request.
# Connecting is retried briefly for the proxy drops PgBouncer produces (the
# lesson of MON-255).

_account_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_account_pool_lock = threading.Lock()

_ACCOUNT_POOL_MINCONN = 1
_ACCOUNT_POOL_MAXCONN = 5
_ACCOUNT_CONNECT_ATTEMPTS = 3
_ACCOUNT_CONNECT_BACKOFF_SECONDS = 0.25
# libpq waits forever by default. Pool creation runs under a lock, so a stalled
# pooler would otherwise queue every account request behind it and, through the
# shared threadpool, starve the public sync routes too.
_ACCOUNT_CONNECT_TIMEOUT_SECONDS = 5

# Applied per transaction rather than as a startup `options=` parameter, which
# Supabase's transaction-mode pooler rejects (see init_pool's fallback above).
_ACCOUNT_STATEMENT_TIMEOUT = "5s"


class AccountStoreUnavailable(Exception):
    """The restricted-role pool is unconfigured or cannot connect."""


def _with_connect_retry(connect):
    for attempt in range(_ACCOUNT_CONNECT_ATTEMPTS):
        try:
            return connect()
        except psycopg2.OperationalError as exc:
            if attempt == _ACCOUNT_CONNECT_ATTEMPTS - 1:
                # `from None`: the libpq message can quote the DSN, and this
                # exception may reach Sentry from a future caller.
                raise AccountStoreUnavailable("cannot connect as the account role") from None
            # Class name only: a libpq connection error can quote the DSN.
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
            # No register_uuid(): UUID columns come back as strings, exactly as
            # the owner pool returns the share tables' ids, and ids are passed
            # in as strings. One convention across both pools.
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


@contextmanager
def account_transaction(profile_id: uuid.UUID):
    """Yield a cursor on the restricted pool, inside one transaction scoped to a profile.

    The transaction opens with `SET LOCAL app.user_id`, which is what the
    migration 013 policies read, so every statement in the block sees only that
    profile's rows even without a `WHERE` of its own. Commits on success, rolls
    back on any exception.

    `SET LOCAL`, never `SET`: Supabase sits behind PgBouncer in transaction
    pooling mode, so a session-scoped `SET` would outlive this request and hand
    the next caller on that server connection this profile's identity. The GUC
    ends with the transaction, which is also why every authenticated query has
    to run inside this block rather than on a bare connection.

    `profile_id` is MonÉlu's own profile id (`app_private.profiles.id`), not the
    token's `sub` - the policies key on the former (ADR-040 §5, identity keys).
    """
    # Normalise and validate before anything reaches SQL: an empty or malformed
    # id must never become the GUC, even though the policies would fail closed.
    profile_id = uuid.UUID(str(profile_id))

    pool = _get_account_pool()
    conn = _get_account_conn(pool)
    broken = False
    try:
        # psycopg2 opens a transaction implicitly on the first statement when
        # autocommit is off; with autocommit on, SET LOCAL would be a no-op
        # warning and every statement would run with no identity at all.
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute("SET LOCAL app.user_id = %s", (str(profile_id),))
            cur.execute("SET LOCAL statement_timeout = %s", (_ACCOUNT_STATEMENT_TIMEOUT,))
            yield cur
        conn.commit()
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        broken = True
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    except BaseException:
        try:
            conn.rollback()
        except Exception:
            broken = True
        raise
    finally:
        pool.putconn(conn, close=broken)
