import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { createSceneButton, showMinigameTutorial } from '../ui/sceneHelpers';

// ── Layout ──
const FIELD_TOP = 160;
const FIELD_BOTTOM = 680;
const FIELD_LEFT = 30;
const FIELD_RIGHT = GAME_WIDTH - 30;
const HOLE_RADIUS = 20;

// Hole positions (3x3 grid)
const HOLES: { x: number; y: number }[] = [];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    HOLES.push({
      x: FIELD_LEFT + (col + 0.5) * ((FIELD_RIGHT - FIELD_LEFT) / 3),
      y: FIELD_TOP + (row + 0.5) * ((FIELD_BOTTOM - FIELD_TOP) / 3),
    });
  }
}

interface ActiveRat {
  holeIndex: number;
  gfx: Phaser.GameObjects.Graphics | Phaser.GameObjects.Sprite;
  hitZone: Phaser.GameObjects.Zone;
  timer: Phaser.Time.TimerEvent;
  caught: boolean;
}

export class HuntScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';
  private score = 0;
  private missed = 0;
  private maxMisses = 5;
  private timeLeft = 40;
  private totalSpawned = 0;
  private finished = false;
  private timerText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private missText!: Phaser.GameObjects.Text;
  private countdownTimer: Phaser.Time.TimerEvent | null = null;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private activeRats: ActiveRat[] = [];
  private tutorialShowing = false;
  private lastCatchSfx = 0;

  constructor() {
    super({ key: 'HuntScene' });
  }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.catBreed = data?.catBreed ?? 'wildcat';
    this.difficulty = data?.difficulty ?? 'easy';
    this.score = 0;
    this.missed = 0;
    this.totalSpawned = 0;
    this.finished = false;
    this.activeRats = [];

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    // Hunting stat gives more time
    const huntingBonus = Math.min(5, (cat?.stats?.hunting ?? 5) - 3);
    this.timeLeft = (this.difficulty === 'hard' ? 18 : this.difficulty === 'medium' ? 22 : 25) + huntingBonus;
    this.maxMisses = this.difficulty === 'hard' ? 3 : this.difficulty === 'medium' ? 4 : 5;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial on first play
    if (showMinigameTutorial(this, 'clowder_hunt_tutorial', 'Hunt the Rats!',
      `Rats pop up from holes in the ground.<br><br>
      <strong>Tap them</strong> before they disappear!<br><br>
      Miss too many and the job fails. Your cat's <strong style="color:#c4956a">Hunting</strong> stat gives bonus time.`,
      () => { this.tutorialShowing = false; }
    )) {
      this.tutorialShowing = true;
    }

    // Job name
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, (`${job?.name ?? 'Hunt'} (${this.difficulty})`), {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    // HUD
    this.timerText = this.add.text(GAME_WIDTH / 2, 60, `Time: ${this.timeLeft}s`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
    }).setOrigin(0.5);

    this.scoreText = this.add.text(60, 85, `Caught: ${this.score}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#4a8a4a',
    }).setOrigin(0, 0.5);

    this.missText = this.add.text(GAME_WIDTH - 60, 85, `Missed: ${this.missed}/${this.maxMisses}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cc6666',
    }).setOrigin(1, 0.5);

    // Draw field background
    const fieldGfx = this.add.graphics();
    fieldGfx.fillStyle(0x2a2820, 1);
    fieldGfx.fillRoundedRect(FIELD_LEFT - 10, FIELD_TOP - 10, FIELD_RIGHT - FIELD_LEFT + 20, FIELD_BOTTOM - FIELD_TOP + 20, 8);

    // Draw grass tufts
    fieldGfx.fillStyle(0x3a4a2a, 0.5);
    for (let i = 0; i < 30; i++) {
      const gx = FIELD_LEFT + Math.random() * (FIELD_RIGHT - FIELD_LEFT);
      const gy = FIELD_TOP + Math.random() * (FIELD_BOTTOM - FIELD_TOP);
      fieldGfx.fillCircle(gx, gy, 3 + Math.random() * 4);
    }

    // Draw holes
    for (const hole of HOLES) {
      const holeGfx = this.add.graphics();
      holeGfx.fillStyle(0x111111, 0.8);
      holeGfx.fillEllipse(hole.x, hole.y, HOLE_RADIUS * 2, HOLE_RADIUS * 1.2);
      holeGfx.fillStyle(0x1a1a1a, 0.5);
      holeGfx.fillEllipse(hole.x, hole.y - 2, HOLE_RADIUS * 1.6, HOLE_RADIUS * 0.8);
    }

    // Cat sprite in corner
    const catColor = BREED_COLORS[this.catBreed] ?? '#8b7355';
    const catKey = `${this.catBreed}_idle_south`;
    if (this.textures.exists(catKey)) {
      const cat = this.add.sprite(GAME_WIDTH / 2, FIELD_BOTTOM + 40, catKey);
      cat.setScale(0.8);
      cat.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Quit button
    createSceneButton(this, GAME_WIDTH / 2, FIELD_BOTTOM + 70, 'Quit', () => {
      this.cleanup();
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Countdown
    this.countdownTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.finished || this.tutorialShowing) return;
        this.timeLeft--;
        this.timerText.setText(`Time: ${this.timeLeft}s`);
        if (this.timeLeft <= 0) {
          this.endGame();
        }
      },
      loop: true,
    });

    // Spawn rats
    const spawnDelay = this.difficulty === 'hard' ? 700 : this.difficulty === 'medium' ? 900 : 1100;
    this.spawnTimer = this.time.addEvent({
      delay: spawnDelay,
      callback: () => {
        if (this.finished || this.tutorialShowing) return;
        this.spawnRat();
      },
      loop: true,
    });

    // Clean up on scene stop (prevent timer/tween memory leaks)
    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });
    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  private spawnRat(): void {
    // Find an unoccupied hole
    const occupied = new Set(this.activeRats.map((r) => r.holeIndex));
    const available = HOLES.map((_, i) => i).filter((i) => !occupied.has(i));
    if (available.length === 0) return;

    const holeIndex = available[Math.floor(Math.random() * available.length)];
    const hole = HOLES[holeIndex];
    this.totalSpawned++;

    // 15% chance of golden bonus rat (worth +2), 10% chance of poison rat (costs a miss if caught)
    const roll = Math.random();
    const isGolden = roll < 0.15;
    const isPoison = !isGolden && roll < 0.25;

    // Draw rat (sprite if available, otherwise graphics fallback)
    let gfx: Phaser.GameObjects.Graphics | Phaser.GameObjects.Sprite;
    if (this.textures.exists('rat')) {
      const ratSprite = this.add.sprite(hole.x, hole.y - 10, 'rat');
      ratSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      ratSprite.setScale(isGolden ? 1.2 : 1.0);
      if (isGolden) ratSprite.setTint(0xffd700);
      if (isPoison) ratSprite.setTint(0x66aa66);
      gfx = ratSprite;
    } else {
      const ratGfx = this.add.graphics();
      this.drawRat(ratGfx, hole.x, hole.y - 10);
      gfx = ratGfx;
    }

    // Hit zone
    const hitZone = this.add.zone(hole.x, hole.y - 10, HOLE_RADIUS * 2.5, HOLE_RADIUS * 2.5);
    hitZone.setInteractive({ useHandCursor: true });

    const rat: ActiveRat = {
      holeIndex,
      gfx,
      hitZone,
      caught: false,
      timer: this.time.delayedCall(0, () => {}), // placeholder
    };

    // Tap to catch
    hitZone.on('pointerdown', () => {
      if (rat.caught || this.finished) return;
      rat.caught = true;

      if (isPoison) {
        // Poison rat — costs a miss!
        this.missed++;
        this.missText.setText(`Missed: ${this.missed}/${this.maxMisses}`);
        playSfx('fail', 0.4);
        this.cameras.main.flash(100, 50, 80, 50);
        const warn = this.add.text(hole.x, hole.y - 30, 'Poison!', {
          fontFamily: 'Georgia, serif', fontSize: '12px', color: '#66aa66',
        }).setOrigin(0.5);
        this.tweens.add({ targets: warn, y: hole.y - 50, alpha: 0, duration: 600, onComplete: () => warn.destroy() });
        if (this.missed >= this.maxMisses) { gfx.destroy(); hitZone.destroy(); this.activeRats = this.activeRats.filter((r) => r !== rat); rat.timer.destroy(); this.failGame(); return; }
      } else {
        const points = isGolden ? 2 : 1;
        this.score += points;
        this.scoreText.setText(`Caught: ${this.score}`);
        // Throttle catch sound
        const now = Date.now();
        if (now - this.lastCatchSfx > 500) {
          playSfx(isGolden ? 'sparkle' : 'rat_caught', 0.4);
          this.lastCatchSfx = now;
        }
      }

      // Pop effect + particle burst
      gfx.destroy();
      if (this.textures.exists('particle_pixel')) {
        const burst = this.add.particles(hole.x, hole.y, 'particle_pixel', {
          speed: { min: 60, max: 160 },
          lifespan: { min: 250, max: 500 },
          scale: { start: 0.9, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: isGolden ? 0xffd700 : 0xcc7744,
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        });
        burst.explode(isGolden ? 20 : 12);
        this.time.delayedCall(600, () => burst.destroy());
      }
      const pointLabel = isGolden ? '+2!' : '+1';
      const pointColor = isGolden ? '#ffd700' : '#4a8a4a';
      const sparkle = this.add.text(hole.x, hole.y - 20, pointLabel, {
        fontFamily: 'Georgia, serif', fontSize: isGolden ? '20px' : '16px', color: pointColor,
      }).setOrigin(0.5);
      this.tweens.add({
        targets: sparkle, y: hole.y - 50, alpha: 0, duration: 600,
        onComplete: () => sparkle.destroy(),
      });

      rat.timer.destroy();
      hitZone.destroy();
      this.activeRats = this.activeRats.filter((r) => r !== rat);
    });

    // Rat disappears after a delay
    const visibleTime = this.difficulty === 'hard' ? 1200 : this.difficulty === 'medium' ? 1600 : 2000;
    rat.timer = this.time.delayedCall(visibleTime, () => {
      if (rat.caught || this.finished) return;
      this.missed++;
      this.missText.setText(`Missed: ${this.missed}/${this.maxMisses}`);

      gfx.destroy();
      hitZone.destroy();
      this.activeRats = this.activeRats.filter((r) => r !== rat);

      if (this.missed >= this.maxMisses) {
        this.failGame();
      }
    });

    // Pop-up animation
    gfx.setScale(0.3);
    this.tweens.add({ targets: gfx, scaleX: 1, scaleY: 1, duration: 150, ease: 'Back.easeOut' });

    this.activeRats.push(rat);
  }

  private drawRat(gfx: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // Body
    gfx.fillStyle(0x8a5a4a);
    gfx.fillEllipse(x, y, 18, 12);
    // Head
    gfx.fillCircle(x, y - 8, 6);
    // Eyes
    gfx.fillStyle(0xffffff);
    gfx.fillCircle(x - 2, y - 9, 2);
    gfx.fillCircle(x + 2, y - 9, 2);
    gfx.fillStyle(0x111111);
    gfx.fillCircle(x - 2, y - 9, 1);
    gfx.fillCircle(x + 2, y - 9, 1);
    // Ears
    gfx.fillStyle(0x9a6a5a);
    gfx.fillCircle(x - 5, y - 12, 3);
    gfx.fillCircle(x + 5, y - 12, 3);
    // Tail
    gfx.lineStyle(1.5, 0x7a4a3a, 0.8);
    gfx.beginPath();
    gfx.moveTo(x, y + 6);
    gfx.lineTo(x + 8, y + 12);
    gfx.lineTo(x + 14, y + 8);
    gfx.strokePath();
  }

  private endGame(): void {
    this.finished = true;
    this.cleanup();

    const stars = this.score >= 6 && this.missed <= 1 ? 3
      : this.score >= 4 && this.missed <= 2 ? 2 : 1;

    playSfx('victory');

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, `Hunt Complete!`, {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, `Caught ${this.score} rat${this.score !== 1 ? 's' : ''}`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `hunt_${this.difficulty}`,
        moves: this.totalSpawned,
        minMoves: Math.floor(this.totalSpawned * 0.7),
        stars,
        jobId: this.jobId,
        catId: this.catId,
      });
    });
  }

  private failGame(): void {
    this.finished = true;
    this.cleanup();

    playSfx('fail');

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'Too many escaped!', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#cc6666',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, `Caught ${this.score}, missed ${this.missed}`, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
    }).setOrigin(0.5);

    this.time.delayedCall(2000, () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });
  }

  private cleanup(): void {
    this.countdownTimer?.destroy();
    this.spawnTimer?.destroy();
    for (const rat of this.activeRats) {
      rat.timer.destroy();
      rat.gfx.destroy();
      rat.hitZone.destroy();
    }
    this.activeRats = [];
  }

}
