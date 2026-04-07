import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { showMinigameTutorial } from '../ui/sceneHelpers';

// Grid sizes per difficulty — multiples of 5 per the genre's UX rule.
// "Grids should always be multiples of 5 in both dimensions. The 5-cell
// grouping rhythm is a cognitive anchor."
const GRID_SIZES: Record<string, number> = { easy: 5, medium: 10, hard: 15 };

// Layout
const CLUE_SPACE = 60; // space for clue numbers
const GRID_TOP = 130;
const CELL_GAP = 1;

const FILL_COLOR = 0xc4956a;
const MARK_COLOR = 0x555555;
const EMPTY_COLOR = 0x2a2520;
const BORDER_COLOR = 0x6b5b3e;
const CORRECT_CLUE = '#6b8ea6';
const PENDING_CLUE = '#8b7355';

// ── Themed image library ──
//
// Per the doc's "thematically resonant" principle: hand-crafted guild-relevant
// pixel art beats random fills. Each image's grid is validated for unique
// solvability at load time via constraint propagation; if it fails, we try
// the next one. Each row of `grid` is a string where '#' = filled, '.' = empty.
// This is more readable than nested boolean arrays.
interface NonogramImage {
  name: string;
  grid: string[];
}

const THEMED_IMAGES: Record<string, NonogramImage[]> = {
  easy: [
    {
      name: 'Plus',
      grid: [
        '..#..',
        '..#..',
        '#####',
        '..#..',
        '..#..',
      ],
    },
    {
      name: 'Diamond',
      grid: [
        '..#..',
        '.###.',
        '#####',
        '.###.',
        '..#..',
      ],
    },
    {
      name: 'Frame',
      grid: [
        '#####',
        '#...#',
        '#...#',
        '#...#',
        '#####',
      ],
    },
    {
      name: 'Arrow',
      grid: [
        '..#..',
        '.###.',
        '#####',
        '..#..',
        '..#..',
      ],
    },
    {
      name: 'Heart',
      grid: [
        '.#.#.',
        '#####',
        '#####',
        '.###.',
        '..#..',
      ],
    },
    {
      name: 'Hourglass',
      grid: [
        '#####',
        '.###.',
        '..#..',
        '.###.',
        '#####',
      ],
    },
  ],
  medium: [
    {
      // 10x10 cat face — ears, eyes, whiskers, mouth
      name: 'Cat Face',
      grid: [
        '##......##',
        '###....###',
        '##########',
        '#.#.##.#.#',
        '##########',
        '####..####',
        '##.####.##',
        '###....###',
        '.########.',
        '..######..',
      ],
    },
    {
      // 10x10 fish silhouette
      name: 'Fish',
      grid: [
        '..........',
        '..#######.',
        '.########.',
        '##########',
        '##########',
        '##########',
        '##########',
        '.########.',
        '..#######.',
        '..........',
      ],
    },
    {
      // 10x10 key
      name: 'Key',
      grid: [
        '..####....',
        '.######...',
        '##....##..',
        '##....##..',
        '##....##..',
        '.######...',
        '..####....',
        '...##.....',
        '...##.##..',
        '...##.....',
      ],
    },
    {
      // 10x10 crown
      name: 'Crown',
      grid: [
        '..........',
        '#..#..#..#',
        '##.##.##.#',
        '##########',
        '##########',
        '##.####.##',
        '##.####.##',
        '##########',
        '##########',
        '..........',
      ],
    },
  ],
  hard: [
    {
      // 15x15 sitting cat silhouette
      name: 'Sitting Cat',
      grid: [
        '...............',
        '...##......##..',
        '..####....####.',
        '..############.',
        '..############.',
        '..#.##.##.##.#.',
        '..############.',
        '..############.',
        '...##########..',
        '...##########..',
        '....########...',
        '...##########..',
        '..############.',
        '...##########..',
        '....########...',
      ],
    },
    {
      // 15x15 guild crest — diamond emblem with banner
      name: 'Guild Crest',
      grid: [
        '...............',
        '......###......',
        '.....#####.....',
        '....#######....',
        '...#########...',
        '..###########..',
        '.#############.',
        '###############',
        '.#############.',
        '..###########..',
        '...#########...',
        '....#######....',
        '.....#####.....',
        '......###......',
        '...............',
      ],
    },
    {
      // 15x15 lantern with frame and flame
      name: 'Lantern',
      grid: [
        '......#........',
        '.....###.......',
        '....#####......',
        '....#####......',
        '...#######.....',
        '..#########....',
        '..#########....',
        '..#.#####.#....',
        '..#.#####.#....',
        '..#.#####.#....',
        '..#########....',
        '..#########....',
        '...#######.....',
        '....#####......',
        '.....###.......',
      ],
    },
  ],
};

function parseImage(img: NonogramImage): boolean[][] {
  return img.grid.map((row) => row.split('').map((ch) => ch === '#'));
}

// ── Clue helpers ──

export function getClues(line: boolean[]): number[] {
  const clues: number[] = [];
  let run = 0;
  for (const cell of line) {
    if (cell) {
      run++;
    } else if (run > 0) {
      clues.push(run);
      run = 0;
    }
  }
  if (run > 0) clues.push(run);
  return clues.length > 0 ? clues : [0];
}

function getRowClues(solution: boolean[][]): number[][] {
  return solution.map((row) => getClues(row));
}

function getColClues(solution: boolean[][]): number[][] {
  const size = solution.length;
  const clues: number[][] = [];
  for (let c = 0; c < size; c++) {
    const col = solution.map((row) => row[c]);
    clues.push(getClues(col));
  }
  return clues;
}

// ── Unique-solvability validator ──
//
// Per "Sacred Rule #1": every puzzle must have exactly one solution
// reachable by pure logic without guessing. We confirm this with a line
// solver (enumerate all valid placements per line and intersect them) plus
// iterative constraint propagation across rows and columns until fixpoint.
//
// If the propagator reaches a fully-determined grid, the puzzle is uniquely
// solvable by logic. If it stalls with cells still unknown, the puzzle
// requires guessing — fail.

type Cell = -1 | 0 | 1; // -1 unknown, 0 empty, 1 filled

/** Generate all valid placements of `clues` against the constraint `line`,
    where line cells of -1 are unknown. Returns the list of complete patterns. */
function enumerateLine(line: Cell[], clues: number[]): (0 | 1)[][] {
  const len = line.length;
  // Single-clue [0] means an entirely-empty line
  if (clues.length === 1 && clues[0] === 0) {
    const empty = line.map(() => 0 as 0 | 1);
    for (let i = 0; i < len; i++) {
      if (line[i] === 1) return [];
    }
    return [empty];
  }

  const results: (0 | 1)[][] = [];
  function place(idx: number, pos: number, current: (0 | 1)[]): void {
    if (results.length > 5000) return; // safety cap
    if (idx === clues.length) {
      // Fill the rest with empties
      const filled: (0 | 1)[] = current.slice();
      while (filled.length < len) filled.push(0);
      // Check consistency with constraints
      for (let i = 0; i < len; i++) {
        if (line[i] !== -1 && line[i] !== filled[i]) return;
      }
      results.push(filled);
      return;
    }
    const block = clues[idx];
    // Compute remaining minimum length needed for the rest
    let minRemaining = 0;
    for (let i = idx + 1; i < clues.length; i++) minRemaining += clues[i] + 1;
    const maxStart = len - block - minRemaining;
    for (let start = pos; start <= maxStart; start++) {
      const next: (0 | 1)[] = current.slice();
      // Pad with empties up to start
      while (next.length < start) next.push(0);
      // Place the block
      for (let i = 0; i < block; i++) next.push(1);
      // Insert separator if more blocks coming
      if (idx < clues.length - 1) next.push(0);
      // Verify consistency so far
      let ok = true;
      for (let i = 0; i < next.length; i++) {
        if (line[i] !== -1 && line[i] !== next[i]) { ok = false; break; }
      }
      if (!ok) continue;
      place(idx + 1, next.length, next);
    }
  }
  place(0, 0, []);
  return results;
}

/** Run one pass of line-solving on the given line. Returns true if any cell
    became newly determined. The line is mutated in place. */
function solveLine(line: Cell[], clues: number[]): boolean {
  const placements = enumerateLine(line, clues);
  if (placements.length === 0) return false;
  let changed = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== -1) continue;
    const v = placements[0][i];
    if (placements.every((p) => p[i] === v)) {
      line[i] = v as 0 | 1;
      changed = true;
    }
  }
  return changed;
}

/** Confirm an image is uniquely solvable by pure logic (constraint
    propagation reaches a fully-determined grid without guessing). */
export function isUniquelySolvable(solution: boolean[][]): boolean {
  const size = solution.length;
  const rowClues = getRowClues(solution);
  const colClues = getColClues(solution);
  const grid: Cell[][] = Array.from({ length: size }, () => Array(size).fill(-1) as Cell[]);

  let iterations = 0;
  const maxIterations = size * size * 4;
  while (iterations < maxIterations) {
    let changed = false;
    iterations++;
    for (let r = 0; r < size; r++) {
      const line = grid[r].slice();
      if (solveLine(line, rowClues[r])) {
        for (let c = 0; c < size; c++) grid[r][c] = line[c];
        changed = true;
      }
    }
    for (let c = 0; c < size; c++) {
      const line = grid.map((row) => row[c]);
      if (solveLine(line, colClues[c])) {
        for (let r = 0; r < size; r++) grid[r][c] = line[r];
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Solved if no -1 left AND it matches the original solution
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === -1) return false;
      if ((grid[r][c] === 1) !== solution[r][c]) return false;
    }
  }
  return true;
}

/** Pick a themed image for the requested difficulty. Tries each image in
    random order, validates with the constraint solver, and returns the
    first one that passes. Returns null if none validate (which would be a
    bug worth catching in CI rather than papering over). */
function pickValidatedImage(difficulty: string): { name: string; grid: boolean[][] } | null {
  const list = THEMED_IMAGES[difficulty] ?? THEMED_IMAGES.easy;
  const indices = [...list.keys()];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  for (const idx of indices) {
    const img = list[idx];
    const grid = parseImage(img);
    if (isUniquelySolvable(grid)) {
      return { name: img.name, grid };
    }
  }
  return null;
}

export class NonogramScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private difficulty = 'easy';
  gridSize = 5;
  solution: boolean[][] = [];
  imageName = '';
  // 0=empty, 1=filled, 2=marked-X — public so the playtest can poke it
  playerGrid: (0 | 1 | 2)[][] = [];
  rowClues: number[][] = [];
  colClues: number[][] = [];
  private cellSize = 40;
  private gridLeft = 0;
  private gridTop = 0;
  solved = false;
  fillMode = true; // true=fill, false=mark X
  private cellSprites: Phaser.GameObjects.Rectangle[][] = [];
  private cellMarks: (Phaser.GameObjects.Text | null)[][] = [];
  private rowClueTexts: Phaser.GameObjects.Text[][] = [];
  private colClueTexts: Phaser.GameObjects.Text[][] = [];
  private progressText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private tutorialShowing = false;
  /** Undo stack — every cell change pushes a previous state. The doc lists
      "no undo" as a top UX failure: a single misclick destroys solve trust. */
  private undoStack: { r: number; c: number; prev: 0 | 1 | 2 }[] = [];

  constructor() {
    super({ key: 'NonogramScene' });
  }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    // First nonogram ever? Always start with the smallest themed easy puzzle
    // to teach the rules without scale stress.
    const hasCompletedNonogram = localStorage.getItem('clowder_nonogram_completed');
    const wantedSize = hasCompletedNonogram ? (GRID_SIZES[this.difficulty] ?? 5) : 5;
    this.solved = false;
    this.fillMode = true;
    this.cellSprites = [];
    this.cellMarks = [];
    this.rowClueTexts = [];
    this.colClueTexts = [];
    this.undoStack = [];

    // Pick a themed image and validate uniqueness. The validator confirms
    // the puzzle reduces to a fully-determined solution by pure logic.
    // Falls back to easy if the requested difficulty has no images yet.
    const targetDifficulty = wantedSize === 5 ? 'easy' : wantedSize === 10 ? 'medium' : 'hard';
    let picked = pickValidatedImage(targetDifficulty);
    if (!picked) picked = pickValidatedImage('easy');
    // Last-resort fallback — the simplest themed image
    if (!picked) {
      picked = { name: 'Plus', grid: parseImage(THEMED_IMAGES.easy[0]) };
    }
    this.imageName = picked.name;
    this.solution = picked.grid;
    this.gridSize = picked.grid.length;
    this.rowClues = getRowClues(this.solution);
    this.colClues = getColClues(this.solution);
    this.playerGrid = Array.from({ length: this.gridSize }, () =>
      Array(this.gridSize).fill(0)
    );

    // Calculate cell size to fit screen
    const maxGridWidth = GAME_WIDTH - CLUE_SPACE - 20;
    const maxGridHeight = GAME_HEIGHT - GRID_TOP - CLUE_SPACE - 140;
    this.cellSize = Math.floor(Math.min(maxGridWidth / this.gridSize, maxGridHeight / this.gridSize));
    this.cellSize = Math.min(this.cellSize, 56);

    const gridPx = this.gridSize * (this.cellSize + CELL_GAP);
    this.gridLeft = Math.floor((GAME_WIDTH - gridPx) / 2 + CLUE_SPACE / 2);
    this.gridTop = GRID_TOP + CLUE_SPACE;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial bumped to v2 — the puzzle now has no penalty feedback,
    // hand-crafted thematic images, and an Undo button. Returning players
    // need to know the rules have softened.
    if (showMinigameTutorial(this, 'clowder_nonogram_tutorial_v2', 'Nonogram',
      `Reveal the hidden picture by filling the right cells.<br><br>
      The <strong>numbers</strong> on each row and column tell you how many consecutive cells to fill.<br><br>
      Use the <strong>Fill/Mark</strong> toggle: Fill for cells you're sure of, Mark (X) for cells you're sure are empty.<br><br>
      <strong>No penalties</strong> — solve by logic. <strong>Undo</strong> any mistake.`,
      () => { this.tutorialShowing = false; }
    )) {
      this.tutorialShowing = true;
    }

    // Job title
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, (`${job?.name ?? 'Nonogram'} (${this.difficulty})`), {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
    }).setOrigin(0.5);

    // Image name is hidden until solved — the doc's "reveal contract":
    // never spoil the picture before the player earns it. Show only the
    // grid size as the framing label.
    this.add.text(GAME_WIDTH / 2, 50, `${this.gridSize}\u00d7${this.gridSize} — Find the picture`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#c4956a',
    }).setOrigin(0.5);

    // Progress counter
    const totalFill = this.solution.flat().filter(Boolean).length;
    this.progressText = this.add.text(GAME_WIDTH / 2, 70, `0/${totalFill} filled`, {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // Draw clues
    this.drawRowClues();
    this.drawColClues();

    // Draw grid
    this.drawGrid();

    // Bottom button row: Fill/Mark toggle, Undo, Quit
    const toggleY = this.gridTop + this.gridSize * (this.cellSize + CELL_GAP) + 30;
    const btnW = 80;
    const btnH = 34;
    const btnGap = 8;
    const totalW = btnW * 3 + btnGap * 2;
    const startX = (GAME_WIDTH - totalW) / 2 + btnW / 2;

    // Fill/Mark toggle
    const toggleX = startX;
    const toggleBg = this.add.rectangle(toggleX, toggleY, btnW, btnH, 0x2a2520);
    toggleBg.setStrokeStyle(1, BORDER_COLOR);
    toggleBg.setInteractive({ useHandCursor: true });
    this.modeText = this.add.text(toggleX, toggleY, '\u2588 Fill', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#c4956a',
    }).setOrigin(0.5);
    toggleBg.on('pointerdown', () => {
      this.fillMode = !this.fillMode;
      this.modeText.setText(this.fillMode ? '\u2588 Fill' : '\u2717 Mark');
      this.modeText.setColor(this.fillMode ? '#c4956a' : '#888');
    });

    // Undo button — the doc's "no undo destroys solve trust" UX rule
    const undoX = startX + btnW + btnGap;
    const undoBg = this.add.rectangle(undoX, toggleY, btnW, btnH, 0x2a2520);
    undoBg.setStrokeStyle(1, BORDER_COLOR);
    undoBg.setInteractive({ useHandCursor: true });
    this.add.text(undoX, toggleY, '\u21B6 Undo', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#c4956a',
    }).setOrigin(0.5);
    undoBg.on('pointerdown', () => this.undo());

    // Quit button
    const quitX = startX + (btnW + btnGap) * 2;
    const quitBg = this.add.rectangle(quitX, toggleY, btnW, btnH, 0x2a2520);
    quitBg.setStrokeStyle(1, BORDER_COLOR);
    quitBg.setInteractive({ useHandCursor: true });
    this.add.text(quitX, toggleY, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#c4956a',
    }).setOrigin(0.5);
    quitBg.on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Clean up on scene stop (prevent timer/tween memory leaks)
    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });
    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  private drawRowClues(): void {
    const fontSize = this.gridSize >= 7 ? '10px' : '13px';
    for (let r = 0; r < this.gridSize; r++) {
      const y = this.gridTop + r * (this.cellSize + CELL_GAP) + this.cellSize / 2;
      const clue = this.rowClues[r];
      const texts: Phaser.GameObjects.Text[] = [];
      const clueStr = clue.join(' ');
      const t = this.add.text(this.gridLeft - 8, y, clueStr, {
        fontFamily: 'Georgia, serif', fontSize, color: PENDING_CLUE,
      }).setOrigin(1, 0.5);
      texts.push(t);
      this.rowClueTexts.push(texts);
    }
  }

  private drawColClues(): void {
    const fontSize = this.gridSize >= 7 ? '10px' : '13px';
    for (let c = 0; c < this.gridSize; c++) {
      const x = this.gridLeft + c * (this.cellSize + CELL_GAP) + this.cellSize / 2;
      const clue = this.colClues[c];
      const texts: Phaser.GameObjects.Text[] = [];
      const clueStr = clue.join('\n');
      const t = this.add.text(x, this.gridTop - 8, clueStr, {
        fontFamily: 'Georgia, serif', fontSize, color: PENDING_CLUE,
        align: 'center', lineSpacing: -2,
      }).setOrigin(0.5, 1);
      texts.push(t);
      this.colClueTexts.push(texts);
    }
  }

  private drawGrid(): void {
    for (let r = 0; r < this.gridSize; r++) {
      const row: Phaser.GameObjects.Rectangle[] = [];
      const marks: (Phaser.GameObjects.Text | null)[] = [];
      for (let c = 0; c < this.gridSize; c++) {
        const x = this.gridLeft + c * (this.cellSize + CELL_GAP) + this.cellSize / 2;
        const y = this.gridTop + r * (this.cellSize + CELL_GAP) + this.cellSize / 2;

        const cell = this.add.rectangle(x, y, this.cellSize, this.cellSize, EMPTY_COLOR);
        // Thicker border every 5th line for counting aid
        const borderW = (r > 0 && r % 5 === 0) || (c > 0 && c % 5 === 0) ? 2 : 1;
        cell.setStrokeStyle(borderW, BORDER_COLOR);
        cell.setInteractive({ useHandCursor: true });

        cell.on('pointerdown', () => {
          if (this.solved || this.tutorialShowing) return;
          this.handleCellClick(r, c);
        });

        row.push(cell);
        marks.push(null);
      }
      this.cellSprites.push(row);
      this.cellMarks.push(marks);
    }
  }

  private setMark(r: number, c: number, show: boolean): void {
    if (show && !this.cellMarks[r][c]) {
      const x = this.gridLeft + c * (this.cellSize + CELL_GAP) + this.cellSize / 2;
      const y = this.gridTop + r * (this.cellSize + CELL_GAP) + this.cellSize / 2;
      this.cellMarks[r][c] = this.add.text(x, y, '\u2717', {
        fontFamily: 'Georgia, serif', fontSize: `${Math.floor(this.cellSize * 0.55)}px`, color: '#6b5b3e',
      }).setOrigin(0.5);
    } else if (!show && this.cellMarks[r][c]) {
      this.cellMarks[r][c]!.destroy();
      this.cellMarks[r][c] = null;
    }
  }

  private updateProgress(): void {
    const filled = this.playerGrid.flat().filter((v) => v === 1).length;
    const totalFill = this.solution.flat().filter(Boolean).length;
    this.progressText.setText(`${filled}/${totalFill} filled`);
  }

  /** Cell tap handler. Per the doc's most important rule: NO penalty
      feedback. Filling a wrong cell just fills it — the player figures out
      the mistake from the clue colors and undoes it themselves. The puzzle
      is checked for completion only on full match. */
  handleCellClick(r: number, c: number): void {
    const current = this.playerGrid[r][c];
    let next: 0 | 1 | 2 = current;

    if (this.fillMode) {
      // Toggle: empty → filled, filled → empty, marked → empty
      if (current === 0) next = 1;
      else if (current === 1) next = 0;
      else next = 0;
    } else {
      // Mark mode: empty → marked, marked → empty, filled → filled (no-op)
      if (current === 1) return;
      if (current === 0) next = 2;
      else next = 0;
    }

    if (next === current) return;
    this.applyCellChange(r, c, next, /*record*/ true);
    playSfx('tap', 0.25);

    this.updateClueColors();
    this.updateProgress();
    this.checkWin();
  }

  /** Apply a cell state change and update visuals. Optionally records the
      previous state on the undo stack. Used by both the click handler and
      the undo() method. */
  private applyCellChange(r: number, c: number, next: 0 | 1 | 2, record: boolean): void {
    const prev = this.playerGrid[r][c];
    if (record) this.undoStack.push({ r, c, prev });
    this.playerGrid[r][c] = next;
    if (next === 1) {
      this.cellSprites[r][c].setFillStyle(FILL_COLOR);
      this.setMark(r, c, false);
    } else if (next === 2) {
      this.cellSprites[r][c].setFillStyle(EMPTY_COLOR);
      this.setMark(r, c, true);
    } else {
      this.cellSprites[r][c].setFillStyle(EMPTY_COLOR);
      this.setMark(r, c, false);
    }
  }

  /** Undo the last cell change. Restores the previous state without
      affecting the undo stack of any earlier changes. */
  undo(): void {
    if (this.solved) return;
    const last = this.undoStack.pop();
    if (!last) return;
    this.applyCellChange(last.r, last.c, last.prev, /*record*/ false);
    this.updateClueColors();
    this.updateProgress();
    playSfx('tap', 0.2);
  }

  private updateClueColors(): void {
    // Check each row
    for (let r = 0; r < this.gridSize; r++) {
      const playerLine = this.playerGrid[r].map((v) => v === 1);
      const playerClues = getClues(playerLine);
      const solved = JSON.stringify(playerClues) === JSON.stringify(this.rowClues[r]);
      for (const t of this.rowClueTexts[r]) {
        t.setColor(solved ? CORRECT_CLUE : PENDING_CLUE);
      }
    }
    // Check each column
    for (let c = 0; c < this.gridSize; c++) {
      const playerLine = this.playerGrid.map((row) => row[c] === 1);
      const playerClues = getClues(playerLine);
      const solved = JSON.stringify(playerClues) === JSON.stringify(this.colClues[c]);
      for (const t of this.colClueTexts[c]) {
        t.setColor(solved ? CORRECT_CLUE : PENDING_CLUE);
      }
    }
  }

  /** Win check: every solution cell is filled AND no non-solution cell is
      filled. The doc's "validate only on completion" rule means we don't
      tell the player they're wrong before then — but a single extra fill
      WILL prevent the win, so they have to be precise. */
  checkWin(): void {
    if (this.solved) return;
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const wantsFilled = this.solution[r][c];
        const isFilled = this.playerGrid[r][c] === 1;
        if (wantsFilled !== isFilled) return;
      }
    }

    this.solved = true;
    localStorage.setItem('clowder_nonogram_completed', '1');
    playSfx('victory');
    haptic.success();

    // Auto-mark remaining unmarked-empty cells so the picture stands out
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (!this.solution[r][c] && this.playerGrid[r][c] === 0) {
          this.playerGrid[r][c] = 2;
          this.setMark(r, c, true);
        }
      }
    }
    this.updateClueColors();

    // The genre's reward is the picture, not the score. Stars are flat 3
    // on solve — the doc explicitly warns against penalty-based scoring.
    const stars = 3;
    const totalCells = this.solution.flat().filter(Boolean).length;

    // Reveal the picture name now that the player has earned it
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'Picture Revealed!', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#c4956a',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 88, this.imageName, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#dda055',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `nonogram_${this.difficulty}_${this.gridSize}`,
        moves: totalCells,
        minMoves: totalCells,
        stars,
        jobId: this.jobId,
        catId: this.catId,
      });
    });
  }
}
