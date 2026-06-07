# Clowder & Crest — Account-Based Cloud Save Sync: Implementation Plan

**Model:** Claude Opus 4.8
**Scope:** Add email+password accounts and cloud save sync to *Clowder & Crest* (Phaser 3 + TypeScript + Vite + Capacitor), served as a static `dist/` from Apache at `https://clowderandcrest.com` and `https://clowder.stephens.page`. Today: localStorage only, no accounts, no sync.

> **Note on sources.** I read the local-equivalent source via the GitHub repos (`JacobStephens2/clowder-and-crest`, `JacobStephens2/infrastructure-patterns`, `JacobStephens2/Chart35Client`), which mirror the `/var/www` working copies. The Quadrille **server** repo is private and was not directly readable; I worked from the detailed server summary in the task brief (auth model, sync model, deployment shape) plus the public `quadrille-showcase` framing. Every place I lean on a Quadrille internal I flag it as **[verify against quadrille source]** so the build step can confirm before copying.

---

## 0. What I verified in the codebase (grounding the plan)

These facts are load-bearing for the design and were confirmed by reading the actual files:

- **Save shape** (`src/systems/SaveManager.ts`): one monolithic `SaveData` JSON blob per save. Top-level keys include `version` (currently `SAVE_VERSION = 2`), `day`, `chapter`, `lastPlayedTimestamp?`, `totalPlaytimeMs?`, plus the full game state (cats, bonds, rooms, journal, flags, dungeonHistory).
- **Storage keys:** `clowder_and_crest_save` (legacy/default), `clowder_save_slot_<n>` for slots 1–3, and `clowder_save_slot_<n>.bak.<ts>` local backups (48h retention via `pruneExpiredBackups()`; `getRecentBackup`/`restoreBackup` already exist). **Backups must not sync.**
- **Sanitizer exists and is reusable:** `validateAndSanitizeSave(data: unknown): SaveData | null` — clamps string lengths, strips control chars, validates critical fields, then runs `migrateSaveData`. Currently used on Import and defensively in `loadFromSlot`. This is *exactly* the inbound-cloud-payload gate I need; no new validation logic required.
- **Migration ladder:** `migrateSaveData()` walks `version` forward, never destroys data, then stamps `SAVE_VERSION`. Inbound cloud blobs run through this for free if I route them through `validateAndSanitizeSave`.
- **Native facade convention** (`src/systems/NativeFeatures.ts`): single module, every entry point guards on `isNative()` / `Capacitor.getPlatform()` and silently no-ops on web. `CloudSync.ts` must mirror this *exactly* — one facade, platform-aware, fail-soft.
- **Hook points confirmed in `main.ts` (2764 lines):**
  - Title load → `TitleScene.ts` builds the slot picker via `getSlotSummary`/`loadFromSlot`; "Continue"/"New Game" route through `showSlotPicker('load'|'new')`. This is the **pull-on-load** seam.
  - Day-end → `guildEndDayBtn` click handler and `setOnDayEnd(() => { … saveGame(gameState) … })` (main.ts ~line 596). This is the **push-on-day-end** seam.
  - `saveGame` is wrapped through `sessionFlow.saveGame` (main.ts ~line 717) — a single chokepoint, ideal for a debounced push trigger.
  - There's already a precedent for "the user worried about losing saves on reinstall" (the `writeAutoSnapshot`/`readAutoSnapshot` + Share-sheet export work). Cloud sync is the user's *own stated* next step — the NativeFeatures comment literally quotes them: *"Perhaps the cloud save feature is worth it."*
- **Menu home** (`src/ui/Panels.ts`, `showMenuPanel()` at line 347): already renders `Export Save` / `Import Save` buttons (lines 421–422) inside a `.menu-overlay`. The account + sync UI belongs right here, adjacent to Export/Import.
- **Two vhosts, one dist** (`CLAUDE.md` Deployment section): `clowderandcrest.com.conf` and `clowder.stephens.page.conf` both point at `/var/www/clowder.stephens.page/dist` with `FallbackResource /index.html`. **Any `/api/` proxy must be added to BOTH** `-le-ssl.conf` files.
- **Commit discipline** (`CLAUDE.md`): atomic commits, explicit `git add <path>`, one logical change per commit, tests are part of the feature commit, 2–4 commits per response pushed together.

---

## 1. Recommended Architecture (both open decisions resolved)

### Decision 1 — Backend approach: **(A) Dedicated `clowder-sync` service that adapts the Quadrille auth skeleton, with its own Postgres DB and its own port.**

I evaluated all three options against blast-radius, sync-model fit, operational cost, and the career framing.

| Criterion | (A) New dedicated service, reuse auth skeleton | (B) Extend quadrille-sync into multi-tenant | (C) Managed BaaS (Supabase/Firebase/Clerk) |
|---|---|---|---|
| **Blast radius** | ✅ Isolated DB + process + port. A bug in Clowder sync can't touch Quadrille users. | ❌ Couples two unrelated apps; a Clowder deploy can take down Quadrille auth. | ✅ Isolated, but off-box. |
| **Sync-model fit** | ✅ Quadrille's row-level LWW (`sync_user.py`) **does not fit** — I throw it away and write a ~150-line per-slot blob endpoint. Auth skeleton fits as-is. | ❌ Forces a reconciliation of two different sync models in one service (row-merge *and* blob), increasing surface and risk. | ⚠️ Supabase Postgres + RLS could store blobs, but I'd still write the conflict/divergence logic myself; Firebase pushes me toward its realtime model. |
| **Operational cost** | ✅ One more systemd unit + venv on the volume + one DB. Proven pattern, ~$0 marginal. | ⚠️ Lower process count but higher coupling cost; every change is now a two-app regression test. | ❌ **Supabase free tier pauses projects after 1 week of inactivity** ([Supabase pricing](https://supabase.com/pricing), [UI Bakery](https://uibakery.io/blog/supabase-pricing)) — fatal for a casual game whose players return after days. Pro is $25/mo per project for a hobby game. Adds a vendor dependency and egress billing. |
| **Career framing** | ✅✅ Demonstrates the *"one reusable copy-deployed account+sync skeleton powering a fleet of small apps"* thesis — directly on-brand for "Platform & infrastructure engineer." Reuses platform pieces (Decision: reuse), stays LEAN self-hosted, harvests an ADR. | ⚠️ "Multi-tenant" sounds platform-y but the coupling is the *opposite* of the blast-radius isolation story the existing ADRs (0001, 0005, 0009) are built on. | ❌ Off-brand: the positioning is self-hosted platform competence, not "wired up a BaaS." |

**Chosen: (A).** It is the lean, isolated, proven-pattern choice that *also* tells the strongest platform story. The Quadrille auth module is described as "app-agnostic except branding constants" — so the reuse is: **copy `auth.py`, `db.py`, `security.py`, `mailer.py` largely intact; rebrand constants; replace the row-level `sync_user.py` with a new `sync_clowder.py` blob-sync module; add a CORS middleware (Quadrille lacks one because its native client is Flutter, not a CORS-bound WebView — Clowder's Capacitor WebView needs it).** The "platform" claim is earned not by coupling two apps into one process, but by proving the *skeleton copy-deploys* to a second app cleanly. That is the harvestable ADR (see §6).

> **Why not just extend Quadrille (B)?** The single biggest technical reason is the sync model mismatch. Quadrille syncs **row-level last-write-wins keyed by (table, id) with tombstones** — perfect for a weightlifting log of independent records. Clowder's save is a **single opaque blob**; there are no independently-mergeable rows, and a per-row merge of a serialized game state is meaningless (you can't merge "day 14, chapter 3" with "day 9, chapter 2" field-by-field without producing a corrupt hybrid save). So (B) buys coupling cost for zero sync-code reuse. The *auth* is reusable; the *sync* is not. Isolating them is the correct seam.

### Decision 2 — Email-verification gate: **(A) Sync immediately on sign-up; verification only gates password reset (and is nudged, not required).**

Quadrille **requires** a verified email before sync. For a fertility-charting app (Chart35) or a serious training log (Quadrille), that friction is justified — the data is sensitive and the account is the product. For a casual cat game it is the wrong trade:

- The whole point of cloud sync here is **recovery convenience** — the user's own quote was about not losing saves on reinstall. Blocking sync behind a verification email round-trip on a phone, mid-onboarding, will cause exactly the drop-off the feature is meant to prevent.
- The data is low-sensitivity (game progress), so the cost of an unverified email is bounded.
- **The one thing verification genuinely protects is account *recovery*** — if you let someone reset a password to an unverified address, an attacker who typo-squats a sign-up email could hijack. So: **password reset is the gated action.** Until the email is verified, "Forgot password" is disabled with copy: *"Verify your email first to enable password recovery."*

**Chosen: (A) — sync works the moment you sign up; a non-blocking banner nudges verification; password reset requires verification.** This keeps the safety property that matters (no recovery to an unproven address) while removing the friction that doesn't pay for itself in a hobby game. **[verify against quadrille source]** that `auth.py`'s verification gate is a single check I can relax to "gate reset only" rather than something woven through every endpoint.

### One-paragraph architecture summary

A new self-hosted **`clowder-sync`** FastAPI/uvicorn service binds `127.0.0.1:<newport>` (Quadrille uses 3475 — I'll pick **3476** pending a free-port check), backed by its **own** Postgres 16 database `clowder_sync` owned by a scoped role on the existing cluster. It reuses Quadrille's opaque-server-side-session auth (httpOnly `__Host-` cookie on web, Bearer token for the Capacitor app), adds a **CORS middleware** allowing the Capacitor origins, and exposes a **per-slot whole-blob sync API** with **server `revision` + client `baseRevision` optimistic concurrency** and **explicit divergence detection** (never blind LWW). Apache reverse-proxies `/api/` to it on **both** vhosts. The client gets a `src/systems/CloudSync.ts` facade mirroring `NativeFeatures.ts`, account/sync UI in the menu panel next to Export/Import, a **pull on title-load**, a **debounced push on day-end**, manual **Upload/Download** buttons, and a **divergence chooser** that always backs up the local save before any overwrite — directly fixing the Chart35 data-loss class of bug.

---

## 2. Server Plan

### 2.1 Reused vs. adapted vs. new

| Module | Disposition | Notes |
|---|---|---|
| `auth.py` | **Reuse, rebrand** | Email+password, opaque server-side sessions, httpOnly `__Host-` cookie (web) + Bearer (mobile), email verification, password reset, rate limiting, CSRF origin check. Change branding constants (app name, from-address, reset/verify URLs → `clowderandcrest.com`). **Relax the verification gate** so it only blocks password reset (Decision 2). **[verify]** the gate is a single decorator/check. |
| `db.py` | **Reuse** | psycopg2 pool + idempotent schema bootstrap. Point at the new `clowder_sync` DB. Add the `save_slots` table to the bootstrap (below). |
| `security.py` | **Reuse** | Token hashing, constant-time compares, rate-limit helpers. App-agnostic. |
| `mailer.py` | **Reuse, rebrand** | Resend client. Change templates + from-address. **Sender domain decision below.** |
| `sync_user.py` | **DO NOT reuse** | Row-level LWW merge with tombstones — wrong model for a blob. Replaced by `sync_clowder.py`. |
| `sync_app.py` | **Adapt** | The FastAPI app/router assembly. Keep the structure; mount the new blob-sync router; **add CORS middleware** (new — Quadrille has none because Flutter isn't CORS-bound). |
| **`sync_clowder.py`** | **NEW (~120–180 LOC)** | The per-slot blob-sync endpoints + conflict model (below). |
| `README.md` | **Adapt** | Document the new service, port, DB, deploy steps. |

### 2.2 CORS (the must-not-forget piece)

Quadrille's native client is **Flutter** (a native HTTP client, not subject to the browser/WebView same-origin policy), so Quadrille ships **no CORS middleware**. Clowder's native client is a **Capacitor WebView**, whose page origin is `https://localhost` (Android) or `capacitor://localhost` (iOS). Those are **cross-origin** to `api.clowderandcrest.com`-style endpoints, so the service **must** add CORS:

```
allow_origins = [
  "https://clowderandcrest.com",
  "https://clowder.stephens.page",
  "https://localhost",        # Capacitor Android WebView
  "capacitor://localhost",    # Capacitor iOS WebView
  "http://localhost:3200",    # Vite dev server (dev only — gate behind env)
]
allow_credentials = True      # required for the __Host- cookie on web
allow_methods = ["GET","POST","PUT","DELETE","OPTIONS"]
allow_headers = ["Content-Type","Authorization"]
```

`allow_credentials=True` + an explicit origin list (not `*`) is mandatory for the cookie path. The native app uses **Bearer tokens**, so even if a CORS edge case bites on mobile, the Authorization-header path still works. **[verify]** whether the `__Host-` cookie's `SameSite` needs `None; Secure` for any cross-site case; for same-site web (page and API on `clowderandcrest.com`) `SameSite=Lax`/`Strict` is fine and stronger — prefer keeping API same-origin to the web app to avoid `SameSite=None`.

### 2.3 Data model (server)

One table beyond the auth tables (`users`, `sessions`, etc. from the skeleton):

```sql
CREATE TABLE IF NOT EXISTS save_slots (
  user_id        BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot           SMALLINT    NOT NULL CHECK (slot BETWEEN 1 AND 3),
  revision       BIGINT      NOT NULL DEFAULT 1,   -- server-authoritative, monotonic per (user,slot)
  blob           JSONB       NOT NULL,             -- the sanitized SaveData
  save_version    INTEGER     NOT NULL,             -- mirror of SaveData.version, for server-side audit
  last_played_ts  BIGINT,                           -- mirror of SaveData.lastPlayedTimestamp (LWW tiebreak)
  device_id       TEXT,                             -- opaque client-generated id of last writer
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);
```

Notes:
- **Per-slot rows**, not one row per user — mirrors the client's 3 slots exactly and lets slots sync independently.
- `blob` is `JSONB` so the server can cheaply read `lastPlayedTimestamp`/`version` for tiebreaks and audit without trusting the client, but the server **never interprets game logic** — it's an opaque store with a revision.
- A size guard: reject blobs over, say, **256 KB** (a real save is a few KB; this caps abuse). The client already caps journal/cats; the server enforces a hard ceiling.
- The blob is stored **after** server-side re-validation (below).

### 2.4 Endpoint design + conflict model (per-slot whole-blob, optimistic concurrency)

All under `/api/` (proxied), all require an authenticated session (cookie or Bearer):

| Method & path | Purpose | Request | Response |
|---|---|---|---|
| `GET /api/sync/slots` | List all slots' metadata for the logged-in user | — | `[{slot, revision, lastPlayedTs, saveVersion, updatedAt, summary:{name,day,chapter,cats}}]` — **metadata + a tiny summary, NOT the full blob** (cheap title-screen render). |
| `GET /api/sync/slots/{slot}` | Download one slot's full blob | — | `{revision, blob, lastPlayedTs, saveVersion}` |
| `PUT /api/sync/slots/{slot}` | Upload one slot (optimistic) | `{baseRevision, blob}` | `200 {revision}` on success; **`409 {serverRevision, serverSummary, serverLastPlayedTs}`** on conflict |
| `DELETE /api/sync/slots/{slot}` | Clear a cloud slot | — | `204` |

**Conflict model — server-authoritative revision + client `baseRevision`:**

1. The client remembers, per slot, the `revision` it last successfully pulled or pushed (its `baseRevision`), persisted locally alongside the save (e.g. `clowder_cloud_rev_<slot>` in localStorage).
2. On **push** (`PUT`), the client sends `baseRevision`. The server compares to the stored `revision`:
   - If `baseRevision === server.revision` → **fast-forward**: re-validate the blob, store it, `revision := revision + 1`, return the new revision. No conflict.
   - If `baseRevision < server.revision` → **conflict**: another device advanced the slot since this client last synced. Server returns **409** with the server's summary + `lastPlayedTimestamp`. The server does **not** overwrite. The client opens the **divergence chooser** (§3.5).
   - If `baseRevision > server.revision` → impossible under normal flow; treat as conflict and refuse (defensive).
3. On **pull** (`GET /slots/{slot}`), the client compares the cloud blob's `lastPlayedTimestamp` and revision to its local save. If the local save is **newer or divergent** (local has unsynced edits — i.e. local was modified since `baseRevision`), the client **does not silently load the cloud blob**; it opens the divergence chooser.
4. **Last-write-wins is used only as the *suggested default* inside the chooser**, never as a silent action. When both sides are presented, the one with the greater `lastPlayedTimestamp` is highlighted as "Keep this (most recently played)", but the user must confirm. This is the explicit anti-Chart35 design.

**Server-side validation on inbound blobs:** every `PUT` body is parsed and **re-validated server-side** before storage. Two layers:
- Structural/JSON parse + the 256 KB ceiling + `slot ∈ {1,2,3}` + presence of critical fields (`day`, `chapter`, `cats[]`).
- The server stores the blob verbatim (it's opaque game state) but records `save_version` and `last_played_ts` extracted from it for tiebreaks. The *authoritative* sanitization is the **client's `validateAndSanitizeSave` on download** (it's TypeScript and already battle-tested), but the server's structural gate prevents a malicious client from filling the DB with garbage. (Optionally port a minimal Python mirror of the critical-field checks; not strictly required since the client re-sanitizes on the way in.)

**Why revision *and* timestamp:** revision gives precise "did this change under me?" detection (the correctness primitive); `lastPlayedTimestamp` gives a human-meaningful "which is newer?" for the chooser's default highlight. Revision alone can't tell the user *which* save is more advanced; timestamp alone can't detect concurrent edits at equal-ish times. Using both is belt-and-suspenders, matching the codebase's existing belt-and-suspenders sanitization philosophy.

### 2.5 Branding / config edits to the copied skeleton

- App name constant → "Clowder & Crest".
- Verify/reset link base URL → `https://clowderandcrest.com/...` (the primary domain; the page reads the token from the query string and calls `/api/...`).
- Email from-address → **see §4.5 sender-domain decision**.
- Cookie name prefix stays `__Host-` (host-scoped is the desired property), cookie domain = the API host. **[verify]** the API is served same-origin to the web app so `__Host-` works (it forbids a `Domain` attribute and requires `Secure` + path `/`).
- Session TTL and rate-limit thresholds: reuse Quadrille's defaults unless they're unusually strict for a game; loosen sign-in rate limits only if they bite casual users. **[verify]** defaults.

---

## 3. Client Plan

### 3.1 New module: `src/systems/CloudSync.ts` (mirror `NativeFeatures.ts`)

Single facade, fail-soft, platform-aware. Public surface (sketch):

```ts
// Auth
export async function signUp(email, password): Promise<AuthResult>
export async function signIn(email, password): Promise<AuthResult>
export async function signOut(): Promise<void>
export function isSignedIn(): boolean
export function currentUserEmail(): string | null
export function isEmailVerified(): boolean        // gates the reset CTA, not sync
export async function requestPasswordReset(email): Promise<void>

// Sync (per-slot, whole-blob)
export async function listCloudSlots(): Promise<CloudSlotMeta[]>
export async function pullSlot(slot): Promise<{blob: SaveData; revision: number} | null>
export async function pushSlot(slot, data: SaveData): Promise<PushResult>  // PushResult = Ok{revision} | Conflict{server…}
export async function deleteCloudSlot(slot): Promise<void>

// Reconciliation helpers (no UI here — UI lives in Panels)
export function localRevision(slot): number
export function setLocalRevision(slot, rev): void
export function isLocalDivergent(slot): boolean    // local edited since baseRevision
```

Conventions copied from `NativeFeatures.ts`:
- Every network call is wrapped so a failure **never throws into game code** — it returns a typed failure and surfaces a toast, exactly like `saveGame`'s storage-full toast.
- A `cloudSyncAvailable()` guard (analogous to `isNative()`): false when offline or the service is unreachable; the rest of the game keeps working **fully offline**, mirroring Chart35Client's "client still runs fully offline and simply disables sync" property ([Chart35Client ARCHITECTURE.md](https://github.com/JacobStephens2/Chart35Client/blob/main/ARCHITECTURE.md)).
- **All inbound cloud blobs pass through `validateAndSanitizeSave` before they touch game state or localStorage** — reusing the existing untrusted-import path. A cloud blob is, by definition, untrusted (it could have been written by a tampered client).

### 3.2 Token storage — web vs. Capacitor

| Platform | Auth transport | Token storage |
|---|---|---|
| **Web** | httpOnly `__Host-` cookie set by the server; the browser sends it automatically with `credentials: 'include'`. | **Nothing stored in JS** — the cookie is httpOnly and invisible to script (XSS can't exfiltrate it). This is the security win of the cookie path and the reason to keep the web API same-origin. |
| **Capacitor (Android/iOS)** | **Bearer token** in the `Authorization` header (the WebView's cross-origin context makes the cookie path fragile). | Store the token via **`@capacitor/preferences`** (native key-value, app-private), **not** localStorage. localStorage in a WebView is less protected and can be cleared by the OS more readily. `CloudSync.ts` checks `isNative()` and picks the storage backend, exactly as `NativeFeatures` branches on platform. |

The facade hides this: callers just `signIn()` and `pushSlot()`. **[verify]** that `@capacitor/preferences` is already a dependency or add it (it's tiny and first-party).

### 3.3 UI placement (in `src/ui/Panels.ts`, `showMenuPanel()`)

The menu panel already hosts `Export Save` / `Import Save` (lines 421–422). Add a **"Cloud Save"** section directly above or below them:

- **Signed out:** `Sign in / Create account` button → opens an auth sub-panel (email, password, sign-in/sign-up toggle, "Forgot password" which is disabled-with-tooltip until verified). Reuse the existing `.menu-overlay` styling and the `esc()` escaping already used throughout Panels.
- **Signed in:** show `you@email.com` + a verification nudge banner if unverified (*"Verify your email to enable password recovery"* with a "Resend" link), plus per-slot sync controls and a `Sign out` button.
- **Per-slot controls** (3 rows, one per slot, matching the title-screen slot UI vocabulary): each row shows local summary + cloud summary + status chip (`Synced` / `Local newer` / `Cloud newer` / `Diverged` / `Cloud only` / `Local only`) and two explicit buttons: **`Upload ↑`** and **`Download ↓`**. These are the manual escape hatches; automatic sync handles the common case.

This keeps the feature discoverable next to the existing save tooling and reuses the menu's interaction patterns rather than inventing a new surface.

### 3.4 Sync hook points

1. **Title-load pull** — in `TitleScene.ts`, when building the slot picker (`showSlotPicker`/the slot summary loop): if signed in and `cloudSyncAvailable()`, call `listCloudSlots()` and reconcile each slot's metadata with local. **Crucially, do not auto-download.** Compute a per-slot status and:
   - **Cloud only** (no local) → safe to auto-pull and populate the slot (nothing to lose). Still runs through `validateAndSanitizeSave`.
   - **Local only** (no cloud) → offer/auto-do an upload (nothing to lose).
   - **In sync** (revisions match) → no action.
   - **Divergent / either-side-newer** → render the slot with a status chip and require the player to resolve via the chooser before loading. **No silent load.**
   - This is async and **must not block** the title screen render — slots render immediately from local; cloud status decorates them when the network returns (or never, if offline).
2. **Day-end push (debounced)** — hook the existing day-end chokepoint (`setOnDayEnd` / the `guildEndDayBtn` handler / `sessionFlow.saveGame`). After the local `saveGame(gameState)`, if signed in + available + the active slot is known, schedule a **debounced** `pushSlot(activeSlot, gameState)` (e.g. 5–10s debounce so rapid end-day → menu → end-day doesn't spam the server). On `409`, **do not retry blindly** — surface the divergence chooser. Day-end is the right cadence: it's the game's natural "meaningful checkpoint" beat (already used for the autosnapshot and the return-notification).
3. **Manual Upload/Download buttons** — direct `pushSlot`/`pullSlot` from the menu, each gated by the same divergence guard. Manual download always backs up local first (§3.5).
4. **Sign-in moment** — on a fresh sign-in, run the same reconciliation as title-load across all 3 slots so a returning player on a new device immediately sees their cloud saves.

### 3.5 Divergence chooser (the anti-Chart35 safety core)

This is the heart of the safety lesson. **The Chart35 bug was: sync silently overwrote local data on load after a silent logout, and a user lost weeks of data.** The fixes, all mandatory:

1. **Never overwrite a divergent or newer local save silently.** Any reconciliation that would replace local data with cloud data (or vice-versa) on a divergent slot routes through the chooser.
2. **Always back up local before any overwrite.** Reuse the existing backup machinery: write `clowder_save_slot_<n>.bak.<ts>` (the same keys `getRecentBackup`/`restoreBackup` already understand) **before** applying a downloaded cloud blob. The player can recover via the existing title-screen recovery path. This makes every cloud overwrite reversible for 48h.
3. **User-facing chooser UI** — a modal presenting both saves side by side:
   - *This device:* name, Day X, Ch.Y, N cats, "last played" relative time.
   - *Cloud:* same summary fields.
   - The **more-recently-played** side is highlighted as the suggested default ("Most recent"), but **both buttons are equal-weight**: `Keep this device's save (upload)` and `Use the cloud save (download)`. A third option: `Keep both` → copies the losing side into a free slot if one exists, else into a `.bak`.
   - Copy is explicit and reassuring: *"Your other save is backed up and can be recovered for 48 hours."*
4. **Handle the silent-logout vector specifically.** The Chart35 root cause was a *silent* logout that then let stale/empty cloud state clobber local on next load. Defenses: (a) a logout **never deletes or overwrites local saves** — local is always the device's own source of truth; (b) if the session expires/401s, `CloudSync` sets `cloudSyncAvailable() = false` and shows a "signed out — sync paused" chip rather than treating the cloud as empty; (c) an empty/absent cloud slot is **"Local only,"** which triggers an *upload* path, never a *download that wipes local.*
5. **Sanitize, always.** Downloaded blobs run `validateAndSanitizeSave`; a cloud blob that fails validation is rejected with a toast and local is untouched.

---

## 4. Infrastructure Plan (exact ordered steps, mapped to proven patterns)

Mapped to the user's own ADRs so this is "more of the same proven shape," not novel ops.

1. **Create the database + scoped role** (mirrors ADR 0002 *external managed DB* and ADR 0009 *default-deny, host-pinned access*; the service connects from localhost so the host-pin is "localhost only," which the cluster already enforces by listening on `localhost:5432`):
   ```bash
   sudo -u postgres psql -c "CREATE ROLE clowder_sync LOGIN PASSWORD '<generated>';"
   sudo -u postgres createdb -O clowder_sync clowder_sync
   ```
   Store the password in the service's env file (loaded by systemd `EnvironmentFile=`), not on disk in the repo — consistent with ADR 0005's "secrets injected at launch, never sitting in the workspace."
2. **Pick a free port.** Quadrille = 3475. Choose **3476** and confirm it's free: `ss -ltnp | grep 3476` (must be empty). Bind uvicorn to `127.0.0.1:3476` only (never `0.0.0.0`).
3. **Create the venv on the volume** (root disk is ~98% full — building on root will fail):
   ```bash
   python3 -m venv /mnt/volume_nyc3_01/jacob/clowder-sync-venv
   /mnt/volume_nyc3_01/jacob/clowder-sync-venv/bin/pip install fastapi uvicorn psycopg2-binary "resend|httpx" ...
   ```
   Place the service code on the volume too (alongside Quadrille's layout), not on root.
4. **Bootstrap the schema** — first run of the service calls `db.py`'s idempotent bootstrap (auth tables) + the new `save_slots` table. Idempotent so redeploys are safe (matches the existing pattern).
5. **systemd unit `clowder-sync.service`** (mirror `quadrille-sync`): `ExecStart=/mnt/volume_nyc3_01/jacob/clowder-sync-venv/bin/uvicorn sync_app:app --host 127.0.0.1 --port 3476`, `EnvironmentFile=` for DB creds + Resend key + the relaxed-verification flag, `Restart=on-failure`, a dedicated/scoped system user (ADR 0005). `systemctl enable --now clowder-sync`.
6. **Apache reverse-proxy on BOTH vhosts** — add to **both** `clowderandcrest.com-le-ssl.conf` **and** `clowder.stephens.page-le-ssl.conf` (this is the easy thing to forget, called out in the brief):
   ```apache
   ProxyPass        /api/ http://127.0.0.1:3476/
   ProxyPassReverse /api/ http://127.0.0.1:3476/
   ```
   Ensure `proxy` + `proxy_http` modules are enabled (`a2enmod proxy proxy_http`). Reload, don't restart, Apache. **Decision:** keep the web app's API **same-origin** (`https://clowderandcrest.com/api/...`) so the `__Host-` cookie and `SameSite` stay strong; the Capacitor app hits the same path over HTTPS with a Bearer token.
7. **TLS / certbot** — no new cert work needed: `/api/` is a path under the existing certificated vhosts, not a new subdomain. (If a future decision moves the API to `api.clowderandcrest.com`, *then* run certbot for that name and re-evaluate `SameSite=None`.) Note this so the builder doesn't over-provision.
8. **Resend sender** — see §4.5.
9. **CORS** — configured in the service (§2.2), not Apache. Verify preflight `OPTIONS /api/...` returns the right `Access-Control-Allow-*` headers from the *Capacitor* origins, since that's the path Quadrille never had to test.
10. **Optional Prometheus/Grafana** — add a `GET /api/health` (and a deeper `GET /api/ready` that checks the DB pool) and **register it as a blackbox probe target**, consistent with ADR 0007 (*pull-based probes*) and ADR 0011 (*instrumented metrics stack*). This is **low-cost and on-brand** (it's literally one of the harvestable platform habits), so I'd do it — but it's explicitly optional and shouldn't block launch.

### 4.5 Resend sender-domain decision (called out per the brief)

The verified Resend domain is **`stephens.page`**. `clowderandcrest.com` is **not** verified.

- **Decision:** send verification/reset email **`from: noreply@stephens.page`** initially, with a friendly `From` name like *"Clowder & Crest"* and a `Reply-To` of a real address if desired. This works today with the shared key in `/var/www/wadadliflarecatering.com/private/.env` (reuse it, do not mint a new key — lean).
- **Caveat to surface to the user:** an email about "Clowder & Crest" arriving from `stephens.page` is mildly off-brand and slightly more likely to be filtered. **If brand polish matters, verify `clowderandcrest.com` in Resend** (add the DKIM/SPF/DMARC DNS records) and switch the from-address to `noreply@clowderandcrest.com`. Given Decision 2 (verification is *nudged, not required* for sync), the deliverability stakes are low at launch — so ship with `stephens.page` and verify the game domain only if/when verification friction or branding becomes a real complaint. **[verify]** the shared Resend key has sending scope for `stephens.page` and isn't rate-limited by other apps sharing it.

---

## 5. Migration & Safety Plan

1. **Existing local-only players are unaffected.** No account is required to play; sync is strictly additive. The title screen, slot picker, and all save paths work exactly as today when signed out or offline. This must be a hard invariant (and is a regression-test target).
2. **Reuse `validateAndSanitizeSave` for every inbound cloud blob** — on download in the title-load reconciliation, in manual Download, and inside the divergence chooser before applying. The function already validates critical fields, clamps strings, strips control chars, and runs `migrateSaveData`, so an old or hostile cloud blob is normalized and version-migrated for free. No new sanitization code.
3. **Version-skew handling.** A player on an old client could download a newer-`version` blob written by a new client (or vice versa). `migrateSaveData` only migrates *forward*; it never down-migrates. So: if a downloaded blob's `version` is **greater** than the client's `SAVE_VERSION`, the client must **refuse to load it** with a clear message (*"This cloud save was made with a newer version of the game — please update"*) rather than misinterpreting fields. **[verify]** by adding a guard in the CloudSync download path (the existing import path doesn't need this because imports are same-client). Store `save_version` server-side (already in the schema) so even `listCloudSlots` can warn before download.
4. **Never clobber newer/divergent local saves** — the entire §3.5 chooser exists for this. Restating the invariants as a checklist the build must satisfy:
   - Logout never touches local saves.
   - Session expiry → "sync paused," never "cloud is empty → wipe local."
   - Any download over an existing local slot writes a `.bak.<ts>` first.
   - Equal-or-divergent revisions → user chooses; LWW is only a *highlighted default*, never an automatic action.
   - A cloud blob failing validation → rejected, local untouched.
5. **First-sync onboarding for an existing local player who signs up:** all 3 local slots are "Local only" → the client offers to upload them (one-click "Back up my saves to the cloud"). Nothing is overwritten because the cloud is empty. This is the happy path that delivers the user's actual goal (reinstall-safe saves) with zero risk.

---

## 6. Atomic-Commit Breakdown

Per `CLAUDE.md`: one logical change per commit, explicit `git add <path>`, tests bundled with their feature, 2–4 commits per response pushed together. Two repos are touched: the **client** (`clowder-and-crest`) and the **server** (the private Quadrille-skeleton-derived `clowder-sync`, deployed on the VPS). Server-side commits live in that service's repo; client commits below.

**Server repo (`clowder-sync`) — sequence:**
1. **`chore: fork Quadrille auth skeleton as clowder-sync, rebrand constants`** — copy `auth.py`, `db.py`, `security.py`, `mailer.py`, `sync_app.py`; strip `sync_user.py`; rebrand app name/URLs/from-address. No behavior change vs. Quadrille except branding.
2. **`feat: relax email-verification gate to password-reset only`** — Decision 2. Isolated so it's bisectable.
3. **`feat: add CORS middleware for Capacitor WebView + web origins`** — the Clowder-specific addition Quadrille lacked.
4. **`feat: per-slot whole-blob sync with revision-based optimistic concurrency`** — new `sync_clowder.py` + `save_slots` schema in the bootstrap + the 4 endpoints + size guard + server-side structural validation. The feature and its endpoint tests in one commit.
5. **`feat: add /api/health and /api/ready probes`** — optional observability (skip or defer if descoping).
6. **`docs: clowder-sync README — port, DB, systemd, Apache proxy, deploy`**.

**Client repo (`clowder-and-crest`) — sequence:**
1. **`feat: add CloudSync facade for account auth and per-slot blob sync`** — `src/systems/CloudSync.ts` only (mirror of `NativeFeatures.ts`), with platform-aware token storage and the `validateAndSanitizeSave` gate on inbound blobs. Self-contained, no UI wiring yet.
2. **`feat: cloud-save account + per-slot sync UI in the menu panel`** — `src/ui/Panels.ts` additions (auth sub-panel, per-slot Upload/Download, verification nudge) + `overlay.css` styles. Uses the facade from commit 1.
3. **`feat: divergence chooser with mandatory local backup before overwrite`** — the safety-critical modal + the backup-before-download logic (reusing the existing `.bak` machinery). This is its **own commit** because it's the highest-risk, most-reviewable unit and must be independently revertible — the explicit lesson from Chart35.
4. **`feat: wire cloud pull on title-load and debounced push on day-end`** — the hook points in `TitleScene.ts` and `main.ts`/`sessionFlow`, with the no-silent-load reconciliation. Lands last because it depends on 1–3.
5. **`docs: mark cloud save sync implemented in CLAUDE.md`** — move "Cloud save sync" out of *"What's Not Implemented Yet"* and add a short architecture note (service name, port, endpoints, the divergence-safety invariant, the "inbound blobs go through validateAndSanitizeSave" rule). **Separate commit** (doc change ≠ feature change).

> **CLAUDE.md doc-update note:** the new section should record (a) the per-slot blob model and why row-merge was rejected, (b) the revision/baseRevision conflict protocol, (c) the five safety invariants from §5.4, and (d) the "two vhosts — proxy must be on both" deployment gotcha, so future contributors don't reintroduce the Chart35 bug or forget the second vhost.

### Harvestable ADR (career framing)

Worth harvesting into `infrastructure-patterns`: an ADR titled something like **"A copy-deployed account+sync skeleton over a shared multi-tenant service for a fleet of small apps."** Context: several small self-hosted apps (Quadrille, now Clowder) each want accounts + sync. Decision: **copy-deploy an app-agnostic auth skeleton per app (own DB, own port, own process) rather than building one multi-tenant auth service.** Trade-off in the house style: *"Accept N near-identical small services for blast-radius isolation and per-app sync-model freedom, instead of one shared service that couples unrelated apps and forces a single sync model."* This is the genuinely defensible, non-obvious trade-off (it argues *against* the seemingly-more-platform-y multi-tenant design) and it's exactly the "what I chose, what I gave up, when I'd revisit" unit the repo wants. **When I'd revisit:** at enough apps that per-app ops toil outweighs coupling risk, or when a shared identity (one login across apps) becomes a product requirement. This ADR is the highest-leverage portfolio artifact here — and notably it lets the *game itself* stay unpinned/hobby (per the career plan's tension) while the *reusable infra lesson* gets surfaced. **Do not gold-plate the game to chase this; the ADR is the deliverable, the game is the proving ground.**

---

## 7. Open Risks / Things to Verify Before Building

1. **[verify] Quadrille source specifics.** The Quadrille server repo is private; I worked from the brief's summary. Before copying, confirm: (a) `auth.py`'s verification gate is a single relaxable check, not woven through every endpoint; (b) cookie/session TTLs and rate-limit thresholds are game-appropriate; (c) `db.py`'s pool config and bootstrap idempotency; (d) the exact `sync_app.py` app-assembly shape for mounting a new router + middleware.
2. **`__Host-` cookie + cross-origin.** Confirm the web app and API are same-origin (`clowderandcrest.com/api/...`). If a future split to `api.clowderandcrest.com` happens, `__Host-` + `SameSite` semantics change (likely needing `SameSite=None; Secure` and careful CSRF), and CORS becomes load-bearing for web too. Keep them same-origin to avoid this.
3. **Capacitor CORS preflight.** Quadrille never tested CORS (Flutter). Verify `OPTIONS` preflight from `https://localhost` / `capacitor://localhost` actually succeeds end-to-end on a device, not just in theory.
4. **Free port.** Confirm 3476 (or chosen port) is free *and* not claimed by another service that auto-starts on boot.
5. **Shared Resend key scope/limits.** Confirm the shared key can send as `stephens.page` and that other apps sharing it won't rate-limit Clowder's verification/reset mails. Decide whether to verify `clowderandcrest.com` for branding.
6. **Disk pressure.** Root is ~98% full — venv, service code, and any logs must live on `/mnt/volume_nyc3_01`. Confirm systemd journald rotation so the new unit's logs don't fill root.
7. **Version-skew refusal.** Implement and test the "cloud blob is a newer SaveData version → refuse to load" guard; it's the one new validation rule beyond reusing `validateAndSanitizeSave`.
8. **`device_id` generation.** Need a stable opaque per-install id for the `save_slots.device_id` audit field and for divergence UX ("last written by another device"); a UUID in `@capacitor/preferences`/localStorage suffices, but confirm it survives the flows it needs to.
9. **Active-slot tracking.** The debounced day-end push needs to know the active slot. `main.ts` emits `active-slot` (seen in TitleScene); confirm that's reliably set for both Continue and New Game flows so pushes target the right slot.
10. **Abuse/quota.** A blob ceiling (256 KB) and per-user slot cap (3) bound storage, but consider a simple per-account rate limit on `PUT` to prevent a runaway client hammering the DB; reuse the auth skeleton's rate-limiter.
11. **Scope discipline (career tension).** The career plan unpins the game as a portfolio piece. Keep the *game-side* work lean (the four client commits), invest the "platform" energy in the **reusable skeleton + ADR**, and resist adding social/leaderboard/multi-device-realtime features the game doesn't need.

---

*Prepared by **Claude Opus 4.8** as part of the model council on Clowder & Crest cloud sync. Source-of-truth files read directly from the `clowder-and-crest`, `infrastructure-patterns`, and `Chart35Client` repositories; Quadrille server internals taken from the task brief (private repo) and flagged for verification.*
