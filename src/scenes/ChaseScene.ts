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

  // Open some extra passages to make maze less linear
  for (let i = 0; i < 8; i++) {
    const r = 1 + Math.floor(Math.random() * (ROWS - 2));
    const c = 1 + Math.floor(Math.random() * (COLS - 2));
    if (grid[r][c] === WALL) {
      // Only open if it connects two floor cells
      const adjFloors = DIRS.filter(({ dr, dc }) => {
        const nr = r + dr;
        const nc = c + dc;
        return nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc] === FLOOR;
      });
      if (adjFloors.length >= 2) {
        grid[r][c] = FLOOR;
      }
    }
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
  private ratGfx!: Phaser.GameObjects.Arc;
  private ratEyes!: Phaser.GameObjects.Graphics;
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private caught = false;
  private moveTimer: Phaser.Time.TimerEvent | null = null;
  private ratTimer: Phaser.Time.TimerEvent | null = null;
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
    this.timeLeft = this.difficulty === 'hard' ? 45 : this.difficulty === 'medium' ? 55 : 60;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0908');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

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
      this.add.text(GAME_WIDTH / 2, 30, job.name, {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
      }).setOrigin(0.5);
    }

    this.add.text(GAME_WIDTH / 2, 48, 'Catch the rat! Collect fish along the way.', {
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

    // Draw rat
    const ratWorld = this.cellToWorld(this.ratPos.r, this.ratPos.c);
    this.ratGfx = this.add.circle(ratWorld.x, ratWorld.y, CELL / 2 - 3, RAT_COLOR);
    this.ratEyes = this.add.graphics();
    this.drawRatEyes(ratWorld.x, ratWorld.y);

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
      eventBus.emit('navigate', 'TownScene');
    });

    // Input: WASD / Arrow keys
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.caught) return;
      const dir = this.keyToDir(event.key);
      if (dir) this.moveCat(dir.dr, dir.dc);
    });

    // Virtual d-pad for mobile (below maze)
    const dpadY = MAZE_Y + MAZE_H + 70;
    const dpadX = GAME_WIDTH / 2;
    const dpadSize = 40;
    const dpadGap = 4;

    const makeArrow = (x: number, y: number, dr: number, dc: number, label: string) => {
      const btn = this.add.rectangle(x, y, dpadSize, dpadSize, 0x2a2520, 0.8);
      btn.setStrokeStyle(1, 0x6b5b3e);
      btn.setInteractive({ useHandCursor: true });
      this.add.text(x, y, label, { fontSize: '18px', color: '#c4956a' }).setOrigin(0.5);
      btn.on('pointerdown', () => { if (!this.caught) this.moveCat(dr, dc); });
    };

    makeArrow(dpadX, dpadY - dpadSize - dpadGap, -1, 0, '\u25B2'); // Up
    makeArrow(dpadX, dpadY + dpadSize + dpadGap, 1, 0, '\u25BC');  // Down
    makeArrow(dpadX - dpadSize - dpadGap, dpadY, 0, -1, '\u25C0'); // Left
    makeArrow(dpadX + dpadSize + dpadGap, dpadY, 0, 1, '\u25B6');  // Right

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
    this.tweens.add({
      targets: this.ratEyes, x: 0, y: 0, duration: 0,
      onComplete: () => this.drawRatEyes(dest.x, dest.y),
    });
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
      eventBus.emit('navigate', 'TownScene');
    });
  }

  private cleanup(): void {
    this.moveTimer?.destroy();
    this.ratTimer?.destroy();
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
