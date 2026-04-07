import { BREED_NAMES } from '../utils/constants';
import { esc } from '../utils/helpers';
import { getChapterName, getNextChapterHint } from '../systems/ProgressionManager';
import { getReputationLabel } from '../systems/ReputationSystem';
import type { SaveData } from '../systems/SaveManager';
import { calculateDailyUpkeep, calculateStationedDailyIncome } from '../systems/GuildMetrics';

interface IntroPanel {
  text: string;
  scene: 'town' | 'guildhall';
}

interface IntroDeps {
  playSfx: (key: string, volume?: number) => void;
}

export function showIntroStory(catName: string, onComplete: () => void, deps: IntroDeps): void {
  const panels: IntroPanel[] = [
    { text: 'The storm came without warning. Rain hammered the cobblestones as lightning split the sky over the sleeping town.', scene: 'town' },
    { text: `${catName} — thin, soaked, and hungry — stumbled through the market square, seeking shelter from the downpour.`, scene: 'town' },
    { text: `Behind the grain market, ${catName} found a lean-to — little more than a few boards propped against the stone wall. But it was dry, and the smell of mice drifted through the cracks.`, scene: 'guildhall' },
    { text: `On the market wall nearby, a notice fluttered in the wind: "PEST CONTROL NEEDED — Payment in fish." ${catName}'s ears perked up.`, scene: 'guildhall' },
    { text: `${catName} curled up under the lean-to's sagging roof. Tomorrow, there would be work. Tonight, this shelter was enough.`, scene: 'guildhall' },
    { text: `Every guild starts somewhere. ${catName}'s starts here — a stray, a storm, and a lean-to behind the grain market.`, scene: 'town' },
  ];

  let panelIndex = 0;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#0a0908;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:30px;';

  const sceneImg = document.createElement('img');
  sceneImg.style.cssText = 'width:280px;max-height:160px;image-rendering:pixelated;margin-bottom:16px;border-radius:4px;opacity:0.4;object-fit:cover;';
  overlay.appendChild(sceneImg);

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

  const panelSounds: (string | null)[] = ['thunder', null, 'purr', 'job_accept', null, null];
  const introMusic = new Audio('assets/audio/intro.mp3');
  introMusic.volume = 0.4;
  introMusic.loop = false;
  introMusic.play().catch(() => {});

  const rainAmbience = new Audio('assets/sfx/rain_loop.mp3');
  rainAmbience.volume = 0.25;
  rainAmbience.loop = true;
  rainAmbience.play().catch(() => {});

  function finish(): void {
    overlay.style.transition = 'opacity 0.5s';
    overlay.style.opacity = '0';
    const fadeOut = setInterval(() => {
      if (introMusic.volume > 0.05) introMusic.volume -= 0.05;
      if (rainAmbience.volume > 0.03) rainAmbience.volume -= 0.03;
      if (introMusic.volume <= 0.05 && rainAmbience.volume <= 0.03) {
        introMusic.pause();
        rainAmbience.pause();
        clearInterval(fadeOut);
      }
    }, 100);
    setTimeout(() => {
      overlay.remove();
      onComplete();
    }, 500);
  }

  function showPanel(): void {
    if (panelIndex >= panels.length) {
      finish();
      return;
    }
    const panel = panels[panelIndex];
    sceneImg.src = panel.scene === 'town' ? 'assets/sprites/scenes/town.png' : 'assets/sprites/scenes/guildhall.png';
    catImg.style.display = panelIndex >= 1 && panelIndex <= 4 ? 'block' : 'none';
    const sfx = panelSounds[panelIndex];
    if (sfx) setTimeout(() => deps.playSfx(sfx, 0.35), 300);
    textDiv.style.opacity = '0';
    textDiv.textContent = panel.text;
    setTimeout(() => {
      textDiv.style.transition = 'opacity 0.6s';
      textDiv.style.opacity = '1';
    }, 50);
    panelIndex++;
  }

  showPanel();
  overlay.addEventListener('click', (e) => {
    if (e.target === skipBtn) return;
    showPanel();
  });
  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    introMusic.pause();
    rainAmbience.pause();
    overlay.remove();
    onComplete();
  });
  document.body.appendChild(overlay);
}

export function showTutorial(): void {
  const steps = [
    { text: 'Welcome to your guildhall. Your rooms, furniture, and cat moods all feed the daily economy.', highlight: 'canvas' },
    { text: 'Use the Town tab to take jobs, recruit strays, and buy the upgrades that keep the guild afloat.', highlight: 'bottom-bar' },
    { text: 'The top bar tells you whether you are winning the day: fish on hand, day timer, and chapter pressure.', highlight: 'status-bar' },
    { text: 'Pick jobs that match a cat’s stats and traits. Good matches pay better and build the right bonds faster.', highlight: 'bottom-bar' },
    { text: 'Day-end matters: upkeep, stationed income, mood recovery, and tomorrow’s hooks all resolve there. Play for tomorrow, not just this one minigame.', highlight: null },
  ];

  let stepIndex = 0;
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
  bubble.append(textDiv, hint, counter);

  function showStep(): void {
    if (stepIndex >= steps.length) {
      backdrop.remove();
      bubble.remove();
      return;
    }
    const step = steps[stepIndex];
    textDiv.textContent = step.text;
    counter.textContent = `${stepIndex + 1}/${steps.length}`;
    if (step.highlight) {
      const el = document.getElementById(step.highlight) ?? document.querySelector(step.highlight);
      if (el) {
        (el as HTMLElement).style.position = 'relative';
        (el as HTMLElement).style.zIndex = '9998';
        setTimeout(() => {
          (el as HTMLElement).style.zIndex = '';
        }, 5000);
      }
    }
    stepIndex++;
  }

  showStep();
  backdrop.addEventListener('click', showStep);
  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    showStep();
  });
  document.body.append(backdrop, bubble);
}

export function showGuildReport(save: SaveData): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,9,8,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:24px;';
  const chapterName = getChapterName(save.chapter);
  const repLabel = getReputationLabel(save.reputationScore);
  const totalUpkeep = calculateDailyUpkeep(save);
  const stationedCount = save.stationedCats.length;
  const stationedEstimate = calculateStationedDailyIncome(save);
  const progressHint = getNextChapterHint(save);
  const strongest = [...save.cats].sort((a, b) => Object.values(b.stats).reduce((sum, value) => sum + value, 0) - Object.values(a.stats).reduce((sum, value) => sum + value, 0))[0];
  const strongestBreed = BREED_NAMES[strongest?.breed ?? ''] ?? strongest?.breed ?? '';
  const lines: string[] = [];

  lines.push('<div style="color:#c4956a;font-size:18px;margin-bottom:4px">Guild Report</div>');
  lines.push(`<div style="color:#6b5b3e;font-size:11px;margin-bottom:16px">Chapter ${save.chapter}: ${chapterName} | Day ${save.day}</div>`);
  lines.push(`<div style="color:#8b7355;font-size:13px;margin-bottom:8px">${save.cats.length} cats | ${save.fish} fish | ${repLabel} reputation</div>`);
  if (strongest) {
    const specLabel = strongest.specialization ? ` (${strongest.specialization})` : '';
    lines.push(`<div style="font-size:12px;color:#c4956a;margin-bottom:6px">Strongest: <strong>${esc(strongest.name)}</strong> the ${strongestBreed}, Lv.${strongest.level}${specLabel}</div>`);
  }

  const netDaily = stationedEstimate - totalUpkeep;
  lines.push(`<div style="font-size:11px;color:${netDaily >= 0 ? '#4a8a4a' : '#cc6666'};margin-bottom:6px">Daily balance: ${netDaily >= 0 ? '+' : ''}${netDaily} fish/day (upkeep: ${totalUpkeep}, stationed income: ~${stationedEstimate})</div>`);
  if (save.fish < totalUpkeep * 2) {
    lines.push(`<div style="font-size:11px;color:#cc6666;margin-bottom:6px">\u26A0 Low on fish — you can only cover ${Math.floor(save.fish / Math.max(1, totalUpkeep))} more day${save.fish >= totalUpkeep ? 's' : ''} of upkeep.</div>`);
  }

  if (save.flags.ratPlagueStarted && !save.flags.ratPlagueResolved) {
    const progress = Number(save.flags.plaguePestDone ?? 0);
    lines.push(`<div style="font-size:11px;color:#cc6666;margin-bottom:6px">\u{1F400} The Rat Plague is active — ${progress}/5 pest jobs completed. Take plague jobs to resolve it.</div>`);
  }
  if (save.flags.inquisitionStarted && !save.flags.inquisitionResolved) {
    const inqStart = Number(save.flags.inquisitionDayStarted ?? save.day);
    const daysLeft = Math.max(0, 5 - (save.day - inqStart));
    lines.push(`<div style="font-size:11px;color:#bb88cc;margin-bottom:6px">The Inquisitor is watching — ${daysLeft} days remain. Sacred and Guard jobs earn favor.</div>`);
  }
  if (save.chapter >= 6 && !save.flags.rivalDefeated) {
    const rivalInf = Number(save.flags.rivalInfluence ?? 0);
    lines.push(`<div style="font-size:11px;color:#cc8844;margin-bottom:6px">The Silver Paws are contesting jobs — influence: ${rivalInf}. Complete contested jobs to push them out.</div>`);
  }
  if (progressHint) lines.push(`<div style="font-size:11px;color:#6b8ea6;margin-bottom:6px;font-style:italic">Next chapter: ${progressHint}</div>`);

  const lockedRooms = save.rooms.filter((room) => !room.unlocked);
  if (lockedRooms.length > 0) {
    const nextRoom = lockedRooms[0];
    const roomCosts: Record<string, number> = { kitchen: 50, operations: 100 };
    const roomNames: Record<string, string> = { kitchen: 'Kitchen & Pantry', operations: 'Operations Hall' };
    const cost = roomCosts[nextRoom.id] ?? 0;
    if (cost > 0 && save.fish < cost) lines.push(`<div style="font-size:11px;color:#8b7355;margin-bottom:6px">Tip: The ${roomNames[nextRoom.id] ?? nextRoom.id} costs ${cost} fish to unlock.</div>`);
  }

  if (save.cats.length < 6) {
    lines.push('<div style="font-size:11px;color:#8b7355;margin-bottom:6px">Look for stray cats in town to recruit.</div>');
  } else if (stationedCount === 0) {
    lines.push('<div style="font-size:11px;color:#8b7355;margin-bottom:6px">Tip: Station level 2+ cats at jobs for passive daily income.</div>');
  }

  lines.push('<div style="font-size:11px;color:#8b7355;margin-bottom:6px">Tomorrow priority: use the day-end recap to follow up on bonds, low-mood cats, and passive income gaps.</div>');

  overlay.innerHTML = `<div style="max-width:340px;text-align:center;font-family:Georgia,serif">${lines.join('')}<div style="color:#555;font-size:10px;margin-top:16px">Tap to begin</div></div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}
