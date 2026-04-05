import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { createDpad, showMinigameTutorial } from '../ui/sceneHelpers';
import { isPaused } from '../systems/DayTimer';

// ── Arena layout ──
const ARENA_LEFT = 20;
const ARENA_TOP = 100;
const ARENA_W = GAME_WIDTH - 40;
const ARENA_H = 420;
const ARENA_RIGHT = ARENA_LEFT + ARENA_W;
const ARENA_BOTTOM = ARENA_TOP + ARENA_H;

// ── Cat stats (base values, modified by cat stats in init) ──
const CAT_SIZE = 16;
const BASE_SPEED = 2.5;
const BASE_ATTACK_RANGE = 52;
const BASE_ATTACK_ARC = Math.PI * 0.8; // 144 degree swing
const BASE_ATTACK_COOLDOWN = 400; // ms

// ── Rat stats ──
const RAT_SIZE = 10;

interface Rat {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  gfx: Phaser.GameObjects.Container;
  stunTimer: number;
  attackTimer: number;
}

export class BrawlScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';

  private catX = GAME_WIDTH / 2;
  private catY = ARENA_TOP + ARENA_H / 2;
  private catFacing = 0; // radians
  private catHp = 5;
  private catMaxHp = 5;
  private catSpeed = BASE_SPEED;
  private attackRange = BASE_ATTACK_RANGE;
  private attackArc = BASE_ATTACK_ARC;
  private attackCooldown = BASE_ATTACK_COOLDOWN;
  private catSprite!: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
  private hpBar!: Phaser.GameObjects.Graphics;
  private attackGfx!: Phaser.GameObjects.Graphics;
  private lastAttackTime = 0;
  private invincibleTimer = 0;

  private rats: Rat[] = [];
  private wave = 0;
  private totalWaves = 3;
  private ratsKilled = 0;
  private finished = false;
  private waveText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;

  // Input state
  private moveDir = { x: 0, y: 0 };
  private keys: Record<string, boolean> = {};
  private tutorialShowing = false;
  private gamePaused = false;
  private pauseOverlay: HTMLDivElement | null = null;
  private obstacles: { x: number; y: number; r: number }[] = [];
  private powerup: { x: number; y: number; type: string; gfx: Phaser.GameObjects.Text } | null = null;
  private powerupTimer = 0;

  constructor() {
    super({ key: 'BrawlScene' });
  }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.catBreed = data?.catBreed ?? 'wildcat';
    this.difficulty = data?.difficulty ?? 'easy';
    this.catX = GAME_WIDTH / 2;
    this.catY = ARENA_TOP + ARENA_H / 2;
    this.catFacing = 0;
    this.wave = 0;
    this.ratsKilled = 0;
    this.finished = false;
    this.rats = [];
    this.keys = {};
    this.moveDir = { x: 0, y: 0 };
    this.lastAttackTime = 0;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const hunting = cat?.stats?.hunting ?? 5;
    const endurance = cat?.stats?.endurance ?? 5;
    const stealth = cat?.stats?.stealth ?? 5;
    const senses = cat?.stats?.senses ?? 5;

    // Hunting → more HP
    const huntBonus = Math.min(3, hunting - 4);
    this.catMaxHp = (this.difficulty === 'hard' ? 3 : this.difficulty === 'medium' ? 4 : 5) + huntBonus;
    this.catHp = this.catMaxHp;
    // Endurance → faster movement (+10% per point above 5)
    this.catSpeed = BASE_SPEED * (1 + (endurance - 5) * 0.1);
    // Stealth → shorter attack cooldown (-20ms per point above 5)
    this.attackCooldown = Math.max(200, BASE_ATTACK_COOLDOWN - (stealth - 5) * 20);
    // Senses → larger attack range (+3px per point above 5)
    this.attackRange = BASE_ATTACK_RANGE + (senses - 5) * 3;
    this.attackArc = BASE_ATTACK_ARC;
    this.totalWaves = this.difficulty === 'hard' ? 4 : 3;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial
    if (showMinigameTutorial(this, 'clowder_brawl_tutorial', 'Fight!',
      `Rats are attacking! Fight them off.<br><br>
      <strong>Move</strong> with WASD, arrows, or the d-pad.<br><br>
      <strong>Attack</strong> by tapping the arena or pressing Space. You swipe in the direction you're facing.<br><br>
      Survive all waves to complete the job!`,
      () => { this.tutorialShowing = false; }
    )) {
      this.tutorialShowing = true;
    }

    // Job name
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, job?.name ?? 'Rat Fight', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    // HUD
    this.waveText = this.add.text(20, 55, '', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    });
    this.killText = this.add.text(GAME_WIDTH - 20, 55, 'Rats: 0', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#4a8a4a',
    }).setOrigin(1, 0);

    // HP bar
    this.hpBar = this.add.graphics();
    this.drawHpBar();

    // Arena background
    const arenaGfx = this.add.graphics();
    arenaGfx.fillStyle(0x2a2820, 1);
    arenaGfx.fillRoundedRect(ARENA_LEFT, ARENA_TOP, ARENA_W, ARENA_H, 6);
    arenaGfx.lineStyle(1, 0x3a3530);
    arenaGfx.strokeRoundedRect(ARENA_LEFT, ARENA_TOP, ARENA_W, ARENA_H, 6);

    // Floor detail
    arenaGfx.fillStyle(0x2e2c24, 0.5);
    for (let i = 0; i < 20; i++) {
      arenaGfx.fillCircle(
        ARENA_LEFT + 20 + Math.random() * (ARENA_W - 40),
        ARENA_TOP + 20 + Math.random() * (ARENA_H - 40),
        2 + Math.random() * 3
      );
    }

    // Terrain obstacles (barrels/crates) — 2-4 obstacles depending on difficulty
    this.obstacles = [];
    const obstacleCount = this.difficulty === 'hard' ? 4 : this.difficulty === 'medium' ? 3 : 2;
    for (let i = 0; i < obstacleCount; i++) {
      const ox = ARENA_LEFT + 40 + Math.random() * (ARENA_W - 80);
      const oy = ARENA_TOP + 40 + Math.random() * (ARENA_H - 80);
      // Don't place too close to center (player spawn)
      if (Math.abs(ox - GAME_WIDTH / 2) < 50 && Math.abs(oy - (ARENA_TOP + ARENA_H / 2)) < 50) continue;
      const or = 14;
      this.obstacles.push({ x: ox, y: oy, r: or });

      // Draw barrel — sprite if available, else procedural
      if (this.textures.exists('barrel_sprite')) {
        const barrelSprite = this.add.sprite(ox, oy, 'barrel_sprite');
        barrelSprite.setScale(0.9);
        barrelSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      } else {
        const obsGfx = this.add.graphics();
        obsGfx.fillStyle(0x4a3a28);
        obsGfx.fillCircle(ox, oy, or);
        obsGfx.lineStyle(1, 0x3a2a18);
        obsGfx.strokeCircle(ox, oy, or);
        obsGfx.lineStyle(1, 0x5a4a38, 0.5);
        obsGfx.strokeCircle(ox, oy, or - 3);
        obsGfx.strokeCircle(ox, oy, or - 7);
      }
    }

    // Attack slash graphics (drawn on top)
    this.attackGfx = this.add.graphics();

    // Cat sprite
    const idleKey = `${this.catBreed}_idle_south`;
    if (this.textures.exists(idleKey)) {
      this.catSprite = this.add.sprite(this.catX, this.catY, idleKey);
      (this.catSprite as Phaser.GameObjects.Sprite).setScale(0.9);
      (this.catSprite as Phaser.GameObjects.Sprite).texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    } else {
      this.catSprite = this.add.circle(this.catX, this.catY, CAT_SIZE, 0xc4956a);
    }

    // Keyboard
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown', (e: KeyboardEvent) => {
        this.keys[e.key] = true;
        if (e.key === ' ') this.attack();
        if (e.key === 'Escape') this.togglePause();
      });
      this.input.keyboard.on('keyup', (e: KeyboardEvent) => {
        this.keys[e.key] = false;
      });
    }

    // Pause button (top-right)
    const pauseBtn = this.add.text(GAME_WIDTH - 20, 30, '||', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#8b7355',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    pauseBtn.on('pointerdown', () => this.togglePause());

    // Tap to attack
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const wx = pointer.x / DPR;
      const wy = pointer.y / DPR;
      // Only attack taps inside arena
      if (wx >= ARENA_LEFT && wx <= ARENA_RIGHT && wy >= ARENA_TOP && wy <= ARENA_BOTTOM) {
        // Face toward tap point
        this.catFacing = Math.atan2(wy - this.catY, wx - this.catX);
        this.attack();
      }
    });

    // D-pad
    const dpadY = ARENA_BOTTOM + 60;
    createDpad(this, {
      x: GAME_WIDTH / 2, y: dpadY,
      onDirection: (dx, dy) => {
        this.moveDir = { x: dx, y: dy };
        if (dx !== 0 || dy !== 0) this.catFacing = Math.atan2(dy, dx);
      },
      holdRepeat: true, repeatInterval: 50,
    });

    // Attack button
    const atkBtn = this.add.rectangle(GAME_WIDTH - 55, dpadY, 60, 60, 0x5a2a20, 0.8);
    atkBtn.setStrokeStyle(2, 0xcc6666);
    atkBtn.setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH - 55, dpadY, '\u2694\uFE0F', { fontSize: '24px' }).setOrigin(0.5);
    atkBtn.on('pointerdown', () => this.attack());

    // Quit button
    const quitBtn = this.add.rectangle(45, dpadY, 60, 34, 0x2a2520);
    quitBtn.setStrokeStyle(1, 0x6b5b3e);
    quitBtn.setInteractive({ useHandCursor: true });
    this.add.text(45, dpadY, 'Quit', { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#c4956a' }).setOrigin(0.5);
    quitBtn.on('pointerdown', () => {
      this.finished = true;
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Start first wave
    this.time.delayedCall(500, () => this.spawnWave());

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'TownScene');
  }

  update(_time: number, delta: number): void {
    if (this.finished || this.tutorialShowing || this.gamePaused || isPaused()) return;
    const dt = delta / 1000;

    // Keyboard movement
    let kx = 0, ky = 0;
    if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) kx -= 1;
    if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) kx += 1;
    if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) ky -= 1;
    if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) ky += 1;

    const dx = kx || this.moveDir.x;
    const dy = ky || this.moveDir.y;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      const speed = this.catSpeed * 60 * dt;
      this.catX = Phaser.Math.Clamp(this.catX + (dx / len) * speed, ARENA_LEFT + CAT_SIZE, ARENA_RIGHT - CAT_SIZE);
      this.catY = Phaser.Math.Clamp(this.catY + (dy / len) * speed, ARENA_TOP + CAT_SIZE, ARENA_BOTTOM - CAT_SIZE);
      this.catFacing = Math.atan2(dy, dx);

      // Update idle sprite direction
      if (this.catSprite instanceof Phaser.GameObjects.Sprite) {
        const dir = this.facingToDir();
        const walkKey = `${this.catBreed}_walk_${dir}`;
        if (this.anims.exists(walkKey) && this.catSprite.anims.currentAnim?.key !== walkKey) {
          this.catSprite.play(walkKey);
        }
      }
    } else {
      // Idle
      if (this.catSprite instanceof Phaser.GameObjects.Sprite) {
        const dir = this.facingToDir();
        const idleKey = `${this.catBreed}_idle_${dir}`;
        if (this.textures.exists(idleKey) && (!this.catSprite.anims.isPlaying || this.catSprite.anims.currentAnim?.key.includes('walk'))) {
          this.catSprite.stop();
          this.catSprite.setTexture(idleKey);
        }
      }
    }

    // Obstacle collision for cat
    for (const obs of this.obstacles) {
      const odx = this.catX - obs.x;
      const ody = this.catY - obs.y;
      const od = Math.sqrt(odx * odx + ody * ody);
      if (od < obs.r + CAT_SIZE && od > 0) {
        this.catX = obs.x + (odx / od) * (obs.r + CAT_SIZE);
        this.catY = obs.y + (ody / od) * (obs.r + CAT_SIZE);
      }
    }

    this.catSprite.setPosition(this.catX, this.catY);

    // Check powerup pickup
    this.checkPowerupPickup();

    // Invincibility timer
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
      // Flash cat sprite during invincibility
      if (this.catSprite) this.catSprite.setAlpha(Math.sin(Date.now() * 0.02) > 0 ? 1 : 0.3);
    } else if (this.catSprite) {
      this.catSprite.setAlpha(1);
    }

    // Update rats
    for (const rat of this.rats) {
      if (rat.stunTimer > 0) {
        rat.stunTimer -= dt;
        continue;
      }

      // Move toward cat
      const rdx = this.catX - rat.x;
      const rdy = this.catY - rat.y;
      const rdist = Math.sqrt(rdx * rdx + rdy * rdy);

      if (rdist > RAT_SIZE + CAT_SIZE) {
        const rspeed = rat.speed * 60 * dt;
        rat.x += (rdx / rdist) * rspeed;
        rat.y += (rdy / rdist) * rspeed;
      }

      // Rat separation — push apart from other rats
      for (const other of this.rats) {
        if (other === rat) continue;
        const sx = rat.x - other.x;
        const sy = rat.y - other.y;
        const sd = Math.sqrt(sx * sx + sy * sy);
        if (sd < RAT_SIZE * 2.5 && sd > 0) {
          const push = 0.5;
          rat.x += (sx / sd) * push;
          rat.y += (sy / sd) * push;
        }
      }

      rat.x = Phaser.Math.Clamp(rat.x, ARENA_LEFT + RAT_SIZE, ARENA_RIGHT - RAT_SIZE);
      rat.y = Phaser.Math.Clamp(rat.y, ARENA_TOP + RAT_SIZE, ARENA_BOTTOM - RAT_SIZE);

      // Obstacle collision for rats
      for (const obs of this.obstacles) {
        const ox = rat.x - obs.x;
        const oy = rat.y - obs.y;
        const od = Math.sqrt(ox * ox + oy * oy);
        if (od < obs.r + RAT_SIZE && od > 0) {
          rat.x = obs.x + (ox / od) * (obs.r + RAT_SIZE);
          rat.y = obs.y + (oy / od) * (obs.r + RAT_SIZE);
        }
      }

      // Rat attacks cat on contact (respects invincibility)
      rat.attackTimer -= dt;
      if (rdist < RAT_SIZE + CAT_SIZE && rat.attackTimer <= 0 && this.invincibleTimer <= 0) {
        rat.attackTimer = 1.0;
        this.catHp--;
        this.invincibleTimer = 0.8; // brief invincibility after hit
        this.drawHpBar();
        this.cameras.main.flash(100, 80, 20, 20);
        playSfx('hiss', 0.4);

        if (this.catHp <= 0) {
          this.gameOver(false);
          return;
        }
      }

      rat.gfx.setPosition(rat.x, rat.y);
    }
  }

  private facingToDir(): string {
    const a = this.catFacing;
    if (a > -Math.PI / 4 && a <= Math.PI / 4) return 'east';
    if (a > Math.PI / 4 && a <= 3 * Math.PI / 4) return 'south';
    if (a > -3 * Math.PI / 4 && a <= -Math.PI / 4) return 'north';
    return 'west';
  }

  private togglePause(): void {
    if (this.finished) return;
    this.gamePaused = !this.gamePaused;
    if (this.gamePaused) {
      this.pauseOverlay = document.createElement('div');
      this.pauseOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
      this.pauseOverlay.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:28px;margin-bottom:12px">Paused</div>
        <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:12px">Tap to resume</div>
      `;
      this.pauseOverlay.addEventListener('click', () => this.togglePause());
      document.body.appendChild(this.pauseOverlay);
    } else {
      this.pauseOverlay?.remove();
      this.pauseOverlay = null;
    }
  }

  private attack(): void {
    if (this.finished) return;
    const now = Date.now();
    if (now - this.lastAttackTime < this.attackCooldown) return;
    this.lastAttackTime = now;

    playSfx('tap', 0.4);

    // Draw attack slash — filled arc wedge
    this.attackGfx.clear();
    const slashStart = this.catFacing - this.attackArc / 2;
    const slashEnd = this.catFacing + this.attackArc / 2;
    this.attackGfx.fillStyle(0xdda055, 0.25);
    this.attackGfx.beginPath();
    this.attackGfx.moveTo(this.catX, this.catY);
    this.attackGfx.arc(this.catX, this.catY, this.attackRange, slashStart, slashEnd, false);
    this.attackGfx.closePath();
    this.attackGfx.fillPath();
    this.attackGfx.lineStyle(2, 0xdda055, 0.7);
    this.attackGfx.beginPath();
    this.attackGfx.arc(this.catX, this.catY, this.attackRange, slashStart, slashEnd, false);
    this.attackGfx.strokePath();

    // Claw swipe marks — 3 parallel scratch lines
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * 5;
      const innerR = this.attackRange * 0.4 + offset;
      const outerR = this.attackRange * 0.9 + offset;
      const angle = this.catFacing + (i - 1) * 0.12;
      this.attackGfx.lineStyle(2, 0xeecc88, 0.6);
      this.attackGfx.beginPath();
      this.attackGfx.moveTo(
        this.catX + Math.cos(angle) * innerR,
        this.catY + Math.sin(angle) * innerR
      );
      this.attackGfx.lineTo(
        this.catX + Math.cos(angle) * outerR,
        this.catY + Math.sin(angle) * outerR
      );
      this.attackGfx.strokePath();
    }

    this.time.delayedCall(150, () => this.attackGfx.clear());

    // Check hits
    const toRemove: Rat[] = [];
    for (const rat of this.rats) {
      const dx = rat.x - this.catX;
      const dy = rat.y - this.catY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this.attackRange) continue;

      // Check angle
      let angle = Math.atan2(dy, dx);
      let diff = angle - this.catFacing;
      // Normalize to [-PI, PI]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;

      if (Math.abs(diff) <= this.attackArc / 2) {
        rat.hp--;
        rat.stunTimer = 0.3;

        // Knockback
        if (dist > 0) {
          rat.x += (dx / dist) * 15;
          rat.y += (dy / dist) * 15;
          rat.x = Phaser.Math.Clamp(rat.x, ARENA_LEFT + RAT_SIZE, ARENA_RIGHT - RAT_SIZE);
          rat.y = Phaser.Math.Clamp(rat.y, ARENA_TOP + RAT_SIZE, ARENA_BOTTOM - RAT_SIZE);
        }

        if (rat.hp <= 0) {
          toRemove.push(rat);
        } else {
          // Hit feedback — flash, shake, and damage number
          rat.gfx.setAlpha(0.3);
          const origX = rat.gfx.x;
          this.tweens.add({
            targets: rat.gfx, x: origX + 4, duration: 40, yoyo: true, repeat: 2,
            onComplete: () => { if (rat.gfx.active) { rat.gfx.setAlpha(1); rat.gfx.x = origX; } },
          });
          // Show remaining HP
          const dmgText = this.add.text(rat.x, rat.y - 16, `${rat.hp}/${rat.maxHp}`, {
            fontFamily: 'Georgia, serif', fontSize: '10px', color: '#cc6666',
          }).setOrigin(0.5);
          this.tweens.add({ targets: dmgText, y: rat.y - 30, alpha: 0, duration: 600, onComplete: () => dmgText.destroy() });
        }
      }
    }

    for (const rat of toRemove) {
      this.ratsKilled++;
      this.killText.setText(`Rats: ${this.ratsKilled}`);
      playSfx('rat_caught', 0.5);

      // Death effect
      const sparkle = this.add.text(rat.x, rat.y - 10, '+1', {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#4a8a4a',
      }).setOrigin(0.5);
      this.tweens.add({ targets: sparkle, y: rat.y - 40, alpha: 0, duration: 500, onComplete: () => sparkle.destroy() });

      rat.gfx.destroy();
      this.rats = this.rats.filter((r) => r !== rat);
    }

    // Check wave clear
    if (this.rats.length === 0 && !this.finished) {
      if (this.wave >= this.totalWaves) {
        this.gameOver(true);
      } else {
        // Recover 1 HP between waves
        if (this.catHp < this.catMaxHp) {
          this.catHp = Math.min(this.catMaxHp, this.catHp + 1);
          this.drawHpBar();
        }
        const cleared = this.add.text(GAME_WIDTH / 2, ARENA_TOP + ARENA_H / 2, 'Wave Cleared!', {
          fontFamily: 'Georgia, serif', fontSize: '22px', color: '#4a8a4a',
        }).setOrigin(0.5).setAlpha(0);
        this.tweens.add({ targets: cleared, alpha: 1, duration: 300, yoyo: true, hold: 700, onComplete: () => cleared.destroy() });
        // Spawn a powerup between waves
        this.spawnPowerup();
        this.time.delayedCall(1500, () => {
          if (!this.finished) this.spawnWave();
        });
      }
    }
  }

  private spawnWave(): void {
    this.wave++;
    this.waveText.setText(`Wave ${this.wave}/${this.totalWaves}`);

    const baseCount = this.difficulty === 'hard' ? 5 : this.difficulty === 'medium' ? 4 : 3;
    const count = baseCount + this.wave - 1;
    // Wave 1 rats are always 1 HP (one-hit kills). Later waves get tougher.
    const ratHp = this.wave === 1 ? 1 : (this.difficulty === 'hard' ? 3 : this.difficulty === 'medium' ? 2 : 1);
    const ratSpeed = (this.difficulty === 'hard' ? 1.2 : this.difficulty === 'medium' ? 1.0 : 0.8) + this.wave * 0.1;

    for (let i = 0; i < count; i++) {
      // Spawn from edges
      const edge = Math.floor(Math.random() * 4);
      let rx: number, ry: number;
      switch (edge) {
        case 0: rx = ARENA_LEFT + 15; ry = ARENA_TOP + 15 + Math.random() * (ARENA_H - 30); break;
        case 1: rx = ARENA_RIGHT - 15; ry = ARENA_TOP + 15 + Math.random() * (ARENA_H - 30); break;
        case 2: rx = ARENA_LEFT + 15 + Math.random() * (ARENA_W - 30); ry = ARENA_TOP + 15; break;
        default: rx = ARENA_LEFT + 15 + Math.random() * (ARENA_W - 30); ry = ARENA_BOTTOM - 15; break;
      }

      const container = this.add.container(rx, ry);

      // Rat body — use sprite if available
      if (this.textures.exists('rat')) {
        const ratSprite = this.add.sprite(0, 0, 'rat');
        ratSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        ratSprite.setScale(0.8);
        container.add(ratSprite);
      } else {
        const body = this.add.circle(0, 0, RAT_SIZE, 0x8a5a4a);
        container.add(body);
        const eye1 = this.add.circle(-3, -3, 2, 0xffffff);
        const eye2 = this.add.circle(3, -3, 2, 0xffffff);
        const pupil1 = this.add.circle(-3, -3, 1, 0x111111);
        const pupil2 = this.add.circle(3, -3, 1, 0x111111);
        container.add([eye1, eye2, pupil1, pupil2]);
      }

      // HP indicator for tougher rats
      if (ratHp > 1) {
        const hpDot = this.add.circle(0, -RAT_SIZE - 4, 2, 0xcc4444);
        container.add(hpDot);
      }

      this.rats.push({
        x: rx, y: ry,
        hp: ratHp, maxHp: ratHp,
        speed: ratSpeed,
        gfx: container,
        stunTimer: 0.5, // brief spawn grace
        attackTimer: 1.0,
      });
    }

    // Wave announce
    const announce = this.add.text(GAME_WIDTH / 2, ARENA_TOP + ARENA_H / 2, `Wave ${this.wave}!`, {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#cc6666',
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: announce, alpha: 1, duration: 300, yoyo: true, hold: 500, onComplete: () => announce.destroy() });
  }

  private drawHpBar(): void {
    this.hpBar.clear();
    const barW = 120;
    const barH = 10;
    const barX = GAME_WIDTH / 2 - barW / 2;
    const barY = 75;

    // Background
    this.hpBar.fillStyle(0x333333);
    this.hpBar.fillRect(barX, barY, barW, barH);

    // Fill
    const pct = Math.max(0, this.catHp / this.catMaxHp);
    const color = pct > 0.5 ? 0x4a8a4a : pct > 0.25 ? 0xaa8a22 : 0xaa4444;
    this.hpBar.fillStyle(color);
    this.hpBar.fillRect(barX, barY, barW * pct, barH);

    // Border
    this.hpBar.lineStyle(1, 0x6b5b3e);
    this.hpBar.strokeRect(barX, barY, barW, barH);

    // Label
    this.hpBar.fillStyle(0xc4956a);
  }

  private spawnPowerup(): void {
    // Remove old powerup
    this.powerup?.gfx.destroy();
    this.powerup = null;

    const types = [
      { type: 'fishbone', icon: '\uD83D\uDC1F', label: 'Fish Bone — bigger swipe!' },
      { type: 'catnip', icon: '\uD83C\uDF3F', label: 'Catnip — speed boost!' },
      { type: 'yarn', icon: '\uD83E\uDDF6', label: 'Yarn Ball — stun all rats!' },
    ];
    const pick = types[Math.floor(Math.random() * types.length)];

    const px = ARENA_LEFT + 40 + Math.random() * (ARENA_W - 80);
    const py = ARENA_TOP + 40 + Math.random() * (ARENA_H - 80);

    const gfx = this.add.text(px, py, pick.icon, { fontSize: '24px' }).setOrigin(0.5);
    this.tweens.add({ targets: gfx, y: py - 4, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.powerup = { x: px, y: py, type: pick.type, gfx };
  }

  private checkPowerupPickup(): void {
    if (!this.powerup) return;
    const dx = this.catX - this.powerup.x;
    const dy = this.catY - this.powerup.y;
    if (Math.sqrt(dx * dx + dy * dy) > CAT_SIZE + 12) return;

    const type = this.powerup.type;
    this.powerup.gfx.destroy();
    this.powerup = null;
    playSfx('sparkle', 0.5);

    const label = this.add.text(GAME_WIDTH / 2, ARENA_TOP + 20,
      type === 'fishbone' ? 'Fish Bone! Bigger swipe!' : type === 'catnip' ? 'Catnip! Speed boost!' : 'Yarn Ball! Rats stunned!',
      { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#dda055' }
    ).setOrigin(0.5);
    this.time.delayedCall(1500, () => label.destroy());

    if (type === 'fishbone') {
      const origRange = this.attackRange;
      this.attackRange *= 1.5;
      this.time.delayedCall(8000, () => { this.attackRange = origRange; });
    } else if (type === 'catnip') {
      const origSpeed = this.catSpeed;
      this.catSpeed *= 1.6;
      this.time.delayedCall(6000, () => { this.catSpeed = origSpeed; });
    } else if (type === 'yarn') {
      for (const rat of this.rats) {
        rat.stunTimer = 3.0;
      }
    }
  }

  private gameOver(won: boolean): void {
    this.finished = true;

    if (won) {
      playSfx('victory');
      const stars = this.catHp === this.catMaxHp ? 3 : this.catHp >= this.catMaxHp / 2 ? 2 : 1;

      this.add.text(GAME_WIDTH / 2, ARENA_TOP + ARENA_H / 2 - 10, 'Victory!', {
        fontFamily: 'Georgia, serif', fontSize: '28px', color: '#c4956a',
      }).setOrigin(0.5);

      this.add.text(GAME_WIDTH / 2, ARENA_TOP + ARENA_H / 2 + 25, `${this.ratsKilled} rats defeated`, {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
      }).setOrigin(0.5);

      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `brawl_${this.difficulty}`,
          moves: this.ratsKilled,
          minMoves: this.ratsKilled,
          stars,
          jobId: this.jobId,
          catId: this.catId,
        });
      });
    } else {
      playSfx('fail');

      this.add.text(GAME_WIDTH / 2, ARENA_TOP + ARENA_H / 2 - 10, 'Overwhelmed!', {
        fontFamily: 'Georgia, serif', fontSize: '24px', color: '#cc6666',
      }).setOrigin(0.5);

      this.add.text(GAME_WIDTH / 2, ARENA_TOP + ARENA_H / 2 + 20, `${this.ratsKilled} rats defeated before falling`, {
        fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
      }).setOrigin(0.5);

      this.time.delayedCall(2000, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
