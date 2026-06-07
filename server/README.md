# clowder-sync

Account + per-slot cloud-save backend for **Clowder & Crest**. A small FastAPI
service on the VPS, bound to `127.0.0.1:3486`, reverse-proxied by Apache at
`/api/` on both `clowderandcrest.com` and `clowder.stephens.page`.

It is a **dedicated** service (not multi-tenant with Quadrille). It reuses
Quadrille's proven account/auth/session skeleton (`auth.py`, `security.py`,
`mailer.py`, the `users`/`auth_sessions`/`auth_tokens` schema) but replaces
Quadrille's row-level sync with **per-slot whole-blob sync** suited to Clowder's
monolithic `SaveData`. The isolation is deliberate: a bug here can never touch
Quadrille's data, and each app keeps its own sync model. See
`docs/clowder-and-crest-account-architecture/model-council-synthesis.md`.

## Design rules (non-negotiable)

- **Local data is the source of truth unless the player explicitly chooses
  otherwise.** Every automatic action is a no-loss fast-forward; every
  destructive direction creates a backup first and requires a visible choice.
  (The Chart35 incident: silent overwrite-on-load cost a real user weeks of
  data. We do not repeat it.)
- **Optimistic concurrency by content hash.** The client sends the `baseHash`
  it last saw; a mismatch returns `409 Conflict` with the remote summary, never
  a silent overwrite. Re-PUT of identical bytes is an idempotent no-op.
- **Server is opaque storage with abuse caps.** It validates gross shape and a
  size ceiling; the client's `validateAndSanitizeSave()` is the real gate, run
  on every inbound download.
- **Sync works immediately on signup.** Email verification gates only password
  reset. Flip `CLOWDER_REQUIRE_VERIFIED=1` to gate sync if abuse appears.

## Layout

```
server/
  clowder_sync_app.py   # FastAPI app, CORS, health, router mounting
  settings.py           # env config
  db.py                 # psycopg2 pool + idempotent schema bootstrap
  auth.py               # email+password, opaque sessions, verify, reset (from Quadrille)
  security.py           # Argon2id hashing + opaque tokens (from Quadrille, verbatim)
  mailer.py             # transactional email over Resend SMTP (Clowder branding)
  sync_slots.py         # per-slot whole-blob sync with hash concurrency
  requirements.txt
```

## Environment (`server/.env`, chmod 600, gitignored)

```
CLOWDER_SYNC_DB=postgresql://clowder_sync_app:<pw>@127.0.0.1:5432/clowder_sync
CLOWDER_SYNC_PORT=3486
CLOWDER_BASE_URL=https://clowderandcrest.com
CLOWDER_REQUIRE_VERIFIED=0
# CLOWDER_CORS_ORIGINS=...   # defaults cover both web domains + Capacitor + Vite
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<shared stephens.page Resend API key>
SMTP_FROM_EMAIL=noreply@stephens.page
CLOWDER_MAIL_FROM_NAME=Clowder & Crest
```

## Run / deploy

```bash
# venv lives on the volume (root disk is ~98% full)
/mnt/volume_nyc3_01/jacob/clowder-sync-venv/bin/pip install -r requirements.txt
sudo systemctl restart clowder-sync     # uvicorn clowder_sync_app:app on :3486
curl -s https://clowderandcrest.com/api/health
```

See `deploy/` for the systemd unit and Apache snippets.
