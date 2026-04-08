import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { showMinigameTutorial, attachStandardCleanup } from '../ui/sceneHelpers';

// ──────────────────────────────────────────────────────────────────────
// RoofScoutScene — vertical climbing platformer
//
// The 14th minigame, designed per the council's recommendation in
// todo/game/platformer/3 + 4. Portrait-vertical, two-zone tap controls,
// wall-cling and wall-jump, modular hand-crafted chunks. The cat climbs
// from the alley up to a rooftop watchpoint to deliver a guild courier
// run with vertical character — the only minigame that uses Arcade
// physics for player movement.
//
// Coordinate system: world is GAME_WIDTH wide and WORLD_HEIGHT tall.
// "Up" is decreasing Y (Phaser convention). Player starts near the
// bottom (high Y) and climbs to the top (low Y). Camera follows the
// player upward; HUD elements are pinned via setScrollFactor(0).
//
// Stats from the implementation guide map to Clowder & Crest's actual
// stat names: stealth = "agility" (jump height + cling fall speed),
// endurance = "courage" (fall checkpoint forgiveness).
// ──────────────────────────────────────────────────────────────────────

const WORLD_HEIGHT = GAME_HEIGHT * 4; // ~3,376px tall climb
const PLAYER_W = 22;
const PLAYER_H = 32;
const START_Y = WORLD_HEIGHT - 120;
const TARGET_Y = 120;

const COYOTE_MS = 120;
const JUMP_BUFFER_MS = 150;

// Physics tuning, second pass (2026-04-08): the first version had drag=400
// and lean=110 which combined to kill the horizontal lean velocity after
// ~15px of travel. The player couldn't reach the side platforms in the
// first chunk because the lateral distance was 35-100px and the lean
// momentum died too quickly. Tuned for more carry-through:
//   - jump velocity bumped slightly so a max-hold jump clears 1.5 chunks
//   - lean increased so a tap travels meaningfully
//   - drag dropped from 400 → 120 so momentum carries through the arc
//   - drag still > 0 so the player doesn't slide forever after release
const BASE_JUMP_VELOCITY = -600;
const WALL_KICK_X = 220;
const LEAN_X = 170;
const WALL_FALL_CAP = 80;
const MAX_FALL_VELOCITY = 900;
const PLAYER_DRAG_X = 120;

// Each chunk is one vertical band of authored level. Chunks are stacked
// upward from the start until the world is filled. Y values are RELATIVE
// to the chunk anchor (negative = up). Coordinates are converted to
// absolute world coords in buildChunk().
interface PlatformDef {
  x: number;
  y: number;
  width: number;
}

interface ChunkDef {
  id: string;
  difficulty: 1 | 2 | 3;
  platforms: PlatformDef[];
  fish?: { x: number; y: number }[];
}

const CHUNK_HEIGHT = 200;

// 12 hand-crafted chunks across 3 difficulty tiers. Tier 1 chunks are
// wide, close, and forgiving (the warm-up). Tier 2 introduces wall
// cling gaps. Tier 3 demands wall-jumping and tighter timing.
//
// IMPORTANT: t1-stairs is always the FIRST chunk loaded above the
// spawn (chunkIndex 0 → tier 1 → eligible[0]). Its lowest platform
// must be reachable with a single straight-up jump from x=GAME_WIDTH/2,
// or new players get stuck on the ground floor on their very first
// attempt. Reported as a bug 2026-04-08.
const CHUNKS: ChunkDef[] = [
  // ── Tier 1: shallow stairs, wide ledges ──
  {
    id: 't1-stairs', difficulty: 1,
    platforms: [
      // Wide central starter — directly above the spawn (GAME_WIDTH/2 = 195),
      // so a straight-up jump always lands.
      { x: 130, y: -30, width: 130 },
      { x: 30, y: -100, width: 110 },
      { x: 240, y: -160, width: 100 },
    ],
    fish: [{ x: 195, y: -55 }],
  },
  {
    id: 't1-wide', difficulty: 1,
    platforms: [
      { x: 40, y: -30, width: 130 },
      { x: 220, y: -100, width: 110 },
      { x: 60, y: -170, width: 100 },
    ],
    fish: [{ x: 280, y: -140 }],
  },
  {
    id: 't1-zigzag', difficulty: 1,
    platforms: [
      { x: 220, y: -10, width: 100 },
      { x: 70, y: -75, width: 90 },
      { x: 220, y: -135, width: 90 },
      { x: 80, y: -185, width: 100 },
    ],
    fish: [{ x: 130, y: -45 }],
  },
  // ── Tier 2: introduce wall cling — narrow gap with side walls ──
  {
    id: 't2-cling-left', difficulty: 2,
    platforms: [
      { x: 50, y: -20, width: 90 },
      // tall left wall hanging from the side — cling here
      { x: 0, y: -90, width: 24 },
      { x: 200, y: -100, width: 110 },
      { x: 60, y: -170, width: 100 },
    ],
    fish: [{ x: 250, y: -130 }],
  },
  {
    id: 't2-cling-right', difficulty: 2,
    platforms: [
      { x: 230, y: -25, width: 110 },
      { x: GAME_WIDTH - 24, y: -100, width: 24 },
      { x: 60, y: -110, width: 100 },
      { x: 230, y: -180, width: 90 },
    ],
    fish: [{ x: 100, y: -135 }],
  },
  {
    id: 't2-staggered', difficulty: 2,
    platforms: [
      { x: 30, y: -15, width: 80 },
      { x: 180, y: -60, width: 70 },
      { x: 290, y: -115, width: 70 },
      { x: 130, y: -160, width: 80 },
      { x: 30, y: -195, width: 60 },
    ],
    fish: [{ x: 220, y: -90 }, { x: 60, y: -180 }],
  },
  {
    id: 't2-funnel', difficulty: 2,
    platforms: [
      { x: 20, y: -10, width: 70 },
      { x: 280, y: -10, width: 70 },
      { x: 150, y: -75, width: 90 },
      { x: 30, y: -145, width: 80 },
      { x: 250, y: -185, width: 90 },
    ],
    fish: [{ x: 175, y: -45 }],
  },
  // ── Tier 3: demand wall-jumps and tighter spacing ──
  {
    id: 't3-chimney', difficulty: 3,
    platforms: [
      { x: 60, y: -10, width: 80 },
      // narrow chimney — bounce wall to wall up
      { x: 0, y: -60, width: 18 },
      { x: GAME_WIDTH - 18, y: -100, width: 18 },
      { x: 0, y: -150, width: 18 },
      { x: GAME_WIDTH - 18, y: -190, width: 18 },
      { x: 100, y: -195, width: 100 },
    ],
    fish: [{ x: 195, y: -130 }],
  },
  {
    id: 't3-leap', difficulty: 3,
    platforms: [
      { x: 30, y: -25, width: 70 },
      { x: 280, y: -85, width: 70 },
      { x: 30, y: -150, width: 70 },
      { x: 280, y: -195, width: 70 },
    ],
    fish: [{ x: 175, y: -180 }],
  },
  {
    id: 't3-towers', difficulty: 3,
    platforms: [
      { x: 20, y: -10, width: 60 },
      { x: 160, y: -45, width: 60 },
      { x: 300, y: -85, width: 60 },
      { x: 160, y: -130, width: 60 },
      { x: 20, y: -170, width: 60 },
      { x: 200, y: -195, width: 100 },
    ],
    fish: [{ x: 50, y: -175 }, { x: 320, y: -110 }],
  },
  {
    id: 't3-spikes', difficulty: 3,
    platforms: [
      { x: 50, y: -15, width: 80 },
      { x: 260, y: -65, width: 70 },
      { x: 80, y: -110, width: 50 },
      { x: 220, y: -150, width: 50 },
      { x: 130, y: -195, width: 90 },
    ],
    fish: [{ x: 165, y: -180 }],
  },
  {
    id: 't3-final', difficulty: 3,
    platforms: [
      { x: 10, y: -20, width: 100 },
      { x: GAME_WIDTH - 18, y: -80, width: 18 },
      { x: 0, y: -130, width: 18 },
      { x: 130, y: -195, width: 130 },
    ],
    fish: [{ x: 80, y: -160 }],
  },
];

export class RoofScoutScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty: 'easy' | 'medium' | 'hard' = 'easy';

  // Player + physics
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerVisual!: Phaser.GameObjects.Rectangle;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private fishGroup!: Phaser.Physics.Arcade.Group;

  // Game-feel state
  private lastGroundedTime = -Infinity;
  private jumpBufferTime = -Infinity;
  private jumpBufferDirection: 'left' | 'right' = 'left';
  private isWallClinging = false;
  private prevVelocityY = 0;
  private leftHeld = false;
  private rightHeld = false;

  // Run state
  private fishCollected = 0;
  private highestY = START_Y;
  private lastCheckpointY = START_Y;
  private finished = false;
  private tutorialShowing = false;

  // Stat-derived parameters
  private jumpVelocity = BASE_JUMP_VELOCITY;
  private wallFallCap = WALL_FALL_CAP;
  private fallForgiveness = GAME_HEIGHT * 0.6;

  // HUD
  private heightText!: Phaser.GameObjects.Text;
  private fishText!: Phaser.GameObjects.Text;
  private heightBar!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({
      key: 'RoofScoutScene',
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 1200 }, debug: false },
      },
    });
  }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.catBreed = data?.catBreed ?? 'wildcat';
    this.difficulty = data?.difficulty ?? 'easy';
    this.fishCollected = 0;
    this.highestY = START_Y;
    this.lastCheckpointY = START_Y;
    this.finished = false;
    this.tutorialShowing = false;
    this.lastGroundedTime = -Infinity;
    this.jumpBufferTime = -Infinity;
    this.isWallClinging = false;
    this.prevVelocityY = 0;
    this.leftHeld = false;
    this.rightHeld = false;

    // Map cat stats to physics. Stealth=agility (jump height + cling slow);
    // endurance=courage (fall recovery distance). Each stat point is a small
    // tweak; the physics base is balanced to feel fair at stat 5.
    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const agility = cat?.stats?.stealth ?? 5;
    const courage = cat?.stats?.endurance ?? 5;

    // -540 (stat 1) → -560 (stat 5) → -600 (stat 10)
    this.jumpVelocity = BASE_JUMP_VELOCITY - (agility - 5) * 8;
    // wall cling slows the fall further for agile cats
    this.wallFallCap = Math.max(40, WALL_FALL_CAP - (agility - 5) * 6);
    // hardier cats survive bigger plummets before resetting to a checkpoint
    this.fallForgiveness = GAME_HEIGHT * (0.55 + courage * 0.025);
  }

  create(): void {
    // The base camera is DPR-zoomed like every other scene so the canvas
    // renders at native resolution. centerOn places the viewport on the
    // bottom of the world where the player starts; startFollow takes
    // over after.
    this.cameras.main.setBackgroundColor('#15131a');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, WORLD_HEIGHT);
    this.cameras.main.centerOn(GAME_WIDTH / 2, START_Y);

    // Physics world is the full vertical extent so platforms outside the
    // visible camera still collide and the player can't fall past the
    // bottom (a fall is recoverable, world-bounds death is not).
    //
    // Horizontally we extend the bounds well past the visible screen so
    // the cat can leave the visible area on the left or right and the
    // update loop wraps it back to the opposite side. This gives the
    // platformer Pac-Man-style screen wrap, requested by the user — a
    // jump off the right edge re-enters from the left, and vice versa.
    this.physics.world.setBounds(-GAME_WIDTH, 0, GAME_WIDTH * 3, WORLD_HEIGHT);

    if (showMinigameTutorial(this, 'clowder_roof_scout_tutorial_v1', 'Roof Scout',
      `Climb to the rooftop watchpoint!<br><br>
      <strong>Tap the left or right side</strong> to jump in that direction.<br><br>
      <strong>Hold</strong> the tap longer to jump higher.<br><br>
      Brush against a wall mid-air to <strong style="color:#dda055">cling</strong>, then tap the opposite side to <strong>wall-jump</strong> off it.<br><br>
      Falling past the last platform you reached costs your run.`,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    // Parallax stone-wall background — slower scroll factor than the
    // platforms so depth reads in the climbing motion. A simple tinted
    // tileSprite sits at viewport-fixed Y but Y-scrolls at 0.3.
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1a161e)
      .setScrollFactor(0);
    // Brick stripes — pure decoration, drawn fixed to the camera with
    // partial scroll for parallax depth
    const bgGfx = this.add.graphics();
    bgGfx.lineStyle(1, 0x2a2530, 0.6);
    for (let row = 0; row < 24; row++) {
      const y = row * 40;
      bgGfx.lineBetween(0, y, GAME_WIDTH, y);
      const offset = (row % 2) * 30;
      for (let col = 0; col < 5; col++) {
        bgGfx.lineBetween(offset + col * 80, y, offset + col * 80, y + 40);
      }
    }
    bgGfx.setScrollFactor(0, 0.3);

    this.platforms = this.physics.add.staticGroup();
    this.fishGroup = this.physics.add.group({ allowGravity: false, immovable: true });

    this.buildLevel();

    // Player — Arcade sprite with a rectangular visual stacked over the
    // physics body. We use the colored rectangle the user requested
    // instead of a sprite asset; the physics body is independent.
    this.player = this.physics.add.sprite(GAME_WIDTH / 2, START_Y, '__missing');
    this.player.setVisible(false); // hide the missing-texture marker
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(PLAYER_W, PLAYER_H);
    playerBody.setOffset(0, 0);
    this.player.setCollideWorldBounds(true);
    this.player.setMaxVelocity(260, MAX_FALL_VELOCITY);
    this.player.setDragX(PLAYER_DRAG_X);

    this.playerVisual = this.add.rectangle(GAME_WIDTH / 2, START_Y, PLAYER_W, PLAYER_H, 0xc4956a);
    this.playerVisual.setStrokeStyle(1, 0x6b4a28);
    this.playerVisual.setDepth(10);

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.fishGroup, (_p, fish) => {
      this.collectFish(fish as Phaser.GameObjects.Rectangle);
    });

    this.cameras.main.startFollow(this.player, true);
    // Y-only smooth follow — instant X (player rarely strays), eased Y
    // so the climb feels grounded instead of jittery on every jump arc.
    this.cameras.main.setLerp(1.0, 0.12);
    // Offset down so the player sits at ~70% of the screen, leaving the
    // upper 70% as upcoming-platform planning space (per section 6).
    this.cameras.main.setFollowOffset(0, -GAME_HEIGHT * 0.2);

    // ── HUD (camera-fixed) ──
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 26, `${job?.name ?? 'Roof Scout'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '15px', color: '#c4956a',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100);

    this.heightText = this.add.text(20, 50, '0%', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#4a8a4a',
    }).setScrollFactor(0).setDepth(100);

    this.fishText = this.add.text(GAME_WIDTH - 20, 50, '\u{1F41F} 0', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#dda055',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

    // Vertical progress bar pinned to the right edge — gives a constant
    // sense of how much climb is left without forcing the player to look
    // away from the action.
    const barX = GAME_WIDTH - 8;
    const barTop = 80;
    const barBottom = GAME_HEIGHT - 30;
    const barHeight = barBottom - barTop;
    this.add.rectangle(barX, (barTop + barBottom) / 2, 4, barHeight, 0x2a2520)
      .setScrollFactor(0).setDepth(100);
    this.heightBar = this.add.rectangle(barX, barBottom, 4, 0, 0x4a8a4a)
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(100);

    // Quit button — moved to top-right (was bottom-right). The bottom
    // half is the right tap-zone for jumps, so a button down there got
    // hit by every miss-tap and the player effectively had no way out.
    // Now lives in the HUD strip alongside the title/height/fish so a
    // tap on it can never be confused with a jump input.
    const quitBg = this.add.rectangle(GAME_WIDTH - 32, 50, 56, 24, 0x2a2520, 0.9)
      .setStrokeStyle(1, 0x6b5b3e)
      .setScrollFactor(0).setDepth(100);
    const quitText = this.add.text(GAME_WIDTH - 32, 50, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#c4956a',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    quitBg.setInteractive({ useHandCursor: true });
    quitBg.on('pointerdown', () => this.quitRun());
    void quitText;

    // ── Two-zone touch input ──
    // Pointer x maps directly via screen halves. Track held state for
    // variable jump height (release = velocity cut). Taps in the top
    // HUD strip (y < HUD_BOTTOM) are excluded so the Quit button and
    // height/fish counters can be tapped without firing a jump.
    const HUD_BOTTOM = 80;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.finished || this.tutorialShowing) return;
      const screenY = p.y / DPR;
      if (screenY < HUD_BOTTOM) return; // HUD zone — let GameObject handlers run
      const screenX = p.x / DPR;
      if (screenX < GAME_WIDTH / 2) {
        this.leftHeld = true;
        this.attemptJump('left');
      } else {
        this.rightHeld = true;
        this.attemptJump('right');
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const screenX = p.x / DPR;
      if (screenX < GAME_WIDTH / 2) this.leftHeld = false;
      else this.rightHeld = false;
    });

    // Keyboard fallback for desktop testing — A/D + Space
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.finished || this.tutorialShowing) return;
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        this.leftHeld = true;
        this.attemptJump('left');
      }
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        this.rightHeld = true;
        this.attemptJump('right');
      }
      if (e.key === ' ' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        const vx = (this.player.body as Phaser.Physics.Arcade.Body)?.velocity.x ?? 0;
        this.attemptJump(vx < 0 ? 'left' : 'right');
      }
    });
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') this.leftHeld = false;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') this.rightHeld = false;
    });

    attachStandardCleanup(this, () => {
      this.input.off('pointerdown');
      this.input.off('pointerup');
      this.platforms?.clear(true, true);
      this.fishGroup?.clear(true, true);
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  /** Build the level by stacking chunks upward from START_Y until the
   *  world is filled. Tier-1 chunks always populate the bottom band; tier
   *  selection ramps with progress so the climb gets harder near the top. */
  private buildLevel(): void {
    // Ground floor — a wide stable platform under the spawn point so the
    // player can't immediately fall off the world.
    this.makePlatform(GAME_WIDTH / 2, START_Y + 30, GAME_WIDTH, 12);

    // Easy-mode side walls. Per user feedback (2026-04-08): "put walls
    // completely up along the sides of the first course, making it
    // easier for the player to have something to wall jump off of for
    // the first level / easy level." Solid full-height pillars at the
    // screen edges give beginners obvious wall-cling/wall-jump anchors
    // and turn easy mode into a wall-jump tutorial. Medium/hard runs
    // skip this and rely on the Pac-Man screen wrap for horizontal
    // mobility — distinct mechanic per difficulty.
    if (this.difficulty === 'easy') {
      const wallW = 18;
      const wallTop = TARGET_Y - 50;
      const wallBottom = START_Y + 30;
      const wallH = wallBottom - wallTop;
      const wallY = (wallTop + wallBottom) / 2;
      this.makePlatform(wallW / 2, wallY, wallW, wallH, 0x4a3a28);
      this.makePlatform(GAME_WIDTH - wallW / 2, wallY, wallW, wallH, 0x4a3a28);
    }

    let anchorY = START_Y - 60;
    let chunkIndex = 0;
    while (anchorY > TARGET_Y + CHUNK_HEIGHT) {
      const tier = this.pickTierForAnchor(anchorY);
      const eligible = CHUNKS.filter((c) => c.difficulty === tier);
      const chunk = eligible[chunkIndex % eligible.length];
      chunkIndex++;
      this.placeChunk(chunk, anchorY);
      anchorY -= CHUNK_HEIGHT;
    }

    // Final summit platform — the win zone. A wide ledge the player can
    // land on to complete the climb.
    this.makePlatform(GAME_WIDTH / 2, TARGET_Y + 20, 200, 14, 0xdda055);
    this.add.text(GAME_WIDTH / 2, TARGET_Y - 10, 'WATCHPOINT', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#dda055',
    }).setOrigin(0.5);
  }

  /** Difficulty tier ramps from 1 (bottom of climb) to 3 (near summit). */
  private pickTierForAnchor(anchorY: number): 1 | 2 | 3 {
    const climbProgress = 1 - (anchorY - TARGET_Y) / (START_Y - TARGET_Y);
    // hard runs ramp faster; easy runs spend longer in tier 1
    const offset = this.difficulty === 'hard' ? 0.15 : this.difficulty === 'medium' ? 0 : -0.1;
    const t = climbProgress + offset;
    if (t < 0.35) return 1;
    if (t < 0.7) return 2;
    return 3;
  }

  private placeChunk(chunk: ChunkDef, anchorY: number): void {
    for (const p of chunk.platforms) {
      const px = p.x + p.width / 2;
      const py = anchorY + p.y;
      this.makePlatform(px, py, p.width, 12);
    }
    if (chunk.fish) {
      for (const f of chunk.fish) {
        this.makeFish(f.x, anchorY + f.y);
      }
    }
  }

  private makePlatform(cx: number, cy: number, width: number, height = 12, color = 0x6b5b3e): void {
    const rect = this.add.rectangle(cx, cy, width, height, color);
    rect.setStrokeStyle(1, 0x3a2f24);
    this.physics.add.existing(rect, true); // static body
    this.platforms.add(rect);
  }

  private makeFish(cx: number, cy: number): void {
    const fish = this.add.rectangle(cx, cy, 12, 8, 0xdda055);
    fish.setStrokeStyle(1, 0x8b6a32);
    this.physics.add.existing(fish);
    (fish.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    (fish.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.fishGroup.add(fish);
    // Bob the fish so it reads as collectible, not a tiny ledge
    this.tweens.add({
      targets: fish,
      y: cy - 4,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── Update loop ──

  update(time: number, _delta: number): void {
    if (this.finished || this.tutorialShowing) return;
    if (!this.player.body) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Screen wrap — Pac-Man style. When the cat's center crosses the
    // visible edge, teleport to the opposite side. The world bounds
    // are extended past the screen so the cat doesn't get stopped at
    // the edge before we can wrap it.
    if (this.player.x < -PLAYER_W / 2) {
      this.player.setX(GAME_WIDTH + PLAYER_W / 2);
    } else if (this.player.x > GAME_WIDTH + PLAYER_W / 2) {
      this.player.setX(-PLAYER_W / 2);
    }

    // Sync the colored visual to the physics body each frame.
    this.playerVisual.setPosition(this.player.x, this.player.y);

    // Track grounded state for coyote-time. Refresh whenever the body
    // is touching down so the timer resets every frame the cat sits on
    // a platform.
    const onGround = body.blocked.down || body.touching.down;
    if (onGround) {
      this.lastGroundedTime = time;
      // Consume any buffered jump as soon as we land (jump buffering)
      if (time - this.jumpBufferTime < JUMP_BUFFER_MS) {
        this.doJump(this.jumpBufferDirection);
        this.jumpBufferTime = -Infinity;
      }
    }

    // Wall cling — if airborne and pressing into a wall, slow the fall
    const touchingLeft = body.blocked.left || body.touching.left;
    const touchingRight = body.blocked.right || body.touching.right;
    this.isWallClinging = (touchingLeft || touchingRight) && !onGround && body.velocity.y >= 0;
    if (this.isWallClinging && body.velocity.y > this.wallFallCap) {
      this.player.setVelocityY(this.wallFallCap);
    }

    // Variable jump height — if the player released the tap while still
    // ascending, cut the upward velocity to ~40% so a quick tap = small
    // jump and a held tap = full jump. Only cut once per ascent.
    if (body.velocity.y < -200 && !this.leftHeld && !this.rightHeld) {
      this.player.setVelocityY(body.velocity.y * 0.4);
    }

    // Detect a hard landing (fall velocity > 200) and play squash juice
    const justLanded = onGround && this.prevVelocityY > 200;
    if (justLanded) {
      this.playLandSquash();
      playSfx('crate_push', 0.18);
      haptic.tap();
    }
    this.prevVelocityY = body.velocity.y;

    // Climb tracking — every time the player passes a new highest Y,
    // update the checkpoint so a fall doesn't drag them all the way back
    // to the starting alley. The progress bar reads off this.
    if (this.player.y < this.highestY) {
      this.highestY = this.player.y;
      // Snap the checkpoint to the player's current position whenever
      // they're standing on a platform — preserves the "rest perch"
      // feel from section 10 without requiring authored checkpoint
      // tiles.
      if (onGround) this.lastCheckpointY = this.player.y;
    }

    // Out-of-bounds fall — drop a meaningful distance below the highest
    // checkpoint and the run ends. Endurance widens this window.
    if (this.player.y > this.lastCheckpointY + this.fallForgiveness) {
      this.endRun(false);
      return;
    }

    // Update HUD
    const climbProgress = Math.max(0, Math.min(1,
      (START_Y - this.highestY) / (START_Y - TARGET_Y)
    ));
    this.heightText.setText(`${Math.floor(climbProgress * 100)}%`);
    const barTop = 80;
    const barBottom = GAME_HEIGHT - 30;
    this.heightBar.height = (barBottom - barTop) * climbProgress;

    // Win condition — touch the watchpoint Y
    if (this.player.y <= TARGET_Y + 30 && onGround) {
      this.endRun(true);
    }
  }

  // ── Jump pipeline ──

  private attemptJump(direction: 'left' | 'right'): void {
    if (this.finished || this.tutorialShowing) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down || body.touching.down;
    const coyoteOk = (this.time.now - this.lastGroundedTime) < COYOTE_MS;
    const canJump = onGround || coyoteOk || this.isWallClinging;

    if (canJump) {
      this.doJump(direction);
      // Consume coyote so a single jump can't fire twice off one ledge
      this.lastGroundedTime = -Infinity;
    } else {
      // Buffer the input — fires automatically on the next ground touch
      this.jumpBufferTime = this.time.now;
      this.jumpBufferDirection = direction;
    }
  }

  private doJump(direction: 'left' | 'right'): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const wallLeft = body.blocked.left || body.touching.left;
    const wallRight = body.blocked.right || body.touching.right;
    const onGround = body.blocked.down || body.touching.down;

    if (!onGround && this.isWallClinging) {
      // Wall jump — kick away from the wall regardless of tap side so
      // the player doesn't have to tap "the right side" while reaching.
      const pushDir = wallRight ? -1 : wallLeft ? 1 : (direction === 'left' ? -1 : 1);
      this.player.setVelocityY(this.jumpVelocity);
      this.player.setVelocityX(pushDir * WALL_KICK_X);
      this.isWallClinging = false;
      // Wall-jump is a relatively rare moment so it gets a soft tactile
      // sound. Volume dropped from 0.25 → 0.08 per user feedback.
      playSfx('block_slide', 0.08);
      haptic.tap();
    } else {
      // Ground / coyote jump — directional lean from tap side.
      // No SFX here per user feedback (2026-04-08): "the constant jump
      // sound is a little annoying." The squash/stretch tween + haptic
      // tap already give the player launch confirmation, and the
      // landing crate_push (in update()) is the only end-of-jump sound
      // the player needs.
      this.player.setVelocityY(this.jumpVelocity);
      const leanX = direction === 'left' ? -LEAN_X : LEAN_X;
      this.player.setVelocityX(leanX);
      haptic.tap();
    }
    this.playJumpStretch();
  }

  // ── Juice ──

  private playLandSquash(): void {
    this.tweens.killTweensOf(this.playerVisual);
    this.tweens.add({
      targets: this.playerVisual,
      scaleX: 1.35, scaleY: 0.7,
      duration: 60, ease: 'Sine.easeOut', yoyo: true,
      onComplete: () => this.playerVisual.setScale(1, 1),
    });
  }

  private playJumpStretch(): void {
    this.tweens.killTweensOf(this.playerVisual);
    this.tweens.add({
      targets: this.playerVisual,
      scaleX: 0.8, scaleY: 1.3,
      duration: 80, ease: 'Sine.easeOut', yoyo: true,
      onComplete: () => this.playerVisual.setScale(1, 1),
    });
  }

  // ── Collectibles ──

  private collectFish(fish: Phaser.GameObjects.Rectangle): void {
    if (!fish.active) return;
    fish.destroy();
    this.fishCollected++;
    this.fishText.setText(`\u{1F41F} ${this.fishCollected}`);
    playSfx('fish_earn', 0.3);
    haptic.tap();
  }

  // ── End conditions ──

  private endRun(won: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (won) {
      playSfx('victory');
      haptic.success();
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'Watchpoint reached!', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#dda055',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
      if (this.fishCollected > 0) {
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, `+${this.fishCollected} bonus fish`, {
          fontFamily: 'Georgia, serif', fontSize: '13px', color: '#c4956a',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
      }

      // Stars: 3 if collected ALL fish AND no big fall, 2 if half, 1 default
      const totalFish = this.countTotalFish();
      const stars = this.fishCollected >= totalFish ? 3 : this.fishCollected >= Math.ceil(totalFish / 2) ? 2 : 1;

      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `roof_scout_${this.difficulty}`,
          moves: Math.floor(START_Y - this.highestY),
          minMoves: Math.floor(START_Y - TARGET_Y),
          stars,
          jobId: this.jobId,
          catId: this.catId,
          bonusFish: this.fishCollected,
        });
      });
    } else {
      playSfx('fail');
      haptic.error();
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, 'You fell.', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
      this.time.delayedCall(1500, () => this.quitRun());
    }
  }

  /** Used by the star calculation — fish that haven't been destroyed yet
   *  plus the count we already collected give the total spawned. */
  private countTotalFish(): number {
    return this.fishCollected + this.fishGroup.getChildren().filter((c) => c.active).length;
  }

  private quitRun(): void {
    if (!this.finished) this.finished = true;
    eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
    eventBus.emit('navigate', 'TownMapScene');
  }
}
