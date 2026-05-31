import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'page.stephens.clowder',
  appName: 'Clowder & Crest',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false, // We handle updates manually for full control
    },
  },
  ios: {
    // Respect the safe areas (notch + home indicator). The web layer also
    // reads env(safe-area-inset-*) via viewport-fit=cover, but contentInset
    // keeps the WKWebView itself from sliding content under the status bar.
    contentInset: 'always',
    backgroundColor: '#1c1b19', // Matches the title screen / game background.
    // Phaser unlocks its AudioContext on the first tap (title screen), so we
    // don't need WKWebView to require a gesture for inline media.
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
