import Phaser from 'phaser';
import { checkForUpdates } from './systems/OtaUpdater';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GuildhallScene } from './scenes/GuildhallScene';
import { TownScene } from './scenes/TownScene';
import { PuzzleScene } from './scenes/PuzzleScene';
import { SokobanScene } from './scenes/SokobanScene';
import { ChaseScene } from './scenes/ChaseScene';
import { RoomScene } from './scenes/RoomScene';
import { eventBus } from './utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS, BREED_NAMES, STAT_NAMES } from './utils/constants';
import {
  type SaveData,
  createDefaultSave,
  saveGame,
  loadGame,
  deleteSave,
} from './systems/SaveManager';
import { createCat, getBreed, addXp } from './systems/CatManager';
import { earnFish, spendFish, calculateReward, calculateAutoResolveReward, collectStationedEarnings, isCatStationed } from './systems/Economy';
import { getJob, getStatMatchScore, generateDailyJobs, type JobDef } from './systems/JobBoard';
import { getPuzzleByDifficulty, generatePuzzle } from './systems/PuzzleGenerator';
import { addBondPoints, processDailyBonds, getAvailableConversation, markConversationViewed, getBondRank, getBondPairs } from './systems/BondSystem';
import { checkChapterAdvance, checkRatPlagueResolution, getChapterName, getNextChapterHint } from './systems/ProgressionManager';
import { startBgm, toggleMute, isMuted, switchToPuzzleMusic, switchToNormalMusic } from './systems/MusicManager';
import { playSfx } from './systems/SfxManager';
import { startDayTimer, stopDayTimer, resetDayTimer, updateTimeDisplay, setOnDayEnd } from './systems/DayTimer';
import conversationsData from './data/conversations.json';

// ──── Game State ────
let gameState: SaveData | null = null;
const catsWorkedToday = new Set<string>();

export function getGameState(): SaveData | null {
  return gameState;
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
    pixelArt: false,
    antialias: true,
  },
  scene: [BootScene, TitleScene, GuildhallScene, TownScene, PuzzleScene, SokobanScene, ChaseScene, RoomScene],
};

const game = new Phaser.Game(config);

// ──── OTA Updates (Capacitor only, silent) ────
checkForUpdates();

// ──── UI References ────
const overlayLayer = document.getElementById('overlay-layer')!;
const statusBar = document.getElementById('status-bar')!;
const bottomBar = document.getElementById('bottom-bar')!;
const panelOverlay = document.getElementById('panel-overlay')!;
const statusFish = document.getElementById('status-fish')!;
const statusDay = document.getElementById('status-day')!;
const statusChapter = document.getElementById('status-chapter')!;

// ──── UI Helpers ────
let lastFishCount = -1;
function updateStatusBar(): void {
  if (!gameState) return;
  const prevFish = lastFishCount;
  lastFishCount = gameState.fish;
  statusFish.textContent = `${gameState.fish} Fish`;
  statusDay.textContent = `Day ${gameState.day}`;
  statusChapter.textContent = `Ch. ${gameState.chapter}`;

  // Flash fish count on change
  if (prevFish >= 0 && prevFish !== gameState.fish) {
    statusFish.style.color = gameState.fish > prevFish ? '#4a8a4a' : '#aa4444';
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
  const sceneKeys = ['GuildhallScene', 'TownScene', 'PuzzleScene', 'SokobanScene', 'ChaseScene', 'TitleScene', 'RoomScene'];
  for (const key of sceneKeys) {
    if (game.scene.isActive(key) || game.scene.isPaused(key)) {
      game.scene.stop(key);
    }
  }
  game.scene.start(target, data);
}

// ──── Day Timer Callback ────
function showDayTransition(day: number, recap?: { foodCost: number; stationedEarned: number; events: string[] }): void {
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
    for (const e of recap.events) lines.push(e);
    if (lines.length > 0) {
      recapHtml = `<div style="color:#8b7355;font-family:Georgia,serif;font-size:11px;margin-top:12px;text-align:center;max-width:280px">${lines.join('<br>')}</div>`;
    }
  }
  overlay.innerHTML = `
    <div style="color:#c4956a;font-family:Georgia,serif;font-size:28px;margin-bottom:4px">Day ${day}</div>
    <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:14px">A new day dawns...</div>
    ${recapHtml}
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  const duration = recap && recap.events.length > 0 ? 3500 : 2000;
  setTimeout(() => { overlay.style.opacity = '0'; }, duration);
  setTimeout(() => overlay.remove(), duration + 500);
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

eventBus.on('fish-changed', () => {
  updateStatusBar();
});

// Bottom bar navigation
bottomBar.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.nav-btn') as HTMLElement;
  if (!btn || !gameState) return;

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
      switchScene('TownScene');
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
eventBus.on('show-name-prompt', () => {
  const prompt = document.createElement('div');
  prompt.className = 'name-prompt-overlay';
  prompt.innerHTML = `
    <h2>Name Your Cat</h2>
    <p>You are a wildcat stray, arriving at a crumbling settlement in a storm. What is your name?</p>
    <input type="text" id="cat-name-input" placeholder="Enter name..." maxlength="20" autocomplete="off" />
    <button id="cat-name-submit">Begin</button>
  `;
  overlayLayer.appendChild(prompt);

  const input = document.getElementById('cat-name-input') as HTMLInputElement;
  const submit = document.getElementById('cat-name-submit')!;

  input.focus();

  const doSubmit = () => {
    const name = input.value.trim() || 'Stray';
    prompt.remove();
    gameState = createDefaultSave(name);
    saveGame(gameState);
    eventBus.emit('game-loaded', gameState);
    switchScene('GuildhallScene');
    showToast(`${name} the Wildcat arrives...`);
  };

  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSubmit();
  });
});

// Game loaded
eventBus.on('game-loaded', (save: SaveData) => {
  gameState = save;
  updateStatusBar();
  startBgm();
  startDayTimer();
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

  if (!spendFish(gameState, breed.recruitCost)) {
    showToast('Not enough fish!');
    return;
  }

  showRecruitNamePrompt(breedId, breed.name);
});

function showRecruitNamePrompt(breedId: string, breedName: string): void {
  const prompt = document.createElement('div');
  prompt.className = 'name-prompt-overlay';
  const color = BREED_COLORS[breedId] ?? '#8b7355';
  prompt.innerHTML = `
    <div style="width:60px;height:60px;border-radius:50%;background:${color};border:2px solid #6b5b3e;margin-bottom:16px"></div>
    <h2>A ${breedName} appears</h2>
    <p>A stray ${breedName} wants to join the guild. What will you call them?</p>
    <input type="text" id="recruit-name-input" placeholder="${breedName}" maxlength="20" autocomplete="off" />
    <button id="recruit-name-submit">Welcome to the guild</button>
  `;
  overlayLayer.appendChild(prompt);

  const input = document.getElementById('recruit-name-input') as HTMLInputElement;
  const submit = document.getElementById('recruit-name-submit')!;
  input.focus();

  const doSubmit = () => {
    const name = input.value.trim() || breedName;
    prompt.remove();

    const cat = createCat(breedId, name);
    gameState!.cats.push(cat);
    saveGame(gameState!);

    showToast(`${name} the ${breedName} joined the guild!`);
    checkChapterAdvance(gameState!);
    saveGame(gameState!);
    switchScene('TownScene');
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

  const dailyJobs = generateDailyJobs(gameState);

  const plagueActive = gameState.flags.ratPlagueStarted && !gameState.flags.ratPlagueResolved;

  let html = `
    <div class="town-header">
      <div class="town-title">Town Square</div>
      <div class="town-day">Day ${gameState.day}</div>
    </div>
    ${plagueActive ? '<div style="background:#4a2020;color:#cc6666;padding:8px 12px;margin:0 12px 8px;border-radius:4px;font-size:12px;text-align:center;font-family:Georgia,serif">The Rat Plague ravages the town. Complete pest control jobs to end it.</div>' : ''}
    <div class="town-section-divider"></div>
    <div class="town-section-title">Job Board</div>
  `;

  // Job cards
  dailyJobs.forEach((job) => {
    const diffClass = `diff-${job.difficulty}`;
    const catIcon = job.category === 'pest_control' ? '\u{1F400}' : '\u{1F4DC}';
    html += `
      <div class="town-job-card">
        <div class="town-job-top">
          <span class="town-job-icon">${catIcon}</span>
          <span class="town-job-name">${job.name}</span>
          <span class="town-job-diff ${diffClass}">${job.difficulty}</span>
        </div>
        <div class="town-job-desc">${job.description}</div>
        <div class="town-job-bottom">
          <span class="town-job-reward">${job.baseReward}-${job.maxReward} Fish</span>
          <span class="town-job-stats">${job.keyStats.join(', ')}</span>
          <button class="town-job-accept" data-job-id="${job.id}">Accept</button>
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
            <div class="town-stationed-name">${cat.name} — ${job.name}</div>
            <div class="town-stationed-detail">~${dailyEarn} fish/day | ${daysWorked} day${daysWorked !== 1 ? 's' : ''} worked</div>
          </div>
        </div>
      `;
    }
  }

  // Recruits
  const ownedBreeds = new Set(gameState.cats.map((c) => c.breed));
  const recruitable = [
    { id: 'russian_blue', name: 'Russian Blue', cost: 30, color: '#6b8ea6' },
    { id: 'tuxedo', name: 'Tuxedo', cost: 40, color: '#3c3c3c' },
    { id: 'maine_coon', name: 'Maine Coon', cost: 50, color: '#c4956a' },
    { id: 'siamese', name: 'Siamese', cost: 60, color: '#d4c5a9' },
  ].filter((r) => !ownedBreeds.has(r.id));

  html += `<div class="town-section-divider"></div>`;
  html += `<div class="town-section-title">Stray Cats Nearby</div>`;

  if (recruitable.length === 0) {
    html += `<div class="town-empty">All cats have joined the guild.</div>`;
  } else {
    for (const recruit of recruitable) {
      const canAfford = gameState.fish >= recruit.cost;
      html += `
        <div class="town-recruit-card">
          <div class="town-recruit-avatar" style="background:${recruit.color}"></div>
          <div class="town-recruit-info">
            <div class="town-recruit-name">${recruit.name}</div>
            <div class="town-recruit-cost">Wants to join for ${recruit.cost} Fish</div>
          </div>
          <button class="town-recruit-btn ${canAfford ? '' : 'disabled'}" data-breed-id="${recruit.id}" ${canAfford ? '' : 'disabled'}>
            ${canAfford ? 'Recruit' : `${recruit.cost} Fish`}
          </button>
        </div>
      `;
    }
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
    html += `<div style="background:rgba(42,37,32,0.6);padding:4px 8px;border-radius:4px;font-size:11px;font-family:Georgia,serif;border-left:3px solid ${statusColor}">
      <span style="color:#c4956a">${cat.name}</span>
      <span style="color:${statusColor};font-size:9px"> ${statusText}</span>
    </div>`;
  }
  html += `</div></div>`;

  // End Day button
  html += `
    <div class="town-section-divider"></div>
    <button class="town-end-day" id="town-end-day">End Day</button>
    <div class="town-end-day-hint">Advance to the next day. Stationed cats collect earnings.</div>
  `;

  overlay.innerHTML = html;
  overlayLayer.appendChild(overlay);

  // Wire up job accept buttons
  overlay.querySelectorAll('.town-job-accept').forEach((btn) => {
    btn.addEventListener('click', () => {
      const jobId = btn.getAttribute('data-job-id')!;
      const job = dailyJobs.find((j) => j.id === jobId);
      if (job) {
        overlay.remove();
        eventBus.emit('job-accept', { job });
      }
    });
  });

  // Wire up recruit buttons
  overlay.querySelectorAll('.town-recruit-btn:not(.disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const breedId = btn.getAttribute('data-breed-id')!;
      overlay.remove();
      eventBus.emit('recruit-cat', breedId);
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
eventBus.on('job-accept', ({ job }: { job: JobDef }) => {
  playSfx('job_accept');
  if (!gameState) return;
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

  availableCats.forEach((cat) => {
    const catIndex = gameState!.cats.indexOf(cat);
    const match = getStatMatchScore(cat, job);
    const matchPct = Math.round(match * 100);
    const color = BREED_COLORS[cat.breed] ?? '#8b7355';
    html += `
      <button class="assign-cat-btn" data-cat-index="${catIndex}">
        <div class="cat-avatar" style="background:${color};width:36px;height:36px;border-radius:50%;"></div>
        <div>
          <div style="color:#c4956a">${cat.name} (${BREED_NAMES[cat.breed] ?? cat.breed})</div>
          <div style="font-size:12px;color:#999">Match: ${matchPct}% | Lv.${cat.level}</div>
        </div>
      </button>
    `;
  });

  overlay.innerHTML = html;
  overlayLayer.appendChild(overlay);

  document.getElementById('assign-close')!.addEventListener('click', () => overlay.remove());

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
    <div class="job-desc">${cat.name} the ${BREED_NAMES[cat.breed] ?? cat.breed} is ready.</div>
    <div class="assign-choice">
      <button class="btn-puzzle" id="btn-do-puzzle">Take the Job</button>
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

  document.getElementById('choice-close')!.addEventListener('click', () => overlay.remove());

  document.getElementById('btn-do-puzzle')!.addEventListener('click', () => {
    overlay.remove();
    switchToPuzzleMusic();

    // Pick minigame type: pest control jobs can get Chase, others get puzzles
    const roll = Math.random();
    if (job.category === 'pest_control' && roll < 0.33) {
      // Chase minigame — cat hunts rat in a maze
      switchScene('ChaseScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
    } else if (roll < 0.66) {
      // Sokoban
      switchScene('SokobanScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
    } else {
      // Rush Hour
      const puzzle = generatePuzzle(job.difficulty) ?? getPuzzleByDifficulty(job.difficulty);
      if (!puzzle) {
        showToast('No puzzle available!');
        return;
      }
      switchScene('PuzzleScene', { puzzle, jobId: job.id, catId: cat.id });
    }
  });

  document.getElementById('btn-do-station')?.addEventListener('click', () => {
    overlay.remove();
    gameState!.stationedCats.push({ catId: cat.id, jobId: job.id, dayStarted: gameState!.day });
    saveGame(gameState!);
    showToast(`${cat.name} stationed at ${job.name}`);
    switchScene('TownScene');
  });
}

function doAutoResolve(job: JobDef, cat: typeof gameState extends null ? never : NonNullable<typeof gameState>['cats'][number]): void {
  if (!gameState) return;
  const match = getStatMatchScore(cat, job);
  const reward = calculateAutoResolveReward(job.baseReward, job.maxReward, match);

  earnFish(gameState, reward);
  playSfx('fish_earn');
  gameState.totalJobsCompleted++;
  if (!gameState.completedJobs.includes(job.id)) {
    gameState.completedJobs.push(job.id);
  }

  // XP
  const xpMap: Record<string, number> = { easy: 20, medium: 40, hard: 70 };
  const leveled = addXp(cat, xpMap[job.difficulty] ?? 20);

  // Bond points for working same day
  for (const other of gameState.cats) {
    if (other.id !== cat.id) {
      addBondPoints(gameState, cat.breed, other.breed, 3);
    }
  }

  // Mark cat as worked today
  catsWorkedToday.add(cat.id);
  saveGame(gameState);

  showResultOverlay({
    jobName: job.name,
    catName: cat.name,
    reward,
    stars: 0,
    xp: xpMap[job.difficulty] ?? 20,
    leveled,
    isAuto: true,
  });
}

// Puzzle complete
eventBus.on('puzzle-complete', ({ puzzleId, moves, minMoves, stars, jobId, catId, bonusFish }: any) => {
  switchToNormalMusic();
  if (!gameState) return;

  const job = getJob(jobId);
  const cat = gameState.cats.find((c) => c.id === catId);
  if (!job || !cat) {
    switchScene('GuildhallScene');
    return;
  }

  const baseReward = calculateReward(job.baseReward, job.maxReward, stars);
  const reward = baseReward + (bonusFish ?? 0);
  earnFish(gameState, reward);
  playSfx('purr');
  playSfx('fish_earn', 0.3);
  gameState.totalJobsCompleted++;
  if (!gameState.completedJobs.includes(job.id)) {
    gameState.completedJobs.push(job.id);
  }

  // Record puzzle stars
  const prev = gameState.puzzlesCompleted[puzzleId] ?? 0;
  if (stars > prev) gameState.puzzlesCompleted[puzzleId] = stars;

  // XP (bonus for puzzle)
  const xpMap: Record<string, number> = { easy: 30, medium: 55, hard: 90 };
  const xp = xpMap[job.difficulty] ?? 30;
  const leveled = addXp(cat, xp);

  // Bond points
  for (const other of gameState.cats) {
    if (other.id !== cat.id) {
      addBondPoints(gameState, cat.breed, other.breed, 3);
    }
  }

  // Mark cat as worked today
  catsWorkedToday.add(cat.id);
  saveGame(gameState);

  showResultOverlay({
    jobName: job.name,
    catName: cat.name,
    reward,
    stars,
    moves,
    minMoves,
    xp,
    leveled,
    isAuto: false,
  });
});

eventBus.on('puzzle-quit', ({ jobId, catId }: any = {}) => {
  switchToNormalMusic();
  playSfx('hiss');
  if (!gameState) return;

  const cat = gameState.cats.find((c) => c.id === catId);
  const job = getJob(jobId);

  // Failure penalty: cat is used for the day, mood drops, lose some fish
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
});

function advanceDay(): { foodCost: number; stationedEarned: number; events: string[] } {
  if (!gameState) return { foodCost: 0, stationedEarned: 0, events: [] };
  gameState.day++;

  // Reset day timer and worked cats
  resetDayTimer();
  catsWorkedToday.clear();

  // Daily upkeep: 2 fish per cat + 1 per unlocked room (guild maintenance)
  const unlockedRooms = gameState.rooms.filter((r) => r.unlocked).length;
  const foodCost = gameState.cats.length * 2 + unlockedRooms;
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
    gameState.fish = 0;
    for (const cat of gameState.cats) {
      if (cat.mood === 'happy') cat.mood = 'content';
      else if (cat.mood === 'content') cat.mood = 'tired';
      else cat.mood = 'unhappy';
    }
    showToast(`Not enough fish to feed ${gameState.cats.length} cats!`);
  }

  // Collect stationed earnings
  const stationedResults = collectStationedEarnings(gameState);
  const stationedTotal = stationedResults.reduce((sum, r) => sum + r.earned, 0);

  // Build day summary
  const parts: string[] = [];
  parts.push(`Upkeep: -${foodCost} fish`);
  if (stationedTotal > 0) {
    parts.push(`Stationed: +${stationedTotal} fish`);
  }
  showToast(`Day ${gameState.day}: ${parts.join(' | ')}`);

  // Show station events
  for (const r of stationedResults) {
    if (r.event) {
      setTimeout(() => showToast(r.event!), 1500);
    }
  }

  processDailyBonds(gameState);
  checkRatPlagueResolution(gameState);
  checkChapterAdvance(gameState);
  saveGame(gameState);
  updateStatusBar();

  const events = stationedResults.filter((r) => r.event).map((r) => r.event!);
  return { foodCost, stationedEarned: stationedTotal, events };
}

interface ResultInfo {
  jobName: string;
  catName: string;
  reward: number;
  stars: number;
  moves?: number;
  minMoves?: number;
  xp: number;
  leveled: boolean;
  isAuto: boolean;
}

function showResultOverlay(info: ResultInfo): void {
  const overlay = document.createElement('div');
  overlay.className = 'result-overlay';

  const starsStr = info.isAuto ? '' : '&#11088;'.repeat(info.stars) + '&#9734;'.repeat(3 - info.stars);
  const movesStr = info.moves != null ? `<br>Moves: ${info.moves} (target: ${info.minMoves})` : '';

  overlay.innerHTML = `
    <h2>${info.isAuto ? 'Job Complete' : 'Puzzle Solved!'}</h2>
    ${starsStr ? `<div class="result-stars">${starsStr}</div>` : ''}
    <div class="result-details">
      <strong>${info.jobName}</strong><br>
      ${info.catName} earned <span class="fish-earned">+${info.reward} Fish</span>
      ${movesStr}
      <br>+${info.xp} XP${info.leveled ? ' — LEVEL UP!' : ''}
    </div>
    <button id="result-continue">Continue</button>
  `;

  overlayLayer.appendChild(overlay);

  document.getElementById('result-continue')!.addEventListener('click', () => {
    overlay.remove();

    // Check for available conversations
    checkAndShowConversation();
  });
}

function checkAndShowConversation(): void {
  if (!gameState) {
    switchScene('GuildhallScene');
    return;
  }

  const catBreeds = gameState.cats.map((c) => c.breed);
  for (const [a, b] of getBondPairs()) {
    if (catBreeds.includes(a) && catBreeds.includes(b)) {
      const rank = getAvailableConversation(gameState, a, b);
      if (rank) {
        showConversation(a, b, rank);
        return;
      }
    }
  }

  switchScene('TownScene');
}

function showConversation(breedA: string, breedB: string, rank: string): void {
  const convos = conversationsData as Record<string, Array<{ rank: string; title: string; lines: Array<{ speaker: string; text: string }> }>>;
  const key1 = `${breedA}_${breedB}`;
  const key2 = `${breedB}_${breedA}`;
  const convoSet = convos[key1] ?? convos[key2];
  if (!convoSet) {
    switchScene('GuildhallScene');
    return;
  }

  const convoMatch = convoSet.find((c) => c.rank === rank);
  if (!convoMatch) {
    switchScene('GuildhallScene');
    return;
  }
  const convo = convoMatch;

  let lineIndex = 0;

  const overlay = document.createElement('div');
  overlay.className = 'conversation-overlay';

  const catA = gameState!.cats.find((c) => c.breed === breedA);
  const catB = gameState!.cats.find((c) => c.breed === breedB);
  const colorA = BREED_COLORS[breedA] ?? '#8b7355';
  const colorB = BREED_COLORS[breedB] ?? '#8b7355';
  const nameA = catA?.name ?? BREED_NAMES[breedA] ?? breedA;
  const nameB = catB?.name ?? BREED_NAMES[breedB] ?? breedB;
  const breedNameA = BREED_NAMES[breedA] ?? breedA;
  const breedNameB = BREED_NAMES[breedB] ?? breedB;

  overlay.innerHTML = `
    <div class="conversation-portraits">
      <div class="conversation-portrait" id="portrait-left" style="background:${colorA}">
        <div class="portrait-name">${nameA}</div>
        <div class="portrait-breed">${breedNameA}</div>
      </div>
      <div class="conversation-portrait" id="portrait-right" style="background:${colorB}">
        <div class="portrait-name">${nameB}</div>
        <div class="portrait-breed">${breedNameB}</div>
      </div>
    </div>
    <div class="conversation-textbox">
      <div class="conversation-speaker" id="conv-speaker"></div>
      <div class="conversation-text" id="conv-text"></div>
      <div class="conversation-advance">Tap to continue</div>
    </div>
  `;

  overlayLayer.appendChild(overlay);

  const speaker = document.getElementById('conv-speaker')!;
  const text = document.getElementById('conv-text')!;
  const portraitLeft = document.getElementById('portrait-left')!;
  const portraitRight = document.getElementById('portrait-right')!;

  function showLine(): void {
    if (lineIndex >= convo.lines.length) {
      // Done
      overlay.remove();
      markConversationViewed(gameState!, breedA, breedB, rank);
      saveGame(gameState!);
      showToast(`Bond deepened: ${nameA} & ${nameB}`);
      switchScene('GuildhallScene');
      return;
    }

    const line = convo.lines[lineIndex];
    const isA = line.speaker === breedA;
    const speakerName = isA ? nameA : nameB;
    const speakerBreed = isA ? breedNameA : breedNameB;
    speaker.innerHTML = `${speakerName} <span class="speaker-breed">${speakerBreed}</span>`;
    text.textContent = line.text;

    portraitLeft.classList.toggle('speaking', isA);
    portraitRight.classList.toggle('speaking', !isA);

    lineIndex++;
  }

  showLine();

  overlay.addEventListener('click', () => {
    showLine();
  });
}

// Cat panel
function showCatPanel(): void {
  if (!gameState) return;

  // Remove existing panels
  overlayLayer.querySelectorAll('.menu-overlay, .assign-overlay').forEach((el) => el.remove());

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.display = 'block';

  let html = `<button class="panel-close" id="cats-close">&times;</button><h2>Your Cats</h2>`;

  gameState.cats.forEach((cat) => {
    const color = BREED_COLORS[cat.breed] ?? '#8b7355';
    const breedName = BREED_NAMES[cat.breed] ?? cat.breed;
    const stationed = gameState!.stationedCats.find((s) => s.catId === cat.id);
    const stationedJob = stationed ? getJob(stationed.jobId) : undefined;

    html += `<div class="cat-card">
      <div class="cat-card-header">
        <div class="cat-avatar" style="background:${color}"></div>
        <div style="flex:1">
          <div class="cat-card-name">${cat.name}${cat.isPlayer ? ' (You)' : ''} <button class="rename-btn" data-cat-id="${cat.id}">Rename</button></div>
          <div class="cat-card-breed">${breedName} | Lv.${cat.level} | ${cat.mood}</div>
        </div>
      </div>
      ${stationedJob ? `<div class="stationed-badge">Stationed: ${stationedJob.name} (since day ${stationed!.dayStarted})<button class="recall-btn" data-cat-id="${cat.id}">Recall</button></div>` : ''}
      <div style="font-size:11px;margin-bottom:4px">
        <label style="color:#6b5b3e">Room: </label>
        <select class="room-select" data-cat-id="${cat.id}" style="background:#2a2520;color:#c4956a;border:1px solid #3a3530;padding:2px 4px;font-size:11px;font-family:Georgia,serif">
          ${gameState!.rooms.filter(r => r.unlocked).map(r => {
            const roomLabel = r.id === 'sleeping' ? 'Sleeping Quarters' : r.id === 'kitchen' ? 'Kitchen' : 'Operations';
            return `<option value="${r.id}" ${cat.assignedRoom === r.id ? 'selected' : ''}>${roomLabel}</option>`;
          }).join('')}
        </select>
      </div>
      <div style="font-size:12px;color:#8b7355;margin-bottom:4px">${cat.traits.map((t: string) => {
        const effects: Record<string, string> = {
          Brave: '+10% hard jobs', Lazy: '-8% all jobs', Curious: '+8% courier',
          Pious: '+5% pest control', 'Night Owl': '+5% all', Skittish: '-10% hard jobs',
          Loyal: '+3% all', Mischievous: 'random ±', Grumpy: '', Playful: '',
        };
        const eff = effects[t];
        return eff ? `<span title="${eff}" style="cursor:help;border-bottom:1px dotted #6b5b3e">${t}</span>` : t;
      }).join(', ')}</div>
      <div class="cat-stats">
        ${STAT_NAMES.map((s) => `<div class="cat-stat"><span>${s}</span><span class="cat-stat-value">${cat.stats[s]}</span></div>`).join('')}
      </div>
    </div>`;
  });

  // Show bonds
  html += `<h3>Bonds</h3>`;
  for (const [a, b] of getBondPairs()) {
    const catA = gameState.cats.find((c) => c.breed === a);
    const catB = gameState.cats.find((c) => c.breed === b);
    if (!catA || !catB) continue;

    const bond = gameState.bonds.find((bd) => {
      const k = [bd.catA, bd.catB].sort().join('_');
      return k === [a, b].sort().join('_');
    });
    const points = bond?.points ?? 0;
    const rank = getBondRank(points);

    html += `<div class="cat-card" style="padding:8px 12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px">${catA.name} & ${catB.name}</span>
        <span style="font-size:12px;color:#8b7355">${rank} (${points}pts)</span>
      </div>
    </div>`;
  }

  panel.innerHTML = html;
  overlayLayer.appendChild(panel);

  document.getElementById('cats-close')!.addEventListener('click', () => panel.remove());

  panel.querySelectorAll('.rename-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const catId = btn.getAttribute('data-cat-id')!;
      const cat = gameState!.cats.find((c) => c.id === catId);
      if (!cat) return;
      panel.remove();
      showRenamePrompt(cat);
    });
  });

  panel.querySelectorAll('.recall-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const catId = btn.getAttribute('data-cat-id')!;
      const cat = gameState!.cats.find((c) => c.id === catId);
      gameState!.stationedCats = gameState!.stationedCats.filter((s) => s.catId !== catId);
      saveGame(gameState!);
      showToast(`${cat?.name ?? 'Cat'} recalled from duty`);
      panel.remove();
      showCatPanel();
    });
  });

  panel.querySelectorAll('.room-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const catId = sel.getAttribute('data-cat-id')!;
      const cat = gameState!.cats.find((c) => c.id === catId);
      if (cat) {
        cat.assignedRoom = (sel as HTMLSelectElement).value;
        saveGame(gameState!);
        showToast(`${cat.name} moved to ${(sel as HTMLSelectElement).value === 'sleeping' ? 'Sleeping Quarters' : (sel as HTMLSelectElement).value === 'kitchen' ? 'Kitchen' : 'Operations'}`);
      }
    });
  });
}

// Rename cat prompt
function showRenamePrompt(cat: typeof gameState extends null ? never : NonNullable<typeof gameState>['cats'][number]): void {
  const prompt = document.createElement('div');
  prompt.className = 'name-prompt-overlay';
  const color = BREED_COLORS[cat.breed] ?? '#8b7355';
  const breedName = BREED_NAMES[cat.breed] ?? cat.breed;
  prompt.innerHTML = `
    <div style="width:60px;height:60px;border-radius:50%;background:${color};border:2px solid #6b5b3e;margin-bottom:16px"></div>
    <h2>Rename ${cat.name}</h2>
    <p>${breedName} | Lv.${cat.level}</p>
    <input type="text" id="rename-input" placeholder="${cat.name}" maxlength="20" autocomplete="off" value="${cat.name}" />
    <button id="rename-submit">Rename</button>
  `;
  overlayLayer.appendChild(prompt);

  const input = document.getElementById('rename-input') as HTMLInputElement;
  const submit = document.getElementById('rename-submit')!;
  input.focus();
  input.select();

  const doRename = () => {
    const newName = input.value.trim();
    if (newName && newName !== cat.name) {
      const oldName = cat.name;
      cat.name = newName;
      if (cat.isPlayer) gameState!.playerCatName = newName;
      saveGame(gameState!);
      showToast(`${oldName} is now ${newName}`);
    }
    prompt.remove();
    showCatPanel();
  };

  submit.addEventListener('click', doRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doRename();
  });
}

// Menu panel
function showMenuPanel(): void {
  if (!gameState) return;

  overlayLayer.querySelectorAll('.panel:not(#panel-overlay)').forEach((el) => el.remove());

  const panel = document.createElement('div');
  panel.className = 'menu-overlay';

  const chapterName = getChapterName(gameState.chapter);
  const progressHint = getNextChapterHint(gameState);

  panel.innerHTML = `
    <button class="panel-close" id="menu-close">&times;</button>
    <h2>Menu</h2>
    <div style="margin-bottom:12px;color:#8b7355;font-size:14px">
      Chapter ${gameState.chapter}: ${chapterName}<br>
      Day ${gameState.day} | ${gameState.cats.length} cats | ${gameState.totalJobsCompleted} jobs done
    </div>
    ${progressHint ? `<div style="margin-bottom:12px;color:#6b8ea6;font-size:12px;font-style:italic">${progressHint}</div>` : ''}
    <div style="margin-bottom:16px;padding:8px 12px;background:rgba(42,37,32,0.6);border-radius:4px;font-size:12px;color:#8b7355">
      <div style="margin-bottom:4px;color:#c4956a">Daily Costs:</div>
      <div>Cat food: ${gameState.cats.length} cats x 2 = ${gameState.cats.length * 2} fish</div>
      <div>Guild upkeep: ${gameState.rooms.filter(r => r.unlocked).length} rooms = ${gameState.rooms.filter(r => r.unlocked).length} fish</div>
      <div style="margin-top:4px;color:#c4956a">Total: ${gameState.cats.length * 2 + gameState.rooms.filter(r => r.unlocked).length} fish/day</div>
    </div>
    <button class="menu-btn" id="menu-save">Save Game</button>
    <button class="menu-btn" id="menu-furniture">Furniture Shop</button>
    <button class="menu-btn" id="menu-mute">${isMuted() ? 'Unmute Music' : 'Mute Music'}</button>
    <button class="menu-btn" id="menu-export">Export Save</button>
    <button class="menu-btn" id="menu-import">Import Save</button>
    <button class="menu-btn danger" id="menu-delete">Delete Save</button>
  `;

  overlayLayer.appendChild(panel);

  document.getElementById('menu-close')!.addEventListener('click', () => panel.remove());

  document.getElementById('menu-save')!.addEventListener('click', () => {
    saveGame(gameState!);
    showToast('Game saved!');
  });

  document.getElementById('menu-furniture')!.addEventListener('click', () => {
    panel.remove();
    showFurnitureShop();
  });

  document.getElementById('menu-mute')!.addEventListener('click', () => {
    const muted = toggleMute();
    panel.remove();
    showMenuPanel();
    showToast(muted ? 'Music muted' : 'Music unmuted');
  });

  document.getElementById('menu-export')!.addEventListener('click', () => {
    saveGame(gameState!);
    const json = localStorage.getItem('clowder_save');
    if (!json) { showToast('No save to export'); return; }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clowder-save-day${gameState!.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Save exported!');
  });

  document.getElementById('menu-import')!.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (!data.cats || !data.day) throw new Error('Invalid save');
          localStorage.setItem('clowder_save', JSON.stringify(data));
          const save = loadGame()!;
          gameState = save;
          eventBus.emit('game-loaded', save);
          panel.remove();
          switchScene('GuildhallScene');
          showToast('Save imported!');
        } catch {
          showToast('Invalid save file');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });

  document.getElementById('menu-delete')!.addEventListener('click', () => {
    if (confirm('Delete your save? This cannot be undone.')) {
      deleteSave();
      gameState = null;
      overlayLayer.querySelectorAll('.menu-overlay').forEach((el) => el.remove());
      switchScene('TitleScene');
      showToast('Save deleted.');
    }
  });
}

// Furniture shop
function showFurnitureShop(): void {
  if (!gameState) return;

  import('./data/furniture.json').then((mod) => {
    const items = mod.default as Array<{ id: string; name: string; cost: number; room: string; width: number; height: number; effect: string; effectValue: number }>;

    const panel = document.createElement('div');
    panel.className = 'menu-overlay';

    let html = `<button class="panel-close" id="shop-close">&times;</button><h2>Furniture Shop</h2>`;
    html += `<div style="margin-bottom:12px;font-size:14px;color:#8b7355">Fish: ${gameState!.fish}</div>`;

    // Group by room
    const rooms = ['sleeping', 'kitchen', 'operations', 'any'];
    for (const room of rooms) {
      const roomItems = items.filter((it) => it.room === room);
      if (roomItems.length === 0) continue;

      const roomUnlocked = room === 'any' || gameState!.rooms.find((r) => r.id === room)?.unlocked;
      html += `<h3>${room === 'any' ? 'Any Room' : room.charAt(0).toUpperCase() + room.slice(1)}${!roomUnlocked ? ' (Locked)' : ''}</h3>`;
      html += `<div class="shop-grid">`;

      for (const item of roomItems) {
        const canBuy = roomUnlocked && gameState!.fish >= item.cost;
        const spriteExists = ['straw_bed', 'scratching_post', 'lantern', 'cushioned_basket', 'bookshelf', 'potted_catnip', 'rug_wool', 'candle_stand'].includes(item.id);
        const spriteImg = spriteExists ? `<img src="assets/sprites/furniture/${item.id}.png" style="width:32px;height:32px;image-rendering:pixelated;margin-bottom:4px" />` : '';
        html += `<div class="shop-item ${canBuy ? '' : 'disabled'}" data-item-id="${item.id}">
          ${spriteImg}
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-cost">${item.cost > 0 ? item.cost + ' Fish' : 'Free'}</div>
        </div>`;
      }

      html += `</div>`;
    }

    panel.innerHTML = html;
    overlayLayer.appendChild(panel);

    document.getElementById('shop-close')!.addEventListener('click', () => panel.remove());

    const placeFurniture = (item: typeof items[number], targetRoom: string) => {
      if (!spendFish(gameState!, item.cost)) return;

      gameState!.furniture.push({
        furnitureId: item.id,
        room: targetRoom,
        gridX: gameState!.furniture.filter((f) => f.room === targetRoom).length % 5,
        gridY: Math.floor(gameState!.furniture.filter((f) => f.room === targetRoom).length / 5),
      });

      saveGame(gameState!);
      const roomLabel = targetRoom === 'sleeping' ? 'Sleeping Quarters' : targetRoom === 'kitchen' ? 'Kitchen' : 'Operations';
      showToast(`Placed ${item.name} in ${roomLabel}!`);
      panel.remove();
      showFurnitureShop();
    };

    panel.querySelectorAll('.shop-item:not(.disabled)').forEach((el) => {
      el.addEventListener('click', () => {
        const itemId = el.getAttribute('data-item-id')!;
        const item = items.find((it) => it.id === itemId)!;

        if (item.room !== 'any') {
          placeFurniture(item, item.room);
        } else {
          // Let the player choose which room
          const unlockedRooms = gameState!.rooms.filter((r) => r.unlocked);
          if (unlockedRooms.length === 1) {
            placeFurniture(item, unlockedRooms[0].id);
          } else {
            const roomPicker = document.createElement('div');
            roomPicker.className = 'assign-overlay';
            roomPicker.innerHTML = `
              <button class="panel-close" id="room-pick-close">&times;</button>
              <h2>Place ${item.name}</h2>
              <div style="color:#8b7355;margin-bottom:12px">Choose a room:</div>
              ${unlockedRooms.map((r) => {
                const label = r.id === 'sleeping' ? 'Sleeping Quarters' : r.id === 'kitchen' ? 'Kitchen' : 'Operations';
                return `<button class="menu-btn room-pick-btn" data-room="${r.id}">${label}</button>`;
              }).join('')}
            `;
            overlayLayer.appendChild(roomPicker);
            document.getElementById('room-pick-close')!.addEventListener('click', () => roomPicker.remove());
            roomPicker.querySelectorAll('.room-pick-btn').forEach((btn) => {
              btn.addEventListener('click', () => {
                roomPicker.remove();
                placeFurniture(item, btn.getAttribute('data-room')!);
              });
            });
          }
        }
      });
    });
  });
}

// Chapter advance notifications
eventBus.on('chapter-advance', (chapter: number) => {
  playSfx('chapter');
  const name = getChapterName(chapter);
  showToast(`Chapter ${chapter}: ${name}`);
});

eventBus.on('rat-plague-start', () => {
  if (gameState) {
    gameState.flags.prePlaguePestJobs = gameState.completedJobs.filter((id) =>
      ['mill_mousing', 'granary_patrol', 'cathedral_mousing', 'warehouse_clearing', 'ship_hold'].includes(id)
    ).length as unknown as boolean;
  }
  showToast('A plague of rats descends upon the town!');
});

eventBus.on('rat-plague-resolved', () => {
  showToast('The rat plague is vanquished! The saints be praised!');
});
