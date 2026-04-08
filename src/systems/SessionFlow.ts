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
    // Back button (top-left of the overlay) cancels the new-game flow
    // and returns to the title screen. Per user feedback (2026-04-08):
    // "after the player clicks new game, make a way for them to go
    // back to the main screen, such as a back button or something."
    prompt.innerHTML = `
      <button class="name-prompt-back" id="name-prompt-back" style="position:absolute;top:10px;left:10px;background:none;border:1px solid #3a3530;color:#8b7355;padding:4px 10px;border-radius:4px;font-family:Georgia,serif;font-size:12px;cursor:pointer">\u2190 Back</button>
      <h2>Name Your Cat</h2>
      <p>You are a wildcat stray, arriving at a crumbling settlement in a storm. What is your name?</p>
      <input type="text" class="cat-name-input" placeholder="Enter name..." maxlength="20" autocomplete="off" />
      <div style="margin-top:12px;color:#8b7355;font-size:11px;font-family:Georgia,serif">Pronouns</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="gender-btn" data-gender="female" style="flex:1;background:#3a3530;border:1px solid #6b5b3e;color:#c4956a;padding:6px;border-radius:4px;font-family:Georgia,serif;font-size:12px;cursor:pointer">she / her</button>
        <button class="gender-btn" data-gender="male" style="flex:1;background:#2a2520;border:1px solid #3a3530;color:#8b7355;padding:6px;border-radius:4px;font-family:Georgia,serif;font-size:12px;cursor:pointer">he / him</button>
      </div>
      <button class="cat-name-submit" style="margin-top:12px">Begin</button>
    `;
    deps.overlayLayer.appendChild(prompt);

    const input = prompt.querySelector<HTMLInputElement>('.cat-name-input')!;
    const submit = prompt.querySelector<HTMLButtonElement>('.cat-name-submit')!;
    const backBtn = prompt.querySelector<HTMLButtonElement>('.name-prompt-back')!;
    input.focus();

    backBtn.addEventListener('click', () => {
      prompt.remove();
      deps.switchScene('TitleScene');
    });

    // Gender selection — defaults to 'female' (she/her is highlighted by
    // default in the prompt). The 'they' option was removed per user
    // feedback (2026-04-08); legacy saves still resolve via the pronouns
    // helper, but new games choose between he/him and she/her.
    let chosenGender: 'male' | 'female' = 'female';
    const genderBtns = prompt.querySelectorAll<HTMLButtonElement>('.gender-btn');
    genderBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        chosenGender = (btn.dataset.gender as 'male' | 'female') ?? 'female';
        genderBtns.forEach((b) => {
          const isSelected = b === btn;
          b.style.background = isSelected ? '#3a3530' : '#2a2520';
          b.style.borderColor = isSelected ? '#6b5b3e' : '#3a3530';
          b.style.color = isSelected ? '#c4956a' : '#8b7355';
        });
      });
    });

    let submitted = false;
    const doSubmit = () => {
      if (submitted) return;
      submitted = true;
      const name = input.value.trim() || 'Stray';
      prompt.remove();
      const save = deps.createDefaultSave(name);
      save.playerCatGender = chosenGender;
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
