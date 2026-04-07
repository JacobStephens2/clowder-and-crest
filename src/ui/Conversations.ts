/**
 * Conversation system — bond pair dialogues and group conversations.
 */
import { BREED_COLORS, BREED_NAMES } from '../utils/constants';
import { getBondPairs, getAvailableConversation, markConversationViewed } from '../systems/BondSystem';
import conversationsData from '../data/conversations.json';
import type { SaveData } from '../systems/SaveManager';

// ──── Dialogue Portrait System ────
//
// Conversations show two character portraits Fire-Emblem-style. The system
// optimistically loads from `assets/sprites/portraits/<breed>_<expression>.png`
// (the high-res illustrated register described in todo/ideas/art/art-prompts.md
// → "Dialogue Character Portraits"). If that file doesn't exist yet — which is
// the default until each breed's portraits are generated — it falls back to
// the existing in-game south-facing pixel sprite, with `image-rendering:pixelated`
// applied so the upscale stays crisp.
//
// This means portraits can be added incrementally one breed and one expression
// at a time without any code changes — just drop the PNG into the right path.

type Expression = 'neutral' | 'happy' | 'serious' | 'sad' | 'angry' | 'surprised';

function portraitSrc(breed: string, expression: Expression): string {
  return `assets/sprites/portraits/${breed}_${expression}.png`;
}

function fallbackSpriteSrc(breed: string): string {
  return `assets/sprites/${breed}/south.png`;
}

/**
 * Configure an <img> element to show a portrait. Tries the high-res illustrated
 * portrait first; on 404 swaps to the pixel sprite fallback and toggles
 * `image-rendering:pixelated` so the upscale stays sharp.
 */
function setPortrait(img: HTMLImageElement, breed: string, expression: Expression): void {
  // Reset state — portraits are smooth, sprites are pixelated
  img.style.imageRendering = 'auto';
  img.onerror = () => {
    img.onerror = null; // guard against infinite loops if the fallback also 404s
    img.src = fallbackSpriteSrc(breed);
    img.style.imageRendering = 'pixelated';
  };
  img.src = portraitSrc(breed, expression);
}

export interface ConversationDeps {
  getGameState: () => SaveData | null;
  overlayLayer: HTMLElement;
  saveGame: (data: SaveData) => void;
  showToast: (msg: string) => void;
  switchScene: (target: string) => void;
  suggestEndDay: () => void;
}

let deps: ConversationDeps;

export function initConversations(d: ConversationDeps): void {
  deps = d;
}

export function checkAndShowConversation(): void {
  const gameState = deps.getGameState();
  if (!gameState) {
    deps.switchScene('GuildhallScene');
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

  // Check for group conversations
  if (gameState.cats.length >= 3) {
    const convos = conversationsData as Record<string, any[]>;
    const groupKeys = Object.keys(convos).filter((k) => k.startsWith('group_'));
    for (const key of groupKeys) {
      const viewedKey = `viewed_${key}`;
      if (!gameState.flags[viewedKey]) {
        const shouldTrigger =
          (key === 'group_guild_meeting' && gameState.cats.length >= 4 && gameState.totalJobsCompleted >= 10) ||
          (key === 'group_plague_aftermath' && gameState.flags.ratPlagueResolved) ||
          (key === 'group_celebration' && gameState.totalJobsCompleted >= 25) ||
          (key === 'group_shadow_crisis' && gameState.reputationScore <= -25 && gameState.cats.length >= 3) ||
          (key === 'group_noble_recognition' && gameState.reputationScore >= 25 && gameState.cats.length >= 3) ||
          (key === 'group_rival_defeated' && gameState.flags.rivalDefeated) ||
          (key === 'group_inquisition_verdict' && gameState.flags.inquisitionResolved);
        if (shouldTrigger) {
          gameState.flags[viewedKey] = true;
          deps.saveGame(gameState);
          showGroupConversation(key);
          return;
        }
      }
    }
  }

  deps.switchScene('TownMapScene');
  setTimeout(() => deps.suggestEndDay(), 500);
}

function showGroupConversation(key: string): void {
  const gameState = deps.getGameState();
  if (!gameState) return;
  const convos = conversationsData as Record<string, Array<{ rank: string; title: string; lines: Array<{ speaker: string; text: string }> }>>;
  const convoSet = convos[key];
  if (!convoSet || convoSet.length === 0) { deps.switchScene('TownMapScene'); return; }
  const convo = convoSet[0];

  let lineIndex = 0;
  const overlay = document.createElement('div');
  overlay.className = 'conversation-overlay';

  const portraitsHtml = gameState.cats.slice(0, 5).map((cat) => {
    const color = BREED_COLORS[cat.breed] ?? '#8b7355';
    return `<div class="conversation-portrait" style="background:${color};width:60px;height:60px">
      <img src="assets/sprites/${cat.breed}/south.png" style="width:48px;height:48px;image-rendering:pixelated" />
      <div style="font-size:8px;margin-top:2px">${cat.name}</div>
    </div>`;
  }).join('');

  overlay.innerHTML = `
    <img src="assets/sprites/dialogues/guildhall.png" style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:420px;image-rendering:pixelated;opacity:0.25;pointer-events:none" />
    <div class="conversation-portraits" style="justify-content:center;gap:8px;flex-wrap:wrap">${portraitsHtml}</div>
    <div class="conversation-textbox">
      <div style="color:#c4956a;font-size:12px;margin-bottom:4px">${convo.title}</div>
      <div class="conversation-speaker" id="conv-speaker"></div>
      <div class="conversation-text" id="conv-text"></div>
      <div class="conversation-advance">Tap to continue</div>
      <button id="conv-skip" style="position:absolute;top:10px;right:16px;background:none;border:1px solid #3a3530;color:#6b5b3e;padding:4px 10px;border-radius:4px;font-family:Georgia,serif;font-size:12px;cursor:pointer">Skip</button>
    </div>
  `;
  deps.overlayLayer.appendChild(overlay);

  const speaker = document.getElementById('conv-speaker')!;
  const text = document.getElementById('conv-text')!;

  function showLine(): void {
    if (lineIndex >= convo.lines.length) {
      overlay.remove();
      deps.showToast('A guild moment to remember.');
      deps.switchScene('TownMapScene');
      return;
    }
    const line = convo.lines[lineIndex];
    const cat = gameState!.cats.find((c) => c.breed === line.speaker);
    const name = cat?.name ?? BREED_NAMES[line.speaker] ?? line.speaker;
    const breedName = BREED_NAMES[line.speaker] ?? line.speaker;
    speaker.innerHTML = `${name} <span class="speaker-breed">${breedName}</span>`;
    text.textContent = line.text;
    lineIndex++;
  }

  showLine();
  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'conv-skip') return;
    showLine();
  });
  document.getElementById('conv-skip')!.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.remove();
    deps.switchScene('TownMapScene');
  });
}

function showConversation(breedA: string, breedB: string, rank: string): void {
  const gameState = deps.getGameState();
  const convos = conversationsData as Record<string, Array<{ rank: string; title: string; lines: Array<{ speaker: string; text: string; expression?: Expression }> }>>;
  const key1 = `${breedA}_${breedB}`;
  const key2 = `${breedB}_${breedA}`;
  const convoSet = convos[key1] ?? convos[key2];
  if (!convoSet) { deps.switchScene('GuildhallScene'); return; }

  const convoMatch = convoSet.find((c) => c.rank === rank);
  if (!convoMatch) { deps.switchScene('GuildhallScene'); return; }
  const convo = convoMatch;

  let lineIndex = 0;
  // Track each speaker's most recent expression so the listener keeps showing
  // their last set face instead of resetting to neutral every line.
  let exprA: Expression = 'neutral';
  let exprB: Expression = 'neutral';

  const overlay = document.createElement('div');
  overlay.className = 'conversation-overlay';

  const sceneArt = rank === 'A' ? 'rooftop' : rank === 'B' ? 'granary' : 'guildhall';
  const catA = gameState!.cats.find((c) => c.breed === breedA);
  const catB = gameState!.cats.find((c) => c.breed === breedB);
  const nameA = catA?.name ?? BREED_NAMES[breedA] ?? breedA;
  const nameB = catB?.name ?? BREED_NAMES[breedB] ?? breedB;
  const breedNameA = BREED_NAMES[breedA] ?? breedA;
  const breedNameB = BREED_NAMES[breedB] ?? breedB;

  // Fire Emblem-style layout: full-screen background, large portraits, bottom text box
  overlay.style.cssText = 'position:fixed;inset:0;background:#0a0908;z-index:9999;cursor:pointer;overflow:hidden;';

  // The portrait <img> elements are sized so that 1:1 pixel sprites still
  // render well when the high-res portrait isn't available, and so that
  // taller-than-wide illustrated portraits fit the screen reasonably.
  // height is fixed; width auto to honor the source aspect ratio.
  overlay.innerHTML = `
    <!-- Full-screen scene background -->
    <img src="assets/sprites/dialogues/${sceneArt}.png" style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:100%;height:100%;object-fit:cover;image-rendering:pixelated;opacity:0.3;pointer-events:none" />

    <!-- Large character portraits — left and right.
         Image src is set imperatively below so the high-res portrait fallback
         can be applied per-line as expressions change. -->
    <div id="portrait-left" style="position:absolute;bottom:140px;left:10px;transition:opacity 0.2s,transform 0.2s;transform-origin:bottom left">
      <img id="portrait-img-left" alt="" style="height:240px;width:auto;max-width:55vw;filter:drop-shadow(2px 4px 6px rgba(0,0,0,0.5))" />
    </div>
    <div id="portrait-right" style="position:absolute;bottom:140px;right:10px;transition:opacity 0.2s,transform 0.2s;transform-origin:bottom right">
      <img id="portrait-img-right" alt="" style="height:240px;width:auto;max-width:55vw;filter:drop-shadow(2px 4px 6px rgba(0,0,0,0.5))" />
    </div>

    <!-- Text box at bottom -->
    <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(10,9,8,0.95) 20%);padding:20px 20px 30px;min-height:130px">
      <div id="conv-speaker" style="color:#c4956a;font-family:Georgia,serif;font-size:15px;margin-bottom:6px;font-weight:bold"></div>
      <div id="conv-text" style="color:#d4c5a9;font-family:Georgia,serif;font-size:14px;line-height:1.6"></div>
      <div style="color:#555;font-family:Georgia,serif;font-size:10px;margin-top:8px;text-align:right">Tap to continue</div>
    </div>

    <!-- Skip button -->
    <button id="conv-skip" style="position:absolute;top:12px;right:12px;background:rgba(42,37,32,0.7);border:1px solid #3a3530;color:#6b5b3e;padding:6px 14px;border-radius:4px;font-family:Georgia,serif;font-size:12px;cursor:pointer;z-index:10">Skip</button>
  `;

  deps.overlayLayer.appendChild(overlay);

  const speaker = document.getElementById('conv-speaker')!;
  const text = document.getElementById('conv-text')!;
  const portraitLeft = document.getElementById('portrait-left')!;
  const portraitRight = document.getElementById('portrait-right')!;
  const portraitImgLeft = document.getElementById('portrait-img-left') as HTMLImageElement;
  const portraitImgRight = document.getElementById('portrait-img-right') as HTMLImageElement;

  // Initial portrait load — both characters in their starting expressions.
  // Subsequent lines re-call setPortrait when expressions change.
  setPortrait(portraitImgLeft, breedA, exprA);
  setPortrait(portraitImgRight, breedB, exprB);

  function showLine(): void {
    if (lineIndex >= convo.lines.length) {
      overlay.remove();
      markConversationViewed(gameState!, breedA, breedB, rank);
      deps.saveGame(gameState!);

      if (rank === 'C') {
        deps.showToast(`${nameA} & ${nameB} are getting to know each other... (keep building their bond)`);
      } else if (rank === 'B') {
        deps.showToast(`${nameA} & ${nameB} have more to say... something important is on their mind.`);
      } else {
        deps.showToast(`${nameA} & ${nameB} have reached their deepest bond.`);
      }

      deps.switchScene('TownMapScene');
      return;
    }

    const line = convo.lines[lineIndex];
    const isA = line.speaker === breedA;
    const speakerName = isA ? nameA : nameB;
    const speakerBreed = isA ? breedNameA : breedNameB;
    speaker.innerHTML = `${speakerName} <span style="font-size:11px;color:#8b7355;font-weight:normal;margin-left:6px">${speakerBreed}</span>`;
    text.textContent = line.text;

    // If this line carries an explicit expression, update the speaker's
    // current expression and reload their portrait. Listener keeps their
    // last expression — silence is its own posture.
    if (line.expression) {
      if (isA) {
        exprA = line.expression;
        setPortrait(portraitImgLeft, breedA, exprA);
      } else {
        exprB = line.expression;
        setPortrait(portraitImgRight, breedB, exprB);
      }
    }

    // Fire Emblem style: active speaker bright + scaled up, inactive dimmed
    portraitLeft.style.opacity = isA ? '1' : '0.4';
    portraitLeft.style.transform = isA ? 'scale(1.05)' : 'scale(0.9)';
    portraitRight.style.opacity = isA ? '0.4' : '1';
    portraitRight.style.transform = isA ? 'scale(0.9)' : 'scale(1.05)';

    lineIndex++;
  }

  showLine();

  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'conv-skip') return;
    showLine();
  });

  document.getElementById('conv-skip')!.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.remove();
    markConversationViewed(gameState!, breedA, breedB, rank);
    deps.saveGame(gameState!);
    deps.showToast(`Bond deepened: ${nameA} & ${nameB}`);
    deps.switchScene('TownMapScene');
  });
}
