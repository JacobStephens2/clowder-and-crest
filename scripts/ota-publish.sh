#!/bin/bash
# Publish an OTA update bundle.
#
# Usage: npm run ota:publish
#
# What it does:
#   1. Reads the version from package.json
#   2. Zips dist/ into updates/<version>.zip
#   3. Writes updates/manifest.json pointing to the new zip
#
# The Capacitor app checks manifest.json on launch and downloads
# the zip if a newer version is available.

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
UPDATES_DIR="dist/updates"
ZIP_NAME="${VERSION}.zip"

echo "Publishing OTA update v${VERSION}..."

# Create updates directory inside dist (served by Apache)
mkdir -p "$UPDATES_DIR"

# Zip the dist contents (excluding the updates folder itself)
cd dist
zip -r -q "../${ZIP_NAME}" . -x "updates/*"
cd ..
mv "${ZIP_NAME}" "${UPDATES_DIR}/${ZIP_NAME}"

# Write the manifest
cat > "${UPDATES_DIR}/manifest.json" <<EOF
{
  "version": "${VERSION}",
  "url": "https://clowder.stephens.page/updates/${ZIP_NAME}"
}
EOF

echo "Published: ${UPDATES_DIR}/${ZIP_NAME}"
echo "Manifest:  ${UPDATES_DIR}/manifest.json"
echo ""
cat "${UPDATES_DIR}/manifest.json"
