"""Shared Postgres connection pool + idempotent schema bootstrap.

Adapted from the Quadrille sync service's db.py. The accounts/sessions/tokens
tables are kept byte-identical to Quadrille so auth.py ports with only branding
edits; the Quadrille row-level sync tables (user_sync_state) and all Web Push
tables are dropped, and two Clowder-specific save tables are added:

  clowder_save_slots          — one authoritative cloud blob per (user, slot)
  clowder_save_slot_versions  — archive of every replaced blob (cross-device
                                recovery; the device that did the overwrite may
                                be gone, so a client-side .bak is not enough)
"""
import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool

DB_URL = os.environ["CLOWDER_SYNC_DB"]

_pool = SimpleConnectionPool(1, 8, dsn=DB_URL)


@contextmanager
def db_cursor(commit: bool = False, dict_rows: bool = False):
    conn = _pool.getconn()
    cur = conn.cursor(
        cursor_factory=psycopg2.extras.RealDictCursor if dict_rows else None
    )
    try:
        yield cur
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        _pool.putconn(conn)


def init_db() -> None:
    """Create all tables (idempotent). Safe to call on every startup."""
    with db_cursor(commit=True) as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        cur.execute("CREATE EXTENSION IF NOT EXISTS citext")

        # --- accounts (identical to Quadrille) ---
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email CITEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                email_verified_at TIMESTAMPTZ,
                disabled_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                device_id TEXT,
                platform TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                idle_expires_at TIMESTAMPTZ NOT NULL,
                absolute_expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id)"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','password_reset')),
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS rate_limit_events (
                id BIGSERIAL PRIMARY KEY,
                key TEXT NOT NULL,
                action TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS rate_limit_idx ON rate_limit_events(key, action, created_at)"
        )

        # --- Clowder per-slot cloud saves ---
        # One authoritative blob per (user, slot). save_hash is the sha256 of
        # the canonicalized save JSON and is the optimistic-concurrency key:
        # the client sends the baseHash it last saw, and a mismatch is a 409,
        # never a silent overwrite. The summary columns (player_name/day/...)
        # are extracted in app code so the slot list can render without
        # shipping full blobs.
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS clowder_save_slots (
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 3),
                save_json JSONB NOT NULL,
                save_hash TEXT NOT NULL,
                save_version INTEGER,
                player_name TEXT,
                day INTEGER,
                chapter INTEGER,
                cats_count INTEGER,
                last_played_ms BIGINT,
                client_device_id TEXT,
                server_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (user_id, slot)
            )
            """
        )
        # Archive of every replaced cloud blob. Written before any overwrite
        # (forced upload, download-replace, or delete). This is the cross-device
        # recovery net: the client .bak only protects the device that did the
        # write, but the destructive write may have come from a device that no
        # longer exists.
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS clowder_save_slot_versions (
                id BIGSERIAL PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                slot SMALLINT NOT NULL,
                save_json JSONB NOT NULL,
                save_hash TEXT NOT NULL,
                replaced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                replaced_by_session UUID,
                reason TEXT NOT NULL CHECK (
                    reason IN ('overwrite','download-replaced','delete-cloud','admin')
                )
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS clowder_slot_versions_idx "
            "ON clowder_save_slot_versions(user_id, slot, replaced_at DESC)"
        )
