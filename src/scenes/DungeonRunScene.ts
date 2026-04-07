/**
 * Roguelike dungeon run — chain of random minigame floors with persistent HP.
 * Unlocks after Chapter 5. Player picks a cat, descends through 5-8 floors.
 * Each floor is a random minigame. HP persists across floors.
 * Failing = cat returns exhausted. Clearing all = rare reward.
 */
import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_NAMES, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { saveGame } from '../systems/SaveManager';
import { showNarrativeOverlay } from '../ui/narrativeOverlay';

// Available minigame types for dungeon floors
const FLOOR_GAMES = [
  { game: 'chase', label: 'Rat Maze', icon: '\u{1F400}' },
  { game: 'hunt', label: 'Rat Hunt', icon: '\u{1F3AF}' },
  { game: 'brawl', label: 'Combat', icon: '\u{2694}\u{FE0F}' },
  { game: 'fishing', label: 'Underground Stream', icon: '\u{1F3A3}' },
  { game: 'stealth', label: 'Guard Patrol', icon: '\u{1F43E}' },
  { game: 'sokoban', label: 'Blocked Passage', icon: '\u{1F4E6}' },
  { game: 'nonogram', label: 'Ancient Inscription', icon: '\u{1F4DC}' },
  { game: 'patrol', label: 'Dark Watch', icon: '\u{1F56F}\u{FE0F}' },
  { game: 'ritual', label: 'Forgotten Altar', icon: '\u{1F56F}\u{FE0F}' },
  { game: 'heist', label: 'Locked Vault', icon: '\u{1F510}' },
];

// ── Inter-floor upgrade cards ──
//
// Per the doc's "Inter-Floor Agency" pillar (the Slay the Spire model):
// between floors the player picks one of three upgrades. Each card either
// adjusts state immediately (Bandage, Field Rations) or sets a passive flag
// the rest of the run respects (Whetstone, Lucky Charm, Second Wind, Lantern).
// The picks are situationally meaningful — the right answer depends on
// current HP, remaining floors, and which buffs are already active.
export type UpgradeId = 'bandage' | 'field_rations' | 'whetstone' | 'lucky_charm' | 'second_wind' | 'lantern';

export interface UpgradeCard {
  id: UpgradeId;
  name: string;
  description: string;
}

export const UPGRADE_CARDS: UpgradeCard[] = [
  { id: 'bandage',      name: 'Bandage',      description: 'Restore 2 HP immediately.' },
  { id: 'field_rations', name: 'Field Rations', description: '+1 max HP, restore 1 HP.' },
  { id: 'whetstone',    name: 'Whetstone',    description: 'Next floor runs at the easier difficulty.' },
  { id: 'lucky_charm',  name: 'Lucky Charm',  description: 'Next HP loss this run is negated.' },
  { id: 'second_wind',  name: 'Second Wind',  description: 'When HP would drop to 0, restore 1 HP. (Once)' },
  { id: 'lantern',      name: 'Lantern',      description: 'Reveal the next 3 floor types.' },
];

interface DungeonState {
  catId: string;
  catBreed: string;
  catName: string;
  hp: number;
  maxHp: number;
  floor: number;
  totalFloors: number;
  floorsCleared: number;
  floorSequence: typeof FLOOR_GAMES[number][];
  /** Active passive upgrades earned this run. Multiple cards can stack. */
  activeUpgrades: UpgradeId[];
  /** Set when whetstone is consumed for the next floor. Resets after use. */
  pendingWhetstone: boolean;
  /** Set when lucky_charm is active. Cleared when first HP loss is negated. */
  luckyCharmActive: boolean;
  /** Set when second_wind is active. Cleared when triggered. */
  secondWindActive: boolean;
  /** Number of floors lantern reveals (decrements as the player advances). */
  lanternFloorsLeft: number;
}

// Store dungeon state globally so minigame scenes can read/write it
let activeDungeon: DungeonState | null = null;

export function getActiveDungeon(): DungeonState | null {
  return activeDungeon;
}

/** Apply damage to the active dungeon cat. Respects the lucky_charm passive
    (negates the first hit) and the second_wind passive (rebounds to 1 HP
    when about to die). Both upgrades clear themselves after triggering. */
export function dungeonTakeDamage(amount: number): void {
  if (!activeDungeon) return;
  // Lucky Charm absorbs the first hit entirely
  if (activeDungeon.luckyCharmActive) {
    activeDungeon.luckyCharmActive = false;
    return;
  }
  const newHp = Math.max(0, activeDungeon.hp - amount);
  // Second Wind: if this hit would drop us to 0, save us at 1
  if (newHp === 0 && activeDungeon.secondWindActive) {
    activeDungeon.secondWindActive = false;
    activeDungeon.hp = 1;
    return;
  }
  activeDungeon.hp = newHp;
}

export function isDungeonRun(): boolean {
  return activeDungeon !== null;
}

/** Apply an upgrade card's effect to the active dungeon. Public so the
    playtest and the upgrade UI can both invoke it through the same path. */
export function applyDungeonUpgrade(id: UpgradeId): void {
  if (!activeDungeon) return;
  const d = activeDungeon;
  switch (id) {
    case 'bandage':
      d.hp = Math.min(d.maxHp, d.hp + 2);
      break;
    case 'field_rations':
      d.maxHp += 1;
      d.hp = Math.min(d.maxHp, d.hp + 1);
      break;
    case 'whetstone':
      d.pendingWhetstone = true;
      break;
    case 'lucky_charm':
      d.luckyCharmActive = true;
      break;
    case 'second_wind':
      d.secondWindActive = true;
      break;
    case 'lantern':
      d.lanternFloorsLeft = 3;
      break;
  }
  if (!d.activeUpgrades.includes(id)) d.activeUpgrades.push(id);
}

/** Pick three random upgrade cards. Excludes any single-use passive that's
    already active (lucky_charm, second_wind) so the player isn't offered a
    no-op pick. */
export function pickUpgradeOffer(): UpgradeCard[] {
  const d = activeDungeon;
  const excluded = new Set<UpgradeId>();
  if (d?.luckyCharmActive) excluded.add('lucky_charm');
  if (d?.secondWindActive) excluded.add('second_wind');
  if (d && d.lanternFloorsLeft > 0) excluded.add('lantern');
  const pool = UPGRADE_CARDS.filter((c) => !excluded.has(c.id));
  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export class DungeonRunScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DungeonRunScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0908');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.cameras.main.fadeIn(300, 10, 9, 8);

    const save = getGameState();
    if (!save || save.chapter < 5) {
      this.showLocked();
      return;
    }

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    // Check if returning from a floor
    if (activeDungeon) {
      this.showFloorTransition();
      return;
    }

    // Show cat selection
    this.showCatSelection();
  }

  private showLocked(): void {
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'The cellar is sealed.\nReach Chapter 5 to unlock.', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#6b5b3e',
      align: 'center',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'Tap to return', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#555',
    }).setOrigin(0.5);

    this.input.once('pointerdown', () => {
      eventBus.emit('navigate', 'GuildhallScene');
    });
  }

  private showCatSelection(): void {
    const save = getGameState()!;

    this.add.text(GAME_WIDTH / 2, 40, 'The Cellar', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 70, 'A passage beneath the guildhall.\nChoose a cat to descend.', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
      align: 'center',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 100, 'HP persists across floors. Failure = 2 days exhausted.', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // Cat cards
    let y = 140;
    for (const cat of save.cats) {
      const color = BREED_COLORS[cat.breed] ?? '#8b7355';
      const breedName = BREED_NAMES[cat.breed] ?? cat.breed;
      const totalStats = Object.values(cat.stats).reduce((s, v) => s + v, 0);

      const card = this.add.rectangle(GAME_WIDTH / 2, y, 340, 50, 0x2a2520);
      card.setStrokeStyle(1, 0x6b5b3e);
      card.setInteractive({ useHandCursor: true });

      // Cat sprite
      const idleKey = `${cat.breed}_idle_south`;
      if (this.textures.exists(idleKey)) {
        const sprite = this.add.sprite(40, y, idleKey);
        sprite.setScale(0.6);
        sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }

      this.add.text(75, y - 10, `${cat.name}`, {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
      }).setOrigin(0, 0.5);

      this.add.text(75, y + 10, `${breedName} Lv.${cat.level} | Stats: ${totalStats}`, {
        fontFamily: 'Georgia, serif', fontSize: '10px', color: '#8b7355',
      }).setOrigin(0, 0.5);

      this.add.text(GAME_WIDTH - 40, y, '\u25B6', {
        fontSize: '16px', color: '#c4956a',
      }).setOrigin(0.5);

      card.on('pointerdown', () => this.startDungeon(cat));
      card.on('pointerover', () => card.setFillStyle(0x3a3530));
      card.on('pointerout', () => card.setFillStyle(0x2a2520));

      y += 60;
    }

    // Back button
    this.add.text(GAME_WIDTH / 2, y + 20, 'Back', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#6b5b3e',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('navigate', 'GuildhallScene');
    });

    eventBus.emit('show-ui');
  }

  private startDungeon(cat: any): void {
    const save = getGameState()!;
    const huntingBonus = Math.max(0, (cat.stats.hunting ?? 5) - 4);
    const enduranceBonus = Math.max(0, (cat.stats.endurance ?? 5) - 4);
    const totalFloors = 5 + Math.floor(save.chapter / 3); // 5-7 floors based on chapter

    // Build random floor sequence — no repeats in a row
    const sequence: typeof FLOOR_GAMES[number][] = [];
    let lastGame = '';
    for (let i = 0; i < totalFloors; i++) {
      const available = FLOOR_GAMES.filter(g => g.game !== lastGame);
      const pick = available[Math.floor(Math.random() * available.length)];
      sequence.push(pick);
      lastGame = pick.game;
    }

    const baseHp = 3 + huntingBonus + Math.floor(enduranceBonus / 2);
    activeDungeon = {
      catId: cat.id,
      catBreed: cat.breed,
      catName: cat.name,
      hp: baseHp,
      maxHp: baseHp,
      floor: 0,
      totalFloors,
      floorsCleared: 0,
      floorSequence: sequence,
      activeUpgrades: [],
      pendingWhetstone: false,
      luckyCharmActive: false,
      secondWindActive: false,
      lanternFloorsLeft: 0,
    };

    // Increment run count BEFORE picking the narrative — this run is now the
    // current attempt. The Hades-style reactive narrative branches on the
    // count of PRIOR runs to vary the intro flavor.
    if (!save.dungeonHistory) {
      save.dungeonHistory = { totalRuns: 0, totalClears: 0, bestFloor: 0, lastFailFloor: -1, lastFailCause: '' };
    }
    const priorRuns = save.dungeonHistory.totalRuns;
    save.dungeonHistory.totalRuns++;
    saveGame(save);

    showNarrativeOverlay({
      scenes: this.buildIntroScenes(cat.name, totalFloors, priorRuns, save.dungeonHistory),
      image: 'assets/sprites/scenes/guildhall.png',
      catSprite: cat.breed,
      tone: 'dark',
      onComplete: () => this.advanceFloor(),
    });
  }

  /** Reactive intro narrative — branches on prior run history per the
      Hades model. First-attempt players get the standard descent; veterans
      get specific callbacks to past failures or successes. */
  private buildIntroScenes(catName: string, totalFloors: number, priorRuns: number, history: { totalClears: number; bestFloor: number; lastFailFloor: number; lastFailCause: string }): string[] {
    if (priorRuns === 0) {
      return [
        `${catName} descends into the cellar beneath the guildhall.`,
        'The air is damp. Old stone walls close in.',
        `${totalFloors} chambers lie ahead. Each one a test.`,
      ];
    }
    if (history.totalClears > 0) {
      return [
        `${catName} returns to the cellar — bones littered with old victories.`,
        `${history.totalClears} clear${history.totalClears === 1 ? '' : 's'} behind. The depths still pull.`,
        `${totalFloors} chambers wait, as ever.`,
      ];
    }
    // Lost-it-before path
    if (history.lastFailFloor >= 0) {
      const floorMention = history.lastFailFloor + 1; // 1-indexed for display
      return [
        `${catName} steps back into the cellar.`,
        history.lastFailCause
          ? `Last time: undone in the ${history.lastFailCause} on floor ${floorMention}.`
          : `Last time, the depths drove ${catName} back at floor ${floorMention}.`,
        history.bestFloor > 0
          ? `Best so far: ${history.bestFloor} of ${totalFloors}. Today...?`
          : `${totalFloors} chambers, again.`,
      ];
    }
    return [
      `${catName} descends, again, into the cellar.`,
      'Old stones, old silences.',
      `${totalFloors} chambers ahead.`,
    ];
  }

  private showFloorTransition(): void {
    const d = activeDungeon!;

    if (d.hp <= 0) {
      // Cat exhausted — return to surface
      this.dungeonFailed();
      return;
    }

    if (d.floor >= d.totalFloors) {
      // All floors cleared!
      this.dungeonCleared();
      return;
    }

    // Show the upgrade picker BEFORE the floor reveal whenever the player
    // has just cleared a floor (floor > 0). The picker is the doc's
    // "inter-floor agency" pillar in concrete form: a real choice between
    // descents that shapes how the rest of the run plays.
    if (d.floor > 0) {
      this.showUpgradePicker(() => this.renderFloorIntro());
      return;
    }
    this.renderFloorIntro();
  }

  /** Render the standard "next floor preview" UI. Split out so the upgrade
      picker can chain into it after a card is selected. */
  private renderFloorIntro(): void {
    const d = activeDungeon!;
    const floorInfo = d.floorSequence[d.floor];

    // Floor intro screen
    this.add.text(GAME_WIDTH / 2, 80, 'The Cellar', {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 120, `Floor ${d.floor + 1} of ${d.totalFloors}`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#8b7355',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 160, `${floorInfo.icon} ${floorInfo.label}`, {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#dda055',
    }).setOrigin(0.5);

    // Lantern preview — shows the next 3 floor types if the upgrade is active
    if (d.lanternFloorsLeft > 0) {
      const previewItems: string[] = [];
      const lookahead = Math.min(d.lanternFloorsLeft, d.totalFloors - d.floor - 1);
      for (let i = 1; i <= lookahead; i++) {
        const next = d.floorSequence[d.floor + i];
        if (next) previewItems.push(`${next.icon} ${next.label}`);
      }
      if (previewItems.length > 0) {
        this.add.text(GAME_WIDTH / 2, 184, `Lantern: ${previewItems.join('  →  ')}`, {
          fontFamily: 'Georgia, serif', fontSize: '10px', color: '#ddaa33',
        }).setOrigin(0.5);
      }
    }

    // HP bar
    const barW = 200;
    const barX = GAME_WIDTH / 2 - barW / 2;
    this.add.rectangle(GAME_WIDTH / 2, 210, barW, 12, 0x333333).setStrokeStyle(1, 0x6b5b3e);
    const hpPct = d.hp / d.maxHp;
    const hpColor = hpPct > 0.5 ? 0x4a8a4a : hpPct > 0.25 ? 0xaa8a22 : 0xaa4444;
    this.add.rectangle(barX, 210, barW * hpPct, 12, hpColor).setOrigin(0, 0.5);
    this.add.text(GAME_WIDTH / 2, 210, `HP: ${d.hp}/${d.maxHp}`, {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#ddd',
    }).setOrigin(0.5);

    // Active passive upgrades — small badges so the player can see what's
    // protecting them this run.
    if (d.activeUpgrades.length > 0) {
      const passiveText = d.activeUpgrades
        .filter((u) => u !== 'bandage' && u !== 'field_rations')
        .map((u) => UPGRADE_CARDS.find((c) => c.id === u)?.name ?? u)
        .join(' · ');
      if (passiveText) {
        this.add.text(GAME_WIDTH / 2, 232, passiveText, {
          fontFamily: 'Georgia, serif', fontSize: '10px', color: '#88dd88',
        }).setOrigin(0.5);
      }
    }

    // Cat sprite
    const idleKey = `${d.catBreed}_idle_south`;
    if (this.textures.exists(idleKey)) {
      const sprite = this.add.sprite(GAME_WIDTH / 2, 300, idleKey);
      sprite.setScale(1.5);
      sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Descend button
    const btn = this.add.rectangle(GAME_WIDTH / 2, 400, 200, 50, 0x2a2520);
    btn.setStrokeStyle(2, 0xc4956a);
    btn.setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, 400, 'Descend', {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#c4956a',
    }).setOrigin(0.5);
    btn.on('pointerdown', () => this.advanceFloor());

    // Retreat button
    this.add.text(GAME_WIDTH / 2, 460, 'Retreat (keep partial rewards)', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#6b5b3e',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.dungeonRetreat();
    });

    eventBus.emit('show-ui');
  }

  /** Render the 3-card upgrade picker. Picks come from pickUpgradeOffer(),
      which excludes already-active single-use passives. After a pick is
      made, applyDungeonUpgrade applies the effect and onPicked() chains. */
  private showUpgradePicker(onPicked: () => void): void {
    const offer = pickUpgradeOffer();
    if (offer.length === 0) {
      onPicked();
      return;
    }

    this.add.text(GAME_WIDTH / 2, 80, 'A Boon Between Floors', {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#c4956a',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 110, 'Choose one to carry into the next chamber.', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#8b7355',
    }).setOrigin(0.5);

    const cardW = 320;
    const cardH = 80;
    let y = 160;
    for (const card of offer) {
      const bg = this.add.rectangle(GAME_WIDTH / 2, y, cardW, cardH, 0x2a2520);
      bg.setStrokeStyle(2, 0xdda055);
      bg.setInteractive({ useHandCursor: true });

      this.add.text(GAME_WIDTH / 2, y - 16, card.name, {
        fontFamily: 'Georgia, serif', fontSize: '15px', color: '#dda055',
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, y + 14, card.description, {
        fontFamily: 'Georgia, serif', fontSize: '11px', color: '#8b7355',
        align: 'center', wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setFillStyle(0x3a3530));
      bg.on('pointerout', () => bg.setFillStyle(0x2a2520));
      bg.on('pointerdown', () => {
        applyDungeonUpgrade(card.id);
        playSfx('sparkle', 0.4);
        // Clear the picker UI before chaining
        this.children.removeAll();
        this.cameras.main.setBackgroundColor('#0a0908');
        onPicked();
      });

      y += cardH + 14;
    }

    eventBus.emit('show-ui');
  }

  private advanceFloor(): void {
    const d = activeDungeon!;
    if (d.floor >= d.totalFloors) {
      this.dungeonCleared();
      return;
    }

    const floorInfo = d.floorSequence[d.floor];
    d.floor++;
    if (d.lanternFloorsLeft > 0) d.lanternFloorsLeft--;

    // Determine difficulty based on floor depth — one tier easier if a
    // whetstone is queued for consumption.
    let difficulty = d.floor <= 2 ? 'easy' : d.floor <= 4 ? 'medium' : 'hard';
    if (d.pendingWhetstone) {
      difficulty = difficulty === 'hard' ? 'medium' : 'easy';
      d.pendingWhetstone = false;
    }

    // Launch the minigame — it will emit puzzle-complete or puzzle-quit
    // The dungeon system intercepts these in main.ts
    const sceneMap: Record<string, string> = {
      chase: 'ChaseScene', hunt: 'HuntScene', brawl: 'BrawlScene',
      fishing: 'FishingScene', stealth: 'StealthScene', sokoban: 'SokobanScene',
      nonogram: 'NonogramScene', patrol: 'PatrolScene', ritual: 'RitualScene',
      heist: 'HeistScene',
    };

    const sceneName = sceneMap[floorInfo.game] ?? 'ChaseScene';
    eventBus.emit('navigate', sceneName);
    // The scene needs job data — use a synthetic job
    const sceneKeys = Object.values(this.game.scene.keys);
    this.scene.start(sceneName, {
      difficulty,
      jobId: 'dungeon_floor',
      catId: d.catId,
      catBreed: d.catBreed,
    });
  }

  private dungeonCleared(): void {
    const d = activeDungeon!;
    const save = getGameState();
    if (!save) return;

    playSfx('victory');
    haptic.success();

    // Reward: fish + stat boost
    const fishReward = 20 + d.totalFloors * 5;
    save.fish += fishReward;
    save.totalFishEarned += fishReward;

    // Stat boost to the dungeon cat
    const cat = save.cats.find(c => c.id === d.catId);
    if (cat) {
      const stats = Object.keys(cat.stats) as (keyof typeof cat.stats)[];
      const randomStat = stats[Math.floor(Math.random() * stats.length)];
      if (cat.stats[randomStat] < 10) cat.stats[randomStat]++;
    }

    // Record run history — clears + best floor. The narrative on the next
    // run reads from these fields per the Hades-style reactive system.
    if (!save.dungeonHistory) {
      save.dungeonHistory = { totalRuns: 0, totalClears: 0, bestFloor: 0, lastFailFloor: -1, lastFailCause: '' };
    }
    save.dungeonHistory.totalClears++;
    save.dungeonHistory.bestFloor = Math.max(save.dungeonHistory.bestFloor, d.floorsCleared);

    saveGame(save);

    // Reactive outro — first clear gets the standard celebration; repeat
    // clears acknowledge the player's experience.
    const isFirstClear = save.dungeonHistory.totalClears === 1;
    const scenes = isFirstClear ? [
      `${d.catName} emerged from the cellar, dusty but triumphant.`,
      `${d.totalFloors} chambers cleared. The guild's deepest secrets revealed.`,
      `Earned ${fishReward} fish and grew stronger.`,
    ] : [
      `${d.catName} climbs out of the cellar, eyes bright.`,
      `Clear number ${save.dungeonHistory.totalClears}. The depths give up another secret.`,
      `${fishReward} fish hauled to the surface.`,
    ];

    showNarrativeOverlay({
      scenes,
      catSprite: d.catBreed,
      tone: 'warm',
      onComplete: () => {
        activeDungeon = null;
        eventBus.emit('navigate', 'GuildhallScene');
      },
    });
  }

  private dungeonFailed(): void {
    const d = activeDungeon!;
    const save = getGameState();
    if (!save) return;

    playSfx('cat_sad');
    haptic.error();

    // Cat returns exhausted — mood drops
    const cat = save.cats.find(c => c.id === d.catId);
    if (cat) {
      cat.mood = 'unhappy';
    }

    // Partial fish reward for floors cleared
    const partialFish = d.floorsCleared * 3;
    if (partialFish > 0) {
      save.fish += partialFish;
      save.totalFishEarned += partialFish;
    }

    // Record run history — last fail floor + cause (the minigame the player
    // was on when HP hit 0). Narrative on next run cites this directly.
    if (!save.dungeonHistory) {
      save.dungeonHistory = { totalRuns: 0, totalClears: 0, bestFloor: 0, lastFailFloor: -1, lastFailCause: '' };
    }
    save.dungeonHistory.lastFailFloor = d.floor;
    // The "cause" is the floor type at the failure point
    const failFloorInfo = d.floorSequence[d.floor];
    save.dungeonHistory.lastFailCause = failFloorInfo?.label ?? '';
    save.dungeonHistory.bestFloor = Math.max(save.dungeonHistory.bestFloor, d.floorsCleared);

    saveGame(save);

    // Reactive outro — explicit attribution per the Spelunky 2 fairness
    // pillar: the player walks away knowing what defeated them.
    const causeLabel = failFloorInfo?.label ?? 'depths';
    showNarrativeOverlay({
      scenes: [
        `${d.catName} stumbled back up the cellar stairs, exhausted.`,
        `Defeated in the ${causeLabel} on floor ${d.floor + 1}.`,
        `${d.floorsCleared} of ${d.totalFloors} chambers cleared. ${partialFish > 0 ? `Salvaged ${partialFish} fish.` : 'Nothing to show for the attempt.'}`,
      ],
      catSprite: d.catBreed,
      tone: 'dark',
      onComplete: () => {
        activeDungeon = null;
        eventBus.emit('navigate', 'GuildhallScene');
      },
    });
  }

  private dungeonRetreat(): void {
    const d = activeDungeon!;
    const save = getGameState();
    if (!save) return;

    const partialFish = d.floorsCleared * 5;
    if (partialFish > 0) {
      save.fish += partialFish;
      save.totalFishEarned += partialFish;
    }
    saveGame(save);

    showNarrativeOverlay({
      scenes: [
        `${d.catName} retreated to the surface.`,
        partialFish > 0 ? `Brought back ${partialFish} fish from ${d.floorsCleared} cleared chambers.` : 'The cellar waits for another day.',
      ],
      catSprite: d.catBreed,
      tone: 'neutral',
      onComplete: () => {
        activeDungeon = null;
        eventBus.emit('navigate', 'GuildhallScene');
      },
    });
  }
}
