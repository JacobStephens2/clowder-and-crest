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
import {
  type SaveData,
  createDefaultSave,
  saveGame as rawSaveGame,
  loadGame,
  deleteSave,
  addJournalEntry,
  saveToSlot,
} from './systems/SaveManager';
import { createCat, getBreed, addXp } from './systems/CatManager';
import { earnFish, spendFish, calculateReward, collectStationedEarnings, isCatStationed } from './systems/Economy';
import { getJob, getStatMatchScore, generateDailyJobs, getJobFlavor, type JobDef } from './systems/JobBoard';
import { getPuzzleByDifficulty, generatePuzzle } from './systems/PuzzleGenerator';
import { addBondPoints, processDailyBonds, grantBondRankReward, getBondRank, getBondPairs, getAvailableConversation } from './systems/BondSystem';
import { checkChapterAdvance, checkRatPlagueResolution, checkInquisitionResolution, getChapterName, getNextChapterHint } from './systems/ProgressionManager';
import { startBgm, toggleMute, isMuted, switchToPuzzleMusic, switchToFightMusic, switchToNormalMusic, pauseMusic, resumeMusic } from './systems/MusicManager';
import { playSfx } from './systems/SfxManager';
import { startDayTimer, stopDayTimer, resetDayTimer, updateTimeDisplay, setOnDayEnd, pauseDayTimer, resumeDayTimer, isPaused } from './systems/DayTimer';
import { applyReputationShift, getReputationLabel, getReputationRecruitModifier, getReputationBonuses } from './systems/ReputationSystem';
import { getComboMultiplier, updateCombo, getDailyWish, getCurrentFestival, trackEvent } from './systems/GameSystems';
import { showNarrativeOverlay } from './ui/narrativeOverlay';
import { initPanels, showCatPanel, showMenuPanel, showFurnitureShop } from './ui/Panels';
import { initConversations, checkAndShowConversation } from './ui/Conversations';

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

/** Escape HTML entities in user-provided strings to prevent injection. */
function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

// ──── OTA Updates (Capacitor only, silent) ────

// ──── Keyboard shortcuts ────
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pauseBtn && gameState) {
    pauseBtn.click();
  }
});

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

// ──── Pause Button ────
const pauseBtn = document.getElementById('status-pause');
let pauseOverlay: HTMLDivElement | null = null;

if (pauseBtn) {
  pauseBtn.addEventListener('click', () => {
    if (isPaused()) {
      resumeDayTimer();
      resumeMusic();
      pauseBtn.textContent = '||';
      pauseBtn.style.color = '#8b7355';
      if (pauseOverlay) { pauseOverlay.remove(); pauseOverlay = null; }
    } else {
      pauseDayTimer();
      pauseMusic();
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
  const result = advanceDay();
  showDayTransition(gameState.day, result);
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
    actionHtml = `<span style="font-size:9px;color:#8b5b3e;white-space:nowrap">Move ${wishCat?.name ?? 'cat'} to the right room</span>`;
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

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  overlayLayer.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
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
  // Clean up any orphaned scene overlays (tutorials, pause screens)
  document.querySelectorAll('[style*="z-index: 9999"], [style*="z-index:9999"]').forEach((el) => el.remove());
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
function showDayTransition(day: number, recap?: { foodCost: number; stationedEarned: number; events: string[]; fishRemaining?: number }): void {
  playSfx('day_bell', 0.4);
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    opacity:0;transition:opacity 0.5s;pointer-events:none;
  `;
  let recapHtml = '';
  if (recap) {
    const lines: string[] = [];
    if (recap.foodCost > 0) lines.push(`Upkeep: -${recap.foodCost} fish`);
    if (recap.stationedEarned > 0) lines.push(`Stationed: +${recap.stationedEarned} fish`);
    if (recap.fishRemaining !== undefined) lines.push(`Fish remaining: ${recap.fishRemaining}`);
    for (const e of recap.events) lines.push(e);
    if (lines.length > 0) {
      recapHtml = `<div style="color:#8b7355;font-family:Georgia,serif;font-size:11px;margin-top:12px;text-align:center;max-width:280px">${lines.join('<br>')}</div>`;
    }
  }
  // Tomorrow teasers — dangling threads that create "just one more day" pull.
  // Per todo/ideas/Great Guild Management Games.md: ending each day with at
  // least one unresolved hook across multiple systems reliably generates the
  // compulsion to start the next day. We surface up to 4 hooks: bond ready,
  // cat needing attention, festival, tomorrow's job.
  const teasers: { icon: string; color: string; text: string }[] = [];
  if (gameState) {
    // Hook 1: A bond conversation is ready to view — strongest emotional hook
    for (const [a, b] of getBondPairs()) {
      const catA = gameState.cats.find((c) => c.breed === a);
      const catB = gameState.cats.find((c) => c.breed === b);
      if (!catA || !catB) continue;
      const convoRank = getAvailableConversation(gameState, a, b);
      if (convoRank) {
        teasers.push({
          icon: '\u{2764}',
          color: '#cc6677',
          text: `${esc(catA.name)} & ${esc(catB.name)} have something to talk about...`,
        });
        break; // Only surface one bond hook per day-end
      }
    }

    // Hook 2: A cat is close to a bond rank-up (80%+ of threshold)
    for (const bond of gameState.bonds) {
      const rank = getBondRank(bond.points);
      if (rank === 'bonded') continue;
      const nextThreshold = rank === 'stranger' ? 10 : rank === 'acquaintance' ? 25 : 50;
      const progress = bond.points / nextThreshold;
      if (progress >= 0.8 && progress < 1) {
        const catA = gameState.cats.find((c) => c.breed === bond.catA);
        const catB = gameState.cats.find((c) => c.breed === bond.catB);
        if (catA && catB) {
          teasers.push({
            icon: '\u{1F31F}',
            color: '#c4956a',
            text: `${esc(catA.name)} & ${esc(catB.name)} are nearly at the next bond rank.`,
          });
          break;
        }
      }
    }

    // Hook 3: A cat is unhappy and needs attention
    const unhappyCat = gameState.cats.find((c) => c.mood === 'unhappy' && c.id !== 'player_wildcat');
    if (unhappyCat) {
      teasers.push({
        icon: '\u{1F622}',
        color: '#6b8ea6',
        text: `${esc(unhappyCat.name)} is feeling down — maybe tomorrow will be better.`,
      });
    }

    // Hook 4: Festival today
    const festival = getCurrentFestival(day);
    if (festival) {
      teasers.push({
        icon: '\u{1F389}',
        color: '#dda055',
        text: `${festival.name} today!`,
      });
    }

    // Hook 5: Preview tomorrow's job board (always last so it's a low-key anchor)
    const previewJobs = generateDailyJobs(gameState);
    if (previewJobs.length > 0) {
      const teaser = previewJobs[Math.floor(Math.random() * previewJobs.length)];
      teasers.push({
        icon: '',
        color: '#6b8ea6',
        text: `"${teaser.name}" appears on the job board...`,
      });
    }
  }

  const previewHtml = teasers.slice(0, 4).map((t) =>
    `<div style="color:${t.color};font-family:Georgia,serif;font-size:10px;margin-top:6px;font-style:italic">${t.icon ? t.icon + ' ' : ''}${t.text}</div>`
  ).join('');

  overlay.innerHTML = `
    <div style="color:#c4956a;font-family:Georgia,serif;font-size:28px;margin-bottom:4px">Day ${day}</div>
    <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:14px">A new day dawns...</div>
    ${recapHtml}
    ${previewHtml}
    <div style="color:#555;font-family:Georgia,serif;font-size:11px;margin-top:20px">Tap to continue</div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    overlay.style.cursor = 'pointer';
  });
  overlay.addEventListener('click', () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 500);
  });
}

setOnDayEnd(() => {
  if (!gameState) return;
  const recap = advanceDay();
  showDayTransition(gameState.day, recap);
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

// New game — name prompt
let activeSlot = 1;
function saveGame(data: SaveData): void {
  rawSaveGame(data);
  saveToSlot(activeSlot, data);
}
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
});
initConversations({
  getGameState: () => gameState,
  overlayLayer,
  saveGame,
  showToast,
  switchScene,
  suggestEndDay,
});
eventBus.on('active-slot', (slot: number) => { activeSlot = slot; });
eventBus.on('show-name-prompt', (data?: { slot?: number }) => {
  if (data?.slot) activeSlot = data.slot;
  // Remove any existing name prompt to prevent stacking
  document.querySelectorAll('.name-prompt-overlay').forEach((el) => el.remove());

  const prompt = document.createElement('div');
  prompt.className = 'name-prompt-overlay';
  prompt.innerHTML = `
    <h2>Name Your Cat</h2>
    <p>You are a wildcat stray, arriving at a crumbling settlement in a storm. What is your name?</p>
    <input type="text" class="cat-name-input" placeholder="Enter name..." maxlength="20" autocomplete="off" />
    <button class="cat-name-submit">Begin</button>
  `;
  overlayLayer.appendChild(prompt);

  // Scope lookups to the new prompt element.
  const input = prompt.querySelector<HTMLInputElement>('.cat-name-input')!;
  const submit = prompt.querySelector<HTMLButtonElement>('.cat-name-submit')!;

  input.focus();

  let submitted = false;
  const doSubmit = () => {
    if (submitted) return; // Prevent double-submit on mobile
    submitted = true;
    const name = input.value.trim() || 'Stray';
    prompt.remove();
    gameState = createDefaultSave(name);
    saveGame(gameState);
    showIntroStory(name, () => {
      eventBus.emit('game-loaded', gameState!);
      switchScene('GuildhallScene');
      // Start guided tutorial for new players
      setTimeout(() => showTutorial(), 1500);
    });
  };

  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSubmit();
  });
});

// Intro story sequence for new games
function showIntroStory(catName: string, onComplete: () => void): void {
  const panels = [
    {
      text: `The storm came without warning. Rain hammered the cobblestones as lightning split the sky over the sleeping town.`,
      scene: 'town',
    },
    {
      text: `${catName} — thin, soaked, and hungry — stumbled through the market square, seeking shelter from the downpour.`,
      scene: 'town',
    },
    {
      text: `Behind the grain market, ${catName} found a lean-to — little more than a few boards propped against the stone wall. But it was dry, and the smell of mice drifted through the cracks.`,
      scene: 'guildhall',
    },
    {
      text: `On the market wall nearby, a notice fluttered in the wind: "PEST CONTROL NEEDED — Payment in fish." ${catName}'s ears perked up.`,
      scene: 'guildhall',
    },
    {
      text: `${catName} curled up under the lean-to's sagging roof. Tomorrow, there would be work. Tonight, this shelter was enough.`,
      scene: 'guildhall',
    },
    {
      text: `Every guild starts somewhere. ${catName}'s starts here — a stray, a storm, and a lean-to behind the grain market.`,
      scene: 'town',
    },
  ];

  let panelIndex = 0;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:#0a0908;z-index:9999;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    cursor:pointer;padding:30px;
  `;

  const sceneImg = document.createElement('img');
  sceneImg.style.cssText = 'width:280px;max-height:160px;image-rendering:pixelated;margin-bottom:16px;border-radius:4px;opacity:0.4;object-fit:cover;';
  overlay.appendChild(sceneImg);

  // Wildcat sprite
  const catImg = document.createElement('img');
  catImg.src = 'assets/sprites/wildcat/south.png';
  catImg.style.cssText = 'width:72px;height:72px;image-rendering:pixelated;margin-bottom:16px;display:none;';
  overlay.appendChild(catImg);

  const textDiv = document.createElement('div');
  textDiv.style.cssText = 'color:#c4956a;font-family:Georgia,serif;font-size:16px;text-align:center;max-width:320px;line-height:1.7;min-height:80px;';
  overlay.appendChild(textDiv);

  const hintDiv = document.createElement('div');
  hintDiv.style.cssText = 'color:#555;font-family:Georgia,serif;font-size:11px;margin-top:20px;';
  hintDiv.textContent = 'Tap to continue';
  overlay.appendChild(hintDiv);

  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip';
  skipBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:none;border:1px solid #3a3530;color:#6b5b3e;padding:6px 14px;border-radius:4px;font-family:Georgia,serif;font-size:12px;cursor:pointer;';
  overlay.appendChild(skipBtn);

  // Panel-specific SFX
  const panelSounds: (string | null)[] = [
    'thunder',       // Storm — thunder and rain
    null,            // Wildcat stumbles — cat appears
    'purr',          // Found the lean-to — quiet purr
    'job_accept',    // Notice on wall — quill scratch
    null,            // Curls up — silence, reflective
    null,            // Every guild starts somewhere — quiet resolve
  ];

  function showPanel(): void {
    if (panelIndex >= panels.length) {
      overlay.style.transition = 'opacity 0.5s';
      overlay.style.opacity = '0';
      // Fade out intro music and rain
      const fadeOut = setInterval(() => {
        if (introMusic.volume > 0.05) introMusic.volume -= 0.05;
        if (rainAmbience.volume > 0.03) rainAmbience.volume -= 0.03;
        if (introMusic.volume <= 0.05 && rainAmbience.volume <= 0.03) {
          introMusic.pause();
          rainAmbience.pause();
          clearInterval(fadeOut);
        }
      }, 100);
      setTimeout(() => { overlay.remove(); onComplete(); }, 500);
      return;
    }
    const panel = panels[panelIndex];
    const sceneSrc = panel.scene === 'town' ? 'assets/sprites/scenes/town.png' : 'assets/sprites/scenes/guildhall.png';
    sceneImg.src = sceneSrc;

    // Show wildcat on panels 1-4 (the character panels)
    catImg.style.display = (panelIndex >= 1 && panelIndex <= 4) ? 'block' : 'none';

    // Play SFX
    const sfx = panelSounds[panelIndex];
    if (sfx) {
      setTimeout(() => playSfx(sfx, 0.35), 300);
    }

    // Fade in text
    textDiv.style.opacity = '0';
    textDiv.textContent = panel.text;
    setTimeout(() => { textDiv.style.transition = 'opacity 0.6s'; textDiv.style.opacity = '1'; }, 50);

    panelIndex++;
  }

  showPanel();

  overlay.addEventListener('click', (e) => {
    if (e.target === skipBtn) return;
    showPanel();
  });

  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.remove();
    introMusic.pause();
    rainAmbience.pause();
    onComplete();
  });

  // Play intro music + rain ambience
  const introMusic = new Audio('assets/audio/intro.mp3');
  introMusic.volume = 0.4;
  introMusic.loop = false;
  introMusic.play().catch(() => {});

  const rainAmbience = new Audio('assets/sfx/rain_loop.mp3');
  rainAmbience.volume = 0.25;
  rainAmbience.loop = true;
  rainAmbience.play().catch(() => {});

  document.body.appendChild(overlay);
}

function showTutorial(): void {
  const steps = [
    { text: 'Welcome to your guildhall! This is where your cats live. Tap a room to go inside and see your cats.', highlight: 'canvas' },
    { text: 'Use the tabs at the bottom to navigate. The Town is where you find jobs, recruit cats, and buy supplies.', highlight: 'bottom-bar' },
    { text: 'Your fish count and day timer are shown at the top. Fish is your currency — earn it by completing jobs.', highlight: 'status-bar' },
    { text: 'Head to the Town tab now to pick up your first job. Each job favors different stats — choose your cat wisely!', highlight: 'bottom-bar' },
    { text: 'Each day, pay upkeep for your cats and rooms. Complete jobs, recruit more cats, and grow your guild. Good luck!', highlight: null },
  ];

  let stepIndex = 0;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none;';

  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9997;pointer-events:auto;cursor:pointer;';

  const bubble = document.createElement('div');
  bubble.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);width:320px;padding:16px 20px;background:#1c1b19;border:2px solid #c4956a;border-radius:12px;z-index:9999;pointer-events:auto;cursor:pointer;';

  const textDiv = document.createElement('div');
  textDiv.style.cssText = 'color:#c4956a;font-family:Georgia,serif;font-size:14px;line-height:1.6;text-align:center;';

  const hint = document.createElement('div');
  hint.style.cssText = 'color:#6b5b3e;font-family:Georgia,serif;font-size:11px;margin-top:8px;text-align:center;';
  hint.textContent = 'Tap to continue';

  const counter = document.createElement('div');
  counter.style.cssText = 'color:#555;font-family:Georgia,serif;font-size:10px;margin-top:4px;text-align:center;';

  bubble.appendChild(textDiv);
  bubble.appendChild(hint);
  bubble.appendChild(counter);

  function showStep(): void {
    if (stepIndex >= steps.length) {
      backdrop.remove();
      overlay.remove();
      bubble.remove();
      return;
    }
    const step = steps[stepIndex];
    textDiv.textContent = step.text;
    counter.textContent = `${stepIndex + 1}/${steps.length}`;

    // Highlight target element
    if (step.highlight) {
      const el = document.getElementById(step.highlight) ?? document.querySelector(step.highlight);
      if (el) {
        (el as HTMLElement).style.position = 'relative';
        (el as HTMLElement).style.zIndex = '9998';
        // Reset previous highlights
        setTimeout(() => {
          (el as HTMLElement).style.zIndex = '';
        }, 5000);
      }
    }
    stepIndex++;
  }

  showStep();

  backdrop.addEventListener('click', showStep);
  bubble.addEventListener('click', (e) => { e.stopPropagation(); showStep(); });

  document.body.appendChild(backdrop);
  document.body.appendChild(overlay);
  document.body.appendChild(bubble);
}

function showGuildReport(save: SaveData): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,9,8,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:24px;';

  // Gather intel
  const chapterName = getChapterName(save.chapter);
  const repLabel = getReputationLabel(save.reputationScore);
  const catUpkeep = save.cats.reduce((sum, c) => sum + 2 + Math.max(0, c.level - 1), 0);
  const roomUpkeep = save.rooms.filter(r => r.unlocked).length;
  const totalUpkeep = catUpkeep + roomUpkeep + Math.max(0, save.chapter - 1) * 2;
  const stationedCount = save.stationedCats.length;
  const progressHint = getNextChapterHint(save);

  // Find strongest cat
  const strongest = [...save.cats].sort((a, b) => {
    const totalA = Object.values(a.stats).reduce((s, v) => s + v, 0);
    const totalB = Object.values(b.stats).reduce((s, v) => s + v, 0);
    return totalB - totalA;
  })[0];
  const strongestBreed = BREED_NAMES[strongest?.breed ?? ''] ?? strongest?.breed ?? '';

  // Current situation analysis
  const lines: string[] = [];

  // Status line
  lines.push(`<div style="color:#c4956a;font-size:18px;margin-bottom:4px">Guild Report</div>`);
  lines.push(`<div style="color:#6b5b3e;font-size:11px;margin-bottom:16px">Chapter ${save.chapter}: ${chapterName} | Day ${save.day}</div>`);

  // Core stats
  lines.push(`<div style="color:#8b7355;font-size:13px;margin-bottom:8px">${save.cats.length} cats | ${save.fish} fish | ${repLabel} reputation</div>`);

  // Strongest cat
  if (strongest) {
    const specLabel = strongest.specialization ? ` (${strongest.specialization})` : '';
    lines.push(`<div style="font-size:12px;color:#c4956a;margin-bottom:6px">Strongest: <strong>${strongest.name}</strong> the ${strongestBreed}, Lv.${strongest.level}${specLabel}</div>`);
  }

  // Economy
  const netDaily = (stationedCount * 2) - totalUpkeep;
  const econColor = netDaily >= 0 ? '#4a8a4a' : '#cc6666';
  lines.push(`<div style="font-size:11px;color:${econColor};margin-bottom:6px">Daily balance: ${netDaily >= 0 ? '+' : ''}${netDaily} fish/day (upkeep: ${totalUpkeep}, stationed income: ~${stationedCount * 2})</div>`);

  // Fish warning
  if (save.fish < totalUpkeep * 2) {
    lines.push(`<div style="font-size:11px;color:#cc6666;margin-bottom:6px">\u26A0 Low on fish — you can only cover ${Math.floor(save.fish / Math.max(1, totalUpkeep))} more day${save.fish >= totalUpkeep ? 's' : ''} of upkeep.</div>`);
  }

  // Active events
  if (save.flags.ratPlagueStarted && !save.flags.ratPlagueResolved) {
    const progress = Number(save.flags.plaguePestDone ?? 0);
    lines.push(`<div style="font-size:11px;color:#cc6666;margin-bottom:6px">\u{1F400} The Rat Plague is active — ${progress}/5 pest jobs completed. Take PLAGUE-marked jobs to resolve it.</div>`);
  }
  if (save.flags.inquisitionStarted && !save.flags.inquisitionResolved) {
    const inqStart = Number(save.flags.inquisitionDayStarted ?? save.day);
    const daysLeft = Math.max(0, 5 - (save.day - inqStart));
    lines.push(`<div style="font-size:11px;color:#bb88cc;margin-bottom:6px">The Inquisitor is watching — ${daysLeft} days remain. Sacred/Guard jobs earn favor.</div>`);
  }
  if (save.chapter >= 6 && !save.flags.rivalDefeated) {
    const rivalInf = Number(save.flags.rivalInfluence ?? 0);
    lines.push(`<div style="font-size:11px;color:#cc8844;margin-bottom:6px">The Silver Paws are contesting jobs — influence: ${rivalInf}. Complete contested jobs to push them out.</div>`);
  }

  // Chapter goal
  if (progressHint) {
    lines.push(`<div style="font-size:11px;color:#6b8ea6;margin-bottom:6px;font-style:italic">Next chapter: ${progressHint}</div>`);
  }

  // Pressing need
  const unlockedRoomIds = save.rooms.filter(r => r.unlocked).map(r => r.id);
  const lockedRooms = save.rooms.filter(r => !r.unlocked);
  if (lockedRooms.length > 0) {
    const nextRoom = lockedRooms[0];
    const roomCosts: Record<string, number> = { kitchen: 50, operations: 100 };
    const cost = roomCosts[nextRoom.id] ?? 0;
    if (cost > 0 && save.fish < cost) {
      const roomNames: Record<string, string> = { kitchen: 'Kitchen & Pantry', operations: 'Operations Hall' };
      lines.push(`<div style="font-size:11px;color:#8b7355;margin-bottom:6px">Tip: The ${roomNames[nextRoom.id] ?? nextRoom.id} costs ${cost} fish to unlock.</div>`);
    }
  }

  // Suggestion
  if (save.cats.length < 6) {
    lines.push(`<div style="font-size:11px;color:#8b7355;margin-bottom:6px">Look for stray cats in town to recruit.</div>`);
  } else if (stationedCount === 0) {
    lines.push(`<div style="font-size:11px;color:#8b7355;margin-bottom:6px">Tip: Station level 2+ cats at jobs for passive daily income.</div>`);
  }

  overlay.innerHTML = `
    <div style="max-width:340px;text-align:center;font-family:Georgia,serif">
      ${lines.join('')}
      <div style="color:#555;font-size:10px;margin-top:16px">Tap to begin</div>
    </div>
  `;

  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

// Game loaded
eventBus.on('game-loaded', (save: SaveData) => {
  gameState = save;
  acceptedJob = null; // Clear any stale accepted job from a previous save
  catsWorkedToday.clear();
  jobsCompletedToday.clear();
  cachedDailyJobs = null;
  updateStatusBar();
  startBgm();
  startDayTimer();

  // Offline stationed earnings (capped at 5 days)
  if (save.lastPlayedTimestamp && save.stationedCats.length > 0) {
    const hoursAway = (Date.now() - save.lastPlayedTimestamp) / (1000 * 60 * 60);
    const daysAway = Math.min(5, Math.floor(hoursAway / 1)); // 1 real hour = 1 game day offline
    if (daysAway >= 1) {
      let offlineEarnings = 0;
      for (const stationed of save.stationedCats) {
        const job = getJob(stationed.jobId);
        if (!job) continue;
        const cat = save.cats.find((c) => c.id === stationed.catId);
        if (!cat) continue;
        const match = getStatMatchScore(cat, job);
        const dailyEarn = Math.max(1, Math.floor(job.baseReward * 0.3 + job.baseReward * match * 0.3));
        offlineEarnings += dailyEarn * daysAway;
      }
      if (offlineEarnings > 0) {
        earnFish(save, offlineEarnings);
        saveGame(save);
        setTimeout(() => showToast(`Your stationed cats earned ${offlineEarnings} fish while you were away! (${daysAway} day${daysAway > 1 ? 's' : ''})`), 500);
      }
    }
  }

  // Show Guild Report if away 24+ hours, otherwise a welcome toast
  const hoursAwaySinceLastPlay = save.lastPlayedTimestamp ? (Date.now() - save.lastPlayedTimestamp) / (1000 * 60 * 60) : 0;
  if (hoursAwaySinceLastPlay >= 24 && save.totalJobsCompleted > 0) {
    setTimeout(() => showGuildReport(save), 800);
  } else if (save.totalJobsCompleted > 0) {
    const catNames = save.cats.slice(0, 3).map((c) => c.name).join(', ');
    setTimeout(() => showToast(`Welcome back! ${catNames}${save.cats.length > 3 ? ` and ${save.cats.length - 3} others` : ''} await your orders.`), 500);
  }

  // Warn if can't afford today's upkeep
  const unlockedRooms = save.rooms.filter((r) => r.unlocked).length;
  const dailyCost = save.cats.reduce((sum, c) => sum + 2 + Math.max(0, c.level - 1), 0) + unlockedRooms;
  if (save.fish < dailyCost && save.cats.length > 1 && hoursAwaySinceLastPlay < 24) {
    setTimeout(() => {
      showToast(`Warning: You have ${save.fish} fish but need ${dailyCost} for today's upkeep. Earn fish or a cat may leave!`);
    }, 2500);
  }
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

  // Calculate daily budget summary
  const catUpkeep = gameState.cats.reduce((sum, c) => sum + 2 + Math.max(0, c.level - 1), 0);
  const roomUpkeep = gameState.rooms.filter(r => r.unlocked).length;
  const chapterCost = Math.max(0, gameState.chapter - 1) * 2;
  const totalUpkeep = catUpkeep + roomUpkeep + chapterCost;
  const stationedIncome = gameState.stationedCats.length > 0 ? gameState.stationedCats.length * 2 : 0;
  const netDaily = stationedIncome - totalUpkeep;
  const netColor = netDaily >= 0 ? '#4a8a4a' : '#cc6666';

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

  dailyJobs.forEach((job) => {
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
    showDayTransition(gameState!.day, recap);
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

function showAssignOverlay(job: JobDef): void {
  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';

  const availableCats = gameState!.cats.filter((cat) => !isCatStationed(gameState!, cat.id) && !catsWorkedToday.has(cat.id));

  let html = `
    <button class="panel-close" id="assign-close">&times;</button>
    <h2>${job.name}</h2>
    <div class="job-desc">${job.description}</div>
    <h3>Assign a Cat</h3>
  `;

  if (availableCats.length === 0) {
    const allStationed = gameState!.cats.every((cat) => isCatStationed(gameState!, cat.id));
    const reason = allStationed ? 'All cats are stationed at jobs. Recall one first.' : 'All cats have worked today. Wait for a new day.';
    html += `<div style="color:#888;font-size:14px;padding:12px 0">${reason}</div>`;
  }

  // Show which stats matter for this job
  html += `<div style="font-size:11px;color:#6b5b3e;margin-bottom:8px">Key stats: ${job.keyStats.join(', ')}</div>`;

  // Sort cats by fit (best first) but don't reveal the score
  const sortedCats = availableCats.slice().sort((a, b) => getStatMatchScore(b, job) - getStatMatchScore(a, job));

  sortedCats.forEach((cat) => {
    const catIndex = gameState!.cats.indexOf(cat);

    // Build key stat display with color-coded values
    const statBadges = job.keyStats.map((s) => {
      const val = cat.stats[s];
      const color = val >= 7 ? '#4a8a4a' : val >= 4 ? '#8a8a4a' : '#8a4a4a';
      return `<span style="color:${color}">${s} ${val}</span>`;
    }).join(' <span style="color:#3a3a3a">|</span> ');

    const traitEffects: string[] = [];
    if ((cat.traits ?? []).includes('Brave') && job.difficulty === 'hard') traitEffects.push('Brave +');
    if ((cat.traits ?? []).includes('Lazy')) traitEffects.push('Lazy -');
    if ((cat.traits ?? []).includes('Curious') && job.category === 'courier') traitEffects.push('Curious +');
    if ((cat.traits ?? []).includes('Skittish') && job.difficulty === 'hard') traitEffects.push('Skittish -');
    if (cat.mood === 'happy') traitEffects.push('Happy +');
    else if (cat.mood === 'unhappy') traitEffects.push('Unhappy -');
    else if (cat.mood === 'tired') traitEffects.push('Tired -');

    const spriteImg = (ALL_BREED_IDS as readonly string[]).includes(cat.breed)
      ? `<img src="assets/sprites/${cat.breed}/south.png" style="width:36px;height:36px;image-rendering:pixelated;border-radius:50%;background:${BREED_COLORS[cat.breed] ?? '#8b7355'}" />`
      : `<div class="cat-avatar" style="background:${BREED_COLORS[cat.breed] ?? '#8b7355'};width:36px;height:36px;border-radius:50%;"></div>`;

    html += `
      <button class="assign-cat-btn" data-cat-index="${catIndex}">
        ${spriteImg}
        <div style="flex:1">
          <div style="color:#c4956a">${esc(cat.name)} <span style="font-size:11px;color:#6b5b3e">${BREED_NAMES[cat.breed] ?? cat.breed}</span>${cat.specialization ? ` <span style="font-size:10px;color:${cat.specialization === job.category ? '#6b8ea6' : '#6b5b3e'}">${SPECIALIZATION_CATEGORIES[cat.specialization]?.icon ?? ''} ${SPECIALIZATION_CATEGORIES[cat.specialization]?.name ?? ''}</span>` : ''}</div>
          <div style="font-size:12px">${statBadges}</div>
          ${traitEffects.length > 0 ? `<div style="font-size:10px;color:#8b7355">${traitEffects.join(' | ')}</div>` : ''}
        </div>
      </button>
    `;
  });

  overlay.innerHTML = html;
  overlayLayer.appendChild(overlay);

  document.getElementById('assign-close')!.addEventListener('click', () => {
    overlay.remove();
    // Refresh town overlay if closed from assign screen
    if (!overlayLayer.querySelector('.town-overlay')) {
      eventBus.emit('show-town-overlay');
    }
  });

  overlay.querySelectorAll('.assign-cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catIndex = parseInt(btn.getAttribute('data-cat-index')!);
      overlay.remove();
      showChoiceOverlay(job, catIndex);
    });
  });
}

function showChoiceOverlay(job: JobDef, catIndex: number): void {
  const cat = gameState!.cats[catIndex];
  const match = getStatMatchScore(cat, job);
  const dailyEarning = Math.max(1, Math.floor(job.baseReward * 0.5 + job.baseReward * match * 0.5));
  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';

  overlay.innerHTML = `
    <button class="panel-close" id="choice-close">&times;</button>
    <h2>${job.name}</h2>
    <div class="job-desc">${esc(cat.name)} the ${BREED_NAMES[cat.breed] ?? cat.breed} is ready.</div>
    <div style="font-size:11px;color:#6b5b3e;margin-bottom:8px;text-align:center">Choose your approach:</div>
    <div class="assign-choice" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center">
      ${(() => {
        // Minigame choices: 2 per category, staggered by chapter unlock
        // Ch.1: Chase | Ch.2: +Sokoban | Ch.3: +Brawl,Fishing
        // Ch.4: +Nonogram | Ch.5: +Hunt | Ch.6: +Pounce | Ch.7: +Stealth
        const ch = gameState?.chapter ?? 1;
        const opts: string[] = [];

        // Helper: only show if chapter requirement met
        const add = (game: string, label: string, minChapter: number) => {
          if (ch >= minChapter) {
            opts.push(`<button class="btn-puzzle minigame-btn" data-game="${game}" style="flex:1;min-width:140px">${label}</button>`);
          }
        };

        // Unlock schedule: each chapter introduces 2 new minigames
        // Ch.1: Chase + Hunt          Ch.2: Sokoban + Courier Run
        // Ch.3: Brawl + Patrol        Ch.4: Nonogram + Ritual + Scent Trail
        // Ch.5: Slide Blocks + Fishing Ch.6: Pounce + Heist    Ch.7: Stealth
        switch (job.category) {
          case 'pest_control':
            add('chase', '\u{1F400} Chase', 1);
            add('hunt', '\u{1F3AF} Hunt', 1);
            break;
          case 'courier':
            add('courier_run', '\u{1F3C3} Sprint', 2);
            add('sokoban', '\u{1F4E6} Navigate', 2);
            add('puzzle', '\u{1F9E9} Slide Blocks', 5);
            break;
          case 'guard':
            add('patrol', '\u{1F56F}\u{FE0F} Patrol', 3);
            add('brawl', '\u{2694}\u{FE0F} Fight', 3);
            add('pounce', '\u{1F43E} Pounce', 6);
            break;
          case 'sacred':
            add('ritual', '\u{1F56F}\u{FE0F} Ritual', 4);
            add('fishing', '\u{1F3A3} Vigil', 5);
            add('nonogram', '\u{1F4DC} Read Signs', 4);
            break;
          case 'detection':
            add('chase', '\u{1F400} Follow', 1);
            add('scent_trail', '\u{1F43E} Track', 4);
            add('stealth', '\u{1F43E} Stalk', 7);
            break;
          case 'shadow':
            add('heist', '\u{1F510} Pick Lock', 6);
            add('stealth', '\u{1F43E} Sneak', 7);
            add('nonogram', '\u{1F4DC} Crack Code', 4);
            break;
        }

        // Fallback: always offer at least Chase
        if (opts.length === 0) {
          add('chase', '\u{1F400} Chase', 1);
        }
        return opts.join('\n      ');
      })()}
    </div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #3a3530">
      ${cat.level >= 2
        ? `<button class="btn-station" id="btn-do-station">Station Here (~${dailyEarning} fish/day)</button>
           <div style="font-size:11px;color:#6b5b3e;margin-top:6px;text-align:center">Cat earns fish daily but can't do other jobs. Earnings drop after 5 days — rotate for best results.</div>`
        : `<div style="font-size:12px;color:#555;text-align:center;padding:8px 0">Stationing unlocked at level 2</div>`
      }
    </div>
  `;

  overlayLayer.appendChild(overlay);

  document.getElementById('choice-close')!.addEventListener('click', () => {
    overlay.remove();
    if (!overlayLayer.querySelector('.town-overlay')) {
      eventBus.emit('show-town-overlay');
    }
  });

  const startMinigame = (gameType: string) => {
    overlay.remove();
    overlayLayer.querySelectorAll('.town-overlay, .assign-overlay').forEach((el) => el.remove());
    if (gameType === 'brawl') { switchToFightMusic(); } else { switchToPuzzleMusic(); }
    pauseDayTimer();

    switch (gameType) {
      case 'fishing':
        switchScene('FishingScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'chase':
        switchScene('ChaseScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'sokoban':
        switchScene('SokobanScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'hunt':
        switchScene('HuntScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'nonogram':
        switchScene('NonogramScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'stealth':
        switchScene('StealthScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'patrol':
        switchScene('PatrolScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'ritual':
        switchScene('RitualScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'scent_trail':
        switchScene('ScentTrailScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'heist':
        switchScene('HeistScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'courier_run':
        switchScene('CourierRunScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'pounce':
        switchScene('PounceScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'brawl':
        switchScene('BrawlScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'puzzle':
      default: {
        const puzzle = generatePuzzle(job.difficulty) ?? getPuzzleByDifficulty(job.difficulty);
        if (!puzzle) { showToast('No puzzle available!'); return; }
        switchScene('PuzzleScene', { puzzle, jobId: job.id, catId: cat.id });
        break;
      }
    }
  };

  overlay.querySelectorAll('.minigame-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      startMinigame(btn.getAttribute('data-game') ?? 'puzzle');
    });
  });

  document.getElementById('btn-do-station')?.addEventListener('click', () => {
    overlay.remove();
    gameState!.stationedCats.push({ catId: cat.id, jobId: job.id, dayStarted: gameState!.day });
    saveGame(gameState!);
    showToast(`${esc(cat.name)} stationed at ${job.name}`);
    switchScene('TownMapScene');
  });
}

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

  // Lucky Fishbone bonus
  if (gameState.flags.luckyFishbone) {
    baseReward = Math.floor(baseReward * 1.2);
    delete gameState.flags.luckyFishbone;
    showToast('Lucky Fishbone activated! +20% reward.');
  }

  // Festival bonus
  const festival = getCurrentFestival(gameState.day);
  if (festival && (festival.category === 'all' || festival.category === job.category)) {
    baseReward = Math.floor(baseReward * festival.multiplier);
  }

  // Reputation reward bonus
  const repBonuses = getReputationBonuses(gameState.reputationScore);
  if (repBonuses.rewardBonus !== 0) {
    baseReward = Math.floor(baseReward * (1 + repBonuses.rewardBonus));
  }

  // Bishop's Blessing: +5% all rewards
  if (gameState.flags.bishopBlessing) {
    baseReward = Math.floor(baseReward * 1.05);
  }

  // Underground Contact: shadow jobs pay +15% more
  if (gameState.flags.undergroundContact && job.category === 'shadow') {
    baseReward = Math.floor(baseReward * 1.15);
  }

  // Job combo multiplier
  const comboMult = getComboMultiplier(cat.id, job.category, gameState.day);
  if (comboMult > 1) {
    baseReward = Math.floor(baseReward * comboMult);
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
  const unlockedRooms = gameState.rooms.filter((r) => r.unlocked).length;
  const chapterUpkeep = Math.max(0, gameState.chapter - 1) * 2;
  // Higher-level cats eat more (1 extra fish per level above 1)
  const catFoodCost = gameState.cats.reduce((sum, c) => sum + 2 + Math.max(0, c.level - 1), 0);
  const foodCost = catFoodCost + unlockedRooms + chapterUpkeep;
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
        // Return to title — game over (don't null gameState to avoid race with pending callbacks)
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
          <div style="color:#8b7355;font-size:12px;margin-bottom:16px;text-align:center">${crisisCat.name} at ${crisisJob.name} needs backup.</div>
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

  processDailyBonds(gameState);

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

  const events = stationedResults.filter((r) => r.event).map((r) => r.event!);
  return { foodCost, stationedEarned: stationedTotal, events, fishRemaining: gameState.fish };
}

interface ResultInfo {
  jobName: string;
  catName: string;
  catId: string;
  reward: number;
  stars: number;
  moves?: number;
  minMoves?: number;
  xp: number;
  leveled: boolean;
}

const SPECIALIZATION_CATEGORIES: Record<string, { name: string; desc: string; icon: string }> = {
  pest_control: { name: 'Ratcatcher', desc: '+20% pest control, -5% others', icon: '\uD83D\uDC00' },
  courier: { name: 'Courier', desc: '+20% courier jobs, -5% others', icon: '\uD83D\uDCE8' },
  guard: { name: 'Sentinel', desc: '+20% guard duty, -5% others', icon: '\uD83D\uDEE1\uFE0F' },
  sacred: { name: 'Acolyte', desc: '+20% sacred rites, -5% others', icon: '\u271D\uFE0F' },
  detection: { name: 'Sleuth', desc: '+20% detection, -5% others', icon: '\uD83D\uDD0D' },
  shadow: { name: 'Shadow', desc: '+20% shadow ops, -5% others', icon: '\uD83C\uDF19' },
};

function showSpecializationChoice(catId: string, catName: string, onDone: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';

  const categories = Object.entries(SPECIALIZATION_CATEGORIES);
  const buttons = categories.map(([key, spec]) => `
    <button class="spec-btn" data-spec="${key}" style="display:flex;align-items:center;gap:8px;padding:10px 16px;margin:4px 0;width:100%;background:rgba(42,37,32,0.6);border:1px solid #6b5b3e;border-radius:6px;color:#c4956a;font-size:13px;cursor:pointer;font-family:Georgia,serif">
      <span style="font-size:20px">${spec.icon}</span>
      <span><strong>${spec.name}</strong><br><span style="font-size:11px;color:#8b7355">${spec.desc}</span></span>
    </button>
  `).join('');

  overlay.innerHTML = `
    <h2 style="color:#dda055">Specialization!</h2>
    <div style="color:#c4956a;font-size:14px;margin-bottom:8px;text-align:center">
      ${catName} has reached maximum level!
    </div>
    <div style="color:#8b7355;font-size:12px;margin-bottom:16px;text-align:center">
      Choose a permanent specialization. This gives a +20% bonus to one job category but -5% to all others.
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto">
      ${buttons}
    </div>
  `;

  overlayLayer.appendChild(overlay);

  overlay.querySelectorAll('.spec-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spec = (btn as HTMLElement).dataset.spec!;
      if (!gameState) return;
      const cat = gameState.cats.find((c) => c.id === catId);
      if (cat) {
        cat.specialization = spec;
        const specName = SPECIALIZATION_CATEGORIES[spec].name;
        addJournalEntry(gameState, `${catName} specialized as a ${specName}.`, 'specialization');
        saveGame(gameState);
        playSfx('chapter');
        showToast(`${catName} specialized as a ${specName}!`);
      }
      overlay.remove();
      onDone();
    });
  });
}

function showResultOverlay(info: ResultInfo): void {
  const overlay = document.createElement('div');
  overlay.className = 'result-overlay';

  const starsStr = '&#11088;'.repeat(info.stars) + '&#9734;'.repeat(3 - info.stars);
  const movesStr = info.moves != null ? `<br>Moves: ${info.moves} (target: ${info.minMoves})` : '';

  playSfx('victory');
  trackEvent('job_completed', { stars: info.stars, reward: info.reward, job: info.jobName });

  // Celebration for 3-star wins
  if (info.stars === 3) {
    playSfx('chapter', 0.3);
  }

  overlay.innerHTML = `
    <h2>${info.stars === 3 ? '\u2728 Perfect! \u2728' : 'Puzzle Solved!'}</h2>
    ${starsStr ? `<div class="result-stars">${starsStr}</div>` : ''}
    <div class="result-details">
      <strong>${info.jobName}</strong><br>
      ${info.catName} earned <span class="fish-earned">+${info.reward} Fish</span>
      ${movesStr}
      <br>+${info.xp} XP
    </div>
    ${info.leveled ? `<div style="color:#dda055;font-size:18px;margin-bottom:12px;animation:fadeSlideIn 0.5s ease">\u2B50 LEVEL UP! \u2B50<br><span style="font-size:13px">${info.catName} is now stronger!</span></div>` : ''}
    <div style="font-size:12px;color:#6b5b3e;margin-bottom:16px">Balance: ${gameState?.fish ?? 0} fish</div>
    <button id="result-continue">Continue</button>
  `;

  overlayLayer.appendChild(overlay);

  document.getElementById('result-continue')!.addEventListener('click', () => {
    overlay.remove();

    // Check if this cat just hit level 5 and needs a specialization
    const resultCat = gameState?.cats.find((c) => c.id === info.catId);
    if (info.leveled && resultCat && resultCat.level >= 5 && !resultCat.specialization) {
      showSpecializationChoice(info.catId, info.catName, () => {
        checkAndShowConversation();
      });
      return;
    }

    // Check for available conversations
    checkAndShowConversation();
  });
}

function allCatsBusy(): boolean {
  if (!gameState) return false;
  return gameState.cats.every((cat) => isCatStationed(gameState!, cat.id) || catsWorkedToday.has(cat.id));
}

function suggestEndDay(): void {
  if (!allCatsBusy() || !gameState) return;

  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';
  overlay.innerHTML = `
    <h2>All Cats Busy</h2>
    <div style="color:#8b7355;font-size:14px;margin-bottom:16px;text-align:center">
      Every cat has worked or is stationed today.<br>End the day to start fresh?
    </div>
    <div style="display:flex;gap:12px;justify-content:center">
      <button class="btn-puzzle" id="end-day-yes">End Day</button>
      <button class="btn-auto" id="end-day-no" style="background:#2a2520;border:1px solid #3a3530">Keep Waiting</button>
    </div>
  `;
  overlayLayer.appendChild(overlay);

  document.getElementById('end-day-yes')!.addEventListener('click', () => {
    overlay.remove();
    const recap = advanceDay();
    showDayTransition(gameState!.day, recap);
    playSfx('day_bell', 0.4);
    // Refresh town if open
    const townOverlay = overlayLayer.querySelector('.town-overlay');
    if (townOverlay) {
      townOverlay.remove();
      eventBus.emit('show-town-overlay');
    }
  });

  document.getElementById('end-day-no')!.addEventListener('click', () => {
    overlay.remove();
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
        'The town knows their names. The merchants wave. The monks nod.',
        `From a stray in a storm to ${repLabel === 'Noble' ? 'the most trusted guild in town' : repLabel === 'Shadowed' ? 'a guild feared and wealthy' : 'a guild that earned its place'}.`,
        'Home.',
      ],
      image: 'assets/sprites/crest.png',
      catSprite: catBreed,
      tone: 'warm',
      onScene: (i) => { if (i === 6) playSfx('chapter'); if (i === 3) playSfx('purr', 0.3); },
    },
    6: {
      // The Rival — neutral turning tense. Competition.
      scenes: [
        'Word arrived at dawn.',
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
      onScene: (i) => { if (i === 2) playSfx('alarm', 0.3); },
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
      'The granary fell first. Rats poured from the walls like dark water, overrunning the flour stores in a single night.',
      'By morning, the cathedral cellar was lost. The monks fled to the upper floors. The market stalls were abandoned.',
      'The townsfolk whispered of St. Rosalia — how her bones once drove plague from Palermo. But there were no saints\' bones here. Only cats.',
      `${esc(gameState?.playerCatName ?? 'The wildcat')} gathered the guild. This was no ordinary job. This was a siege. The town's survival depended on them.`,
      'Complete 5 pest control jobs to drive the rats from the town. The guild will be tested. Not every day will be easy.',
    ],
    image: 'assets/sprites/scenes/town_plague.png',
    onScene: (i) => { if (i === 0) playSfx('thunder'); },
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
      'A black-robed figure appeared at the guildhall gate at dawn. Behind him, two monks with ledgers.',
      `"I am Brother Aldric, sent by His Excellency the Bishop. I am here to determine... what you are."`,
      `He looked at ${catName} with ${lens} eyes. "Are you servants of the saints? Or something... else?"`,
      `"For five days, I will observe. I will question your cats. I will watch what work you do."`,
      `"Choose your jobs wisely. Sacred work speaks well of you. Shadow work... does not."`,
    ],
    image: 'assets/sprites/scenes/guildhall.png',
    onScene: (i) => { if (i === 0) playSfx('thunder'); },
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

function showExileChoice(): void {
  if (!gameState) return;
  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';

  const exilable = gameState.cats.filter((c) => c.id !== 'player_wildcat');
  const buttons = exilable.map((cat) => {
    const breedName = BREED_NAMES[cat.breed] ?? cat.breed;
    return `<button class="exile-btn" data-cat-id="${cat.id}" style="display:flex;align-items:center;gap:8px;padding:10px 16px;margin:4px 0;width:100%;background:rgba(80,30,30,0.4);border:1px solid #8b4444;border-radius:6px;color:#cc8888;font-size:13px;cursor:pointer;font-family:Georgia,serif">
      ${esc(cat.name)} the ${breedName} (Lv.${cat.level})
    </button>`;
  }).join('');

  overlay.innerHTML = `
    <h2 style="color:#cc6666">Choose Who Must Leave</h2>
    <div style="color:#8b7355;font-size:12px;margin-bottom:12px;text-align:center">
      The Inquisitor demands one cat be exiled. This cannot be undone.
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${buttons}
    </div>
  `;

  overlayLayer.appendChild(overlay);

  overlay.querySelectorAll('.exile-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catId = (btn as HTMLElement).dataset.catId!;
      const cat = gameState!.cats.find((c) => c.id === catId);
      if (cat) {
        addJournalEntry(gameState!, `${esc(cat.name)} was exiled by the Inquisitor's decree.`, 'event');
        gameState!.cats = gameState!.cats.filter((c) => c.id !== catId);
        gameState!.stationedCats = gameState!.stationedCats.filter((s) => s.catId !== catId);
        saveGame(gameState!);
        playSfx('cat_sad');
        showToast(`${esc(cat.name)} has been exiled from the guild.`);
      }
      overlay.remove();
    });
  });
}
