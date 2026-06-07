"""Per-slot whole-blob cloud save sync.

Clowder's SaveData is a single monolithic JSON blob, so there is no meaningful
row-level merge (Quadrille's model). The unit of sync is one blob per
(user, slot in 1..3). Conflict safety is optimistic concurrency by content
hash: the client sends the `baseHash` it last synced to, and the server returns
409 on any mismatch — never a silent overwrite. A forced overwrite (only from an
explicit user choice in the divergence chooser) archives the replaced blob into
clowder_save_slot_versions first, so even cross-device clobbers are recoverable.

The server is opaque storage with abuse caps. It checks gross shape and a size
ceiling; the client's validateAndSanitizeSave() is the real compatibility gate
and runs on every inbound download.
"""
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel

from auth import current_user, current_user_mutating
from db import db_cursor
from settings import settings

router = APIRouter(prefix="/api/saves", tags=["saves"])

VALID_REASONS = {"day-end", "manual-upload", "initial-upload", "conflict-resolution"}


# --- models ----------------------------------------------------------------

class PutSlotBody(BaseModel):
    save: dict
    baseHash: str | None = None
    force: bool = False
    deviceId: str | None = None
    reason: str | None = None


# --- helpers ---------------------------------------------------------------

def _canonical_hash(save: dict) -> str:
    """sha256 of a canonical JSON serialization. Deterministic for equal
    content; the server is the sole authority for this hash and the client
    treats it as an opaque token."""
    canonical = json.dumps(save, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def _summary(save: dict) -> dict:
    """Cheap display summary so the slot list renders without full blobs.
    Field names mirror Clowder's SaveData (playerCatName, not name)."""
    cats = save.get("cats")
    return {
        "name": save.get("playerCatName") if isinstance(save.get("playerCatName"), str) else "Unknown",
        "day": save.get("day") if isinstance(save.get("day"), int) else None,
        "chapter": save.get("chapter") if isinstance(save.get("chapter"), int) else None,
        "cats": len(cats) if isinstance(cats, list) else 0,
        "lastPlayedTimestamp": save.get("lastPlayedTimestamp") if isinstance(save.get("lastPlayedTimestamp"), (int, float)) else None,
        "version": save.get("version") if isinstance(save.get("version"), int) else None,
    }


def _validate_save(save: dict) -> None:
    """Gross shape + size gate. Abuse containment, not game compatibility."""
    if not isinstance(save, dict):
        raise HTTPException(status_code=400, detail="Save must be a JSON object")
    size = len(json.dumps(save, separators=(",", ":")).encode("utf-8"))
    if size > settings.MAX_SAVE_BYTES:
        raise HTTPException(status_code=413, detail="Save too large")
    if not isinstance(save.get("day"), int) or not isinstance(save.get("chapter"), int):
        raise HTTPException(status_code=400, detail="Save missing day/chapter")
    cats = save.get("cats")
    if not isinstance(cats, list) or len(cats) == 0:
        raise HTTPException(status_code=400, detail="Save missing cats")


def _require_verified_if_configured(user: dict) -> None:
    """No-op unless CLOWDER_REQUIRE_VERIFIED=1. Default: sync works
    immediately on signup; verification gates only password reset."""
    if settings.REQUIRE_VERIFIED_FOR_SYNC and not user["email_verified"]:
        raise HTTPException(
            status_code=403, detail="Verify your email to enable cloud sync"
        )


def _archive_existing(cur, user_id: str, slot: int, save_json, save_hash: str,
                      session_id: str | None, reason: str) -> None:
    cur.execute(
        "INSERT INTO clowder_save_slot_versions "
        "(user_id, slot, save_json, save_hash, replaced_by_session, reason) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (user_id, slot, json.dumps(save_json), save_hash, session_id, reason),
    )


# --- endpoints -------------------------------------------------------------

@router.get("/slots")
def list_slots(user: dict = Depends(current_user)) -> dict:
    _require_verified_if_configured(user)
    with db_cursor(dict_rows=True) as cur:
        cur.execute(
            "SELECT slot, save_hash, save_json, server_updated_at, client_device_id "
            "FROM clowder_save_slots WHERE user_id = %s ORDER BY slot",
            (user["user_id"],),
        )
        rows = cur.fetchall()
    return {
        "slots": [
            {
                "slot": r["slot"],
                "exists": True,
                "hash": r["save_hash"],
                "serverUpdatedAt": r["server_updated_at"].isoformat(),
                "deviceId": r["client_device_id"],
                "summary": _summary(r["save_json"]),
            }
            for r in rows
        ]
    }


@router.get("/slots/{slot}")
def get_slot(user: dict = Depends(current_user), slot: int = Path(ge=1, le=3)) -> dict:
    _require_verified_if_configured(user)
    with db_cursor(dict_rows=True) as cur:
        cur.execute(
            "SELECT save_json, save_hash, server_updated_at, client_device_id "
            "FROM clowder_save_slots WHERE user_id = %s AND slot = %s",
            (user["user_id"], slot),
        )
        row = cur.fetchone()
    if row is None:
        return {"exists": False, "slot": slot, "hash": None, "save": None}
    return {
        "exists": True,
        "slot": slot,
        "hash": row["save_hash"],
        "serverUpdatedAt": row["server_updated_at"].isoformat(),
        "deviceId": row["client_device_id"],
        "save": row["save_json"],
    }


@router.put("/slots/{slot}")
def put_slot(body: PutSlotBody, user: dict = Depends(current_user_mutating),
             slot: int = Path(ge=1, le=3)) -> dict:
    _require_verified_if_configured(user)
    _validate_save(body.save)
    reason = body.reason if body.reason in VALID_REASONS else "manual-upload"
    new_hash = _canonical_hash(body.save)
    summary = _summary(body.save)
    payload = json.dumps(body.save)

    with db_cursor(commit=True, dict_rows=True) as cur:
        cur.execute(
            "SELECT save_hash FROM clowder_save_slots "
            "WHERE user_id = %s AND slot = %s FOR UPDATE",
            (user["user_id"], slot),
        )
        row = cur.fetchone()

        # No cloud row yet → first write for this slot.
        if row is None:
            cur.execute(
                "INSERT INTO clowder_save_slots "
                "(user_id, slot, save_json, save_hash, save_version, player_name, "
                " day, chapter, cats_count, last_played_ms, client_device_id) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (user["user_id"], slot, payload, new_hash, summary["version"],
                 summary["name"], summary["day"], summary["chapter"], summary["cats"],
                 summary["lastPlayedTimestamp"], body.deviceId),
            )
            return {"ok": True, "slot": slot, "hash": new_hash, "status": "created"}

        existing_hash = row["save_hash"]

        # Identical content → idempotent no-op (handles debounced double-pushes).
        if existing_hash == new_hash:
            return {"ok": True, "slot": slot, "hash": new_hash, "status": "unchanged"}

        # Clean fast-forward: client's base matches what's stored.
        is_fast_forward = body.baseHash == existing_hash

        if not is_fast_forward and not body.force:
            # Divergence — return the remote so the client can show a chooser.
            # NEVER overwrite here. This is the core anti-Chart35 guard.
            cur.execute(
                "SELECT save_json, save_hash, server_updated_at, client_device_id "
                "FROM clowder_save_slots WHERE user_id = %s AND slot = %s",
                (user["user_id"], slot),
            )
            remote = cur.fetchone()
            raise HTTPException(
                status_code=409,
                detail={
                    "conflict": True,
                    "slot": slot,
                    "remoteHash": remote["save_hash"],
                    "serverUpdatedAt": remote["server_updated_at"].isoformat(),
                    "deviceId": remote["client_device_id"],
                    "remoteSummary": _summary(remote["save_json"]),
                },
            )

        # Either a clean fast-forward or an explicit forced overwrite from the
        # divergence chooser. Archive the replaced blob first, then update — so
        # the previous cloud state is always recoverable from the archive table.
        cur.execute(
            "SELECT save_json, save_hash FROM clowder_save_slots "
            "WHERE user_id = %s AND slot = %s",
            (user["user_id"], slot),
        )
        old = cur.fetchone()
        _archive_existing(cur, user["user_id"], slot, old["save_json"],
                          old["save_hash"], user["session_id"], "overwrite")
        cur.execute(
            "UPDATE clowder_save_slots SET save_json=%s, save_hash=%s, save_version=%s, "
            "player_name=%s, day=%s, chapter=%s, cats_count=%s, last_played_ms=%s, "
            "client_device_id=%s, server_updated_at=now() "
            "WHERE user_id=%s AND slot=%s",
            (payload, new_hash, summary["version"], summary["name"], summary["day"],
             summary["chapter"], summary["cats"], summary["lastPlayedTimestamp"],
             body.deviceId, user["user_id"], slot),
        )
    status = "fast-forward" if is_fast_forward else "forced"
    return {"ok": True, "slot": slot, "hash": new_hash, "status": status}


@router.delete("/slots/{slot}")
def delete_slot(user: dict = Depends(current_user_mutating),
                slot: int = Path(ge=1, le=3)) -> dict:
    """Manual cloud-delete only. Never called automatically when a local slot
    is deleted — that would let a wiped device erase the cloud copy."""
    _require_verified_if_configured(user)
    with db_cursor(commit=True, dict_rows=True) as cur:
        cur.execute(
            "SELECT save_json, save_hash FROM clowder_save_slots "
            "WHERE user_id = %s AND slot = %s FOR UPDATE",
            (user["user_id"], slot),
        )
        row = cur.fetchone()
        if row is None:
            return {"ok": True, "slot": slot, "status": "absent"}
        _archive_existing(cur, user["user_id"], slot, row["save_json"],
                          row["save_hash"], user["session_id"], "delete-cloud")
        cur.execute(
            "DELETE FROM clowder_save_slots WHERE user_id = %s AND slot = %s",
            (user["user_id"], slot),
        )
    return {"ok": True, "slot": slot, "status": "deleted"}
