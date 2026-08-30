#!/usr/bin/env bash
#
# Build a distribution-signed .ipa of Clowder & Crest and upload it to
# TestFlight / App Store Connect. This is the App Store sibling of
# build-ios-ipa.sh (which produces a sideload-only development build).
#
# Unlike the development .ipa, a TestFlight build installs friction-free for any
# invited tester (no UDID registration, no sideloading tools) once it finishes
# processing in App Store Connect.
#
# Prerequisites (already true on the build machine):
#   • Xcode signed into the org Apple ID (team LHY8W725A8 / Stephens Page LLC),
#     so automatic signing can mint the distribution profile.
#   • App Store Connect API key staged at
#       ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8
#     The key id + issuer default to the Stephens Page LLC key below; override
#     via the ASC_KEY_ID / ASC_ISSUER_ID env vars for a different team.
#   • The app record (page.stephens.clowder) exists in App Store Connect.
#
# Usage:
#   scripts/testflight.sh            # build dist + archive + export + upload
#   scripts/testflight.sh --skip-web # reuse the existing dist/ (skip web build + cap sync)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROJECT="ios/App/App.xcodeproj"
SCHEME="App"
EXPORT_OPTS="ios/ExportOptions/appstore.plist"
BUILD_DIR="build/ios"
ARCHIVE="$BUILD_DIR/ClowderAndCrest.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"

# TestFlight requires a unique, monotonically rising build number per upload.
# A UTC minute-stamp satisfies both without tracking state in git.
BUILD_NUMBER="${BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}"

# App Store Connect API key (Stephens Page LLC). Override via env for another team.
ASC_KEY_ID="${ASC_KEY_ID:-JLFPG25C4J}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-67ee426c-dbe6-45a4-86e1-dc102fb781d1}"

SKIP_WEB=0
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-web) SKIP_WEB=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

VERSION="$(grep -m1 'MARKETING_VERSION' "$PROJECT/project.pbxproj" | sed -E 's/.*= ([^;]+);/\1/' | tr -d ' ')"
echo "▸ Clowder & Crest TestFlight  (version ${VERSION}, build ${BUILD_NUMBER})"

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
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  | tail -2

echo "▸ Exporting App Store-signed .ipa…"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_OPTS" \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates \
  | tail -2

IPA="$(/usr/bin/find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' | head -1)"
if [ -z "$IPA" ]; then
  echo "✗ No .ipa produced — check $EXPORT_DIR" >&2
  exit 1
fi
echo "✓ Built $IPA ($(du -h "$IPA" | cut -f1))"

echo "▸ Uploading to TestFlight…"
xcrun altool --upload-app --type ios \
  --file "$IPA" \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "✅ Uploaded build ${BUILD_NUMBER}. It appears in App Store Connect ▸ TestFlight after processing (5–15 min)."
