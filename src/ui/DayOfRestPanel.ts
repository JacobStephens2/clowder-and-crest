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
];

interface DayOfRestDeps {
  getGameState: () => SaveData | null;
  overlayLayer: HTMLElement;
  switchScene: (target: string, data?: object) => void;
  pauseDayTimer: () => void;
  switchToTrackset: (set: string) => void;
  showToast: (msg: string) => void;
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

/** Render the Day of Rest panel as an overlay. Called from the menu. */
export function showDayOfRestPanel(): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  // Remove any existing menu overlays so we don't stack on top of the
  // main menu when the player taps "Day of Rest".
  deps.overlayLayer.querySelectorAll('.menu-overlay, .day-of-rest-overlay').forEach((el) => el.remove());

  const completedKeys = Object.keys(gameState.puzzlesCompleted ?? {});
  const unlockedCount = MINIGAMES.filter((mg) => isUnlocked(mg, completedKeys)).length;

  const panel = document.createElement('div');
  panel.className = 'menu-overlay day-of-rest-overlay';

  let html = `
    <button class="panel-close" id="dor-close">&times;</button>
    <h2>Day of Rest</h2>
    <div style="margin-bottom:8px;color:#8b7355;font-size:12px;font-style:italic;text-align:center;line-height:1.5">
      Even guilds rest. Sit a while and revisit a memory \u2014<br>these games carry no stakes today.
    </div>
    <div style="margin-bottom:14px;color:#6b5b3e;font-size:11px;text-align:center">
      ${unlockedCount} / ${MINIGAMES.length} memories unlocked
    </div>
    <div class="dor-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
  `;

  for (const mg of MINIGAMES) {
    const unlocked = isUnlocked(mg, completedKeys);
    const baseStyle = unlocked
      ? 'background:rgba(42,37,32,0.85);border:1px solid #6b5b3e;cursor:pointer'
      : 'background:rgba(20,18,16,0.65);border:1px dashed #3a3530;cursor:default;filter:grayscale(1);opacity:0.55';
    const titleColor = unlocked ? '#c4956a' : '#555';
    const taglineColor = unlocked ? '#8b7355' : '#444';
    const taglineText = unlocked ? mg.tagline : 'Locked \u2014 finish this minigame in a job at least once.';
    html += `
      <div class="dor-card" data-scene="${mg.sceneKey}" data-unlocked="${unlocked ? '1' : '0'}" style="${baseStyle};border-radius:6px;padding:10px 8px">
        <div style="color:${titleColor};font-family:Georgia,serif;font-size:13px;margin-bottom:4px">${esc(mg.title)}</div>
        <div style="color:${taglineColor};font-size:10px;line-height:1.3;min-height:26px">${esc(taglineText)}</div>
      </div>
    `;
  }

  html += `</div>`;
  panel.innerHTML = html;
  deps.overlayLayer.appendChild(panel);

  document.getElementById('dor-close')!.addEventListener('click', () => panel.remove());

  panel.querySelectorAll('.dor-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.getAttribute('data-unlocked') !== '1') return;
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

  panel.innerHTML = `
    <button class="panel-close" id="dor-diff-close">&times;</button>
    <h2>${esc(mg.title)}</h2>
    <div style="margin-bottom:14px;color:#8b7355;font-size:12px;font-style:italic;text-align:center">
      ${esc(mg.tagline)}
    </div>
    <div style="margin-bottom:10px;color:#6b5b3e;font-size:11px;text-align:center">Choose a difficulty</div>
    ${buttons}
    <div style="margin-top:10px;color:#555;font-size:10px;text-align:center;font-style:italic">
      No fish, no XP, no penalties \u2014 just the game.
    </div>
  `;
  deps.overlayLayer.appendChild(panel);

  document.getElementById('dor-diff-close')!.addEventListener('click', () => {
    panel.remove();
    showDayOfRestPanel();
  });

  panel.querySelectorAll('.dor-diff-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const difficulty = btn.getAttribute('data-diff') as 'easy' | 'medium' | 'hard';
      panel.remove();
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
