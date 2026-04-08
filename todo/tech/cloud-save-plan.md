# Cloud Save / Account System — Scope Plan

## The user request

> "I want to reinstall the game on Android to get updates and still have haptics, but I'm worried about losing the save. Adding accounts / cloud saves would be good to ameliorate this concern in players. For the email / password account system that could be used here, SMTP creds used in /var/www/wedding.stephens.page for Mandrill can also be used here in this project to send email"

The concrete need: a player who reinstalls the APK should not lose their save. The proposed solution is email/password accounts with cloud-synced saves, using Mandrill SMTP for verification emails (the same Mandrill account already used by the wedding site).

## Why this is multi-day work

This is the largest piece of work currently on the queue. It's NOT a single commit — it's a project. Breaking it down honestly:

### 1. Server backend (~1 day)
The game is currently a static-served SPA with no server. A cloud save needs:
- A small HTTP API (Node/Fastify or PHP, deployed to clowderandcrest.com behind Apache)
- POST /api/auth/register (email, password) — creates user, sends verification email
- POST /api/auth/verify (token) — flips user.verified=true
- POST /api/auth/login (email, password) — returns JWT
- GET /api/save (auth) — returns the user's latest cloud save
- PUT /api/save (auth, body) — uploads a save, validates against `validateAndSanitizeSave`
- DELETE /api/save (auth) — for clean-slate restarts
- Storage: SQLite is plenty for this scale; users + saves table.

### 2. Email verification flow (~half day)
- Wire Mandrill SMTP (creds available at `/var/www/wedding.stephens.page/private/.env`, keys: `MANDRILL_SMTP_HOST`, `MANDRILL_SMTP_PORT`, `MANDRILL_SMTP_USER`, `MANDRILL_SMTP_PASS`, `SMTP_FROM_EMAIL`, etc.)
- Verification template (HTML email with token link)
- Token generation + 24h expiry
- Test against a real inbox (use the existing wedding-site flow as reference: `private/email_handler.php`)

### 3. Account creation UI (~half day)
- New menu item: "Create Cloud Account"
- Email + password form with validation
- "Verification email sent" state
- Re-send verification button

### 4. Login UI (~half day)
- "Sign In" menu item
- Email + password form
- "Sign in to recover your save"
- JWT stored in localStorage

### 5. Cloud sync mechanism (~1 day, the trickiest part)
- **When to push**: after every saveGame()? After every day-end? Both bandwidth-wise and conflict-wise this is non-trivial.
- **When to pull**: on app start if logged in? On manual "Sync" button?
- **Conflict resolution**: what if the player plays on phone (cloud lags), then web (newer cloud), then back to phone? Need a clear "your local save is older than cloud — overwrite local?" flow with a clean UX.
- **Migration**: existing local-only saves need a "claim this save into your account" path the first time the user logs in.

### 6. Account recovery (~half day)
- "Forgot password" → email reset link
- Reset token + form

### 7. Testing on real Android device (~half day)
- Sideload the APK with the new code
- Verify the full create → verify → sync → reinstall → login → restore loop

**Total estimate: 4-5 days of focused work.** Probably more if any part of the auth chain misbehaves.

## Recommended sequencing

If this gets prioritized, the order should be:

1. **Decide hosting model** — same VM as the game (lightweight Node server behind Apache), or external (Cloudflare Workers, Supabase, Firebase)? The Mandrill creds existing in `/var/www/wedding.stephens.page/private/.env` suggest the same VM is convenient because email infrastructure is already running here.

2. **Build the server first, in isolation**, with curl/Postman. Get the auth + save endpoints working without any UI. Verify Mandrill emails actually arrive.

3. **Wire the UI second** — create account, login, cloud sync. The save sync UX is the trickiest part; build it as a simple "manual sync" button first, automate later.

4. **Migration path last** — handle existing local saves and conflict cases. Add the "claim local save into account" flow.

## Lighter-touch alternatives worth considering first

The user's stated motivation is "I don't want to lose my save when I reinstall the APK." Cloud saves solve this comprehensively, but they're 4-5 days of work. Cheaper alternatives that solve part of the problem:

### Alternative A: Capacitor Filesystem export (~half day)
Use `@capacitor/filesystem` to write the save to a known native path that survives APK reinstall (e.g. `Documents/clowder-save.json`). The player exports manually before reinstall and the file is still there afterward. Combined with the existing Import Save UI, this is "manual cloud save" — no server needed.

**Limitation:** Requires the player to remember to export. No automation.

### Alternative B: Capacitor Preferences plugin (~quarter day)
`@capacitor/preferences` writes to native shared preferences which DO survive APK updates (but NOT clean reinstalls). Wraps the existing localStorage save key. Solves the "I updated the APK" case but not the "I uninstalled and reinstalled" case.

**Limitation:** Doesn't survive a clean reinstall (which is the user's stated case).

### Alternative C: Google Drive backup via Capacitor (~1-2 days)
Use the @capacitor-community/google-drive plugin (or a custom GoogleSignIn flow) to back up the save to the user's own Drive account. No email/password account needed — uses Google's identity. Restores on reinstall via "sign in with Google".

**Limitation:** Requires the player to have a Google account, requires Google sign-in setup, doesn't work on iOS/web.

### Alternative D: Just do the export-warning-on-reinstall flow (~quarter day)
Show an explicit "Before you reinstall, export your save!" warning the first time the player opens the menu. Combined with the Capacitor Filesystem path from Alternative A, this addresses the user's specific concern with much less work.

## Recommendation

**Don't build the full email/password cloud save in this session.** It's a multi-day project that deserves its own dedicated sprint and a real test pass on a real Android device. Building it half-implemented and half-tested would create more problems than it solves (auth bugs, sync bugs, lost saves).

**Do** consider Alternative A (Capacitor Filesystem export to a survives-reinstall path) as a near-term improvement that solves 80% of the user's stated need with one day of work. It can ship before the full cloud system and the cloud system can supersede it later.

## Status (2026-04-08)

**Alternatives A + B shipped in v2.4.0+1** as the practical solution. The user explicitly chose this path: *"maybe that means the cloud save is not necessary, though it would still be nice"*.

What landed:
- `@capacitor/filesystem` plugin added
- `exportSaveToFilesystem()` writes the manual export to `Documents/clowder-save-day{N}.json` on Capacitor (Documents survives APK uninstall on Android)
- `writeAutoSnapshot()` overwrites `Documents/clowder-save-autosnapshot.json` on every day-end (not every save — disk IO would lag the per-tile loop)
- TitleScene first-launch detection: when localStorage has no slots but a Documents snapshot exists, a green "↺ Restore Save (Day X, Ch.Y)" button appears above the New Game button. One tap restores the snapshot to slot 1 and loads the game.
- The web export path is unchanged (standard `<a download>` still drops in Downloads folder).

The full cloud system (steps 1-7 above) remains deferred. The user noted it would "still be nice" so it's not removed from the queue — but it's no longer urgent because the reinstall-loss problem is solved by the Capacitor Filesystem path. If multi-device sync becomes a real player ask later, this doc is the starting point for that work.

**If** the full system is later prioritized, the steps above (server backend → email → UI → sync → migration → testing) are the rough order. The Mandrill creds at `/var/www/wedding.stephens.page/private/.env` are the right SMTP source — re-use them via a shared `.env` or copy the relevant keys into a new `clowder/private/.env`.

## Open questions

- Hosting: same VM (cheap, simple, Mandrill already there) or external (more redundancy, more setup)?
- Token storage: JWT in localStorage (simple, works) or HTTP-only cookies (more secure, requires CORS)?
- Save migration: when a player first logs in, do we auto-claim their local save, or ask them?
- Multi-device conflict: last-write-wins (simple, can lose data) or merge prompts (safer, more UX work)?
- iOS: this game doesn't ship on iOS yet, but if it does, the cloud save layer should be platform-neutral. Don't build Android-specific code into the auth layer.
