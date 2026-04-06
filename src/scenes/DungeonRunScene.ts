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
}

// Store dungeon state globally so minigame scenes can read/write it
let activeDungeon: DungeonState | null = null;

export function getActiveDungeon(): DungeonState | null {
  return activeDungeon;
}

export function dungeonTakeDamage(amount: number): void {
  if (!activeDungeon) return;
  activeDungeon.hp = Math.max(0, activeDungeon.hp - amount);
}

export function isDungeonRun(): boolean {
  return activeDungeon !== null;
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

    activeDungeon = {
      catId: cat.id,
      catBreed: cat.breed,
      catName: cat.name,
      hp: 3 + huntingBonus + Math.floor(enduranceBonus / 2),
      maxHp: 3 + huntingBonus + Math.floor(enduranceBonus / 2),
      floor: 0,
      totalFloors,
      floorsCleared: 0,
      floorSequence: sequence,
    };

    showNarrativeOverlay({
      scenes: [
        `${cat.name} descends into the cellar beneath the guildhall.`,
        'The air is damp. Old stone walls close in.',
        `${activeDungeon.totalFloors} chambers lie ahead. Each one a test.`,
      ],
      image: 'assets/sprites/scenes/guildhall.png',
      catSprite: cat.breed,
      tone: 'dark',
      onComplete: () => this.advanceFloor(),
    });
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

    // Cat sprite
    const idleKey = `${d.catBreed}_idle_south`;
    if (this.textures.exists(idleKey)) {
      const sprite = this.add.sprite(GAME_WIDTH / 2, 290, idleKey);
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

  private advanceFloor(): void {
    const d = activeDungeon!;
    if (d.floor >= d.totalFloors) {
      this.dungeonCleared();
      return;
    }

    const floorInfo = d.floorSequence[d.floor];
    d.floor++;

    // Determine difficulty based on floor depth
    const difficulty = d.floor <= 2 ? 'easy' : d.floor <= 4 ? 'medium' : 'hard';

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

    saveGame(save);

    showNarrativeOverlay({
      scenes: [
        `${d.catName} emerged from the cellar, dusty but triumphant.`,
        `${d.totalFloors} chambers cleared. The guild\'s deepest secrets revealed.`,
        `Earned ${fishReward} fish and grew stronger.`,
      ],
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

    saveGame(save);

    showNarrativeOverlay({
      scenes: [
        `${d.catName} stumbled back up the cellar stairs, exhausted.`,
        `${d.floorsCleared} of ${d.totalFloors} chambers cleared.`,
        partialFish > 0 ? `Salvaged ${partialFish} fish from the depths.` : 'Nothing to show for the attempt.',
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
