// "All cats busy — end the day?" overlay.
//
// Originally inlined in main.ts as `suggestEndDay()`. Extracted into its
// own module so main.ts shrinks toward being mostly wiring + event
// subscriptions, and so future XSS audits / refactors can find this
// overlay's HTML in one focused file instead of grepping the god-file.
//
// Pure UI: builds the overlay, wires the two buttons, removes the
// overlay on either choice. Calls into the deps for game state mutation
// (advanceDay, day transition, town refresh) so this module never
// touches gameState directly.

import type { SaveData } from '../../systems/SaveManager';

export interface EndDaySuggestionDeps {
  overlayLayer: HTMLElement;
  getGameState: () => SaveData | null;
  /** Returns true if every cat has either worked today or is stationed
   *  on a passive job. The overlay should only fire when this is true. */
  allCatsBusy: () => boolean;
  /** Run the day-end side effects (food cost, mood drops, stationed
   *  earnings, plague escalation, chapter advance) and return a recap
   *  the day-transition overlay can render. */
  advanceDay: () => { foodCost: number; stationedEarned: number; events: string[]; fishRemaining: number };
  showDayTransitionOverlay: (
    day: number,
    playBell: () => void,
    save: SaveData | null,
    recap?: { foodCost: number; stationedEarned: number; events: string[]; fishRemaining: number },
  ) => void;
  playSfx: (key: string, volume?: number) => void;
  /** Bus emit so the town overlay can refresh after a day end. */
  emitShowTownOverlay: () => void;
}

export function showEndDaySuggestion(deps: EndDaySuggestionDeps): void {
  if (!deps.allCatsBusy()) return;
  const gameState = deps.getGameState();
  if (!gameState) return;

  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';
  overlay.innerHTML = `
    <h2>All Cats Busy</h2>
    <div style="color:#8b7355;font-size:14px;margin-bottom:16px;text-align:center">
      Every cat has worked or is stationed today.<br>End the day to start fresh?
    </div>
    <div style="display:flex;gap:12px;justify-content:center">
      <button class="btn-puzzle" id="end-day-yes">End Day</button>
      <button class="btn-auto" id="end-day-no" style="background:#2a2520;border:1px solid #3a3530">Keep Waiting</button>
    </div>
  `;
  deps.overlayLayer.appendChild(overlay);

  document.getElementById('end-day-yes')!.addEventListener('click', () => {
    overlay.remove();
    const recap = deps.advanceDay();
    const currentState = deps.getGameState();
    if (currentState) {
      deps.showDayTransitionOverlay(currentState.day, () => deps.playSfx('day_bell', 0.4), currentState, recap);
    }
    deps.playSfx('day_bell', 0.4);
    // Refresh town if it was open in the background
    const townOverlay = deps.overlayLayer.querySelector('.town-overlay');
    if (townOverlay) {
      townOverlay.remove();
      deps.emitShowTownOverlay();
    }
  });

  document.getElementById('end-day-no')!.addEventListener('click', () => {
    overlay.remove();
  });
}
