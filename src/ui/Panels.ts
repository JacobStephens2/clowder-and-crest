import type { SaveData } from '../systems/SaveManager';
import { BREED_COLORS, BREED_NAMES, STAT_NAMES, ALL_BREED_IDS } from '../utils/constants';
import { esc } from '../utils/helpers';
import { getJob } from '../systems/JobBoard';
import { getBondPairs, getBondRank } from '../systems/BondSystem';
import { getChapterName, getNextChapterHint } from '../systems/ProgressionManager';
import { getReputationLabel, getReputationBonuses } from '../systems/ReputationSystem';
import { toggleMute, isMuted, setBgmVolume, getBgmVolume } from '../systems/MusicManager';
import { toggleSfxMute, isSfxMuted, setSfxVolume, getSfxVolume } from '../systems/SfxManager';
import { loadGame, validateAndSanitizeSave } from '../systems/SaveManager';
import { spendFish } from '../systems/Economy';
import { playSfx } from '../systems/SfxManager';
import { eventBus } from '../utils/events';
import { getTraitLabel } from '../systems/CatManager';
import { pausePlaytimeSession, getCurrentSessionMs, formatPlaytime } from '../systems/PlaytimeTracker';
import { isNative, exportSaveToFilesystem } from '../systems/NativeFeatures';

const SPECIALIZATION_CATEGORIES: Record<string, { name: string; desc: string; icon: string }> = {
  pest_control: { name: 'Ratcatcher', desc: '+20% pest control, -5% others', icon: '\uD83D\uDC00' },
  courier: { name: 'Courier', desc: '+20% courier jobs, -5% others', icon: '\uD83D\uDCE8' },
  guard: { name: 'Sentinel', desc: '+20% guard duty, -5% others', icon: '\uD83D\uDEE1\uFE0F' },
  sacred: { name: 'Acolyte', desc: '+20% sacred rites, -5% others', icon: '\u271D\uFE0F' },
  detection: { name: 'Sleuth', desc: '+20% detection, -5% others', icon: '\uD83D\uDD0D' },
  shadow: { name: 'Shadow', desc: '+20% shadow ops, -5% others', icon: '\uD83C\uDF19' },
};

/** Dependencies injected from main.ts that can't be imported directly */
export interface PanelDeps {
  getGameState: () => SaveData | null;
  setGameState: (s: SaveData | null) => void;
  overlayLayer: HTMLElement;
  saveGame: (data: SaveData) => void;
  showToast: (msg: string) => void;
  updateStatusBar: () => void;
  switchScene: (target: string, data?: object) => void;
  stopDayTimer: () => void;
  guildEndDayBtn: HTMLElement;
  guildWishBanner: HTMLElement;
  clearCurrentSave: () => void;
}

let deps: PanelDeps;

export function initPanels(d: PanelDeps): void {
  deps = d;
}

// ──── Cat Panel ────

export function showCatPanel(): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  // Remove existing panels
  deps.overlayLayer.querySelectorAll('.menu-overlay, .assign-overlay').forEach((el) => el.remove());

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.display = 'block';

  let html = `<button class="panel-close" id="cats-close">&times;</button><h2>Your Cats</h2>`;

  gameState.cats.forEach((cat) => {
    const color = BREED_COLORS[cat.breed] ?? '#8b7355';
    const breedName = BREED_NAMES[cat.breed] ?? cat.breed;
    const stationed = gameState!.stationedCats.find((s) => s.catId === cat.id);
    const stationedJob = stationed ? getJob(stationed.jobId) : undefined;

    const spriteExists = (ALL_BREED_IDS as readonly string[]).includes(cat.breed);
    const avatarHtml = spriteExists
      ? `<img src="assets/sprites/${cat.breed}/south.png" style="width:40px;height:40px;image-rendering:pixelated;border-radius:50%;background:${color}" />`
      : `<div class="cat-avatar" style="background:${color}"></div>`;

    html += `<div class="cat-card">
      <div class="cat-card-header">
        ${avatarHtml}
        <div style="flex:1">
          <div class="cat-card-name">${esc(cat.name)}${cat.isPlayer ? ' (You)' : ''} <button class="rename-btn" data-cat-id="${cat.id}">Rename</button></div>
          <div class="cat-card-breed">${breedName} | Lv.${cat.level}${cat.specialization ? ` | ${SPECIALIZATION_CATEGORIES[cat.specialization]?.icon ?? ''} ${SPECIALIZATION_CATEGORIES[cat.specialization]?.name ?? cat.specialization}` : ''} | ${cat.mood}</div>
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
      <div style="font-size:12px;color:#8b7355;margin-bottom:4px">${cat.traits.map((rawTrait: string) => {
        const t = getTraitLabel(rawTrait);
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
  html += `<div style="font-size:10px;color:#555;margin-bottom:8px;padding:0 12px">Cats who work together build bonds. Higher bonds unlock conversations and stat bonuses.</div>`;
  const thresholds = { acquaintance: 10, companion: 25, bonded: 50 };
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
    const rankColors: Record<string, string> = { stranger: '#555', acquaintance: '#8a8a4a', companion: '#6b8ea6', bonded: '#c4956a' };
    const nextThreshold = rank === 'stranger' ? 10 : rank === 'acquaintance' ? 25 : rank === 'companion' ? 50 : null;
    const progressText = nextThreshold ? ` — ${nextThreshold - points} pts to next rank` : ' — Max bond!';

    html += `<div class="cat-card" style="padding:8px 12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px">${esc(catA.name)} & ${esc(catB.name)}</span>
        <span style="font-size:12px;color:${rankColors[rank] ?? '#8b7355'}">${rank}</span>
      </div>
      <div style="font-size:10px;color:#6b5b3e">${points} pts${progressText}</div>
    </div>`;
  }

  panel.innerHTML = html;
  deps.overlayLayer.appendChild(panel);

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
      deps.saveGame(gameState!);
      deps.showToast(`${cat?.name ?? 'Cat'} recalled from duty`);
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
        deps.saveGame(gameState!);
        deps.showToast(`${cat.name} moved to ${(sel as HTMLSelectElement).value === 'sleeping' ? 'Sleeping Quarters' : (sel as HTMLSelectElement).value === 'kitchen' ? 'Kitchen' : 'Operations'}`);
      }
    });
  });
}

// ──── Rename Prompt ────

export function showRenamePrompt(cat: SaveData['cats'][number]): void {
  const gameState = deps.getGameState();
  // Clear any stale name prompts first — prevents stacked prompts where
  // document.getElementById returns the older element and new button clicks
  // silently do nothing.
  document.querySelectorAll('.name-prompt-overlay').forEach((el) => el.remove());

  const prompt = document.createElement('div');
  prompt.className = 'name-prompt-overlay';
  const color = BREED_COLORS[cat.breed] ?? '#8b7355';
  const breedName = BREED_NAMES[cat.breed] ?? cat.breed;
  prompt.innerHTML = `
    <div style="width:60px;height:60px;border-radius:50%;background:${color};border:2px solid #6b5b3e;margin-bottom:16px"></div>
    <h2>Rename ${esc(cat.name)}</h2>
    <p>${breedName} | Lv.${cat.level}</p>
    <input type="text" class="rename-input" placeholder="${esc(cat.name)}" maxlength="20" autocomplete="off" value="${esc(cat.name)}" />
    <button class="rename-submit">Rename</button>
  `;
  deps.overlayLayer.appendChild(prompt);

  // Scope lookups to the new prompt to avoid grabbing any stale DOM node.
  const input = prompt.querySelector<HTMLInputElement>('.rename-input')!;
  const submit = prompt.querySelector<HTMLButtonElement>('.rename-submit')!;
  input.focus();
  input.select();

  const doRename = () => {
    const newName = input.value.trim();
    if (newName && newName !== cat.name) {
      const oldName = cat.name;
      cat.name = newName;
      if (cat.isPlayer) gameState!.playerCatName = newName;
      deps.saveGame(gameState!);
      deps.showToast(`${oldName} is now ${newName}`);
    }
    prompt.remove();
    showCatPanel();
  };

  submit.addEventListener('click', doRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doRename();
  });
}

// ──── Menu Panel ────

export function showMenuPanel(): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  deps.overlayLayer.querySelectorAll('.panel:not(#panel-overlay)').forEach((el) => el.remove());

  const panel = document.createElement('div');
  panel.className = 'menu-overlay';

  const chapterName = getChapterName(gameState.chapter);
  const progressHint = getNextChapterHint(gameState);

  panel.innerHTML = `
    <button class="panel-close" id="menu-close">&times;</button>
    <h2>Menu</h2>
    <div style="margin-bottom:12px;color:#8b7355;font-size:14px">
      Chapter ${gameState.chapter}: ${chapterName}<br>
      Day ${gameState.day} | ${gameState.cats.length} cats | ${gameState.totalJobsCompleted} jobs done<br>
      Reputation: ${getReputationLabel(gameState.reputationScore)} (${gameState.reputationScore > 0 ? '+' : ''}${gameState.reputationScore})
    </div>
    <div style="margin-bottom:8px;padding:6px 12px;background:rgba(42,37,32,0.4);border-radius:4px;font-size:11px;color:#8b7355;font-style:italic">
      ${getReputationBonuses(gameState.reputationScore).description}
    </div>
    ${progressHint ? `<div style="margin-bottom:12px;color:#6b8ea6;font-size:12px;font-style:italic">${progressHint}</div>` : ''}
    <div style="margin-bottom:16px;padding:8px 12px;background:rgba(42,37,32,0.6);border-radius:4px;font-size:12px;color:#8b7355">
      <div style="margin-bottom:4px;color:#c4956a">Daily Costs:</div>
      <div>Cat food: ${gameState.cats.reduce((sum, c) => sum + 2 + Math.max(0, c.level - 1), 0)} fish (scales with level)</div>
      <div>Guild upkeep: ${gameState.rooms.filter(r => r.unlocked).length} rooms = ${gameState.rooms.filter(r => r.unlocked).length} fish</div>
      ${Math.max(0, gameState.chapter - 1) > 0 ? `<div>Guild costs: Chapter ${gameState.chapter} = ${Math.max(0, gameState.chapter - 1) * 2} fish</div>` : ''}
      <div style="margin-top:4px;color:#c4956a">Total: ${gameState.cats.reduce((sum, c) => sum + 2 + Math.max(0, c.level - 1), 0) + gameState.rooms.filter(r => r.unlocked).length + Math.max(0, gameState.chapter - 1) * 2} fish/day</div>
    </div>
    <div style="margin-bottom:16px;padding:8px 12px;background:rgba(42,37,32,0.4);border-radius:4px;font-size:11px;color:#6b5b3e">
      <div style="margin-bottom:4px;color:#8b7355">Guild Statistics:</div>
      <div>Playtime: ${formatPlaytime((gameState.totalPlaytimeMs ?? 0) + getCurrentSessionMs())}</div>
      <div>Days survived: ${gameState.day}</div>
      <div>Total fish earned: ${gameState.totalFishEarned}</div>
      <div>Jobs completed: ${gameState.totalJobsCompleted}</div>
      <div>Bonds formed: ${gameState.bonds.filter(b => b.points >= 10).length}/${gameState.bonds.length}</div>
      <div>Furniture owned: ${gameState.furniture.length}</div>
    </div>
    <button class="menu-btn" id="menu-achievements">Achievements</button>
    <button class="menu-btn" id="menu-journal">Guild Journal</button>
    <button class="menu-btn" id="menu-save">Save Game</button>
    <div style="padding:4px 12px;font-size:10px;color:#555;font-style:italic;text-align:center">Visit the Carpenter in town to buy furniture</div>
    <button class="menu-btn" id="menu-mute">${isMuted() ? 'Unmute Music' : 'Mute Music'}</button>
    <div style="display:flex;align-items:center;gap:8px;padding:0 12px;margin:-4px 0 8px">
      <span style="font-size:11px;color:#8b7355;white-space:nowrap">Music Vol</span>
      <input type="range" id="menu-vol-bgm" min="0" max="100" value="${Math.round(getBgmVolume() * 100)}" style="flex:1;accent-color:#c4956a;height:6px;touch-action:pan-y">
    </div>
    <button class="menu-btn" id="menu-mute-sfx">${isSfxMuted() ? 'Unmute Sound Effects' : 'Mute Sound Effects'}</button>
    <div style="display:flex;align-items:center;gap:8px;padding:0 12px;margin:-4px 0 8px">
      <span style="font-size:11px;color:#8b7355;white-space:nowrap">SFX Vol</span>
      <input type="range" id="menu-vol-sfx" min="0" max="100" value="${Math.round(getSfxVolume() * 100)}" style="flex:1;accent-color:#c4956a;height:6px;touch-action:pan-y">
    </div>
    <button class="menu-btn" id="menu-export">Export Save</button>
    <button class="menu-btn" id="menu-import">Import Save</button>
    <button class="menu-btn" id="menu-quit-title">Quit to Title Screen</button>
    <button class="menu-btn danger" id="menu-restart">Restart Game</button>
    <button class="menu-btn danger" id="menu-delete">Delete Save</button>
  `;

  deps.overlayLayer.appendChild(panel);

  document.getElementById('menu-close')!.addEventListener('click', () => panel.remove());

  document.getElementById('menu-achievements')!.addEventListener('click', () => {
    panel.remove();
    const achievements = [
      { name: 'First Steps', desc: 'Complete your first job', done: gameState!.totalJobsCompleted >= 1 },
      { name: 'The Crew', desc: 'Recruit a second cat', done: gameState!.cats.length >= 2 },
      { name: 'Full House', desc: 'Recruit all 5 cats', done: gameState!.cats.length >= 5 },
      { name: 'Rat Slayer', desc: 'Survive the Rat Plague', done: !!gameState!.flags.ratPlagueResolved },
      { name: 'Fish Mogul', desc: 'Earn 500 total fish', done: gameState!.totalFishEarned >= 500 },
      { name: 'Bond Forger', desc: 'Reach Companion rank with any pair', done: gameState!.bonds.some(b => b.points >= 25) },
      { name: 'Bonded', desc: 'Reach Bonded rank with any pair', done: gameState!.bonds.some(b => b.points >= 50) },
      { name: 'Noble Guild', desc: 'Reach Noble reputation', done: gameState!.reputationScore >= 30 },
      { name: 'Shadow Guild', desc: 'Reach Shadowed reputation', done: gameState!.reputationScore <= -30 },
      { name: 'Veteran', desc: 'Complete 50 jobs', done: gameState!.totalJobsCompleted >= 50 },
      { name: 'Interior Designer', desc: 'Own 10+ furniture items', done: gameState!.furniture.length >= 10 },
      { name: 'Rival Defeated', desc: 'Drive away the Silver Paws', done: !!gameState!.flags.rivalDefeated },
      { name: 'Established', desc: 'Reach Chapter 5', done: gameState!.chapter >= 5 },
      { name: 'Survivor', desc: 'Survive 30 days', done: gameState!.day >= 30 },
    ];
    const earned = achievements.filter(a => a.done).length;
    const ap = document.createElement('div');
    ap.className = 'menu-overlay';
    ap.innerHTML = `
      <button class="panel-close" id="ach-close">&times;</button>
      <h2>Achievements</h2>
      <div style="margin-bottom:12px;color:#8b7355;font-size:13px">${earned}/${achievements.length} earned</div>
      ${achievements.map(a => `
        <div style="padding:6px 12px;margin-bottom:4px;background:rgba(42,37,32,${a.done ? 0.6 : 0.2});border-radius:4px;border-left:3px solid ${a.done ? '#4a8a4a' : '#3a3530'}">
          <div style="color:${a.done ? '#c4956a' : '#555'};font-size:13px">${a.done ? '\u2705' : '\u2B1C'} ${esc(a.name)}</div>
          <div style="color:${a.done ? '#8b7355' : '#444'};font-size:10px">${esc(a.desc)}</div>
        </div>
      `).join('')}
    `;
    deps.overlayLayer.appendChild(ap);
    document.getElementById('ach-close')!.addEventListener('click', () => { ap.remove(); showMenuPanel(); });
  });

  document.getElementById('menu-journal')!.addEventListener('click', () => {
    panel.remove();
    const jp = document.createElement('div');
    jp.className = 'menu-overlay';

    const entries = [...(gameState!.journal ?? [])].reverse();
    const typeIcons: Record<string, string> = {
      chapter: '\uD83D\uDCD6', recruit: '\uD83D\uDC3E', level: '\u2B50',
      bond: '\u2764\uFE0F', event: '\u26A0\uFE0F', specialization: '\uD83C\uDFC5', reputation: '\uD83C\uDFAD',
    };

    jp.innerHTML = `
      <button class="panel-close" id="journal-close">&times;</button>
      <h2>Guild Journal</h2>
      <div style="max-height:400px;overflow-y:auto;padding:4px 0">
        ${entries.length === 0 ? '<div style="color:#6b5b3e;text-align:center;padding:20px">No entries yet. Your story is just beginning.</div>' :
          entries.map((e) => `
            <div style="display:flex;gap:8px;padding:6px 8px;border-bottom:1px solid rgba(107,91,62,0.2);font-size:12px">
              <span style="flex-shrink:0;width:50px;color:#6b5b3e">Day ${e.day}</span>
              <span style="flex-shrink:0">${typeIcons[e.type] ?? '\uD83D\uDCDD'}</span>
              <span style="color:#c4956a">${esc(e.text)}</span>
            </div>
          `).join('')}
      </div>
    `;
    deps.overlayLayer.appendChild(jp);
    document.getElementById('journal-close')!.addEventListener('click', () => { jp.remove(); showMenuPanel(); });
  });

  document.getElementById('menu-save')!.addEventListener('click', () => {
    deps.saveGame(gameState!);
    deps.showToast('Game saved!');
  });

  document.getElementById('menu-mute')!.addEventListener('click', () => {
    const muted = toggleMute();
    panel.remove();
    showMenuPanel();
    deps.showToast(muted ? 'Music muted' : 'Music unmuted');
  });

  document.getElementById('menu-mute-sfx')!.addEventListener('click', () => {
    const muted = toggleSfxMute();
    panel.remove();
    showMenuPanel();
    deps.showToast(muted ? 'Sound effects muted' : 'Sound effects unmuted');
  });

  document.getElementById('menu-vol-bgm')!.addEventListener('input', (e) => {
    setBgmVolume(parseInt((e.target as HTMLInputElement).value) / 100);
  });

  document.getElementById('menu-vol-sfx')!.addEventListener('input', (e) => {
    setSfxVolume(parseInt((e.target as HTMLInputElement).value) / 100);
  });

  document.getElementById('menu-export')!.addEventListener('click', () => {
    deps.saveGame(gameState!);
    const json = JSON.stringify(gameState);
    if (!json) { deps.showToast('No save to export'); return; }
    const filename = `clowder-save-day${gameState!.day}.json`;

    // Capacitor path: write through @capacitor/filesystem to the Android
    // Documents folder. The standard <a download> trick doesn't fire on
    // the WebView (no DownloadListener), so on the APK the export was
    // silently broken. Documents survives APK uninstall, so the player
    // can recover the file after a reinstall by importing it back.
    if (isNative()) {
      exportSaveToFilesystem(filename, json).then((path) => {
        if (path) {
          deps.showToast(`Saved to Documents/${filename} (survives reinstall)`);
        } else {
          deps.showToast('Save export failed — check storage permissions');
        }
      });
      return;
    }

    // Web path: standard <a download>. Works in every desktop browser
    // and modern mobile web; not Capacitor.
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    deps.showToast(`Save exported as ${filename} (check your Downloads folder)`);
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
          const raw = JSON.parse(reader.result as string);
          // Run untrusted save data through the sanitizer — clamps string
          // lengths, strips control characters, validates structure. The
          // render layer escapes HTML entities; this is the belt to that
          // suspenders so a forgotten esc() call can never produce an
          // executable payload.
          const sanitized = validateAndSanitizeSave(raw);
          if (!sanitized) {
            deps.showToast('Invalid save file');
            return;
          }
          deps.setGameState(sanitized);
          deps.saveGame(sanitized);
          const save = loadGame()!;
          deps.setGameState(save);
          eventBus.emit('game-loaded', save);
          panel.remove();
          deps.switchScene('GuildhallScene');
          deps.showToast('Save imported!');
        } catch {
          deps.showToast('Invalid save file');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });

  document.getElementById('menu-quit-title')!.addEventListener('click', () => {
    const gs = deps.getGameState();
    if (gs) deps.saveGame(gs); // commits in-flight playtime delta
    pausePlaytimeSession();    // clear in-memory session before leaving the world
    deps.stopDayTimer();
    deps.setGameState(null);
    deps.overlayLayer.querySelectorAll('.menu-overlay, .town-overlay, .assign-overlay').forEach((el) => el.remove());
    deps.guildEndDayBtn.style.display = 'none';
    deps.guildWishBanner.style.display = 'none';
    deps.switchScene('TitleScene');
  });

  document.getElementById('menu-restart')!.addEventListener('click', () => {
    if (confirm('Restart the game? Your current save will be deleted and you will start fresh.')) {
      deps.clearCurrentSave();
      pausePlaytimeSession();
      deps.setGameState(null);
      deps.stopDayTimer();
      deps.overlayLayer.querySelectorAll('.menu-overlay, .town-overlay, .assign-overlay').forEach((el) => el.remove());
      eventBus.emit('show-name-prompt');
    }
  });

  document.getElementById('menu-delete')!.addEventListener('click', () => {
    if (confirm('Delete your save? This cannot be undone.')) {
      deps.clearCurrentSave();
      pausePlaytimeSession();
      deps.setGameState(null);
      deps.overlayLayer.querySelectorAll('.menu-overlay').forEach((el) => el.remove());
      deps.switchScene('TitleScene');
      deps.showToast('Save deleted.');
    }
  });
}

// ──── Furniture Shop ────

export function showFurnitureShop(): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  import('../data/furniture.json').then((mod) => {
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
        const spriteExists = true; // All furniture items have sprites
        const spriteImg = spriteExists ? `<img src="assets/sprites/furniture/${item.id}.png" style="width:32px;height:32px;image-rendering:pixelated;margin-bottom:4px" />` : '';
        html += `<div class="shop-item ${canBuy ? '' : 'disabled'}" data-item-id="${item.id}">
          ${spriteImg}
          <div class="shop-item-name">${esc(item.name)}</div>
          <div class="shop-item-cost">${item.cost > 0 ? item.cost + ' Fish' : 'Free'}</div>
        </div>`;
      }

      html += `</div>`;
    }

    panel.innerHTML = html;
    deps.overlayLayer.appendChild(panel);

    document.getElementById('shop-close')!.addEventListener('click', () => panel.remove());

    const placeFurniture = (item: typeof items[number], targetRoom: string) => {
      if (!spendFish(gameState!, item.cost)) return;

      gameState!.furniture.push({
        furnitureId: item.id,
        room: targetRoom,
        gridX: gameState!.furniture.filter((f) => f.room === targetRoom).length % 5,
        gridY: Math.floor(gameState!.furniture.filter((f) => f.room === targetRoom).length / 5),
      });

      deps.saveGame(gameState!);
      const roomLabel = targetRoom === 'sleeping' ? 'Sleeping Quarters' : targetRoom === 'kitchen' ? 'Kitchen' : 'Operations';
      playSfx('furniture');
      deps.showToast(`Placed ${item.name} in ${roomLabel}!`);
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
              <h2>Place ${esc(item.name)}</h2>
              <div style="color:#8b7355;margin-bottom:12px">Choose a room:</div>
              ${unlockedRooms.map((r) => {
                const label = r.id === 'sleeping' ? 'Sleeping Quarters' : r.id === 'kitchen' ? 'Kitchen' : 'Operations';
                return `<button class="menu-btn room-pick-btn" data-room="${r.id}">${label}</button>`;
              }).join('')}
            `;
            deps.overlayLayer.appendChild(roomPicker);
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
