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
  private dots: { r: number; c: number; gfx: Phaser.GameObjects.Arc }[] = [];
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

    // Tutorial on first play — pause scene until dismissed
    if (!localStorage.getItem('clowder_chase_tutorial')) {
      localStorage.setItem('clowder_chase_tutorial', '1');
      this.scene.pause();
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
      t.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:12px">Chase the Rat!</div>
        <div style="color:#8b7355;font-family:Georgia,serif;font-size:14px;text-align:center;max-width:280px;line-height:1.6">
          Navigate the maze to <strong>catch the rat</strong> before time runs out.<br><br>
          Use the <strong>d-pad buttons</strong>, <strong>swipe</strong>, or <strong>WASD/arrows</strong> to move.<br><br>
          Collect <strong style="color:#dda055">fish dots</strong> along the way for bonus rewards!<br><br>
          <strong style="color:#cc6666">Beware the guard dog!</strong> It patrols the maze and costs you time if it catches you.
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
      const gfx = this.add.circle(x, y, 3, DOT_COLOR, 0.6);
      this.dots.push({ r: d.r, c: d.c, gfx });
    }
    this.totalDots = this.dots.length;

    // Speed boost power-ups (2-3 green dots that give temporary speed)
    const boostCount = this.difficulty === 'hard' ? 2 : 3;
    const usedDotPositions = new Set(dotPositions.map((d) => `${d.r},${d.c}`));
    let boostsPlaced = 0;
    for (let r = 1; r < ROWS - 1 && boostsPlaced < boostCount; r++) {
      for (let c = 1; c < COLS - 1 && boostsPlaced < boostCount; c++) {
        if (this.grid[r][c] === FLOOR && !usedDotPositions.has(`${r},${c}`) && Math.random() < 0.08) {
          const { x, y } = this.cellToWorld(r, c);
          const boost = this.add.circle(x, y, 5, 0x44cc44, 0.8);
          this.tweens.add({ targets: boost, scaleX: 1.3, scaleY: 1.3, duration: 500, yoyo: true, repeat: -1 });
          // Store position for collision check
          const br = r, bc = c;
          this.time.addEvent({
            delay: 200, loop: true,
            callback: () => {
              if (!boost.active || this.caught) return;
              if (this.catPos.r === br && this.catPos.c === bc) {
                boost.destroy();
                // Bonus time from speed pickup
                this.timeLeft += 3;
                this.timerText.setText(`Time: ${this.timeLeft}s`);
                this.timerText.setColor('#44cc44');
                this.time.delayedCall(500, () => this.timerText.setColor('#c4956a'));
                const bonusText = this.add.text(this.cellToWorld(br, bc).x, this.cellToWorld(br, bc).y - 10, '+3s', {
                  fontFamily: 'Georgia, serif', fontSize: '12px', color: '#44cc44',
                }).setOrigin(0.5);
                this.tweens.add({ targets: bonusText, y: bonusText.y - 20, alpha: 0, duration: 600, onComplete: () => bonusText.destroy() });
              }
            },
          });
          boostsPlaced++;
        }
      }
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

    let joyPointerId = -1;
    let joyMoveTimer: Phaser.Time.TimerEvent | null = null;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const wx = pointer.x / DPR;
      const wy = pointer.y / DPR;
      if (Math.sqrt((wx - joyX) ** 2 + (wy - joyY) ** 2) < joyRadius * 1.5) {
        joyPointerId = pointer.id;
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === joyPointerId) {
        joyPointerId = -1;
        joyKnob.setPosition(joyX, joyY);
        joyMoveTimer?.destroy();
        joyMoveTimer = null;
      }
    });

    // Poll joystick for grid-based movement
    this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        if (joyPointerId < 0 || this.caught) return;
        const pointers = [this.input.pointer1, this.input.pointer2, this.input.activePointer];
        for (const p of pointers) {
          if (p && p.id === joyPointerId && p.isDown) {
            const dx = p.x / DPR - joyX;
            const dy = p.y / DPR - joyY;
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

    // Swipe gesture for mobile
    let swipeStart: { x: number; y: number } | null = null;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Only register swipes in the maze area
      if (pointer.worldY < MAZE_Y || pointer.worldY > MAZE_Y + MAZE_H) return;
      swipeStart = { x: pointer.worldX, y: pointer.worldY };
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.caught || !swipeStart) return;
      const dx = pointer.worldX - swipeStart.x;
      const dy = pointer.worldY - swipeStart.y;
      const dist = Math.hypot(dx, dy);
      swipeStart = null;
      if (dist < 15) return; // Too short, ignore
      if (Math.abs(dx) > Math.abs(dy)) {
        this.moveCat(0, dx > 0 ? 1 : -1);
      } else {
        this.moveCat(dy > 0 ? 1 : -1, 0);
      }
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
    });
    eventBus.emit('show-ui');
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
      if (this.anims.exists(walkKey)) {
        this.catSprite.play(walkKey);
      }
      this.tweens.add({
        targets: this.catSprite, x: dest.x, y: dest.y, duration: 120, ease: 'Linear',
        onComplete: () => {
          const idleDir = dr < 0 ? 'north' : dr > 0 ? 'south' : dc < 0 ? 'west' : 'east';
          this.catSprite?.setTexture(`${this.catBreed}_idle_${idleDir}`);
          this.catSprite?.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
          this.catSprite?.stop();
        },
      });
    }
    if (this.catFallback) {
      this.tweens.add({ targets: this.catFallback, x: dest.x, y: dest.y, duration: 120, ease: 'Linear' });
    }

    // Collect dots
    const dotIndex = this.dots.findIndex((d) => d.r === nr && d.c === nc);
    if (dotIndex >= 0) {
      this.dots[dotIndex].gfx.destroy();
      this.dots.splice(dotIndex, 1);
      this.dotsCollected++;
      this.dotText.setText(`Fish: ${this.dotsCollected}/${this.totalDots}`);
    }

    // Check if caught rat
    if (nr === this.ratPos.r && nc === this.ratPos.c) {
      this.catCaughtRat();
    }

    // Check if ran into dog
    if (nr === this.dogPos.r && nc === this.dogPos.c && !this.dogStunned) {
      this.dogCaughtCat();
    }
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

    // Celebration
    this.ratGfx.setVisible(false);
    this.ratEyes.setVisible(false);

    const dotRatio = this.totalDots > 0 ? this.dotsCollected / this.totalDots : 0;
    const stars = this.timeLeft > 30 && dotRatio > 0.7 ? 3
      : this.timeLeft > 15 && dotRatio > 0.4 ? 2 : 1;

    const bonusFish = this.dotsCollected;

    playSfx('rat_caught');
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Caught!', {
      fontFamily: 'Georgia, serif', fontSize: '32px', color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 35, `+${bonusFish} bonus fish collected`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#dda055',
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
  }

  private moveDog(): void {
    if (this.caught || this.dogStunned) return;

    // Dog patrols semi-randomly — 40% chance to move toward cat, 60% random
    // This makes the dog an avoidable hazard rather than an unavoidable pursuer
    const moves: { dr: number; dc: number }[] = [];
    if (Math.random() < 0.4) {
      // Move toward cat
      const dr = this.catPos.r - this.dogPos.r;
      const dc = this.catPos.c - this.dogPos.c;
      if (Math.abs(dr) >= Math.abs(dc)) {
        if (dr !== 0) moves.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
        if (dc !== 0) moves.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
      } else {
        if (dc !== 0) moves.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
        if (dr !== 0) moves.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
      }
    }
    // Always add a random direction as fallback
    const rndDir = DIRS[Math.floor(Math.random() * DIRS.length)];
    moves.push({ dr: rndDir.dr, dc: rndDir.dc });

    for (const m of moves) {
      const nr = this.dogPos.r + m.dr;
      const nc = this.dogPos.c + m.dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || this.grid[nr][nc] !== FLOOR) continue;
      // Don't let the dog camp near the rat — stay at least 2 tiles away
      const distToRat = Math.abs(nr - this.ratPos.r) + Math.abs(nc - this.ratPos.c);
      if (distToRat < 2) continue;
      {
        this.dogPos = { r: nr, c: nc };
        const dest = this.cellToWorld(nr, nc);
        this.tweens.add({ targets: this.dogGfx, x: dest.x, y: dest.y, duration: 150, ease: 'Linear' });
        break;
      }
    }

    // Bark when close to cat (within 3 tiles)
    const distToCat = Math.abs(this.dogPos.r - this.catPos.r) + Math.abs(this.dogPos.c - this.catPos.c);
    if (distToCat <= 3 && Math.random() < 0.3) {
      playSfx('bark', 0.3);
    }

    // Check collision with cat
    if (this.dogPos.r === this.catPos.r && this.dogPos.c === this.catPos.c) {
      this.dogCaughtCat();
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
