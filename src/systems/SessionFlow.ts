import type { SaveData } from './SaveManager';
import type { JobDef } from './JobBoard';
import { eventBus } from '../utils/events';
import { startPlaytimeSession } from './PlaytimeTracker';

export interface SessionFlowDeps {
  overlayLayer: HTMLElement;
  getGameState: () => SaveData | null;
  setGameState: (save: SaveData | null) => void;
  createDefaultSave: (name: string) => SaveData;
  rawSaveGame: (save: SaveData) => void;
  saveToSlot: (slot: number, save: SaveData) => void;
  deleteSave: () => void;
  deleteSlot: (slot: number) => void;
  switchScene: (target: string, data?: object) => void;
  playIntroStory: (catName: string, onComplete: () => void) => void;
  showTutorial: () => void;
  showGuildReport: (save: SaveData) => void;
  showToast: (message: string) => void;
  updateStatusBar: () => void;
  startBgm: () => void;
  startDayTimer: () => void;
  clearTransientState: () => void;
  getOfflineStationedEarnings: (save: SaveData) => { earnings: number; daysAway: number };
  getDailyUpkeep: (save: SaveData) => number;
  onGameLoaded?: (save: SaveData) => void;
}

export interface SessionFlowApi {
  saveGame: (save: SaveData) => void;
  clearCurrentSave: () => void;
  getActiveSlot: () => number;
}

export function initSessionFlow(deps: SessionFlowDeps): SessionFlowApi {
  let activeSlot = 1;

  const saveGame = (save: SaveData): void => {
    deps.rawSaveGame(save);
    deps.saveToSlot(activeSlot, save);
  };

  const clearCurrentSave = (): void => {
    deps.deleteSave();
    deps.deleteSlot(activeSlot);
  };

  eventBus.on('active-slot', (slot: number) => {
    activeSlot = slot;
  });

  eventBus.on('show-name-prompt', (data?: { slot?: number }) => {
    if (data?.slot) activeSlot = data.slot;
    document.querySelectorAll('.name-prompt-overlay').forEach((el) => el.remove());

    const prompt = document.createElement('div');
    prompt.className = 'name-prompt-overlay';
    prompt.innerHTML = `
      <h2>Name Your Cat</h2>
      <p>You are a wildcat stray, arriving at a crumbling settlement in a storm. What is your name?</p>
      <input type="text" class="cat-name-input" placeholder="Enter name..." maxlength="20" autocomplete="off" />
      <button class="cat-name-submit">Begin</button>
    `;
    deps.overlayLayer.appendChild(prompt);

    const input = prompt.querySelector<HTMLInputElement>('.cat-name-input')!;
    const submit = prompt.querySelector<HTMLButtonElement>('.cat-name-submit')!;
    input.focus();

    let submitted = false;
    const doSubmit = () => {
      if (submitted) return;
      submitted = true;
      const name = input.value.trim() || 'Stray';
      prompt.remove();
      const save = deps.createDefaultSave(name);
      deps.setGameState(save);
      saveGame(save);
      deps.playIntroStory(name, () => {
        eventBus.emit('game-loaded', save);
        deps.switchScene('GuildhallScene');
        setTimeout(() => deps.showTutorial(), 1500);
      });
    };

    submit.addEventListener('click', doSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSubmit();
    });
  });

  eventBus.on('game-loaded', (save: SaveData) => {
    deps.setGameState(save);
    deps.clearTransientState();
    deps.updateStatusBar();
    deps.startBgm();
    deps.startDayTimer();
    // Start the playtime session alongside the day timer. Subsequent
    // saves will commit elapsed time onto save.totalPlaytimeMs.
    startPlaytimeSession();

    const { earnings, daysAway } = deps.getOfflineStationedEarnings(save);
    if (earnings > 0) {
      save.fish += earnings;
      save.totalFishEarned += earnings;
      saveGame(save);
      setTimeout(() => deps.showToast(`Your stationed cats earned ${earnings} fish while you were away! (${daysAway} day${daysAway > 1 ? 's' : ''})`), 500);
    }

    const hoursAwaySinceLastPlay = save.lastPlayedTimestamp ? (Date.now() - save.lastPlayedTimestamp) / (1000 * 60 * 60) : 0;
    if (hoursAwaySinceLastPlay >= 24 && save.totalJobsCompleted > 0) {
      setTimeout(() => deps.showGuildReport(save), 800);
    } else if (save.totalJobsCompleted > 0) {
      const catNames = save.cats.slice(0, 3).map((c) => c.name).join(', ');
      setTimeout(() => deps.showToast(`Welcome back! ${catNames}${save.cats.length > 3 ? ` and ${save.cats.length - 3} others` : ''} await your orders.`), 500);
    }

    const dailyCost = deps.getDailyUpkeep(save);
    if (save.fish < dailyCost && save.cats.length > 1 && hoursAwaySinceLastPlay < 24) {
      setTimeout(() => {
        deps.showToast(`Warning: You have ${save.fish} fish but need ${dailyCost} for today's upkeep. Earn fish or a cat may leave!`);
      }, 2500);
    }

    deps.onGameLoaded?.(save);
  });

  return {
    saveGame,
    clearCurrentSave,
    getActiveSlot: () => activeSlot,
  };
}
