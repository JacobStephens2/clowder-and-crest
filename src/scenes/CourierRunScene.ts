import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { showMinigameTutorial } from '../ui/sceneHelpers';

const LANE_Y = [280, 400, 520]; // 3 lanes
const LANE_COUNT = 3;
const SCROLL_SPEED_BASE = 2.5;

interface Obstacle {
  x: number;
  lane: number;
  width: number;
  gfx: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  active: boolean;
}

interface Collectible {
  x: number;
  lane: number;
  gfx: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
  collected: boolean;
}

export class CourierRunScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';
  private currentLane = 1; // middle
  private catSprite: Phaser.GameObjects.Sprite | null = null;
  private obstacles: Obstacle[] = [];
  private collectibles: Collectible[] = [];
  private lives = 3;
  private distance = 0;
  private targetDistance = 800;
  private scrollSpeed = SCROLL_SPEED_BASE;
  private fishCollected = 0;
  private finished = false;
  private tutorialShowing = false;
  private livesText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private spawnTimer = 0;

  constructor() { super({ key: 'CourierRunScene' }); }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.catBreed = data?.catBreed ?? 'wildcat';
    this.difficulty = data?.difficulty ?? 'easy';
    this.currentLane = 1;
    this.obstacles = [];
    this.collectibles = [];
    this.distance = 0;
    this.fishCollected = 0;
    this.finished = false;
    this.spawnTimer = 0;
    this.lives = this.difficulty === 'hard' ? 2 : this.difficulty === 'medium' ? 2 : 3;
    this.scrollSpeed = this.difficulty === 'hard' ? 3.5 : this.difficulty === 'medium' ? 3.0 : 2.5;
    this.targetDistance = this.difficulty === 'hard' ? 1200 : this.difficulty === 'medium' ? 1000 : 800;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    if ((cat?.stats?.endurance ?? 5) >= 7) this.lives++;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    if (showMinigameTutorial(this, 'clowder_courier_tutorial', 'Courier Run',
      `Sprint through the alleys to deliver the package!<br><br>
      <strong>Swipe up/down</strong> or use buttons to change lanes.<br><br>
      Avoid obstacles. Collect fish for bonus rewards!`,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Courier Run'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.livesText = this.add.text(20, 55, `Lives: ${this.lives}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cc6666',
    });
    this.distText = this.add.text(GAME_WIDTH - 20, 55, '0%', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#4a8a4a',
    }).setOrigin(1, 0);

    this.add.text(GAME_WIDTH - 30, 75, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Draw lanes
    const gfx = this.add.graphics();
    for (let i = 0; i < LANE_COUNT; i++) {
      gfx.fillStyle(i % 2 === 0 ? 0x2a2520 : 0x262220);
      gfx.fillRect(0, LANE_Y[i] - 40, GAME_WIDTH, 80);
      gfx.lineStyle(1, 0x3a3530, 0.3);
      gfx.lineBetween(0, LANE_Y[i] - 40, GAME_WIDTH, LANE_Y[i] - 40);
    }

    // Cat sprite
    const idleKey = `${this.catBreed}_idle_east`;
    if (this.textures.exists(idleKey)) {
      this.catSprite = this.add.sprite(60, LANE_Y[this.currentLane], idleKey);
      this.catSprite.setScale(0.9);
      this.catSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.catSprite.setDepth(10);
      // Play walk animation
      const walkKey = `${this.catBreed}_walk_east`;
      if (this.anims.exists(walkKey)) this.catSprite.play(walkKey);
    }

    // Lane change buttons
    const btnUp = this.add.text(30, 200, '\u25B2', {
      fontSize: '28px', color: '#c4956a', backgroundColor: '#2a2520',
      padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btnUp.on('pointerdown', () => this.changeLane(-1));

    const btnDown = this.add.text(30, LANE_Y[2] + 60, '\u25BC', {
      fontSize: '28px', color: '#c4956a', backgroundColor: '#2a2520',
      padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btnDown.on('pointerdown', () => this.changeLane(1));

    // Swipe detection
    let swipeStartY = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { swipeStartY = p.y / DPR; });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const dy = p.y / DPR - swipeStartY;
      if (Math.abs(dy) > 30) this.changeLane(dy > 0 ? 1 : -1);
    });

    // Keyboard
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.changeLane(-1);
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.changeLane(1);
    });

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  update(_time: number, delta: number): void {
    if (this.finished || this.tutorialShowing) return;
    const dt = delta / 1000;

    this.distance += this.scrollSpeed * dt * 60;
    const pct = Math.min(100, Math.floor((this.distance / this.targetDistance) * 100));
    this.distText.setText(`${pct}%`);

    // Spawn obstacles
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = (this.difficulty === 'hard' ? 0.6 : this.difficulty === 'medium' ? 0.8 : 1.0) + Math.random() * 0.5;
      this.spawnObstacle();
      // Occasionally spawn fish
      if (Math.random() < 0.3) this.spawnFish();
    }

    // Move obstacles
    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      obs.x -= this.scrollSpeed * dt * 60;
      obs.gfx.setPosition(obs.x, LANE_Y[obs.lane]);
      if (obs.x < -50) { obs.active = false; obs.gfx.destroy(); }

      // Collision with cat
      if (obs.active && obs.lane === this.currentLane && Math.abs(obs.x - 60) < 25) {
        obs.active = false;
        obs.gfx.destroy();
        this.lives--;
        this.livesText.setText(`Lives: ${this.lives}`);
        playSfx('hiss', 0.4);
        this.cameras.main.flash(100, 80, 30, 30);
        if (this.lives <= 0) { this.endGame(false); return; }
      }
    }

    // Move collectibles
    for (const col of this.collectibles) {
      if (col.collected) continue;
      col.x -= this.scrollSpeed * dt * 60;
      col.gfx.setPosition(col.x, LANE_Y[col.lane]);
      if (col.x < -30) { col.collected = true; col.gfx.destroy(); }

      // Collect
      if (!col.collected && col.lane === this.currentLane && Math.abs(col.x - 60) < 25) {
        col.collected = true;
        col.gfx.destroy();
        this.fishCollected++;
        playSfx('sparkle', 0.3);
      }
    }

    // Win condition
    if (this.distance >= this.targetDistance) {
      this.endGame(true);
    }
  }

  private changeLane(dir: number): void {
    if (this.finished) return;
    const newLane = Phaser.Math.Clamp(this.currentLane + dir, 0, LANE_COUNT - 1);
    if (newLane === this.currentLane) return;
    this.currentLane = newLane;

    if (this.catSprite) {
      this.tweens.add({
        targets: this.catSprite, y: LANE_Y[this.currentLane],
        duration: 120, ease: 'Sine.easeOut',
      });
    }
  }

  private spawnObstacle(): void {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const x = GAME_WIDTH + 30;
    const obs = this.add.rectangle(x, LANE_Y[lane], 30, 30, 0x4a3a28);
    obs.setStrokeStyle(1, 0x3a2a18);
    this.obstacles.push({ x, lane, width: 30, gfx: obs, active: true });
  }

  private spawnFish(): void {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const x = GAME_WIDTH + 60;
    let gfx: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
    if (this.textures.exists('fish_sprite')) {
      const fish = this.add.sprite(x, LANE_Y[lane], 'fish_sprite');
      fish.setScale(0.4);
      fish.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      gfx = fish;
    } else {
      gfx = this.add.circle(x, LANE_Y[lane], 6, 0xdda055);
    }
    this.collectibles.push({ x, lane, gfx, collected: false });
  }

  private endGame(won: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (won) {
      playSfx('victory');
      const stars = this.lives >= 3 ? 3 : this.lives >= 2 ? 2 : 1;
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Delivered!', {
        fontFamily: 'Georgia, serif', fontSize: '28px', color: '#c4956a',
      }).setOrigin(0.5);
      if (this.fishCollected > 0) {
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, `+${this.fishCollected} bonus fish`, {
          fontFamily: 'Georgia, serif', fontSize: '14px', color: '#dda055',
        }).setOrigin(0.5);
      }
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `courier_run_${this.difficulty}`,
          moves: Math.floor(this.distance), minMoves: this.targetDistance, stars,
          jobId: this.jobId, catId: this.catId, bonusFish: this.fishCollected,
        });
      });
    } else {
      playSfx('fail');
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Package lost!', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
