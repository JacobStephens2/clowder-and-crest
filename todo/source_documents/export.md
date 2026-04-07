# APK Export Instructions

The server doesn't have the Android SDK installed, so APK builds must be done on a machine with Android Studio or the Android SDK CLI tools.

## Prerequisites
- Android SDK (API 34+)
- Java 17+

## Steps

1. On a machine with Android SDK, clone the repo:
   ```bash
   git clone https://github.com/JacobStephens2/clowder-and-crest.git
   cd clowder-and-crest
   npm install
   npm run build
   npx cap sync android
   ```

2. Build debug APK:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

3. For signed release APK:
   ```bash
   # Create keystore (one-time):
   keytool -genkey -v -keystore clowder.keystore -alias clowder -keyalg RSA -keysize 2048 -validity 10000

   # Build release:
   ./gradlew assembleRelease \
     -Pandroid.injected.signing.store.file=../clowder.keystore \
     -Pandroid.injected.signing.store.password=YOUR_PASSWORD \
     -Pandroid.injected.signing.key.alias=clowder \
     -Pandroid.injected.signing.key.password=YOUR_PASSWORD
   ```
   APK output: `android/app/build/outputs/apk/release/app-release.apk`

4. Upload to GitHub Releases:
   ```bash
   gh release create v1.0.6 android/app/build/outputs/apk/release/app-release.apk --title "v1.0.6" --notes "Clowder & Crest APK"
   ```

## Current Version
- `versionCode`: 6
- `versionName`: 1.0.6
- `applicationId`: page.stephens.clowder
