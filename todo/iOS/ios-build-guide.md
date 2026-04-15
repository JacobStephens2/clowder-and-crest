# Building Clowder & Crest for iOS

The game is already architecturally ready for iOS — zero TypeScript/Phaser code changes needed. All 6 Capacitor plugins have iOS implementations, and `NativeFeatures.ts` uses platform-agnostic guards throughout.

---

## Prerequisites

- **A Mac** (you have one)
- **Xcode** — install from the Mac App Store (free, ~12 GB)
- **Apple Developer account** — $99/year at [developer.apple.com](https://developer.apple.com/programs/). Required for device testing, TestFlight, and App Store distribution
- **Node.js + npm** — same versions as the Linux server (check with `node -v`)
- **CocoaPods** — Capacitor iOS uses it for native plugin dependencies. Install with `sudo gem install cocoapods` or `brew install cocoapods`

---

## One-Time Setup

### 1. Clone the repo on your Mac

```bash
git clone https://github.com/JacobStephens2/clowder-and-crest.git
cd clowder-and-crest
npm install
```

### 2. Build the web app

```bash
npm run build
```

This creates `dist/` — the same output that Apache serves on the web and that Capacitor wraps for Android.

### 3. Add the iOS platform

```bash
npx cap add ios
```

This generates an `ios/` directory with an Xcode project, similar to how `android/` was generated. The command:
- Creates `ios/App/` with the Xcode workspace
- Copies `dist/` into `ios/App/App/public/`
- Installs CocoaPods for the native plugins

### 4. Sync web assets + plugins

```bash
npx cap sync ios
```

Run this every time you rebuild the web app. It copies `dist/` into the iOS project and updates native plugin dependencies.

### 5. Open in Xcode

```bash
npx cap open ios
```

This opens the `.xcworkspace` file in Xcode. **Always open the `.xcworkspace`, not the `.xcodeproj`** — CocoaPods needs the workspace.

---

## Signing & Provisioning

### Create an App ID

1. Go to [developer.apple.com/account](https://developer.apple.com/account)
2. Certificates, Identifiers & Profiles → Identifiers → + (new)
3. App ID type: App
4. Bundle ID: `page.stephens.clowder` (matches the Android `applicationId`)
5. Description: "Clowder & Crest"
6. Enable capabilities: Push Notifications (for the daily "your cats are waiting" notification)

### Set up signing in Xcode

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the **App** target → Signing & Capabilities tab
3. Team: select your Apple Developer account
4. Bundle Identifier: `page.stephens.clowder`
5. Check "Automatically manage signing" — Xcode will create provisioning profiles for you

---

## App Icons

Apple requires specific icon sizes. The existing crest asset (`public/assets/sprites/crest.png`) can be used as the source.

### Required sizes

| Size | Usage |
|---|---|
| 1024×1024 | App Store listing |
| 180×180 | iPhone (@3x) |
| 120×120 | iPhone (@2x) |
| 167×167 | iPad Pro (@2x) |
| 152×152 | iPad (@2x) |
| 76×76 | iPad (@1x) |
| 40×40 | Spotlight (@1x) |
| 80×80 | Spotlight (@2x) |
| 120×120 | Spotlight (@3x) |

### Generate with ImageMagick (on Mac)

```bash
# Install ImageMagick if not present
brew install imagemagick

# Generate all sizes from the crest
SOURCE="public/assets/sprites/crest.png"
ICON_DIR="ios/App/App/Assets.xcassets/AppIcon.appiconset"

for size in 1024 180 120 167 152 76 40 80; do
  convert "$SOURCE" -resize ${size}x${size} -background white -gravity center -extent ${size}x${size} "$ICON_DIR/icon-${size}.png"
done
```

Then update `ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json` to reference the generated files. Xcode's asset catalog editor can also do this visually.

---

## Capacitor Config

The current `capacitor.config.ts` has `androidScheme: 'https'`. You may want to add the iOS equivalent:

```typescript
const config: CapacitorConfig = {
  appId: 'page.stephens.clowder',
  appName: 'Clowder & Crest',
  webDir: 'dist',
  android: {
    scheme: 'https',
  },
  ios: {
    // Use HTTPS scheme for WKWebView (matches Android behavior)
    scheme: 'https',
  },
};
```

---

## Build & Run

### Simulator

```bash
npm run build
npx cap sync ios
# Then in Xcode: select a simulator (e.g. iPhone 15) and press ⌘R
```

### Physical device

1. Connect iPhone/iPad via USB
2. In Xcode, select the device from the toolbar
3. Press ⌘R — Xcode builds, signs, and installs
4. First run may require trusting the developer certificate on the device: Settings → General → VPN & Device Management

### Archive for TestFlight / App Store

1. In Xcode: Product → Archive
2. Once the archive completes, the Organizer window opens
3. Click "Distribute App" → App Store Connect → Upload
4. In [App Store Connect](https://appstoreconnect.apple.com/), the build appears under your app's TestFlight tab
5. Add internal/external testers and they'll get a TestFlight notification

---

## What Already Works (No Changes Needed)

| Feature | iOS Status |
|---|---|
| Phaser 3 canvas rendering | Works in WKWebView |
| HTML/CSS overlay UI | Works in WKWebView |
| @capacitor/haptics | iOS Taptic Engine support built-in |
| @capacitor/local-notifications | iOS notification system built-in |
| @capacitor/app | iOS lifecycle hooks built-in |
| @capacitor/status-bar | iOS status bar control built-in |
| @capacitor/filesystem | iOS Documents directory built-in |
| @capacitor/share | iOS share sheet built-in |
| All 15 minigames | Platform-agnostic TypeScript |
| Save/load (localStorage) | WKWebView localStorage persists |
| Music + SFX (HTML5 Audio) | Works in WKWebView (iOS 15+) |

### One iOS-specific consideration

**Audio autoplay policy:** iOS Safari / WKWebView requires a user gesture before audio can play. The game's BGM starts from a user tap (title screen interaction), so this should work. If music doesn't start on first load, the existing `startBgm()` call in the `game-loaded` handler may need to be deferred to a tap event — but this is likely already handled since Android has a similar restriction.

---

## Estimated Timeline

| Step | Time |
|---|---|
| Install Xcode + CocoaPods | ~30 min (download time) |
| Clone, npm install, build | ~5 min |
| `npx cap add ios` + sync | ~2 min |
| Set up Apple Developer account | ~15 min (if new) |
| Configure signing in Xcode | ~5 min |
| Generate app icons | ~10 min |
| First successful simulator run | ~5 min |
| First TestFlight upload | ~20 min |
| **Total** | **~1.5 hours** |

---

## App Store Submission Checklist

When ready to publish (beyond TestFlight):

- [ ] App Store listing: screenshots (6.7" iPhone, 12.9" iPad), description, keywords, category (Games → Puzzle)
- [ ] Privacy policy URL (required by Apple)
- [ ] Age rating questionnaire in App Store Connect
- [ ] Review Apple's [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — the game should pass easily (no user-generated content, no in-app purchases, no external payment links)
- [ ] Ensure the app works offline (Apple sometimes tests on airplane mode)
- [ ] Test on multiple device sizes (iPhone SE, iPhone 15 Pro Max, iPad)
