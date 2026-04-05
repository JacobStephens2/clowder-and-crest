/**
 * Conversation system — bond pair dialogues and group conversations.
 */
import { BREED_COLORS, BREED_NAMES } from '../utils/constants';
import { getBondPairs, getAvailableConversation, markConversationViewed } from '../systems/BondSystem';
import conversationsData from '../data/conversations.json';
import type { SaveData } from '../systems/SaveManager';

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
          (key === 'group_noble_recognition' && gameState.reputationScore >= 25 && gameState.cats.length >= 3);
        if (shouldTrigger) {
          gameState.flags[viewedKey] = true;
          deps.saveGame(gameState);
          showGroupConversation(key);
          return;
        }
      }
    }
  }

  deps.switchScene('TownScene');
  setTimeout(() => deps.suggestEndDay(), 500);
}

function showGroupConversation(key: string): void {
  const gameState = deps.getGameState();
  if (!gameState) return;
  const convos = conversationsData as Record<string, Array<{ rank: string; title: string; lines: Array<{ speaker: string; text: string }> }>>;
  const convoSet = convos[key];
  if (!convoSet || convoSet.length === 0) { deps.switchScene('TownScene'); return; }
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
      deps.switchScene('TownScene');
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
    deps.switchScene('TownScene');
  });
}

function showConversation(breedA: string, breedB: string, rank: string): void {
  const gameState = deps.getGameState();
  const convos = conversationsData as Record<string, Array<{ rank: string; title: string; lines: Array<{ speaker: string; text: string }> }>>;
  const key1 = `${breedA}_${breedB}`;
  const key2 = `${breedB}_${breedA}`;
  const convoSet = convos[key1] ?? convos[key2];
  if (!convoSet) { deps.switchScene('GuildhallScene'); return; }

  const convoMatch = convoSet.find((c) => c.rank === rank);
  if (!convoMatch) { deps.switchScene('GuildhallScene'); return; }
  const convo = convoMatch;

  let lineIndex = 0;
  const overlay = document.createElement('div');
  overlay.className = 'conversation-overlay';

  const sceneArt = rank === 'A' ? 'rooftop' : rank === 'B' ? 'granary' : 'guildhall';
  const catA = gameState!.cats.find((c) => c.breed === breedA);
  const catB = gameState!.cats.find((c) => c.breed === breedB);
  const colorA = BREED_COLORS[breedA] ?? '#8b7355';
  const colorB = BREED_COLORS[breedB] ?? '#8b7355';
  const nameA = catA?.name ?? BREED_NAMES[breedA] ?? breedA;
  const nameB = catB?.name ?? BREED_NAMES[breedB] ?? breedB;
  const breedNameA = BREED_NAMES[breedA] ?? breedA;
  const breedNameB = BREED_NAMES[breedB] ?? breedB;

  const portraitImgA = `<img src="assets/sprites/${breedA}/south.png" style="width:72px;height:72px;image-rendering:pixelated;margin-bottom:4px" />`;
  const portraitImgB = `<img src="assets/sprites/${breedB}/south.png" style="width:72px;height:72px;image-rendering:pixelated;margin-bottom:4px" />`;

  overlay.innerHTML = `
    <img src="assets/sprites/dialogues/${sceneArt}.png" style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:420px;image-rendering:pixelated;opacity:0.25;pointer-events:none" />
    <div class="conversation-portraits">
      <div class="conversation-portrait" id="portrait-left" style="background:${colorA}">
        ${portraitImgA}
        <div class="portrait-name">${nameA}</div>
        <div class="portrait-breed">${breedNameA}</div>
      </div>
      <div class="conversation-portrait" id="portrait-right" style="background:${colorB}">
        ${portraitImgB}
        <div class="portrait-name">${nameB}</div>
        <div class="portrait-breed">${breedNameB}</div>
      </div>
    </div>
    <div class="conversation-textbox">
      <div class="conversation-speaker" id="conv-speaker"></div>
      <div class="conversation-text" id="conv-text"></div>
      <div class="conversation-advance">Tap to continue</div>
      <button id="conv-skip" style="position:absolute;top:10px;right:16px;background:none;border:1px solid #3a3530;color:#6b5b3e;padding:4px 10px;border-radius:4px;font-family:Georgia,serif;font-size:12px;cursor:pointer">Skip</button>
    </div>
  `;

  deps.overlayLayer.appendChild(overlay);

  const speaker = document.getElementById('conv-speaker')!;
  const text = document.getElementById('conv-text')!;
  const portraitLeft = document.getElementById('portrait-left')!;
  const portraitRight = document.getElementById('portrait-right')!;

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

      deps.switchScene('TownScene');
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
    deps.switchScene('TownScene');
  });
}
