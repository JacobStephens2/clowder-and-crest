import { ALL_BREED_IDS, BREED_COLORS, BREED_NAMES } from '../utils/constants';
import type { SaveData } from '../systems/SaveManager';
import type { JobDef } from '../systems/JobBoard';
import { getStatMatchScore } from '../systems/JobBoard';
import { generatePuzzle, getPuzzleByDifficulty } from '../systems/PuzzleGenerator';
import { isCatStationed } from '../systems/Economy';
import { hasTrait } from '../systems/CatManager';
import { getJobMomentLines } from '../systems/GuildFocus';

export interface ResultInfo {
  jobName: string;
  catName: string;
  catId: string;
  reward: number;
  stars: number;
  moves?: number;
  minMoves?: number;
  xp: number;
  leveled: boolean;
  highlights?: string[];
}

export const SPECIALIZATION_CATEGORIES: Record<string, { name: string; desc: string; icon: string }> = {
  pest_control: { name: 'Ratcatcher', desc: '+20% pest control, -5% others', icon: '\uD83D\uDC00' },
  courier: { name: 'Courier', desc: '+20% courier jobs, -5% others', icon: '\uD83D\uDCE8' },
  guard: { name: 'Sentinel', desc: '+20% guard duty, -5% others', icon: '\uD83D\uDEE1\uFE0F' },
  sacred: { name: 'Acolyte', desc: '+20% sacred rites, -5% others', icon: '\u271D\uFE0F' },
  detection: { name: 'Sleuth', desc: '+20% detection, -5% others', icon: '\uD83D\uDD0D' },
  shadow: { name: 'Shadow', desc: '+20% shadow ops, -5% others', icon: '\uD83C\uDF19' },
};

interface JobFlowDeps {
  overlayLayer: HTMLElement;
  getGameState: () => SaveData | null;
  saveGame: (data: SaveData) => void;
  showToast: (message: string) => void;
  switchScene: (target: string, data?: object) => void;
  refreshTownOverlay: () => void;
  pauseDayTimer: () => void;
  switchToFightMusic: () => void;
  switchToPuzzleMusic: () => void;
  switchToNormalMusic: () => void;
  /** Switch to a per-scene track set (e.g. 'chase', 'hunt', 'sokoban').
   *  See MusicManager.TRACK_SETS for valid names. New code should use
   *  this instead of the legacy 3-mode functions. */
  switchToTrackset: (setName: string) => void;
  playSfx: (key: string, volume?: number) => void;
  trackEvent: (event: string, detail?: Record<string, unknown>) => void;
  addJournalEntry: (save: SaveData, text: string, type: 'chapter' | 'recruit' | 'level' | 'bond' | 'event' | 'specialization' | 'reputation') => void;
  onAfterResult: () => void;
  onSpecializationChosen: () => void;
  catsWorkedToday: Set<string>;
}

let deps: JobFlowDeps;

export function initJobFlow(d: JobFlowDeps): void {
  deps = d;
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function closeToTownIfNeeded(): void {
  if (!deps.overlayLayer.querySelector('.town-overlay')) deps.refreshTownOverlay();
}

function getChoiceGuidance(job: JobDef, cat: SaveData['cats'][number]): string[] {
  const guidance: string[] = [];
  if (cat.specialization === job.category) guidance.push('Specialization matches this job, so long-term XP here compounds well.');
  if (!cat.specialization && cat.level >= 4) guidance.push('This cat is close to specialization; repeated work in the same category will define its role.');
  if (job.category === 'guard' || job.category === 'sacred') guidance.push('This work pushes the guild toward Crest-aligned play and safer civic standing.');
  if (job.category === 'detection' || job.category === 'shadow') guidance.push('This work strengthens the guild’s shadow side and unlock pressure/reputation tradeoffs.');
  if (job.category === 'pest_control' && cat.stats.hunting >= 6) guidance.push('Strong hunting cats make this one of the cleanest fish-to-risk conversions in the roster.');
  if (job.category === 'courier' && hasTrait(cat, 'curious')) guidance.push('Curious cats can turn courier work into unusually efficient income.');
  return guidance.slice(0, 2);
}

export function showAssignOverlay(job: JobDef): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';
  const availableCats = gameState.cats.filter((cat) => !isCatStationed(gameState, cat.id) && !deps.catsWorkedToday.has(cat.id));

  let html = `
    <button class="panel-close" id="assign-close">&times;</button>
    <h2>${job.name}</h2>
    <div class="job-desc">${job.description}</div>
    <h3>Assign a Cat</h3>
  `;

  if (availableCats.length === 0) {
    const allStationed = gameState.cats.every((cat) => isCatStationed(gameState, cat.id));
    const reason = allStationed ? 'All cats are stationed at jobs. Recall one first.' : 'All cats have worked today. Wait for a new day.';
    html += `<div style="color:#888;font-size:14px;padding:12px 0">${reason}</div>`;
  }

  html += `<div style="font-size:11px;color:#6b5b3e;margin-bottom:8px">Key stats: ${job.keyStats.join(', ')}</div>`;
  const sortedCats = availableCats.slice().sort((a, b) => getStatMatchScore(b, job) - getStatMatchScore(a, job));

  for (const cat of sortedCats) {
    const catIndex = gameState.cats.indexOf(cat);
    const statBadges = job.keyStats.map((s) => {
      const val = cat.stats[s];
      const color = val >= 7 ? '#4a8a4a' : val >= 4 ? '#8a8a4a' : '#8a4a4a';
      return `<span style="color:${color}">${s} ${val}</span>`;
    }).join(' <span style="color:#3a3a3a">|</span> ');

    const traitEffects: string[] = [];
    if (hasTrait(cat, 'brave') && job.difficulty === 'hard') traitEffects.push('Brave +');
    if (hasTrait(cat, 'lazy')) traitEffects.push('Lazy -');
    if (hasTrait(cat, 'curious') && job.category === 'courier') traitEffects.push('Curious +');
    if (hasTrait(cat, 'skittish') && job.difficulty === 'hard') traitEffects.push('Skittish -');
    if (cat.mood === 'happy') traitEffects.push('Happy +');
    else if (cat.mood === 'unhappy') traitEffects.push('Unhappy -');
    else if (cat.mood === 'tired') traitEffects.push('Tired -');

    const spriteImg = (ALL_BREED_IDS as readonly string[]).includes(cat.breed)
      ? `<img src="assets/sprites/${cat.breed}/south.png" style="width:36px;height:36px;image-rendering:pixelated;border-radius:50%;background:${BREED_COLORS[cat.breed] ?? '#8b7355'}" />`
      : `<div class="cat-avatar" style="background:${BREED_COLORS[cat.breed] ?? '#8b7355'};width:36px;height:36px;border-radius:50%;"></div>`;

    const guidance = getChoiceGuidance(job, cat);
    html += `
      <button class="assign-cat-btn" data-cat-index="${catIndex}">
        ${spriteImg}
        <div style="flex:1">
          <div style="color:#c4956a">${esc(cat.name)} <span style="font-size:11px;color:#6b5b3e">${BREED_NAMES[cat.breed] ?? cat.breed}</span>${cat.specialization ? ` <span style="font-size:10px;color:${cat.specialization === job.category ? '#6b8ea6' : '#6b5b3e'}">${SPECIALIZATION_CATEGORIES[cat.specialization]?.icon ?? ''} ${SPECIALIZATION_CATEGORIES[cat.specialization]?.name ?? ''}</span>` : ''}</div>
          <div style="font-size:12px">${statBadges}</div>
          ${traitEffects.length > 0 ? `<div style="font-size:10px;color:#8b7355">${traitEffects.join(' | ')}</div>` : ''}
          ${guidance.length > 0 ? `<div style="font-size:10px;color:#6b8ea6;margin-top:3px">${guidance.join(' ')}</div>` : ''}
        </div>
      </button>
    `;
  }

  overlay.innerHTML = html;
  deps.overlayLayer.appendChild(overlay);

  document.getElementById('assign-close')?.addEventListener('click', () => {
    overlay.remove();
    closeToTownIfNeeded();
  });

  overlay.querySelectorAll('.assign-cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catIndex = parseInt(btn.getAttribute('data-cat-index')!, 10);
      overlay.remove();
      showChoiceOverlay(job, catIndex);
    });
  });
}

export function showChoiceOverlay(job: JobDef, catIndex: number): void {
  const gameState = deps.getGameState();
  if (!gameState) return;
  const cat = gameState.cats[catIndex];
  const match = getStatMatchScore(cat, job);
  const dailyEarning = Math.max(1, Math.floor(job.baseReward * 0.5 + job.baseReward * match * 0.5));
  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';

  const guidance = getChoiceGuidance(job, cat);
  const momentLines = getJobMomentLines(gameState, job, cat);
  const guidanceHtml = guidance.map((line) => `<div style="font-size:11px;color:#6b8ea6;margin-top:4px;text-align:center">${line}</div>`).join('');
  const momentHtml = momentLines.length > 0
    ? `<div style="margin-top:10px;padding:8px 10px;border:1px solid #3a3530;border-radius:6px;background:rgba(24,22,19,0.55)">
        <div style="font-size:10px;color:#c4956a;text-align:center;margin-bottom:4px">Why This Matters Today</div>
        ${momentLines.map((line) => `<div style="font-size:10px;color:#8b7355;margin-top:3px;text-align:center">${line}</div>`).join('')}
      </div>`
    : '';

  overlay.innerHTML = `
    <button class="panel-close" id="choice-close">&times;</button>
    <h2>${job.name}</h2>
    <div class="job-desc">${esc(cat.name)} the ${BREED_NAMES[cat.breed] ?? cat.breed} is ready.</div>
    <div style="font-size:11px;color:#6b5b3e;margin-bottom:8px;text-align:center">Choose your approach:</div>
    ${guidanceHtml}
    ${momentHtml}
    <div class="assign-choice" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:10px">
      ${(() => {
        const ch = gameState.chapter ?? 1;
        const opts: string[] = [];
        const add = (game: string, label: string, minChapter: number) => {
          if (ch >= minChapter) opts.push(`<button class="btn-puzzle minigame-btn" data-game="${game}" style="flex:1;min-width:140px">${label}</button>`);
        };
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
        if (opts.length === 0) add('chase', '\u{1F400} Chase', 1);
        return opts.join('\n');
      })()}
    </div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #3a3530">
      ${cat.level >= 2
        ? `<button class="btn-station" id="btn-do-station">Station Here (~${dailyEarning} fish/day)</button>
           <div style="font-size:11px;color:#6b5b3e;margin-top:6px;text-align:center">Stationing trades today’s active reward for steadier income. Rotate after 5 days for best returns.</div>`
        : `<div style="font-size:12px;color:#555;text-align:center;padding:8px 0">Stationing unlocks at level 2</div>`
      }
    </div>
  `;

  deps.overlayLayer.appendChild(overlay);
  document.getElementById('choice-close')?.addEventListener('click', () => {
    overlay.remove();
    closeToTownIfNeeded();
  });

  const startMinigame = (gameType: string) => {
    overlay.remove();
    deps.overlayLayer.querySelectorAll('.town-overlay, .assign-overlay').forEach((el) => el.remove());
    // Each minigame has its own dedicated track in the shared-leitmotif
    // music set. The gameType string ('chase', 'hunt', 'sokoban', etc.)
    // matches the track-set name in MusicManager directly.
    deps.switchToTrackset(gameType);
    deps.pauseDayTimer();

    switch (gameType) {
      case 'fishing':
        deps.switchScene('FishingScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'chase':
        deps.switchScene('ChaseScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'sokoban':
        deps.switchScene('SokobanScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'hunt':
        deps.switchScene('HuntScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'nonogram':
        deps.switchScene('NonogramScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'stealth':
        deps.switchScene('StealthScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'patrol':
        deps.switchScene('PatrolScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'ritual':
        deps.switchScene('RitualScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'scent_trail':
        deps.switchScene('ScentTrailScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'heist':
        deps.switchScene('HeistScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id });
        break;
      case 'courier_run':
        deps.switchScene('CourierRunScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'pounce':
        deps.switchScene('PounceScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'brawl':
        deps.switchScene('BrawlScene', { difficulty: job.difficulty, jobId: job.id, catId: cat.id, catBreed: cat.breed });
        break;
      case 'puzzle':
      default: {
        const puzzle = generatePuzzle(job.difficulty) ?? getPuzzleByDifficulty(job.difficulty);
        if (!puzzle) {
          deps.showToast('No puzzle available!');
          return;
        }
        deps.switchScene('PuzzleScene', { puzzle, jobId: job.id, catId: cat.id });
        break;
      }
    }
  };

  overlay.querySelectorAll('.minigame-btn').forEach((btn) => {
    btn.addEventListener('click', () => startMinigame(btn.getAttribute('data-game') ?? 'puzzle'));
  });

  document.getElementById('btn-do-station')?.addEventListener('click', () => {
    overlay.remove();
    gameState.stationedCats.push({ catId: cat.id, jobId: job.id, dayStarted: gameState.day });
    deps.saveGame(gameState);
    deps.showToast(`${esc(cat.name)} stationed at ${job.name}`);
    deps.switchScene('TownMapScene');
  });
}

export function showSpecializationChoice(catId: string, catName: string): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';
  const buttons = Object.entries(SPECIALIZATION_CATEGORIES).map(([key, spec]) => `
    <button class="spec-btn" data-spec="${key}" style="display:flex;align-items:center;gap:8px;padding:10px 16px;margin:4px 0;width:100%;background:rgba(42,37,32,0.6);border:1px solid #6b5b3e;border-radius:6px;color:#c4956a;font-size:13px;cursor:pointer;font-family:Georgia,serif">
      <span style="font-size:20px">${spec.icon}</span>
      <span><strong>${spec.name}</strong><br><span style="font-size:11px;color:#8b7355">${spec.desc}</span></span>
    </button>
  `).join('');

  overlay.innerHTML = `
    <h2 style="color:#dda055">Specialization!</h2>
    <div style="color:#c4956a;font-size:14px;margin-bottom:8px;text-align:center">${catName} has reached maximum level.</div>
    <div style="color:#8b7355;font-size:12px;margin-bottom:16px;text-align:center">
      Choose a permanent specialization. This locks in a role, gives +20% in one category, and slightly weakens the others.
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto">${buttons}</div>
  `;
  deps.overlayLayer.appendChild(overlay);

  overlay.querySelectorAll('.spec-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spec = (btn as HTMLElement).dataset.spec!;
      const cat = gameState.cats.find((entry) => entry.id === catId);
      if (cat) {
        cat.specialization = spec;
        const specName = SPECIALIZATION_CATEGORIES[spec].name;
        deps.addJournalEntry(gameState, `${catName} specialized as a ${specName}.`, 'specialization');
        deps.saveGame(gameState);
        deps.playSfx('chapter');
        deps.showToast(`${catName} specialized as a ${specName}!`);
      }
      overlay.remove();
      deps.onSpecializationChosen();
    });
  });
}

export function showResultOverlay(info: ResultInfo): void {
  const gameState = deps.getGameState();
  const overlay = document.createElement('div');
  overlay.className = 'result-overlay';
  const starsStr = '&#11088;'.repeat(info.stars) + '&#9734;'.repeat(3 - info.stars);
  const movesStr = info.moves != null ? `<br>Moves: ${info.moves} (target: ${info.minMoves})` : '';
  const strategicReads = [
    info.stars === 3 ? 'Perfect clears snowball your economy fastest.' : 'A clear still advances bonds, XP, and the day economy.',
    gameState ? `Guild balance after this job: ${gameState.fish} fish.` : '',
    info.leveled ? `${info.catName} is pushing deeper into a long-term role.` : 'Keep repeating strong-fit work to shape this cat’s eventual specialization.',
  ].filter(Boolean).map((line) => `<div style="font-size:11px;color:#6b8ea6;margin-top:4px">${line}</div>`).join('');
  const highlightHtml = (info.highlights ?? []).slice(0, 3).map((line) =>
    `<div style="font-size:10px;color:#c4956a;margin-top:4px">${esc(line)}</div>`
  ).join('');

  deps.playSfx('victory');
  deps.trackEvent('job_completed', { stars: info.stars, reward: info.reward, job: info.jobName });
  if (info.stars === 3) deps.playSfx('chapter', 0.3);

  overlay.innerHTML = `
    <h2>${info.stars === 3 ? '\u2728 Perfect! \u2728' : 'Puzzle Solved!'}</h2>
    ${starsStr ? `<div class="result-stars">${starsStr}</div>` : ''}
    <div class="result-details">
      <strong>${info.jobName}</strong><br>
      ${info.catName} earned <span class="fish-earned">+${info.reward} Fish</span>
      ${movesStr}
      <br>+${info.xp} XP
    </div>
    ${info.leveled ? `<div style="color:#dda055;font-size:18px;margin-bottom:12px;animation:fadeSlideIn 0.5s ease">\u2B50 LEVEL UP! \u2B50<br><span style="font-size:13px">${info.catName} is now stronger.</span></div>` : ''}
    ${highlightHtml ? `<div style="margin:10px 0 4px;padding:8px 10px;border:1px solid #3a3530;border-radius:6px;background:rgba(24,22,19,0.55)">${highlightHtml}</div>` : ''}
    ${strategicReads}
    <div style="font-size:12px;color:#6b5b3e;margin:16px 0">Balance: ${gameState?.fish ?? 0} fish</div>
    <button id="result-continue">Continue</button>
  `;

  deps.overlayLayer.appendChild(overlay);
  document.getElementById('result-continue')?.addEventListener('click', () => {
    overlay.remove();
    const resultCat = deps.getGameState()?.cats.find((c) => c.id === info.catId);
    if (info.leveled && resultCat && resultCat.level >= 5 && !resultCat.specialization) {
      showSpecializationChoice(info.catId, info.catName);
      return;
    }
    deps.onAfterResult();
  });
}
