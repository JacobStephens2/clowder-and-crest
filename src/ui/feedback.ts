import { getCurrentFestival, getDailyWish } from '../systems/GameSystems';
import { generateDailyJobs } from '../systems/JobBoard';
import { getAvailableConversation, getBondPairs, getBondRank } from '../systems/BondSystem';
import { getGuildFocusLines } from '../systems/GuildFocus';
import type { SaveData } from '../systems/SaveManager';

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function showToast(overlayLayer: HTMLElement, message: string, durationMs = 2500): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  overlayLayer.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

interface DayRecap {
  foodCost: number;
  stationedEarned: number;
  events: string[];
  fishRemaining?: number;
}

interface DayTeaser {
  icon: string;
  color: string;
  text: string;
}

function buildDayTeasers(save: SaveData | null, day: number): DayTeaser[] {
  const teasers: DayTeaser[] = [];
  if (!save) return teasers;

  for (const [a, b] of getBondPairs()) {
    const catA = save.cats.find((c) => c.breed === a);
    const catB = save.cats.find((c) => c.breed === b);
    if (!catA || !catB) continue;
    const convoRank = getAvailableConversation(save, a, b);
    if (convoRank) {
      teasers.push({
        icon: '\u2764',
        color: '#cc6677',
        text: `${esc(catA.name)} & ${esc(catB.name)} have something to talk about...`,
      });
      break;
    }
  }

  for (const bond of save.bonds) {
    const rank = getBondRank(bond.points);
    if (rank === 'bonded') continue;
    const nextThreshold = rank === 'stranger' ? 10 : rank === 'acquaintance' ? 25 : 50;
    const progress = bond.points / nextThreshold;
    if (progress >= 0.8 && progress < 1) {
      const catA = save.cats.find((c) => c.breed === bond.catA);
      const catB = save.cats.find((c) => c.breed === bond.catB);
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

  const unhappyCat = save.cats.find((c) => c.mood === 'unhappy' && c.id !== 'player_wildcat');
  if (unhappyCat) {
    teasers.push({
      icon: '\u{1F622}',
      color: '#6b8ea6',
      text: `${esc(unhappyCat.name)} is feeling down — maybe tomorrow will be better.`,
    });
  }

  const festival = getCurrentFestival(day);
  if (festival) {
    teasers.push({
      icon: '\u{1F389}',
      color: '#dda055',
      text: `${festival.name} today!`,
    });
  }

  // Daily wish teaser — show the SPECIFIC wish content (not just a hint)
  // so the player doesn't have to remember to walk back to the guild to
  // check what their cat wants. Per user feedback: "the wishes should
  // be not only hinted at, but the specific of the wish listed".
  const wish = getDailyWish(day, save.cats, save.furniture.map((f) => f.furnitureId));
  if (wish && !save.flags[`wish_day_${day}`]) {
    teasers.push({
      icon: '\u{1F4AD}',
      color: '#dda055',
      text: `${esc(wish.catName)} ${esc(wish.wish)} (5 fish to fulfill)`,
    });
  }

  const previewJobs = generateDailyJobs(save);
  if (previewJobs.length > 0) {
    const teaser = previewJobs[Math.floor(Math.random() * previewJobs.length)];
    teasers.push({
      icon: '',
      color: '#6b8ea6',
      text: `"${teaser.name}" appears on the job board...`,
    });
  }

  return teasers.slice(0, 4);
}

export function showDayTransitionOverlay(
  day: number,
  playBell: () => void,
  save: SaveData | null,
  recap?: DayRecap,
): void {
  playBell();
  const overlay = document.createElement('div');
  overlay.className = 'day-transition-overlay';
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
    for (const event of recap.events) lines.push(event);
    if (lines.length > 0) {
      recapHtml = `<div style="color:#8b7355;font-family:Georgia,serif;font-size:11px;margin-top:12px;text-align:center;max-width:280px">${lines.join('<br>')}</div>`;
    }
  }

  const prioritiesHtml = (save ? getGuildFocusLines(save) : []).map((line) =>
    `<div style="color:${line.color};font-family:Georgia,serif;font-size:10px;margin-top:6px">${line.text}</div>`
  ).join('');

  const teaserHtml = buildDayTeasers(save, day).map((teaser) =>
    `<div style="color:${teaser.color};font-family:Georgia,serif;font-size:10px;margin-top:6px;font-style:italic">${teaser.icon ? `${teaser.icon} ` : ''}${teaser.text}</div>`
  ).join('');

  overlay.innerHTML = `
    <div style="color:#c4956a;font-family:Georgia,serif;font-size:28px;margin-bottom:4px">Day ${day}</div>
    <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:14px">A new day dawns...</div>
    ${recapHtml}
    ${prioritiesHtml}
    ${teaserHtml}
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
