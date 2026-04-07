import { defineConfig } from 'vite';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // Split Phaser into its own chunk so the engine can be cached separately
    // from game code. Game updates don't invalidate the cached Phaser chunk.
    // Function form required because this project uses rolldown, not rollup.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/phaser')) return 'phaser';
          if (id.includes('/src/scenes/BrawlScene.ts') || id.includes('/src/scenes/ChaseScene.ts') || id.includes('/src/scenes/StealthScene.ts') || id.includes('/src/scenes/PounceScene.ts')) return 'scenes-action';
          if (id.includes('/src/scenes/SokobanScene.ts') || id.includes('/src/scenes/PuzzleScene.ts') || id.includes('/src/scenes/NonogramScene.ts') || id.includes('/src/scenes/RitualScene.ts') || id.includes('/src/scenes/ScentTrailScene.ts') || id.includes('/src/scenes/HeistScene.ts')) return 'scenes-puzzle';
          if (id.includes('/src/scenes/FishingScene.ts') || id.includes('/src/scenes/HuntScene.ts') || id.includes('/src/scenes/PatrolScene.ts') || id.includes('/src/scenes/CourierRunScene.ts')) return 'scenes-jobs';
          if (id.includes('/src/scenes/GuildhallScene.ts') || id.includes('/src/scenes/TownMapScene.ts') || id.includes('/src/scenes/RoomScene.ts') || id.includes('/src/scenes/TitleScene.ts') || id.includes('/src/scenes/BootScene.ts') || id.includes('/src/scenes/DungeonRunScene.ts')) return 'scenes-world';
          if (id.includes('/src/ui/')) return 'ui';
          if (id.includes('/src/systems/')) return 'systems';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3200,
    host: true,
  },
});
