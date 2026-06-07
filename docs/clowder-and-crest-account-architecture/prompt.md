Run a Model Council on the following question. You MUST spawn one `run_subagent` in PARALLEL for each model identifier in this list: Claude Opus 4.7, GPT-5.5, Gemini 3.1 Pro. For each subagent: subagent_type="research", model=<the identifier verbatim>, preload_skills=["model-catalog"]. After all subagents complete, synthesize per multi-model-comparison.md. Question: Research and propose a concrete implementation plan for adding ACCOUNT-BASED CLOUD
SAVE SYNC to the game "Clowder & Crest" (Phaser 3 + TypeScript + Vite + Capacitor;
static dist/ served by Apache at https://clowderandcrest.com and
https://clowder.stephens.page). The project is at /var/www/clowder.stephens.page.
Today there are NO accounts and NO cloud sync — saves are localStorage-only.
"Cloud save sync" is listed under "What's Not Implemented Yet" in
/var/www/clowder.stephens.page/CLAUDE.md.

Output a step-by-step plan (server, client, infrastructure, deployment, atomic
commits) AND research-and-decide the open questions below with justified
trade-offs. Do NOT write code — produce a plan. Read any files you need.

## GITHUB REPOS (for additional context — browse if useful)
- Clowder & Crest (this project): https://github.com/JacobStephens2/clowder-and-crest
- Quadrille (has an existing account+sync backend — see below):
  https://github.com/JacobStephens2/quadrille
- Creighton Tracker / "Chart35" (the app with the data-loss incident below):
  private monorepo https://github.com/JacobStephens2/Chart35 ,
  public AGPL client https://github.com/JacobStephens2/Chart35Client
- infrastructure-patterns (public ADRs / reusable infra patterns — see career note):
  https://github.com/JacobStephens2/infrastructure-patterns
The local working copies (/var/www/...) are the source of truth; the repos are for
history/context.

## EXISTING REFERENCE IMPLEMENTATION (an OPTION to evaluate — not a requirement)
A complete, production-grade email+password account + cloud-sync backend already
exists for another app (Quadrille). It is offered as a strong candidate to reuse or
adapt, but you are NOT required to use it — if you find a materially better approach
(a different self-hosted design, a managed auth/BaaS service, etc.), propose it and
justify the trade-off. Read these before deciding:
- /var/www/quadrille.app/server/auth.py — email+password auth, opaque server-side
  sessions (httpOnly __Host- cookie for web, Bearer token for mobile), email
  verification, password reset, rate limiting, CSRF origin check. App-agnostic
  except branding constants.
- /var/www/quadrille.app/server/db.py — psycopg2 pool + idempotent schema
  bootstrap (users, auth_sessions, auth_tokens, user_sync_state, rate_limit_events).
- /var/www/quadrille.app/server/sync_user.py — per-user sync. NOTE it does
  ROW-LEVEL last-write-wins merge keyed by (table, id) with tombstones. That fits
  Quadrille's row-structured tables but does NOT fit Clowder's save model (below);
  if this backend is reused, the merge strategy must be redesigned.
- /var/www/quadrille.app/server/security.py, mailer.py, sync_app.py, README.md.

## CLOWDER'S SAVE MODEL (why row-merge doesn't transplant)
Read /var/www/clowder.stephens.page/src/systems/SaveManager.ts:
- Saves are a single MONOLITHIC SaveData blob (JSON), not row-structured tables.
- Storage keys: `clowder_and_crest_save` (default/legacy) plus
  `clowder_save_slot_<n>` for 3 slots, plus local-only `.bak.<ts>` backups (do NOT
  sync backups).
- Each save has `lastPlayedTimestamp` and a `version` with a migration ladder
  (migrateSaveData).
- There is already untrusted-save sanitization (validateAndSanitizeSave) used on
  Import — reuse it for inbound cloud payloads.
So the model should be PER-SLOT WHOLE-BLOB sync with conflict detection, NOT
row-level merge. Propose the exact model (e.g. server revision + client
baseRevision optimistic concurrency, LWW by lastPlayedTimestamp, etc.).

## CRITICAL SAFETY LESSON — do not repeat the Creighton/Chart35 data-loss bug
In another app (Creighton / Chart35), sync silently overwrote local data on load
after a silent logout, and a real user lost weeks of data. The conflict-resolution
design MUST NOT silently clobber a divergent or newer local save. Propose
divergence-detection + a user-facing chooser ("Cloud: Day 14, Ch.3, 5 cats, 2h ago
— vs — This device: Day 12, Ch.3, 4 cats"), explicit manual Upload/Download
controls, and a recoverable local backup before any overwrite. No blind auto-LWW.

## INFRASTRUCTURE CONTEXT (VPS — follow these proven patterns exactly if self-hosting)
- PostgreSQL 16 cluster 16/main, data dir on a mounted volume at
  /mnt/volume_nyc3_01/jacob/pgdata, listens localhost:5432. Add a DB:
  `sudo -u postgres psql` → CREATE ROLE x LOGIN PASSWORD '…'; then
  `sudo -u postgres createdb -O x dbname`.
- Quadrille's analogous service: FastAPI + uvicorn bound to 127.0.0.1, a systemd
  unit (quadrille-sync), venv on the volume
  (/mnt/volume_nyc3_01/jacob/quadrille-sync-venv), Apache reverse-proxy
  `ProxyPass /api/ http://127.0.0.1:<port>/`, secrets in a gitignored chmod-600
  server/.env. Quadrille uses port 3475 — pick a different free port for Clowder.
- Root disk is ~98% full; build any venv on the volume, not root.
- Clowder is served from TWO Apache vhosts sharing one dist/:
  clowderandcrest.com.conf/-le-ssl.conf and
  clowder.stephens.page.conf/-le-ssl.conf. Any /api/ proxy must be added to BOTH.
  Consider: the __Host- cookie is host-scoped per domain; and the Capacitor native
  app is a WebView with a cross-origin origin (https://localhost on Android,
  capacitor://localhost on iOS) → it needs CORS on the service + Bearer-token auth.
  (Quadrille's native client is Flutter, which is NOT subject to CORS — so Quadrille
  has no CORS middleware; Clowder will need it. Verify this.)
- Email: Resend is the provider; the verified sending domain is `stephens.page`
  (so verification/reset emails should send from e.g. noreply@stephens.page UNLESS
  clowderandcrest.com gets verified in Resend — call out which). The shared Resend
  API key is in /var/www/wadadliflarecatering.com/private/.env.
- Optional: a Prometheus/Grafana fleet monitor blackbox-probes service /health
  endpoints and tracks systemd units — note whether to register the new service.

## CAREER FRAMING (factor in, state honestly)
The authoritative plan is /var/www/Android2/advancement/career-advancement-plan-r3.md.
Key tension: that plan explicitly UNPINS clowder-and-crest from the GitHub profile
— the game is a hobby project, NOT a showcased portfolio piece, and the plan warns
against over-engineering infra for résumé reasons. The user's positioning is
"Platform & infrastructure engineer." So the recommendation should bias toward
(a) reusing/adapting existing platform pieces over bespoke builds, (b) keeping it
LEAN and self-hosted, and (c) optionally noting whether the "one reusable
copy-deployed account+sync skeleton powering a fleet of small apps" pattern is worth
harvesting into an ADR in the public infrastructure-patterns repo
(https://github.com/JacobStephens2/infrastructure-patterns). Do NOT recommend
gold-plating the game itself. (If an alternative approach clearly serves these goals
better, say so.)

## OPEN DECISIONS TO RESEARCH AND PROPOSE (with justification)
1. BACKEND APPROACH. Evaluate at least these and recommend one:
   (A) a dedicated new clowder-sync service that reuses/adapts the Quadrille auth
       skeleton, with its own Postgres DB + port (isolated);
   (B) extend the existing quadrille-sync into a multi-app/multi-tenant service
       serving both apps (stronger "platform" story but couples two unrelated apps
       and requires reworking the row-merge sync);
   (C) a different approach entirely (alternative self-hosted design, or a managed
       auth/BaaS such as Supabase/Firebase/Clerk, etc.).
   Account for blast-radius isolation, the differing sync models, operational cost,
   and the career framing.
2. EMAIL-VERIFICATION GATE. Quadrille requires a verified email before sync turns
   on. For a casual game that's friction. Propose whether Clowder should (A) sync
   immediately on sign-up with verification only gating password reset, or (B)
   require verification like Quadrille. Justify.

## DELIVERABLE FORMAT
1. Recommended architecture (both decisions resolved + reasoning).
2. Server plan — for the recommended backend: which pieces are reused/adapted vs
   new, the branding/config/CORS edits needed, and the per-slot blob-sync endpoint
   design + conflict model.
3. Client plan — a new src/systems/CloudSync.ts facade (mirror the NativeFeatures.ts
   facade convention in the codebase), auth+sync UI placement in src/ui/Panels.ts /
   the menu, sync hook points (title-load pull, day-end push debounce, manual
   buttons), token storage for web vs Capacitor, and the divergence chooser.
4. Infrastructure plan — exact ordered steps (DB, venv, service + port, Apache proxy
   on BOTH vhosts, certbot already present, Resend sender, CORS, optional Prometheus
   registration), each mapped to the proven patterns above (or to the chosen
   alternative's setup).
5. Migration/safety plan — reusing validateAndSanitizeSave, never clobbering
   newer/divergent local saves, what happens to existing local-only players.
6. An atomic-commit breakdown (one logical change per commit, stage explicitly) and
   a note on the CLAUDE.md doc update (move "Cloud save sync" out of "Not
   Implemented").
7. Open risks / things to verify before building. Analysis depth: Deep Dive. Output format: Markdown report. Additional context: Not provided