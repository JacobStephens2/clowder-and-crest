# Clowder & Crest: Cloud Save Sync Implementation Plan

As requested, here is the concrete implementation plan for adding account-based cloud save sync to Clowder & Crest. This plan adheres to the "Platform & infrastructure engineer" career framing, leaning into self-hosted, reusable infrastructure patterns, and strictly avoids the data-loss pitfalls experienced in Chart35.

## 1. Recommended Architecture & Open Decisions

### Backend: Option A — Dedicated `clowder-sync` Service
I recommend a **dedicated, isolated `clowder-sync` service** (FastAPI+uvicorn) that copies the proven authentication skeleton from Quadrille but implements its own storage logic. 
* **Reasoning:** Quadrille and Clowder use fundamentally incompatible sync models (row-level LWW vs. per-slot whole-blob). Forcing them into a multi-tenant monolith complicates the codebase, couples unrelated apps, and increases the blast radius of any bugs. A dedicated service cleanly isolates the blast radius while proving out a "reusable copy-deployed account+sync skeleton" (perfect for an ADR in `infrastructure-patterns`). It remains lean and self-hosted, aligning with the platform engineer positioning without gold-plating.

### Email Verification: Option A — Sync on Signup, Verify for Reset
I recommend **allowing immediate sync on signup, and gating only password resets behind email verification**.
* **Reasoning:** Clowder is a game, not a B2B SaaS. Forcing players to leave the app, check their email, and return introduces immense friction and drop-off just when they want to secure their progress. Immediate sync secures their data instantly. If they provide a burner email, the only consequence is the inability to recover their account later—an acceptable tradeoff for a consumer game.

---

## 2. Server Plan

**Framework:** FastAPI + uvicorn + psycopg2 (idempotent schema).
**Port:** `3476` (Distinct from Quadrille's 3475).

**Auth Skeleton (Reused from Quadrille):**
* `auth.py`: Email+password, bcrypt hashing.
* **Token Strategy:** Dual-mode. 
  * Web (`clowderandcrest.com`, `clowder.stephens.page`): `__Host-` scoped `httpOnly` cookies to prevent token exfiltration.
  * Mobile (Capacitor `capacitor://localhost`): `Bearer` tokens in the `Authorization` header, since `__Host-` cookies cannot be set on `localhost` or custom schemes.
* **CORS:** Must be explicitly configured to allow `https://localhost` and `capacitor://localhost` with `allow_credentials=True` for the Capacitor webview.

**Sync Model (Per-Slot Whole-Blob):**
* Database Table: `saves (user_id UUID, slot_id INT, save_data JSONB, updated_at TIMESTAMP, version INT, PRIMARY KEY (user_id, slot_id))`.
* **Endpoints:**
  * `GET /api/saves` — Returns metadata for all slots (versions, timestamps, preview data like day/chapter) to drive the load screen.
  * `GET /api/saves/{slot_id}` — Returns the full JSON blob.
  * `PUT /api/saves/{slot_id}` — Receives a JSON blob. Requires `expected_version` for concurrency control.

**Conflict & Divergence Model:**
* **Optimistic Concurrency:** Every save blob has an integer `version` (or timestamp). When the client pushes, it includes the `version` it is basing the push on.
* If the server's `version` is > the client's `expected_version`, the server returns `409 Conflict`. It **never** blindly accepts the write.

---

## 3. Client Plan (Clowder)

**New Facade:** `src/systems/CloudSync.ts`
* Mirrors the `NativeFeatures.ts` facade pattern.
* Handles API communication, token management, and syncing logic.
* **Token Storage:** Web relies on the `httpOnly` cookie. Capacitor uses `@capacitor/preferences` to store the `Bearer` token securely.

**UI Integrations:**
* **Auth Menu:** Add "Cloud Account" to the main menu (Login, Signup, Logout, Sync Status).
* **Save Slots UI:** Update `TitleScene.ts` and `Panels.ts` to show cloud status icons next to local slots (e.g., "Cloud: Out of sync", "Cloud: Up to date").

**Sync Hooks & Triggers:**
* **Title Load Pull:** Fetch save metadata on boot. Identify divergence before the player selects a slot.
* **Day-End Push:** Automatically debounce and push the active slot to the cloud at the end of each in-game day, *only if* the client is currently in-sync with the server.
* **Manual Trigger:** Explicit "Force Upload" and "Force Download" buttons in the save management panel.

**Divergence Chooser (The Chart35 Fix):**
* If divergence is detected (e.g., local has Day 15, cloud has Day 20, or a `409 Conflict` occurs on push):
  * **Halt auto-sync.**
  * Display a modal: *"Conflict detected in Slot 1. Cloud save (Day 20) differs from Local save (Day 15)."*
  * Options: `[Download Cloud Save (Overwrite Local)]`, `[Upload Local Save (Overwrite Cloud)]`, `[Cancel]`.
  * **Critical Safety:** Before executing either overwrite, the current local save is copied to `clowder_save_slot_<n>.bak.<timestamp>`.

---

## 4. Infrastructure & Deployment Steps

1. **Database:**
   * `CREATE DATABASE clowder_sync;` in the existing PostgreSQL 16 instance.
2. **Environment & Service:**
   * Create venv on the volume to avoid the 98% full root disk: `python -m venv /mnt/volume_nyc3_01/jacob/clowder-sync-venv`.
   * Clone/copy the auth skeleton to `/var/www/clowder-sync`.
   * Create `systemd` service `clowder-sync.service` running uvicorn on `127.0.0.1:3476`.
3. **Apache Proxy (Both VHosts):**
   * Edit `/etc/apache2/sites-available/clowderandcrest.com-le-ssl.conf` and `clowder.stephens.page-le-ssl.conf`.
   * Add: 
     ```apache
     ProxyPass /api/ http://127.0.0.1:3476/
     ProxyPassReverse /api/ http://127.0.0.1:3476/
     ```
   * Reload Apache.
4. **Resend / Email:**
   * Use the existing `stephens.page` verified domain. Emails will send from `noreply@stephens.page`.
   * Extract the API key from `/var/www/wadadliflarecatering.com/private/.env` and add to the `clowder-sync` `.env`.
5. **Observability (Optional):**
   * Expose a `/health` endpoint with DB ping.
   * Add to local Prometheus scrape config if Grafana is running.

---

## 5. Migration & Safety

* **Reuse Sanitization:** Inbound cloud data must pass through the existing `validateAndSanitizeSave(data)` in `SaveManager.ts` to prevent malicious payloads from compromised accounts.
* **Local-Only Players:** If a user never creates an account, the game must continue functioning exactly as it does today, entirely via `localStorage`, with zero nag screens disrupting the gameplay loop.
* **Never Clobber:** Auto-sync only proceeds if the client possesses the latest server `version`. Any mismatch immediately disables auto-sync for that slot and surfaces the Divergence Chooser. The `.bak` system ensures that even if the user misclicks the Divergence Chooser, data is recoverable via DevTools.

---

## 6. Atomic Commit Breakdown

To adhere to the project's strict atomic commit guidelines, the work should be merged in these distinct steps:

1. **[Backend]** Initial `clowder-sync` skeleton: FastAPI, auth router, DB pool, dual-mode tokens (Bearer + Cookie).
2. **[Backend]** Add per-slot whole-blob sync endpoints, idempotent schema, and version-based conflict detection.
3. **[Client]** Add `CloudSync.ts` facade for API communication, token storage, and divergence logic.
4. **[Client]** Wire UI: Add Account/Auth panels and update Save Slot UI to display cloud status.
5. **[Client]** Implement auto-sync hooks (Day-End push, Title boot check) and the Divergence Chooser modal.
6. **[Infra]** `infrastructure-patterns`: Add ADR detailing the reusable account+sync skeleton architecture.
7. **[Docs]** Update `CLAUDE.md`: Remove "Cloud save sync" from "What's Not Implemented Yet" and document the new `clowder-sync` backend and `.bak` recovery mechanism.

---

## 7. Open Risks / Verify Before Building

* **Capacitor CORS on iOS:** `capacitor://localhost` on iOS can be notoriously finicky with CORS and cookies. Thoroughly test that the Python backend correctly accepts the Origin and processes the Bearer token before finalizing the auth flow.
* **Blob Size Limits:** Ensure the PostgreSQL `JSONB` column and the FastAPI request body size limits comfortably accommodate late-game `SaveData` blobs (which include extensive `dungeonHistory` and `journal` entries).
* **Vite Proxy:** For local development, update `vite.config.ts` to proxy `/api` to `localhost:3476` so the frontend dev server bypasses CORS during testing.

*(Gemini 3.1 Pro)*
