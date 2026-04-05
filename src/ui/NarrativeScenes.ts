import { eventBus } from '../utils/events';
import { BREED_NAMES } from '../utils/constants';
import type { SaveData } from '../systems/SaveManager';
import { addJournalEntry } from '../systems/SaveManager';
import { playSfx } from '../systems/SfxManager';
import { getChapterName, getNextChapterHint } from '../systems/ProgressionManager';
import { getReputationLabel } from '../systems/ReputationSystem';
import { trackEvent } from '../systems/GameSystems';
import { showNarrativeOverlay } from './narrativeOverlay';

export interface NarrativeDeps {
  getGameState: () => SaveData | null;
  overlayLayer: HTMLElement;
  saveGame: (data: SaveData) => void;
  showToast: (message: string) => void;
}

export function registerNarrativeEvents(deps: NarrativeDeps): void {
  const { getGameState, overlayLayer, saveGame, showToast } = deps;

  // Chapter advance notifications
  eventBus.on('chapter-advance', (chapter: number) => {
    const gameState = getGameState();
    playSfx('chapter');
    const name = getChapterName(chapter);
    trackEvent('chapter_advance', { chapter, name });
    if (gameState) addJournalEntry(gameState, `Chapter ${chapter}: ${name}`, 'chapter');
    showToast(`Chapter ${chapter}: ${name}`);

    // Show next chapter goals after a moment
    if (gameState) {
      const hint = getNextChapterHint(gameState);
      if (hint) {
        setTimeout(() => showToast(hint), 3000);
      }
    }

    // Chapter 5 endgame acknowledgment
    if (chapter === 5) {
      setTimeout(() => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:#0a0908;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:30px;';
        const catName = gameState?.playerCatName ?? 'The wildcat';
        const repLabel = getReputationLabel(gameState?.reputationScore ?? 0);
        const scenes = [
          `The lean-to behind the grain market is long gone. In its place stands a guildhall — warm, furnished, and full of life.`,
          `${catName} looks around the hall. Five cats, each with their own story, their own strength. A clowder.`,
          `The town knows their names now. The merchants wave. The monks nod. Even the children leave fish by the door.`,
          `From a stray in a storm to ${repLabel === 'Noble' ? 'the most trusted guild in town' : repLabel === 'Shadowed' ? 'a guild that operates in the shadows, feared and wealthy' : 'a guild that has earned its place'}.`,
          `This is what ${catName} built. Not just a guild — a home.\n\nThank you for playing Clowder & Crest.`,
        ];
        let idx = 0;
        const img = document.createElement('img');
        img.src = 'assets/sprites/crest.png';
        img.style.cssText = 'width:96px;height:96px;image-rendering:pixelated;margin-bottom:20px;opacity:0.8;';
        overlay.appendChild(img);
        const text = document.createElement('div');
        text.style.cssText = 'color:#c4956a;font-family:Georgia,serif;font-size:15px;text-align:center;max-width:320px;line-height:1.7;white-space:pre-line;';
        overlay.appendChild(text);
        const hint = document.createElement('div');
        hint.style.cssText = 'color:#555;font-size:11px;margin-top:16px;font-family:Georgia,serif;';
        hint.textContent = 'Tap to continue';
        overlay.appendChild(hint);
        const show = () => {
          if (idx >= scenes.length) { overlay.style.transition = 'opacity 0.5s'; overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 500); return; }
          text.style.opacity = '0'; text.textContent = scenes[idx];
          setTimeout(() => { text.style.transition = 'opacity 0.5s'; text.style.opacity = '1'; }, 50);
          if (idx === scenes.length - 1) playSfx('chapter');
          idx++;
        };
        show();
        overlay.addEventListener('click', show);
        document.body.appendChild(overlay);
      }, 2000);
    }

    // Chapter 6: The Rival — narrative scene
    if (chapter === 6) {
      setTimeout(() => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:#0a0908;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:30px;';
        const scenes = [
          'Word arrived at dawn. A second guild had entered the town.',
          'They called themselves the Silver Paws — sleek, well-funded, and hungry for work.',
          'Their agents were already at the job board, undercutting prices and charming merchants.',
          `${gameState?.playerCatName ?? 'The wildcat'} watched from across the square. This was no longer about survival. This was about legacy.`,
          'Contested jobs will appear on the board. Complete them before the Silver Paws do — or risk losing everything you\'ve built.',
        ];
        let idx = 0;
        const img = document.createElement('img');
        img.src = 'assets/sprites/scenes/town_day.png';
        img.style.cssText = 'width:280px;max-height:160px;image-rendering:pixelated;margin-bottom:16px;border-radius:4px;opacity:0.5;';
        overlay.appendChild(img);
        const text = document.createElement('div');
        text.style.cssText = 'color:#c4956a;font-family:Georgia,serif;font-size:15px;text-align:center;max-width:320px;line-height:1.7;';
        overlay.appendChild(text);
        const hint = document.createElement('div');
        hint.style.cssText = 'color:#555;font-size:11px;margin-top:16px;font-family:Georgia,serif;';
        hint.textContent = 'Tap to continue';
        overlay.appendChild(hint);
        const show = () => {
          if (idx >= scenes.length) { overlay.style.transition = 'opacity 0.5s'; overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 500); return; }
          text.style.opacity = '0'; text.textContent = scenes[idx];
          setTimeout(() => { text.style.transition = 'opacity 0.5s'; text.style.opacity = '1'; }, 50);
          idx++;
        };
        show();
        overlay.addEventListener('click', show);
        document.body.appendChild(overlay);
      }, 1000);
    }
  });

  eventBus.on('rat-plague-start', () => {
    const gameState = getGameState();
    if (gameState) {
      gameState.flags.prePlaguePestJobs = gameState.completedJobs.filter((id) =>
        ['mill_mousing', 'granary_patrol', 'cathedral_mousing', 'warehouse_clearing', 'ship_hold'].includes(id)
      ).length as unknown as boolean;
      gameState.flags.plagueDayStarted = gameState.day as unknown as boolean;
      addJournalEntry(gameState, 'The Rat Plague has begun. The town is under siege.', 'event');
    }

    showNarrativeOverlay({
      scenes: [
        'The granary fell first. Rats poured from the walls like dark water, overrunning the flour stores in a single night.',
        'By morning, the cathedral cellar was lost. The monks fled to the upper floors. The market stalls were abandoned.',
        'The townsfolk whispered of St. Rosalia — how her bones once drove plague from Palermo. But there were no saints\' bones here. Only cats.',
        `${gameState?.playerCatName ?? 'The wildcat'} gathered the guild. This was no ordinary job. This was a siege. The town's survival depended on them.`,
        'Complete 5 pest control jobs to drive the rats from the town. The guild will be tested. Not every day will be easy.',
      ],
      image: 'assets/sprites/scenes/town_plague.png',
      onScene: (i: number) => { if (i === 0) playSfx('thunder'); },
    });
  });

  eventBus.on('rat-plague-resolved', () => {
    const gameState = getGameState();
    if (gameState) addJournalEntry(gameState, 'The Rat Plague has been resolved! The town is saved.', 'event');
    const catName = gameState?.playerCatName ?? 'The wildcat';
    showNarrativeOverlay({
      scenes: [
        'The last rat nest fell at dawn. The guild stood in the ruins of the granary, exhausted but unbroken.',
        'Word spread through the town like sunlight after a storm. The cats had done what no one else could.',
        'The monks emerged from the cathedral, carrying candles. The townsfolk lined the cobblestone streets.',
        `They walked in procession — ${catName} at the front — through every quarter the rats had touched. Like Rosalia's bones through the streets of Palermo.`,
        'The plague was over. The guild had earned its name. And the town would not forget.',
      ],
      image: 'assets/sprites/scenes/town_day.png',
      onScene: (i: number) => { if (i === 4) playSfx('chapter'); },
    });
  });

  // Inquisition narrative scenes
  eventBus.on('inquisition-start', () => {
    const gameState = getGameState();
    if (gameState) addJournalEntry(gameState, 'The Bishop\'s Inquisitor has arrived to investigate the guild.', 'event');

    const catName = gameState?.playerCatName ?? 'The wildcat';
    const repLabel = getReputationLabel(gameState?.reputationScore ?? 0);
    const lens = repLabel === 'Shadowed' ? 'hostile' : repLabel === 'Noble' ? 'respectful' : 'cautious';

    showNarrativeOverlay({
      scenes: [
        'A black-robed figure appeared at the guildhall gate at dawn. Behind him, two monks with ledgers.',
        `"I am Brother Aldric, sent by His Excellency the Bishop. I am here to determine... what you are."`,
        `He looked at ${catName} with ${lens} eyes. "Are you servants of the saints? Or something... else?"`,
        `"For five days, I will observe. I will question your cats. I will watch what work you do."`,
        `"Choose your jobs wisely. Sacred work speaks well of you. Shadow work... does not."`,
      ],
      image: 'assets/sprites/scenes/guildhall.png',
      onScene: (i: number) => { if (i === 0) playSfx('thunder'); },
    });
  });

  eventBus.on('inquisition-verdict', (verdict: string) => {
    const gameState = getGameState();
    const catName = gameState?.playerCatName ?? 'The wildcat';

    let scenes: string[];
    if (verdict === 'vindicated') {
      scenes = [
        'Brother Aldric stood before the guild on the fifth morning. His face, for the first time, showed a smile.',
        `"I have seen enough. ${catName}'s guild serves the saints with devotion and courage."`,
        '"The Bishop grants you his blessing. A chapel shall be consecrated in your guildhall."',
        'The town bells rang. The guild had been vindicated — blessed by the Church itself.',
      ];
      if (gameState) {
        gameState.reputationScore += 10;
        addJournalEntry(gameState, 'Vindicated by the Inquisition! The Bishop grants his blessing.', 'chapter');
        gameState.flags.bishopBlessing = true;
      }
    } else if (verdict === 'condemned') {
      scenes = [
        'Brother Aldric\'s face was stone. He unrolled a scroll stamped with the Bishop\'s seal.',
        `"This guild has dealings in shadow. The evidence is clear. One among you must answer for it."`,
        '"Choose which cat bears the sentence of exile. The rest may continue — under watch."',
        `${catName} felt the weight of every shadow job, every dark deal. The consequences had arrived.`,
      ];
      if (gameState) {
        gameState.reputationScore -= 20;
        addJournalEntry(gameState, 'Condemned by the Inquisition. One cat must be exiled.', 'chapter');
        gameState.flags.undergroundContact = true;
      }
    } else {
      scenes = [
        'Brother Aldric closed his ledger with a snap. Neither smile nor frown.',
        `"Your guild is... unremarkable. Neither saintly nor sinful. The Bishop will not intervene."`,
        `${catName} couldn't tell if that was relief or disappointment.`,
        'The Inquisitor left as quietly as he came. Life went on.',
      ];
      if (gameState) {
        addJournalEntry(gameState, 'Acquitted by the Inquisition. Neither blessed nor condemned.', 'chapter');
      }
    }

    playSfx('chapter');

    showNarrativeOverlay({
      scenes,
      image: 'assets/sprites/scenes/guildhall.png',
      onComplete: () => {
        if (verdict === 'condemned' && gameState && gameState.cats.length > 1) {
          showExileChoice();
        }
      },
    });
  });

  function showExileChoice(): void {
    const gameState = getGameState();
    if (!gameState) return;
    const overlay = document.createElement('div');
    overlay.className = 'assign-overlay';

    const exilable = gameState.cats.filter((c) => c.id !== 'player_wildcat');
    const buttons = exilable.map((cat) => {
      const breedName = BREED_NAMES[cat.breed] ?? cat.breed;
      return `<button class="exile-btn" data-cat-id="${cat.id}" style="display:flex;align-items:center;gap:8px;padding:10px 16px;margin:4px 0;width:100%;background:rgba(80,30,30,0.4);border:1px solid #8b4444;border-radius:6px;color:#cc8888;font-size:13px;cursor:pointer;font-family:Georgia,serif">
        ${cat.name} the ${breedName} (Lv.${cat.level})
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

    overlayLayer.appendChild(overlay);

    overlay.querySelectorAll('.exile-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const catId = (btn as HTMLElement).dataset.catId!;
        const cat = gameState!.cats.find((c) => c.id === catId);
        if (cat) {
          addJournalEntry(gameState!, `${cat.name} was exiled by the Inquisitor's decree.`, 'event');
          gameState!.cats = gameState!.cats.filter((c) => c.id !== catId);
          gameState!.stationedCats = gameState!.stationedCats.filter((s) => s.catId !== catId);
          saveGame(gameState!);
          playSfx('cat_sad');
          showToast(`${cat.name} has been exiled from the guild.`);
        }
        overlay.remove();
      });
    });
  }
}
