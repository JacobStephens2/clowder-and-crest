import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GuildhallScene } from './scenes/GuildhallScene';
// TownScene replaced by TownMapScene — kept as file but removed from config
import { PuzzleScene } from './scenes/PuzzleScene';
import { SokobanScene } from './scenes/SokobanScene';
import { ChaseScene } from './scenes/ChaseScene';
import { RoomScene } from './scenes/RoomScene';
import { FishingScene } from './scenes/FishingScene';
import { HuntScene } from './scenes/HuntScene';
import { NonogramScene } from './scenes/NonogramScene';
import { BrawlScene } from './scenes/BrawlScene';
import { StealthScene } from './scenes/StealthScene';
import { PounceScene } from './scenes/PounceScene';
import { PatrolScene } from './scenes/PatrolScene';
import { RitualScene } from './scenes/RitualScene';
import { ScentTrailScene } from './scenes/ScentTrailScene';
import { HeistScene } from './scenes/HeistScene';
import { CourierRunScene } from './scenes/CourierRunScene';
import { TownMapScene } from './scenes/TownMapScene';
import { DungeonRunScene, getActiveDungeon, isDungeonRun } from './scenes/DungeonRunScene';
import { eventBus } from './utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS, BREED_NAMES, STAT_NAMES, ALL_BREED_IDS, SCENES } from './utils/constants';
import { esc } from './utils/helpers';
import {
  type SaveData,
  createDefaultSave,
  saveGame as rawSaveGame,
  loadGame,
  deleteSave,
  deleteSlot,
  addJournalEntry,
  saveToSlot,
} from './systems/SaveManager';
import { createCat, getBreed, addXp, hasTrait } from './systems/CatManager';
import { earnFish, spendFish, calculateReward, collectStationedEarnings, isCatStationed } from './systems/Economy';
import { getJob, getStatMatchScore, generateDailyJobs, getJobFlavor, type JobDef } from './systems/JobBoard';
import { getPuzzleByDifficulty, generatePuzzle } from './systems/PuzzleGenerator';
import { addBondPoints, processDailyBonds, grantBondRankReward, getBondRank, getBondPairs, getAvailableConversation } from './systems/BondSystem';
import { checkChapterAdvance, checkRatPlagueResolution, checkInquisitionResolution, checkLongWinterStart, checkLongWinterResolution, getLongWinterDay, isLongWinterForcedChoiceDay, isLongWinterRelationalDay, getChapterName, getNextChapterHint } from './systems/ProgressionManager';
import { startBgm, toggleMute, isMuted, switchToPuzzleMusic, switchToFightMusic, switchToNormalMusic, switchToTrackset, pauseMusic, resumeMusic } from './systems/MusicManager';
import { playSfx } from './systems/SfxManager';
import { startDayTimer, stopDayTimer, resetDayTimer, updateTimeDisplay, setOnDayEnd, pauseDayTimer, resumeDayTimer, isPaused } from './systems/DayTimer';
import { startPlaytimeSession, pausePlaytimeSession } from './systems/PlaytimeTracker';
import { initNative, registerAppLifecycle, scheduleDailyReturnNotification, cancelReturnNotification, haptic } from './systems/NativeFeatures';
import { applyReputationShift, getReputationLabel, getReputationRecruitModifier, getReputationBonuses } from './systems/ReputationSystem';
import { getComboMultiplier, updateCombo, getDailyWish, getCurrentFestival, trackEvent } from './systems/GameSystems';
import { calculateDailyUpkeep, calculateOfflineStationedEarnings, calculateStationedDailyIncome } from './systems/GuildMetrics';
import { getGuildFocusLines } from './systems/GuildFocus';
import { showNarrativeOverlay } from './ui/narrativeOverlay';
import { initPanels, showCatPanel, showMenuPanel, showFurnitureShop } from './ui/Panels';
import { initConversations, checkAndShowConversation } from './ui/Conversations';
import { showEndDaySuggestion } from './ui/overlays/EndDaySuggestion';
import { showExileChoice as showExileChoiceOverlay } from './ui/overlays/ExileChoice';
import { showDayTransitionOverlay, showToast as renderToast } from './ui/feedback';
import { showGuildReport, showIntroStory, showTutorial } from './ui/onboarding';
import { initJobFlow, showAssignOverlay, showResultOverlay, type ResultInfo, SPECIALIZATION_CATEGORIES } from './ui/jobFlow';
import { initSessionFlow } from './systems/SessionFlow';

// ──── Game State ────
let gameState: SaveData | null = null;
const catsWorkedToday = new Set<string>();
const jobsCompletedToday = new Set<string>();
let cachedDailyJobs: ReturnType<typeof generateDailyJobs> | null = null;
let cachedJobDay = -1;

export function getGameState(): SaveData | null {
  return gameState;
}

/** Read a numeric flag value (flags store mixed types). */
function numFlag(key: string): number {
  return Number(gameState?.flags[key] ?? 0);
}

// ──── NPC hidden-value glimpses (story-audit-council.md item 2) ────
//
// Five short narrative beats that fire as journal entries + toasts when
// the player crosses chapter-1-to-3 milestones. Each one frames the
// wildcat through someone else's eyes — a townsperson recognizing
// something special about the founder before the institution does.
//
// Gated by a per-glimpse flag so each fires exactly once across the run.
// Called from the post-job-completion handler and from chapter advance.
function triggerHiddenValueGlimpses(save: SaveData, lastJob?: { category?: string }): void {
  if (save.chapter > 3) return;

  // Beat 1: First job ever completed — the miller, in chapter 1.
  if (!save.flags.glimpse_miller && save.totalJobsCompleted === 1) {
    save.flags.glimpse_miller = true;
    addJournalEntry(save, '"I didn\'t think a stray would actually come. Most don\'t." — the miller, after the first job', 'event');
    setTimeout(() => showToast('The miller looked at you twice on the way out.'), 800);
  }

  // Beat 2: 5 jobs done — a monk on the cathedral steps.
  if (!save.flags.glimpse_monk && save.totalJobsCompleted >= 5 && save.chapter <= 2) {
    save.flags.glimpse_monk = true;
    addJournalEntry(save, '"You\'re not just a cat, are you. There\'s something old in your eyes." — a monk on the cathedral steps', 'event');
    setTimeout(() => showToast('A monk caught your eye and held it longer than expected.'), 800);
  }

  // Beat 3: First job in chapter 2 — the merchant.
  if (!save.flags.glimpse_merchant && save.chapter === 2 && save.totalJobsCompleted >= 6) {
    save.flags.glimpse_merchant = true;
    addJournalEntry(save, '"Take this. For the one who\'s building something." — the merchant, slipping an extra fish into the basket', 'event');
    setTimeout(() => showToast('The merchant pressed an extra fish into your paws.'), 800);
  }

  // Beat 4: First pest control during plague — a mother in the market.
  if (!save.flags.glimpse_mother && save.flags.ratPlagueStarted && !save.flags.ratPlagueResolved && lastJob?.category === 'pest_control') {
    save.flags.glimpse_mother = true;
    addJournalEntry(save, '"I was scared of strays. But you came when no one else did. I\'ll tell my son how you saved us." — a mother in the market', 'event');
    setTimeout(() => showToast('A woman caught your tail as you passed and would not let go for a moment.'), 800);
  }

  // Beat 5: Reputation score reaches 10 in chapter 3 — an old woman.
  if (!save.flags.glimpse_old_woman && save.chapter >= 3 && save.reputationScore >= 10) {
    save.flags.glimpse_old_woman = true;
    addJournalEntry(save, '"I knew a guild like yours, once. I was a girl then. They had the same eyes." — an old woman at the market well', 'event');
    setTimeout(() => showToast('An old woman watched you cross the square as if she remembered something.'), 800);
  }
}

// HTML escaping helper now lives in src/utils/helpers.ts so other modules
// (Panels.ts in particular) can import it without circular deps. Re-imported
// here so the existing call sites in this file keep working unchanged.

// ──── Phaser Game ────
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH * DPR,
  height: GAME_HEIGHT * DPR,
  parent: 'game-container',
  backgroundColor: '#1c1b19',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    // Pixel art game — global NEAREST filtering, no antialiasing.
    // Makes per-sprite `texture.setFilter(NEAREST)` calls redundant.
    pixelArt: true,
  },
  input: {
    activePointers: 2,
  },
  scene: [BootScene, TitleScene, GuildhallScene, TownMapScene, PuzzleScene, SokobanScene, ChaseScene, RoomScene, FishingScene, HuntScene, NonogramScene, BrawlScene, StealthScene, PounceScene, PatrolScene, RitualScene, ScentTrailScene, HeistScene, CourierRunScene, DungeonRunScene],
};

const game = new Phaser.Game(config);

// Debug hook for Playwright playtests — exposes the Phaser game instance so
// tests can drive scene transitions and inspect state. Not referenced in
// production code; safe to leave in.
(window as unknown as { __clowderGame: Phaser.Game }).__clowderGame = game;

// ──── Service Worker (web only) ────
// Register the offline cache SW so the web build works offline after
// the first visit (matching the Capacitor APK's offline capability)
// and gives players an "Add to Home Screen" PWA install prompt.
//
// The SW lives at /sw.js (public/sw.js, copied to dist by Vite). It
// pre-caches the app shell on install and uses a network-first strategy
// for HTML + cache-first for static assets so updates land immediately
// while still working offline.
//
// Skipped on Capacitor (the APK already bundles all assets) and skipped
// in Vite dev (where the source files change constantly and a SW would
// serve stale code). Detect dev by the dev server's port; production
// builds at clowderandcrest.com don't have an explicit port in the URL.
{
  const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();
  const isViteDev = window.location.port === '3200';
  if ('serviceWorker' in navigator && !isCapacitor && !isViteDev) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

// ──── Native (Capacitor) ────
// Status bar styling, notification permission warm-up, and lifecycle hooks
// that pause the day timer + music when Android backgrounds the app.
// All entry points are no-ops on web.
initNative().catch(() => {});
cancelReturnNotification().catch(() => {}); // user is back — clear pending reminder
let pausedByLifecycle = false;
registerAppLifecycle({
  onPause: () => {
    // saveGame() commits in-flight playtime via PlaytimeTracker, so this
    // call BOTH persists the save AND folds the current session's elapsed
    // time onto totalPlaytimeMs before we pause.
    if (gameState) saveGame(gameState);
    if (!isPaused()) {
      pausedByLifecycle = true;
      pauseDayTimer();
      pauseMusic();
      pausePlaytimeSession();
    }
  },
  onResume: () => {
    if (pausedByLifecycle) {
      pausedByLifecycle = false;
      resumeDayTimer();
      resumeMusic();
      startPlaytimeSession();
    }
  },
});

// ──── Keyboard shortcuts ────
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pauseBtn && gameState) {
    pauseBtn.click();
  }
});

// ──── Global UI haptic delegate ────
// One delegated click listener that fires haptic.tap() on any button-like
// element across the whole HTML overlay layer. This means every existing
// and future button automatically gets a tap haptic on Android without
// per-handler edits. The native haptic system no-ops on web.
//
// Capture phase + a button-like selector match means it fires before the
// element's own handler so the player feels the tap as soon as the touch
// registers, not after the action completes. Excludes the Phaser canvas
// itself (Phaser scenes manage their own haptics for game beats).
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  // Match anything button-like in the HTML overlay layer
  const btn = t.closest('button, .nav-btn, .menu-btn, .panel-close, .slot-btn, .rename-btn, .recall-btn, .shop-item, .job-card, .cat-card, .room-pick-btn, .exile-btn, [role="button"]');
  if (!btn) return;
  // Don't double-fire if the click is inside a Phaser canvas
  if (t.closest('#game-container canvas')) return;
  haptic.tap();
}, true);

// ──── Auto-save ────
window.addEventListener('beforeunload', () => {
  if (gameState) saveGame(gameState);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gameState) saveGame(gameState);
});
// Periodic auto-save every 60 seconds
setInterval(() => {
  if (gameState) saveGame(gameState);
}, 60000);

// ──── UI References ────
const overlayLayer = document.getElementById('overlay-layer')!;
const statusBar = document.getElementById('status-bar')!;
const bottomBar = document.getElementById('bottom-bar')!;
const panelOverlay = document.getElementById('panel-overlay')!;
const statusFish = document.getElementById('status-fish')!;
const statusDay = document.getElementById('status-day')!;
const statusChapter = document.getElementById('status-chapter')!;

function showToast(message: string): void {
  renderToast(overlayLayer, message);
}

// ──── Pause Button ────
const pauseBtn = document.getElementById('status-pause');
let pauseOverlay: HTMLDivElement | null = null;

if (pauseBtn) {
  pauseBtn.addEventListener('click', () => {
    haptic.tap();
    if (isPaused()) {
      resumeDayTimer();
      resumeMusic();
      startPlaytimeSession();
      pauseBtn.textContent = '||';
      pauseBtn.style.color = '#8b7355';
      if (pauseOverlay) { pauseOverlay.remove(); pauseOverlay = null; }
    } else {
      // Save while the playtime session is still running so the in-flight
      // delta gets committed before we pause the counter.
      if (gameState) saveGame(gameState);
      pauseDayTimer();
      pauseMusic();
      pausePlaytimeSession();
      pauseBtn.textContent = '\u25B6';
      pauseBtn.style.color = '#c4956a';
      // Block all input with a full-screen overlay
      pauseOverlay = document.createElement('div');
      pauseOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9998;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;';
      pauseOverlay.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:32px;margin-bottom:8px">Paused</div>
        <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:14px">Tap anywhere to resume</div>
      `;
      pauseOverlay.addEventListener('click', () => {
        pauseBtn.click(); // trigger unpause
      });
      document.body.appendChild(pauseOverlay);
    }
  });
}

// ──── Floating Guild View UI ────
const guildEndDayBtn = document.createElement('button');
guildEndDayBtn.textContent = 'End Day';
guildEndDayBtn.style.cssText = 'display:none;position:fixed;bottom:70px;left:50%;transform:translateX(-50%);padding:10px 28px;background:#2a2520;border:1px solid #6b5b3e;border-radius:8px;color:#c4956a;font-family:Georgia,serif;font-size:14px;cursor:pointer;z-index:500;';
guildEndDayBtn.addEventListener('click', () => {
  if (!gameState) return;
  playSfx('day_bell', 0.4);
  haptic.medium(); // day-end is a meaningful beat — heavier than a UI tap
  const result = advanceDay();
  showDayTransitionOverlay(gameState.day, () => {}, gameState, result);
  saveGame(gameState);
  updateStatusBar();
  switchScene('GuildhallScene');
});
document.body.appendChild(guildEndDayBtn);

// Floating wish banner for guild view
const guildWishBanner = document.createElement('div');
guildWishBanner.style.cssText = 'display:none;position:fixed;top:38px;left:50%;transform:translateX(-50%);width:340px;padding:8px 12px;background:rgba(42,37,32,0.95);border:1px solid #6b5b3e;border-radius:8px;z-index:500;font-family:Georgia,serif;';
document.body.appendChild(guildWishBanner);

function updateGuildWishBanner(): void {
  if (!gameState) { guildWishBanner.style.display = 'none'; return; }
  const wish = getDailyWish(gameState.day, gameState.cats, gameState.furniture.map(f => f.furnitureId));
  if (!wish || gameState.flags[`wish_day_${gameState.day}`]) {
    guildWishBanner.style.display = 'none';
    return;
  }
  guildWishBanner.style.display = 'block';
  const needsFurn = wish.requiresFurniture;
  const FURN_NAMES: Record<string, string> = { straw_bed: 'Straw Bed', fish_barrel: 'Fish Barrel', scratching_post: 'Scratching Post', potted_catnip: 'Potted Catnip' };

  // Check if the cat is in a room with the required furniture
  let roomMismatch = false;
  if (!needsFurn) {
    const wishCat = gameState.cats.find((c) => c.id === wish.catId);
    const catRoom = wishCat?.assignedRoom ?? 'sleeping';
    const furnInRoom = gameState.furniture.filter((f) => f.room === catRoom).map((f) => f.furnitureId);
    // Check if the wish's furniture (from the wish type) is in the cat's room
    const wishFurnMap: Record<string, string> = {
      'wants a fish treat': 'fish_barrel',
      'wants to scratch something': 'scratching_post',
      'wants to nap in a warm spot': 'straw_bed',
      'wants to play with a friend': 'potted_catnip',
    };
    const requiredInRoom = wishFurnMap[wish.wish];
    if (requiredInRoom && !furnInRoom.includes(requiredInRoom)) {
      roomMismatch = true;
    }
  }

  let actionHtml: string;
  if (needsFurn) {
    actionHtml = `<span style="font-size:10px;color:#8b5b3e;white-space:nowrap">Needs: ${FURN_NAMES[needsFurn] ?? needsFurn}</span>`;
  } else if (roomMismatch) {
    const wishCat = gameState.cats.find((c) => c.id === wish.catId);
    actionHtml = `<span style="font-size:9px;color:#8b5b3e;white-space:nowrap">Move ${esc(wishCat?.name ?? 'cat')} to the right room</span>`;
  } else {
    actionHtml = `<button id="guild-fulfill-wish" style="padding:4px 10px;background:#2a2520;border:1px solid #dda055;border-radius:4px;color:#dda055;font-size:11px;font-family:Georgia,serif;cursor:pointer;white-space:nowrap">5 fish</button>`;
  }

  guildWishBanner.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="color:#dda055;font-size:12px">\u{1F4AD} ${esc(wish.catName)}'s Wish</div>
        <div style="color:#8b7355;font-size:10px;margin-top:2px">"${wish.wish}"</div>
      </div>
      ${actionHtml}
    </div>
  `;
  document.getElementById('guild-fulfill-wish')?.addEventListener('click', () => {
    if (!gameState || gameState.fish < 5) { showToast('Not enough fish!'); return; }
    gameState.flags[`wish_day_${gameState.day}`] = true;
    gameState.fish -= 5;
    const cat = gameState.cats.find((c) => c.id === wish.catId);
    if (cat) {
      if (wish.reward.includes('mood')) {
        cat.mood = 'happy';
      }
      if (wish.reward.includes('bond')) {
        for (const other of gameState.cats) {
          if (other.id !== cat.id) addBondPoints(gameState, cat.breed, other.breed, 2);
        }
      }
    }
    saveGame(gameState);
    updateStatusBar();
    showToast(`${esc(wish.catName)} is delighted! ${wish.reward}`);
    guildWishBanner.style.display = 'none';
  });
}

// ──── UI Helpers ────
let lastFishCount = -1;
function updateStatusBar(): void {
  if (!gameState) return;
  const prevFish = lastFishCount;
  lastFishCount = gameState.fish;
  statusFish.textContent = `${gameState.fish} Fish`;
  statusDay.textContent = `Day ${gameState.day}`;
  statusChapter.textContent = `Ch. ${gameState.chapter}`;

  // Animate fish count on change
  if (prevFish >= 0 && prevFish !== gameState.fish) {
    const gained = gameState.fish > prevFish;
    statusFish.style.color = gained ? '#4a8a4a' : '#aa4444';
    statusFish.style.transform = 'scale(1.3)';
    statusFish.style.transition = 'transform 0.15s ease-out';
    setTimeout(() => {
      statusFish.style.transform = 'scale(1)';
      statusFish.style.transition = 'transform 0.3s ease-in, color 0.5s';
    }, 150);
    setTimeout(() => { statusFish.style.color = ''; }, 800);
  }
}

function setActiveTab(scene: string): void {
  bottomBar.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-scene') === scene);
  });
}

function switchScene(target: string, data?: object): void {
  const sceneKeys = Object.values(SCENES);
  for (const key of sceneKeys) {
    if (game.scene.isActive(key) || game.scene.isPaused(key)) {
      game.scene.stop(key);
    }
  }
  // Clean up any orphaned scene overlays (tutorials, pause screens) but
  // SPARE the day-transition overlay so the End Day flow can show it.
  document.querySelectorAll('[style*="z-index: 9999"], [style*="z-index:9999"]').forEach((el) => {
    if (!el.classList.contains('day-transition-overlay')) el.remove();
  });
  game.scene.start(target, data);
  // Show floating guild UI only on guild overview
  guildEndDayBtn.style.display = target === 'GuildhallScene' ? 'block' : 'none';
  if (target === 'GuildhallScene') {
    updateGuildWishBanner();
  } else {
    guildWishBanner.style.display = 'none';
  }
}

// ──── Day Timer Callback ────
setOnDayEnd(() => {
  if (!gameState) return;
  const recap = advanceDay();
  showDayTransitionOverlay(gameState.day, () => playSfx('day_bell', 0.4), gameState, recap);
  const townOverlay = overlayLayer.querySelector('.town-overlay');
  if (townOverlay) {
    townOverlay.remove();
    eventBus.emit('show-town-overlay');
  }
});

// ──── Event Handlers ────

// Hide/show UI
eventBus.on('navigate', (target: string) => {
  // Clean up any stale overlays before navigating
  overlayLayer.querySelectorAll('.assign-overlay, .result-overlay, .conversation-overlay').forEach((el) => el.remove());
  switchScene(target);
});

eventBus.on('hide-ui', () => {
  statusBar.style.display = 'none';
  bottomBar.style.display = 'none';
  stopDayTimer();
});

eventBus.on('show-ui', () => {
  statusBar.style.display = 'flex';
  bottomBar.style.display = 'flex';
  updateStatusBar();
});

eventBus.on('set-active-tab', setActiveTab);

eventBus.on('close-town-overlay', () => {
  overlayLayer.querySelectorAll('.town-overlay').forEach((el) => el.remove());
});

eventBus.on('show-furniture-shop', () => {
  showFurnitureShop();
});

eventBus.on('fish-changed', () => {
  updateStatusBar();
});

// Bottom bar navigation
bottomBar.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.nav-btn') as HTMLElement;
  if (!btn || !gameState) return;
  playSfx('tap', 0.3);
  haptic.tap();

  const scene = btn.dataset.scene;
  // Close any open panels
  panelOverlay.classList.add('hidden');
  panelOverlay.innerHTML = '';

  // Remove any custom overlays
  overlayLayer.querySelectorAll('.assign-overlay, .conversation-overlay, .result-overlay, .menu-overlay, .town-overlay').forEach((el) => el.remove());

  switch (scene) {
    case 'guildhall':
      switchScene('GuildhallScene');
      break;
    case 'town':
      switchScene('TownMapScene');
      break;
    case 'cats':
      showCatPanel();
      break;
    case 'menu':
      showMenuPanel();
      break;
  }
});

const sessionFlow = initSessionFlow({
  overlayLayer,
  getGameState: () => gameState,
  setGameState: (save) => { gameState = save; },
  createDefaultSave,
  rawSaveGame,
  saveToSlot,
  deleteSave,
  deleteSlot,
  switchScene,
  playIntroStory: (catName, onComplete) => showIntroStory(catName, onComplete, { playSfx }),
  showTutorial,
  showGuildReport,
  showToast,
  updateStatusBar,
  startBgm,
  startDayTimer,
  clearTransientState: () => {
    acceptedJob = null;
    catsWorkedToday.clear();
    jobsCompletedToday.clear();
    cachedDailyJobs = null;
  },
  getOfflineStationedEarnings: calculateOfflineStationedEarnings,
  getDailyUpkeep: calculateDailyUpkeep,
});
const saveGame = sessionFlow.saveGame;
initPanels({
  getGameState: () => gameState,
  setGameState: (s) => { gameState = s; },
  overlayLayer,
  saveGame,
  showToast,
  updateStatusBar,
  switchScene,
  stopDayTimer,
  guildEndDayBtn,
  guildWishBanner,
  clearCurrentSave: sessionFlow.clearCurrentSave,
});
initConversations({
  getGameState: () => gameState,
  overlayLayer,
  saveGame,
  showToast,
  switchScene,
  suggestEndDay,
});
initJobFlow({
  overlayLayer,
  getGameState: () => gameState,
  saveGame,
  showToast,
  switchScene,
  refreshTownOverlay: () => eventBus.emit('show-town-overlay'),
  pauseDayTimer,
  switchToFightMusic,
  switchToPuzzleMusic,
  switchToNormalMusic,
  switchToTrackset,
  playSfx,
  trackEvent,
  addJournalEntry,
  onAfterResult: () => checkAndShowConversation(),
  onSpecializationChosen: () => checkAndShowConversation(),
  catsWorkedToday,
});

// Room unlock
eventBus.on('unlock-room', (roomId: string) => {
  if (!gameState) return;
  const room = gameState.rooms.find((r) => r.id === roomId);
  if (!room || room.unlocked) return;

  const costs: Record<string, number> = { kitchen: 50, operations: 100 };
  const cost = costs[roomId] ?? 0;

  if (spendFish(gameState, cost)) {
    room.unlocked = true;
    saveGame(gameState);
    playSfx('room_unlock');
    showToast(`${roomId.charAt(0).toUpperCase() + roomId.slice(1)} unlocked!`);
    switchScene('GuildhallScene');
  } else {
    showToast('Not enough fish!');
  }
});

// Recruit cat — show naming prompt, then finalize
eventBus.on('recruit-cat', (breedId: string) => {
  if (!gameState) return;
  const breed = getBreed(breedId);
  if (!breed) return;

  const repMod = getReputationRecruitModifier(gameState.reputationScore);
  const adjustedCost = Math.floor(breed.recruitCost * repMod);

  showRecruitNamePrompt(breedId, breed.name, adjustedCost);
});

function showRecruitNamePrompt(breedId: string, breedName: string, cost: number): void {
  // Remove any stale name prompts first. Without this, a second prompt stacks
  // on top of an older one but document.getElementById(...) returns the older
  // (first) element, so new button clicks attach listeners to the wrong DOM
  // node and the visible buttons silently do nothing.
  document.querySelectorAll('.name-prompt-overlay').forEach((el) => el.remove());

  const prompt = document.createElement('div');
  prompt.className = 'name-prompt-overlay';
  const color = BREED_COLORS[breedId] ?? '#8b7355';
  const spriteExists = (ALL_BREED_IDS as readonly string[]).includes(breedId);
  const avatarHtml = spriteExists
    ? `<img src="assets/sprites/${breedId}/south.png" style="width:64px;height:64px;image-rendering:pixelated;border-radius:50%;background:${color};border:2px solid #6b5b3e;margin-bottom:16px" />`
    : `<div style="width:60px;height:60px;border-radius:50%;background:${color};border:2px solid #6b5b3e;margin-bottom:16px"></div>`;
  prompt.innerHTML = `
    ${avatarHtml}
    <h2>A ${breedName} appears</h2>
    <p>A stray ${breedName} wants to join the guild. What will you call them?</p>
    <div style="color:#8b7355;font-size:11px;margin-bottom:8px">Cost: ${cost} fish (you have ${gameState?.fish ?? 0})</div>
    <input type="text" class="recruit-name-input" placeholder="${breedName}" maxlength="20" autocomplete="off" />
    <div style="display:flex;gap:8px;margin-top:8px;justify-content:center">
      <button class="recruit-name-submit" style="flex:1">Welcome (${cost} fish)</button>
      <button class="recruit-deny" style="flex:1;background:#2a2520;border:1px solid #3a3530;color:#6b5b3e">Turn away</button>
    </div>
  `;
  overlayLayer.appendChild(prompt);

  // Scope lookups to the new prompt element so we never accidentally grab an
  // older, stale DOM node if the remove() above didn't fire (e.g. on a redraw).
  const input = prompt.querySelector<HTMLInputElement>('.recruit-name-input')!;
  const submit = prompt.querySelector<HTMLButtonElement>('.recruit-name-submit')!;
  const deny = prompt.querySelector<HTMLButtonElement>('.recruit-deny')!;
  input.focus();

  deny.addEventListener('click', () => {
    prompt.remove();
    showToast(`The stray ${breedName} wanders off...`);
  });

  const doSubmit = () => {
    if (!gameState || !spendFish(gameState, cost)) {
      showToast('Not enough fish!');
      return;
    }
    const name = input.value.trim() || breedName;
    prompt.remove();

    const cat = createCat(breedId, name);
    gameState!.cats.push(cat);
    saveGame(gameState!);

    playSfx('recruit');
    trackEvent('cat_recruited', { breed: breedId, totalCats: gameState!.cats.length });
    addJournalEntry(gameState!, `${name} the ${breedName} joined the guild.`, 'recruit');
    showToast(`${name} the ${breedName} joined the guild!`);
    checkChapterAdvance(gameState!);
    saveGame(gameState!);
    switchScene('TownMapScene');
  };

  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSubmit();
  });
}

// Town overlay (HTML)
eventBus.on('show-town-overlay', () => {
  if (!gameState) return;

  // Remove any existing town overlay
  overlayLayer.querySelectorAll('.town-overlay').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'town-overlay';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'panel-close';
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.appendChild(closeBtn);

  // Cache daily jobs per day, filter out completed ones
  if (!cachedDailyJobs || cachedJobDay !== gameState.day) {
    cachedDailyJobs = generateDailyJobs(gameState);
    cachedJobDay = gameState.day;
  }
  const dailyJobs = cachedDailyJobs.filter((j) => !jobsCompletedToday.has(j.id));

  const plagueActive = gameState.flags.ratPlagueStarted && !gameState.flags.ratPlagueResolved;
  const winterActive = !!gameState.flags.longWinterStarted && !gameState.flags.longWinterResolved;
  const winterDay = winterActive ? getLongWinterDay(gameState) : 0;

  // Calculate daily budget summary
  const catUpkeep = gameState.cats.reduce((sum, c) => sum + 2 + Math.max(0, c.level - 1), 0);
  const roomUpkeep = gameState.rooms.filter(r => r.unlocked).length;
  const chapterCost = Math.max(0, gameState.chapter - 1) * 2;
  const totalUpkeep = calculateDailyUpkeep(gameState);
  const stationedIncome = calculateStationedDailyIncome(gameState);
  const netDaily = stationedIncome - totalUpkeep;
  const netColor = netDaily >= 0 ? '#4a8a4a' : '#cc6666';
  const focusHtml = getGuildFocusLines(gameState).map((line) =>
    `<div style="font-size:10px;color:${line.color};margin-top:4px">${line.text}</div>`
  ).join('');

  let html = `
    <div class="town-header">
      <div class="town-title">Town Square</div>
      <div class="town-day">Day ${gameState.day}</div>
    </div>
    <div style="display:flex;justify-content:space-between;padding:4px 12px;font-size:10px;font-family:Georgia,serif;color:#6b5b3e;background:rgba(42,37,32,0.4);margin:0 12px 8px;border-radius:4px">
      <span>Upkeep: -${totalUpkeep}/day</span>
      <span>Stationed: +${stationedIncome}/day</span>
      <span style="color:${netColor};font-weight:bold">Net: ${netDaily >= 0 ? '+' : ''}${netDaily}/day</span>
    </div>
    ${focusHtml ? `<div style="padding:8px 12px;margin:0 12px 8px;border-radius:4px;background:rgba(24,22,19,0.55);border:1px solid #3a3530">
      <div style="color:#c4956a;font-size:11px;font-family:Georgia,serif">Guild Focus</div>
      ${focusHtml}
    </div>` : ''}
    ${(() => {
      const rep = gameState.reputationScore;
      if (rep >= 30) return '<div style="padding:2px 12px;font-size:10px;color:#4a8a4a;text-align:center;font-family:Georgia,serif;font-style:italic">The townsfolk smile as your cats pass. Children wave from doorways.</div>';
      if (rep >= 10) return '<div style="padding:2px 12px;font-size:10px;color:#6b8ea6;text-align:center;font-family:Georgia,serif;font-style:italic">The town respects your guild. Merchants nod in greeting.</div>';
      if (rep > -10) return '';
      if (rep > -30) return '<div style="padding:2px 12px;font-size:10px;color:#8a6a4a;text-align:center;font-family:Georgia,serif;font-style:italic">People eye your cats warily. Some whisper behind closed shutters.</div>';
      return '<div style="padding:2px 12px;font-size:10px;color:#8a4a4a;text-align:center;font-family:Georgia,serif;font-style:italic">Doors lock as your cats approach. The town fears what your guild has become.</div>';
    })()}
    ${plagueActive ? (() => {
      const progress = Math.min(5, numFlag("plaguePestDone"));
      const plagueDays = gameState.day - (numFlag("plagueDayStarted") || gameState.day);
      return `<div style="background:#4a2020;color:#cc6666;padding:10px 12px;margin:0 12px 8px;border-radius:4px;font-size:12px;text-align:center;font-family:Georgia,serif;border:1px solid #6a3030">
        <strong>\u{1F400} THE RAT PLAGUE — Day ${plagueDays + 1}</strong><br>
        <div style="margin:6px 0;font-size:11px">Rat nests cleared: ${progress}/5</div>
        <div style="background:#2a1010;border-radius:3px;height:8px;margin:4px 0;overflow:hidden">
          <div style="background:#cc6666;height:100%;width:${progress * 20}%;transition:width 0.3s"></div>
        </div>
        <div style="font-size:10px;color:#aa5555;margin-top:4px">Each day the plague persists, upkeep rises and cats may fall ill.</div>
      </div>`;
    })() : ''}
    ${winterActive ? `<div style="background:#1f2a3a;color:#a8c0d8;padding:10px 12px;margin:0 12px 8px;border-radius:4px;font-size:12px;text-align:center;font-family:Georgia,serif;border:1px solid #2f4258">
      <strong>\u2744 THE LONG WINTER — Day ${winterDay}/5</strong><br>
      <div style="margin:6px 0;font-size:11px">The town is shut down. The job board is closed until the storm passes.</div>
      <div style="background:#0e1620;border-radius:3px;height:8px;margin:4px 0;overflow:hidden">
        <div style="background:#a8c0d8;height:100%;width:${winterDay * 20}%;transition:width 0.3s"></div>
      </div>
      <div style="font-size:10px;color:#7d96b3;margin-top:4px">Upkeep is doubled. Cats are tested. The guild has only itself.</div>
    </div>` : ''}
    <div class="town-section-divider"></div>
    <div class="town-section-title">Job Board</div>
    ${gameState.totalJobsCompleted < 3 ? '<div style="padding:0 12px 8px;font-size:11px;color:#6b5b3e;font-family:Georgia,serif">Accept a job and assign one of your cats to complete it. Solve puzzles to earn fish.</div>' : ''}
    ${(() => {
      const festival = getCurrentFestival(gameState.day);
      return festival ? `<div style="background:#3a3520;color:#dda055;padding:8px 12px;margin:0 0 8px;border-radius:4px;font-size:12px;text-align:center;font-family:Georgia,serif;border:1px solid #6b5b3e">\u{1F389} <strong>${festival.name}</strong><br>${festival.bonus}</div>` : '';
    })()}
  `;

  // Job cards
  const jobArtMap: Record<string, string> = {
    mill: 'mill', granary: 'mill', bakery: 'mill', tavern: 'tavern',
    cathedral: 'cathedral', warehouse: 'ship', ship: 'ship', docks: 'docks', castle: 'castle',
    market: 'market', garden: 'monastery', monastery: 'monastery', tower: 'monastery',
    manor: 'castle', night: 'night',
  };

  if (winterActive) {
    html += `<div style="padding:24px 12px;text-align:center;font-family:Georgia,serif;color:#7d96b3;font-style:italic">
      The job board is empty. The storm has the town in its grip.<br>
      Wait it out. End the day to advance the winter.
    </div>`;
  }

  if (!winterActive) dailyJobs.forEach((job) => {
    const diffClass = `diff-${job.difficulty}`;
    const categoryIcons: Record<string, string> = {
      pest_control: '\u{1F400}', courier: '\u{1F4DC}', guard: '\u{1F6E1}', sacred: '\u{1F54A}', detection: '\u{1F50D}', shadow: '\u{1F5E1}',
    };
    const catIcon = categoryIcons[job.category] ?? '\u{1F43E}';
    const artFile = jobArtMap[job.puzzleSkin] ?? '';
    const artImg = artFile ? `<img src="assets/sprites/jobs/${artFile}.png" style="width:48px;height:48px;image-rendering:pixelated;border-radius:4px;margin-right:8px;flex-shrink:0" />` : '';
    const isContested = job.contested;
    html += `
      <div class="town-job-card" style="display:flex;gap:8px;align-items:center;${isContested ? 'border-left:3px solid #cc6666' : ''}">
        ${artImg}
        <div style="flex:1">
        <div class="town-job-top">
          <span class="town-job-icon">${catIcon}</span>
          <span class="town-job-name">${job.name}</span>
          ${isContested ? '<span style="font-size:9px;color:#cc6666;margin-left:4px">\u2694 CONTESTED</span>' : ''}
          ${plagueActive && job.category === 'pest_control' ? '<span style="font-size:9px;color:#cc8844;margin-left:4px">\u{1F400} PLAGUE</span>' : ''}
          <span class="town-job-diff ${diffClass}">${job.difficulty}</span>
        </div>
        <div class="town-job-desc">${getJobFlavor(job.id, job.category, gameState!.day) || job.description}</div>
        <div class="town-job-bottom">
          <span class="town-job-reward">${job.baseReward}-${job.maxReward} Fish</span>
          <span class="town-job-stats">${job.keyStats.join(', ')}</span>
          <button class="town-job-accept" data-job-id="${job.id}">Accept</button>
        </div>
        </div>
      </div>
    `;
  });

  // Stationed cats
  if (gameState.stationedCats.length > 0) {
    html += `<div class="town-section-divider stationed"></div>`;
    html += `<div class="town-section-title stationed">Stationed Cats</div>`;

    for (const stationed of gameState.stationedCats) {
      const cat = gameState.cats.find((c) => c.id === stationed.catId);
      const job = getJob(stationed.jobId);
      if (!cat || !job) continue;

      const match = getStatMatchScore(cat, job);
      const dailyEarn = Math.max(1, Math.floor(job.baseReward * 0.5 + job.baseReward * match * 0.5));
      const daysWorked = gameState.day - stationed.dayStarted;
      const color = BREED_COLORS[cat.breed] ?? '#8b7355';

      html += `
        <div class="town-stationed-card">
          <div class="town-stationed-avatar" style="background:${color}"></div>
          <div class="town-stationed-info">
            <div class="town-stationed-name">${esc(cat.name)} — ${job.name}</div>
            <div class="town-stationed-detail">~${dailyEarn} fish/day | ${daysWorked} day${daysWorked !== 1 ? 's' : ''} worked</div>
          </div>
        </div>
      `;
    }
  }

  // Recruit hint — cats are found walking around the town map
  const ownedBreeds = new Set(gameState.cats.map((c) => c.breed));
  const hasStrays = gameState.cats.length < 6 && ownedBreeds.size < 6;
  if (hasStrays) {
    html += `<div class="town-section-divider"></div>`;
    html += `<div style="padding:8px 12px;font-size:11px;color:#6b5b3e;font-family:Georgia,serif;font-style:italic;text-align:center">Stray cats wander the town streets. Walk up to one to talk.</div>`;
  }

  // Cat availability indicator
  html += `<div class="town-section-divider"></div>`;
  html += `<div style="padding:0 12px 8px"><div style="color:#c4956a;font-size:14px;margin-bottom:6px;font-family:Georgia,serif">Your Cats</div>`;
  html += `<div style="display:flex;flex-wrap:wrap;gap:6px">`;
  for (const cat of gameState.cats) {
    const stationed = isCatStationed(gameState, cat.id);
    const worked = catsWorkedToday.has(cat.id);
    const available = !stationed && !worked;
    const statusColor = available ? '#4a8a4a' : stationed ? '#6b8ea6' : '#8a6a4a';
    const statusText = stationed ? 'stationed' : worked ? 'worked' : 'available';
    const breedName = BREED_NAMES[cat.breed] ?? cat.breed;
    const canRest = available && cat.mood !== 'happy';
    html += `<div style="background:rgba(42,37,32,0.6);padding:4px 8px;border-radius:4px;font-size:11px;font-family:Georgia,serif;border-left:3px solid ${statusColor};display:flex;align-items:center;gap:6px">
      <span style="color:#c4956a">${esc(cat.name)}</span>
      <span style="color:${statusColor};font-size:9px">${statusText}</span>
      ${canRest ? `<button class="rest-cat-btn" data-cat-id="${cat.id}" style="font-size:9px;padding:1px 6px;background:#2a3530;border:1px solid #4a6a4a;color:#4a8a4a;border-radius:3px;cursor:pointer;margin-left:auto">Rest</button>` : ''}
    </div>`;
  }
  html += `</div></div>`;

  // Daily costs summary (must match advanceDay calculation)
  const unlockedRoomCount = gameState.rooms.filter((r) => r.unlocked).length;
  const chapterUpkeep = Math.max(0, gameState.chapter - 1) * 2;
  const catFoodDisplay = gameState.cats.reduce((sum, c) => sum + 2 + Math.max(0, c.level - 1), 0);
  const dailyCost = catFoodDisplay + unlockedRoomCount + chapterUpkeep;
  const canAffordUpkeep = gameState.fish >= dailyCost;
  html += `<div style="padding:4px 12px 8px;font-size:11px;color:${canAffordUpkeep ? '#8b7355' : '#cc6666'};font-family:Georgia,serif">
    Daily upkeep: ${dailyCost} fish (cats: ${catFoodDisplay} + rooms: ${unlockedRoomCount}${chapterUpkeep > 0 ? ` + guild: ${chapterUpkeep}` : ''}) | Fish: ${gameState.fish}
    ${!canAffordUpkeep ? '<br><strong>Warning: Cannot afford upkeep! A cat may leave the guild.</strong>' : ''}
  </div>`;

  // Traveling merchant (appears every 3rd day, chapter 2+)
  if (gameState.chapter >= 2 && gameState.day % 3 === 0) {
    const merchantItems = [
      { name: 'Catnip Elixir', cost: 25, effect: 'All cats mood +1 tier', id: 'elixir' },
      { name: 'Lucky Fishbone', cost: 15, effect: '+20% reward on next job', id: 'fishbone' },
      { name: 'Training Scroll', cost: 30, effect: '+1 to a random stat for one cat', id: 'scroll' },
      { name: 'Saint\'s Blessing', cost: 40, effect: 'Prevents next mood drop', id: 'blessing' },
    ];
    // Pick 2 random items
    const shuffledItems = merchantItems.sort(() => Math.random() - 0.5).slice(0, 2);

    html += `<div class="town-section-divider"></div>`;
    html += `<div class="town-section-title">\u{1F9D9} Traveling Merchant</div>`;
    html += `<div style="padding:0 12px 8px;font-size:11px;color:#6b5b3e;font-family:Georgia,serif">A wandering merchant passes through town today.</div>`;
    shuffledItems.forEach((item) => {
      const canBuy = gameState!.fish >= item.cost;
      html += `<div class="town-job-card" style="padding:8px 12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="color:#c4956a;font-size:13px">${item.name}</div>
            <div style="color:#6b5b3e;font-size:11px">${item.effect}</div>
          </div>
          <button class="town-job-accept merchant-buy ${canBuy ? '' : 'disabled'}" data-merchant-id="${item.id}" ${canBuy ? '' : 'disabled'}>${item.cost} Fish</button>
        </div>
      </div>`;
    });
  }

  // End Day button
  html += `
    <div class="town-section-divider"></div>
    <button class="town-end-day" id="town-end-day">End Day</button>
    <div class="town-end-day-hint">Advance to the next day. Stationed cats collect earnings.</div>
  `;

  overlay.innerHTML = html;
  overlayLayer.appendChild(overlay);

  // Play merchant sound if merchant is present
  if (gameState.chapter >= 2 && gameState.day % 3 === 0) {
    playSfx('merchant', 0.3);
  }

  // Wire up job accept buttons
  overlay.querySelectorAll('.town-job-accept').forEach((btn) => {
    btn.addEventListener('click', () => {
      const jobId = btn.getAttribute('data-job-id')!;
      const job = dailyJobs.find((j) => j.id === jobId);
      if (job) {
        // Don't remove town overlay — layer assign overlay on top
        eventBus.emit('job-accept', { job });
      }
    });
  });

  // Wire up recruit buttons
  // Wire up rest buttons
  overlay.querySelectorAll('.rest-cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catId = btn.getAttribute('data-cat-id')!;
      const cat = gameState!.cats.find((c) => c.id === catId);
      if (!cat) return;
      catsWorkedToday.add(cat.id); // Uses the cat for the day
      // Boost mood by 2 tiers
      if (cat.mood === 'unhappy') cat.mood = 'content';
      else if (cat.mood === 'tired') cat.mood = 'happy';
      else if (cat.mood === 'content') cat.mood = 'happy';
      playSfx('purr');
      showToast(`${esc(cat.name)} spent the day resting. Mood: ${cat.mood}`);
      saveGame(gameState!);
      overlay.remove();
      eventBus.emit('show-town-overlay');
    });
  });

  // Wire up merchant buy buttons
  overlay.querySelectorAll('.merchant-buy:not(.disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.getAttribute('data-merchant-id')!;
      const costs: Record<string, number> = { elixir: 25, fishbone: 15, scroll: 30, blessing: 40 };
      const cost = costs[itemId] ?? 20;
      if (!spendFish(gameState!, cost)) return;
      playSfx('fish_earn');

      if (itemId === 'elixir') {
        for (const cat of gameState!.cats) {
          if (cat.mood === 'unhappy') cat.mood = 'tired';
          else if (cat.mood === 'tired') cat.mood = 'content';
          else if (cat.mood === 'content') cat.mood = 'happy';
        }
        showToast('All cats feel refreshed!');
      } else if (itemId === 'fishbone') {
        // Store bonus flag — next job reward gets +20%
        gameState!.flags.luckyFishbone = true;
        showToast('Lucky Fishbone acquired! Next job pays +20%.');
      } else if (itemId === 'scroll') {
        const cat = gameState!.cats[Math.floor(Math.random() * gameState!.cats.length)];
        const stats = ['hunting', 'stealth', 'intelligence', 'endurance', 'charm', 'senses'] as const;
        const stat = stats[Math.floor(Math.random() * stats.length)];
        cat.stats[stat] = Math.min(10, cat.stats[stat] + 1);
        showToast(`${esc(cat.name)}'s ${stat} increased to ${cat.stats[stat]}!`);
      } else if (itemId === 'blessing') {
        gameState!.flags.saintBlessing = true;
        showToast('Saint\'s Blessing protects your cats from the next mood drop.');
      }

      saveGame(gameState!);
      updateStatusBar();
      overlay.remove();
      eventBus.emit('show-town-overlay');
    });
  });

  // Wire up end day button
  document.getElementById('town-end-day')!.addEventListener('click', () => {
    overlay.remove();
    const recap = advanceDay();
    showDayTransitionOverlay(gameState!.day, () => playSfx('day_bell', 0.4), gameState, recap);
    checkAndShowConversation();
  });
});

// Job accept — show cat assignment overlay
let acceptedJob: JobDef | null = null;
export function getAcceptedJob(): JobDef | null { return acceptedJob; }

eventBus.on('job-accept', ({ job }: { job: JobDef }) => {
  playSfx('job_accept');
  if (!gameState) return;

  // Store the accepted job and close the overlay — player must go to a location to start it
  acceptedJob = job;
  overlayLayer.querySelectorAll('.town-overlay').forEach((el) => el.remove());
  showToast(`Accepted: ${job.name}. Go to a location in town to start the job.`);
});

// When player enters any building with an accepted job, start the assignment
eventBus.on('start-accepted-job', () => {
  if (!acceptedJob || !gameState) return;
  const job = acceptedJob;
  acceptedJob = null;
  showAssignOverlay(job);
});


// Puzzle complete
eventBus.on('puzzle-complete', ({ puzzleId, moves, minMoves, stars, jobId, catId, bonusFish }: any) => {
  switchToNormalMusic();
  resumeDayTimer();
  if (!gameState) return;

  // Dungeon run: floor cleared — return to dungeon transition
  if (isDungeonRun()) {
    const dungeon = getActiveDungeon()!;
    dungeon.floorsCleared++;
    playSfx('sparkle', 0.5);
    showToast(`Floor ${dungeon.floor} cleared! HP: ${dungeon.hp}/${dungeon.maxHp}`);
    switchScene('DungeonRunScene');
    return;
  }

  const job = getJob(jobId);
  const cat = gameState.cats.find((c) => c.id === catId);
  if (!job || !cat) {
    switchScene('GuildhallScene');
    return;
  }

  let baseReward = calculateReward(job.baseReward, job.maxReward, stars);
  const rewardHighlights: string[] = [];

  // Lucky Fishbone bonus
  if (gameState.flags.luckyFishbone) {
    baseReward = Math.floor(baseReward * 1.2);
    delete gameState.flags.luckyFishbone;
    showToast('Lucky Fishbone activated! +20% reward.');
    rewardHighlights.push('Lucky Fishbone triggered: +20% reward.');
  }

  // Festival bonus
  const festival = getCurrentFestival(gameState.day);
  if (festival && (festival.category === 'all' || festival.category === job.category)) {
    baseReward = Math.floor(baseReward * festival.multiplier);
    rewardHighlights.push(`${festival.name} boosted this payout.`);
  }

  // Reputation reward bonus
  const repBonuses = getReputationBonuses(gameState.reputationScore);
  if (repBonuses.rewardBonus !== 0) {
    baseReward = Math.floor(baseReward * (1 + repBonuses.rewardBonus));
    rewardHighlights.push(`Reputation bonus applied: +${Math.round(repBonuses.rewardBonus * 100)}% fish.`);
  }

  // Bishop's Blessing: +5% all rewards
  if (gameState.flags.bishopBlessing) {
    baseReward = Math.floor(baseReward * 1.05);
    rewardHighlights.push('Bishop blessing added +5% reward.');
  }

  // Underground Contact: shadow jobs pay +15% more
  if (gameState.flags.undergroundContact && job.category === 'shadow') {
    baseReward = Math.floor(baseReward * 1.15);
    rewardHighlights.push('Underground contact paid extra for shadow work.');
  }

  // Job combo multiplier
  const comboMult = getComboMultiplier(cat.id, job.category, gameState.day);
  if (comboMult > 1) {
    baseReward = Math.floor(baseReward * comboMult);
    rewardHighlights.push(`${esc(cat.name)} extended a ${job.category} streak to x${comboMult.toFixed(2)} reward.`);
  }
  const comboCount = updateCombo(cat.id, job.category, gameState.day);
  if (comboCount >= 3) {
    showToast(`${esc(cat.name)} is on a ${comboCount}-day ${job.category} streak! x${(1 + Math.min(comboCount, 5) * 0.05).toFixed(2)} reward`);
    playSfx('purr');
  }

  // Bond teamwork bonus — interlocking systems per the Great Guild Management
  // Games analysis. If this cat has a bonded-rank partner who also worked
  // today, they inspire each other: +10% reward. Companion-rank pair: +5%.
  // This makes bonds feed back into the economy, so investing in
  // relationships pays off in fish, not just flavor.
  let teamworkBonus = 0;
  let teamworkPartner: string | null = null;
  for (const otherCatId of catsWorkedToday) {
    if (otherCatId === cat.id) continue;
    const other = gameState.cats.find((c) => c.id === otherCatId);
    if (!other) continue;
    const bond = gameState.bonds.find((b) => {
      const k = [b.catA, b.catB].sort().join('_');
      return k === [cat.breed, other.breed].sort().join('_');
    });
    if (!bond) continue;
    const rank = getBondRank(bond.points);
    if (rank === 'bonded' && teamworkBonus < 0.1) {
      teamworkBonus = 0.1;
      teamworkPartner = other.name;
    } else if (rank === 'companion' && teamworkBonus < 0.05) {
      teamworkBonus = 0.05;
      teamworkPartner = other.name;
    }
  }
  if (teamworkBonus > 0 && teamworkPartner) {
    const before = baseReward;
    baseReward = Math.floor(baseReward * (1 + teamworkBonus));
    const extra = baseReward - before;
    if (extra > 0) {
      showToast(`Teamwork with ${esc(teamworkPartner)}: +${extra} fish`);
      rewardHighlights.push(`Bond teamwork with ${teamworkPartner}: +${extra} fish.`);
    }
  }

  const reward = baseReward + (bonusFish ?? 0);
  earnFish(gameState, reward);
  playSfx('purr');
  playSfx('fish_earn', 0.3);
  gameState.totalJobsCompleted++;
  applyReputationShift(gameState, job);
  if (!gameState.completedJobs.includes(job.id)) {
    gameState.completedJobs.push(job.id);
  }

  // Track plague pest control completions separately (counts every completion, not just unique)
  if (gameState.flags.ratPlagueStarted && !gameState.flags.ratPlagueResolved && job.category === 'pest_control') {
    gameState.flags.plaguePestDone = (Number(gameState.flags.plaguePestDone ?? 0)) + 1;
  }

  // Record puzzle stars
  const prev = gameState.puzzlesCompleted[puzzleId] ?? 0;
  if (stars > prev) gameState.puzzlesCompleted[puzzleId] = stars;

  // XP (bonus for puzzle, modified by reputation)
  const xpMap: Record<string, number> = { easy: 30, medium: 55, hard: 90 };
  let xp = xpMap[job.difficulty] ?? 30;
  const repXpBonus = getReputationBonuses(gameState.reputationScore).xpBonus;
  if (repXpBonus !== 0) xp = Math.max(1, Math.floor(xp * (1 + repXpBonus)));
  const leveled = addXp(cat, xp);
  if (leveled) {
    addJournalEntry(gameState, `${esc(cat.name)} reached level ${cat.level}!`, 'level');
  }

  // Bond points (with rank-up celebration + mechanical stat reward).
  // Per todo/ideas/Great Guild Management Games.md: bonds must change the
  // playable roster mechanically, not just unlock conversations. Reaching a
  // rank grants a tangible stat bonus to BOTH cats in the pair so bond
  // investment has visible payoff.
  for (const other of gameState.cats) {
    if (other.id !== cat.id) {
      const result = addBondPoints(gameState, cat.breed, other.breed, 3);
      if (result?.rankUp) {
        const otherName = other.name;
        const reward = grantBondRankReward(cat, other, result.newRank);
        const rewardText = reward && reward.amount > 0
          ? ` (+${reward.amount} ${reward.stat} to both — they ${reward.flavor})`
          : '';
        addJournalEntry(
          gameState,
          `${esc(cat.name)} & ${otherName} reached ${result.newRank} rank${rewardText}.`,
          'bond',
        );
        setTimeout(() => {
          playSfx('chapter');
          showToast(`\u2764 ${esc(cat.name)} & ${otherName} reached ${result.newRank}!${rewardText}`);
        }, 2000);
      }
    }
  }

  // Mark cat as worked today, job as completed today
  catsWorkedToday.add(cat.id);
  jobsCompletedToday.add(job.id);

  // Track jobs during Inquisition investigation
  if (gameState.flags.inquisitionStarted && !gameState.flags.inquisitionResolved) {
    if (job.category === 'sacred') {
      gameState.flags.inquisitionSacredJobs = (numFlag("inquisitionSacredJobs") + 1);
    } else if (job.category === 'guard') {
      gameState.flags.inquisitionGuardJobs = (numFlag("inquisitionGuardJobs") + 1);
    } else if (job.category === 'shadow') {
      gameState.flags.inquisitionShadowJobs = (numFlag("inquisitionShadowJobs") + 1);
    }
  }

  // Check plague resolution immediately after pest control jobs
  if (job.category === 'pest_control') {
    checkRatPlagueResolution(gameState);
  }

  // NPC hidden-value glimpses (story-audit-council.md item 2) — let
  // townspeople recognize the wildcat's worth before the institution does.
  // Each beat fires exactly once, gated by a flag, and lands as a journal
  // entry + toast so the audience sees the wildcat through other eyes.
  triggerHiddenValueGlimpses(gameState, job);

  saveGame(gameState);

  showResultOverlay({
    jobName: job.name,
    catName: cat.name,
    catId: cat.id,
    reward,
    stars,
    moves,
    minMoves,
    xp,
    leveled,
    highlights: rewardHighlights,
  });
});

eventBus.on('puzzle-quit', ({ jobId, catId }: any = {}) => {
  switchToNormalMusic();
  resumeDayTimer();
  playSfx('fail');
  if (!gameState) return;

  // Dungeon run: floor failed — lose 1 HP, return to dungeon
  if (isDungeonRun()) {
    const dungeon = getActiveDungeon()!;
    dungeon.hp--;
    showToast(`Floor failed! HP: ${dungeon.hp}/${dungeon.maxHp}`);
    switchScene('DungeonRunScene');
    return;
  }

  const cat = gameState.cats.find((c) => c.id === catId);
  const job = getJob(jobId);

  // Failure penalty: cat is used for the day, mood drops, lose some fish, job removed from board
  if (jobId) jobsCompletedToday.add(jobId);
  if (cat) {
    catsWorkedToday.add(cat.id);
    if (cat.mood === 'happy') cat.mood = 'content';
    else if (cat.mood === 'content') cat.mood = 'tired';
    else cat.mood = 'unhappy';
  }

  // Lose a small amount of fish (wasted time/resources)
  const penalty = job ? Math.floor(job.baseReward * 0.3) : 2;
  if (gameState.fish >= penalty) {
    gameState.fish -= penalty;
  } else {
    gameState.fish = 0;
  }

  saveGame(gameState);
  updateStatusBar();

  const catName = cat?.name ?? 'Your cat';
  const jobName = job?.name ?? 'the job';
  showToast(`${catName} failed ${jobName}. Lost ${penalty} fish and can't work again today.`);

  setTimeout(() => suggestEndDay(), 1500);
});

function advanceDay(): { foodCost: number; stationedEarned: number; events: string[]; fishRemaining: number } {
  if (!gameState) return { foodCost: 0, stationedEarned: 0, events: [], fishRemaining: 0 };
  gameState.day++;

  // Reset day timer and worked cats
  resetDayTimer();
  catsWorkedToday.clear();
  jobsCompletedToday.clear();
  cachedDailyJobs = null;
  acceptedJob = null; // Clear stale accepted job when day changes

  // Daily upkeep scales with chapter and cat levels
  const foodCost = calculateDailyUpkeep(gameState);
  if (gameState.fish >= foodCost) {
    gameState.fish -= foodCost;
    // Well-fed cats recover mood
    for (const cat of gameState.cats) {
      if (cat.mood === 'unhappy') cat.mood = 'tired';
      else if (cat.mood === 'tired') cat.mood = 'content';
      else if (cat.mood === 'content' && Math.random() < 0.3) cat.mood = 'happy';
    }
  } else {
    // Can't afford full food — cats go hungry, mood drops
    const wasAlreadyBroke = gameState.fish === 0;
    gameState.fish = 0;

    // Saint's Blessing prevents one mood drop
    if (gameState.flags.saintBlessing) {
      delete gameState.flags.saintBlessing;
      showToast('Saint\'s Blessing protected your cats from hunger!');
    } else {
      for (const cat of gameState.cats) {
        if (cat.mood === 'happy') cat.mood = 'content';
        else if (cat.mood === 'content') cat.mood = 'tired';
        else cat.mood = 'unhappy';
      }
    }

    // If broke two days in a row, an unhappy non-player cat may leave
    if (wasAlreadyBroke && gameState.cats.length > 1) {
      const unhappyCats = gameState.cats.filter((c) => c.mood === 'unhappy' && c.id !== 'player_wildcat');
      if (unhappyCats.length > 0) {
        const leaver = unhappyCats[Math.floor(Math.random() * unhappyCats.length)];
        addJournalEntry(gameState, `${leaver.name} the ${BREED_NAMES[leaver.breed] ?? leaver.breed} left the guild — too hungry to stay.`, 'event');
        gameState.cats = gameState.cats.filter((c) => c.id !== leaver.id);
        gameState.stationedCats = gameState.stationedCats.filter((s) => s.catId !== leaver.id);
        showToast(`${leaver.name} the ${BREED_NAMES[leaver.breed] ?? leaver.breed} left the guild — too hungry to stay.`);
        playSfx('cat_sad');
      } else {
        showToast(`Not enough fish! Cats may leave if this continues.`);
      }
    } else {
      showToast(`Not enough fish to feed ${gameState.cats.length} cats! Cats may leave soon.`);
    }
  }

  // Starvation game over — last cat, no fish, broke for days
  if (gameState.cats.length === 1 && gameState.fish === 0 && gameState.cats[0].mood === 'unhappy') {
    showNarrativeOverlay({
      scenes: [
        `${esc(gameState.playerCatName)} sat alone in the cold guildhall. The fish stores were empty. The other cats had gone.`,
        'The lean-to behind the grain market felt smaller than ever. No food. No guild. No home.',
        `${esc(gameState.playerCatName)} slipped out through the market gate before dawn. Perhaps another town. Perhaps another chance.`,
        'The guild is lost. But every story has another chapter...',
      ],
      image: 'assets/sprites/scenes/town.png',
      onComplete: () => {
        // Return to title — game over (don't null gameState to avoid race with pending callbacks).
        // Save once more to commit the playtime that ran during the game-over scenes,
        // then close the in-memory session so the next game load starts fresh.
        if (gameState) saveGame(gameState);
        pausePlaytimeSession();
        stopDayTimer();
        switchScene('TitleScene');
      },
    });
    return { foodCost: 0, stationedEarned: 0, events: [], fishRemaining: 0 };
  }

  // Plague escalation — daily pressure while plague is active
  if (gameState.flags.ratPlagueStarted && !gameState.flags.ratPlagueResolved) {
    const plagueDays = gameState.day - (numFlag("plagueDayStarted") || gameState.day);

    // Plague sickness: each day, 20% chance a random cat's mood drops
    if (Math.random() < 0.2) {
      const healthyCats = gameState.cats.filter((c) => c.mood !== 'unhappy');
      if (healthyCats.length > 0) {
        const sickCat = healthyCats[Math.floor(Math.random() * healthyCats.length)];
        if (sickCat.mood === 'happy') sickCat.mood = 'content';
        else if (sickCat.mood === 'content') sickCat.mood = 'tired';
        else sickCat.mood = 'unhappy';
        showToast(`The plague weighs on ${sickCat.name}. Mood dropped.`);
      }
    }

    // Escalating plague upkeep: +1 fish per 2 plague days
    const plagueUpkeep = Math.floor(plagueDays / 2);
    if (plagueUpkeep > 0) {
      gameState.fish = Math.max(0, gameState.fish - plagueUpkeep);
    }

    // Show plague progress
    const pestControlDone = gameState.completedJobs.filter((id) =>
      ['mill_mousing', 'granary_patrol', 'cathedral_mousing', 'warehouse_clearing', 'ship_hold',
       'tavern_cellar', 'dockside_patrol', 'bakery_guard', 'castle_ratcatcher'].includes(id)
    ).length;
    const prePlagueCount = numFlag("prePlaguePestJobs");
    const plagueProgress = Math.min(5, pestControlDone - prePlagueCount);
    if (plagueProgress > 0 && plagueProgress < 5) {
      showToast(`Plague progress: ${plagueProgress}/5 rat nests cleared. The town needs ${5 - plagueProgress} more.`);
    }
  }

  // Long Winter daily logic — the structural fall (see story-audit-council.md)
  // Trigger check fires once chapter 4 has been settled for a few days.
  if (gameState.chapter === 4 && !gameState.flags.longWinterStarted && !gameState.flags.longWinterResolved) {
    checkLongWinterStart(gameState);
  }
  // Active winter — apply pressure each day until resolved.
  if (gameState.flags.longWinterStarted && !gameState.flags.longWinterResolved) {
    const winterDay = getLongWinterDay(gameState);

    // Doubled upkeep — extra fish drained for firewood + storm rations.
    const extraUpkeep = Math.min(gameState.fish, calculateDailyUpkeep(gameState));
    if (extraUpkeep > 0) {
      gameState.fish -= extraUpkeep;
      setTimeout(() => showToast(`The storm doubles your upkeep. -${extraUpkeep} fish for firewood.`), 800);
    }

    // Mood drops — one cat per day, never the player.
    const eligibleMood = gameState.cats.filter((c) => !c.isPlayer && c.mood !== 'unhappy');
    if (eligibleMood.length > 0 && winterDay <= 3) {
      const target = eligibleMood[Math.floor(Math.random() * eligibleMood.length)];
      if (target.mood === 'happy') target.mood = 'content';
      else if (target.mood === 'content') target.mood = 'tired';
      else target.mood = 'unhappy';
      setTimeout(() => showToast(`The cold wears on ${target.name}.`), 1400);
    }

    // Day 3 — the granary forced choice
    if (isLongWinterForcedChoiceDay(gameState)) {
      setTimeout(() => eventBus.emit('long-winter-forced-choice'), 2200);
    }
    // Day 4 — relational beat (a cat almost leaves OR confronts the wildcat about the granary)
    if (isLongWinterRelationalDay(gameState)) {
      setTimeout(() => eventBus.emit('long-winter-relational'), 2200);
    }
    // Day 5 — resolution
    checkLongWinterResolution(gameState);
  }

  // Inquisition daily check
  if (gameState.flags.inquisitionStarted && !gameState.flags.inquisitionResolved) {
    const inqStart = numFlag("inquisitionDayStarted") || gameState.day;
    const inqDays = gameState.day - inqStart;
    if (inqDays < 5) {
      const sacredCount = gameState.flags.inquisitionSacredJobs ?? 0;
      const guardCount = gameState.flags.inquisitionGuardJobs ?? 0;
      const shadowCount = gameState.flags.inquisitionShadowJobs ?? 0;
      const dayNum = inqDays + 1;
      const questioning = gameState.cats[Math.floor(Math.random() * gameState.cats.length)];
      setTimeout(() => {
        showToast(`Inquisition Day ${dayNum}/5: The Inquisitor questioned ${questioning.name}. Sacred: ${sacredCount} | Guard: ${guardCount} | Shadow: ${shadowCount}`);
      }, 2500);
    }
    checkInquisitionResolution(gameState);
  }

  // Reputation passive bonus
  const repBonuses = getReputationBonuses(gameState.reputationScore);
  if (repBonuses.dailyFish !== 0) {
    gameState.fish = Math.max(0, gameState.fish + repBonuses.dailyFish);
  }

  // Random expenses (~15% chance from chapter 2+, scaling with chapter)
  let randomExpense = 0;
  let randomExpenseMsg = '';
  if (gameState.chapter >= 2 && Math.random() < 0.15) {
    const expenseEvents = [
      { msg: 'A roof leak needs urgent repair!', cost: 3 },
      { msg: 'A merchant overcharged for supplies.', cost: 2 },
      { msg: 'Mice got into the fish stores overnight.', cost: 4 },
      { msg: 'A visiting dignitary expects a gift.', cost: 3 },
      { msg: 'A cat broke a valuable vase.', cost: 2 },
      { msg: 'Guild tax collectors came by.', cost: 3 + gameState.chapter },
      { msg: 'Medicine needed for a sick stray.', cost: 3 },
      { msg: 'Storm damage to the guildhall entrance.', cost: 4 },
    ];
    const evt = expenseEvents[Math.floor(Math.random() * expenseEvents.length)];
    randomExpense = evt.cost;
    randomExpenseMsg = evt.msg;
    gameState.fish = Math.max(0, gameState.fish - randomExpense);
  }

  // Collect stationed earnings
  const stationedResults = collectStationedEarnings(gameState);
  const stationedTotal = stationedResults.reduce((sum, r) => sum + r.earned, 0);

  // Build day summary
  const parts: string[] = [];
  if (repBonuses.dailyFish > 0) parts.push(`Reputation: +${repBonuses.dailyFish} fish`);
  parts.push(`Upkeep: -${foodCost} fish`);
  if (randomExpense > 0) parts.push(`Expense: -${randomExpense} fish`);
  if (stationedTotal > 0) {
    parts.push(`Stationed: +${stationedTotal} fish`);
  }
  showToast(`Day ${gameState.day}: ${parts.join(' | ')}`);

  // Show random expense event
  if (randomExpenseMsg) {
    setTimeout(() => {
      playSfx('merchant');
      showToast(`${randomExpenseMsg} (-${randomExpense} fish)`);
    }, 1200);
  }

  // Show station events and check for crises
  for (const r of stationedResults) {
    if (r.event) {
      setTimeout(() => showToast(r.event!), 1500);
    }
  }

  // Crisis event (~10% chance per day when cats are stationed, chapter 3+)
  if (gameState.chapter >= 3 && gameState.stationedCats.length > 0 && Math.random() < 0.1) {
    const crisisTarget = gameState.stationedCats[Math.floor(Math.random() * gameState.stationedCats.length)];
    const crisisCat = gameState.cats.find((c) => c.id === crisisTarget.catId);
    const crisisJob = getJob(crisisTarget.jobId);
    if (crisisCat && crisisJob) {
      const crisisMessages: Record<string, string> = {
        pest_control: 'A swarm of rats is overwhelming the station!',
        courier: 'The route is blocked by bandits!',
        guard: 'Intruders are breaching the perimeter!',
        sacred: 'Dark omens disturb the vigil!',
        detection: 'The suspect is about to flee!',
        shadow: 'The guard patrol changed routes — the job is compromised!',
      };
      const msg = crisisMessages[crisisJob.category] ?? 'Trouble at the station!';
      setTimeout(() => {
        playSfx('alarm');
        const crisis = document.createElement('div');
        crisis.className = 'assign-overlay';
        crisis.innerHTML = `
          <h2>Station Crisis!</h2>
          <div style="color:#cc6666;font-size:14px;margin-bottom:8px;text-align:center">${msg}</div>
          <div style="color:#8b7355;font-size:12px;margin-bottom:16px;text-align:center">${esc(crisisCat.name)} at ${crisisJob.name} needs backup.</div>
          <div style="display:flex;gap:12px;justify-content:center">
            <button class="btn-puzzle" id="crisis-help">Send Help (+bonus fish)</button>
            <button class="btn-auto" id="crisis-ignore" style="background:#2a2520;border:1px solid #3a3530">Ignore (mood drops)</button>
          </div>
        `;
        overlayLayer.appendChild(crisis);

        document.getElementById('crisis-help')!.addEventListener('click', () => {
          crisis.remove();
          const bonus = Math.floor(crisisJob.baseReward * 0.8);
          earnFish(gameState!, bonus);
          playSfx('fish_earn');
          showToast(`Crisis resolved! +${bonus} fish bonus.`);
          updateStatusBar();
          saveGame(gameState!);
        });

        document.getElementById('crisis-ignore')!.addEventListener('click', () => {
          crisis.remove();
          if (crisisCat.mood === 'happy') crisisCat.mood = 'content';
          else if (crisisCat.mood === 'content') crisisCat.mood = 'tired';
          else crisisCat.mood = 'unhappy';
          showToast(`${crisisCat.name} is disappointed you didn't help.`);
          saveGame(gameState!);
        });
      }, 3000);
    }
  }

  // Passive bond ticks — surface any rank-ups so the player sees that bond
  // investment paid off (stat bonus + rank-up text in the journal).
  const passiveRankUps = processDailyBonds(gameState);
  for (const ru of passiveRankUps) {
    const rewardText = ru.reward && ru.reward.amount > 0
      ? ` (+${ru.reward.amount} ${ru.reward.stat} to both — they ${ru.reward.flavor})`
      : '';
    addJournalEntry(
      gameState,
      `${esc(ru.catA.name)} & ${esc(ru.catB.name)} reached ${ru.newRank} rank${rewardText}.`,
      'bond',
    );
    setTimeout(() => {
      playSfx('chapter');
      showToast(`\u2764 ${esc(ru.catA.name)} & ${esc(ru.catB.name)} reached ${ru.newRank}!${rewardText}`);
    }, 2500);
  }

  // Reputation bond bonus/penalty applied daily
  const repBondBonus = getReputationBonuses(gameState.reputationScore).bondBonus;
  if (repBondBonus !== 0) {
    for (const bond of gameState.bonds) {
      bond.points = Math.max(0, bond.points + repBondBonus);
    }
  }

  // Shadow cat departure risk: 8% daily chance at Shadowed reputation
  if (gameState.reputationScore <= -30 && gameState.cats.length > 1 && Math.random() < 0.08) {
    const unhappy = gameState.cats.filter((c) => c.mood !== 'happy' && c.id !== 'player_wildcat');
    if (unhappy.length > 0) {
      const leaver = unhappy[Math.floor(Math.random() * unhappy.length)];
      addJournalEntry(gameState, `${leaver.name} left — couldn't stomach the guild's shadow dealings.`, 'reputation');
      gameState.cats = gameState.cats.filter((c) => c.id !== leaver.id);
      gameState.stationedCats = gameState.stationedCats.filter((s) => s.catId !== leaver.id);
      playSfx('cat_sad');
      showToast(`${leaver.name} left the guild. "I didn't sign up for this kind of work."`);
    }
  }

  // Chapter 6+: Rival guild influence — uncompleted contested jobs count as rival wins
  if (gameState.chapter >= 6 && cachedDailyJobs) {
    const contestedJobs = (cachedDailyJobs as JobDef[]).filter((j) => j.contested);
    const contestedLost = contestedJobs.filter((j: JobDef) => !jobsCompletedToday.has(j.id));
    if (contestedLost.length > 0) {
      const rivalInfluence = numFlag("rivalInfluence") + contestedLost.length;
      gameState.flags.rivalInfluence = rivalInfluence;
      showToast(`The Silver Paws claimed ${contestedLost.length} contested job${contestedLost.length > 1 ? 's' : ''}. Their influence: ${rivalInfluence}`);

      // Consequences at thresholds
      if (rivalInfluence >= 10 && !gameState.flags.rivalPoached) {
        gameState.flags.rivalPoached = true;
        const poachable = gameState.cats.filter((c) => c.id !== 'player_wildcat' && c.mood !== 'happy');
        if (poachable.length > 0) {
          const poached = poachable[Math.floor(Math.random() * poachable.length)];
          gameState.cats = gameState.cats.filter((c) => c.id !== poached.id);
          gameState.stationedCats = gameState.stationedCats.filter((s) => s.catId !== poached.id);
          playSfx('hiss');
          setTimeout(() => showToast(`${poached.name} was poached by the Silver Paws! Reduce their influence by completing contested jobs.`), 2000);
        }
      }
    } else if (contestedJobs.length > 0) {
      // Player completed all contested jobs — reduce rival influence
      const current = numFlag("rivalInfluence");
      if (current > 0) {
        const reduced = Math.max(0, current - 2);
        gameState.flags.rivalInfluence = reduced;
        showToast(`You defended all contested jobs! Silver Paws influence: ${reduced}`);

        // Win condition: rival influence reduced to 0
        if (reduced === 0 && !gameState.flags.rivalDefeated) {
          gameState.flags.rivalDefeated = true;
          playSfx('chapter');
          setTimeout(() => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;background:#0a0908;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:30px;';
            const catName = gameState?.playerCatName ?? 'The wildcat';
            const scenes = [
              'The Silver Paws sent a messenger at dawn — a sleek cat with a silver collar.',
              `"Your guild has proven itself," the messenger said. "${catName}'s clowder is the real thing. We withdraw."`,
              'The contested jobs vanished from the board. The town had only one guild now — yours.',
              `${catName} watched the Silver Paws leave through the market gate. A rival defeated. A legacy defended.`,
            ];
            let idx = 0;
            const img = document.createElement('img');
            img.src = 'assets/sprites/scenes/town_day.png';
            img.style.cssText = 'width:280px;image-rendering:pixelated;margin-bottom:16px;border-radius:4px;opacity:0.5;';
            ov.appendChild(img);
            const txt = document.createElement('div');
            txt.style.cssText = 'color:#c4956a;font-family:Georgia,serif;font-size:15px;text-align:center;max-width:320px;line-height:1.7;';
            ov.appendChild(txt);
            const hint = document.createElement('div');
            hint.style.cssText = 'color:#555;font-size:11px;margin-top:16px;font-family:Georgia,serif;';
            hint.textContent = 'Tap to continue';
            ov.appendChild(hint);
            const show = () => {
              if (idx >= scenes.length) { ov.style.transition = 'opacity 0.5s'; ov.style.opacity = '0'; setTimeout(() => ov.remove(), 500); return; }
              txt.style.opacity = '0'; txt.textContent = scenes[idx];
              setTimeout(() => { txt.style.transition = 'opacity 0.5s'; txt.style.opacity = '1'; }, 50);
              idx++;
            };
            show(); ov.addEventListener('click', show);
            document.body.appendChild(ov);
          }, 2000);
        }
      }
    }
  }

  checkRatPlagueResolution(gameState);
  checkChapterAdvance(gameState);
  saveGame(gameState);
  updateStatusBar();

  // Schedule (or replace) the "your cats are waiting" reminder for ~16h.
  // No-op on web; on Android it will fire even if the app is closed.
  scheduleDailyReturnNotification(gameState.playerCatName).catch(() => {});

  const events = stationedResults.filter((r) => r.event).map((r) => r.event!);
  return { foodCost, stationedEarned: stationedTotal, events, fishRemaining: gameState.fish };
}


function allCatsBusy(): boolean {
  if (!gameState) return false;
  return gameState.cats.every((cat) => isCatStationed(gameState!, cat.id) || catsWorkedToday.has(cat.id));
}

// Thin wrapper around the extracted overlay module. The overlay's HTML
// and click handlers live in src/ui/overlays/EndDaySuggestion.ts; this
// wrapper just bridges main.ts's local state into the deps shape.
function suggestEndDay(): void {
  showEndDaySuggestion({
    overlayLayer,
    getGameState: () => gameState,
    allCatsBusy,
    advanceDay,
    showDayTransitionOverlay,
    playSfx,
    emitShowTownOverlay: () => eventBus.emit('show-town-overlay'),
  });
}


// Panels extracted to src/ui/Panels.ts

// Chapter advance notifications
eventBus.on('chapter-advance', (chapter: number) => {
  playSfx('chapter');
  const name = getChapterName(chapter);
  trackEvent('chapter_advance', { chapter, name });
  if (gameState) addJournalEntry(gameState, `Chapter ${chapter}: ${name}`, 'chapter');
  showToast(`Chapter ${chapter}: ${name}`);

  // Announce new minigame unlock
  const newMinigame: Record<number, string> = {
    2: 'New approaches: Sprint (courier run) and Navigate (Sokoban)!',
    3: 'New approaches: Patrol (lanterns) and Fight (brawl)!',
    4: 'New approaches: Ritual (memory), Scent Trail, and Nonogram!',
    5: 'New approaches: Slide Blocks and Vigil (fishing)!',
    6: 'New approaches: Pounce (catapult) and Pick Lock (heist)!',
    7: 'New approach: Stealth!',
  };
  if (newMinigame[chapter]) {
    setTimeout(() => showToast(newMinigame[chapter]), 2000);
    if (gameState) addJournalEntry(gameState, newMinigame[chapter], 'event');
  }

  // Show next chapter goals after a moment
  if (gameState) {
    const hint = getNextChapterHint(gameState);
    if (hint) {
      setTimeout(() => showToast(hint), 4000);
    }
  }

  // Chapter intro narrative scenes — each with distinct tone, cat sprite, and sound design
  const catName = esc(gameState?.playerCatName ?? 'The wildcat');
  const catBreed = gameState?.cats.find(c => c.isPlayer)?.breed ?? 'wildcat';
  const repLabel = getReputationLabel(gameState?.reputationScore ?? 0);

  const chapterScenes: Record<number, Parameters<typeof showNarrativeOverlay>[0]> = {
    2: {
      // The Crew — warm, hopeful. A partner arrives.
      scenes: [
        'Word had spread.',
        `A stray who catches rats and earns fish — that was worth talking about.`,
        `A second cat appeared at the lean-to one morning. Not a friend. Not yet.`,
        `${catName} looked at the newcomer. Two cats. Two sets of paws.`,
        'The beginning of something.',
      ],
      image: 'assets/sprites/scenes/guildhall.png',
      catSprite: catBreed,
      tone: 'warm',
      onScene: (i) => { if (i === 1) playSfx('recruit', 0.4); },
    },
    3: {
      // The Rat Plague — dark, urgent. The town is under siege.
      scenes: [
        'The granary fell first.',
        'Rats poured from the walls like dark water, overrunning the flour stores in a single night.',
        'By morning, the cathedral cellar was lost. The monks fled. The market was abandoned.',
        'Only cats.',
        `${catName} gathered the guild. This was no ordinary job.`,
        'This was a siege.',
      ],
      image: 'assets/sprites/scenes/town_plague.png',
      catSprite: catBreed,
      tone: 'urgent',
      onScene: (i) => {
        if (i === 0) playSfx('thunder');
        if (i === 3) playSfx('hiss', 0.3);
      },
    },
    4: {
      // The Name — neutral, dignified. Recognition.
      scenes: [
        'The guild had a reputation now.',
        `Not strays. Not odd-jobbers. An institution.`,
        `The town council sent a messenger. They wanted to give ${catName}'s guild a name.`,
        'A formal recognition.',
        'Hard jobs. Sacred rites. Logic puzzles. The guild was ready for all of it.',
      ],
      image: 'assets/sprites/scenes/town_day.png',
      catSprite: catBreed,
      tone: 'neutral',
      onScene: (i) => { if (i === 3) playSfx('chapter', 0.4); },
    },
    5: {
      // Established — warm, reflective. Home.
      scenes: [
        'The lean-to is gone.',
        'In its place — a guildhall. Warm. Furnished. Full of life.',
        `${catName} looks around. Each cat with their own story. Their own strength.`,
        'A clowder.',
        // Prologue callback (story-audit-council.md item 6) — explicit echo
        // of the rain-soaked notice from the opening 6-panel intro story.
        `The notice is gone from the market wall. ${catName} took it down weeks ago, after the third recruit arrived. It was the only thing left from the lean-to.`,
        'The town knows their names. The merchants wave. The monks nod.',
        `From a stray in a storm to ${repLabel === 'Noble' ? 'the most trusted guild in town' : repLabel === 'Shadowed' ? 'a guild feared and wealthy' : 'a guild that earned its place'}.`,
        'Home.',
      ],
      image: 'assets/sprites/crest.png',
      catSprite: catBreed,
      tone: 'warm',
      // Index shifted by +1 from the prologue-callback panel insert.
      onScene: (i) => { if (i === 7) playSfx('chapter'); if (i === 3) playSfx('purr', 0.3); },
    },
    6: {
      // The Rival — neutral turning tense. Competition.
      scenes: [
        // False-summit warmth (story-audit-council.md item 4).
        'The merchant had slipped an extra fish into the basket that morning, no charge. "For the founder," he said, not meeting eyes.',
        'Three days of soft sun. The kind of week the guild had stopped expecting.',
        // Reversal begins.
        'Then word arrived at dawn.',
        'A second guild had entered the town.',
        'The Silver Paws.',
        'Sleek. Well-funded. Hungry for work.',
        `${catName} watched from across the square.`,
        'This was no longer about survival.',
        'This was about legacy.',
      ],
      image: 'assets/sprites/scenes/town_day.png',
      catSprite: catBreed,
      tone: 'neutral',
      onScene: (i) => { if (i === 4) playSfx('alarm', 0.3); },
    },
    7: {
      // The Inquisition — solemn, foreboding. Judgment.
      scenes: [
        'A letter arrived.',
        'It bore the Bishop\'s seal.',
        `"We have heard of your guild. Cats that serve the saints — or so you claim."`,
        `${catName} read the words twice.`,
        'Five days.',
        'Five days to prove what the guild truly was.',
        'The Bishop is watching.',
      ],
      image: 'assets/sprites/scenes/guildhall.png',
      catSprite: catBreed,
      tone: 'solemn',
      onScene: (i) => {
        if (i === 0) playSfx('thunder');
        if (i === 4) playSfx('day_bell', 0.3);
      },
    },
  };

  if (chapterScenes[chapter]) {
    setTimeout(() => showNarrativeOverlay(chapterScenes[chapter]), 1500);
  }
});

eventBus.on('rat-plague-start', () => {
  if (gameState) {
    gameState.flags.prePlaguePestJobs = gameState.completedJobs.filter((id) =>
      ['mill_mousing', 'granary_patrol', 'cathedral_mousing', 'warehouse_clearing', 'ship_hold',
       'tavern_cellar', 'dockside_patrol', 'bakery_guard', 'castle_ratcatcher'].includes(id)
    ).length;
    gameState.flags.plagueDayStarted = gameState.day;
    addJournalEntry(gameState, 'The Rat Plague has begun. The town is under siege.', 'event');
  }

  showNarrativeOverlay({
    scenes: [
      // False-summit warmth (story-audit-council.md item 4) — let the player
      // feel what's about to be threatened before it lands.
      'The morning before had been quiet. The baker waved as the guild passed. A child had reached up to touch a tail, and the mother had laughed instead of pulling her back.',
      'It had felt — for the first time — like belonging.',
      // Reversal begins.
      'The granary fell first. Rats poured from the walls like dark water, overrunning the flour stores in a single night.',
      'By morning, the cathedral cellar was lost. The monks fled to the upper floors. The market stalls were abandoned.',
      'The townsfolk whispered of St. Rosalia — how her bones once drove plague from Palermo. But there were no saints\' bones here. Only cats.',
      `${esc(gameState?.playerCatName ?? 'The wildcat')} gathered the guild. This was no ordinary job. This was a siege. The town's survival depended on them.`,
      'Complete 5 pest control jobs to drive the rats from the town. The guild will be tested. Not every day will be easy.',
    ],
    image: 'assets/sprites/scenes/town_plague.png',
    onScene: (i) => { if (i === 2) playSfx('thunder'); },
  });
});

eventBus.on('rat-plague-resolved', () => {
  if (gameState) addJournalEntry(gameState, 'The Rat Plague has been resolved! The town is saved.', 'event');
  const catName = gameState?.playerCatName ?? 'The wildcat';
  showNarrativeOverlay({
    scenes: [
      'The last rat nest fell at dawn. The guild stood in the ruins of the granary, exhausted but unbroken.',
      'Word spread through the town like sunlight after a storm. The cats had done what no one else could.',
      'The monks emerged from the cathedral, carrying candles. The townsfolk lined the cobblestone streets.',
      `They walked in procession — ${catName} at the front — through every quarter the rats had touched. Like Rosalia's bones through the streets of Palermo.`,
      'The plague was over. The guild had earned its name. And the town would not forget.',
    ],
    image: 'assets/sprites/scenes/town_day.png',
    onScene: (i) => { if (i === 4) playSfx('chapter'); },
    onComplete: () => {
      // Story-audit-council.md item 3: schedule the admiration arrival
      // shortly after the procession scene closes. The transactional
      // recruitment system gets one scripted exception — a cat who
      // joins because of what they witnessed, not because they were paid.
      setTimeout(() => eventBus.emit('admiration-arrival'), 1500);
    },
  });
});

// ──── Admiration arrival (story-audit-council.md item 3) ────
//
// One scripted recruit who joins for character, not fish. Fires once
// after the rat plague resolves. The cat arrives at the guildhall door
// unbidden, names what they saw, and joins free. This breaks the
// transactional recruitment loop exactly once — and makes the wildcat's
// hidden value visible to the audience through another character's eyes.
eventBus.on('admiration-arrival', () => {
  if (!gameState) return;
  if (gameState.flags.admirationRecruitDone) return;
  if (gameState.cats.length >= 6) return; // Roster already full

  // Pick a breed the guild doesn't have yet. Prefer the breeds with the
  // strongest "I watched from the shadows" archetype.
  const owned = new Set(gameState.cats.map((c) => c.breed));
  const preferenceOrder = ['maine_coon', 'siamese', 'bengal', 'tuxedo', 'russian_blue'];
  const pickedBreed = preferenceOrder.find((b) => !owned.has(b));
  if (!pickedBreed) return; // Nothing to add

  const breed = getBreed(pickedBreed);
  if (!breed) return;

  // Generate a default name. The player can rename via the cat panel.
  const defaultName = breed.name;
  const cat = createCat(pickedBreed, defaultName);
  gameState.cats.push(cat);
  gameState.flags.admirationRecruitDone = true;
  saveGame(gameState);

  const catName = esc(gameState.playerCatName);
  const newCatBreedName = breed.name;

  showNarrativeOverlay({
    scenes: [
      'There was a knock at the guildhall door at dusk.',
      `A ${newCatBreedName} stood in the cold, no bag, no story written on them. Just eyes that had clearly been watching for some time.`,
      `"I came because of the granary."`,
      `"I watched you for a week before tonight. I saw who held the door at the cathedral. I saw who walked at the front of the procession."`,
      `"I have nothing to offer but myself. I won't ask for fish. I just want to belong to whatever this is."`,
      `${catName} looked at the ${newCatBreedName} in the doorway and felt the shape of the guild change in a way that had nothing to do with arithmetic.`,
      `"Then come in. The fire is already going."`,
      `(${defaultName} the ${newCatBreedName} joined the guild — no cost. You can rename them in the cat panel.)`,
    ],
    image: 'assets/sprites/scenes/guildhall.png',
    catSprite: pickedBreed,
    tone: 'warm',
    onScene: (i) => {
      if (i === 0) playSfx('tap', 0.5);
      if (i === 6) playSfx('purr', 0.4);
      if (i === 7) playSfx('recruit', 0.4);
    },
  });

  addJournalEntry(gameState, `${defaultName} the ${newCatBreedName} arrived unbidden at the guildhall door. They came because of what they had seen.`, 'recruit');
});

// ──── Long Winter ────
//
// The structural fall stage. Fires automatically ~5 days into chapter 4.
// 5 winter days total: pressure on days 1-2, granary choice on day 3,
// relational beat on day 4, resolution on day 5.
//
// See todo/story/story-audit-council.md for the design rationale: this
// event exists because the rags-to-riches arc was previously missing a
// non-conditional "loss of everything" moment for all players.

eventBus.on('long-winter-start', () => {
  const catName = esc(gameState?.playerCatName ?? 'The wildcat');
  if (gameState) {
    addJournalEntry(gameState, 'A storm has settled over the town. The job board is closed. The Long Winter has begun.', 'event');
  }
  showNarrativeOverlay({
    scenes: [
      'The first snow came at dawn. Then the second. Then the third.',
      'By the fourth, the town stopped pretending it would pass.',
      'Shutters bolted. The market emptied. The job board went dark.',
      'The merchant\'s caravan turned back at the southern gate. The cathedral bells slowed to once a day.',
      `${catName} stood at the guildhall window and watched the snow swallow the cobblestones.`,
      'For five days, the work would have to wait. For five days, the guild would have only itself.',
    ],
    image: 'assets/sprites/scenes/town.png',
    onScene: (i) => {
      if (i === 0) playSfx('thunder', 0.4);
      if (i === 5) playSfx('cat_sad', 0.3);
    },
  });
});

eventBus.on('long-winter-forced-choice', () => {
  if (!gameState) return;
  const catName = esc(gameState.playerCatName);

  // Build the modal — the granary choice. Mirrors the existing crisis dialog
  // pattern (assign-overlay class) so it inherits the modal styling.
  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';
  overlay.innerHTML = `
    <div class="panel" style="max-width:420px">
      <h2>The Locked Granary</h2>
      <p style="font-size:12px;line-height:1.5;color:#5a4a3a">
        Day three of the storm. The fish stores are nearly out.
      </p>
      <p style="font-size:12px;line-height:1.5;color:#5a4a3a">
        ${catName} stands in the snow outside the town granary. The lock is old. The storm is loud. No one would see.
      </p>
      <p style="font-size:12px;line-height:1.5;color:#5a4a3a">
        The other cats are inside the guildhall, waiting. They are getting hungry.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
        <button id="lw-break-in" class="btn-primary">Break the lock (+50 fish, Shadow +20)</button>
        <button id="lw-wait" class="btn-secondary">Walk away (cost yet to come)</button>
      </div>
    </div>
  `;
  document.getElementById('overlay-layer')!.appendChild(overlay);

  document.getElementById('lw-break-in')!.addEventListener('click', () => {
    overlay.remove();
    if (!gameState) return;
    gameState.fish += 50;
    gameState.reputationScore -= 20; // Shadow shift
    gameState.flags.longWinterChoice = 'breakIn';
    gameState.flags.longWinterChoiceMade = true;
    addJournalEntry(gameState, `${gameState.playerCatName} broke the granary lock. The storm pressed harder than the law. (+50 fish, Shadow +20)`, 'event');
    playSfx('alarm', 0.3);
    showToast('You took what wasn\'t yours. The cats will eat tonight.');
  });

  document.getElementById('lw-wait')!.addEventListener('click', () => {
    overlay.remove();
    if (!gameState) return;
    gameState.flags.longWinterChoice = 'waited';
    gameState.flags.longWinterChoiceMade = true;
    addJournalEntry(gameState, `${gameState.playerCatName} walked away from the granary. The storm tightens its grip.`, 'event');
    playSfx('cat_sad', 0.3);
    showToast('The cats will go to bed hungry. The storm is not done with you.');
  });
});

eventBus.on('long-winter-relational', () => {
  if (!gameState) return;
  const catName = esc(gameState.playerCatName);
  const choice = gameState.flags.longWinterChoice;

  // Pick the cat for the relational beat. Prefer a non-player cat.
  const candidates = gameState.cats.filter((c) => !c.isPlayer);
  if (candidates.length === 0) {
    // Edge case: only the player cat. Skip the beat, just mark done.
    gameState.flags.longWinterRelationalDone = true;
    return;
  }
  const otherCat = candidates[Math.floor(Math.random() * candidates.length)];
  gameState.flags.longWinterCatId = otherCat.id;
  gameState.flags.longWinterRelationalDone = true;

  let scenes: string[];
  if (choice === 'breakIn') {
    // The pious / loyal cat confronts the wildcat about the granary theft.
    scenes = [
      `${esc(otherCat.name)} found ${catName} in the kitchen, alone with the stolen fish.`,
      `"You promised this would be different from the lean-to. You promised this would be a guild that didn't have to take."`,
      `${catName} could not meet ${esc(otherCat.name)}'s eyes.`,
      `"I know."`,
      `"Then we'll make it right when the storm passes. Together. All of us. That's what a guild does."`,
      'The kitchen was warm. The fish would last. But the founder had learned what it cost to forget.',
    ];
  } else {
    // A cat almost leaves. The wildcat must persuade them to stay.
    // This is the founder-flaw beat: "I always thought I had to do everything alone."
    scenes = [
      `${esc(otherCat.name)} stood by the door with their bag packed.`,
      `"I'm sorry. I can't watch the others starve. I'll find work in the next town."`,
      `${catName} reached for words and found none.`,
      `Then: "I always thought the only way to keep the guild safe was to do everything alone."`,
      `"I thought asking for help meant I'd already failed."`,
      `"Stay. Let me try to learn the other way. Stay, and we'll find a way through this together — or we'll fall together."`,
      `${esc(otherCat.name)} set the bag down. The storm howled outside, but inside the lean-to was no longer alone.`,
    ];
    addJournalEntry(gameState, `${otherCat.name} almost left. ${gameState.playerCatName} asked for help — for the first time. They stayed.`, 'bond');
  }

  showNarrativeOverlay({
    scenes,
    image: 'assets/sprites/scenes/guildhall.png',
    catSprite: otherCat.breed,
    tone: 'warm',
    onScene: (i) => {
      if (i === 0) playSfx('cat_sad', 0.3);
      if (i === scenes.length - 1) playSfx('purr', 0.4);
    },
  });
});

eventBus.on('long-winter-resolved', () => {
  if (!gameState) return;
  const catName = esc(gameState.playerCatName);
  const choice = gameState.flags.longWinterChoice;

  if (gameState) {
    addJournalEntry(gameState, 'The Long Winter has broken. The town stirs again. The guild held.', 'event');
    // Mood recovers slightly — survival is its own reward.
    for (const cat of gameState.cats) {
      if (cat.mood === 'unhappy') cat.mood = 'tired';
      else if (cat.mood === 'tired') cat.mood = 'content';
    }
  }

  const closingLine = choice === 'breakIn'
    ? 'The fish that fed them this winter were not theirs. The guild knew. The guild would remember.'
    : 'They had nothing left to give the storm. So they had given each other everything.';

  showNarrativeOverlay({
    scenes: [
      'On the sixth morning, the wind dropped.',
      'A pale sun rose over the cobblestones. The cathedral bells rang twice — and then a third time, like a town remembering how.',
      'The market reopened by noon. The merchant\'s caravan picked its way through the slush. The job board was nailed back to the wall.',
      `${catName} stepped outside and felt the cold sun on their face.`,
      closingLine,
      'What was almost lost was now held with both paws.',
    ],
    image: 'assets/sprites/scenes/town_day.png',
    tone: 'warm',
    onScene: (i) => {
      if (i === 1) playSfx('day_bell', 0.5);
      if (i === 5) playSfx('chapter', 0.4);
    },
  });
});

// Inquisition narrative scenes
eventBus.on('inquisition-start', () => {
  if (gameState) addJournalEntry(gameState, 'The Bishop\'s Inquisitor has arrived to investigate the guild.', 'event');

  const catName = gameState?.playerCatName ?? 'The wildcat';
  const repLabel = getReputationLabel(gameState?.reputationScore ?? 0);
  const lens = repLabel === 'Shadowed' ? 'hostile' : repLabel === 'Noble' ? 'respectful' : 'cautious';

  showNarrativeOverlay({
    scenes: [
      // False-summit warmth (story-audit-council.md item 4).
      'A monk had nodded to the guild from the cathedral steps the day before. A real nod, not a measured one.',
      `${catName} had carried that nod home like a coin in a closed paw, turning it over all evening.`,
      // Reversal begins.
      'The next morning a black-robed figure appeared at the guildhall gate at dawn. Behind him, two monks with ledgers.',
      `"I am Brother Aldric, sent by His Excellency the Bishop. I am here to determine... what you are."`,
      `He looked at ${catName} with ${lens} eyes. "Are you servants of the saints? Or something... else?"`,
      `"For five days, I will observe. I will question your cats. I will watch what work you do."`,
      `"Choose your jobs wisely. Sacred work speaks well of you. Shadow work... does not."`,
    ],
    image: 'assets/sprites/scenes/guildhall.png',
    onScene: (i) => { if (i === 2) playSfx('thunder'); },
  });
});

eventBus.on('inquisition-verdict', (verdict: string) => {
  const catName = gameState?.playerCatName ?? 'The wildcat';

  let scenes: string[];
  if (verdict === 'vindicated') {
    scenes = [
      'Brother Aldric stood before the guild on the fifth morning. His face, for the first time, showed a smile.',
      `"I have seen enough. ${catName}'s guild serves the saints with devotion and courage."`,
      '"The Bishop grants you his blessing. A chapel shall be consecrated in your guildhall."',
      'The town bells rang. The guild had been vindicated — blessed by the Church itself.',
    ];
    if (gameState) {
      gameState.reputationScore += 10;
      addJournalEntry(gameState, 'Vindicated by the Inquisition! The Bishop grants his blessing.', 'chapter');
      gameState.flags.bishopBlessing = true;
    }
  } else if (verdict === 'condemned') {
    scenes = [
      'Brother Aldric\'s face was stone. He unrolled a scroll stamped with the Bishop\'s seal.',
      `"This guild has dealings in shadow. The evidence is clear. One among you must answer for it."`,
      '"Choose which cat bears the sentence of exile. The rest may continue — under watch."',
      `${catName} felt the weight of every shadow job, every dark deal. The consequences had arrived.`,
    ];
    if (gameState) {
      gameState.reputationScore -= 20;
      addJournalEntry(gameState, 'Condemned by the Inquisition. One cat must be exiled.', 'chapter');
      gameState.flags.undergroundContact = true;
    }
  } else {
    scenes = [
      'Brother Aldric closed his ledger with a snap. Neither smile nor frown.',
      `"Your guild is... unremarkable. Neither saintly nor sinful. The Bishop will not intervene."`,
      `${catName} couldn't tell if that was relief or disappointment.`,
      'The Inquisitor left as quietly as he came. Life went on.',
    ];
    if (gameState) {
      addJournalEntry(gameState, 'Acquitted by the Inquisition. Neither blessed nor condemned.', 'chapter');
    }
  }

  playSfx('chapter');

  showNarrativeOverlay({
    scenes,
    image: 'assets/sprites/scenes/guildhall.png',
    onComplete: () => {
      if (verdict === 'condemned' && gameState && gameState.cats.length > 1) {
        showExileChoice();
      }
    },
  });
});

// Thin wrapper around the extracted overlay module.
function showExileChoice(): void {
  showExileChoiceOverlay({
    overlayLayer,
    getGameState: () => gameState,
    saveGame,
    playSfx,
    showToast,
  });
}
