// "Choose who must leave" overlay — fires when the Inquisition's
// verdict is "condemned" and the player must select one cat to exile
// from the guild.
//
// Originally inlined in main.ts as `showExileChoice()`. Extracted for
// the same reasons as EndDaySuggestion: shrink main.ts and put each
// overlay's HTML in one focused file.
//
// The exiled cat is removed from the cats array and from any stationed
// jobs. The deletion is permanent (no recovery — that's the whole point
// of the Inquisition arc). The player wildcat (id 'player_wildcat') is
// never offered as a choice.

import { BREED_NAMES } from '../../utils/constants';
import { esc } from '../../utils/helpers';
import type { SaveData } from '../../systems/SaveManager';
import { addJournalEntry } from '../../systems/SaveManager';

export interface ExileChoiceDeps {
  overlayLayer: HTMLElement;
  getGameState: () => SaveData | null;
  saveGame: (state: SaveData) => void;
  playSfx: (key: string, volume?: number) => void;
  showToast: (msg: string) => void;
}

export function showExileChoice(deps: ExileChoiceDeps): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  const overlay = document.createElement('div');
  overlay.className = 'assign-overlay';

  const exilable = gameState.cats.filter((c) => c.id !== 'player_wildcat');
  const buttons = exilable.map((cat) => {
    const breedName = BREED_NAMES[cat.breed] ?? cat.breed;
    return `<button class="exile-btn" data-cat-id="${cat.id}" style="display:flex;align-items:center;gap:8px;padding:10px 16px;margin:4px 0;width:100%;background:rgba(80,30,30,0.4);border:1px solid #8b4444;border-radius:6px;color:#cc8888;font-size:13px;cursor:pointer;font-family:Georgia,serif">
      ${esc(cat.name)} the ${breedName} (Lv.${cat.level})
    </button>`;
  }).join('');

  overlay.innerHTML = `
    <h2 style="color:#cc6666">Choose Who Must Leave</h2>
    <div style="color:#8b7355;font-size:12px;margin-bottom:12px;text-align:center">
      The Inquisitor demands one cat be exiled. This cannot be undone.
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${buttons}
    </div>
  `;

  deps.overlayLayer.appendChild(overlay);

  overlay.querySelectorAll('.exile-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catId = (btn as HTMLElement).dataset.catId!;
      const currentState = deps.getGameState();
      if (!currentState) { overlay.remove(); return; }
      const cat = currentState.cats.find((c) => c.id === catId);
      if (cat) {
        addJournalEntry(currentState, `${esc(cat.name)} was exiled by the Inquisitor's decree.`, 'event');
        currentState.cats = currentState.cats.filter((c) => c.id !== catId);
        currentState.stationedCats = currentState.stationedCats.filter((s) => s.catId !== catId);
        deps.saveGame(currentState);
        deps.playSfx('cat_sad');
        deps.showToast(`${esc(cat.name)} has been exiled from the guild.`);
      }
      overlay.remove();
    });
  });
}
