# Clowder & Crest — iOS / TestFlight status

_Last updated: 2026-06-16_

The iOS app (Capacitor wrapper around the Phaser web game, plus a WidgetKit
widget) is live on **TestFlight**. This doc captures the current state, how the
build gets there, and the gotchas that were resolved getting the first one up.

## Current state

- **App Store Connect app**: Clowder & Crest — app ID **6780725027**, bundle
  `page.stephens.clowder`, SKU `clowder-and-crest-ios`.
- **Team**: org **Stephens Page LLC — `LHY8W725A8`** (NOT the old personal team
  `G38J85UN6P`). Same team/key as Cascade, Daily Dozen, and Chart35.
- **Shipped build**: **2.7.3 (202606160305)** — `processingState VALID`,
  encryption compliance declared, ready to install.
- **Distribution**: internal testing only so far. No external (public-link)
  group configured yet.

| Build | Version | State | Notes |
|-------|---------|-------|-------|
| 202606160305 | 2.7.3 | VALID | **Use this one.** Compliance-clear (`ITSAppUsesNonExemptEncryption=false`). |
| 202606152301 | 2.7.3 | VALID | Pre-encryption-flag — shows "Missing Compliance". Ignore or delete. |

## Adding testers

**Internal** (App Store Connect team members) — available now, no review:
App Store Connect → Clowder & Crest → **TestFlight → Internal Testing** → add
people to a group → enable build 202606160305. Apple emails them a redeem link.

**External** (public shareable link, like Chart35) — not set up yet. Requires a
one-time **Beta App Review** (~1 day) plus an external group. Ask and it can be
created via the App Store Connect API + submitted.

## Shipping a new build

One command from the repo root:

```bash
./scripts/testflight.sh             # rebuild web + archive + export + upload
./scripts/testflight.sh --skip-web  # reuse the current dist/ (skip web build + cap sync)
```

The script:
1. `npm run build` + `npx cap sync ios` (unless `--skip-web`),
2. archives `ios/App/App.xcodeproj` scheme `App` (Release, automatic signing),
3. exports with `ios/ExportOptions/appstore.plist` (`app-store-connect` method),
4. uploads via `xcrun altool` using the org App Store Connect API key.

The **build number** is a UTC minute-stamp (`date -u +%Y%m%d%H%M`) set at build
time, so the committed `CURRENT_PROJECT_VERSION` stays at `1`. TestFlight only
needs it unique and rising. Bump `MARKETING_VERSION` in the project for a new
user-facing version.

`scripts/build-ios-ipa.sh` is the unrelated **sideload** path (development
signing, method `debugging`) — not for TestFlight.

### Prerequisites on the build machine

- Xcode signed into the org Apple ID so automatic signing /
  `-allowProvisioningUpdates` can mint the distribution profile (no API-key
  signing needed — API-key provisioning is broken here, see Chart35 notes).
- App Store Connect API key staged at
  `~/.appstoreconnect/private_keys/AuthKey_JLFPG25C4J.p8` (key `JLFPG25C4J`,
  issuer `67ee426c-dbe6-45a4-86e1-dc102fb781d1`). The `.p8` is a secret — not
  committed. Override `ASC_KEY_ID` / `ASC_ISSUER_ID` env vars for another team.

## Gotchas resolved (2026-06-16)

- **Team migration** — project signed against the dead personal team
  `G38J85UN6P`; moved all four build configs to `LHY8W725A8`.
- **App group not available** — `group.page.stephens.clowder` was globally bound
  to the dead personal team and is undeletable, so signing failed with
  _"An Application Group with Identifier … is not available."_ Renamed the
  shared container to **`group.page.stephens.clowder.crest`** across both
  `.entitlements`, `ClowderWidgetData.swift`, and `ClowderBridgePlugin.swift`.
- **Upload rejected, error 90474** — the universal (iPhone+iPad) build declared
  portrait-only iPad orientations; iPad-capable apps must support all four
  orientations or opt out of multitasking. Added `UIRequiresFullScreen=true`
  (it's a portrait game) in `ios/App/App/Info.plist`.
- **Missing Compliance gate** — added `ITSAppUsesNonExemptEncryption=false`
  (game uses only exempt HTTPS) so builds are testable immediately.
- **App record creation** — the App Store Connect API cannot create apps
  (`POST /v1/apps` → 403). The record was created in the GUI. Bundle IDs *can*
  be created via the API (`POST /v1/bundleIds`).

## Source of these changes

Branch `ios-release-workflow`, atomic commits:

- `336f97a` Move the iOS app to the org App Store Connect team
- `5bc5698` Rename the widget app group to a free identifier
- `febe5ce` Make the App Store build pass validation and compliance
- `59beb69` Add the TestFlight build-and-upload script
