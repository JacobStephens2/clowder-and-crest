import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { showMinigameTutorial, showSceneOutcomeBanner } from '../ui/sceneHelpers';

// ── Maze constants ──
const COLS = 13;
const ROWS = 13;
const CELL = 28;
const MAZE_W = COLS * CELL;
const MAZE_H = ROWS * CELL;
const MAZE_X = (GAME_WIDTH - MAZE_W) / 2;
const MAZE_Y = 100;

// Cell types
const WALL = 1;
const FLOOR = 0;

// Colors
const WALL_COLOR = 0x2a2520;
const FLOOR_COLOR = 0x1c1b19;
const DOT_COLOR = 0xdda055;
const RAT_COLOR = 0x8a5a4a;

// Directions
const DIRS = [
  { dr: -1, dc: 0, name: 'north' },
  { dr: 1, dc: 0, name: 'south' },
  { dr: 0, dc: -1, name: 'west' },
  { dr: 0, dc: 1, name: 'east' },
];

// ── Maze generation (recursive backtracker on odd cells) ──
function generateMaze(): number[][] {
  const grid: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = WALL;
    }
  }

  const visited = new Set<string>();
  const stack: { r: number; c: number }[] = [];
  const start = { r: 1, c: 1 };
  grid[start.r][start.c] = FLOOR;
  visited.add(`${start.r},${start.c}`);
  stack.push(start);

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: { r: number; c: number; wr: number; wc: number }[] = [];

    for (const { dr, dc } of DIRS) {
      const nr = current.r + dr * 2;
      const nc = current.c + dc * 2;
      if (nr > 0 && nr < ROWS - 1 && nc > 0 && nc < COLS - 1 && !visited.has(`${nr},${nc}`)) {
        neighbors.push({ r: nr, c: nc, wr: current.r + dr, wc: current.c + dc });
      }
    }

    if (neighbors.length === 0) {
      stack.pop();
    } else {
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      grid[next.wr][next.wc] = FLOOR;
      grid[next.r][next.c] = FLOOR;
      visited.add(`${next.r},${next.c}`);
      stack.push({ r: next.r, c: next.c });
    }
  }

  // Open extra passages aggressively to create multiple paths
  // This ensures the player can always find an alternate route around the dog
  let opened = 0;
  const candidates: { r: number; c: number }[] = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] === WALL) {
        const adjFloors = DIRS.filter(({ dr, dc }) => {
          const nr = r + dr;
          const nc = c + dc;
          return nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc] === FLOOR;
        });
        if (adjFloors.length >= 2) {
          candidates.push({ r, c });
        }
      }
    }
  }
  // Shuffle and open ~30% of candidates to create many alternate routes
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const toOpen = Math.max(12, Math.floor(candidates.length * 0.3));
  for (let i = 0; i < Math.min(toOpen, candidates.length); i++) {
    grid[candidates[i].r][candidates[i].c] = FLOOR;
    opened++;
  }

  return grid;
}

// ── Place dots on floor tiles ──
function placeDots(grid: number[][], exclude: Set<string>): { r: number; c: number }[] {
  const dots: { r: number; c: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === FLOOR && !exclude.has(`${r},${c}`) && Math.random() < 0.25) {
        dots.push({ r, c });
      }
    }
  }
  return dots;
}

// ── Simple rat AI: move away from cat, prefer paths with more exits ──
function ratMove(grid: number[][], ratR: number, ratC: number, catR: number, catC: number): { dr: number; dc: number } {
  const options: { dr: number; dc: number; score: number }[] = [];

  for (const { dr, dc } of DIRS) {
    const nr = ratR + dr;
    const nc = ratC + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] === WALL) continue;

    // Distance from cat (higher = better for rat)
    const distFromCat = Math.abs(nr - catR) + Math.abs(nc - catC);
    // Count exits from new position (more = better escape routes)
    let exits = 0;
    for (const d2 of DIRS) {
      const nr2 = nr + d2.dr;
      const nc2 = nc + d2.dc;
      if (nr2 >= 0 && nr2 < ROWS && nc2 >= 0 && nc2 < COLS && grid[nr2][nc2] === FLOOR) exits++;
    }
    options.push({ dr, dc, score: distFromCat * 2 + exits + Math.random() * 3 });
  }

  if (options.length === 0) return { dr: 0, dc: 0 };
  options.sort((a, b) => b.score - a.score);

  // Sometimes pick suboptimal to be catchable
  const pick = Math.random() < 0.3 && options.length > 1 ? 1 : 0;
  return options[pick];
}

// ── Dog archetypes ──
// Per "What Makes Maze-Chase Arcade Games Great" pillar 1: distinct enemy
// behaviours, not stat inflation. Each archetype targets a different tile,
// forcing the player to think about each dog separately rather than running
// from "the dogs" as a collective.
type DogArchetype = 'tracker' | 'ambusher';

interface Dog {
  pos: { r: number; c: number };
  gfx: Phaser.GameObjects.GameObject & { x: number; y: number; setPosition: (x: number, y: number) => void };
  alertIcon: Phaser.GameObjects.Text | null;
  /** Per-dog state: patrol (random) → alert (sightline) → chase (close) */
  state: 'patrol' | 'alert' | 'chase';
  archetype: DogArchetype;
  /** Display name shown on death/feedback */
  displayName: string;
  /** Tint color used in the alert icon */
  alertColor: string;
}

// ══════════════════════════════════════
export class ChaseScene extends Phaser.Scene {
  private grid: number[][] = [];
  private catPos = { r: 1, c: 1 };
  /** Direction the cat was last moving in. Ambusher dogs target a tile 4
      steps ahead in this direction (Pinky-style). */
  private catLastDir = { dr: 0, dc: 1 };
  private ratPos = { r: 11, c: 11 };
  private dots: { r: number; c: number; gfx: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite }[] = [];
  private dotsCollected = 0;
  private totalDots = 0;
  private catSprite: Phaser.GameObjects.Sprite | null = null;
  private catFallback: Phaser.GameObjects.Arc | null = null;
  private ratGfx!: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite;
  private ratEyes!: Phaser.GameObjects.Graphics;
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private caught = false;
  private moveTimer: Phaser.Time.TimerEvent | null = null;
  private ratTimer: Phaser.Time.TimerEvent | null = null;
  private dogTimer: Phaser.Time.TimerEvent | null = null;
  /** All active dogs. Easy difficulty has 1 (tracker only); medium and hard
      have 2 (tracker + ambusher). */
  private dogs: Dog[] = [];
  private dogStunned = false;
  /** When > 0, all dogs are "scared" after a catnip pellet: they flee the
      cat and can be touched for escalating bonus fish. */
  private dogScaredUntil = 0;
  /** Number of scared dogs already eaten in the current catnip window.
      Pac-Man-style: each subsequent eat doubles the previous reward. */
  private scaredEatenThisWindow = 0;
  /** Power pellet positions still on the board */
  private catnipPellets: { r: number; c: number; gfx: Phaser.GameObjects.GameObject }[] = [];
  // Combo state — encourages chaining dot collection for bonus fish
  private comboCount = 0;
  private comboLastMs = 0;
  private comboText: Phaser.GameObjects.Text | null = null;
  private comboMaxBonus = 0; // tracked for scoring
  private moveCount = 0;
  private timeLeft = 60;
  private timerText!: Phaser.GameObjects.Text;
  private dotText!: Phaser.GameObjects.Text;
  private difficulty = 'easy';

  constructor() {
    super({ key: 'ChaseScene' });
  }

  init(data: { difficulty?: string; jobId?: string; catId?: string }): void {
    this.difficulty = data.difficulty ?? 'easy';
    this.jobId = data.jobId ?? '';
    this.catId = data.catId ?? '';
    const save = getGameState();
    const cat = save?.cats.find((c) => c.id === this.catId);
    this.catBreed = cat?.breed ?? 'wildcat';
    this.caught = false;
    this.moveCount = 0;
    this.dotsCollected = 0;
    // Per-round state — Phaser scenes are reused across restarts (the
    // constructor only runs once), so any field carrying objects from the
    // previous round must be cleared here or it'll point at destroyed
    // GameObjects when the next round's create() runs.
    this.dogs = [];
    this.dots = [];
    this.catnipPellets = [];
    this.dogScaredUntil = 0;
    this.scaredEatenThisWindow = 0;
    this.comboCount = 0;
    this.comboMaxBonus = 0;
    this.comboLastMs = 0;
    this.comboText = null;
    this.dogStunned = false;
    this.catLastDir = { dr: 0, dc: 1 };
    // Base time + bonus from cat's hunting stat
    const huntingBonus = cat ? Math.floor(cat.stats.hunting * 1.5) : 0;
    this.timeLeft = (this.difficulty === 'hard' ? 45 : this.difficulty === 'medium' ? 55 : 60) + huntingBonus;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0908');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial on first play — pause scene until dismissed.
    //
    // Deliberately minimal per todo/game/What Makes Games Fun.md (Koster):
    // explaining patterns up-front robs the player of the discovery dopamine.
    // Fish dots, catnip, and the two dog archetypes are all visually obvious
    // after a few seconds of play — leave them to be discovered. Only the
    // controls need explanation because they're not derivable from looking.
    //
    // Bumped to v4 when the tutorial was cut from 5 explained mechanics
    // down to 1, so returning players see the new shorter version.
    showMinigameTutorial(
      this,
      'clowder_chase_tutorial_v4',
      'Chase the Rat!',
      `Catch the rat before time runs out.<br><br>
      Move with the <strong>joystick</strong>, <strong>swipe</strong>, or <strong>WASD/arrows</strong>.`,
      undefined,
      { pauseScene: true },
    );

    // Generate maze
    this.grid = generateMaze();

    // Place cat and rat
    this.catPos = { r: 1, c: 1 };
    // Find far corner for rat
    for (let r = ROWS - 2; r >= 1; r--) {
      for (let c = COLS - 2; c >= 1; c--) {
        if (this.grid[r][c] === FLOOR) {
          this.ratPos = { r, c };
          r = 0; break;
        }
      }
    }

    // Job name
    const job = getJob(this.jobId);
    if (job) {
      this.add.text(GAME_WIDTH / 2, 30, `${job.name} (${this.difficulty})`, {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
      }).setOrigin(0.5);
    }

    const gameSave = getGameState();
    const huntStat = gameSave?.cats.find((c: any) => c.id === this.catId)?.stats.hunting ?? 0;
    const bonusText = huntStat >= 5 ? ` (+${Math.floor(huntStat * 1.5)}s from Hunting)` : '';
    this.add.text(GAME_WIDTH / 2, 48, `Catch the rat!${bonusText}`, {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // Draw maze
    this.drawMaze();

    // Place dots (fish)
    const exclude = new Set([`${this.catPos.r},${this.catPos.c}`, `${this.ratPos.r},${this.ratPos.c}`]);
    const dotPositions = placeDots(this.grid, exclude);
    this.dots = [];
    for (const d of dotPositions) {
      const { x, y } = this.cellToWorld(d.r, d.c);
      let gfx: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite;
      if (this.textures.exists('fish_sprite')) {
        const fish = this.add.sprite(x, y, 'fish_sprite');
        fish.setScale(0.35);
        fish.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        fish.setAlpha(0.7);
        gfx = fish;
      } else {
        gfx = this.add.circle(x, y, 3, DOT_COLOR, 0.6);
      }
      this.dots.push({ r: d.r, c: d.c, gfx });
    }
    this.totalDots = this.dots.length;

    // Power catnip pellets — Pac-Man style power-up that flips the hunter/hunted
    // dynamic. Collecting one scares the dog for ~6s: the dog flees the cat and
    // can be touched for bonus fish (like Pac-Man eating ghosts). Placed far from
    // the cat's start to reward exploration.
    const pelletCount = this.difficulty === 'hard' ? 1 : this.difficulty === 'medium' ? 2 : 2;
    const usedDotPositions = new Set(dotPositions.map((d) => `${d.r},${d.c}`));
    const pelletCandidates: { r: number; c: number; dist: number }[] = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (this.grid[r][c] !== FLOOR) continue;
        if (usedDotPositions.has(`${r},${c}`)) continue;
        const dist = Math.abs(r - this.catPos.r) + Math.abs(c - this.catPos.c);
        if (dist < 5) continue; // require exploration
        pelletCandidates.push({ r, c, dist });
      }
    }
    pelletCandidates.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(pelletCount, pelletCandidates.length); i++) {
      const { r, c } = pelletCandidates[i];
      const { x, y } = this.cellToWorld(r, c);
      // Larger, pulsing green pellet — visually distinct from fish dots
      const pellet = this.add.circle(x, y, 8, 0x6abe3f, 0.95).setStrokeStyle(2, 0x9bdf6b);
      this.tweens.add({
        targets: pellet,
        scaleX: 1.35, scaleY: 1.35, alpha: 0.75,
        duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.catnipPellets.push({ r, c, gfx: pellet });
    }

    // Draw rat
    const ratWorld = this.cellToWorld(this.ratPos.r, this.ratPos.c);
    if (this.textures.exists('rat')) {
      const ratSprite = this.add.sprite(ratWorld.x, ratWorld.y, 'rat');
      ratSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      ratSprite.setScale(0.85);
      this.ratGfx = ratSprite;
    } else {
      this.ratGfx = this.add.circle(ratWorld.x, ratWorld.y, CELL / 2 - 3, RAT_COLOR);
    }
    this.ratEyes = this.add.graphics();
    if (!this.textures.exists('rat')) this.drawRatEyes(ratWorld.x, ratWorld.y);

    // Draw cat
    this.createCatSprite();

    // HUD
    this.timerText = this.add.text(GAME_WIDTH / 2, 68, `Time: ${this.timeLeft}s`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.dotText = this.add.text(GAME_WIDTH / 2, 86, `Fish: 0/${this.totalDots}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#dda055',
    }).setOrigin(0.5);

    // Quit button (top-left, out of the way of d-pad)
    this.createButton(60, MAZE_Y + MAZE_H + 30, 'Quit', () => {
      this.cleanup();
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Input: WASD / Arrow keys with hold-to-repeat
    let keyHoldTimer: Phaser.Time.TimerEvent | null = null;
    let heldKey: string | null = null;
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.caught) return;
      const dir = this.keyToDir(event.key);
      if (!dir) return;
      this.moveCat(dir.dr, dir.dc);
      if (heldKey !== event.key) {
        heldKey = event.key;
        keyHoldTimer?.destroy();
        keyHoldTimer = this.time.addEvent({
          delay: 150,
          callback: () => {
            if (this.caught) return;
            const d = this.keyToDir(heldKey!);
            if (d) this.moveCat(d.dr, d.dc);
          },
          loop: true,
        });
      }
    });
    this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      if (event.key === heldKey) {
        heldKey = null;
        keyHoldTimer?.destroy();
        keyHoldTimer = null;
      }
    });

    // Virtual joystick for mobile — *floating* style. Touch anywhere in the
    // control region (below the maze) and the joystick center snaps to your
    // thumb. This fixes the "up is hard" complaint: with a fixed-center
    // bottom-mounted joystick, pushing up requires extending the thumb over
    // the maze (occluding what you're trying to see) and the 54px touch
    // capture zone forces the thumb to a specific spot. Floating means the
    // thumb rests wherever feels natural and the joystick comes to it.
    this.input.addPointer(1);
    const JOY_HOME_X = GAME_WIDTH / 2;
    const JOY_HOME_Y = MAZE_Y + MAZE_H + 70;
    const joyRadius = 36;
    let joyX = JOY_HOME_X;
    let joyY = JOY_HOME_Y;
    const joyBase = this.add.circle(joyX, joyY, joyRadius, 0x2a2520, 0.6).setStrokeStyle(1, 0x6b5b3e);
    const joyKnob = this.add.circle(joyX, joyY, 14, 0x6b5b3e, 0.8);

    // Unified pointer handling — single pointerdown/pointerup pair covers both
    // the floating joystick and the in-maze swipe gestures. Previously split
    // into two pairs which is an anti-pattern per phaserjs/examples.
    let joyPointerId = -1;
    let joyMoveTimer: Phaser.Time.TimerEvent | null = null;
    let swipeStart: { x: number; y: number } | null = null;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const wx = pointer.worldX;
      const wy = pointer.worldY;
      // Floating joystick: any touch BELOW the maze relocates the joystick
      // center to the touch point and captures the pointer.
      if (wy > MAZE_Y + MAZE_H) {
        joyX = wx;
        joyY = wy;
        joyBase.setPosition(joyX, joyY);
        joyKnob.setPosition(joyX, joyY);
        joyPointerId = pointer.id;
        return;
      }
      // Otherwise, record swipe start if inside the maze
      if (wy >= MAZE_Y && wy <= MAZE_Y + MAZE_H) {
        swipeStart = { x: wx, y: wy };
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // Joystick release — snap base and knob back to the resting home position
      // so the player has a visual hint of where the joystick "lives" between
      // touches.
      if (pointer.id === joyPointerId) {
        joyPointerId = -1;
        joyX = JOY_HOME_X;
        joyY = JOY_HOME_Y;
        joyBase.setPosition(JOY_HOME_X, JOY_HOME_Y);
        joyKnob.setPosition(JOY_HOME_X, JOY_HOME_Y);
        joyMoveTimer?.destroy();
        joyMoveTimer = null;
        return;
      }
      // Swipe release
      if (this.caught || !swipeStart) return;
      const dx = pointer.worldX - swipeStart.x;
      const dy = pointer.worldY - swipeStart.y;
      const dist = Math.hypot(dx, dy);
      swipeStart = null;
      if (dist < 15) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.moveCat(0, dx > 0 ? 1 : -1);
      } else {
        this.moveCat(dy > 0 ? 1 : -1, 0);
      }
    });

    // Poll joystick for grid-based movement (early-returns when idle)
    this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        if (joyPointerId < 0 || this.caught) return;
        const pointers = [this.input.pointer1, this.input.pointer2];
        for (const p of pointers) {
          if (p && p.id === joyPointerId && p.isDown) {
            const dx = p.worldX - joyX;
            const dy = p.worldY - joyY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const clampDist = Math.min(dist, joyRadius);
            if (dist > 8) {
              joyKnob.setPosition(joyX + (dx / dist) * clampDist, joyY + (dy / dist) * clampDist);
              if (!joyMoveTimer) {
                const dr = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 1 : -1) : 0;
                const dc = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0;
                this.moveCat(dr, dc);
                joyMoveTimer = this.time.delayedCall(150, () => { joyMoveTimer = null; });
              }
            } else {
              joyKnob.setPosition(joyX, joyY);
            }
            break;
          }
        }
      },
    });

    // Rat movement timer
    const ratSpeed = this.difficulty === 'hard' ? 350 : this.difficulty === 'medium' ? 450 : 550;
    this.ratTimer = this.time.addEvent({
      delay: ratSpeed,
      callback: () => this.moveRat(),
      loop: true,
    });

    // Countdown timer
    this.moveTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.caught) return;
        this.timeLeft--;
        this.timerText.setText(`Time: ${this.timeLeft}s`);
        if (this.timeLeft <= 0) {
          this.timeUp();
        }
      },
      loop: true,
    });

    // Guard dog pack — patrols the maze, costs the round if any dog catches you
    this.createDogs();
    const dogSpeed = this.difficulty === 'hard' ? 400 : this.difficulty === 'medium' ? 500 : 700;
    this.dogTimer = this.time.addEvent({
      delay: dogSpeed,
      callback: () => this.moveDogs(),
      loop: true,
    });

    // Clean up on scene stop (prevent timer/tween memory leaks)
    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.input.keyboard?.removeAllListeners();
    });
    eventBus.emit('show-ui');
  }

  update(): void {
    // Fade out the combo HUD once the chain window has expired so it doesn't
    // linger on screen after the combo breaks.
    if (this.comboText?.visible && this.time.now - this.comboLastMs > 1500) {
      this.comboCount = 0;
      this.comboText.setVisible(false);
    }
  }

  private cellToWorld(r: number, c: number): { x: number; y: number } {
    return {
      x: MAZE_X + c * CELL + CELL / 2,
      y: MAZE_Y + r * CELL + CELL / 2,
    };
  }

  private drawMaze(): void {
    const gfx = this.add.graphics();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const px = MAZE_X + c * CELL;
        const py = MAZE_Y + r * CELL;
        if (this.grid[r][c] === WALL) {
          gfx.fillStyle(WALL_COLOR);
          gfx.fillRect(px, py, CELL, CELL);
          // Subtle wall edge
          gfx.lineStyle(1, 0x3a3530, 0.3);
          gfx.strokeRect(px, py, CELL, CELL);
        } else {
          gfx.fillStyle(FLOOR_COLOR);
          gfx.fillRect(px, py, CELL, CELL);
        }
      }
    }
  }

  private drawRatEyes(x: number, y: number): void {
    this.ratEyes.clear();
    this.ratEyes.fillStyle(0xffffff);
    this.ratEyes.fillCircle(x - 3, y - 2, 2);
    this.ratEyes.fillCircle(x + 3, y - 2, 2);
    this.ratEyes.fillStyle(0x111111);
    this.ratEyes.fillCircle(x - 3, y - 2, 1);
    this.ratEyes.fillCircle(x + 3, y - 2, 1);
    // Tail
    this.ratEyes.lineStyle(1.5, RAT_COLOR, 0.8);
    this.ratEyes.beginPath();
    this.ratEyes.moveTo(x + 6, y + 4);
    this.ratEyes.lineTo(x + 10, y + 1);
    this.ratEyes.lineTo(x + 12, y + 5);
    this.ratEyes.strokePath();
  }

  private createCatSprite(): void {
    const { x, y } = this.cellToWorld(this.catPos.r, this.catPos.c);
    const idleKey = `${this.catBreed}_idle_south`;
    if (this.textures.exists(idleKey)) {
      this.catSprite = this.add.sprite(x, y, idleKey);
      this.catSprite.setScale(0.9);
      this.catSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    } else {
      this.catFallback = this.add.circle(x, y, CELL / 2 - 2, 0xc4956a);
    }
  }

  private keyToDir(key: string): { dr: number; dc: number; name: string } | null {
    if (key === 'ArrowUp' || key === 'w' || key === 'W') return DIRS[0];
    if (key === 'ArrowDown' || key === 's' || key === 'S') return DIRS[1];
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') return DIRS[2];
    if (key === 'ArrowRight' || key === 'd' || key === 'D') return DIRS[3];
    return null;
  }

  private moveCat(dr: number, dc: number): void {
    const nr = this.catPos.r + dr;
    const nc = this.catPos.c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || this.grid[nr][nc] === WALL) return;

    this.catPos = { r: nr, c: nc };
    // Remember which way we're heading so the Ambusher can pre-position 4 tiles
    // ahead. Even a single move worth of "facing direction" is enough to drive
    // meaningful pre-emptive ambushes.
    this.catLastDir = { dr, dc };
    this.moveCount++;
    const dest = this.cellToWorld(nr, nc);

    // Update sprite direction
    if (this.catSprite) {
      const dirName = dr < 0 ? 'north' : dr > 0 ? 'south' : dc < 0 ? 'west' : 'east';
      const walkKey = `${this.catBreed}_walk_${dirName}`;
      // Guard avoids restarting the anim from frame 0 on consecutive same-direction steps
      if (this.anims.exists(walkKey) && this.catSprite.anims.currentAnim?.key !== walkKey) {
        this.catSprite.play(walkKey);
      }
      this.tweens.add({
        targets: this.catSprite, x: dest.x, y: dest.y, duration: 120, ease: 'Sine.easeOut',
        onComplete: () => {
          const idleDir = dr < 0 ? 'north' : dr > 0 ? 'south' : dc < 0 ? 'west' : 'east';
          this.catSprite?.setTexture(`${this.catBreed}_idle_${idleDir}`);
          this.catSprite?.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
          this.catSprite?.stop();
        },
      });
    }
    if (this.catFallback) {
      this.tweens.add({ targets: this.catFallback, x: dest.x, y: dest.y, duration: 120, ease: 'Sine.easeOut' });
    }

    // Collect dots — with combo chain for mastery depth
    const dotIndex = this.dots.findIndex((d) => d.r === nr && d.c === nc);
    if (dotIndex >= 0) {
      this.dots[dotIndex].gfx.destroy();
      this.dots.splice(dotIndex, 1);
      this.dotsCollected++;
      this.dotText.setText(`Fish: ${this.dotsCollected}/${this.totalDots}`);
      this.registerDotForCombo(dest.x, dest.y);
      // Gold sparkle burst on pickup
      this.burstParticles(dest.x, dest.y, 0xdda055, 8);
    }

    // Collect catnip pellet — scare the dog
    const pelletIndex = this.catnipPellets.findIndex((p) => p.r === nr && p.c === nc);
    if (pelletIndex >= 0) {
      const pellet = this.catnipPellets[pelletIndex];
      pellet.gfx.destroy();
      this.catnipPellets.splice(pelletIndex, 1);
      this.activateCatnipMode(dest.x, dest.y);
      // Big green particle explosion
      this.burstParticles(dest.x, dest.y, 0x6abe3f, 20);
    }

    // Check if caught rat
    if (nr === this.ratPos.r && nc === this.ratPos.c) {
      this.catCaughtRat();
    }

    // Check if ran into any dog. Walks every dog instead of single-dog state
    // so collision is symmetric across the pack — same logic as ghost packs in
    // Pac-Man.
    for (const dog of this.dogs) {
      if (nr === dog.pos.r && nc === dog.pos.c) {
        if (this.isDogScared()) {
          this.catScaredDog(dog);
        } else if (!this.dogStunned) {
          this.dogCaughtCat(dog);
        }
        break;
      }
    }
  }

  /** One-shot particle burst centered at (x, y) using the global
      particle_pixel texture generated in BootScene. Scenes don't need to
      manage emitter lifetime — the emitter auto-removes after the burst. */
  private burstParticles(x: number, y: number, tint: number, count = 10): void {
    if (!this.textures.exists('particle_pixel')) return;
    const emitter = this.add.particles(x, y, 'particle_pixel', {
      speed: { min: 40, max: 120 },
      lifespan: { min: 250, max: 500 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.explode(count);
    // Auto-destroy once particles fade out
    this.time.delayedCall(600, () => emitter.destroy());
  }

  /** Called when the cat collects a fish dot. Chains consecutive collections
      into a combo — extra dots within 1.5s boost the fish multiplier. */
  private registerDotForCombo(x: number, y: number): void {
    const now = this.time.now;
    if (now - this.comboLastMs < 1500) {
      this.comboCount++;
    } else {
      this.comboCount = 1;
    }
    this.comboLastMs = now;

    // Milestone bonuses
    let bonus = 0;
    if (this.comboCount === 5) bonus = 2;
    else if (this.comboCount === 10) bonus = 5;
    else if (this.comboCount > 10 && this.comboCount % 5 === 0) bonus = 3;
    if (bonus > 0) {
      this.comboMaxBonus += bonus;
      playSfx('sparkle', 0.4);
      haptic.success();
      const t = this.add.text(x, y - 18, `COMBO x${this.comboCount} +${bonus}!`, {
        fontFamily: 'Georgia, serif', fontSize: '12px', color: '#dda055',
      }).setOrigin(0.5).setDepth(20);
      this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    }

    // Live HUD indicator
    if (this.comboCount >= 3) {
      if (!this.comboText) {
        this.comboText = this.add.text(GAME_WIDTH / 2, 104, '', {
          fontFamily: 'Georgia, serif', fontSize: '11px', color: '#dda055',
        }).setOrigin(0.5);
      }
      this.comboText.setText(`Combo x${this.comboCount}`);
      this.comboText.setVisible(true);
    }
  }

  private isDogScared(): boolean {
    return this.time.now < this.dogScaredUntil;
  }

  /** Catnip pellet effect: scare ALL dogs for 6s (4s on hard). */
  private activateCatnipMode(x: number, y: number): void {
    const duration = this.difficulty === 'hard' ? 4000 : 6000;
    this.dogScaredUntil = this.time.now + duration;
    // Reset ghost-combo counter for the fresh window
    this.scaredEatenThisWindow = 0;
    playSfx('sparkle', 0.6);
    haptic.medium();

    // Visual pop where collected
    const pop = this.add.text(x, y - 14, 'CATNIP!', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#6abe3f',
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: pop, y: pop.y - 26, alpha: 0, duration: 1000, onComplete: () => pop.destroy() });

    // Tint every dog green and interrupt their chase state
    for (const dog of this.dogs) {
      if ('setTint' in dog.gfx) {
        (dog.gfx as Phaser.GameObjects.Sprite).setTint(0x6abe3f);
      }
      if (dog.alertIcon) dog.alertIcon.setText('\u{1F4A8}'); // puff-of-air icon
      dog.state = 'patrol';
    }

    // Restore on expiration
    this.time.delayedCall(duration, () => {
      if (this.caught) return;
      for (const dog of this.dogs) {
        if ('clearTint' in dog.gfx) {
          (dog.gfx as Phaser.GameObjects.Sprite).clearTint();
        }
        if (dog.alertIcon) dog.alertIcon.setVisible(false);
      }
      this.dogScaredUntil = 0;
    });
  }

  /** Cat touched a scared dog. The reward escalates per dog eaten in the
      current catnip window — Pac-Man-style 200/400/800/1600 geometric reward,
      scaled down for our economy: 5 → 10 → 20 → 40 fish. */
  private catScaredDog(dog: Dog): void {
    playSfx('sparkle', 0.8);
    haptic.heavy();
    this.cameras.main.shake(120, 0.006);

    // Geometric escalation: each subsequent eat doubles the previous reward
    this.scaredEatenThisWindow++;
    const bonusFish = 5 * Math.pow(2, this.scaredEatenThisWindow - 1);
    this.dotsCollected += bonusFish;
    this.comboMaxBonus += bonusFish;
    this.dotText.setText(`Fish: ${this.dotsCollected}/${this.totalDots}`);

    // Floating text — also includes the chain count so the player can SEE
    // they're stacking bonuses
    const { x, y } = this.cellToWorld(dog.pos.r, dog.pos.c);
    const chainLabel = this.scaredEatenThisWindow >= 2
      ? `+${bonusFish} fish! (chain x${this.scaredEatenThisWindow})`
      : `+${bonusFish} fish!`;
    const t = this.add.text(x, y - 18, chainLabel, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#dda055',
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 1000, onComplete: () => t.destroy() });

    // Teleport this dog far away. Other dogs stay scared until the timer ends
    // so the cat can keep chaining if it can reach them.
    if ('clearTint' in dog.gfx) {
      (dog.gfx as Phaser.GameObjects.Sprite).clearTint();
    }
    const farSpots: { r: number; c: number }[] = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (this.grid[r][c] !== FLOOR) continue;
        const d = Math.abs(r - this.catPos.r) + Math.abs(c - this.catPos.c);
        if (d > 8) farSpots.push({ r, c });
      }
    }
    if (farSpots.length > 0) {
      const spot = farSpots[Math.floor(Math.random() * farSpots.length)];
      dog.pos = spot;
      const dest = this.cellToWorld(spot.r, spot.c);
      dog.gfx.setPosition(dest.x, dest.y);
    }
    dog.state = 'patrol';
    if (dog.alertIcon) dog.alertIcon.setVisible(false);
  }

  private moveRat(): void {
    if (this.caught) return;
    const { dr, dc } = ratMove(this.grid, this.ratPos.r, this.ratPos.c, this.catPos.r, this.catPos.c);
    if (dr === 0 && dc === 0) return;

    const nr = this.ratPos.r + dr;
    const nc = this.ratPos.c + dc;
    this.ratPos = { r: nr, c: nc };

    const dest = this.cellToWorld(nr, nc);
    this.tweens.add({ targets: this.ratGfx, x: dest.x, y: dest.y, duration: 150, ease: 'Linear' });
    if (!this.textures.exists('rat')) {
      this.tweens.add({
        targets: this.ratEyes, x: 0, y: 0, duration: 0,
        onComplete: () => this.drawRatEyes(dest.x, dest.y),
      });
    }
  }

  private catCaughtRat(): void {
    this.caught = true;
    this.moveTimer?.destroy();
    this.ratTimer?.destroy();

    // Celebration — big gold particle burst at the capture point
    const { x: rx, y: ry } = this.cellToWorld(this.ratPos.r, this.ratPos.c);
    this.burstParticles(rx, ry, 0xdda055, 30);
    this.cameras.main.flash(150, 220, 170, 90);
    this.ratGfx.setVisible(false);
    this.ratEyes.setVisible(false);

    // Sweep all remaining fish dots toward the cat in a staggered cascade.
    // Uses tweens.stagger() to auto-delay each target by 40ms — one tween,
    // one call, real Pac-Man-style satisfaction.
    if (this.dots.length > 0) {
      const catWorld = this.cellToWorld(this.catPos.r, this.catPos.c);
      const dotTargets = this.dots.map((d) => d.gfx);
      this.tweens.add({
        targets: dotTargets,
        x: catWorld.x,
        y: catWorld.y,
        scale: 0.2,
        alpha: 0,
        duration: 280,
        ease: 'Sine.easeIn',
        delay: this.tweens.stagger(40, {}),
        onComplete: () => {
          for (const d of this.dots) d.gfx.destroy();
          this.dots = [];
        },
      });
    }

    const dotRatio = this.totalDots > 0 ? this.dotsCollected / this.totalDots : 0;
    const stars = this.timeLeft > 30 && dotRatio > 0.7 ? 3
      : this.timeLeft > 15 && dotRatio > 0.4 ? 2 : 1;

    // dotsCollected already includes dog-scaring bonuses; comboMaxBonus is the
    // extra reward from chained dot pickups and scared-dog touches.
    const bonusFish = this.dotsCollected + this.comboMaxBonus;

    playSfx('rat_caught');
    haptic.success();
    const bonusLine = this.comboMaxBonus > 0
      ? `+${bonusFish} fish (${this.dotsCollected} collected + ${this.comboMaxBonus} combo bonus)`
      : `+${bonusFish} bonus fish collected`;
    showSceneOutcomeBanner(this, {
      title: 'Caught!',
      subtitle: bonusLine,
      subtitleColor: '#dda055',
    });

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `chase_${this.difficulty}`,
        moves: this.moveCount,
        minMoves: Math.floor(this.totalDots * 0.7),
        stars,
        jobId: this.jobId,
        catId: this.catId,
        bonusFish,
      });
    });
  }

  private timeUp(): void {
    this.caught = true; // reuse flag to stop movement
    this.moveTimer?.destroy();
    this.ratTimer?.destroy();

    showSceneOutcomeBanner(this, {
      title: 'Time\'s up!',
      subtitle: 'The rat escaped...',
      titleColor: '#aa4444',
    });

    this.time.delayedCall(2000, () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });
  }

  private cleanup(): void {
    this.moveTimer?.destroy();
    this.ratTimer?.destroy();
    this.dogTimer?.destroy();
  }

  /** Spawn the dog pack. Easy = 1 Tracker. Medium/Hard = 1 Tracker + 1
      Ambusher. Each archetype targets a different tile, forcing the player
      to think about each dog separately. */
  private createDogs(): void {
    const archetypes: DogArchetype[] = this.difficulty === 'easy'
      ? ['tracker']
      : ['tracker', 'ambusher'];

    // Build floor candidates far from cat and rat for spawn placement
    const floors: { r: number; c: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] !== FLOOR) continue;
        const distCat = Math.abs(r - this.catPos.r) + Math.abs(c - this.catPos.c);
        const distRat = Math.abs(r - this.ratPos.r) + Math.abs(c - this.ratPos.c);
        if (distCat > 6 && distRat > 4) floors.push({ r, c });
      }
    }
    // Shuffle so different archetypes don't overlap
    for (let i = floors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [floors[i], floors[j]] = [floors[j], floors[i]];
    }

    const usedSpots = new Set<string>();
    for (let i = 0; i < archetypes.length; i++) {
      const archetype = archetypes[i];
      // Find a spot at least 3 tiles from any other dog
      let spot = floors[i] ?? { r: 6, c: 6 };
      for (const candidate of floors) {
        const key = `${candidate.r},${candidate.c}`;
        if (usedSpots.has(key)) continue;
        let tooClose = false;
        for (const used of usedSpots) {
          const [ur, uc] = used.split(',').map(Number);
          if (Math.abs(candidate.r - ur) + Math.abs(candidate.c - uc) < 4) {
            tooClose = true; break;
          }
        }
        if (!tooClose) { spot = candidate; break; }
      }
      usedSpots.add(`${spot.r},${spot.c}`);

      const { x, y } = this.cellToWorld(spot.r, spot.c);
      let gfx: Dog['gfx'];
      if (this.textures.exists('dog')) {
        const dogSprite = this.add.sprite(x, y, 'dog');
        dogSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        dogSprite.setScale(0.85);
        // Tint the ambusher purple-ish so the player can tell them apart at
        // a glance even though they share a sprite. Not just cosmetic — the
        // archetype changes how the dog targets, and the player needs to learn
        // that distinction by sight.
        if (archetype === 'ambusher') dogSprite.setTint(0xb47ad9);
        gfx = dogSprite;
      } else {
        gfx = this.add.text(x, y, '\uD83D\uDC15', { fontSize: '20px' }).setOrigin(0.5);
      }

      const alertColor = archetype === 'tracker' ? '#ff6b2a' : '#b47ad9';
      const alertIcon = this.add.text(x, y - 16, '', {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: alertColor,
      }).setOrigin(0.5).setDepth(15);
      alertIcon.setVisible(false);

      this.dogs.push({
        pos: { ...spot },
        gfx,
        alertIcon,
        state: 'patrol',
        archetype,
        displayName: archetype === 'tracker' ? 'Tracker' : 'Ambusher',
        alertColor,
      });
    }
  }

  /** Returns the dog's view distance to the cat along a straight floor line,
      or -1 if the cat is not visible. This is the Pac-Man-style sightline
      check that gives the dog reactive awareness without being omniscient. */
  private dogSeesCatFrom(dog: Dog): number {
    const dr = this.catPos.r - dog.pos.r;
    const dc = this.catPos.c - dog.pos.c;
    if (dr !== 0 && dc !== 0) return -1; // only cardinal lines
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0 || steps > 6) return -1; // max sightline range 6 tiles
    const stepR = Math.sign(dr);
    const stepC = Math.sign(dc);
    for (let i = 1; i < steps; i++) {
      const r = dog.pos.r + stepR * i;
      const c = dog.pos.c + stepC * i;
      if (this.grid[r]?.[c] === WALL) return -1;
    }
    return steps;
  }

  /** Returns the tile this dog should be heading toward THIS tick.
      - Tracker: cat's current tile (Blinky-style direct pursuit).
      - Ambusher: 4 tiles ahead of the cat in the cat's facing direction
        (Pinky-style ambush). When the cat is far away, both fall back to
        random patrol. */
  private targetTileFor(dog: Dog): { r: number; c: number } {
    if (dog.archetype === 'ambusher') {
      // Project 4 tiles in the cat's last direction; clamp to bounds
      const tr = Math.max(1, Math.min(ROWS - 2, this.catPos.r + this.catLastDir.dr * 4));
      const tc = Math.max(1, Math.min(COLS - 2, this.catPos.c + this.catLastDir.dc * 4));
      return { r: tr, c: tc };
    }
    return { r: this.catPos.r, c: this.catPos.c };
  }

  private moveDogs(): void {
    if (this.caught || this.dogStunned) return;
    for (const dog of this.dogs) {
      this.moveOneDog(dog);
      // Stop the loop early if a collision ended the round
      if (this.caught) return;
    }
  }

  private moveOneDog(dog: Dog): void {
    // Scared state: flee the cat regardless of archetype
    if (this.isDogScared()) {
      this.moveDogScared(dog);
      return;
    }

    const sightDist = this.dogSeesCatFrom(dog);
    const manhattan = Math.abs(dog.pos.r - this.catPos.r) + Math.abs(dog.pos.c - this.catPos.c);
    const prevState = dog.state;
    if (manhattan <= 3) {
      dog.state = 'chase';
    } else if (sightDist > 0) {
      dog.state = 'alert';
    } else {
      dog.state = 'patrol';
    }

    // Visual state indicator
    if (dog.alertIcon) {
      if (dog.state === 'chase') {
        dog.alertIcon.setText('!');
        dog.alertIcon.setColor('#cc3333');
        dog.alertIcon.setVisible(true);
      } else if (dog.state === 'alert') {
        dog.alertIcon.setText('?');
        dog.alertIcon.setColor(dog.alertColor);
        dog.alertIcon.setVisible(true);
      } else {
        dog.alertIcon.setVisible(false);
      }
    }
    if (prevState !== 'chase' && dog.state === 'chase') {
      playSfx('bark', 0.5);
    }

    // Build candidate moves based on state
    const moves: { dr: number; dc: number }[] = [];
    if (dog.state === 'chase' || dog.state === 'alert') {
      // Greedy axis-priority move toward this dog's target tile.
      // Tracker uses cat tile; ambusher uses 4-ahead tile.
      const target = this.targetTileFor(dog);
      const dr = target.r - dog.pos.r;
      const dc = target.c - dog.pos.c;
      if (Math.abs(dr) >= Math.abs(dc)) {
        if (dr !== 0) moves.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
        if (dc !== 0) moves.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
      } else {
        if (dc !== 0) moves.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
        if (dr !== 0) moves.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
      }
      // Small deviation chance on alert so the dog can be outmaneuvered
      if (dog.state === 'alert' && Math.random() < 0.25) {
        const rnd = DIRS[Math.floor(Math.random() * DIRS.length)];
        moves.unshift({ dr: rnd.dr, dc: rnd.dc });
      }
    } else {
      // Patrol: purely random wander
      const rnd = DIRS[Math.floor(Math.random() * DIRS.length)];
      moves.push({ dr: rnd.dr, dc: rnd.dc });
      const rnd2 = DIRS[Math.floor(Math.random() * DIRS.length)];
      moves.push({ dr: rnd2.dr, dc: rnd2.dc });
    }

    for (const m of moves) {
      const nr = dog.pos.r + m.dr;
      const nc = dog.pos.c + m.dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || this.grid[nr][nc] !== FLOOR) continue;
      // Don't camp near the rat — stay at least 2 tiles away
      const distToRat = Math.abs(nr - this.ratPos.r) + Math.abs(nc - this.ratPos.c);
      if (distToRat < 2) continue;
      // Don't pile up on another dog (prevents two-dog stacking)
      let onOtherDog = false;
      for (const other of this.dogs) {
        if (other === dog) continue;
        if (other.pos.r === nr && other.pos.c === nc) { onOtherDog = true; break; }
      }
      if (onOtherDog) continue;
      dog.pos = { r: nr, c: nc };
      const dest = this.cellToWorld(nr, nc);
      this.tweens.add({ targets: dog.gfx, x: dest.x, y: dest.y, duration: 150, ease: 'Linear' });
      if (dog.alertIcon) dog.alertIcon.setPosition(dest.x, dest.y - 16);
      break;
    }

    // Occasional bark when close
    if (manhattan <= 3 && Math.random() < 0.3) {
      playSfx('bark', 0.3);
    }

    // Check collision with cat
    if (dog.pos.r === this.catPos.r && dog.pos.c === this.catPos.c) {
      this.dogCaughtCat(dog);
    }
  }

  /** Catnip-mode movement for one dog: pick the step that maximises distance
      from the cat. Stays away from the rat so the cat can still earn a chain. */
  private moveDogScared(dog: Dog): void {
    let best: { dr: number; dc: number; dist: number } | null = null;
    for (const { dr, dc } of DIRS) {
      const nr = dog.pos.r + dr;
      const nc = dog.pos.c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || this.grid[nr][nc] !== FLOOR) continue;
      const distToRat = Math.abs(nr - this.ratPos.r) + Math.abs(nc - this.ratPos.c);
      if (distToRat < 2) continue;
      const d = Math.abs(nr - this.catPos.r) + Math.abs(nc - this.catPos.c);
      if (!best || d > best.dist) best = { dr, dc, dist: d };
    }
    if (best) {
      dog.pos = { r: dog.pos.r + best.dr, c: dog.pos.c + best.dc };
      const dest = this.cellToWorld(dog.pos.r, dog.pos.c);
      this.tweens.add({ targets: dog.gfx, x: dest.x, y: dest.y, duration: 180, ease: 'Linear' });
      if (dog.alertIcon) dog.alertIcon.setPosition(dest.x, dest.y - 16);
    }
  }

  private dogCaughtCat(dog: Dog): void {
    if (this.caught) return;
    this.caught = true;
    this.moveTimer?.destroy();
    this.ratTimer?.destroy();
    this.dogTimer?.destroy();

    playSfx('bark', 0.6);
    playSfx('hiss');
    haptic.error();
    this.cameras.main.flash(300, 139, 69, 19, false);

    // Show WHICH dog caught the cat — the doc's "death must never feel
    // random" pillar. The player should walk away knowing what behavior
    // they failed to anticipate.
    const explanation = dog.archetype === 'ambusher'
      ? 'The Ambusher pre-positioned ahead of you...'
      : 'The Tracker followed your trail...';
    showSceneOutcomeBanner(this, {
      title: `Caught by the ${dog.displayName}!`,
      subtitle: explanation,
      titleColor: '#cc6666',
      y: GAME_HEIGHT / 2 - 10,
    });

    this.time.delayedCall(2000, () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
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
