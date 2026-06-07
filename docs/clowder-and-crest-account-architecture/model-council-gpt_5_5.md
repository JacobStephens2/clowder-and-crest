# Clowder & Crest Account-Based Cloud Save Sync Plan

**Author:** GPT-5.5  
**Scope:** implementation plan only; no code changes.

## 0. Executive recommendation

Build a **dedicated `clowder-sync` FastAPI service** that copies/adapts Quadrille's account/auth/session infrastructure, but replaces Quadrille's row-level sync engine with a **per-slot whole-blob save service**. Clowder's source already stores one monolithic `SaveData` JSON object, writes it to the legacy key `clowder_and_crest_save`, mirrors it into `clowder_save_slot_<n>` for three slots, stamps `lastPlayedTimestamp`, and has a forward migration ladder plus `validateAndSanitizeSave()` for untrusted inbound saves ([Clowder `SaveManager.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/SaveManager.ts)). That model should not be forced into Quadrille's row-level LWW/tombstone machinery; the correct boundary is one cloud object per user per slot.

Decision 1: choose **A — a new isolated `clowder-sync` backend reusing Quadrille auth patterns**. This has the smallest blast radius, lets Quadrille keep its row-structured semantics, and keeps Clowder's hobby-game backend operationally legible. Extending Quadrille into a multi-tenant app backend would couple two unrelated products and require turning a row merge system into both row merge and whole-blob conflict detection. A managed BaaS such as Firebase/Supabase/Clerk is also overkill here: it adds vendor-specific auth/session/storage semantics for a tiny three-slot JSON sync problem, while the VPS already has PostgreSQL, Apache reverse proxying, FastAPI/uvicorn precedent, and platform patterns that favor simple self-hosted services. This also best supports the career frame: extract a reusable "account + session + blob-sync skeleton" later as a small ADR in `infrastructure-patterns`, but do not gold-plate Clowder into a platform project on day one. The existing infrastructure-patterns repository explicitly frames ADRs as reusable reasoning from production systems, and its deploy/observability ADRs emphasize auditable single-server deploys and loopback-bound service surfaces ([infrastructure-patterns README](https://github.com/JacobStephens2/infrastructure-patterns), [ADR 0004](https://github.com/JacobStephens2/infrastructure-patterns/blob/main/adr/0004-shell-deploy-over-hosted-ci-runner.md), [ADR 0011](https://github.com/JacobStephens2/infrastructure-patterns/blob/main/adr/0011-instrumented-metrics-stack-over-bespoke-prober.md)).

Decision 2: choose **A — allow sync immediately after signup; verification gates password reset and account recovery**, with a soft "verify your email" reminder. Quadrille's stricter verification gate makes sense for a sensitive/polished app, but Clowder's immediate user problem is save survivability, especially Android reinstall/update anxiety. If a player signs up, uploads a save, and then misses the verification email, blocking sync would preserve the very failure mode cloud sync is meant to solve. The trade-off is modest account-abuse risk, so mitigate with Quadrille's rate limiting, per-account save-size caps, resend throttles, and a cleanup job that purges unverified accounts with no verified login and no activity after a retention window. If abuse or deliverability becomes a problem, make `REQUIRE_VERIFIED_FOR_SYNC=true` a server config switch rather than a schema rewrite.

## 1. Source findings that drive the design

| Finding | Design consequence |
|---|---|
| `SaveData` is a single JSON blob with `version`, game progress, cats, rooms, flags, journal, `lastPlayedTimestamp`, and optional fields filled by `migrateSaveData()` ([Clowder `SaveManager.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/SaveManager.ts)). | Sync the whole save per slot; do not attempt row merges. |
| Clowder has three slots under `clowder_save_slot_<n>` plus a legacy/default key used for compatibility ([Clowder `SaveManager.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/SaveManager.ts)). | Cloud table primary key should be `(user_id, slot)` with `slot` constrained to 1-3. |
| Deleting a slot already creates a timestamped `.bak.<ts>` local backup and prunes old backups after 48 hours ([Clowder `SaveManager.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/SaveManager.ts)). | Reuse the same safety posture, but add a dedicated backup-before-cloud-overwrite path with longer retention. |
| The title screen migrates the old default save into slot 1, renders slot summaries, and loads a slot by copying it back to the default save key before starting the game ([Clowder `TitleScene.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/scenes/TitleScene.ts)). | Cloud sync should integrate at title-slot summary time and on slot load, not as a hidden global replacement for localStorage. |
| `SessionFlow.saveGame()` writes both the default key and the active slot ([Clowder `SessionFlow.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/SessionFlow.ts)). | CloudSync should hook after this local write, never before it. |
| The menu already contains manual Save, Export Save, Import Save, Quit, Restart, and Delete actions ([Clowder `Panels.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/ui/Panels.ts)). | Add Account/Cloud Save controls here without redesigning the game shell. |
| The native facade deliberately hides Capacitor platform differences behind a `NativeFeatures.ts` module ([Clowder `NativeFeatures.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/NativeFeatures.ts)). | Add `CloudSync.ts` as the same style of facade: safe on web/native/offline, no scene-specific auth details. |
| Chart35Client's revised sync flow does a non-destructive diff, only auto-downloads when no local data would be lost, and returns `conflict` rather than overwriting divergent local state ([Chart35Client `sync-service.ts`](https://github.com/JacobStephens2/Chart35Client/blob/main/src/services/sync-service.ts)). | Clowder must use explicit conflict decisions and must never do silent LWW after logout/session expiry. |
| Chart35Client shows a signed-out banner when a previously logged-in session is gone and offers a local backup before re-syncing ([Chart35Client `auth-banner.ts`](https://github.com/JacobStephens2/Chart35Client/blob/main/src/components/auth-banner.ts)). | Clowder should surface "not syncing" state clearly and offer export/backup before reconciliation. |
| The service worker caches same-origin GETs cache-first unless handled as navigation ([Clowder `public/sw.js`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/public/sw.js)). | Add an explicit `/api/` bypass so GET `/api/saves/*` is never cached as a static asset. |

## 2. Server plan

### 2.1 Backend structure

Create a new server directory under the Clowder project, e.g. `/var/www/clowder.stephens.page/server/`, with a small FastAPI app:

```text
server/
  clowder_sync_app.py      # FastAPI app, routes, middleware
  auth.py                  # adapted from Quadrille; branding/config changed
  db.py                    # adapted psycopg2 pool + idempotent schema bootstrap
  security.py              # adapted password hashing, tokens, rate limits, origin checks
  mailer.py                # adapted Resend mailer; Clowder templates
  sync_slots.py            # new per-slot whole-blob sync logic
  settings.py              # env config parser
  requirements.txt
  README.md
```

Reuse from Quadrille: email+password registration/login/logout, opaque server sessions, httpOnly `__Host-` cookie for browser sessions, Bearer-token session support for mobile/native, email verification, password reset, rate limiting, and CSRF origin checks. Change branding, email subjects, allowed origins, cookie name, token audience, DB names, and email templates. Do **not** reuse `sync_user.py` except as a negative reference: its row-level LWW merge with tombstones does not match Clowder's monolithic save model.

### 2.2 Auth/session model

For web on `https://clowderandcrest.com` and `https://clowder.stephens.page`, use a host-scoped cookie such as `__Host-clowder_session` with `Secure`, `HttpOnly`, `Path=/`, and no `Domain`. MDN documents that `__Host-` cookies require `Secure`, `Path=/`, and no `Domain`, which is exactly the right property for two independent vhosts sharing one backend path but not one browser cookie namespace ([MDN secure cookie guide](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)). For same-origin browser calls, client code should use `fetch('/api/...', { credentials: 'same-origin' })`; MDN notes that credentialed requests are required for browsers to respect `Set-Cookie` in CORS/fetch contexts ([MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)).

For Capacitor, use Bearer tokens rather than relying on cookies. Capacitor apps run inside native WebViews with platform-specific local origins; Capacitor docs describe `capacitor://localhost` on iOS and `http://localhost` on Android in default configurations, while the task context says Clowder may see `https://localhost` on Android, so this must be verified against the built APK before finalizing the allowlist ([Capacitor autofill credentials guide](https://capacitorjs.com/docs/guides/autofill-credentials)). Return `accessToken` from login/register responses only to native callers, store it in a `CloudSync` token store backed by Capacitor Preferences if added, and fall back to localStorage only inside `Capacitor.isNativePlatform()` paths. Do not store bearer tokens in web localStorage.

### 2.3 CORS and CSRF

Add FastAPI `CORSMiddleware` with an explicit origin allowlist, not wildcard, because FastAPI's docs warn that wildcard origins exclude credentialed communication such as cookies and Authorization headers ([FastAPI CORS docs](https://fastapi.tiangolo.com/tutorial/cors/)). Recommended initial allowlist:

```text
https://clowderandcrest.com
https://clowder.stephens.page
http://localhost:3200           # Vite dev
http://localhost                 # Capacitor Android default candidate
https://localhost                # task-context Android candidate
capacitor://localhost            # Capacitor iOS default candidate
```

Keep Quadrille-style CSRF origin checks for cookie-authenticated mutating requests. For Bearer-token native calls, origin checks are still useful for telemetry but should not be the only authorization control; the bearer session token is the credential.

### 2.4 Database schema

Use the existing PostgreSQL 16 cluster and create a separate DB/user, e.g. database `clowder_sync` and role `clowder_sync_app`. Keep the schema bootstrap idempotent in `db.py`, mirroring Quadrille's pattern.

Core tables:

```sql
-- Reuse/adapt Quadrille-style tables:
users(
  id uuid primary key,
  email citext unique not null,
  password_hash text not null,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz
);

sessions(
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text unique not null,
  kind text not null check (kind in ('web','bearer')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip_hash text
);

email_verification_tokens(...);
password_reset_tokens(...);
rate_limit_events(...);
```

New Clowder sync tables:

```sql
clowder_save_slots(
  user_id uuid not null references users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  save_json jsonb not null,
  save_hash text not null,
  save_version integer,
  player_name text,
  day integer,
  chapter integer,
  cats_count integer,
  last_played_ms bigint,
  client_device_id text,
  server_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, slot)
);

clowder_save_slot_versions(
  id bigserial primary key,
  user_id uuid not null,
  slot smallint not null,
  save_json jsonb not null,
  save_hash text not null,
  replaced_at timestamptz not null default now(),
  replaced_by_session uuid,
  reason text not null check (reason in ('overwrite','download-replaced','delete-cloud','admin'))
);
```

Store summaries as normal columns computed in application code rather than generated columns. PostgreSQL supports generated columns, but they are computed from expressions under restrictions and are unnecessary here for four small summary fields ([PostgreSQL generated columns docs](https://www.postgresql.org/docs/current/ddl-generated-columns.html)). Use `jsonb` for the authoritative save blob; PostgreSQL documents `jsonb` as its binary JSON storage type with operators available when later needed, but the service should initially treat the save as an opaque validated blob ([PostgreSQL JSON types docs](https://www.postgresql.org/docs/current/datatype-json.html)).

### 2.5 Save endpoint contract

Use optimistic concurrency with hashes. This is the central safety guard that prevents Chart35-style silent clobbering.

Routes:

```http
GET  /api/health
GET  /api/auth/me
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/verify-email
POST /api/auth/resend-verification
POST /api/auth/forgot-password
POST /api/auth/reset-password

GET    /api/saves/slots
GET    /api/saves/slots/{slot}
PUT    /api/saves/slots/{slot}
DELETE /api/saves/slots/{slot}     # manual cloud-delete only; never autosync local delete silently
POST   /api/saves/slots/{slot}/compare  # optional convenience: server computes hash/summary for posted local save
```

`GET /api/saves/slots` returns summaries only:

```json
{
  "slots": [
    {
      "slot": 1,
      "exists": true,
      "hash": "sha256:...",
      "serverUpdatedAt": "2026-...Z",
      "summary": { "name": "Mallow", "day": 14, "chapter": 3, "cats": 4, "lastPlayedTimestamp": 1770000000000, "version": 2 }
    }
  ]
}
```

`GET /api/saves/slots/{slot}` returns the full save and its hash. The server must impose a max response/body size such as 1 MiB, because Clowder saves are small and a larger blob likely indicates a bug or abuse.

`PUT /api/saves/slots/{slot}` body:

```json
{
  "save": { "version": 2, "day": 14, "chapter": 3, "cats": [] },
  "baseHash": "sha256:previous-cloud-hash-or-null",
  "force": false,
  "deviceId": "random-install-id",
  "reason": "day-end|manual-upload|initial-upload|conflict-resolution"
}
```

Server behavior:

1. Authenticate user.
2. Validate slot is 1-3.
3. Validate JSON object shape minimally server-side: required `day`, `chapter`, `cats`, sane array lengths, max string lengths, `version` numeric, and `lastPlayedTimestamp` numeric if present. Client still runs `validateAndSanitizeSave()` for richer migration/sanitization.
4. Canonicalize JSON and compute `save_hash = sha256(canonical_json)`. Use one canonicalization implementation server-side, and let the client treat the server-returned hash as authoritative.
5. If no cloud row exists, insert regardless of `baseHash` if `force=false`; return new hash.
6. If row exists and `save_hash` equals existing hash, return 200 idempotently.
7. If row exists and `baseHash` equals existing hash, archive old row into `clowder_save_slot_versions`, update row, and return new hash.
8. If row exists and `baseHash` is missing/different and `force=false`, return `409 Conflict` with remote summary, remote hash, and optionally the remote save if payload size is acceptable.
9. If `force=true`, require an explicit `confirmOverwrite` marker in the request, archive old row, and update.

Do not implement automatic LWW. `lastPlayedTimestamp` is useful for user-facing labels and heuristics, but the write gate must be hash-based because two devices can both have plausible "newer" local states.

### 2.6 Server validation stance

Server validation is about abuse containment and gross shape checking; client validation is about game compatibility. The client already has `validateAndSanitizeSave()` for imported/untrusted saves, including structural checks, string clamping, cat limits, and migration ([Clowder `SaveManager.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/SaveManager.ts)). Reuse that on inbound cloud downloads before writing to localStorage. On upload, the save was locally produced, but still pass through summary extraction and size limits server-side.

## 3. Client plan

### 3.1 New `src/systems/CloudSync.ts` facade

Add a single facade module, mirroring `NativeFeatures.ts`'s "safe to call anywhere" design ([Clowder `NativeFeatures.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/NativeFeatures.ts)). Proposed API:

```ts
export interface CloudAuthState {
  status: 'unknown' | 'signed-out' | 'signed-in' | 'offline';
  email?: string;
  emailVerified?: boolean;
  lastError?: string;
}

export interface CloudSlotSummary {
  slot: 1 | 2 | 3;
  exists: boolean;
  hash?: string;
  serverUpdatedAt?: string;
  summary?: { name: string; day: number; chapter: number; cats: number; lastPlayedTimestamp?: number; version?: number };
}

export interface SlotSyncStatus {
  slot: 1 | 2 | 3;
  state: 'no-account' | 'offline' | 'in-sync' | 'local-only' | 'cloud-only' | 'local-newer' | 'cloud-newer' | 'diverged' | 'error';
  localHash?: string;
  cloudHash?: string;
  baseHash?: string;
}
```

Functions:

```ts
initCloudSync(): Promise<void>
getAuthState(): CloudAuthState
register(email, password): Promise<void>
login(email, password): Promise<void>
logout(): Promise<void>
fetchCloudSlots(): Promise<CloudSlotSummary[]>
compareSlot(slot): Promise<SlotSyncStatus>
pullSlot(slot, opts: { requireNoLocalLoss?: boolean; force?: boolean }): Promise<SaveData>
pushSlot(slot, save, opts: { force?: boolean; reason: string }): Promise<void>
safeAutoSyncSlot(slot, phase: 'title-load' | 'day-end' | 'manual'): Promise<...>
markConflict(slot, details): void
getLastSyncedHash(slot): string | null
setLastSyncedHash(slot, hash): void
```

Local metadata keys:

```text
clowder_cloud_account_id
clowder_cloud_email
clowder_cloud_token_native          # native only
clowder_cloud_device_id             # random UUID per install
clowder_cloud_slot_1_hash
clowder_cloud_slot_1_server_updated_at
clowder_cloud_slot_1_conflict
```

### 3.2 Auth UI

Add an **Account / Cloud Save** section to `showMenuPanel()` in `src/ui/Panels.ts`, near Save/Export/Import. The current menu already centralizes save/export/import/restart/delete controls, so this is the lowest-friction location ([Clowder `Panels.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/ui/Panels.ts)). UI states:

- Signed out: "Cloud saves: Off" + "Sign in" + "Create account".
- Signed in but unverified: "Signed in as X — verify your email for account recovery" + "Resend verification".
- Signed in and verified: "Cloud saves: On" + last sync time + "Compare saves" + "Upload this slot" + "Download cloud slot" + "Sign out".
- Session expired: persistent banner/toast: "You're signed out; changes are local only" + "Export backup" + "Sign in".

Keep auth forms as simple overlays styled like existing menus. Do not add routes or a new SPA framework.

### 3.3 Slot UI on title screen

Extend `TitleScene.showSlotPicker()` to include cloud indicators after local summaries:

- `Slot 1: Mallow — Day 14, Ch.3, 4 cats`.
- Add small status text: `Cloud: in sync`, `Cloud: newer copy available`, `Cloud: local changes not uploaded`, `Cloud: conflict — choose`, or `Cloud: sign in to back up`.
- If local empty and cloud exists, show `Download cloud save` under that slot.
- If local exists and cloud empty, show `Upload to cloud` but do not auto-upload unless the player is signed in and this is the first sync for that account/device.
- If both exist and hashes diverge, show a chooser before loading the slot.

Title screen is the right place for pull checks because it already loads slot summaries, migrates legacy save into slot 1, and starts selected slots via `loadFromSlot()` ([Clowder `TitleScene.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/scenes/TitleScene.ts)).

### 3.4 Sync hooks

Recommended hooks:

1. **App boot / title create:** call `CloudSync.initCloudSync()` and `fetchCloudSlots()` if signed in. This should be non-blocking; show stale/local slot UI if offline.
2. **Slot load:** before `eventBus.emit('game-loaded')`, run `compareSlot(slot)`. If remote is a safe fast-forward and local has no changes since `baseHash`, download with backup. If local is newer and remote unchanged since `baseHash`, optionally push after load. If diverged, block with chooser.
3. **Day end:** after local `saveGame(gameState)` and `writeAutoSnapshot()`, schedule a debounced push for the active slot. The main file already writes local state on day-end and separately writes a native auto-snapshot for Android update recovery ([Clowder `main.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/main.ts), [Clowder `NativeFeatures.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/NativeFeatures.ts)).
4. **Manual Save:** after local save, offer or run a debounced push if signed in.
5. **Visibility/background:** do not start network writes from `beforeunload`; browsers may cancel them. Continue local save only. Native `onPause` can enqueue a pending sync flag, not block app pause.
6. **Online event:** if signed in and `clowder_cloud_pending_upload` is set, try push; on 409, clear pending and mark conflict.

### 3.5 Divergence chooser

When local and cloud both changed from the last common hash, show a modal:

```text
Cloud save conflict — Slot 1

This device:  Mallow — Day 16, Chapter 3, 4 cats, played today 8:42 PM
Cloud copy:   Mallow — Day 14, Chapter 3, 4 cats, synced yesterday 10:11 PM

Choose what to keep. We will make a local backup before replacing anything.

[Keep this device and upload]
[Use cloud copy on this device]
[Export local backup]
[Cancel — keep playing local only]
```

Rules:

- Default/primary button should be **Keep this device and upload** when local has unique changes, matching Chart35Client's learned bias toward protecting local data ([Chart35Client `sync-dialogs.ts`](https://github.com/JacobStephens2/Chart35Client/blob/main/src/components/sync-dialogs.ts)).
- `Use cloud copy` must create a local backup first, then run `validateAndSanitizeSave()` on the downloaded save, then write `clowder_save_slot_<n>` and the legacy key if active.
- `Keep this device and upload` sends `force=true` only after explicit user choice and archives the old cloud row server-side.
- `Cancel` leaves the account signed in but marks that slot `conflict`; no auto push/pull until resolved.
- Manual Upload/Download buttons must always remain available in the menu for recovery and support.

### 3.6 Backup-before-overwrite client implementation

Add a `backupSlotBeforeCloudOverwrite(slot, reason)` helper in `SaveManager.ts`, separate from `deleteSlot()`, because cloud download should not delete first. Suggested key pattern:

```text
clowder_save_slot_1.cloudbak.download.1770000000000
clowder_save_slot_1.cloudbak.import.1770000000000
```

Extend `getRecentBackup()` to include cloud backups or add `getRecentCloudBackups(slot)`. Keep existing 48-hour delete-overwrite backups, but retain cloud overwrite backups for 7-30 days because they are specifically data-loss protection.

## 4. Infrastructure plan

1. **Preflight disk and directories.** Because root disk is nearly full, create the virtualenv on the mounted volume: `/mnt/volume_nyc3_01/jacob/clowder-sync-venv`. Keep only source/config under `/var/www/clowder.stephens.page/server` and avoid pip caches on root.
2. **Create DB and role.** Create `clowder_sync` database and `clowder_sync_app` role in the local PostgreSQL 16 cluster at `localhost:5432`; grant least privileges only on the Clowder DB/schema.
3. **Add private env file.** Use `/var/www/clowder.stephens.page/private/clowder-sync.env` mode `600`, containing DB URL, session secret, token pepper, Resend API key path/value, app base URLs, and CORS origins. Use `noreply@stephens.page` until `clowderandcrest.com` is verified for Resend.
4. **Build venv on volume.** Install `fastapi`, `uvicorn[standard]`, `psycopg2-binary` or compiled `psycopg2`, `pydantic`, `passlib[argon2]` or equivalent Quadrille dependency set, `python-multipart` only if needed, and `resend`/HTTP client.
5. **Pick port.** Use `127.0.0.1:3486` for `clowder-sync`; Quadrille uses 3475, so keep a clear gap and document it.
6. **Systemd service.** Create `clowder-sync.service` running uvicorn on loopback only: `--host 127.0.0.1 --port 3486`. Set `WorkingDirectory=/var/www/clowder.stephens.page/server`, `EnvironmentFile=...`, restart on failure, and logs to journald.
7. **Apache proxy on both vhosts.** Add `ProxyPass /api/ http://127.0.0.1:3486/` and matching `ProxyPassReverse` to both `clowderandcrest.com` and `clowder.stephens.page` SSL vhosts. Put proxy rules before `FallbackResource /index.html`, because otherwise SPA fallback can swallow API paths. The Clowder docs state both vhosts point at the same `dist/` directory and use SSL with SPA fallback ([Clowder `CLAUDE.md`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/CLAUDE.md)).
8. **TLS/certbot.** Existing certs should continue to cover both hosts; no new public backend hostname is needed because `/api/` is same-origin behind Apache.
9. **CORS verification.** Test browser same-origin cookie auth on both public domains; test Vite dev from `http://localhost:3200`; test Android/iOS WebView actual `Origin` header and update allowlist accordingly.
10. **Service worker bypass.** Modify `public/sw.js` so `if (url.pathname.startsWith('/api/')) return;` before cache handling. The current worker caches same-origin GETs cache-first after navigation handling, so this explicit bypass prevents stale cloud summaries ([Clowder `public/sw.js`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/public/sw.js)).
11. **Optional Prometheus/blackbox.** Add `/api/health` to blackbox checks for both public domains and optionally `/metrics` loopback only, following the existing infrastructure ADR preference for loopback-bound metrics data planes ([ADR 0011](https://github.com/JacobStephens2/infrastructure-patterns/blob/main/adr/0011-instrumented-metrics-stack-over-bespoke-prober.md)).
12. **Deploy.** Run `npm run check`, `npm run build`, backend unit tests, start service, `apachectl configtest`, reload Apache, then smoke-test auth and slot sync on both domains. Clowder's documented build sends output directly to `dist/`, which Apache serves live ([Clowder `CLAUDE.md`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/CLAUDE.md)).

## 5. Migration and safety plan

Existing players remain local-only until they opt in. On first sign-in, do not automatically pull a cloud copy over local data. Instead, compare local slot hashes with cloud summaries. If cloud has no data, upload each non-empty local slot after showing "Back up these saves to your account?" If cloud has data and local is empty, show a non-destructive "Cloud saves found" download option. If both exist, run the same divergence logic.

Never treat logout or session expiry as permission to download or overwrite. Chart35Client's revised startup sync only downloads when no local data would be lost and returns a conflict otherwise ([Chart35Client `sync-service.ts`](https://github.com/JacobStephens2/Chart35Client/blob/main/src/services/sync-service.ts)). Clowder should copy that policy but adapt the diff unit from "observation date" to "slot hash." A signed-out/expired state should be visible: "Cloud saves paused; changes are saved on this device only." Add an Export Backup button near that warning, mirroring Chart35Client's banner pattern ([Chart35Client `auth-banner.ts`](https://github.com/JacobStephens2/Chart35Client/blob/main/src/components/auth-banner.ts)).

For inbound cloud saves, run `validateAndSanitizeSave(JSON.parse(...))`, then write a local backup, then write the slot. The Clowder sanitizer already clamps text fields, validates critical fields, caps arrays, and migrates the save to the current version ([Clowder `SaveManager.ts`](https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/systems/SaveManager.ts)). If validation fails, refuse to import the cloud save and show "Cloud save is invalid; local save was not changed," then leave the cloud row untouched for manual support.

For server overwrites, keep the previous cloud blob in `clowder_save_slot_versions` before every forced/manual update. For client overwrites, keep local `.cloudbak` backups before every cloud download or account-data replacement. This makes both directions recoverable: an accidental upload can be restored server-side, and an accidental download can be restored on the device.

## 6. Atomic commit breakdown

1. **Backend skeleton and config**  
   Add `server/` FastAPI skeleton, settings loader, health endpoint, requirements, and README. No auth or sync behavior yet.

2. **Postgres bootstrap**  
   Add `db.py` pool and idempotent schema creation for users/sessions/tokens/save slots/save versions. Include migration smoke test.

3. **Auth port from Quadrille**  
   Add adapted `auth.py`, `security.py`, `mailer.py` with Clowder branding, cookie name, session rules, rate limits, and email templates.

4. **Per-slot blob sync API**  
   Add `sync_slots.py` and routes for list/get/put/delete with hash concurrency and 409 conflict responses. Include unit tests for insert, idempotent PUT, stale baseHash conflict, force overwrite archive, and invalid slot.

5. **Service worker API bypass**  
   Add `/api/` bypass to `public/sw.js` with a minimal test/manual note. This is independent and reversible.

6. **Client CloudSync facade**  
   Add `src/systems/CloudSync.ts` for auth state, token storage, fetch wrapper, cloud summaries, hash metadata, and offline/pending flags. No UI wiring yet.

7. **Account UI in menu**  
   Add sign-in/register/logout/resend verification and cloud status to `Panels.ts`, using existing overlay style.

8. **Manual cloud upload/download/compare**  
   Add menu buttons for Compare, Upload this slot, Download cloud slot, plus divergence chooser and backup-before-overwrite helper.

9. **Title slot cloud summaries**  
   Extend `TitleScene` slot picker with cloud labels and cloud-only download buttons.

10. **Safe auto-sync hooks**  
   Add non-blocking title-load comparison, day-end debounced push, online pending flush, and session-expired warning. Ensure 409 only marks conflict and never overwrites.

11. **Infrastructure files/docs**  
   Add example systemd unit, Apache snippets for both vhosts, env template, deployment checklist, and optional Prometheus target docs.

12. **CLAUDE.md update**  
   Move "Cloud save sync" out of "What's Not Implemented Yet" only after production deploy. Add a new architecture subsection describing account backend, sync safety rules, manual recovery, and commands.

13. **Optional infrastructure-patterns ADR**  
   Add a concise ADR such as "Reusable copy-deployed account + blob-sync skeleton over multi-tenant platform" after the implementation has stabilized. Keep it sanitized and focused on the decision, matching the repository's ADR style ([infrastructure-patterns README](https://github.com/JacobStephens2/infrastructure-patterns)).

## 7. Open risks / things to verify

- **Actual Capacitor Origin.** Verify Android and iOS request `Origin` headers in production builds; Capacitor defaults vary by platform/config, and the task context differs from older docs on Android origin scheme ([Capacitor autofill credentials guide](https://capacitorjs.com/docs/guides/autofill-credentials)).
- **Quadrille source parity.** Before coding, read the actual `/var/www/quadrille.app/server/*.py` files on the VPS and diff against this plan; this workspace did not expose `/var/www`, so the plan relies on the provided Quadrille description plus accessible Clowder/Chart35/infrastructure repositories.
- **Cookie behavior across two domains.** `__Host-` cookies are intentionally host-scoped, so a player signed in at `clowderandcrest.com` will not automatically be signed in at `clowder.stephens.page`; that is safer but should be documented.
- **Save hash stability.** Decide whether `lastPlayedTimestamp` belongs in the conflict hash. Recommendation: include it in the authoritative hash because it is part of the saved state, but display conflicts in terms of day/chapter/cats/timestamps rather than hash details.
- **Server save validation depth.** Minimal server validation is enough for storage safety, but a malformed save could still be stored if the client is bypassed. Consider sharing a JSON schema generated from `SaveData` later if support issues appear.
- **Email sender/domain.** `noreply@stephens.page` is usable now; using `noreply@clowderandcrest.com` requires domain verification first.
- **Service worker caches.** Confirm `/api/` bypass ships before enabling cloud UI, or stale GET `/api/saves/slots` responses can confuse conflict state.
- **Root disk pressure.** Do not create venvs, build caches, or large logs on root; use the mounted volume and journald/logrotate limits.
- **Delete semantics.** Avoid automatic cloud deletion when a local slot is deleted. Make "delete cloud copy" a separate manual destructive action with server archive.
- **Testing matrix.** Test same account across primary web domain, secondary web domain, Vite dev, Android WebView, offline start, expired session, and two-device divergence.

## 8. Final implementation stance

This should be a lean, isolated, recoverable cloud-save system: accounts and sessions from the proven Quadrille pattern, but sync rewritten for Clowder's actual data model. The non-negotiable product rule is: **local data is the user's source of truth unless the user explicitly chooses otherwise**. Every automatic action must be a no-loss fast-forward; every destructive direction must create a backup first and require a visible choice.

— GPT-5.5
