// Day of Rest — the in-universe minigame archive.
//
// Framing (per the Catholic mythlore of the campaign): the campaign days
// are days of work; this mode is the day of rest. The narrative wrap is
// "even guilds rest — sit and revisit a memory, no stakes today." That
// sentence is the entire UX brief — the panel must feel quiet, optional,
// and zero-pressure.
//
// Design principles (from todo/game/minigame-mode/minigame-mode-council.md):
//   - **Never on the title screen.** Lives behind the menu, never ahead
//     of the campaign. The player must have already begun a save to
//     reach it. (Showcase URL/gesture flow loads the demo save into a
//     slot first, *then* the player opens the menu — same path.)
//   - **Progressive unlock by first completion.** Each minigame appears
//     as a locked card until the player has finished it at least once
//     in the campaign (or via the demo save). Unlocked cards show a
//     full sprite/title; locked cards show a silhouette and a one-line
//     hint about how to unlock them.
//   - **No stakes.** Practice runs go through `PracticeMode.beginPracticeRun`
//     so the puzzle-complete/quit handlers in main.ts short-circuit
//     before any reward, XP, mood, or job-flag mutation runs. The player
//     can win, lose, quit, replay — none of it touches the save.
//
// Unlock detection uses `gameState.puzzlesCompleted`, the existing record
// that already tracks per-puzzle star counts. Every minigame writes
// `<type>_<difficulty>` keys into it via main.ts's puzzle-complete
// handler, so checking `Object.keys(...).some(k => k.startsWith(prefix))`
// gives us "have they finished this minigame at least once" for free.
//
// PuzzleScene (Rush Hour) is the exception: it writes the raw config id
// (e.g. "easy_1") instead of a typed prefix, so we treat any key matching
// /^(easy|medium|hard)_\d+$/ as a Rush Hour completion.

import type { SaveData } from '../systems/SaveManager';
import { eventBus } from '../utils/events';
import { beginPracticeRun } from '../systems/PracticeMode';
import { generatePuzzle, getPuzzleByDifficulty } from '../systems/PuzzleGenerator';
import { esc } from '../utils/helpers';

interface MinigameDef {
  /** Display title shown on the card. */
  title: string;
  /** One-line tagline shown under the title. Reads like a memory, not
   *  like a tutorial — it's a "remember when…" prompt. */
  tagline: string;
  /** Phaser scene key to launch. */
  sceneKey: string;
  /** How to detect "this minigame has been completed at least once" by
   *  walking gameState.puzzlesCompleted. Either a key prefix string or
   *  a custom predicate. */
  unlockedBy: { prefix: string } | { test: (keys: string[]) => boolean };
  /** Difficulties this minigame supports. Some are single-difficulty;
   *  most are easy/medium/hard. */
  difficulties: Array<'easy' | 'medium' | 'hard'>;
  /** Extra init data merged into the scene launch payload. catBreed is
   *  passed for scenes that pick visual variations from it. */
  needsBreed?: boolean;
}

/** All 14 minigames, ordered roughly by chapter introduction so the panel
 *  reads as a chronological "memory shelf". */
const MINIGAMES: MinigameDef[] = [
  {
    title: 'Rush Hour',
    tagline: 'Slide blocks. Find the only way out.',
    sceneKey: 'PuzzleScene',
    unlockedBy: { test: (ks) => ks.some((k) => /^(easy|medium|hard)_\d+$/.test(k)) },
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    title: 'Rat Hunt',
    tagline: 'Whack-a-rat. Watch for fakes.',
    sceneKey: 'HuntScene',
    unlockedBy: { prefix: 'hunt_' },
    difficulties: ['easy', 'medium', 'hard'],
    needsBreed: true,
  },
  {
    title: 'The Chase',
    tagline: 'Eat all the dots before the dogs find you.',
    sceneKey: 'ChaseScene',
    unlockedBy: { prefix: 'chase_' },
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    title: 'Fishing',
    tagline: 'Approach. Wait for the bite. Reel.',
    sceneKey: 'FishingScene',
    unlockedBy: { prefix: 'fishing_' },
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    title: 'Courier Run',
    tagline: 'Three lanes. Don\u2019t drop the parcel.',
    sceneKey: 'CourierRunScene',
    unlockedBy: { prefix: 'courier_run_' },
    difficulties: ['easy', 'medium', 'hard'],
    needsBreed: true,
  },
  {
    title: 'Sokoban',
    tagline: 'Push the crates. One door at a time.',
    sceneKey: 'SokobanScene',
    unlockedBy: { prefix: 'sokoban_' },
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    title: 'Picross',
    tagline: 'Read the runes. Mark the cells.',
    sceneKey: 'NonogramScene',
    unlockedBy: { prefix: 'nonogram_' },
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    title: 'Stealth',
    tagline: 'Stay low. Stay in the grass. Stay unseen.',
    sceneKey: 'StealthScene',
    unlockedBy: { prefix: 'stealth_' },
    difficulties: ['easy', 'medium', 'hard'],
    needsBreed: true,
  },
  {
    title: 'Pounce',
    tagline: 'Slingshot. Wood, stone, glass.',
    sceneKey: 'PounceScene',
    unlockedBy: { prefix: 'pounce_' },
    difficulties: ['easy', 'medium', 'hard'],
    needsBreed: true,
  },
  {
    title: 'Brawl',
    tagline: 'Read the windup. Strike the gap.',
    sceneKey: 'BrawlScene',
    unlockedBy: { prefix: 'brawl_' },
    difficulties: ['easy', 'medium', 'hard'],
    needsBreed: true,
  },
  {
    title: 'Patrol',
    tagline: 'Keep the lanterns lit. Watch the dark.',
    sceneKey: 'PatrolScene',
    unlockedBy: { prefix: 'patrol_' },
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    title: 'Sacred Rite',
    tagline: 'Light the candles in the right order.',
    sceneKey: 'RitualScene',
    unlockedBy: { prefix: 'ritual_' },
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    title: 'Scent Trail',
    tagline: 'Hot or cold? Probe the grid.',
    sceneKey: 'ScentTrailScene',
    unlockedBy: { prefix: 'scent_' },
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    title: 'Heist',
    tagline: 'Feel each ring set into place.',
    sceneKey: 'HeistScene',
    unlockedBy: { prefix: 'heist_' },
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    title: 'Roof Scout',
    tagline: 'Climb to the watchpoint. Don\u2019t look down.',
    sceneKey: 'RoofScoutScene',
    unlockedBy: { prefix: 'roof_scout_' },
    difficulties: ['easy', 'medium', 'hard'],
    needsBreed: true,
  },
];

/** Mapping from a minigame's scene key to the localStorage key prefix
 *  used by its first-time tutorial. Clearing keys starting with this
 *  prefix forces the tutorial to show again on the next launch — used
 *  by the Day of Rest "replay tutorial" toggle. */
const SCENE_TUTORIAL_PREFIX: Record<string, string> = {
  ChaseScene: 'clowder_chase_tutorial',
  HuntScene: 'clowder_hunt_tutorial',
  CourierRunScene: 'clowder_courier_tutorial',
  RitualScene: 'clowder_ritual_tutorial',
  PatrolScene: 'clowder_patrol_tutorial',
  BrawlScene: 'clowder_brawl_tutorial',
  NonogramScene: 'clowder_nonogram_tutorial',
  RoofScoutScene: 'clowder_roof_scout_tutorial',
  ScentTrailScene: 'clowder_scent_tutorial',
  StealthScene: 'clowder_stealth_tutorial',
  HeistScene: 'clowder_heist_tutorial',
  PounceScene: 'clowder_pounce_tutorial',
};

/** Force the tutorial for the given scene to show on its next launch
 *  by clearing every localStorage key that starts with the scene's
 *  tutorial prefix (covers v1/v2/v3 versioned keys). */
function clearTutorialFor(sceneKey: string): void {
  const prefix = SCENE_TUTORIAL_PREFIX[sceneKey];
  if (!prefix) return;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) localStorage.removeItem(k);
  }
}

interface DayOfRestDeps {
  getGameState: () => SaveData | null;
  overlayLayer: HTMLElement;
  switchScene: (target: string, data?: object) => void;
  pauseDayTimer: () => void;
  switchToTrackset: (set: string) => void;
  showToast: (msg: string) => void;
  /** Floating wish banner element. The Day of Rest panel is supposed
   *  to be a quiet "no stakes today" view, but the wish banner is a
   *  campaign hook nudging the player to act on a daily desire — both
   *  thematically wrong AND visually distracting from the panel
   *  content. We hide it while the panel is open and restore it on
   *  close (the next render cycle re-evaluates visibility). */
  guildWishBanner: HTMLElement;
}

let deps: DayOfRestDeps;

export function initDayOfRest(d: DayOfRestDeps): void {
  deps = d;
}

/** Returns true if at least one minigame in the catalogue has been
 *  completed by the player. Used by the menu to decide whether to even
 *  show the Day of Rest entry — for a fresh chapter-1 save the panel
 *  would be entirely locked, so we hide it until there's something to
 *  see. */
export function hasAnyDayOfRestUnlock(save: SaveData | null): boolean {
  if (!save) return false;
  const keys = Object.keys(save.puzzlesCompleted ?? {});
  if (keys.length === 0) return false;
  return MINIGAMES.some((mg) => isUnlocked(mg, keys));
}

function isUnlocked(mg: MinigameDef, completedKeys: string[]): boolean {
  if ('prefix' in mg.unlockedBy) {
    const prefix = mg.unlockedBy.prefix;
    return completedKeys.some((k) => k.startsWith(prefix));
  }
  return mg.unlockedBy.test(completedKeys);
}

/** Pause every active Phaser scene so its input handlers stop firing
 *  while the Day of Rest panel is open. Without this, taps on the panel
 *  could fall through to the underlying scene (e.g. clicking "easy" on
 *  the difficulty picker also triggered the recruit-cat prompt because
 *  TownMapScene's pointer handlers fired on the same touch). Returns
 *  the list of scene keys that were paused so they can be resumed if
 *  the player closes the panel without launching a minigame. */
function pauseActiveScenes(): string[] {
  const paused: string[] = [];
  const game = (window as unknown as { __clowderGame?: Phaser.Game }).__clowderGame;
  if (!game) return paused;
  for (const scene of game.scene.getScenes(true)) {
    const key = scene.scene.key;
    if (key === 'BootScene') continue;
    game.scene.pause(key);
    paused.push(key);
  }
  return paused;
}

/** Resume scenes paused by pauseActiveScenes(). No-op for any that have
 *  since been stopped (e.g. switchScene tore them down). */
function resumeScenes(keys: string[]): void {
  const game = (window as unknown as { __clowderGame?: Phaser.Game }).__clowderGame;
  if (!game) return;
  for (const key of keys) {
    if (game.scene.isPaused(key)) game.scene.resume(key);
  }
}

let pausedSceneKeys: string[] = [];

/** Render the Day of Rest panel as an overlay. Called from the menu. */
export function showDayOfRestPanel(): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  // Remove any existing menu overlays so we don't stack on top of the
  // main menu when the player taps "Day of Rest".
  deps.overlayLayer.querySelectorAll('.menu-overlay, .day-of-rest-overlay').forEach((el) => el.remove());

  // Pause underlying Phaser scenes so their pointer handlers don't
  // fire on taps that visually land on the panel. Resumed by the
  // close button (or implicitly stopped by switchScene when the
  // player launches a practice run).
  if (pausedSceneKeys.length === 0) {
    pausedSceneKeys = pauseActiveScenes();
  }

  // Hide the floating wish banner while the panel is open. The Day
  // of Rest is the "no stakes today" view; a wish banner pinned to
  // the top is both thematically wrong and visually competing with
  // the catalogue.
  deps.guildWishBanner.style.display = 'none';

  const completedKeys = Object.keys(gameState.puzzlesCompleted ?? {});
  const unlockedGames = MINIGAMES.filter((mg) => isUnlocked(mg, completedKeys));

  const panel = document.createElement('div');
  panel.className = 'menu-overlay day-of-rest-overlay';

  // Per user feedback (2026-04-08): hide locked games entirely instead
  // of showing them greyed out. The surprise of a new card appearing
  // after a campaign first-clear is more pleasant than a grid full of
  // grey "coming soon" placeholders that spoil the catalogue. Total
  // count is also hidden so the player doesn't know how many more are
  // coming.
  let html = `
    <button class="panel-close" id="dor-close">&times;</button>
    <h2>Day of Rest</h2>
    <div style="margin-bottom:8px;color:#8b7355;font-size:12px;font-style:italic;text-align:center;line-height:1.5">
      Even guilds rest. Sit a while and revisit a memory \u2014<br>these games carry no stakes today.
    </div>
    <div style="margin-bottom:14px;color:#6b5b3e;font-size:11px;text-align:center">
      ${unlockedGames.length} ${unlockedGames.length === 1 ? 'memory' : 'memories'} unlocked
    </div>
    <div class="dor-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
  `;

  for (const mg of unlockedGames) {
    html += `
      <div class="dor-card" data-scene="${mg.sceneKey}" style="background:rgba(42,37,32,0.85);border:1px solid #6b5b3e;cursor:pointer;border-radius:6px;padding:10px 8px">
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:13px;margin-bottom:4px">${esc(mg.title)}</div>
        <div style="color:#8b7355;font-size:10px;line-height:1.3;min-height:26px">${esc(mg.tagline)}</div>
      </div>
    `;
  }

  html += `</div>`;
  panel.innerHTML = html;
  deps.overlayLayer.appendChild(panel);

  document.getElementById('dor-close')!.addEventListener('click', () => {
    panel.remove();
    // Closing the panel without launching anything — resume the scenes
    // we paused on open.
    resumeScenes(pausedSceneKeys);
    pausedSceneKeys = [];
  });

  panel.querySelectorAll('.dor-card').forEach((card) => {
    card.addEventListener('click', () => {
      const sceneKey = card.getAttribute('data-scene')!;
      const mg = MINIGAMES.find((m) => m.sceneKey === sceneKey);
      if (!mg) return;
      panel.remove();
      showDifficultyPicker(mg);
    });
  });
}

/** Brief overlay asking the player to pick a difficulty for the chosen
 *  memory. Most minigames support easy/medium/hard. */
function showDifficultyPicker(mg: MinigameDef): void {
  deps.overlayLayer.querySelectorAll('.day-of-rest-overlay').forEach((el) => el.remove());

  const panel = document.createElement('div');
  panel.className = 'menu-overlay day-of-rest-overlay';

  const buttons = mg.difficulties.map((d) => {
    const label = d.charAt(0).toUpperCase() + d.slice(1);
    return `<button class="menu-btn dor-diff-btn" data-diff="${d}">${label}</button>`;
  }).join('');

  // Tutorial replay toggle — only offer it if this scene has a tutorial
  // we know how to clear. The button toggles a checked state on click;
  // launchPracticeRun reads `replayTutorial` from the panel.dataset.
  const hasTutorial = SCENE_TUTORIAL_PREFIX[mg.sceneKey] !== undefined;
  const tutorialToggleHtml = hasTutorial
    ? `<button class="dor-tutorial-toggle" id="dor-tutorial-toggle" style="display:block;margin:14px auto 0;padding:8px 14px;background:#2a2520;border:1px solid #3a3530;color:#8b7355;border-radius:4px;font-family:Georgia,serif;font-size:11px;cursor:pointer">\u25A1 Replay tutorial</button>`
    : '';

  panel.innerHTML = `
    <button class="panel-close" id="dor-diff-close">&times;</button>
    <h2>${esc(mg.title)}</h2>
    <div style="margin-bottom:14px;color:#8b7355;font-size:12px;font-style:italic;text-align:center">
      ${esc(mg.tagline)}
    </div>
    <div style="margin-bottom:10px;color:#6b5b3e;font-size:11px;text-align:center">Choose a difficulty</div>
    ${buttons}
    ${tutorialToggleHtml}
    <div style="margin-top:10px;color:#555;font-size:10px;text-align:center;font-style:italic">
      No fish, no XP, no penalties \u2014 just the game.
    </div>
  `;
  deps.overlayLayer.appendChild(panel);

  // Tutorial toggle state — flipped on click, read on difficulty pick
  let replayTutorial = false;
  const toggleBtn = document.getElementById('dor-tutorial-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      replayTutorial = !replayTutorial;
      toggleBtn.textContent = replayTutorial ? '\u2611 Replay tutorial' : '\u25A1 Replay tutorial';
      toggleBtn.style.color = replayTutorial ? '#c4956a' : '#8b7355';
      toggleBtn.style.borderColor = replayTutorial ? '#6b5b3e' : '#3a3530';
    });
  }

  document.getElementById('dor-diff-close')!.addEventListener('click', () => {
    panel.remove();
    // Stay paused — showDayOfRestPanel re-opens but its pause guard
    // sees pausedSceneKeys is non-empty and skips the re-pause.
    showDayOfRestPanel();
  });

  panel.querySelectorAll('.dor-diff-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const difficulty = btn.getAttribute('data-diff') as 'easy' | 'medium' | 'hard';
      panel.remove();
      if (replayTutorial) clearTutorialFor(mg.sceneKey);
      launchPracticeRun(mg, difficulty);
    });
  });
}

/** Actually start the minigame in sandbox mode. We synthesize a minimal
 *  init payload — real catId / jobId values are required because the
 *  minigame scenes pass them through to the puzzle-complete event, but
 *  PracticeMode.isPracticeRun() makes the main.ts handler short-circuit
 *  before any of those fields are read for reward calculations. */
function launchPracticeRun(mg: MinigameDef, difficulty: 'easy' | 'medium' | 'hard'): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  const cat = gameState.cats.find((c) => c.isPlayer) ?? gameState.cats[0];
  if (!cat) return;

  // Map the scene key to a track set name (matches the strings used by
  // the normal job launch path in jobFlow.ts so the music transitions
  // line up with the scenes).
  const tracksetMap: Record<string, string> = {
    PuzzleScene: 'puzzle',
    SokobanScene: 'sokoban',
    ChaseScene: 'chase',
    FishingScene: 'fishing',
    HuntScene: 'hunt',
    NonogramScene: 'nonogram',
    StealthScene: 'stealth',
    PatrolScene: 'patrol',
    RitualScene: 'ritual',
    ScentTrailScene: 'scent_trail',
    HeistScene: 'heist',
    CourierRunScene: 'courier_run',
    PounceScene: 'pounce',
    BrawlScene: 'brawl',
  };
  const trackset = tracksetMap[mg.sceneKey] ?? 'normal';

  // Mark the run BEFORE we touch any other state — the puzzle-complete
  // and puzzle-quit handlers check this flag at the very top of their
  // bodies and short-circuit if it's set.
  beginPracticeRun({ resumeTrackset: 'normal' });

  // Clear our paused-scenes tracking — switchScene below will stop them
  // entirely, so there's nothing left to resume.
  pausedSceneKeys = [];

  deps.pauseDayTimer();
  deps.switchToTrackset(trackset);

  // Sentinel job id — the main.ts handlers will see practiceMode and
  // never look it up via getJob(). We pass a string that's clearly not
  // a real job id so anyone debugging a stray code path can grep for it.
  const jobId = `__day_of_rest_${mg.sceneKey}`;
  const baseInit: Record<string, unknown> = {
    difficulty,
    jobId,
    catId: cat.id,
    practiceMode: true,
  };
  if (mg.needsBreed) baseInit.catBreed = cat.breed;

  // PuzzleScene is special — it expects a generated puzzle config in
  // its init data instead of a difficulty string.
  if (mg.sceneKey === 'PuzzleScene') {
    const puzzle = generatePuzzle(difficulty) ?? getPuzzleByDifficulty(difficulty);
    if (!puzzle) {
      deps.showToast('No puzzle available!');
      return;
    }
    deps.switchScene('PuzzleScene', { puzzle, jobId, catId: cat.id, practiceMode: true });
    return;
  }

  deps.switchScene(mg.sceneKey, baseInit);
}
