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
const PLAYER_W = 22;             // visual width
// Hitbox bumped from 14 → 18 per todo/tech/Wall Jump Advice.md fix #3.
// Tier-3 chimney stubs are 18px wide; with a 14px body the cat could
// skim the visual edge of a stub but the center-of-body would just
// pass the stub's face, missing blocked.left/right registration.
// At 18px the body matches the narrowest stubs and wall contact fires
// reliably. Visual is still 22px so there's 2px of leeway each side.
const PLAYER_BODY_W = 18;
const PLAYER_BODY_OFFSET_X = (PLAYER_W - PLAYER_BODY_W) / 2;
const PLAYER_H = 32;
/** Vertical tolerance for "corner correction." When the player is
 *  pressing into the side of a platform but their head is within
 *  CORNER_GRACE_PX of the platform's top, the engine snaps them up so
 *  the lean velocity carries them onto the platform. Without this, a
 *  jump that brushes the side of a ledge stalls horizontally and the
 *  cat falls past the platform's edge. Bumped from 10 → 18 in the
 *  2026-04-08 ease pass — gives a much more forgiving "almost
 *  cleared the ledge" assist. */
const CORNER_GRACE_PX = 18;
const START_Y = WORLD_HEIGHT - 120;
const TARGET_Y = 120;

const COYOTE_MS = 120;
// Wall coyote needs a slightly bigger window than ground coyote per
// todo/tech/Wall Jump Advice.md fix #2. Body friction resolution and
// touch event delivery on Android can land in different frames; 120ms
// (≈7 frames at 60fps) is too tight for "I just left the wall" intent.
// Bumped 180 → 320 (2026-04-10 ease pass) per user feedback "make the
// window of opportunity to wall jump longer" — at 60fps that's ~19
// frames of grace, well within "I tapped after leaving the wall" intent
// without crossing into "phantom wall jump out of nowhere" territory.
const WALL_COYOTE_MS = 320;
// Jump buffer also bumped from 150 → 220 so a tap that lands a little
// early still gets consumed by the next ground/wall contact.
const JUMP_BUFFER_MS = 220;

// Physics tuning, third pass (2026-04-08 ease pass): the user reported
// the climb still felt punishing and wall jumps were hard to chain.
// Loosened the whole envelope across the board:
//   - Gravity 1200 → 1050: longer air time, more reaction window
//   - Jump velocity -600 → -640: clears wider gaps with the same effort
//   - Wall kick 220 → 280: wall jumps push noticeably harder so the
//     cat actually CLEARS the next platform instead of falling back
//     into the same wall
//   - Drag 120 → 90: lateral momentum carries further after both
//     ground leans and wall kicks
//   - Wall fall cap 80 → 40: clinging now genuinely slows the slide,
//     giving the player real "hang on the wall and time the jump"
//     control instead of "whoops, fell off"
const BASE_JUMP_VELOCITY = -640;
const WALL_KICK_X = 280;
const LEAN_X = 170;
const WALL_FALL_CAP = 40;
const MAX_FALL_VELOCITY = 900;
const PLAYER_DRAG_X = 90;
const PLAYER_GRAVITY_Y = 1050;
/** Proximity radius for "I'm next to a wall, let me jump off it." Per
 *  user feedback (2026-04-09): "any time I'm next to a vertical surface
 *  I should be able to tap to jump off it." Doesn't require actual body
 *  contact — any platform whose vertical band overlaps the player and
 *  whose face is within WALL_NEAR_PX of the player's body counts. Very
 *  generous so the wall-jump feels easy to fire on touch. */
const WALL_NEAR_PX = 16;

// Each chunk is one vertical band of authored level. Chunks are stacked
// upward from the start until the world is filled. Y values are RELATIVE
// to the chunk anchor (negative = up). Coordinates are converted to
// absolute world coords in buildChunk().
interface PlatformDef {
  x: number;
  y: number;
  width: number;
  /** Vertical thickness. Defaults to 12 (a normal floor ledge). Set to
   *  60-110 for tall vertical walls authored specifically for chained
   *  wall jumps — a wall is just a rectangle with the long axis
   *  vertical instead of horizontal. */
  height?: number;
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
  // ── Tier 2 wall-jump chunks (added 2026-04-09) ──
  // Designed specifically for chained wall jumps. Tall vertical walls
  // (height >= 60) on alternating sides give the player a real "bounce
  // wall to wall up the channel" experience that the proximity wall
  // jump now makes practical. Per user feedback: "add vertical walls /
  // platforms really designed for wall jumping off of."
  {
    // Two-bounce zigzag: launch low, hit left wall, kick right onto
    // right wall higher up, kick left onto exit ledge at the top.
    id: 't2-walljump-zigzag', difficulty: 2,
    platforms: [
      { x: 100, y: -10, width: 140 },                                     // launch ledge
      { x: 0, y: -75, width: 22, height: 80 },                             // left wall (-115 to -35)
      { x: GAME_WIDTH - 22, y: -135, width: 22, height: 80 },              // right wall (-175 to -95)
      { x: 80, y: -195, width: 180 },                                      // exit ledge
    ],
    fish: [{ x: 195, y: -100 }, { x: 195, y: -160 }],
  },
  {
    // Single decisive vault: launch low on the right, big tall wall on
    // the left, exit high on the right. One well-timed wall jump
    // crosses the whole screen.
    id: 't2-vault', difficulty: 2,
    platforms: [
      { x: 220, y: -15, width: 110 },                                      // launch ledge (right)
      { x: 0, y: -100, width: 26, height: 110 },                           // big left wall (-155 to -45)
      { x: 220, y: -180, width: 110 },                                     // exit ledge (right, high)
    ],
    fish: [{ x: 100, y: -110 }],
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
  {
    // Three-bounce twin towers: tall walls on alternating sides, no
    // floor between them. Climb is purely a chain of three wall jumps.
    id: 't3-twin-towers', difficulty: 3,
    platforms: [
      { x: 130, y: -10, width: 130 },                                      // launch ledge
      { x: 0, y: -65, width: 20, height: 70 },                              // left wall #1 (-100 to -30)
      { x: GAME_WIDTH - 20, y: -110, width: 20, height: 70 },               // right wall #2 (-145 to -75)
      { x: 0, y: -155, width: 20, height: 60 },                             // left wall #3 (-185 to -125)
      { x: 110, y: -195, width: 140 },                                      // exit ledge
    ],
    fish: [{ x: GAME_WIDTH / 2, y: -80 }, { x: GAME_WIDTH / 2, y: -155 }],
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
  /** Pulsing chevron rendered next to the player on the wall side
   *  whenever a wall jump is available (cling, wall-coyote, or
   *  proximity). Points away from the wall — the direction the wall
   *  jump will pop the cat. Per user feedback (2026-04-09): "add a
   *  more clear visual cue when the player can wall jump." */
  private wallJumpCue!: Phaser.GameObjects.Triangle;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private fishGroup!: Phaser.Physics.Arcade.Group;

  // Game-feel state
  private lastGroundedTime = -Infinity;
  /** Most recent timestamp the player was confirmed clinging to a wall.
   *  Mirrors `lastGroundedTime` for ground coyote — gives the player a
   *  brief grace window to wall-jump after separating from the wall.
   *  Per todo/tech/Wall Jump Implementation Guide section 3: "if the
   *  player clung a moment ago and just separated from the wall, they
   *  still get a brief grace window to wall-jump." */
  private lastWallClingTime = -Infinity;
  /** Which side the player was last clinging to ('left' = wall on the
   *  cat's left, push them right; 'right' = wall on the right, push
   *  left). Used so a wall-coyote jump knows which direction to kick
   *  even though the contact is no longer touching. */
  private lastWallSide: 'left' | 'right' | null = null;
  /** Which side has a vertical surface within WALL_NEAR_PX this frame.
   *  Independent of `isWallClinging` (which requires actual contact) —
   *  this is the looser "proximity wall jump" that lets a tap fire a
   *  wall jump even if the player is hovering a few px away from the
   *  wall face. Recomputed every update tick. */
  private nearWallSide: 'left' | 'right' | null = null;
  private jumpBufferTime = -Infinity;
  private jumpBufferDirection: 'left' | 'right' = 'left';
  private isWallClinging = false;
  private prevVelocityY = 0;
  private leftHeld = false;
  private rightHeld = false;
  /** Tracks the last facing direction so we only swap the sprite texture
   *  when the direction actually changes — avoids re-setting the same
   *  texture 60 times per second. */
  private lastFacingDir: 'left' | 'right' = 'right';
  /** True if the playerVisual is a Sprite (not a Rectangle fallback). */
  private playerIsSprite = false;

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
        arcade: { gravity: { x: 0, y: PLAYER_GRAVITY_Y }, debug: false },
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
    this.nearWallSide = null;
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

    this.jumpVelocity = BASE_JUMP_VELOCITY - (agility - 5) * 8;
    // wall cling slows the fall further for agile cats
    this.wallFallCap = Math.max(20, WALL_FALL_CAP - (agility - 5) * 4);
    // hardier cats survive bigger plummets before resetting to a checkpoint
    this.fallForgiveness = GAME_HEIGHT * (0.55 + courage * 0.025);
    // Easy mode is "trivially easy" per user feedback (2026-04-09).
    // The player should basically not be able to fail. Stack of buffs:
    //   - jump velocity: extra -60 boost over the base
    //   - wall fall cap: 20 (slowest possible slide)
    //   - fall forgiveness: huge — the run-end check still fires for
    //     world-bottom catches but not from normal play
    //   - tier 1 chunks only (see pickTierForAnchor)
    //   - falls teleport back to the highest checkpoint instead of
    //     ending the run (see update())
    if (this.difficulty === 'easy') {
      this.jumpVelocity -= 60;
      this.wallFallCap = 20;
      this.fallForgiveness = GAME_HEIGHT * 4;
    }
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

    // Easy mode lowers world gravity from 1050 to 850 for longer hang
    // time and a more forgiving reaction window. This complements the
    // jump-velocity boost and the no-fall-death checkpoint teleport.
    if (this.difficulty === 'easy') {
      this.physics.world.gravity.y = 850;
    }

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
    // Body is narrower than the visual so the cat's "shoulders" don't
    // catch on platform edges — gives the player ~4px of slip-past
    // tolerance on each side so brushing a ledge doesn't kill the
    // jump.
    playerBody.setSize(PLAYER_BODY_W, PLAYER_H);
    playerBody.setOffset(PLAYER_BODY_OFFSET_X, 0);
    this.player.setCollideWorldBounds(true);
    this.player.setMaxVelocity(260, MAX_FALL_VELOCITY);
    this.player.setDragX(PLAYER_DRAG_X);

    // Use the breed's idle sprite if available; fall back to the
    // tan rectangle for breeds without pixel art.
    // Per user feedback (2026-04-10): "use left and right facing
    // sprites, depending on the direction of movement, and add and
    // use jump animations." Start with east-facing idle; update()
    // swaps the texture based on horizontal velocity.
    const idleKey = `${this.catBreed}_idle_east`;
    if (this.textures.exists(idleKey)) {
      const catSprite = this.add.sprite(GAME_WIDTH / 2, START_Y, idleKey);
      catSprite.setScale(1.2);
      catSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.playerVisual = catSprite as unknown as Phaser.GameObjects.Rectangle;
      this.playerIsSprite = true;
      this.lastFacingDir = 'right';
    } else {
      this.playerVisual = this.add.rectangle(GAME_WIDTH / 2, START_Y, PLAYER_W, PLAYER_H, 0xc4956a);
      this.playerVisual.setStrokeStyle(1, 0x6b4a28);
      this.playerIsSprite = false;
    }
    this.playerVisual.setDepth(10);

    // Wall-jump cue — a small chevron drawn next to the cat on the
    // side where a wall is available. Default geometry points right
    // (toward +x); we flip scaleX to point left when the wall is on
    // the right side. Hidden until needed.
    this.wallJumpCue = this.add.triangle(
      GAME_WIDTH / 2, START_Y,
      0, -8,
      14, 0,
      0, 8,
      0xfff8e0
    );
    this.wallJumpCue.setStrokeStyle(2, 0xc4956a);
    this.wallJumpCue.setDepth(11);
    this.wallJumpCue.setVisible(false);

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
    // Ground floor — a wide TALL platform under the spawn point so the
    // player can't fall off the world OR tunnel under it. Per user
    // feedback (2026-04-10): "I fell a long distance and fell under
    // the base platform and got stuck there." With max fall velocity
    // ~900 px/s and a 12-px-tall platform, a fast fall could tunnel
    // through in a single frame at 60fps. The base now extends from
    // just below the spawn down to the world bottom, giving infinite
    // collision depth so tunneling is physically impossible.
    const baseTop = START_Y + 24;
    const baseBottom = WORLD_HEIGHT;
    const baseCenter = (baseTop + baseBottom) / 2;
    const baseHeight = baseBottom - baseTop;
    this.makePlatform(GAME_WIDTH / 2, baseCenter, GAME_WIDTH, baseHeight);

    // Easy-mode side walls were removed 2026-04-09 per user feedback:
    // "modify the easy level of roof scout so it doesn't have walls
    // completely lining the sides of the stage, enabling more jump
    // through here." The full-height pillars added 2026-04-08 made
    // wall-jump tutoring easier but blocked the Pac-Man screen wrap on
    // every difficulty, making easy mode feel claustrophobic. The new
    // tier-2 wall-jump chunks (t2-walljump-zigzag, t2-vault) teach
    // wall jumps without sealing the sides, and the proximity wall
    // jump (v2.5.16) makes any vertical surface wall-jumpable. Easy
    // mode now uses the same open sides + screen wrap as medium/hard.

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

    // Final summit platform — the win zone. Uses the summit sprite if
    // available; falls back to a gold rectangle.
    if (this.textures.exists('roof_summit')) {
      const summitVis = this.add.sprite(GAME_WIDTH / 2, TARGET_Y + 20, 'roof_summit');
      summitVis.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      summitVis.setDisplaySize(200, 14);
      this.physics.add.existing(summitVis, true);
      this.platforms.add(summitVis);
    } else {
      this.makePlatform(GAME_WIDTH / 2, TARGET_Y + 20, 200, 14, 0xdda055);
    }
    this.add.text(GAME_WIDTH / 2, TARGET_Y - 10, 'WATCHPOINT', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#dda055',
    }).setOrigin(0.5);
  }

  /** Difficulty tier ramps from 1 (bottom of climb) to 3 (near summit).
   *  Easy mode is "trivially easy" per user feedback (2026-04-09): the
   *  whole climb is tier-1 stairs / wide ledges. Medium splits roughly
   *  thirds; hard ramps faster. */
  private pickTierForAnchor(anchorY: number): 1 | 2 | 3 {
    if (this.difficulty === 'easy') {
      // Tier 1 the entire way up — wide ledges, no wall-cling pressure,
      // no tier-3 chimney/spike chunks. Easy mode is the "no fail"
      // tutorial climb.
      return 1;
    }
    const climbProgress = 1 - (anchorY - TARGET_Y) / (START_Y - TARGET_Y);
    // hard runs ramp faster; medium splits roughly thirds
    const offset = this.difficulty === 'hard' ? 0.15 : 0;
    const t = climbProgress + offset;
    if (t < 0.35) return 1;
    if (t < 0.7) return 2;
    return 3;
  }

  private placeChunk(chunk: ChunkDef, anchorY: number): void {
    for (const p of chunk.platforms) {
      const px = p.x + p.width / 2;
      const py = anchorY + p.y;
      const ph = p.height ?? 12;
      // Tall walls (height >> 12) get a slightly cooler tone so the
      // player visually distinguishes "wall to bounce off" from "ledge
      // to land on" at a glance.
      const isWall = ph >= 30;
      const color = isWall ? 0x4a5060 : 0x6b5b3e;
      this.makePlatform(px, py, p.width, ph, color);
    }
    if (chunk.fish) {
      for (const f of chunk.fish) {
        this.makeFish(f.x, anchorY + f.y);
      }
    }
  }

  private makePlatform(cx: number, cy: number, width: number, height = 12, color = 0x6b5b3e): void {
    const isWall = height >= 30;
    const textureKey = isWall ? 'roof_wall' : 'roof_ledge';
    let visual: Phaser.GameObjects.GameObject;
    if (this.textures.exists(textureKey)) {
      // Tile the sprite across the platform's full width/height.
      // TileSprite repeats the 32x32 texture to fill the rect.
      const ts = this.add.tileSprite(cx, cy, width, height, textureKey);
      ts.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      visual = ts;
    } else {
      const rect = this.add.rectangle(cx, cy, width, height, color);
      rect.setStrokeStyle(1, 0x3a2f24);
      visual = rect;
    }
    this.physics.add.existing(visual, true); // static body
    this.platforms.add(visual);
  }

  private makeFish(cx: number, cy: number): void {
    let fish: Phaser.GameObjects.GameObject;
    if (this.textures.exists('fish_sprite')) {
      const spr = this.add.sprite(cx, cy, 'fish_sprite');
      spr.setScale(0.5);
      spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      fish = spr;
    } else {
      const rect = this.add.rectangle(cx, cy, 12, 8, 0xdda055);
      rect.setStrokeStyle(1, 0x8b6a32);
      fish = rect;
    }
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

    // Corner correction. Per user feedback (2026-04-08): "if I'm still
    // moving up across the edge of a platform, once I clear the
    // vertical height of the platform, I feel like I should move onto
    // it." When the player is brushing the side of a platform while
    // moving upward AND their head is just barely below the platform
    // top, snap them up so the lean velocity carries them onto it.
    // Without this, jumps that almost-but-not-quite clear a ledge
    // stall horizontally and the cat falls back down past the edge.
    const wallTouchLeft = body.blocked.left || body.touching.left;
    const wallTouchRight = body.blocked.right || body.touching.right;
    if ((wallTouchLeft || wallTouchRight) && body.velocity.y < 0) {
      const playerTop = this.player.y - PLAYER_H / 2;
      const platforms = this.platforms.getChildren();
      for (const p of platforms) {
        const plat = p as Phaser.GameObjects.Rectangle;
        const platBody = plat.body as Phaser.Physics.Arcade.StaticBody | null;
        if (!platBody) continue;
        const platTop = platBody.y;
        const horizClose = Math.abs(this.player.x - plat.x) < (PLAYER_W + plat.width) / 2 + 4;
        const verticalGap = platTop - playerTop; // positive when player head is below the platform top
        if (horizClose && verticalGap > 0 && verticalGap < CORNER_GRACE_PX) {
          // Snap the player to sit on top of this platform; preserve
          // horizontal velocity so the lean naturally carries them
          // onto the surface.
          this.player.setY(platTop - PLAYER_H / 2);
          this.player.setVelocityY(0);
          break;
        }
      }
    }

    // Sync the colored visual to the physics body each frame.
    this.playerVisual.setPosition(this.player.x, this.player.y);

    // Direction-based sprite swapping + jump pose. Only runs when
    // the playerVisual is a Sprite (not the rectangle fallback).
    if (this.playerIsSprite) {
      const spr = this.playerVisual as unknown as Phaser.GameObjects.Sprite;
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const grounded = body.blocked.down || body.touching.down;
      // Determine facing direction from horizontal velocity
      const newDir: 'left' | 'right' = vx < -10 ? 'left' : vx > 10 ? 'right' : this.lastFacingDir;
      const dirKey = newDir === 'left' ? 'west' : 'east';

      if (!grounded) {
        // Airborne — use a walk frame as the "jump" pose. Walk
        // frame 2 (mid-stride) reads as a leaping silhouette.
        const jumpKey = `${this.catBreed}_walk_${dirKey}_2`;
        if (this.textures.exists(jumpKey) && spr.texture.key !== jumpKey) {
          spr.setTexture(jumpKey);
          spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      } else {
        // Grounded — use the idle sprite for the current direction
        const idleKey = `${this.catBreed}_idle_${dirKey}`;
        if (this.textures.exists(idleKey) && spr.texture.key !== idleKey) {
          spr.setTexture(idleKey);
          spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      }
      this.lastFacingDir = newDir;
    }

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

    // Wall cling — if airborne and pressing into a wall, register as
    // clinging so attemptJump's canJump check passes and the player
    // can wall-jump. The previous version required velocity.y >= 0
    // (i.e. falling or stationary) which meant a still-ascending cat
    // brushing a platform side couldn't wall-jump until it peaked and
    // started falling. Per user feedback (2026-04-08): "if my right
    // side is touching the left side of a platform, I should be able
    // to click left jump to jump up and left." Removing the velocity
    // gate makes wall-jumps responsive on contact, not on apex.
    const touchingLeft = body.blocked.left || body.touching.left;
    const touchingRight = body.blocked.right || body.touching.right;
    this.isWallClinging = (touchingLeft || touchingRight) && !onGround;
    if (this.isWallClinging) {
      // Record the cling moment so wall-coyote can fire a wall-jump
      // for a few frames after the player separates from the wall.
      // Per the wall-jump implementation guide: "if the player clung
      // a moment ago and just separated from the wall, they still
      // get a brief grace window to wall-jump."
      this.lastWallClingTime = time;
      this.lastWallSide = touchingLeft ? 'left' : 'right';

      // Consume any buffered jump on first wall contact — the
      // critical fix from todo/tech/Wall Jump Advice.md #1. The
      // existing buffer-consume block only ran on `onGround`, so a
      // tap that landed a half-frame before isWallClinging flipped
      // true got buffered and then expired silently. On touch this
      // timing gap is very easy to hit and was the main reason
      // players felt "I'm on a wall but can't jump."
      if (time - this.jumpBufferTime < JUMP_BUFFER_MS) {
        this.doJump(this.jumpBufferDirection);
        this.jumpBufferTime = -Infinity;
      }
    }

    // Proximity wall detection — looser than `isWallClinging`, which
    // requires actual contact. Per user feedback (2026-04-09): "any
    // time I'm next to a vertical surface I should be able to tap to
    // jump off it." Scan platforms for any whose vertical reach
    // overlaps the player and whose face is within WALL_NEAR_PX of
    // the player's body. Doesn't need the cat to be airborne —
    // proximity alone is enough to authorize a wall jump on next tap.
    //
    // Vertical reach is widened past the platform's actual top/bottom
    // by WALL_VERTICAL_REACH (20px) so the player can still wall-jump
    // off a normal 12px-tall ledge while passing it on a fall. Per
    // user feedback (2026-04-10): "if I am falling straight down and
    // cross a surface, such as the edge of a platform, let me wall
    // jump off of it." A fast straight-down fall only spends ~2-3
    // frames in the actual band of a thin ledge — extending the
    // reach gives a forgiving window above and below each ledge so
    // the proximity check fires for several frames as the player
    // passes by.
    const WALL_VERTICAL_REACH = 20;
    this.nearWallSide = null;
    if (!onGround) {
      const playerLeft = this.player.x - PLAYER_BODY_W / 2;
      const playerRight = this.player.x + PLAYER_BODY_W / 2;
      const playerTop = this.player.y - PLAYER_H / 2;
      const playerBottom = this.player.y + PLAYER_H / 2;
      const platformsForNear = this.platforms.getChildren();
      let nearLeftDist = Infinity;
      let nearRightDist = Infinity;
      for (const p of platformsForNear) {
        const plat = p as Phaser.GameObjects.Rectangle;
        const platBody = plat.body as Phaser.Physics.Arcade.StaticBody | null;
        if (!platBody) continue;
        const platLeft = plat.x - plat.width / 2;
        const platRight = plat.x + plat.width / 2;
        const platTop = platBody.y - WALL_VERTICAL_REACH;
        const platBottom = platBody.y + platBody.height + WALL_VERTICAL_REACH;
        // Vertical reach must overlap (share at least 1px of height)
        // for the wall to count as "next to" the player. The reach is
        // wider than the actual platform band so falling-past-edge
        // wall jumps trigger reliably.
        const verticalOverlap = playerBottom > platTop && playerTop < platBottom;
        if (!verticalOverlap) continue;
        // Distance from player's right edge to the platform's left face
        // (wall is on the right of the player).
        const distRight = platLeft - playerRight;
        if (distRight >= 0 && distRight <= WALL_NEAR_PX && distRight < nearRightDist) {
          nearRightDist = distRight;
        }
        // Distance from the platform's right face to the player's left
        // edge (wall is on the left of the player).
        const distLeft = playerLeft - platRight;
        if (distLeft >= 0 && distLeft <= WALL_NEAR_PX && distLeft < nearLeftDist) {
          nearLeftDist = distLeft;
        }
      }
      if (nearLeftDist < Infinity || nearRightDist < Infinity) {
        // Pick the closer side. Ties go to the side opposite the
        // current movement, which feels more natural for chained
        // wall jumps.
        this.nearWallSide = nearLeftDist <= nearRightDist ? 'left' : 'right';
      }
    }

    // Slow the fall only when actually descending — clinging while
    // ascending shouldn't drag the player to a stop.
    if (this.isWallClinging && body.velocity.y > this.wallFallCap) {
      this.player.setVelocityY(this.wallFallCap);
    }

    // Visual cling indicator — flip the player rectangle to a brighter
    // shade when clinging so the player can see "I'm latched on, I can
    // jump again." The guide's section 6 calls this out as a future
    // improvement; doing the simple version now (no sprite atlas yet).
    if ('setFillStyle' in this.playerVisual) {
      (this.playerVisual as Phaser.GameObjects.Rectangle).setFillStyle(this.isWallClinging ? 0xddc878 : 0xc4956a);
    } else if (this.isWallClinging) {
      (this.playerVisual as unknown as Phaser.GameObjects.Sprite).setTint(0xddc878);
    } else {
      (this.playerVisual as unknown as Phaser.GameObjects.Sprite).clearTint();
    }

    // Wall-jump cue — pulsing chevron next to the cat on the wall
    // side. Visible whenever a wall jump is currently authorized
    // (proximity, contact cling, or wall-coyote). Points away from
    // the wall = the direction the cat will pop. Per user feedback
    // (2026-04-09): "add a more clear visual cue when the player can
    // wall jump."
    const wallCoyoteForCue = (time - this.lastWallClingTime) < WALL_COYOTE_MS;
    const cueSide = this.nearWallSide
      ?? (this.isWallClinging ? this.lastWallSide : null)
      ?? (wallCoyoteForCue ? this.lastWallSide : null);
    if (cueSide && !onGround) {
      const offsetX = cueSide === 'left' ? -(PLAYER_W / 2 + 10) : (PLAYER_W / 2 + 10);
      this.wallJumpCue.setPosition(this.player.x + offsetX, this.player.y);
      // Default geometry points right; flip when wall is on the right
      // so the chevron always points AWAY from the wall.
      this.wallJumpCue.setScale(cueSide === 'right' ? -1 : 1, 1);
      // Pulse alpha to draw the eye. Sin wave on time gives a smooth
      // 0.55..0.95 oscillation roughly twice per second.
      this.wallJumpCue.setAlpha(0.55 + 0.4 * Math.abs(Math.sin(time * 0.012)));
      this.wallJumpCue.setVisible(true);
    } else {
      this.wallJumpCue.setVisible(false);
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
      if (onGround) {
        if (this.lastCheckpointY !== this.player.y) playSfx('sparkle', 0.1);
        this.lastCheckpointY = this.player.y;
      }
    }

    // Out-of-bounds fall — drop a meaningful distance below the highest
    // checkpoint and the run ends. Endurance widens this window. On
    // easy mode the run NEVER ends from a fall — instead the cat is
    // teleported back to the last checkpoint with a brief screen flash
    // and a velocity reset, so the player can keep climbing without
    // any actual fail state. Per user feedback (2026-04-09): "make the
    // easy roof scout level trivially easy."
    if (this.player.y > this.lastCheckpointY + this.fallForgiveness) {
      if (this.difficulty === 'easy') {
        this.respawnAtCheckpoint();
      } else {
        this.endRun(false);
        return;
      }
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
    // Wall coyote — own constant (180ms vs ground's 120ms) per the
    // wall-jump advice doc. Touch event delivery + body friction
    // resolution can land in different frames on Android, so the
    // wall window needs to be a bit looser than ground.
    const wallCoyoteOk = (this.time.now - this.lastWallClingTime) < WALL_COYOTE_MS;
    // Proximity wall jump — any frame where a vertical surface is
    // within WALL_NEAR_PX of the player counts as wall-jumpable, even
    // without contact. Per user feedback (2026-04-09).
    const nearWall = this.nearWallSide !== null && !onGround;
    const canJump = onGround || coyoteOk || this.isWallClinging || wallCoyoteOk || nearWall;

    if (canJump) {
      this.doJump(direction);
      // Consume both coyote windows so a single jump can't fire twice
      this.lastGroundedTime = -Infinity;
      this.lastWallClingTime = -Infinity;
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

    // Wall-jump branch fires when the player is currently clinging, when
    // wall coyote is active (recently separated from a wall), OR when a
    // vertical surface is within WALL_NEAR_PX (the proximity wall jump).
    // The wall-coyote and proximity cases may have no current contact,
    // so we use the remembered lastWallSide / current nearWallSide to
    // decide which direction to kick.
    const wallCoyoteActive = (this.time.now - this.lastWallClingTime) < WALL_COYOTE_MS;
    const nearWallActive = this.nearWallSide !== null;
    if (!onGround && (this.isWallClinging || wallCoyoteActive || nearWallActive)) {
      // Determine which side the wall is on. Prefer current contact;
      // fall back to lastWallSide for the wall-coyote case; finally
      // fall back to nearWallSide for the proximity case.
      const wallOnRight = wallRight || this.lastWallSide === 'right' || this.nearWallSide === 'right';
      const wallOnLeft = wallLeft || this.lastWallSide === 'left' || this.nearWallSide === 'left';
      const pushDir = wallOnRight ? -1 : wallOnLeft ? 1 : (direction === 'left' ? -1 : 1);
      // Wall jumps get a slightly stronger upward kick than ground
      // jumps so the bounce-off-the-wall arc clearly clears the next
      // platform. The +60 boost makes the wall-jump motion read as a
      // distinct "powerful spring off the wall" rather than a quieter
      // version of a ground hop.
      this.player.setVelocityY(this.jumpVelocity - 60);
      this.player.setVelocityX(pushDir * WALL_KICK_X);
      this.isWallClinging = false;
      this.lastWallClingTime = -Infinity;
      this.lastWallSide = null;
      this.nearWallSide = null;
      if (this.wallJumpCue) this.wallJumpCue.setVisible(false);
      // Wall-jump pop — small camera shake + brighter player flash
      // so the player feels the bounce. Pure juice; no gameplay
      // effect, just makes the wall jump satisfying to chain.
      this.cameras.main.shake(80, 0.005);
      if ('setFillStyle' in this.playerVisual) {
        (this.playerVisual as Phaser.GameObjects.Rectangle).setFillStyle(0xfff8e0);
      } else {
        (this.playerVisual as unknown as Phaser.GameObjects.Sprite).setTint(0xfff8e0);
      }
      this.time.delayedCall(120, () => {
        if (!this.playerVisual) return;
        if ('setFillStyle' in this.playerVisual) {
          (this.playerVisual as Phaser.GameObjects.Rectangle).setFillStyle(0xc4956a);
        } else {
          (this.playerVisual as unknown as Phaser.GameObjects.Sprite).clearTint();
        }
      });
      playSfx('block_slide', 0.18);
      haptic.medium();
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

  // ── Easy-mode safety net ──

  /** Easy-mode "no fail" respawn. Teleports the cat back to the
   *  highest checkpoint reached, zeroes velocity, briefly flashes the
   *  screen + camera. Used in place of endRun(false) on easy mode so
   *  the player can keep climbing without any actual fail state.
   *  Per user feedback (2026-04-09): "make the easy roof scout level
   *  trivially easy." */
  private respawnAtCheckpoint(): void {
    if (this.finished) return;
    this.player.setX(GAME_WIDTH / 2);
    this.player.setY(this.lastCheckpointY - PLAYER_H);
    this.player.setVelocity(0, 0);
    this.cameras.main.flash(180, 60, 60, 80);
    this.cameras.main.shake(120, 0.004);
    haptic.tap();
    playSfx('crate_push', 0.18);
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
