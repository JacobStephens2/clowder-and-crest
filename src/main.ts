import Phaser from 'phaser';
import { checkForUpdates } from './systems/OtaUpdater';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GuildhallScene } from './scenes/GuildhallScene';
import { TownScene } from './scenes/TownScene';
import { PuzzleScene } from './scenes/PuzzleScene';
import { eventBus } from './utils/events';
import { GAME_WIDTH, GAME_HEIGHT, BREED_COLORS, BREED_NAMES, STAT_NAMES } from './utils/constants';
import {
  type SaveData,
  createDefaultSave,
  saveGame,
  loadGame,
  deleteSave,
} from './systems/SaveManager';
import { createCat, getBreed, addXp } from './systems/CatManager';
import { earnFish, spendFish, calculateReward, calculateAutoResolveReward, collectStationedEarnings, isCatStationed } from './systems/Economy';
import { getJob, getStatMatchScore, type JobDef } from './systems/JobBoard';
import { getPuzzleByDifficulty } from './systems/PuzzleGenerator';
import { addBondPoints, processDailyBonds, getAvailableConversation, markConversationViewed, getBondRank, getBondPairs } from './systems/BondSystem';
import { checkChapterAdvance, checkRatPlagueResolution, getChapterName } from './systems/ProgressionManager';
import conversationsData from './data/conversations.json';

// ──── Game State ────
let gameState: SaveData | null = null;

export function getGameState(): SaveData | null {
  return gameState;
}

// ──── Phaser Game ────
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#1c1b19',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, GuildhallScene, TownScene, PuzzleScene],
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
function updateStatusBar(): void {
  if (!gameState) return;
  statusFish.textContent = `${gameState.fish} Fish`;
  statusDay.textContent = `Day ${gameState.day}`;
  statusChapter.textContent = `Ch. ${gameState.chapter}`;
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
  const sceneKeys = ['GuildhallScene', 'TownScene', 'PuzzleScene', 'TitleScene'];
  for (const key of sceneKeys) {
    if (game.scene.isActive(key) || game.scene.isPaused(key)) {
      game.scene.stop(key);
    }
  }
  game.scene.start(target, data);
}

// ──── Event Handlers ────

// Hide/show UI
eventBus.on('navigate', (target: string) => {
  switchScene(target);
});

eventBus.on('hide-ui', () => {
  statusBar.style.display = 'none';
  bottomBar.style.display = 'none';
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
  overlayLayer.querySelectorAll('.assign-overlay, .conversation-overlay, .result-overlay, .menu-overlay').forEach((el) => el.remove());

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

// Job accept — show cat assignment overlay
eventBus.on('job-accept', ({ job }: { job: JobDef }) => {
  if (!gameState) return;
  showAssignOverlay(job);
});

function showAssignOverlay(job: JobDef): void {
  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';

  const availableCats = gameState!.cats.filter((cat) => !isCatStationed(gameState!, cat.id));

  let html = `
    <button class="panel-close" id="assign-close">&times;</button>
    <h2>${job.name}</h2>
    <div class="job-desc">${job.description}</div>
    <h3>Assign a Cat</h3>
  `;

  if (availableCats.length === 0) {
    html += `<div style="color:#888;font-size:14px;padding:12px 0">All cats are stationed at jobs. Recall one first.</div>`;
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
      <button class="btn-puzzle" id="btn-do-puzzle">Solve Puzzle</button>
      <button class="btn-auto" id="btn-do-auto">Auto-Resolve</button>
    </div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #3a3530">
      <button class="btn-station" id="btn-do-station">Station Here (~${dailyEarning} fish/day)</button>
      <div style="font-size:11px;color:#6b5b3e;margin-top:6px;text-align:center">Cat earns fish daily but can't do other jobs while stationed.</div>
    </div>
  `;

  overlayLayer.appendChild(overlay);

  document.getElementById('choice-close')!.addEventListener('click', () => overlay.remove());

  document.getElementById('btn-do-puzzle')!.addEventListener('click', () => {
    overlay.remove();
    const puzzle = getPuzzleByDifficulty(job.difficulty);
    if (!puzzle) {
      showToast('No puzzle available!');
      return;
    }
    switchScene('PuzzleScene', { puzzle, jobId: job.id, catId: cat.id });
  });

  document.getElementById('btn-do-auto')!.addEventListener('click', () => {
    overlay.remove();
    doAutoResolve(job, cat);
  });

  document.getElementById('btn-do-station')!.addEventListener('click', () => {
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

  // Advance day
  advanceDay();

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
eventBus.on('puzzle-complete', ({ puzzleId, moves, minMoves, stars, jobId, catId }: any) => {
  if (!gameState) return;

  const job = getJob(jobId);
  const cat = gameState.cats.find((c) => c.id === catId);
  if (!job || !cat) {
    switchScene('GuildhallScene');
    return;
  }

  const reward = calculateReward(job.baseReward, job.maxReward, stars);
  earnFish(gameState, reward);
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

  advanceDay();

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

eventBus.on('puzzle-quit', () => {
  // No penalty for quitting
});

function advanceDay(): void {
  if (!gameState) return;
  gameState.day++;

  // Collect stationed earnings
  const stationedResults = collectStationedEarnings(gameState);
  if (stationedResults.length > 0) {
    const totalEarned = stationedResults.reduce((sum, r) => sum + r.earned, 0);
    const names = stationedResults.map((r) => r.catName).join(', ');
    showToast(`Stationed cats earned ${totalEarned} fish (${names})`);
  }

  processDailyBonds(gameState);
  checkRatPlagueResolution(gameState);
  checkChapterAdvance(gameState);
  saveGame(gameState);
  updateStatusBar();
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

  switchScene('GuildhallScene');
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

  overlay.innerHTML = `
    <div class="conversation-portraits">
      <div class="conversation-portrait" id="portrait-left" style="background:${colorA}">${nameA}</div>
      <div class="conversation-portrait" id="portrait-right" style="background:${colorB}">${nameB}</div>
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
    speaker.textContent = isA ? nameA : nameB;
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
        <div>
          <div class="cat-card-name">${cat.name}${cat.isPlayer ? ' (You)' : ''}</div>
          <div class="cat-card-breed">${breedName} | Lv.${cat.level} | ${cat.mood}</div>
        </div>
      </div>
      ${stationedJob ? `<div class="stationed-badge">Stationed: ${stationedJob.name} (since day ${stationed!.dayStarted})<button class="recall-btn" data-cat-id="${cat.id}">Recall</button></div>` : ''}
      <div style="font-size:12px;color:#8b7355;margin-bottom:4px">${cat.traits.join(', ')}</div>
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
}

// Menu panel
function showMenuPanel(): void {
  if (!gameState) return;

  overlayLayer.querySelectorAll('.panel:not(#panel-overlay)').forEach((el) => el.remove());

  const panel = document.createElement('div');
  panel.className = 'menu-overlay';

  const chapterName = getChapterName(gameState.chapter);

  panel.innerHTML = `
    <button class="panel-close" id="menu-close">&times;</button>
    <h2>Menu</h2>
    <div style="margin-bottom:20px;color:#8b7355;font-size:14px">
      Chapter ${gameState.chapter}: ${chapterName}<br>
      Day ${gameState.day} | ${gameState.cats.length} cats | ${gameState.totalJobsCompleted} jobs done
    </div>
    <button class="menu-btn" id="menu-save">Save Game</button>
    <button class="menu-btn" id="menu-furniture">Furniture Shop</button>
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
        html += `<div class="shop-item ${canBuy ? '' : 'disabled'}" data-item-id="${item.id}">
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-cost">${item.cost > 0 ? item.cost + ' Fish' : 'Free'}</div>
        </div>`;
      }

      html += `</div>`;
    }

    panel.innerHTML = html;
    overlayLayer.appendChild(panel);

    document.getElementById('shop-close')!.addEventListener('click', () => panel.remove());

    panel.querySelectorAll('.shop-item:not(.disabled)').forEach((el) => {
      el.addEventListener('click', () => {
        const itemId = el.getAttribute('data-item-id')!;
        const item = items.find((it) => it.id === itemId)!;

        if (spendFish(gameState!, item.cost)) {
          const targetRoom = item.room === 'any'
            ? (gameState!.rooms.find((r) => r.unlocked)?.id ?? 'sleeping')
            : item.room;

          gameState!.furniture.push({
            furnitureId: item.id,
            room: targetRoom,
            gridX: gameState!.furniture.filter((f) => f.room === targetRoom).length % 5,
            gridY: Math.floor(gameState!.furniture.filter((f) => f.room === targetRoom).length / 5),
          });

          saveGame(gameState!);
          showToast(`Placed ${item.name}!`);

          // Refresh shop
          panel.remove();
          showFurnitureShop();
        }
      });
    });
  });
}

// Chapter advance notifications
eventBus.on('chapter-advance', (chapter: number) => {
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
