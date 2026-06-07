"""clowder-sync — account + per-slot cloud-save service for Clowder & Crest.

A small, isolated FastAPI service that reuses the Quadrille account/auth/session
skeleton but replaces Quadrille's row-level sync with per-slot whole-blob sync
suited to Clowder's monolithic SaveData. Bound to 127.0.0.1 and reverse-proxied
by Apache at /api/ on both clowderandcrest.com and clowder.stephens.page.

Dedicated service (not multi-tenant with Quadrille) for blast-radius isolation:
a bug here can never touch Quadrille's data. See the model-council synthesis in
docs/clowder-and-crest-account-architecture/.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from settings import settings

app = FastAPI(title="clowder-sync", docs_url=None, redoc_url=None)

# Web is same-origin and needs no CORS, but the Capacitor WebView is a
# cross-origin context and does. Explicit allowlist, credentials on, never
# wildcard (a wildcard origin is incompatible with credentialed requests).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["authorization", "content-type"],
)

init_db()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "clowder-sync"}


@app.get("/api/version")
def version() -> dict:
    return {"service": "clowder-sync", "accounts": True}


# Routers (auth, saves) are mounted in their own commits.
try:
    from auth import router as auth_router

    app.include_router(auth_router)
except ImportError:
    pass

try:
    from sync_slots import router as saves_router

    app.include_router(saves_router)
except ImportError:
    pass
