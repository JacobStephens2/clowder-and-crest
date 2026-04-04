import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';

// ── Layout constants ──
const BAR_HEIGHT = 360;
const BAR_WIDTH = 28;
const BAR_X_RIGHT = GAME_WIDTH - 50;       // fish zone bar (right side)
const BAR_X_LEFT = 50;                      // catch meter (left side)
const BAR_Y = 260;

const HOOK_WIDTH = BAR_WIDTH - 4;
const HOOK_HEIGHT = 8;

// ── Colors ──
const BG_COLOR = 0x1c1b19;
const WATER_COLOR = 0x2a3a4a;
const DOCK_COLOR = 0x5a4a3a;
const DOCK_PLANK = 0x6b5b4a;
const FISH_ZONE_COLOR = 0x4a8a4a;
const HOOK_COLOR = 0xc4956a;
const BAR_BG_COLOR = 0x1a1918;
const BAR_BORDER_COLOR = 0x3a3530;
const CATCH_FULL_COLOR = 0x4a8a4a;
const CATCH_EMPTY_COLOR = 0x8a4a4a;
const LINE_COLOR = 0x8b7355;

// ── Difficulty settings ──
interface DifficultyConfig {
  zoneSize: number;       // fraction of bar height (smaller = harder)
  bounceSpeed: number;    // pixels per second the zone moves
  hookRiseSpeed: number;  // pixels per second hook rises when held
  hookFallSpeed: number;  // pixels per second hook falls when released
  catchRate: number;      // catch meter fill per second (inside zone)
  drainRate: number;      // catch meter drain per second (outside zone)
  timeLimit: number;      // seconds before auto-fail
}

const DIFFICULTY_MAP: Record<string, DifficultyConfig> = {
  easy: {
    zoneSize: 0.30,
    bounceSpeed: 90,
    hookRiseSpeed: 200,
    hookFallSpeed: 140,
    catchRate: 0.25,
    drainRate: 0.15,
    timeLimit: 30,
  },
  medium: {
    zoneSize: 0.22,
    bounceSpeed: 130,
    hookRiseSpeed: 220,
    hookFallSpeed: 160,
    catchRate: 0.20,
    drainRate: 0.18,
    timeLimit: 35,
  },
  hard: {
    zoneSize: 0.15,
    bounceSpeed: 180,
    hookRiseSpeed: 250,
    hookFallSpeed: 180,
    catchRate: 0.15,
    drainRate: 0.22,
    timeLimit: 45,
  },
};

export class FishingScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';
  private diffConfig!: DifficultyConfig;

  // State
  private isReeling = false;
  private hookY = 0;           // 0 = bottom of bar, BAR_HEIGHT = top
  private zoneY = 0;           // bottom edge of zone in bar-local coords (0..BAR_HEIGHT)
  private zoneDir = 1;         // 1 = moving up, -1 = moving down
  private catchMeter = 0;      // 0..1
  private elapsed = 0;         // seconds since start
  private finished = false;

  // Graphics objects
  private hookRect!: Phaser.GameObjects.Rectangle;
  private zoneRect!: Phaser.GameObjects.Rectangle;
  private catchFillRect!: Phaser.GameObjects.Rectangle;
  private catchBorderRect!: Phaser.GameObjects.Rectangle;
  private timerText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private fishLine!: Phaser.GameObjects.Graphics;

  // Water ripple
  private waterRippleTimer = 0;
  private fishName = 'Fish';
  private ripples: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super({ key: 'FishingScene' });
  }

  init(data: { difficulty?: string; jobId?: string; catId?: string }): void {
    this.difficulty = data.difficulty ?? 'easy';
    this.jobId = data.jobId ?? '';
    this.catId = data.catId ?? '';
    const save = getGameState();
    const cat = save?.cats.find((c) => c.id === this.catId);
    this.catBreed = cat?.breed ?? 'wildcat';
    this.diffConfig = { ...(DIFFICULTY_MAP[this.difficulty] ?? DIFFICULTY_MAP.easy) };

    // Cat stat bonuses: Endurance slows drain, Senses enlarges zone
    if (cat) {
      const endBonus = cat.stats.endurance * 0.008; // up to -0.08 drain at 10
      const sensBonus = cat.stats.senses * 0.012;   // up to +0.12 zone at 10
      this.diffConfig.drainRate = Math.max(0.05, this.diffConfig.drainRate - endBonus);
      this.diffConfig.zoneSize = Math.min(0.5, this.diffConfig.zoneSize + sensBonus);
    }

    this.isReeling = false;
    this.hookY = 0;
    this.zoneY = BAR_HEIGHT * 0.3;
    this.zoneDir = 1;
    this.catchMeter = 0.35;
    this.elapsed = 0;
    this.finished = false;
    this.ripples = [];
    this.waterRippleTimer = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Show tutorial on first play
    if (!localStorage.getItem('clowder_fishing_tutorial')) {
      localStorage.setItem('clowder_fishing_tutorial', '1');
      const tutorial = document.createElement('div');
      tutorial.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
      tutorial.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:12px">Fishing</div>
        <div style="color:#8b7355;font-family:Georgia,serif;font-size:14px;text-align:center;max-width:280px;line-height:1.6">
          Hold <strong>click/tap</strong> or <strong>Space</strong> to reel in.<br><br>
          Keep the gold hook inside the green fish zone to fill the catch meter.<br><br>
          If the hook stays outside too long, the fish escapes!
        </div>
        <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:12px;margin-top:20px">Tap to start</div>
      `;
      tutorial.addEventListener('click', () => tutorial.remove());
      document.body.appendChild(tutorial);
    }

    // ── Water background ──
    const waterTop = 180;
    this.add.rectangle(GAME_WIDTH / 2, waterTop + (GAME_HEIGHT - waterTop) / 2,
      GAME_WIDTH, GAME_HEIGHT - waterTop, WATER_COLOR);

    // Water surface shimmer lines
    const waterGfx = this.add.graphics();
    waterGfx.lineStyle(1, 0x3a4a5a, 0.3);
    for (let i = 0; i < 8; i++) {
      const wy = waterTop + 10 + i * 25;
      waterGfx.beginPath();
      waterGfx.moveTo(0, wy);
      for (let x = 0; x < GAME_WIDTH; x += 20) {
        waterGfx.lineTo(x + 10, wy + Math.sin(x * 0.1 + i) * 3);
      }
      waterGfx.strokePath();
    }

    // ── Dock ──
    const dockX = 30;
    const dockW = 160;
    const dockY = waterTop - 10;
    // Dock supports (posts)
    this.add.rectangle(dockX + 20, dockY + 30, 8, 50, 0x4a3a2a);
    this.add.rectangle(dockX + dockW - 20, dockY + 30, 8, 50, 0x4a3a2a);
    // Main platform
    this.add.rectangle(dockX + dockW / 2, dockY, dockW, 16, DOCK_COLOR);
    // Planks
    for (let p = 0; p < 5; p++) {
      const px = dockX + 16 + p * 32;
      this.add.rectangle(px, dockY, 30, 14, DOCK_PLANK).setStrokeStyle(1, 0x4a3a2a, 0.5);
    }

    // ── Cat sprite on dock ──
    const catX = dockX + dockW - 40;
    const catY = dockY - 20;
    const idleKey = `${this.catBreed}_idle_east`;
    if (this.textures.exists(idleKey)) {
      const sprite = this.add.sprite(catX, catY, idleKey);
      sprite.setScale(1.2);
      sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    } else {
      // Fallback circle
      this.add.circle(catX, catY, 12, 0xc4956a);
      this.add.circle(catX - 5, catY - 6, 4, 0xc4956a); // ear
      this.add.circle(catX + 5, catY - 6, 4, 0xc4956a); // ear
    }

    // ── Fishing line (will be redrawn every frame) ──
    this.fishLine = this.add.graphics();

    // ── Job name ──
    const job = getJob(this.jobId);
    if (job) {
      this.add.text(GAME_WIDTH / 2, 30, job.name, {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
      }).setOrigin(0.5);
    }

    // Fish type — varies by difficulty, adds flavor
    const fishTypes: Record<string, string[]> = {
      easy: ['Perch', 'Minnow', 'Gudgeon', 'Dace'],
      medium: ['Trout', 'Carp', 'Bream', 'Tench'],
      hard: ['Pike', 'Salmon', 'Eel', 'Sturgeon'],
    };
    const fishList = fishTypes[this.difficulty] ?? fishTypes.easy;
    const fishName = fishList[Math.floor(Math.random() * fishList.length)];
    this.fishName = fishName;

    // Stat bonuses display
    const gameSave = getGameState();
    const catData = gameSave?.cats.find((c: any) => c.id === this.catId);
    const endurance = catData?.stats?.endurance ?? 0;
    const senses = catData?.stats?.senses ?? 0;
    const bonuses: string[] = [];
    if (endurance >= 5) bonuses.push(`Endurance: slower drain`);
    if (senses >= 5) bonuses.push(`Senses: wider zone`);
    const bonusText = bonuses.length > 0 ? ` (${bonuses.join(', ')})` : '';

    this.add.text(GAME_WIDTH / 2, 48, `Catch: ${fishName}${bonusText}`, {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // ── Timer ──
    this.timerText = this.add.text(GAME_WIDTH / 2, 68, `Time: ${this.diffConfig.timeLimit}s`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    // ── Fish zone bar (right side) ──
    // Background
    this.add.rectangle(BAR_X_RIGHT, BAR_Y + BAR_HEIGHT / 2, BAR_WIDTH + 4, BAR_HEIGHT + 4, BAR_BG_COLOR)
      .setStrokeStyle(1, BAR_BORDER_COLOR);

    // Fish zone (green area that bounces)
    const zonePxHeight = BAR_HEIGHT * this.diffConfig.zoneSize;
    this.zoneRect = this.add.rectangle(
      BAR_X_RIGHT, BAR_Y + BAR_HEIGHT - this.zoneY - zonePxHeight / 2,
      BAR_WIDTH, zonePxHeight, FISH_ZONE_COLOR, 0.5
    );

    // Hook indicator
    this.hookRect = this.add.rectangle(
      BAR_X_RIGHT, BAR_Y + BAR_HEIGHT,
      HOOK_WIDTH, HOOK_HEIGHT, HOOK_COLOR
    );
    this.hookRect.setStrokeStyle(1, 0xffffff, 0.3);

    // Labels
    this.add.text(BAR_X_RIGHT, BAR_Y - 12, 'Fish', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // ── Catch meter (left side) ──
    this.add.rectangle(BAR_X_LEFT, BAR_Y + BAR_HEIGHT / 2, BAR_WIDTH + 4, BAR_HEIGHT + 4, BAR_BG_COLOR)
      .setStrokeStyle(1, BAR_BORDER_COLOR);

    this.catchFillRect = this.add.rectangle(
      BAR_X_LEFT, BAR_Y + BAR_HEIGHT, BAR_WIDTH, 0, CATCH_FULL_COLOR, 0.7
    );
    this.catchFillRect.setOrigin(0.5, 1);

    this.catchBorderRect = this.add.rectangle(
      BAR_X_LEFT, BAR_Y + BAR_HEIGHT / 2, BAR_WIDTH + 4, BAR_HEIGHT + 4
    );
    this.catchBorderRect.setStrokeStyle(1, BAR_BORDER_COLOR);
    this.catchBorderRect.setFillStyle(0x000000, 0);

    this.add.text(BAR_X_LEFT, BAR_Y - 12, 'Catch', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // ── Instruction text ──
    this.instructionText = this.add.text(GAME_WIDTH / 2, BAR_Y + BAR_HEIGHT + 30,
      'Hold to reel in!', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // ── Quit button ──
    this.createButton(GAME_WIDTH / 2, BAR_Y + BAR_HEIGHT + 65, 'Quit', () => {
      this.finished = true;
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownScene');
    });

    // ── Input: pointer (click/tap) ──
    this.input.on('pointerdown', () => {
      if (!this.finished) this.isReeling = true;
    });
    this.input.on('pointerup', () => {
      this.isReeling = false;
    });

    // ── Input: space bar ──
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.finished) this.isReeling = true;
    });
    this.input.keyboard?.on('keyup-SPACE', () => {
      this.isReeling = false;
    });

    eventBus.emit('show-ui');
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;

    const dt = delta / 1000; // seconds
    this.elapsed += dt;

    // ── Update timer ──
    const remaining = Math.max(0, this.diffConfig.timeLimit - this.elapsed);
    this.timerText.setText(`Time: ${Math.ceil(remaining)}s`);

    if (remaining <= 0) {
      this.onFailure();
      return;
    }

    // ── Current surge — periodic speed boost that adds challenge ──
    const surgeInterval = 6; // seconds between surges
    const surgeDuration = 1.5;
    const timeSinceLastSurge = this.elapsed % surgeInterval;
    const isSurging = timeSinceLastSurge < surgeDuration && this.elapsed > 3; // no surge in first 3s
    const speedMult = isSurging ? 2.0 : 1.0;

    // ── Move fish zone (bounce up and down) ──
    const zonePxHeight = BAR_HEIGHT * this.diffConfig.zoneSize;
    this.zoneY += this.zoneDir * this.diffConfig.bounceSpeed * speedMult * dt;

    // Bounce at top/bottom
    if (this.zoneY + zonePxHeight > BAR_HEIGHT) {
      this.zoneY = BAR_HEIGHT - zonePxHeight;
      this.zoneDir = -1;
    } else if (this.zoneY < 0) {
      this.zoneY = 0;
      this.zoneDir = 1;
    }

    // Update zone rect position (convert bar-local to world)
    this.zoneRect.y = BAR_Y + BAR_HEIGHT - this.zoneY - zonePxHeight / 2;
    // Flash zone during surge
    this.zoneRect.setAlpha(isSurging ? 0.5 + Math.sin(this.elapsed * 10) * 0.3 : 0.6);

    // ── Move hook ──
    if (this.isReeling) {
      this.hookY += this.diffConfig.hookRiseSpeed * dt;
    } else {
      this.hookY -= this.diffConfig.hookFallSpeed * dt;
    }
    this.hookY = Phaser.Math.Clamp(this.hookY, 0, BAR_HEIGHT);

    // Update hook rect position
    this.hookRect.y = BAR_Y + BAR_HEIGHT - this.hookY;

    // ── Check if hook is inside fish zone ──
    const hookInZone = this.hookY >= this.zoneY && this.hookY <= this.zoneY + zonePxHeight;

    if (hookInZone) {
      this.catchMeter += this.diffConfig.catchRate * dt;
      this.hookRect.setFillStyle(0x6aba6a); // bright green when in zone
    } else {
      this.catchMeter -= this.diffConfig.drainRate * dt;
      this.hookRect.setFillStyle(HOOK_COLOR);
    }
    this.catchMeter = Phaser.Math.Clamp(this.catchMeter, 0, 1);

    // ── Update catch meter visual ──
    const fillHeight = this.catchMeter * BAR_HEIGHT;
    this.catchFillRect.height = fillHeight;
    this.catchFillRect.y = BAR_Y + BAR_HEIGHT;

    // Color shifts from red (empty) to green (full)
    const r = Math.floor(0x8a - (0x8a - 0x4a) * this.catchMeter);
    const g = Math.floor(0x4a + (0x8a - 0x4a) * this.catchMeter);
    const b = 0x4a;
    this.catchFillRect.setFillStyle((r << 16) | (g << 8) | b, 0.7);

    // ── Update fishing line ──
    this.fishLine.clear();
    this.fishLine.lineStyle(1.5, LINE_COLOR, 0.6);
    // Line from cat (rod tip) down to hook position on the right bar
    const rodTipX = 150;
    const rodTipY = 155;
    const hookWorldX = BAR_X_RIGHT;
    const hookWorldY = BAR_Y + BAR_HEIGHT - this.hookY;
    this.fishLine.beginPath();
    this.fishLine.moveTo(rodTipX, rodTipY);
    // Slight curve via control points
    const midX = (rodTipX + hookWorldX) / 2;
    const midY = Math.min(rodTipY, hookWorldY) + 40;
    this.fishLine.lineTo(midX, midY);
    this.fishLine.lineTo(hookWorldX, hookWorldY);
    this.fishLine.strokePath();

    // ── Water ripples ──
    this.waterRippleTimer += dt;
    if (this.waterRippleTimer > 1.5) {
      this.waterRippleTimer = 0;
      const rx = 80 + Math.random() * (GAME_WIDTH - 160);
      const ry = 200 + Math.random() * 100;
      const ripple = this.add.circle(rx, ry, 2, 0x4a5a6a, 0.4);
      this.ripples.push(ripple);
      this.tweens.add({
        targets: ripple,
        scaleX: 8,
        scaleY: 4,
        alpha: 0,
        duration: 2000,
        onComplete: () => {
          ripple.destroy();
          const idx = this.ripples.indexOf(ripple);
          if (idx >= 0) this.ripples.splice(idx, 1);
        },
      });
    }

    // ── Update instruction text ──
    if (hookInZone) {
      this.instructionText.setText('Reeling in...');
      this.instructionText.setColor('#4a8a4a');
    } else if (this.isReeling) {
      this.instructionText.setText('Find the fish zone!');
      this.instructionText.setColor('#c4956a');
    } else {
      this.instructionText.setText('Hold to reel in!');
      this.instructionText.setColor('#6b5b3e');
    }

    // ── Win/lose checks ──
    if (this.catchMeter >= 1) {
      this.onSuccess();
    } else if (this.catchMeter <= 0 && this.elapsed > 3) {
      // Grace period of 3 seconds before drain can cause failure
      this.onFailure();
    }
  }

  private onSuccess(): void {
    this.finished = true;
    this.isReeling = false;

    // Stars based on how quickly the catch was filled
    const timeFraction = this.elapsed / this.diffConfig.timeLimit;
    let stars: number;
    if (timeFraction <= 0.4) {
      stars = 3;
    } else if (timeFraction <= 0.7) {
      stars = 2;
    } else {
      stars = 1;
    }

    // Show success text
    playSfx('splash');
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, `${this.fishName} Caught!`, {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#c4956a',
    }).setOrigin(0.5);

    const starLabel = stars === 3 ? '★★★' : stars === 2 ? '★★' : '★';
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, starLabel, {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#dda055',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `fishing_${this.difficulty}`,
        moves: Math.floor(this.elapsed),
        minMoves: Math.floor(this.diffConfig.timeLimit * 0.3),
        stars,
        jobId: this.jobId,
        catId: this.catId,
      });
    });
  }

  private onFailure(): void {
    this.finished = true;
    this.isReeling = false;

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'It got away...', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#aa4444',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, 'The fish escaped!', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
    }).setOrigin(0.5);

    this.time.delayedCall(2000, () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownScene');
    });
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 120, 36, 0x2a2520);
    bg.setStrokeStyle(1, 0x6b5b3e);
    bg.setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
    }).setOrigin(0.5);
    bg.on('pointerover', () => { bg.setFillStyle(0x3a3530); text.setColor('#ddb87a'); });
    bg.on('pointerout', () => { bg.setFillStyle(0x2a2520); text.setColor('#c4956a'); });
    bg.on('pointerdown', onClick);
  }
}
