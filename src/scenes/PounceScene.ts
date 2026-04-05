import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { showMinigameTutorial } from '../ui/sceneHelpers';

// Layout
const GROUND_Y = 650;
const LAUNCH_X = 60;
const LAUNCH_Y = GROUND_Y - 30;
const TARGET_X_MIN = 200;
const TARGET_X_MAX = 340;

export class PounceScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';
  private launches = 0;
  private maxLaunches = 5;
  private ratsKnocked = 0;
  private totalRats = 0;
  private finished = false;
  private tutorialShowing = false;
  private projectile: Phaser.Physics.Matter.Sprite | null = null;
  private canLaunch = true;
  private aimLine: Phaser.GameObjects.Graphics | null = null;
  private launchText!: Phaser.GameObjects.Text;
  private ratBodies: MatterJS.BodyType[] = [];

  constructor() {
    super({
      key: 'PounceScene',
      physics: {
        default: 'matter',
        matter: { gravity: { x: 0, y: 1 }, debug: false },
      },
    });
  }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.catBreed = data?.catBreed ?? 'wildcat';
    this.difficulty = data?.difficulty ?? 'easy';
    this.launches = 0;
    this.ratsKnocked = 0;
    this.finished = false;
    this.canLaunch = true;
    this.ratBodies = [];
    this.maxLaunches = this.difficulty === 'hard' ? 3 : this.difficulty === 'medium' ? 4 : 5;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    // Hunting stat adds trajectory preview
    const hunting = cat?.stats?.hunting ?? 5;
    if (hunting >= 6) this.maxLaunches++;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    if (showMinigameTutorial(this, 'clowder_pounce_tutorial', 'Pounce!',
      `Drag to aim, release to launch!<br><br>
      Knock all the <strong style="color:#cc6666">rats</strong> off their perch.<br><br>
      Fewer launches = more stars!`,
      () => { this.tutorialShowing = false; }
    )) {
      this.tutorialShowing = true;
    }

    // Job name
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Pounce'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    // HUD
    this.launchText = this.add.text(20, 55, `Shots: ${this.launches}/${this.maxLaunches}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    });

    // Ground
    const ground = this.matter.add.rectangle(GAME_WIDTH / 2, GROUND_Y + 20, GAME_WIDTH, 40, { isStatic: true });

    // Visual ground
    this.add.rectangle(GAME_WIDTH / 2, GROUND_Y + 20, GAME_WIDTH, 40, 0x2a2520);

    // Left wall (so projectiles don't fly off-screen left)
    this.matter.add.rectangle(-10, GAME_HEIGHT / 2, 20, GAME_HEIGHT, { isStatic: true });
    // Right wall
    this.matter.add.rectangle(GAME_WIDTH + 10, GAME_HEIGHT / 2, 20, GAME_HEIGHT, { isStatic: true });

    // Build target structure
    this.buildTarget();

    // Aim line
    this.aimLine = this.add.graphics();

    // Launch cat sprite at launch position
    this.spawnProjectile();

    // Drag to aim
    let dragStart: { x: number; y: number } | null = null;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.canLaunch || this.finished || this.tutorialShowing) return;
      dragStart = { x: pointer.x / DPR, y: pointer.y / DPR };
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!dragStart || !this.aimLine || !this.canLaunch) return;
      const wx = pointer.x / DPR;
      const wy = pointer.y / DPR;
      this.aimLine.clear();
      this.aimLine.lineStyle(2, 0xdda055, 0.5);
      this.aimLine.lineBetween(LAUNCH_X, LAUNCH_Y, LAUNCH_X + (dragStart.x - wx) * 0.5, LAUNCH_Y + (dragStart.y - wy) * 0.5);
      // Dotted trajectory preview
      const dx = (dragStart.x - wx) * 3;
      const dy = (dragStart.y - wy) * 3;
      this.aimLine.fillStyle(0xdda055, 0.3);
      for (let t = 0; t < 5; t++) {
        const px = LAUNCH_X + dx * t * 0.06;
        const py = LAUNCH_Y + dy * t * 0.06 + 0.5 * 1 * (t * 0.06) * (t * 0.06) * 200;
        this.aimLine.fillCircle(px, py, 2);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!dragStart || !this.canLaunch || this.finished || this.tutorialShowing) return;
      const wx = pointer.x / DPR;
      const wy = pointer.y / DPR;
      const dx = (dragStart.x - wx) * 3;
      const dy = (dragStart.y - wy) * 3;
      dragStart = null;
      this.aimLine?.clear();

      if (Math.sqrt(dx * dx + dy * dy) < 20) return; // too small

      this.launchProjectile(dx, dy);
    });

    // Quit
    this.add.text(GAME_WIDTH - 30, 55, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Check for fallen rats periodically
    this.time.addEvent({
      delay: 500,
      callback: () => this.checkFallenRats(),
      loop: true,
    });

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
      // Clean up Matter.js physics bodies
      const bodies = this.matter.world.getAllBodies();
      for (const body of bodies) {
        this.matter.world.remove(body);
      }
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  private buildTarget(): void {
    const ratCount = this.difficulty === 'hard' ? 5 : this.difficulty === 'medium' ? 4 : 3;
    this.totalRats = ratCount;

    // Stack crates/barrels
    const stackX = TARGET_X_MIN + Math.random() * (TARGET_X_MAX - TARGET_X_MIN);
    const crateSize = 24;

    // Bottom row: 3 crates
    for (let i = 0; i < 3; i++) {
      const cx = stackX - crateSize + i * crateSize;
      const cy = GROUND_Y - crateSize / 2;
      const crate = this.matter.add.rectangle(cx, cy, crateSize - 2, crateSize - 2, {
        restitution: 0.2, friction: 0.8, density: 0.005,
      });
      // Visual
      this.add.rectangle(cx, cy, crateSize - 2, crateSize - 2, 0x4a3a28).setStrokeStyle(1, 0x3a2a18);
    }

    // Second row: 2 crates
    for (let i = 0; i < 2; i++) {
      const cx = stackX - crateSize / 2 + i * crateSize;
      const cy = GROUND_Y - crateSize * 1.5;
      this.matter.add.rectangle(cx, cy, crateSize - 2, crateSize - 2, {
        restitution: 0.2, friction: 0.8, density: 0.004,
      });
      this.add.rectangle(cx, cy, crateSize - 2, crateSize - 2, 0x4a3a28).setStrokeStyle(1, 0x3a2a18);
    }

    // Top crate
    const topCrate = this.matter.add.rectangle(stackX, GROUND_Y - crateSize * 2.5, crateSize - 2, crateSize - 2, {
      restitution: 0.2, friction: 0.8, density: 0.003,
    });
    this.add.rectangle(stackX, GROUND_Y - crateSize * 2.5, crateSize - 2, crateSize - 2, 0x4a3a28).setStrokeStyle(1, 0x3a2a18);

    // Place rats on top of the structure
    for (let i = 0; i < ratCount; i++) {
      const rx = stackX - 20 + (i / (ratCount - 1 || 1)) * 40;
      const ry = GROUND_Y - crateSize * 3 - 8;
      const ratBody = this.matter.add.circle(rx, ry, 8, {
        restitution: 0.3, friction: 0.5, density: 0.002,
        label: 'rat',
      });
      this.ratBodies.push(ratBody);

      // Rat visual
      if (this.textures.exists('rat')) {
        const ratSprite = this.add.sprite(rx, ry, 'rat');
        ratSprite.setScale(0.6);
        ratSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        // Sync sprite to physics body
        this.time.addEvent({
          delay: 16, loop: true,
          callback: () => {
            if (ratBody.position) {
              ratSprite.setPosition(ratBody.position.x, ratBody.position.y);
              ratSprite.setRotation(ratBody.angle);
            }
          },
        });
      }
    }
  }

  private spawnProjectile(): void {
    // Visual cat at launch position
    const idleKey = `${this.catBreed}_idle_east`;
    if (this.textures.exists(idleKey)) {
      const catVis = this.add.sprite(LAUNCH_X, LAUNCH_Y - 10, idleKey);
      catVis.setScale(0.7);
      catVis.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Launch indicator
    this.add.circle(LAUNCH_X, LAUNCH_Y, 6, 0xdda055, 0.4);
  }

  private launchProjectile(vx: number, vy: number): void {
    this.canLaunch = false;
    this.launches++;
    this.launchText.setText(`Shots: ${this.launches}/${this.maxLaunches}`);

    playSfx('tap', 0.5);

    // Create physics projectile
    const proj = this.matter.add.circle(LAUNCH_X, LAUNCH_Y, 8, {
      restitution: 0.4, friction: 0.3, density: 0.01,
    });
    this.matter.body.setVelocity(proj, { x: vx * 0.015, y: vy * 0.015 });

    // Visual for projectile
    const projVis = this.add.circle(LAUNCH_X, LAUNCH_Y, 8, 0xc4956a);
    this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        if (proj.position) {
          projVis.setPosition(proj.position.x, proj.position.y);
        }
      },
    });

    // Wait for physics to settle, then check result
    this.time.delayedCall(2500, () => {
      this.checkFallenRats();

      if (this.ratsKnocked >= this.totalRats) {
        this.winGame();
      } else if (this.launches >= this.maxLaunches) {
        this.loseGame();
      } else {
        this.canLaunch = true;
      }
    });
  }

  private checkFallenRats(): void {
    let knocked = 0;
    for (const rat of this.ratBodies) {
      if (rat.position && rat.position.y > GROUND_Y - 5) {
        knocked++;
      }
    }
    this.ratsKnocked = knocked;
  }

  private winGame(): void {
    if (this.finished) return;
    this.finished = true;
    playSfx('victory');

    const stars = this.launches <= 1 ? 3 : this.launches <= 2 ? 2 : 1;

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'All Rats Cleared!', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `pounce_${this.difficulty}`,
        moves: this.launches,
        minMoves: 1,
        stars,
        jobId: this.jobId,
        catId: this.catId,
      });
    });
  }

  private loseGame(): void {
    if (this.finished) return;
    this.finished = true;
    playSfx('fail');

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'Out of shots!', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });
  }
}
