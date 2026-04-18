import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { isPracticeRun } from '../systems/PracticeMode';
import { showMinigameTutorial, attachStandardCleanup } from '../ui/sceneHelpers';

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

// ── Obstacle phrases ──
// Per "structured randomness" pillar: pre-built short obstacle sequences
// instead of pure per-frame random lane picks. Each phrase is a small set
// of items spawned together as a coherent challenge — single, wall,
// alternating, fish-with-block, etc. The player learns to recognize the
// shapes even though phrase ORDER is randomized.
//
// dx is the horizontal offset (in pixels) past the spawn anchor.
// kind 'obstacle' is dangerous, 'fish' is collectible.
type PhraseItem = { dx: number; lane: number; kind: 'obstacle' | 'fish' };
type Phrase = { name: string; items: PhraseItem[] };

const PHRASES: Phrase[] = [
  // 1 obstacle on its own — easy gap, the warm-up phrase
  { name: 'single-top',    items: [{ dx: 0, lane: 0, kind: 'obstacle' }] },
  { name: 'single-mid',    items: [{ dx: 0, lane: 1, kind: 'obstacle' }] },
  { name: 'single-bot',    items: [{ dx: 0, lane: 2, kind: 'obstacle' }] },
  // 1 obstacle + 1 fish in a different lane — rewards correct lane choice
  { name: 'fish-then-block', items: [
    { dx: 0,   lane: 0, kind: 'fish' },
    { dx: 90,  lane: 0, kind: 'obstacle' },
    { dx: 90,  lane: 1, kind: 'fish' },
  ]},
  // wall: 2 obstacles in adjacent lanes, single gap
  { name: 'wall-top',  items: [
    { dx: 0, lane: 0, kind: 'obstacle' },
    { dx: 0, lane: 1, kind: 'obstacle' },
  ]},
  { name: 'wall-bot',  items: [
    { dx: 0, lane: 1, kind: 'obstacle' },
    { dx: 0, lane: 2, kind: 'obstacle' },
  ]},
  // zigzag — 3 obstacles staggered across all lanes, forces lane changes
  { name: 'zigzag', items: [
    { dx: 0,    lane: 0, kind: 'obstacle' },
    { dx: 110,  lane: 2, kind: 'obstacle' },
    { dx: 220,  lane: 1, kind: 'obstacle' },
  ]},
  // fish trail in one lane — pure reward, no obstacles
  { name: 'fish-trail-mid', items: [
    { dx: 0,   lane: 1, kind: 'fish' },
    { dx: 70,  lane: 1, kind: 'fish' },
    { dx: 140, lane: 1, kind: 'fish' },
  ]},
  // bait-and-switch — fish in a lane that gets blocked further along
  { name: 'bait', items: [
    { dx: 0,   lane: 2, kind: 'fish' },
    { dx: 130, lane: 2, kind: 'obstacle' },
    { dx: 130, lane: 0, kind: 'fish' },
  ]},
];

// ── Missions ──
// Per the doc's retention table: missions add a secondary goal layered over
// survival, extending session length and giving each run a sense of purpose.
// Each run picks ONE mission and tracks progress live in the HUD.
interface Mission {
  id: string;
  /** Short prompt shown on the HUD */
  description: string;
  /** Bonus fish awarded on completion */
  reward: number;
  /** Returns true once the mission is complete this run */
  isComplete: (s: CourierRunScene) => boolean;
  /** Returns a fraction in [0,1] for the HUD progress bar */
  progress: (s: CourierRunScene) => number;
}

const MISSIONS: Mission[] = [
  {
    id: 'collect-5-fish',
    description: 'Collect 5 fish',
    reward: 3,
    isComplete: (s) => s.fishCollected >= 5,
    progress: (s) => Math.min(1, s.fishCollected / 5),
  },
  {
    id: 'no-damage',
    description: 'Deliver without losing a life',
    reward: 4,
    isComplete: (s) => s.distance >= s.targetDistance && s.lives === s.startingLives,
    progress: (s) => s.lives === s.startingLives ? Math.min(1, s.distance / s.targetDistance) : 0,
  },
  {
    id: 'lane-changes',
    description: 'Change lanes at least 8 times',
    reward: 2,
    isComplete: (s) => s.laneChangeCount >= 8,
    progress: (s) => Math.min(1, s.laneChangeCount / 8),
  },
  {
    id: 'collect-3-pre-halfway',
    description: 'Collect 3 fish before the halfway point',
    reward: 3,
    isComplete: (s) => s.fishCollectedPreHalf >= 3,
    progress: (s) => Math.min(1, s.fishCollectedPreHalf / 3),
  },
];

export class CourierRunScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';
  private currentLane = 1; // middle
  private catSprite: Phaser.GameObjects.Sprite | null = null;
  private obstacles: Obstacle[] = [];
  private collectibles: Collectible[] = [];
  // Lives — public so missions can read them
  lives = 3;
  startingLives = 3;
  // Distance — public so missions can read it
  distance = 0;
  targetDistance = 800;
  /** Base scroll speed at distance=0. The actual speed RAMPS over the run
      via getCurrentSpeed() — the doc's #1 most important pillar. */
  private baseScrollSpeed = SCROLL_SPEED_BASE;
  /** Maximum multiplier on baseScrollSpeed at the very end of the run. */
  private readonly MAX_SPEED_MULT = 1.7;
  // Mission tracking — public so MISSIONS table can read them
  fishCollected = 0;
  fishCollectedPreHalf = 0;
  laneChangeCount = 0;
  private fishSpawned = 0;
  private phraseCount = 0;
  private finished = false;
  private tutorialShowing = false;
  private livesText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private missionText!: Phaser.GameObjects.Text;
  private missionProgressBar!: Phaser.GameObjects.Rectangle;
  private spawnTimer = 0;
  // Active mission for this run
  currentMission: Mission | null = null;
  missionRewarded = false;

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
    this.fishCollectedPreHalf = 0;
    this.laneChangeCount = 0;
    this.fishSpawned = 0;
    this.phraseCount = 0;
    this.finished = false;
    this.spawnTimer = 0;
    this.missionRewarded = false;
    this.lives = this.difficulty === 'hard' ? 2 : this.difficulty === 'medium' ? 2 : 3;
    this.baseScrollSpeed = this.difficulty === 'hard' ? 3.5 : this.difficulty === 'medium' ? 3.0 : 2.5;
    // Per user feedback (2026-04-08): the previous targets felt too short —
    // the player was about to grab another fish when time ran out. Bumped
    // ~40% so an average run lands closer to 22-35 seconds with the
    // speed ramp. The obstacle phrase pool is large enough to fill the
    // longer runs without repeating obvious patterns.
    //
    // History:
    //   first pass:  800 / 1000 / 1200  (~4s, too short)
    //   second pass: 1800 / 2200 / 2600 (~15-25s, still cut off)
    //   current:     2500 / 3100 / 3700 (~22-35s)
    this.targetDistance = this.difficulty === 'hard' ? 3700 : this.difficulty === 'medium' ? 3100 : 2500;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    if ((cat?.stats?.endurance ?? 5) >= 7) this.lives++;
    this.startingLives = this.lives;

    // Pick one mission for this run. Random selection adds replay variety —
    // the same difficulty can land on a different secondary goal each play.
    this.currentMission = MISSIONS[Math.floor(Math.random() * MISSIONS.length)];
  }

  /** Per-distance scroll speed. Linear ramp from base to base*MAX over the
      target distance — the genre's #1 lever. The player's reactions have to
      keep pace with the rising speed even though obstacles never get harder
      individually. */
  getCurrentSpeed(): number {
    const t = Math.min(1, this.distance / this.targetDistance);
    const mult = 1 + (this.MAX_SPEED_MULT - 1) * t;
    return this.baseScrollSpeed * mult;
  }

  /** Speed bucket 1-5 for the HUD readout — gives the player a coarse,
      readable signal that they're going faster without showing a raw float. */
  getSpeedLevel(): number {
    const t = Math.min(1, this.distance / this.targetDistance);
    return 1 + Math.floor(t * 4);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial bumped to v2 — the new mechanics (mission, speed ramp,
    // structured phrases) deserve a fresh tutorial showing for returning
    // players.
    // Tutorial bumped to v3 — names the failure condition explicitly
    // (obstacles cost lives, run out of lives = package lost) since the
    // previous version left the player guessing what the red blocks did.
    if (showMinigameTutorial(this, 'clowder_courier_tutorial_v3', 'Courier Run',
      `Sprint through the alleys to deliver the package!<br><br>
      <strong>Swipe up/down</strong> or use buttons to change lanes.<br><br>
      <strong style="color:#cc6666">Avoid the red obstacles</strong> — every hit costs a life.<br><br>
      The road <strong>speeds up</strong> as you go — react faster the further you run.`,
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
    // Speed bucket — coarse readable signal of the difficulty ramp
    this.speedText = this.add.text(GAME_WIDTH / 2, 55, 'Speed 1', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#c4956a',
    }).setOrigin(0.5);

    // Mission HUD — shows the secondary objective for this run with a
    // small live progress bar. Sits between the run progress bar and the
    // lanes so it's always visible during play.
    if (this.currentMission) {
      this.missionText = this.add.text(GAME_WIDTH / 2, 200, `\u{2733} ${this.currentMission.description}`, {
        fontFamily: 'Georgia, serif', fontSize: '11px', color: '#dda055',
      }).setOrigin(0.5);
      this.add.rectangle(GAME_WIDTH / 2, 215, 180, 4, 0x2a2520).setStrokeStyle(1, 0x3a3530);
      this.missionProgressBar = this.add.rectangle(GAME_WIDTH / 2 - 90, 215, 0, 4, 0xdda055).setOrigin(0, 0.5);
    }

    // Run progress bar
    this.add.rectangle(GAME_WIDTH / 2, 240, 300, 6, 0x2a2520).setStrokeStyle(1, 0x3a3530);
    this.add.rectangle(GAME_WIDTH / 2 - 150, 240, 0, 6, 0x4a8a4a).setOrigin(0, 0.5).setName('runProgress');

    this.add.text(GAME_WIDTH - 30, 75, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      if (!isPracticeRun()) eventBus.emit('navigate', 'TownMapScene');
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

    attachStandardCleanup(this);

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  update(_time: number, delta: number): void {
    if (this.finished || this.tutorialShowing) return;
    const dt = delta / 1000;

    // Speed ramps with distance — the genre's #1 lever
    const speed = this.getCurrentSpeed();

    this.distance += speed * dt * 60;
    const pct = Math.min(100, Math.floor((this.distance / this.targetDistance) * 100));
    this.distText.setText(`${pct}%`);
    this.speedText?.setText(`Speed ${this.getSpeedLevel()}`);
    const progressBar = this.children.getByName('runProgress') as Phaser.GameObjects.Rectangle;
    if (progressBar) progressBar.width = 300 * (pct / 100);

    // Spawn obstacle phrases (structured randomness instead of pure random)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      // Spawn cadence shrinks slightly with distance — same lever as speed
      const baseGap = this.difficulty === 'hard' ? 1.4 : this.difficulty === 'medium' ? 1.6 : 1.9;
      const distT = Math.min(1, this.distance / this.targetDistance);
      this.spawnTimer = baseGap * (1 - 0.3 * distT) + Math.random() * 0.4;
      this.spawnPhrase();
    }

    // Move obstacles
    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      obs.x -= speed * dt * 60;
      obs.gfx.setPosition(obs.x, LANE_Y[obs.lane]);
      if (obs.x < -50) { obs.active = false; obs.gfx.destroy(); }

      // Collision with cat
      if (obs.active && obs.lane === this.currentLane && Math.abs(obs.x - 60) < 25) {
        obs.active = false;
        obs.gfx.destroy();
        this.handleHit();
        if (this.lives <= 0) { this.endGame(false); return; }
      }
    }

    // Move collectibles
    for (const col of this.collectibles) {
      if (col.collected) continue;
      col.x -= speed * dt * 60;
      col.gfx.setPosition(col.x, LANE_Y[col.lane]);
      if (col.x < -30) { col.collected = true; col.gfx.destroy(); }

      // Collect
      if (!col.collected && col.lane === this.currentLane && Math.abs(col.x - 60) < 25) {
        col.collected = true;
        col.gfx.destroy();
        this.handleFishPickup(col.x, LANE_Y[col.lane]);
      }
    }

    // Live mission progress
    this.updateMissionHud();

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
    this.laneChangeCount++;
    playSfx('crate_push', 0.2); // crisp click for lane confirmation

    if (this.catSprite) {
      // Squash-stretch on lane switch — game-juice pillar. Quick scaleY
      // squash followed by ease back, layered onto the y-tween. The doc
      // calls out "the character must feel like an extension of the
      // player's intent, not a marionette with loose strings."
      this.tweens.add({
        targets: this.catSprite, y: LANE_Y[this.currentLane],
        duration: 120, ease: 'Sine.easeOut',
      });
      this.tweens.add({
        targets: this.catSprite,
        scaleY: 0.7, scaleX: 1.05,
        duration: 60, yoyo: true, ease: 'Sine.easeOut',
      });
    }
  }

  /** Centralized hit handler — flashes, shakes, decrements lives, plays
      sound. Pulled out of update() so it can also be called from tests
      and (eventually) other collision sources. */
  private handleHit(): void {
    this.lives--;
    this.livesText.setText(`Lives: ${this.lives}`);
    playSfx('hiss', 0.4);
    haptic.warning();
    this.cameras.main.flash(100, 80, 30, 30);
    this.cameras.main.shake(120, 0.008); // subtle shake — juice pillar

    // Explicit "OUCH! -1 life" callout. Without this the player only
    // sees a brief screen flash and has to guess what just happened.
    // Centered, large, and red so it reads as the failure feedback
    // the screen flash was meant to indicate.
    const ouch = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'OUCH! -1 life', {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#cc6666',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: ouch,
      y: GAME_HEIGHT / 2 - 70,
      alpha: 0,
      duration: 800,
      onComplete: () => ouch.destroy(),
    });
  }

  /** Centralized fish-pickup handler — increments counters, plays SFX,
      bursts particles. Mission tracking lives here so secondary goals
      auto-update without scattering logic. */
  private handleFishPickup(x: number, y: number): void {
    this.fishCollected++;
    if (this.distance < this.targetDistance / 2) {
      this.fishCollectedPreHalf++;
    }
    playSfx('sparkle', 0.3);
    this.burstParticles(x, y, 0xdda055, 10);
  }

  /** One-shot particle burst at (x,y). Reuses the global particle_pixel
      texture and auto-destroys the emitter after the burst fades. Same
      pattern as ChaseScene/HuntScene. */
  private burstParticles(x: number, y: number, tint: number, count = 8): void {
    if (!this.textures.exists('particle_pixel')) return;
    const emitter = this.add.particles(x, y, 'particle_pixel', {
      speed: { min: 30, max: 100 },
      lifespan: { min: 200, max: 400 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.explode(count);
    this.time.delayedCall(500, () => emitter.destroy());
  }

  private updateMissionHud(): void {
    if (!this.currentMission || !this.missionProgressBar) return;
    const p = this.currentMission.progress(this);
    this.missionProgressBar.width = 180 * p;
    // When mission completes mid-run, briefly highlight the HUD
    if (!this.missionRewarded && this.currentMission.isComplete(this)) {
      this.missionRewarded = true;
      this.missionText.setColor('#88dd88');
      playSfx('sparkle', 0.5);
      this.cameras.main.flash(80, 100, 200, 100);
    }
  }

  /** Pick a random phrase from the library and instantiate all of its
      items. Phrases produce coherent challenges instead of pure-random
      lane picks, which is the doc's "structured randomness" pillar. */
  spawnPhrase(): string {
    const fishPhrases = PHRASES.filter((phrase) => phrase.items.some((item) => item.kind === 'fish'));
    const beforeHalfway = this.distance < this.targetDistance / 2;
    const shouldForceFishPhrase =
      this.phraseCount === 0 ||
      (beforeHalfway && this.fishSpawned < 3 && this.phraseCount % 2 === 1);
    const pool = shouldForceFishPhrase ? fishPhrases : PHRASES;
    const phrase = pool[Math.floor(Math.random() * pool.length)];
    this.phraseCount++;
    for (const item of phrase.items) {
      if (item.kind === 'obstacle') {
        this.spawnObstacleAt(item.lane, GAME_WIDTH + 30 + item.dx);
      } else {
        this.spawnFishAt(item.lane, GAME_WIDTH + 30 + item.dx);
      }
    }
    return phrase.name;
  }

  private spawnObstacleAt(lane: number, x: number): void {
    // Per playtest (2026-04-18): "replace the different colored squares
    // in the sprint scene with pixel art of different objects" + "I don't
    // understand the difference between the red and green squares." Using
    // the existing block sprites (barrel, crate, cart, flour_sack, pew)
    // loaded in BootScene gives each obstacle a distinct visual identity.
    const obstacleKeys = ['barrel_sprite', 'block_crate', 'block_cart', 'block_flour_sack', 'block_pew'];
    const availableKeys = obstacleKeys.filter(k => this.textures.exists(k));
    let gfx: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
    if (availableKeys.length > 0) {
      const key = availableKeys[Math.floor(Math.random() * availableKeys.length)];
      const spr = this.add.sprite(x, LANE_Y[lane], key);
      spr.setScale(0.8);
      spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      gfx = spr;
    } else {
      const obs = this.add.rectangle(x, LANE_Y[lane], 30, 30, 0x4a3a28);
      obs.setStrokeStyle(1, 0x2a2018);
      gfx = obs;
    }
    this.obstacles.push({ x, lane, width: 30, gfx, active: true });
  }

  private spawnFishAt(lane: number, x: number): void {
    this.fishSpawned++;
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
      haptic.success();
      const stars = this.lives >= 3 ? 3 : this.lives >= 2 ? 2 : 1;
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Delivered!', {
        fontFamily: 'Georgia, serif', fontSize: '28px', color: '#c4956a',
      }).setOrigin(0.5);

      // Mission completion bonus on top of fish collected
      let missionBonus = 0;
      if (this.currentMission && this.currentMission.isComplete(this)) {
        missionBonus = this.currentMission.reward;
      }
      const totalBonus = this.fishCollected + missionBonus;

      if (totalBonus > 0) {
        const breakdown = missionBonus > 0 && this.fishCollected > 0
          ? `+${totalBonus} fish (${this.fishCollected} collected + ${missionBonus} mission bonus)`
          : missionBonus > 0
            ? `+${missionBonus} mission bonus fish`
            : `+${this.fishCollected} bonus fish`;
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, breakdown, {
          fontFamily: 'Georgia, serif', fontSize: '13px', color: '#dda055',
        }).setOrigin(0.5);
      }
      if (this.currentMission) {
        const status = this.currentMission.isComplete(this) ? '\u{2713} Complete' : '\u{2717} Incomplete';
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 52, `Mission: ${this.currentMission.description} — ${status}`, {
          fontFamily: 'Georgia, serif', fontSize: '11px',
          color: this.currentMission.isComplete(this) ? '#88dd88' : '#8b7355',
        }).setOrigin(0.5);
      }

      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `courier_run_${this.difficulty}`,
          moves: Math.floor(this.distance), minMoves: this.targetDistance, stars,
          jobId: this.jobId, catId: this.catId, bonusFish: totalBonus,
        });
      });
    } else {
      playSfx('fail');
      haptic.error();
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Package lost!', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        if (!isPracticeRun()) eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
