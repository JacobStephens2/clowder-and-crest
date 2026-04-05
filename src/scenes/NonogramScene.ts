import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';

// Grid sizes per difficulty
const GRID_SIZES: Record<string, number> = { easy: 5, medium: 7, hard: 8 };

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

// ── Puzzle generation ──

function generateSolution(size: number): boolean[][] {
  // Generate a random pattern with ~40-55% fill for interesting clues
  const grid: boolean[][] = [];
  const fillRate = 0.4 + Math.random() * 0.15;
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(Math.random() < fillRate);
    }
    grid[r] = row;
  }
  // Ensure no completely empty rows or columns
  for (let r = 0; r < size; r++) {
    if (grid[r].every((v) => !v)) grid[r][Math.floor(Math.random() * size)] = true;
  }
  for (let c = 0; c < size; c++) {
    if (grid.every((row) => !row[c])) grid[Math.floor(Math.random() * size)][c] = true;
  }
  return grid;
}

function getClues(line: boolean[]): number[] {
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

export class NonogramScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private difficulty = 'easy';
  private gridSize = 5;
  private solution: boolean[][] = [];
  private playerGrid: (0 | 1 | 2)[][] = []; // 0=empty, 1=filled, 2=marked-X
  private rowClues: number[][] = [];
  private colClues: number[][] = [];
  private cellSize = 40;
  private gridLeft = 0;
  private gridTop = 0;
  private solved = false;
  private mistakes = 0;
  private fillMode = true; // true=fill, false=mark X
  private cellSprites: Phaser.GameObjects.Rectangle[][] = [];
  private rowClueTexts: Phaser.GameObjects.Text[][] = [];
  private colClueTexts: Phaser.GameObjects.Text[][] = [];
  private mistakeText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private tutorialShowing = false;

  constructor() {
    super({ key: 'NonogramScene' });
  }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    this.gridSize = GRID_SIZES[this.difficulty] ?? 5;
    this.solved = false;
    this.mistakes = 0;
    this.fillMode = true;
    this.cellSprites = [];
    this.rowClueTexts = [];
    this.colClueTexts = [];

    // Generate puzzle
    this.solution = generateSolution(this.gridSize);
    this.rowClues = getRowClues(this.solution);
    this.colClues = getColClues(this.solution);
    this.playerGrid = Array.from({ length: this.gridSize }, () =>
      Array(this.gridSize).fill(0)
    );

    // Calculate cell size to fit screen
    const maxGridWidth = GAME_WIDTH - CLUE_SPACE - 20;
    const maxGridHeight = GAME_HEIGHT - GRID_TOP - CLUE_SPACE - 140;
    this.cellSize = Math.floor(Math.min(maxGridWidth / this.gridSize, maxGridHeight / this.gridSize));
    this.cellSize = Math.min(this.cellSize, 48);

    const gridPx = this.gridSize * (this.cellSize + CELL_GAP);
    this.gridLeft = Math.floor((GAME_WIDTH - gridPx) / 2 + CLUE_SPACE / 2);
    this.gridTop = GRID_TOP + CLUE_SPACE;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial
    if (!localStorage.getItem('clowder_nonogram_tutorial')) {
      localStorage.setItem('clowder_nonogram_tutorial', '1');
      this.tutorialShowing = true;
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
      t.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:12px">Nonogram</div>
        <div style="color:#8b7355;font-family:Georgia,serif;font-size:14px;text-align:center;max-width:300px;line-height:1.6">
          Fill in the grid to reveal a hidden pattern.<br><br>
          The <strong>numbers</strong> on each row and column tell you how many consecutive cells to fill.<br><br>
          Use the <strong>Fill/Mark</strong> toggle to switch between filling cells and marking empties.<br><br>
          Fewer mistakes = more stars!
        </div>
        <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:12px;margin-top:20px">Tap to start</div>
      `;
      t.addEventListener('click', () => { t.remove(); this.tutorialShowing = false; });
      document.body.appendChild(t);
    }

    // Job title
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, job?.name ?? 'Nonogram', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 52, `${this.gridSize}x${this.gridSize} — Find the pattern`, {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // Mistake counter
    this.mistakeText = this.add.text(GAME_WIDTH - 20, 75, 'Mistakes: 0', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#8b7355',
    }).setOrigin(1, 0.5);

    // Draw clues
    this.drawRowClues();
    this.drawColClues();

    // Draw grid
    this.drawGrid();

    // Mode toggle button
    const toggleY = this.gridTop + this.gridSize * (this.cellSize + CELL_GAP) + 30;
    const toggleBg = this.add.rectangle(GAME_WIDTH / 2 - 60, toggleY, 100, 34, 0x2a2520);
    toggleBg.setStrokeStyle(1, BORDER_COLOR);
    toggleBg.setInteractive({ useHandCursor: true });
    this.modeText = this.add.text(GAME_WIDTH / 2 - 60, toggleY, '\u2588 Fill', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#c4956a',
    }).setOrigin(0.5);

    toggleBg.on('pointerdown', () => {
      this.fillMode = !this.fillMode;
      this.modeText.setText(this.fillMode ? '\u2588 Fill' : '\u2717 Mark');
      this.modeText.setColor(this.fillMode ? '#c4956a' : '#888');
    });

    // Quit button
    const quitBg = this.add.rectangle(GAME_WIDTH / 2 + 60, toggleY, 100, 34, 0x2a2520);
    quitBg.setStrokeStyle(1, BORDER_COLOR);
    quitBg.setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2 + 60, toggleY, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#c4956a',
    }).setOrigin(0.5);
    quitBg.on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownScene');
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'TownScene');
  }

  private drawRowClues(): void {
    const fontSize = this.gridSize >= 8 ? '9px' : '11px';
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
    const fontSize = this.gridSize >= 8 ? '9px' : '11px';
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
      for (let c = 0; c < this.gridSize; c++) {
        const x = this.gridLeft + c * (this.cellSize + CELL_GAP) + this.cellSize / 2;
        const y = this.gridTop + r * (this.cellSize + CELL_GAP) + this.cellSize / 2;

        const cell = this.add.rectangle(x, y, this.cellSize, this.cellSize, EMPTY_COLOR);
        cell.setStrokeStyle(1, BORDER_COLOR);
        cell.setInteractive({ useHandCursor: true });

        cell.on('pointerdown', () => {
          if (this.solved || this.tutorialShowing) return;
          this.handleCellClick(r, c);
        });

        row.push(cell);
      }
      this.cellSprites.push(row);
    }
  }

  private handleCellClick(r: number, c: number): void {
    const current = this.playerGrid[r][c];

    if (this.fillMode) {
      if (current === 1) return; // already filled
      if (current === 2) {
        // Unmark — go back to empty
        this.playerGrid[r][c] = 0;
        this.cellSprites[r][c].setFillStyle(EMPTY_COLOR);
        this.updateClueColors();
        return;
      }
      // Fill the cell
      if (this.solution[r][c]) {
        // Correct
        this.playerGrid[r][c] = 1;
        this.cellSprites[r][c].setFillStyle(FILL_COLOR);
        playSfx('tap', 0.3);
      } else {
        // Mistake
        this.mistakes++;
        this.mistakeText.setText(`Mistakes: ${this.mistakes}`);
        this.playerGrid[r][c] = 2; // auto-mark as X
        this.cellSprites[r][c].setFillStyle(0x5a2020);
        // Flash red briefly then show mark
        this.time.delayedCall(300, () => {
          if (this.playerGrid[r][c] === 2) {
            this.cellSprites[r][c].setFillStyle(MARK_COLOR);
          }
        });
        playSfx('fail', 0.3);
        this.cameras.main.flash(100, 80, 30, 30, false);
      }
    } else {
      // Mark mode — toggle X mark
      if (current === 1) return; // can't mark a filled cell
      if (current === 2) {
        this.playerGrid[r][c] = 0;
        this.cellSprites[r][c].setFillStyle(EMPTY_COLOR);
      } else {
        this.playerGrid[r][c] = 2;
        this.cellSprites[r][c].setFillStyle(MARK_COLOR);
      }
    }

    this.updateClueColors();
    this.checkWin();
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

  private checkWin(): void {
    // Win when all solution cells are filled (mistakes don't prevent winning)
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.solution[r][c] && this.playerGrid[r][c] !== 1) return;
      }
    }

    this.solved = true;
    playSfx('victory');

    // Auto-fill remaining marks
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (!this.solution[r][c] && this.playerGrid[r][c] === 0) {
          this.playerGrid[r][c] = 2;
          this.cellSprites[r][c].setFillStyle(MARK_COLOR);
        }
      }
    }
    this.updateClueColors();

    const stars = this.mistakes === 0 ? 3 : this.mistakes <= 2 ? 2 : 1;
    const totalCells = this.solution.flat().filter(Boolean).length;

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'Pattern Found!', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `nonogram_${this.difficulty}_${this.gridSize}`,
        moves: totalCells + this.mistakes,
        minMoves: totalCells,
        stars,
        jobId: this.jobId,
        catId: this.catId,
      });
    });
  }
}
