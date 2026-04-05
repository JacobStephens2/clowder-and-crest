import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';

// ── Arena layout ──
const ARENA_LEFT = 20;
const ARENA_TOP = 100;
const ARENA_W = GAME_WIDTH - 40;
const ARENA_H = 420;
const ARENA_RIGHT = ARENA_LEFT + ARENA_W;
const ARENA_BOTTOM = ARENA_TOP + ARENA_H;

// ── Cat stats ──
const CAT_SPEED = 2.5;
const CAT_SIZE = 16;
const ATTACK_RANGE = 40;
const ATTACK_ARC = Math.PI * 0.6; // 108 degree swing
const ATTACK_COOLDOWN = 400; // ms

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
  private catSprite!: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
  private hpBar!: Phaser.GameObjects.Graphics;
  private attackGfx!: Phaser.GameObjects.Graphics;
  private lastAttackTime = 0;

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
    const huntBonus = Math.min(3, ((cat?.stats?.hunting ?? 5) - 4));
    this.catMaxHp = (this.difficulty === 'hard' ? 3 : this.difficulty === 'medium' ? 4 : 5) + huntBonus;
    this.catHp = this.catMaxHp;
    this.totalWaves = this.difficulty === 'hard' ? 4 : 3;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial
    if (!localStorage.getItem('clowder_brawl_tutorial')) {
      localStorage.setItem('clowder_brawl_tutorial', '1');
      this.tutorialShowing = true;
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
      t.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:12px">Fight!</div>
        <div style="color:#8b7355;font-family:Georgia,serif;font-size:14px;text-align:center;max-width:300px;line-height:1.6">
          Rats are attacking! Fight them off.<br><br>
          <strong>Move</strong> with WASD, arrows, or the d-pad.<br><br>
          <strong>Attack</strong> by tapping the arena or pressing Space. You swipe in the direction you're facing.<br><br>
          Survive all waves to complete the job!
        </div>
        <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:12px;margin-top:20px">Tap to start</div>
      `;
      t.addEventListener('click', () => { t.remove(); this.tutorialShowing = false; });
      document.body.appendChild(t);
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
      });
      this.input.keyboard.on('keyup', (e: KeyboardEvent) => {
        this.keys[e.key] = false;
      });
    }

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
    const dpadX = GAME_WIDTH / 2;
    const dpadSize = 40;
    const dpadGap = 4;

    let holdTimer: Phaser.Time.TimerEvent | null = null;
    const setMoveDir = (dx: number, dy: number) => {
      this.moveDir = { x: dx, y: dy };
      if (dx !== 0 || dy !== 0) this.catFacing = Math.atan2(dy, dx);
    };

    const makeArrow = (x: number, y: number, dx: number, dy: number, label: string) => {
      const btn = this.add.rectangle(x, y, dpadSize, dpadSize, 0x2a2520, 0.8);
      btn.setStrokeStyle(1, 0x6b5b3e);
      btn.setInteractive({ useHandCursor: true });
      this.add.text(x, y, label, { fontSize: '18px', color: '#c4956a' }).setOrigin(0.5);
      btn.on('pointerdown', () => {
        setMoveDir(dx, dy);
        holdTimer?.destroy();
        holdTimer = this.time.addEvent({ delay: 50, callback: () => setMoveDir(dx, dy), loop: true });
      });
      btn.on('pointerup', () => { this.moveDir = { x: 0, y: 0 }; holdTimer?.destroy(); });
      btn.on('pointerout', () => { this.moveDir = { x: 0, y: 0 }; holdTimer?.destroy(); });
    };

    makeArrow(dpadX, dpadY - dpadSize - dpadGap, 0, -1, '\u25B2');
    makeArrow(dpadX, dpadY + dpadSize + dpadGap, 0, 1, '\u25BC');
    makeArrow(dpadX - dpadSize - dpadGap, dpadY, -1, 0, '\u25C0');
    makeArrow(dpadX + dpadSize + dpadGap, dpadY, 1, 0, '\u25B6');

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
      eventBus.emit('navigate', 'TownScene');
    });

    // Start first wave
    this.time.delayedCall(500, () => this.spawnWave());

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'TownScene');
  }

  update(_time: number, delta: number): void {
    if (this.finished || this.tutorialShowing) return;
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
      const speed = CAT_SPEED * 60 * dt;
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

    this.catSprite.setPosition(this.catX, this.catY);

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
        rat.x = Phaser.Math.Clamp(rat.x, ARENA_LEFT + RAT_SIZE, ARENA_RIGHT - RAT_SIZE);
        rat.y = Phaser.Math.Clamp(rat.y, ARENA_TOP + RAT_SIZE, ARENA_BOTTOM - RAT_SIZE);
      }

      // Rat attacks cat on contact
      rat.attackTimer -= dt;
      if (rdist < RAT_SIZE + CAT_SIZE && rat.attackTimer <= 0) {
        rat.attackTimer = 1.0; // 1 second between bites
        this.catHp--;
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

  private attack(): void {
    if (this.finished) return;
    const now = Date.now();
    if (now - this.lastAttackTime < ATTACK_COOLDOWN) return;
    this.lastAttackTime = now;

    playSfx('tap', 0.4);

    // Draw attack slash
    this.attackGfx.clear();
    this.attackGfx.lineStyle(3, 0xdda055, 0.8);
    this.attackGfx.beginPath();
    const slashStart = this.catFacing - ATTACK_ARC / 2;
    const slashEnd = this.catFacing + ATTACK_ARC / 2;
    this.attackGfx.arc(this.catX, this.catY, ATTACK_RANGE, slashStart, slashEnd, false);
    this.attackGfx.strokePath();
    this.time.delayedCall(150, () => this.attackGfx.clear());

    // Check hits
    const toRemove: Rat[] = [];
    for (const rat of this.rats) {
      const dx = rat.x - this.catX;
      const dy = rat.y - this.catY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > ATTACK_RANGE) continue;

      // Check angle
      let angle = Math.atan2(dy, dx);
      let diff = angle - this.catFacing;
      // Normalize to [-PI, PI]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;

      if (Math.abs(diff) <= ATTACK_ARC / 2) {
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
          // Flash red
          const body = rat.gfx.getAt(0) as Phaser.GameObjects.Arc;
          body.setFillStyle(0xcc4444);
          this.time.delayedCall(150, () => body.setFillStyle(0x8a5a4a));
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
        this.time.delayedCall(1000, () => {
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
    const ratHp = this.difficulty === 'hard' ? 3 : this.difficulty === 'medium' ? 2 : 1;
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

      // Rat body
      const body = this.add.circle(0, 0, RAT_SIZE, 0x8a5a4a);
      container.add(body);

      // Eyes
      const eye1 = this.add.circle(-3, -3, 2, 0xffffff);
      const eye2 = this.add.circle(3, -3, 2, 0xffffff);
      const pupil1 = this.add.circle(-3, -3, 1, 0x111111);
      const pupil2 = this.add.circle(3, -3, 1, 0x111111);
      container.add([eye1, eye2, pupil1, pupil2]);

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
        eventBus.emit('navigate', 'TownScene');
      });
    }
  }
}
