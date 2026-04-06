import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';

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

// ══════════════════════════════════════
export class ChaseScene extends Phaser.Scene {
  private grid: number[][] = [];
  private catPos = { r: 1, c: 1 };
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
  private dogPos = { r: 6, c: 6 };
  private dogGfx!: Phaser.GameObjects.GameObject & { x: number; y: number; setPosition: (x: number, y: number) => void };
  private dogStunned = false;
  /** Dog AI state: patrol (random) → alert (sightline) → chase (adjacent) */
  private dogState: 'patrol' | 'alert' | 'chase' = 'patrol';
  private dogAlertIcon: Phaser.GameObjects.Text | null = null;
  /** When > 0, the dog is "scared" after a catnip pellet: it flees the cat
      and can be touched for bonus fish. */
  private dogScaredUntil = 0;
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
    // Base time + bonus from cat's hunting stat
    const huntingBonus = cat ? Math.floor(cat.stats.hunting * 1.5) : 0;
    this.timeLeft = (this.difficulty === 'hard' ? 45 : this.difficulty === 'medium' ? 55 : 60) + huntingBonus;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0908');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial on first play — pause scene until dismissed.
    // Bumped the storage key when the catnip/combo mechanics were added so
    // returning players see the updated rules.
    if (!localStorage.getItem('clowder_chase_tutorial_v2')) {
      localStorage.setItem('clowder_chase_tutorial_v2', '1');
      this.scene.pause();
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
      t.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:12px">Chase the Rat!</div>
        <div style="color:#8b7355;font-family:Georgia,serif;font-size:13px;text-align:center;max-width:290px;line-height:1.55">
          Navigate the maze to <strong>catch the rat</strong> before time runs out.<br><br>
          Move with the <strong>joystick</strong>, <strong>swipe</strong>, or <strong>WASD/arrows</strong>.<br><br>
          Grab <strong style="color:#dda055">fish dots</strong> — chain pickups for <strong>combo bonuses</strong>.<br><br>
          <strong style="color:#6abe3f">Catnip pellets</strong> scare the guard dog — touch it while scared for a big reward!<br><br>
          <strong style="color:#cc6666">The dog</strong> has three moods: wandering, suspicious (?), and chasing (!). Watch for its warning.
        </div>
        <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:12px;margin-top:20px">Tap to start</div>
      `;
      t.addEventListener('click', () => {
        t.remove();
        this.scene.resume();
      });
      document.body.appendChild(t);
    }

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

    // Virtual joystick for mobile (below maze)
    this.input.addPointer(1);
    const joyX = GAME_WIDTH / 2;
    const joyY = MAZE_Y + MAZE_H + 70;
    const joyRadius = 36;
    this.add.circle(joyX, joyY, joyRadius, 0x2a2520, 0.6).setStrokeStyle(1, 0x6b5b3e);
    const joyKnob = this.add.circle(joyX, joyY, 14, 0x6b5b3e, 0.8);

    // Unified pointer handling — single pointerdown/pointerup pair covers both
    // the joystick base and maze swipe gestures. Previously split into two pairs
    // which is an anti-pattern per phaserjs/examples.
    let joyPointerId = -1;
    let joyMoveTimer: Phaser.Time.TimerEvent | null = null;
    let swipeStart: { x: number; y: number } | null = null;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const wx = pointer.worldX;
      const wy = pointer.worldY;
      // Joystick area takes priority
      if (Math.sqrt((wx - joyX) ** 2 + (wy - joyY) ** 2) < joyRadius * 1.5) {
        joyPointerId = pointer.id;
        return;
      }
      // Otherwise, record swipe start if inside the maze
      if (wy >= MAZE_Y && wy <= MAZE_Y + MAZE_H) {
        swipeStart = { x: wx, y: wy };
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // Joystick release
      if (pointer.id === joyPointerId) {
        joyPointerId = -1;
        joyKnob.setPosition(joyX, joyY);
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

    // Guard dog — patrols the maze, costs time if caught
    this.createDog();
    const dogSpeed = this.difficulty === 'hard' ? 400 : this.difficulty === 'medium' ? 500 : 700;
    this.dogTimer = this.time.addEvent({
      delay: dogSpeed,
      callback: () => this.moveDog(),
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

    // Check if ran into dog
    if (nr === this.dogPos.r && nc === this.dogPos.c) {
      if (this.isDogScared()) {
        this.catScaredDog();
      } else if (!this.dogStunned) {
        this.dogCaughtCat();
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

  /** Catnip pellet effect: scare the dog for 6s (4s on hard). */
  private activateCatnipMode(x: number, y: number): void {
    const duration = this.difficulty === 'hard' ? 4000 : 6000;
    this.dogScaredUntil = this.time.now + duration;
    playSfx('sparkle', 0.6);

    // Visual pop where collected
    const pop = this.add.text(x, y - 14, 'CATNIP!', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#6abe3f',
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: pop, y: pop.y - 26, alpha: 0, duration: 1000, onComplete: () => pop.destroy() });

    // Tint the dog blue-ish while scared
    if (this.dogGfx && 'setTint' in this.dogGfx) {
      (this.dogGfx as Phaser.GameObjects.Sprite).setTint(0x6abe3f);
    }
    if (this.dogAlertIcon) this.dogAlertIcon.setText('\u{1F4A8}'); // puff-of-air "fleeing" icon
    this.dogState = 'patrol'; // interrupt any chase

    // Restore on expiration
    this.time.delayedCall(duration, () => {
      if (this.caught) return;
      if ('clearTint' in (this.dogGfx as object)) {
        (this.dogGfx as Phaser.GameObjects.Sprite).clearTint();
      }
      this.dogScaredUntil = 0;
      if (this.dogAlertIcon) this.dogAlertIcon.setVisible(false);
    });
  }

  /** Cat touched the dog while catnip was active — bonus fish + dog respawns far away. */
  private catScaredDog(): void {
    playSfx('sparkle', 0.8);
    this.cameras.main.shake(120, 0.006);
    const bonusFish = 5;
    this.dotsCollected += bonusFish;
    this.comboMaxBonus += bonusFish;
    this.dotText.setText(`Fish: ${this.dotsCollected}/${this.totalDots}`);

    // Floating text
    const { x, y } = this.cellToWorld(this.dogPos.r, this.dogPos.c);
    const t = this.add.text(x, y - 18, `+${bonusFish} fish!`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#dda055',
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 1000, onComplete: () => t.destroy() });

    // Reset catnip timer AND teleport dog to a far floor tile
    this.dogScaredUntil = 0;
    if ('clearTint' in (this.dogGfx as object)) {
      (this.dogGfx as Phaser.GameObjects.Sprite).clearTint();
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
      this.dogPos = spot;
      const dest = this.cellToWorld(spot.r, spot.c);
      this.dogGfx.setPosition(dest.x, dest.y);
    }
    this.dogState = 'patrol';
    if (this.dogAlertIcon) this.dogAlertIcon.setVisible(false);
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
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Caught!', {
      fontFamily: 'Georgia, serif', fontSize: '32px', color: '#c4956a',
    }).setOrigin(0.5);

    const bonusLine = this.comboMaxBonus > 0
      ? `+${bonusFish} fish (${this.dotsCollected} collected + ${this.comboMaxBonus} combo bonus)`
      : `+${bonusFish} bonus fish collected`;
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 35, bonusLine, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#dda055',
    }).setOrigin(0.5);

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

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Time\'s up!', {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#aa4444',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, 'The rat escaped...', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
    }).setOrigin(0.5);

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

  private createDog(): void {
    // Place dog in a floor cell away from both cat and rat
    const floors: { r: number; c: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] === FLOOR) {
          const distCat = Math.abs(r - this.catPos.r) + Math.abs(c - this.catPos.c);
          const distRat = Math.abs(r - this.ratPos.r) + Math.abs(c - this.ratPos.c);
          if (distCat > 6 && distRat > 4) floors.push({ r, c });
        }
      }
    }
    if (floors.length > 0) {
      const spot = floors[Math.floor(Math.random() * floors.length)];
      this.dogPos = spot;
    }

    const { x, y } = this.cellToWorld(this.dogPos.r, this.dogPos.c);
    if (this.textures.exists('dog')) {
      const dogSprite = this.add.sprite(x, y, 'dog');
      dogSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      dogSprite.setScale(0.85);
      this.dogGfx = dogSprite;
    } else {
      this.dogGfx = this.add.text(x, y, '\uD83D\uDC15', { fontSize: '20px' }).setOrigin(0.5);
    }

    // Alert/state indicator — sits above the dog and shows "!" when alerted,
    // puff when fleeing during catnip. Invisible during normal patrol.
    this.dogAlertIcon = this.add.text(x, y - 16, '', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#ff6b2a',
    }).setOrigin(0.5).setDepth(15);
    this.dogAlertIcon.setVisible(false);
  }

  /** Check if the dog can "see" the cat along a straight line of floor tiles.
      Returns the Chebyshev distance if visible, -1 otherwise. This is the
      Pac-Man-style sightline check that lets the dog react to the cat's
      position without being omniscient. */
  private dogSeesCat(): number {
    const dr = this.catPos.r - this.dogPos.r;
    const dc = this.catPos.c - this.dogPos.c;
    if (dr !== 0 && dc !== 0) return -1; // only cardinal lines
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0 || steps > 6) return -1; // max sightline range 6 tiles
    const stepR = Math.sign(dr);
    const stepC = Math.sign(dc);
    for (let i = 1; i < steps; i++) {
      const r = this.dogPos.r + stepR * i;
      const c = this.dogPos.c + stepC * i;
      if (this.grid[r]?.[c] === WALL) return -1;
    }
    return steps;
  }

  private moveDog(): void {
    if (this.caught || this.dogStunned) return;

    // Scared state: flee the cat, moves cannot close the gap
    if (this.isDogScared()) {
      this.moveDogScared();
      return;
    }

    // Determine state from sightline / proximity — transitions are driven by
    // the cat's relative position, mimicking Pac-Man ghost scatter→chase logic.
    const sightDist = this.dogSeesCat();
    const manhattan = Math.abs(this.dogPos.r - this.catPos.r) + Math.abs(this.dogPos.c - this.catPos.c);
    const prevState = this.dogState;
    if (manhattan <= 3) {
      this.dogState = 'chase';
    } else if (sightDist > 0) {
      this.dogState = 'alert';
    } else {
      this.dogState = 'patrol';
    }

    // Visual indicator + audio sting on state transitions
    if (this.dogAlertIcon) {
      if (this.dogState === 'chase') {
        this.dogAlertIcon.setText('!');
        this.dogAlertIcon.setColor('#cc3333');
        this.dogAlertIcon.setVisible(true);
      } else if (this.dogState === 'alert') {
        this.dogAlertIcon.setText('?');
        this.dogAlertIcon.setColor('#ff9933');
        this.dogAlertIcon.setVisible(true);
      } else {
        this.dogAlertIcon.setVisible(false);
      }
    }
    if (prevState !== 'chase' && this.dogState === 'chase') {
      playSfx('bark', 0.5);
    }

    // Build candidate moves based on state
    const moves: { dr: number; dc: number }[] = [];
    if (this.dogState === 'chase' || this.dogState === 'alert') {
      // Greedy move toward cat along the larger axis
      const dr = this.catPos.r - this.dogPos.r;
      const dc = this.catPos.c - this.dogPos.c;
      if (Math.abs(dr) >= Math.abs(dc)) {
        if (dr !== 0) moves.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
        if (dc !== 0) moves.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
      } else {
        if (dc !== 0) moves.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
        if (dr !== 0) moves.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
      }
      // Small chance to deviate on alert so the dog can be outmaneuvered
      if (this.dogState === 'alert' && Math.random() < 0.25) {
        const rnd = DIRS[Math.floor(Math.random() * DIRS.length)];
        moves.unshift({ dr: rnd.dr, dc: rnd.dc });
      }
    } else {
      // Patrol: purely random wander
      const rnd = DIRS[Math.floor(Math.random() * DIRS.length)];
      moves.push({ dr: rnd.dr, dc: rnd.dc });
      // Fallback so the dog doesn't get stuck in a corner
      const rnd2 = DIRS[Math.floor(Math.random() * DIRS.length)];
      moves.push({ dr: rnd2.dr, dc: rnd2.dc });
    }

    for (const m of moves) {
      const nr = this.dogPos.r + m.dr;
      const nc = this.dogPos.c + m.dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || this.grid[nr][nc] !== FLOOR) continue;
      // Don't let the dog camp near the rat — stay at least 2 tiles away
      const distToRat = Math.abs(nr - this.ratPos.r) + Math.abs(nc - this.ratPos.c);
      if (distToRat < 2) continue;
      this.dogPos = { r: nr, c: nc };
      const dest = this.cellToWorld(nr, nc);
      this.tweens.add({ targets: this.dogGfx, x: dest.x, y: dest.y, duration: 150, ease: 'Linear' });
      if (this.dogAlertIcon) this.dogAlertIcon.setPosition(dest.x, dest.y - 16);
      break;
    }

    // Bark when close to cat
    if (manhattan <= 3 && Math.random() < 0.3) {
      playSfx('bark', 0.3);
    }

    // Check collision with cat
    if (this.dogPos.r === this.catPos.r && this.dogPos.c === this.catPos.c) {
      this.dogCaughtCat();
    }
  }

  /** Catnip-mode movement: pick the step that maximises distance from the cat. */
  private moveDogScared(): void {
    let best: { dr: number; dc: number; dist: number } | null = null;
    for (const { dr, dc } of DIRS) {
      const nr = this.dogPos.r + dr;
      const nc = this.dogPos.c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || this.grid[nr][nc] !== FLOOR) continue;
      const distToRat = Math.abs(nr - this.ratPos.r) + Math.abs(nc - this.ratPos.c);
      if (distToRat < 2) continue;
      const d = Math.abs(nr - this.catPos.r) + Math.abs(nc - this.catPos.c);
      if (!best || d > best.dist) best = { dr, dc, dist: d };
    }
    if (best) {
      this.dogPos = { r: this.dogPos.r + best.dr, c: this.dogPos.c + best.dc };
      const dest = this.cellToWorld(this.dogPos.r, this.dogPos.c);
      this.tweens.add({ targets: this.dogGfx, x: dest.x, y: dest.y, duration: 180, ease: 'Linear' });
      if (this.dogAlertIcon) this.dogAlertIcon.setPosition(dest.x, dest.y - 16);
    }
  }

  private dogCaughtCat(): void {
    if (this.caught) return;
    this.caught = true;
    this.moveTimer?.destroy();
    this.ratTimer?.destroy();
    this.dogTimer?.destroy();

    playSfx('bark', 0.6);
    playSfx('hiss');
    this.cameras.main.flash(300, 139, 69, 19, false);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'Caught by the guard dog!', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, 'The job is lost...', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
    }).setOrigin(0.5);

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
