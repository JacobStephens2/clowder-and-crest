/**
 * Conversation system — bond pair dialogues and group conversations.
 */
import { BREED_COLORS, BREED_NAMES } from '../utils/constants';
import { esc } from '../utils/helpers';
import { getBondPairs, getAvailableConversation, markConversationViewed } from '../systems/BondSystem';
import conversationsData from '../data/conversations.json';
import type { SaveData } from '../systems/SaveManager';
import { pauseDayTimer, resumeDayTimer, isPaused } from '../systems/DayTimer';
import { pausePlaytimeSession, startPlaytimeSession } from '../systems/PlaytimeTracker';
import { playSfx } from '../systems/SfxManager';

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
  // The wildcat is always the player (the founder of the guild). When
  // the player chose she/her at character creation, swap to the female
  // wildcat portrait set so dialogue scenes match the chosen identity.
  // Other breeds are gender-fixed by their visual design and don't have
  // a variant.
  if (breed === 'wildcat') {
    const save = deps?.getGameState?.();
    if (save?.playerCatGender === 'female') {
      return `assets/sprites/portraits/wildcat_female_${expression}.png`;
    }
  }
  return `assets/sprites/portraits/${breed}_${expression}.png`;
}

function fallbackSpriteSrc(breed: string): string {
  return `assets/sprites/${breed}/south.png`;
}

const EXPRESSION_LABELS: Record<Expression, string> = {
  neutral: 'Steady',
  happy: 'Warm',
  serious: 'Focused',
  sad: 'Somber',
  angry: 'Angry',
  surprised: 'Startled',
};

function expressionLabel(expression: Expression): string {
  return EXPRESSION_LABELS[expression] ?? 'Steady';
}

function pulsePortrait(img: HTMLImageElement): void {
  if (typeof img.animate !== 'function') return;
  img.animate(
    [
      { transform: 'translateY(10px) scale(0.97)', filter: 'brightness(0.9)' },
      { transform: 'translateY(0) scale(1.03)', filter: 'brightness(1.12)' },
      { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
    ],
    { duration: 220, easing: 'ease-out' },
  );
}

/**
 * Configure an <img> element to show a portrait. Tries the high-res illustrated
 * portrait first; if that expression variant doesn't exist yet, falls back to
 * the breed's neutral portrait; only if no portrait exists at all does it swap
 * to the pixel sprite fallback.
 */
function setPortrait(img: HTMLImageElement, breed: string, expression: Expression): void {
  const previousExpression = (img.dataset.portraitExpression as Expression | undefined) ?? null;
  // Reset state — portraits are smooth, sprites are pixelated.
  img.style.imageRendering = 'auto';
  delete img.dataset.portraitFallbackStage;
  img.dataset.portraitBreed = breed;
  img.dataset.portraitExpression = expression;
  img.onerror = () => {
    const stage = img.dataset.portraitFallbackStage ?? 'expression';
    if (stage === 'expression' && expression !== 'neutral') {
      img.dataset.portraitFallbackStage = 'neutral';
      img.src = portraitSrc(breed, 'neutral');
      return;
    }
    img.onerror = null; // guard against infinite loops if the sprite also 404s
    img.dataset.portraitFallbackStage = 'sprite';
    img.src = fallbackSpriteSrc(breed);
    img.style.imageRendering = 'pixelated';
  };
  img.src = portraitSrc(breed, expression);
  if (previousExpression && previousExpression !== expression) {
    pulsePortrait(img);
  }
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

  // Cap at one bond/group dialogue per in-game day. Per user feedback in
  // chapter 4: "I feel like dialogue scenes are occurring even more than
  // they need to". The original triggers fire from every job result,
  // every end-day, every wish, every room interaction — easy to land 3+
  // dialogues per day in chapter 4 once enough bond pairs are unlocked.
  // The cap throttles without disabling: meaningful conversations still
  // play, just at the rate the player can savor them.
  //
  // CRITICAL: when the cap blocks a conversation, we MUST still navigate
  // to the town map. checkAndShowConversation is the post-puzzle hook
  // (called from puzzle-complete via onAfterResult), and the bottom of
  // this function does `deps.switchScene('TownMapScene')` as the
  // fall-through behavior. A bare `return` here was a bug — after a
  // brawl/hunt/etc result the player got stuck on the puzzle scene with
  // no way back. Reported as: "after a fight game I got the complete
  // screen, then after clicking to dismiss it, I was brought back to
  // the fight / brawl scene".
  const lastDay = Number(gameState.flags.lastConversationDay ?? 0);
  if (lastDay >= gameState.day) {
    deps.switchScene('TownMapScene');
    setTimeout(() => deps.suggestEndDay(), 500);
    return;
  }

  const catBreeds = gameState.cats.map((c) => c.breed);
  for (const [a, b] of getBondPairs()) {
    if (catBreeds.includes(a) && catBreeds.includes(b)) {
      const rank = getAvailableConversation(gameState, a, b);
      if (rank) {
        gameState.flags.lastConversationDay = gameState.day;
        showConversation(a, b, rank);
        return;
      }
    }
  }

  // Check for group conversations
  if (gameState.cats.length >= 3) {
    const convos = conversationsData as Record<string, any[]>;
    const groupKeys = Object.keys(convos).filter((k) => k.startsWith('group_'));
    const ownedBreeds = new Set(gameState.cats.map((c) => c.breed));
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
          // Don't fire a group conversation whose dialogue includes a
          // speaker the player hasn't recruited yet — the user reported
          // the Maine Coon appearing in a group scene before they had
          // a Maine Coon in the guild, which felt off ("the Coon spoke
          // like it was part of the guild"). Derive required speakers
          // from the conversation lines and skip if any are missing.
          // The conversation will retry on a future check once all
          // participants have been recruited.
          const convoSet = convos[key];
          const firstConvo = convoSet?.[0];
          const requiredSpeakers = new Set<string>(
            ((firstConvo?.lines ?? []) as Array<{ speaker: string }>)
              .map((l) => l.speaker)
              .filter((b) => !!b && b !== 'narrator'),
          );
          const allSpeakersPresent = Array.from(requiredSpeakers).every((b) => ownedBreeds.has(b));
          if (!allSpeakersPresent) continue;

          gameState.flags[viewedKey] = true;
          gameState.flags.lastConversationDay = gameState.day;
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

/** Public entry point for replaying a viewed group conversation from
 *  the Memories panel. Mirrors `replayConversation` for pair dialogues:
 *  no save mutation, no rank-up toast, calls onClose() instead of
 *  switchScene at both the natural-end and the skip path. */
export function replayGroupConversation(key: string, onClose: () => void): void {
  showGroupConversation(key, { replay: true, onClose });
}

interface GroupConversationOpts {
  replay?: boolean;
  onClose?: () => void;
}

function showGroupConversation(key: string, opts: GroupConversationOpts = {}): void {
  const gameState = deps.getGameState();
  if (!gameState) return;
  const convos = conversationsData as Record<string, Array<{ rank: string; title: string; lines: Array<{ speaker: string; text: string; expression?: Expression }> }>>;
  const convoSet = convos[key];
  if (!convoSet || convoSet.length === 0) { deps.switchScene('TownMapScene'); return; }
  const convo = convoSet[0];

  // Same day-timer/playtime pause as showConversation — group dialogues
  // can't be interrupted by a day-end either.
  const dayTimerWasAlreadyPaused = isPaused();
  if (!dayTimerWasAlreadyPaused) {
    pauseDayTimer();
    pausePlaytimeSession();
  }

  let lineIndex = 0;
  const overlay = document.createElement('div');
  overlay.className = 'conversation-overlay';

  // Use the illustrated portrait at thumbnail size (with pixel-sprite
  // fallback per the same setPortrait pattern as pair dialogues) so
  // group scenes feel consistent with the rest of the dialogue system
  // shipped in v2.3.0. The portraits are loaded with onerror fallback
  // imperatively below so each img can swap independently.
  const portraitsHtml = gameState.cats.slice(0, 5).map((cat, i) => {
    const color = BREED_COLORS[cat.breed] ?? '#8b7355';
    // transition: smooth scale + opacity when the speaker swaps. The
    // scale/opacity values themselves are set per-line in showLine().
    return `<div class="conversation-portrait" style="background:${color};width:60px;height:60px;transition:transform 240ms ease-out,opacity 240ms ease-out;transform-origin:center bottom">
      <img id="group-portrait-${i}" data-breed="${cat.breed}" src="assets/sprites/portraits/${cat.breed}_neutral.png" style="width:56px;height:56px;object-fit:cover;border-radius:4px" alt="" />
      <div style="font-size:8px;margin-top:2px">${esc(cat.name)}</div>
    </div>`;
  }).join('');

  overlay.innerHTML = `
    <img src="assets/sprites/dialogues/guildhall.png" style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:420px;image-rendering:pixelated;opacity:0.25;pointer-events:none" />
    <div class="conversation-portraits" style="justify-content:center;gap:8px;flex-wrap:wrap">${portraitsHtml}</div>
    <div class="conversation-textbox">
      <div style="color:#c4956a;font-size:12px;margin-bottom:4px">${convo.title}</div>
      <div class="conversation-speaker" id="conv-speaker"></div>
      <div id="conv-expression" style="color:#8b7355;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;min-height:12px"></div>
      <div class="conversation-text" id="conv-text"></div>
      <div class="conversation-advance">Tap to continue</div>
      <button id="conv-skip" style="position:absolute;top:10px;right:16px;background:none;border:1px solid #3a3530;color:#6b5b3e;padding:4px 10px;border-radius:4px;font-family:Georgia,serif;font-size:12px;cursor:pointer">Skip</button>
    </div>
  `;
  deps.overlayLayer.appendChild(overlay);

  // Wire up the per-portrait fallback: if the illustrated portrait
  // doesn't exist on disk, fall back to the pixel sprite at the same
  // size with pixelated rendering. Mirrors the per-line setPortrait
  // fallback in showConversation for pair dialogues.
  gameState.cats.slice(0, 5).forEach((cat, i) => {
    const img = document.getElementById(`group-portrait-${i}`) as HTMLImageElement | null;
    if (!img) return;
    img.addEventListener('error', () => {
      if (img.dataset.fallbackTried) return;
      img.dataset.fallbackTried = '1';
      img.src = `assets/sprites/${cat.breed}/south.png`;
      img.style.imageRendering = 'pixelated';
      img.style.objectFit = 'contain';
      img.style.width = '48px';
      img.style.height = '48px';
    });
  });

  const speaker = document.getElementById('conv-speaker')!;
  const expression = document.getElementById('conv-expression')!;
  const text = document.getElementById('conv-text')!;
  const groupExpressions = new Map<string, Expression>();

  gameState.cats.slice(0, 5).forEach((cat, i) => {
    groupExpressions.set(cat.breed, 'neutral');
    const img = document.getElementById(`group-portrait-${i}`) as HTMLImageElement | null;
    if (!img) return;
    setPortrait(img, cat.breed, 'neutral');
    img.style.width = '56px';
    img.style.height = '56px';
  });

  function showLine(): void {
    if (lineIndex >= convo.lines.length) {
      overlay.remove();
      if (!dayTimerWasAlreadyPaused) {
        resumeDayTimer();
        startPlaytimeSession();
      }
      // Replay mode: skip the toast + scene switch, hand control
      // back to the journal via onClose.
      if (opts.replay) {
        opts.onClose?.();
        return;
      }
      deps.showToast('A guild moment to remember.');
      deps.switchScene('TownMapScene');
      return;
    }
    const line = convo.lines[lineIndex];
    const cat = gameState!.cats.find((c) => c.breed === line.speaker);
    const name = cat?.name ?? BREED_NAMES[line.speaker] ?? line.speaker;
    const breedName = BREED_NAMES[line.speaker] ?? line.speaker;
    speaker.innerHTML = `${esc(name)} <span class="speaker-breed">${breedName}</span>`;
    const portraitIndex = gameState!.cats.findIndex((c) => c.breed === line.speaker);
    if (line.expression && portraitIndex >= 0) {
      groupExpressions.set(line.speaker, line.expression);
      const portrait = document.getElementById(`group-portrait-${portraitIndex}`) as HTMLImageElement | null;
      if (portrait) setPortrait(portrait, line.speaker, line.expression);
    }
    // Speaker emphasis — scale the speaker's portrait up and dim the
    // rest. Per user feedback (2026-04-10): "in guild moments,
    // increase the size of the speaker's portrait when they are
    // speaking." Pure CSS transform; no DOM rebuild, so it animates
    // smoothly via the transition rule applied below at scene init.
    gameState!.cats.slice(0, 5).forEach((_c, i) => {
      const tile = document.querySelector(`#group-portrait-${i}`)?.parentElement as HTMLElement | null;
      if (!tile) return;
      const isSpeaking = i === portraitIndex;
      tile.style.transform = isSpeaking ? 'scale(1.35)' : 'scale(0.9)';
      tile.style.opacity = isSpeaking ? '1' : '0.55';
      tile.style.zIndex = isSpeaking ? '5' : '1';
    });
    // Per user feedback (2026-04-08): "in the dialogues, remove the
    // note about what kind of expression is showing. Let the player
    // see the expression and know by just looking at the portrait."
    expression.textContent = '';
    text.textContent = line.text;
    lineIndex++;
  }

  showLine();
  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'conv-skip') return;
    playSfx('dialogue_advance', 0.1);
    showLine();
  });
  document.getElementById('conv-skip')!.addEventListener('click', (e) => {
    e.stopPropagation();
    playSfx('tap', 0.15);
    overlay.remove();
    if (!dayTimerWasAlreadyPaused) {
      resumeDayTimer();
      startPlaytimeSession();
    }
    if (opts.replay) {
      opts.onClose?.();
      return;
    }
    deps.switchScene('TownMapScene');
  });
}

interface ConversationOpts {
  /** Replay an already-viewed conversation. Skips markConversationViewed,
   *  the saveGame call, and the rank-up toast. The onClose callback fires
   *  instead of the default switchScene('TownMapScene'), used by the
   *  Relational Journal panel to reopen itself after the replay ends. */
  replay?: boolean;
  onClose?: () => void;
}

/** Public entry point for replaying a viewed conversation from the
 *  Relational Journal. Routes through showConversation in replay mode
 *  with no save mutation, no rank-up toast, and an onClose callback
 *  instead of a scene switch. */
export function replayConversation(breedA: string, breedB: string, rank: string, onClose: () => void): void {
  showConversation(breedA, breedB, rank, { replay: true, onClose });
}

function showConversation(breedA: string, breedB: string, rank: string, opts: ConversationOpts = {}): void {
  const gameState = deps.getGameState();
  const convos = conversationsData as Record<string, Array<{ rank: string; title: string; lines: Array<{ speaker: string; text: string; expression?: Expression }> }>>;
  const key1 = `${breedA}_${breedB}`;
  const key2 = `${breedB}_${breedA}`;
  const convoSet = convos[key1] ?? convos[key2];
  if (!convoSet) { deps.switchScene('GuildhallScene'); return; }

  const convoMatch = convoSet.find((c) => c.rank === rank);
  if (!convoMatch) { deps.switchScene('GuildhallScene'); return; }
  const convo = convoMatch;

  // Pause the day timer + playtime session for the duration of the
  // conversation so the in-game day can't tick over (and end-of-day
  // can't fire) mid-dialogue. Without this, a conversation that runs
  // close to the day boundary gets clobbered by the day-end overlay
  // and the player loses the rest of the dialogue. Track whether we
  // were the ones who paused — if the day timer was already paused
  // by the player, we shouldn't unpause it on conversation end.
  const dayTimerWasAlreadyPaused = isPaused();
  if (!dayTimerWasAlreadyPaused) {
    pauseDayTimer();
    pausePlaytimeSession();
  }

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
    <!-- Full-screen scene background — z-index:0 explicit so it's always
         behind the portraits. Without an explicit z-index, the background
         and the portrait divs both create stacking contexts (via transform)
         and the DOM-order fallback isn't reliable across browsers, which
         is what the user reported as "the background art overlays the
         portrait that's in the background". -->
    <img src="assets/sprites/dialogues/${sceneArt}.png" style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:100%;height:100%;object-fit:cover;image-rendering:pixelated;opacity:0.3;pointer-events:none;z-index:0" />

    <!-- Large character portraits — left and right.
         Image src is set imperatively below so the high-res portrait fallback
         can be applied per-line as expressions change. z-index:1 keeps them
         above the background regardless of stacking-context details. -->
    <div id="portrait-left" style="position:absolute;bottom:140px;left:10px;transition:opacity 0.2s,transform 0.2s;transform-origin:bottom left;z-index:1">
      <img id="portrait-img-left" alt="" style="height:240px;width:auto;max-width:55vw;filter:drop-shadow(2px 4px 6px rgba(0,0,0,0.5))" />
    </div>
    <div id="portrait-right" style="position:absolute;bottom:140px;right:10px;transition:opacity 0.2s,transform 0.2s;transform-origin:bottom right;z-index:1">
      <img id="portrait-img-right" alt="" style="height:240px;width:auto;max-width:55vw;filter:drop-shadow(2px 4px 6px rgba(0,0,0,0.5))" />
    </div>

    <!-- Text box at bottom — z-index:2 so it sits above the portraits. -->
    <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(10,9,8,0.95) 20%);padding:20px 20px 30px;min-height:130px;z-index:2">
      <div id="conv-speaker" style="color:#c4956a;font-family:Georgia,serif;font-size:15px;margin-bottom:6px;font-weight:bold"></div>
      <div id="conv-expression" style="color:#8b7355;font-family:Georgia,serif;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;min-height:12px"></div>
      <div id="conv-text" style="color:#d4c5a9;font-family:Georgia,serif;font-size:14px;line-height:1.6"></div>
      <div style="color:#555;font-family:Georgia,serif;font-size:10px;margin-top:8px;text-align:right">Tap to continue</div>
    </div>

    <!-- Skip button -->
    <button id="conv-skip" style="position:absolute;top:12px;right:12px;background:rgba(42,37,32,0.7);border:1px solid #3a3530;color:#6b5b3e;padding:6px 14px;border-radius:4px;font-family:Georgia,serif;font-size:12px;cursor:pointer;z-index:10">Skip</button>
  `;

  deps.overlayLayer.appendChild(overlay);

  const speaker = document.getElementById('conv-speaker')!;
  const expression = document.getElementById('conv-expression')!;
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
      // Replay mode: no save mutation, no rank-up toast, callback
      // instead of scene switch. Used by the Relational Journal.
      if (opts.replay) {
        if (!dayTimerWasAlreadyPaused) {
          resumeDayTimer();
          startPlaytimeSession();
        }
        opts.onClose?.();
        return;
      }
      markConversationViewed(gameState!, breedA, breedB, rank);
      deps.saveGame(gameState!);
      // Resume the day timer + playtime now that the dialogue has finished
      // (only if we were the ones who paused them — see the pause comment
      // above showConversation for the rationale).
      if (!dayTimerWasAlreadyPaused) {
        resumeDayTimer();
        startPlaytimeSession();
      }

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
    speaker.innerHTML = `${esc(speakerName)} <span style="font-size:11px;color:#8b7355;font-weight:normal;margin-left:6px">${speakerBreed}</span>`;
    // Per user feedback (2026-04-08): expression label removed —
    // the portrait alone communicates the expression now.
    expression.textContent = '';
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

    // Fire Emblem style: active speaker bright + scaled up, inactive dimmed.
    // Inactive opacity bumped from 0.4 → 0.6 so the listener reads clearly
    // above the 0.3-opacity background scene art. Per user feedback, the
    // listener used to "blend into" the bg.
    portraitLeft.style.opacity = isA ? '1' : '0.6';
    portraitLeft.style.transform = isA ? 'scale(1.05)' : 'scale(0.9)';
    portraitRight.style.opacity = isA ? '0.6' : '1';
    portraitRight.style.transform = isA ? 'scale(0.9)' : 'scale(1.05)';

    lineIndex++;
  }

  showLine();

  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'conv-skip') return;
    playSfx('dialogue_advance', 0.1);
    showLine();
  });

  document.getElementById('conv-skip')!.addEventListener('click', (e) => {
    e.stopPropagation();
    playSfx('tap', 0.15);
    overlay.remove();
    if (opts.replay) {
      // Replay skip: no save mutation, no toast, return to journal.
      if (!dayTimerWasAlreadyPaused) {
        resumeDayTimer();
        startPlaytimeSession();
      }
      opts.onClose?.();
      return;
    }
    markConversationViewed(gameState!, breedA, breedB, rank);
    deps.saveGame(gameState!);
    // Resume day timer/playtime same as the natural end-of-dialogue path.
    if (!dayTimerWasAlreadyPaused) {
      resumeDayTimer();
      startPlaytimeSession();
    }
    deps.showToast(`Bond deepened: ${nameA} & ${nameB}`);
    deps.switchScene('TownMapScene');
  });
}
