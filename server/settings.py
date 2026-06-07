"""Environment configuration for the clowder-sync service.

All config comes from the environment (loaded by the systemd unit's
EnvironmentFile). Import `settings` and read attributes; nothing here reads
the env lazily, so a missing required var fails fast at startup.
"""
import os


def _origins(raw: str) -> list[str]:
    return [o.strip() for o in raw.split(",") if o.strip()]


class Settings:
    # --- database ---
    DB_URL: str = os.environ["CLOWDER_SYNC_DB"]

    # --- network ---
    PORT: int = int(os.environ.get("CLOWDER_SYNC_PORT", "3486"))
    # Public base URL used in verification / reset email links. The web app is
    # same-origin with /api, so this is the user-facing site, not the service.
    BASE_URL: str = os.environ.get("CLOWDER_BASE_URL", "https://clowderandcrest.com")

    # --- auth / sessions ---
    COOKIE_NAME: str = "__Host-clowder_session"
    MIN_PASSWORD_LEN: int = 8

    # Optional kill-switch: if a future abuse/deliverability problem appears,
    # set CLOWDER_REQUIRE_VERIFIED=1 to gate sync behind email verification
    # without a code change. Default OFF — sync works immediately on signup
    # (verification only gates password reset). See the model-council synthesis.
    REQUIRE_VERIFIED_FOR_SYNC: bool = os.environ.get("CLOWDER_REQUIRE_VERIFIED", "0") == "1"

    # --- CORS ---
    # Web is same-origin (no CORS needed), but the Capacitor WebView is a
    # cross-origin context (https://localhost on Android, capacitor://localhost
    # on iOS) and DOES need an explicit allowlist. Never wildcard — we send
    # credentials. The exact native Origin must be verified against a real
    # build; this list covers the documented candidates plus the Vite dev port.
    CORS_ORIGINS: list[str] = _origins(
        os.environ.get(
            "CLOWDER_CORS_ORIGINS",
            "https://clowderandcrest.com,"
            "https://www.clowderandcrest.com,"
            "https://clowder.stephens.page,"
            "http://localhost:3200,"
            "http://localhost,"
            "https://localhost,"
            "capacitor://localhost",
        )
    )

    # --- save blob limits ---
    # Real saves are a few KB; a 1 MiB ceiling is generous headroom and an
    # abuse cap, not a normal-path limit. Late-game journal/dungeonHistory
    # arrays are the growth vector to watch.
    MAX_SAVE_BYTES: int = int(os.environ.get("CLOWDER_MAX_SAVE_BYTES", str(1024 * 1024)))


settings = Settings()
