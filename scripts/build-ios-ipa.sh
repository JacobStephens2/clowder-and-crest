#!/usr/bin/env bash
#
# Build a development-signed .ipa of Clowder & Crest and (optionally) attach it
# to a GitHub release — the iOS analogue of the Android .apk release artifact.
#
# Unlike an .apk, this .ipa is NOT freely installable by anyone:
#   • It installs directly only on devices whose UDID is registered in the
#     team's development provisioning profile (Xcode → your account → Devices).
#   • Everyone else installs it by re-signing with their OWN free Apple ID using
#     a sideloading tool: AltStore / SideStore / Sideloadly. Developer Mode must
#     be enabled on the device (Settings ▸ Privacy & Security ▸ Developer Mode).
#   • For frictionless testing (no UDID, no tools), use TestFlight instead.
#
# Usage:
#   scripts/build-ios-ipa.sh                 # build dist + archive + export .ipa
#   scripts/build-ios-ipa.sh --release vX.Y  # also upload the .ipa to GH release vX.Y
#   scripts/build-ios-ipa.sh --skip-web      # skip the web build + cap sync (reuse dist)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROJECT="ios/App/App.xcodeproj"
SCHEME="App"
EXPORT_OPTS="ios/ExportOptions/development.plist"
BUILD_DIR="build/ios"
ARCHIVE="$BUILD_DIR/ClowderAndCrest.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"

RELEASE_TAG=""
SKIP_WEB=0
while [ $# -gt 0 ]; do
  case "$1" in
    --release) RELEASE_TAG="${2:-}"; shift 2 ;;
    --skip-web) SKIP_WEB=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

VERSION="$(grep -m1 'MARKETING_VERSION' "$PROJECT/project.pbxproj" | sed -E 's/.*= ([^;]+);/\1/' | tr -d ' ')"
IPA_NAME="ClowderAndCrest-${VERSION}.ipa"

echo "▸ Clowder & Crest iOS .ipa  (version ${VERSION})"

if [ "$SKIP_WEB" -eq 0 ]; then
  echo "▸ Building web bundle…"
  npm run build
  echo "▸ Syncing to iOS…"
  npx cap sync ios
fi

rm -rf "$ARCHIVE" "$EXPORT_DIR"
mkdir -p "$BUILD_DIR"

echo "▸ Archiving (Release, generic iOS device)…"
xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  | tail -2

echo "▸ Exporting development-signed .ipa…"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_OPTS" \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates \
  | tail -2

# Xcode names the export "App.ipa" (after the product); rename to a versioned file.
SRC_IPA="$(/usr/bin/find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' | head -1)"
if [ -z "$SRC_IPA" ]; then
  echo "✗ No .ipa produced — check $EXPORT_DIR" >&2
  exit 1
fi
FINAL_IPA="$EXPORT_DIR/$IPA_NAME"
mv "$SRC_IPA" "$FINAL_IPA"

echo "✓ Built $FINAL_IPA ($(du -h "$FINAL_IPA" | cut -f1))"

if [ -n "$RELEASE_TAG" ]; then
  echo "▸ Uploading to GitHub release $RELEASE_TAG…"
  if ! gh release view "$RELEASE_TAG" >/dev/null 2>&1; then
    gh release create "$RELEASE_TAG" --title "$RELEASE_TAG" --notes "iOS development build. See README for install instructions (AltStore/Sideloadly or registered-device direct install)."
  fi
  gh release upload "$RELEASE_TAG" "$FINAL_IPA" --clobber
  echo "✓ Attached $IPA_NAME to release $RELEASE_TAG"
fi
