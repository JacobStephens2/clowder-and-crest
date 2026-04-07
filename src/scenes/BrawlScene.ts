import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { createDpad, showMinigameTutorial, showSceneOutcomeBanner } from '../ui/sceneHelpers';

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

// Rat archetype — each type has distinct movement, windup, and attack
// behavior. Per the doc's "use wave structure to teach rat types one at a
// time": grunts wave 1, skirmishers introduced wave 2, boss on the final wave.
type RatType = 'grunt' | 'skirmisher' | 'boss';

interface Rat {
  type: RatType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  baseSpeed: number;
  gfx: Phaser.GameObjects.Container;
  stunTimer: number;
  attackTimer: number;
  /** Counts down while the rat is winding up an attack. > 0 means the rat
      is locked in its telegraph and won't move. Damage applies at 0 if the
      cat is still in range. The doc's #1 implication: every rat needs a
      readable wind-up so failure feels earned, not random. */
  windupTimer: number;
  /** Total duration of the current windup (for visual ratio). */
  windupDuration: number;
  /** When > 0, the rat is in its lunge state (skirmishers only). The lunge
      moves in a straight line at high speed and damages on contact. */
  lungeTimer: number;
  lungeDx: number;
  lungeDy: number;
  /** Boss phase tracking. Phase 2 triggers at 50% HP. */
  bossPhase: 1 | 2;
  /** Holds the white-flash overlay so we can fade it during the windup
      without re-creating GameObjects every frame. */
  flashGfx: Phaser.GameObjects.Graphics | null;
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
  /** Hit-stop: timestamp until which scene update should be frozen.
      Brief 60-80ms freeze on kills makes attacks feel "heavy" — the doc's
      explicit recommendation for game-feel juice. */
  private hitStopUntil = 0;
  /** True between wave-foreshadow alert and actual spawn. Used by tests
      and to keep the alert text from double-firing. */
  private waveAnnouncing = false;

  // Input state
  private moveDir = { x: 0, y: 0 };
  private keys: Record<string, boolean> = {};
  private tutorialShowing = false;
  private gamePaused = false;
  private pauseOverlay: HTMLDivElement | null = null;
  private obstacles: { x: number; y: number; r: number }[] = [];
  private powerup: { x: number; y: number; type: string; gfx: Phaser.GameObjects.Text } | null = null;
  private joyConfig: { x: number; y: number; radius: number; knob: Phaser.GameObjects.Arc; pointerId: number } | null = null;
  private atkBtnBounds: { x: number; y: number; size: number } | null = null;
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

    // Enable multi-touch (joystick + attack simultaneously)
    this.input.addPointer(1);

    // Tutorial — bumped to v2 when telegraphs + skirmishers were added so
    // returning players see the new rules.
    if (showMinigameTutorial(this, 'clowder_brawl_tutorial_v2', 'Fight!',
      `Rats are attacking! Fight them off.<br><br>
      <strong>Move</strong> with WASD, arrows, or the d-pad.<br><br>
      <strong>Attack</strong> by tapping the arena or pressing Space.<br><br>
      Rats <strong style="color:#ffaa44">flash white</strong> before they strike — walk away to dodge entirely.<br><br>
      Watch for <strong style="color:#ff5555">red skirmishers</strong> in later waves: they lunge!`,
      () => { this.tutorialShowing = false; }
    )) {
      this.tutorialShowing = true;
    }

    // Job name
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, (`${job?.name ?? 'Rat Fight'} (${this.difficulty})`), {
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

    // Tap handling — manual hit-testing for multi-touch reliability
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const wx = pointer.worldX;
      const wy = pointer.worldY;

      // Check attack button first
      if (this.atkBtnBounds) {
        const ab = this.atkBtnBounds;
        if (Math.abs(wx - ab.x) < ab.size / 2 && Math.abs(wy - ab.y) < ab.size / 2) {
          this.attack();
          return;
        }
      }

      // Check joystick area
      if (this.joyConfig) {
        const jc = this.joyConfig;
        if (Math.sqrt((wx - jc.x) ** 2 + (wy - jc.y) ** 2) < jc.radius * 1.5) {
          this.joyConfig.pointerId = pointer.id;
          return;
        }
      }

      // Arena taps — face toward tap and attack
      if (wx >= ARENA_LEFT && wx <= ARENA_RIGHT && wy >= ARENA_TOP && wy <= ARENA_BOTTOM) {
        this.catFacing = Math.atan2(wy - this.catY, wx - this.catX);
        this.attack();
      }
    });

    // Virtual joystick for movement
    const joyY = ARENA_BOTTOM + 60;
    const joyX = GAME_WIDTH / 2 - 50;
    const joyRadius = 36;
    const joyBase = this.add.circle(joyX, joyY, joyRadius, 0x2a2520, 0.6);
    joyBase.setStrokeStyle(1, 0x6b5b3e);
    const joyKnob = this.add.circle(joyX, joyY, 14, 0x6b5b3e, 0.8);
    joyBase.setInteractive({ draggable: false, useHandCursor: true });

    // Joystick + attack — poll-based for multi-touch reliability
    // Store refs for polling in update()
    this.joyConfig = { x: joyX, y: joyY, radius: joyRadius, knob: joyKnob, pointerId: -1 };

    // Attack button (visual only — hit detection in global pointerdown)
    const atkBtnX = GAME_WIDTH - 55;
    this.add.rectangle(atkBtnX, joyY, 60, 60, 0x5a2a20, 0.8).setStrokeStyle(2, 0xcc6666);
    this.add.text(atkBtnX, joyY, '\u2694\uFE0F', { fontSize: '24px' }).setOrigin(0.5);
    this.atkBtnBounds = { x: atkBtnX, y: joyY, size: 60 };

    // Quit button
    const quitBtn = this.add.rectangle(45, joyY, 60, 34, 0x2a2520);
    quitBtn.setStrokeStyle(1, 0x6b5b3e);
    quitBtn.setInteractive({ useHandCursor: true });
    this.add.text(45, joyY, 'Quit', { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#c4956a' }).setOrigin(0.5);
    quitBtn.on('pointerdown', () => {
      this.finished = true;
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Pause button
    const pauseBtn = this.add.text(GAME_WIDTH - 20, 30, '||', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#8b7355',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    pauseBtn.on('pointerdown', () => this.togglePause());

    // Start first wave
    this.time.delayedCall(500, () => this.spawnWave());

    // Clean up on scene stop (prevent timer/tween memory leaks)
    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.input.keyboard?.removeAllListeners();
      this.pauseOverlay?.remove();
    });
    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  update(_time: number, delta: number): void {
    if (this.finished || this.tutorialShowing || this.gamePaused) return;
    // Hit-stop: freeze the world for ~60ms on a kill so the impact has weight
    if (Date.now() < this.hitStopUntil) return;
    const dt = delta / 1000;

    // Poll joystick — check the tracked pointer's current position each frame.
    // Uses canonical Phaser multi-touch pattern: addPointer() + read pointer1/pointer2
    // directly in update() (see phaserjs/examples multitouch/two touch inputs.js).
    if (this.joyConfig && this.joyConfig.pointerId >= 0) {
      const jc = this.joyConfig;
      const pointers = [this.input.pointer1, this.input.pointer2];
      let found = false;
      for (const p of pointers) {
        if (p && p.id === jc.pointerId) {
          if (p.isDown) {
            const pdx = p.worldX - jc.x;
            const pdy = p.worldY - jc.y;
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
            const clampDist = Math.min(pdist, jc.radius);
            if (pdist > 5) {
              jc.knob.setPosition(jc.x + (pdx / pdist) * clampDist, jc.y + (pdy / pdist) * clampDist);
              this.moveDir = { x: pdx / pdist, y: pdy / pdist };
              this.catFacing = Math.atan2(pdy, pdx);
            } else {
              jc.knob.setPosition(jc.x, jc.y);
              this.moveDir = { x: 0, y: 0 };
            }
            found = true;
          }
          break;
        }
      }
      if (!found) {
        // Pointer released
        jc.pointerId = -1;
        jc.knob.setPosition(jc.x, jc.y);
        this.moveDir = { x: 0, y: 0 };
      }
    }

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
      // Apply acceleration-style movement for smoother feel
      const targetX = Phaser.Math.Clamp(this.catX + (dx / len) * speed, ARENA_LEFT + CAT_SIZE, ARENA_RIGHT - CAT_SIZE);
      const targetY = Phaser.Math.Clamp(this.catY + (dy / len) * speed, ARENA_TOP + CAT_SIZE, ARENA_BOTTOM - CAT_SIZE);
      // Lerp toward target for smoothing (0.7 = responsive but smooth)
      this.catX = Phaser.Math.Linear(this.catX, targetX, 0.7);
      this.catY = Phaser.Math.Linear(this.catY, targetY, 0.7);
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

    // Smooth sprite position with lerp
    this.catSprite.x = Phaser.Math.Linear(this.catSprite.x, this.catX, 0.5);
    this.catSprite.y = Phaser.Math.Linear(this.catSprite.y, this.catY, 0.5);

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
        rat.gfx.setPosition(rat.x, rat.y);
        continue;
      }

      const rdx = this.catX - rat.x;
      const rdy = this.catY - rat.y;
      const rdist = Math.sqrt(rdx * rdx + rdy * rdy);

      // ── Lunge state (skirmishers): launched in a fixed direction ──
      if (rat.lungeTimer > 0) {
        rat.lungeTimer -= dt;
        const lspeed = rat.baseSpeed * 4 * 60 * dt;
        rat.x += rat.lungeDx * lspeed;
        rat.y += rat.lungeDy * lspeed;
        rat.x = Phaser.Math.Clamp(rat.x, ARENA_LEFT + RAT_SIZE, ARENA_RIGHT - RAT_SIZE);
        rat.y = Phaser.Math.Clamp(rat.y, ARENA_TOP + RAT_SIZE, ARENA_BOTTOM - RAT_SIZE);
        // Damage on lunge contact (respects i-frames)
        const lhitDist = Math.sqrt((this.catX - rat.x) ** 2 + (this.catY - rat.y) ** 2);
        if (lhitDist < RAT_SIZE + CAT_SIZE && this.invincibleTimer <= 0) {
          this.applyHitToCat();
          rat.lungeTimer = 0;
          rat.stunTimer = 0.6; // recovery
          if (this.catHp <= 0) { this.gameOver(false); return; }
        }
        rat.gfx.setPosition(rat.x, rat.y);
        continue;
      }

      // ── Windup state: rat is committed to an attack, frozen in place ──
      // The doc's #1 implication: every rat needs a readable wind-up so the
      // player can react. Damage applies at windupTimer ≤ 0 if the cat is
      // still in range; otherwise the windup whiffs and the rat resets.
      if (rat.windupTimer > 0) {
        rat.windupTimer -= dt;
        // Live the visual flash — increase intensity as windup nears completion
        this.drawWindupFlash(rat);
        if (rat.windupTimer <= 0) {
          // Windup elapsed: resolve the attack
          this.resolveRatAttack(rat);
          if (this.catHp <= 0) { this.gameOver(false); return; }
        }
        rat.gfx.setPosition(rat.x, rat.y);
        continue;
      }

      // ── Walk toward cat ──
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

      // ── Trigger windup when in attack range (and cooldown elapsed) ──
      rat.attackTimer -= dt;
      const attackRange = rat.type === 'skirmisher' ? RAT_SIZE + CAT_SIZE + 18 : RAT_SIZE + CAT_SIZE + 2;
      if (rdist < attackRange && rat.attackTimer <= 0) {
        this.startRatWindup(rat);
      }

      rat.gfx.setPosition(rat.x, rat.y);
    }

    // Boss phase transition — check after rat updates so the boss reference
    // is still valid. At 50% HP, the Rat King enters phase 2.
    for (const rat of this.rats) {
      if (rat.type === 'boss' && rat.bossPhase === 1 && rat.hp <= rat.maxHp / 2) {
        this.triggerBossPhase2(rat);
      }
    }
  }

  /** Begin a rat's attack telegraph. Sets the windup timer and flashes the
      sprite. The rat is locked in place during this window — the player can
      walk away to dodge entirely. */
  private startRatWindup(rat: Rat): void {
    // Windup duration scales with rat type. Skirmishers are slower to commit
    // (the lunge is dangerous so they get a bigger tell); grunts are quicker;
    // boss tells are the longest in phase 1, shorter in phase 2.
    let dur: number;
    if (rat.type === 'boss') dur = rat.bossPhase === 1 ? 0.85 : 0.55;
    else if (rat.type === 'skirmisher') dur = 0.75;
    else dur = 0.55;
    rat.windupTimer = dur;
    rat.windupDuration = dur;
    rat.attackTimer = 1.2; // cooldown after the next attack resolves
  }

  /** Draw the white-flash overlay during a rat's windup. Intensity ramps up
      as the windup approaches completion so the player gets a smooth visual
      "almost" before the strike lands. */
  private drawWindupFlash(rat: Rat): void {
    if (!rat.flashGfx) {
      rat.flashGfx = this.add.graphics();
      rat.gfx.add(rat.flashGfx);
    }
    rat.flashGfx.clear();
    const ratio = 1 - (rat.windupTimer / Math.max(0.001, rat.windupDuration));
    const alpha = 0.25 + 0.55 * ratio;
    const radius = rat.type === 'boss' ? 24 : RAT_SIZE + 4;
    // Skirmishers flash red (lunge tell), grunts/boss flash white
    const color = rat.type === 'skirmisher' ? 0xff5555 : 0xffffff;
    rat.flashGfx.fillStyle(color, alpha * 0.5);
    rat.flashGfx.fillCircle(0, 0, radius);
    rat.flashGfx.lineStyle(2, color, alpha);
    rat.flashGfx.strokeCircle(0, 0, radius);
  }

  private clearWindupFlash(rat: Rat): void {
    rat.flashGfx?.destroy();
    rat.flashGfx = null;
  }

  /** Resolve a rat attack at the end of its windup. Behavior depends on
      type — grunts deal direct contact damage; skirmishers launch into a
      lunge in the cat's last-known direction. */
  private resolveRatAttack(rat: Rat): void {
    this.clearWindupFlash(rat);
    if (rat.type === 'skirmisher') {
      // Lunge in the direction of the cat at the moment the windup elapsed
      const dx = this.catX - rat.x;
      const dy = this.catY - rat.y;
      const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      rat.lungeDx = dx / len;
      rat.lungeDy = dy / len;
      rat.lungeTimer = 0.35;
      return;
    }
    // Grunt / boss — contact damage IF the cat is still in range
    const dist = Math.sqrt((this.catX - rat.x) ** 2 + (this.catY - rat.y) ** 2);
    const range = rat.type === 'boss' ? RAT_SIZE + CAT_SIZE + 6 : RAT_SIZE + CAT_SIZE + 2;
    if (dist < range && this.invincibleTimer <= 0) {
      this.applyHitToCat(rat.type === 'boss' ? 2 : 1);
    }
  }

  /** Damage the cat. Centralized so juice (flash, shake, sound) and
      bookkeeping (i-frames, HP bar) live in one place. */
  private applyHitToCat(amount = 1): void {
    this.catHp -= amount;
    this.invincibleTimer = 0.8;
    this.drawHpBar();
    this.cameras.main.flash(100, 80, 20, 20);
    this.cameras.main.shake(120, 0.008);
    playSfx('hiss', 0.4);
    haptic.warning();
  }

  /** Trigger boss phase 2 at 50% HP. Per "boss fights need an emotional
      midpoint": flash, scream, accelerate, shorten windups, spawn 2 minions.
      The fight stops being a chunky rat and becomes a real test. */
  private triggerBossPhase2(rat: Rat): void {
    rat.bossPhase = 2;
    rat.speed = rat.baseSpeed * 1.6;
    rat.windupTimer = 0; // interrupt any pending windup
    this.clearWindupFlash(rat);
    this.cameras.main.flash(300, 200, 40, 40);
    this.cameras.main.shake(220, 0.012);
    playSfx('hiss', 0.7);
    playSfx('rat_caught', 0.4);
    haptic.heavy();
    // Visual: brief "ENRAGED" tag above the boss
    const tag = this.add.text(rat.x, rat.y - 36, 'ENRAGED', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#ff5555',
    }).setOrigin(0.5);
    this.tweens.add({ targets: tag, y: rat.y - 56, alpha: 0, duration: 1200, onComplete: () => tag.destroy() });
    // Spawn 2 grunt minions at random arena edges
    this.spawnRat('grunt', 1, rat.baseSpeed);
    this.spawnRat('grunt', 1, rat.baseSpeed);
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

        // Impact particle burst — red on hit, gold on kill
        if (this.textures.exists('particle_pixel')) {
          const burst = this.add.particles(rat.x, rat.y, 'particle_pixel', {
            speed: { min: 50, max: 140 },
            lifespan: { min: 200, max: 450 },
            scale: { start: 0.7, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: rat.hp <= 0 ? 0xdda055 : 0xcc4444,
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          });
          burst.explode(rat.hp <= 0 ? 16 : 8);
          this.time.delayedCall(550, () => burst.destroy());
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
      // Pair the hit-stop with a medium tap so the freeze frame has a tactile body.
      haptic.medium();

      // Hit-stop — brief 60ms freeze on kill so the impact has weight.
      // The doc's juice pillar: "this is what makes attacks feel heavy".
      this.hitStopUntil = Date.now() + 60;

      // Death effect
      const sparkle = this.add.text(rat.x, rat.y - 10, '+1', {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#4a8a4a',
      }).setOrigin(0.5);
      this.tweens.add({ targets: sparkle, y: rat.y - 40, alpha: 0, duration: 500, onComplete: () => sparkle.destroy() });

      this.clearWindupFlash(rat);
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

  /** Foreshadow + spawn the next wave. The doc's "encounter design" pillar
      explicitly calls for "audio, visual, or environmental cues so the player
      has one turn to prepare". We show an alert ~1s before the rats appear. */
  private spawnWave(): void {
    if (this.waveAnnouncing || this.finished) return;
    this.waveAnnouncing = true;
    this.wave++;
    this.waveText.setText(`Wave ${this.wave}/${this.totalWaves}`);

    // ── Wave foreshadowing ──
    const incoming = this.add.text(GAME_WIDTH / 2, ARENA_TOP + ARENA_H / 2, `Wave ${this.wave} incoming!`, {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#ffaa44',
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: incoming, alpha: 1, duration: 250, yoyo: true, hold: 600, onComplete: () => incoming.destroy() });
    playSfx('tap', 0.3);
    // Brief border pulse — environmental cue that something is coming
    this.cameras.main.flash(150, 200, 100, 30, false);

    // Schedule the actual spawn after the alert
    this.time.delayedCall(1100, () => {
      this.waveAnnouncing = false;
      if (this.finished) return;
      this.actuallySpawnWave();
    });
  }

  /** The real spawn logic. Composition is the doc's "wave structure to teach
      rat types one at a time" pillar:
      - Wave 1: only Grunts (the player learns the basic windup→attack loop)
      - Wave 2+: introduces Skirmishers in the mix (red flash, lunge attack)
      - Final wave: spawns the boss + a small grunt entourage
   */
  private actuallySpawnWave(): void {
    const baseCount = this.difficulty === 'hard' ? 5 : this.difficulty === 'medium' ? 4 : 3;
    const count = baseCount + this.wave - 1;
    const ratHp = this.wave === 1 ? 1 : (this.difficulty === 'hard' ? 3 : this.difficulty === 'medium' ? 2 : 1);
    const ratSpeed = (this.difficulty === 'hard' ? 1.2 : this.difficulty === 'medium' ? 1.0 : 0.8) + this.wave * 0.1;

    if (this.wave === this.totalWaves) {
      this.spawnBoss();
      // Boss waves get a smaller entourage so the boss is the focus
      const entourage = Math.max(1, Math.floor(count / 2));
      for (let i = 0; i < entourage; i++) {
        const type: RatType = (i % 2 === 0 || this.wave < 2) ? 'grunt' : 'skirmisher';
        this.spawnRat(type, ratHp, ratSpeed);
      }
      return;
    }

    for (let i = 0; i < count; i++) {
      // Wave 2+ introduces skirmishers — about 1/3 of the spawns
      const type: RatType = (this.wave >= 2 && i % 3 === 0) ? 'skirmisher' : 'grunt';
      const hp = type === 'skirmisher' ? 1 : ratHp; // skirmishers always die in 1 hit
      const sp = type === 'skirmisher' ? ratSpeed * 0.85 : ratSpeed;
      this.spawnRat(type, hp, sp);
    }
  }

  /** Spawn a single rat of the given type at a random arena edge. */
  private spawnRat(type: RatType, hp: number, speed: number): void {
    const edge = Math.floor(Math.random() * 4);
    let rx: number, ry: number;
    switch (edge) {
      case 0: rx = ARENA_LEFT + 15; ry = ARENA_TOP + 15 + Math.random() * (ARENA_H - 30); break;
      case 1: rx = ARENA_RIGHT - 15; ry = ARENA_TOP + 15 + Math.random() * (ARENA_H - 30); break;
      case 2: rx = ARENA_LEFT + 15 + Math.random() * (ARENA_W - 30); ry = ARENA_TOP + 15; break;
      default: rx = ARENA_LEFT + 15 + Math.random() * (ARENA_W - 30); ry = ARENA_BOTTOM - 15; break;
    }

    const container = this.add.container(rx, ry);

    // Rat body — use sprite if available, tinted differently per type
    if (this.textures.exists('rat')) {
      const ratSprite = this.add.sprite(0, 0, 'rat');
      ratSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      ratSprite.setScale(type === 'skirmisher' ? 0.7 : 0.8);
      // Skirmishers wear a red tint so the player can spot them at a glance —
      // the same visual identity as the lunge windup flash.
      if (type === 'skirmisher') ratSprite.setTint(0xff8888);
      container.add(ratSprite);
    } else {
      const bodyColor = type === 'skirmisher' ? 0xb04a4a : 0x8a5a4a;
      const body = this.add.circle(0, 0, RAT_SIZE, bodyColor);
      container.add(body);
      const eye1 = this.add.circle(-3, -3, 2, 0xffffff);
      const eye2 = this.add.circle(3, -3, 2, 0xffffff);
      const pupil1 = this.add.circle(-3, -3, 1, 0x111111);
      const pupil2 = this.add.circle(3, -3, 1, 0x111111);
      container.add([eye1, eye2, pupil1, pupil2]);
    }

    if (hp > 1) {
      const hpDot = this.add.circle(0, -RAT_SIZE - 4, 2, 0xcc4444);
      container.add(hpDot);
    }

    this.rats.push({
      type,
      x: rx, y: ry,
      hp, maxHp: hp,
      speed, baseSpeed: speed,
      gfx: container,
      stunTimer: 0.5,
      attackTimer: 1.0,
      windupTimer: 0,
      windupDuration: 0,
      lungeTimer: 0,
      lungeDx: 0, lungeDy: 0,
      bossPhase: 1,
      flashGfx: null,
    });
  }

  /** Spawn the Rat King boss. Lives at the top of the arena, has its own
      windup tells, and transitions to phase 2 at 50% HP. */
  private spawnBoss(): void {
    const bossHp = this.difficulty === 'hard' ? 8 : this.difficulty === 'medium' ? 6 : 4;
    const bossSpeed = (this.difficulty === 'hard' ? 1.2 : this.difficulty === 'medium' ? 1.0 : 0.8) * 0.6;
    const bossX = GAME_WIDTH / 2;
    const bossY = ARENA_TOP + 30;
    const bossContainer = this.add.container(bossX, bossY);

    if (this.textures.exists('rat')) {
      const bossSprite = this.add.sprite(0, 0, 'rat');
      bossSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      bossSprite.setScale(1.6);
      bossContainer.add(bossSprite);
    } else {
      const bossBody = this.add.circle(0, 0, 18, 0x6a3a2a);
      bossContainer.add(bossBody);
    }
    const crown = this.add.text(0, -22, '\u{1F451}', { fontSize: '14px' }).setOrigin(0.5);
    bossContainer.add(crown);
    const bossLabel = this.add.text(0, 20, 'RAT KING', {
      fontFamily: 'Georgia, serif', fontSize: '8px', color: '#cc6666',
    }).setOrigin(0.5);
    bossContainer.add(bossLabel);

    this.rats.push({
      type: 'boss',
      x: bossX, y: bossY,
      hp: bossHp, maxHp: bossHp,
      speed: bossSpeed, baseSpeed: bossSpeed,
      gfx: bossContainer,
      stunTimer: 1.0,
      attackTimer: 0.7,
      windupTimer: 0,
      windupDuration: 0,
      lungeTimer: 0,
      lungeDx: 0, lungeDy: 0,
      bossPhase: 1,
      flashGfx: null,
    });
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
    haptic.success();

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
      haptic.success();
      const stars = this.catHp === this.catMaxHp ? 3 : this.catHp >= this.catMaxHp / 2 ? 2 : 1;

      showSceneOutcomeBanner(this, {
        title: 'Victory!',
        subtitle: `${this.ratsKilled} rats defeated`,
        y: ARENA_TOP + ARENA_H / 2,
      });

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
      haptic.error();

      showSceneOutcomeBanner(this, {
        title: 'Overwhelmed!',
        subtitle: `${this.ratsKilled} rats defeated before falling`,
        titleColor: '#cc6666',
        y: ARENA_TOP + ARENA_H / 2,
      });

      this.time.delayedCall(2000, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
