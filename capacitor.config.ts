import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'page.stephens.clowder',
  appName: 'Clowder & Crest',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false, // We handle updates manually for full control
    },
  },
};

export default config;
