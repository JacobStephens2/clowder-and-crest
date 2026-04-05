import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';

// ──── Constants ────
const SOKOBAN_GRID = 7;
const SOKOBAN_TILE = 48;
const GRID_PX = SOKOBAN_GRID * SOKOBAN_TILE;
const OFFSET_X = Math.floor((GAME_WIDTH - GRID_PX) / 2);
const OFFSET_Y = 95;

const BG_COLOR = 0x1c1b19;
const FLOOR_COLOR_A = 0x2e2a25;
const FLOOR_COLOR_B = 0x322e28;
const WALL_COLOR = 0x1a1816;
const WALL_TOP_COLOR = 0x2a2520;
const GRID_LINE_COLOR = 0x3a3530;
const HIGHLIGHT_COLOR = 0xc4956a;
const CRATE_COLOR = 0x8b7355;
const CRATE_ON_TARGET = 0x6b9a5a;
const TARGET_COLOR = 0x4a8a4a;

// Cell types
const EMPTY = 0;
const WALL = 1;
const FLOOR = 2;

// ──── Sokoban level type ────
interface SokobanLevel {
  grid: number[][];      // EMPTY/WALL/FLOOR
  playerStart: { r: number; c: number };
  crates: { r: number; c: number }[];
  targets: { r: number; c: number }[];
  minMoves: number;
}

// ──── Direction helpers ────
const DIR_OFFSETS: Record<string, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

// ──── Procedural level generation ────

function generateSokobanLevel(numCrates: number, minMoveTarget: number, maxMoveTarget: number): SokobanLevel | null {
  // We use reverse placement: place player+crates on targets, then do random
  // pulls (reverse pushes) to move crates away from targets, ensuring solvability.
  for (let attempt = 0; attempt < 200; attempt++) {
    const level = tryGenerateLevel(numCrates, minMoveTarget, maxMoveTarget);
    if (level) return level;
  }
  return null;
}

function tryGenerateLevel(numCrates: number, minMoveTarget: number, maxMoveTarget: number): SokobanLevel | null {
  // Create a grid with walls around the border and a clear interior
  const grid: number[][] = [];
  for (let r = 0; r < SOKOBAN_GRID; r++) {
    grid[r] = [];
    for (let c = 0; c < SOKOBAN_GRID; c++) {
      if (r === 0 || r === SOKOBAN_GRID - 1 || c === 0 || c === SOKOBAN_GRID - 1) {
        grid[r][c] = WALL;
      } else {
        grid[r][c] = FLOOR;
      }
    }
  }

  // Add some interior walls (2-5 random walls) to make it interesting
  const interiorCells: { r: number; c: number }[] = [];
  for (let r = 1; r < SOKOBAN_GRID - 1; r++) {
    for (let c = 1; c < SOKOBAN_GRID - 1; c++) {
      interiorCells.push({ r, c });
    }
  }
  shuffle(interiorCells);

  const numWalls = 2 + Math.floor(Math.random() * 4); // 2-5 interior walls
  const wallCells: { r: number; c: number }[] = [];
  for (let i = 0; i < Math.min(numWalls, interiorCells.length); i++) {
    wallCells.push(interiorCells[i]);
    grid[interiorCells[i].r][interiorCells[i].c] = WALL;
  }

  // Get remaining floor cells
  const floorCells: { r: number; c: number }[] = [];
  for (let r = 1; r < SOKOBAN_GRID - 1; r++) {
    for (let c = 1; c < SOKOBAN_GRID - 1; c++) {
      if (grid[r][c] === FLOOR) floorCells.push({ r, c });
    }
  }

  // Verify connectivity of floor cells
  if (!isConnected(grid, floorCells)) return null;
  if (floorCells.length < numCrates + 2) return null;

  shuffle(floorCells);

  // Pick target positions for crates
  const targets = floorCells.slice(0, numCrates);
  // Initial crate positions = on targets (solved state)
  const cratePositions = targets.map(t => ({ ...t }));
  // Player starts adjacent to first crate if possible
  const playerCandidates = floorCells.filter(f =>
    !targets.some(t => t.r === f.r && t.c === f.c)
  );
  if (playerCandidates.length === 0) return null;

  // Find player start adjacent to any crate
  let playerPos: { r: number; c: number } | null = null;
  for (const pc of playerCandidates) {
    for (const crate of cratePositions) {
      if (Math.abs(pc.r - crate.r) + Math.abs(pc.c - crate.c) === 1) {
        playerPos = { ...pc };
        break;
      }
    }
    if (playerPos) break;
  }
  if (!playerPos) {
    playerPos = playerCandidates[0];
  }

  // Now do reverse moves (pulls): from the solved state, reverse-play to create a puzzle.
  // A "pull" means: player walks to the opposite side of a crate and pulls it back.
  // This is equivalent to: player pushes crate in reverse.
  const dirs = Object.values(DIR_OFFSETS);
  let moves = 0;
  const visited = new Set<string>();
  visited.add(stateKey(playerPos, cratePositions));

  for (let step = 0; step < maxMoveTarget * 3 && moves < maxMoveTarget; step++) {
    // Pick a random crate and direction to pull
    const crateIdx = Math.floor(Math.random() * cratePositions.length);
    const dir = dirs[Math.floor(Math.random() * dirs.length)];

    const crate = cratePositions[crateIdx];
    // To pull crate in direction (dr,dc): player must be at crate + (dr,dc),
    // and crate moves to crate - (dr,dc) (the opposite)
    // Actually in reverse: player goes to the pull side, crate moves opposite to push dir
    // Reverse of "player pushes crate in dir (dr,dc)":
    //   - Before push: player at crate-dir, crate at crate
    //   - After push: player at crate, crate at crate+dir
    // So reverse: player is at crate, pull crate from crate+dir back to crate, player goes to crate+dir
    // Wait, let me think more carefully about reverse Sokoban.

    // Forward: player at (pr,pc), pushes crate at (pr+dr, pc+dc) to (pr+2dr, pc+2dc), player moves to (pr+dr, pc+dc)
    // Reverse: player at (pr+dr, pc+dc) with crate at (pr+2dr, pc+2dc), "unpush" => player goes to (pr, pc), crate goes to (pr+dr, pc+dc)
    // In other words: reverse move means player moves in a direction, and if there's a crate behind them (opposite direction), that crate follows.

    // Simpler approach: just pick a crate, pick a direction to pull it.
    // Player needs to be on the side of the crate in direction dir (at crate.r+dir.dr, crate.c+dir.dc).
    // The crate gets pulled to (crate.r+dir.dr, crate.c+dir.dc) and player moves to (crate.r+2*dir.dr, crate.c+2*dir.dc).
    // Wait no. Let me think about this differently.

    // "Pull" = reverse of push. If we think of the forward game:
    // Push: player walks INTO a crate => crate moves. player at (r,c), crate at (r+dr, c+dc), crate goes to (r+2dr, c+2dc). Player ends at (r+dr, c+dc).
    // Reverse of that: player is at (r+dr, c+dc), crate is at (r+2dr, c+2dc). After reverse, player is at (r, c), crate is at (r+dr, c+dc).
    // So: player moves in direction (-dr, -dc), pulling the crate from (player.r + dr, player.c + dc) to (player.r, player.c), and player ends at (player.r - dr, player.c - dc).

    // Requirements:
    //   1. There's a crate at (playerPos.r + dir.dr, playerPos.c + dir.dc)
    //   2. (playerPos.r - dir.dr, playerPos.c - dir.dc) is floor and not occupied by a crate
    //   3. playerPos is not a crate (it shouldn't be)

    const pullFromR = playerPos.r + dir.dr;
    const pullFromC = playerPos.c + dir.dc;
    const playerDestR = playerPos.r - dir.dr;
    const playerDestC = playerPos.c - dir.dc;

    // Check if there's a crate to pull
    const pullCrateIdx = cratePositions.findIndex(cp => cp.r === pullFromR && cp.c === pullFromC);
    if (pullCrateIdx < 0) {
      // No crate to pull; player can still just walk in that direction without pulling
      // Try just moving the player (no pull)
      const walkDestR = playerPos.r - dir.dr;
      const walkDestC = playerPos.c - dir.dc;
      if (isFloorCell(grid, walkDestR, walkDestC) && !cratePositions.some(cp => cp.r === walkDestR && cp.c === walkDestC)) {
        playerPos.r = walkDestR;
        playerPos.c = walkDestC;
        moves++;
      }
      continue;
    }

    // Check destination for player
    if (!isFloorCell(grid, playerDestR, playerDestC)) continue;
    if (cratePositions.some(cp => cp.r === playerDestR && cp.c === playerDestC)) continue;

    // Do the pull
    const oldCrateR = cratePositions[pullCrateIdx].r;
    const oldCrateC = cratePositions[pullCrateIdx].c;
    cratePositions[pullCrateIdx].r = playerPos.r;
    cratePositions[pullCrateIdx].c = playerPos.c;
    playerPos.r = playerDestR;
    playerPos.c = playerDestC;
    moves++;

    // Check if we got a deadlocked crate (in a corner with walls on two adjacent sides)
    if (isCrateDeadlocked(grid, cratePositions[pullCrateIdx], targets, cratePositions)) {
      // Undo
      cratePositions[pullCrateIdx].r = oldCrateR;
      cratePositions[pullCrateIdx].c = oldCrateC;
      playerPos.r = playerDestR + dir.dr;
      playerPos.c = playerDestC + dir.dc;
      moves--;
      continue;
    }

    const key = stateKey(playerPos, cratePositions);
    if (visited.has(key)) {
      // Undo to avoid loops
      cratePositions[pullCrateIdx].r = oldCrateR;
      cratePositions[pullCrateIdx].c = oldCrateC;
      playerPos.r = playerDestR + dir.dr;
      playerPos.c = playerDestC + dir.dc;
      moves--;
      continue;
    }
    visited.add(key);
  }

  // Check that crates are not all still on targets (puzzle would be trivially solved)
  const cratesOnTargets = cratePositions.filter(cp => targets.some(t => t.r === cp.r && t.c === cp.c)).length;
  if (cratesOnTargets === numCrates) return null;

  // Now solve forward with BFS to verify solvability and find minMoves
  const solution = solveSokoban(grid, playerPos, cratePositions, targets);
  if (solution < 0) return null; // unsolvable
  if (solution < minMoveTarget || solution > maxMoveTarget) return null;

  return {
    grid,
    playerStart: playerPos,
    crates: cratePositions,
    targets,
    minMoves: solution,
  };
}

function isCrateDeadlocked(
  grid: number[][],
  crate: { r: number; c: number },
  targets: { r: number; c: number }[],
  _allCrates: { r: number; c: number }[]
): boolean {
  // A crate is simple-deadlocked if it's in a corner (two adjacent walls) and not on a target
  if (targets.some(t => t.r === crate.r && t.c === crate.c)) return false;

  const wallUp = !isFloorCell2(grid, crate.r - 1, crate.c);
  const wallDown = !isFloorCell2(grid, crate.r + 1, crate.c);
  const wallLeft = !isFloorCell2(grid, crate.r, crate.c - 1);
  const wallRight = !isFloorCell2(grid, crate.r, crate.c + 1);

  // Corner deadlock
  if ((wallUp && wallLeft) || (wallUp && wallRight) || (wallDown && wallLeft) || (wallDown && wallRight)) {
    return true;
  }
  return false;
}

function isFloorCell(grid: number[][], r: number, c: number): boolean {
  return r >= 0 && r < SOKOBAN_GRID && c >= 0 && c < SOKOBAN_GRID && grid[r][c] === FLOOR;
}

function isFloorCell2(grid: number[][], r: number, c: number): boolean {
  // Same as isFloorCell but for deadlock check — out of bounds counts as wall
  if (r < 0 || r >= SOKOBAN_GRID || c < 0 || c >= SOKOBAN_GRID) return false;
  return grid[r][c] === FLOOR;
}

function stateKey(player: { r: number; c: number }, crates: { r: number; c: number }[]): string {
  const sorted = crates.map(c => `${c.r},${c.c}`).sort();
  return `${player.r},${player.c}|${sorted.join(';')}`;
}

function isConnected(grid: number[][], floorCells: { r: number; c: number }[]): boolean {
  if (floorCells.length === 0) return false;
  const visited = new Set<string>();
  const queue = [floorCells[0]];
  visited.add(`${floorCells[0].r},${floorCells[0].c}`);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const dir of Object.values(DIR_OFFSETS)) {
      const nr = cur.r + dir.dr;
      const nc = cur.c + dir.dc;
      const key = `${nr},${nc}`;
      if (!visited.has(key) && isFloorCell(grid, nr, nc)) {
        visited.add(key);
        queue.push({ r: nr, c: nc });
      }
    }
  }
  return visited.size === floorCells.length;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ──── BFS Sokoban Solver ────
// Returns minimum pushes (we count all player moves) to solve, or -1 if unsolvable.
// State = (playerR, playerC, crate positions sorted).
// We count every player step as a move (not just pushes).

function solveSokoban(
  grid: number[][],
  player: { r: number; c: number },
  crates: { r: number; c: number }[],
  targets: { r: number; c: number }[]
): number {
  const initCrates = crates.map(c => ({ ...c }));
  const initKey = stateKey(player, initCrates);

  // Check if already solved
  if (isSolved(initCrates, targets)) return 0;

  const visited = new Set<string>();
  visited.add(initKey);

  interface BFSState {
    pr: number;
    pc: number;
    crates: { r: number; c: number }[];
    moves: number;
  }

  const queue: BFSState[] = [{ pr: player.r, pc: player.c, crates: initCrates, moves: 0 }];

  // Limit BFS to avoid taking too long
  const MAX_STATES = 150000;
  let statesExplored = 0;

  while (queue.length > 0 && statesExplored < MAX_STATES) {
    const state = queue.shift()!;
    statesExplored++;

    for (const dir of Object.values(DIR_OFFSETS)) {
      const nr = state.pr + dir.dr;
      const nc = state.pc + dir.dc;

      if (!isFloorCell(grid, nr, nc)) continue;

      // Check if there's a crate at (nr, nc)
      const crateIdx = state.crates.findIndex(c => c.r === nr && c.c === nc);
      let newCrates = state.crates;

      if (crateIdx >= 0) {
        // Trying to push a crate
        const pushR = nr + dir.dr;
        const pushC = nc + dir.dc;
        if (!isFloorCell(grid, pushR, pushC)) continue;
        // Can't push into another crate
        if (state.crates.some(c => c.r === pushR && c.c === pushC)) continue;

        newCrates = state.crates.map((c, i) =>
          i === crateIdx ? { r: pushR, c: pushC } : { ...c }
        );

        // Simple deadlock detection
        if (isCrateDeadlocked(grid, newCrates[crateIdx], targets, newCrates)) continue;
      } else {
        newCrates = state.crates.map(c => ({ ...c }));
      }

      const key = stateKey({ r: nr, c: nc }, newCrates);
      if (visited.has(key)) continue;
      visited.add(key);

      if (isSolved(newCrates, targets)) {
        return state.moves + 1;
      }

      queue.push({ pr: nr, pc: nc, crates: newCrates, moves: state.moves + 1 });
    }
  }

  return -1; // unsolvable or too complex
}

function isSolved(crates: { r: number; c: number }[], targets: { r: number; c: number }[]): boolean {
  return targets.every(t => crates.some(c => c.r === t.r && c.c === t.c));
}

// ──── Fallback hand-crafted levels ────

const FALLBACK_LEVELS: Record<string, SokobanLevel[]> = {
  easy: [
    {
      grid: [
        [1,1,1,1,1,1,1],
        [1,2,2,2,2,2,1],
        [1,2,2,2,2,2,1],
        [1,2,2,1,2,2,1],
        [1,2,2,2,2,2,1],
        [1,2,2,2,2,2,1],
        [1,1,1,1,1,1,1],
      ],
      playerStart: { r: 1, c: 1 },
      crates: [{ r: 2, c: 3 }, { r: 4, c: 3 }],
      targets: [{ r: 2, c: 5 }, { r: 4, c: 5 }],
      minMoves: 10,
    },
    {
      grid: [
        [1,1,1,1,1,1,1],
        [1,2,2,2,1,2,1],
        [1,2,2,2,2,2,1],
        [1,2,1,2,2,2,1],
        [1,2,2,2,2,2,1],
        [1,2,2,2,2,2,1],
        [1,1,1,1,1,1,1],
      ],
      playerStart: { r: 1, c: 1 },
      crates: [{ r: 2, c: 2 }, { r: 4, c: 4 }],
      targets: [{ r: 5, c: 1 }, { r: 5, c: 5 }],
      minMoves: 12,
    },
    {
      grid: [
        [1,1,1,1,1,1,1],
        [1,2,2,2,2,2,1],
        [1,2,1,2,1,2,1],
        [1,2,2,2,2,2,1],
        [1,2,1,2,1,2,1],
        [1,2,2,2,2,2,1],
        [1,1,1,1,1,1,1],
      ],
      playerStart: { r: 3, c: 3 },
      crates: [{ r: 1, c: 3 }, { r: 3, c: 1 }],
      targets: [{ r: 5, c: 3 }, { r: 3, c: 5 }],
      minMoves: 8,
    },
  ],
  medium: [
    {
      grid: [
        [1,1,1,1,1,1,1],
        [1,2,2,2,2,2,1],
        [1,2,1,2,2,2,1],
        [1,2,2,2,1,2,1],
        [1,2,2,1,2,2,1],
        [1,2,2,2,2,2,1],
        [1,1,1,1,1,1,1],
      ],
      playerStart: { r: 1, c: 1 },
      crates: [{ r: 2, c: 3 }, { r: 3, c: 2 }, { r: 4, c: 4 }],
      targets: [{ r: 5, c: 1 }, { r: 5, c: 3 }, { r: 5, c: 5 }],
      minMoves: 18,
    },
    {
      grid: [
        [1,1,1,1,1,1,1],
        [1,2,2,1,2,2,1],
        [1,2,2,2,2,2,1],
        [1,2,2,2,2,2,1],
        [1,2,2,2,2,2,1],
        [1,2,2,1,2,2,1],
        [1,1,1,1,1,1,1],
      ],
      playerStart: { r: 3, c: 3 },
      crates: [{ r: 2, c: 2 }, { r: 2, c: 4 }, { r: 4, c: 3 }],
      targets: [{ r: 4, c: 1 }, { r: 4, c: 5 }, { r: 1, c: 3 }],
      minMoves: 16,
    },
    {
      grid: [
        [1,1,1,1,1,1,1],
        [1,2,2,2,2,2,1],
        [1,2,2,2,2,2,1],
        [1,1,2,2,2,1,1],
        [1,2,2,2,2,2,1],
        [1,2,2,2,2,2,1],
        [1,1,1,1,1,1,1],
      ],
      playerStart: { r: 1, c: 1 },
      crates: [{ r: 2, c: 2 }, { r: 2, c: 4 }, { r: 4, c: 3 }],
      targets: [{ r: 5, c: 2 }, { r: 5, c: 4 }, { r: 1, c: 3 }],
      minMoves: 20,
    },
  ],
  hard: [
    {
      grid: [
        [1,1,1,1,1,1,1],
        [1,2,2,2,2,2,1],
        [1,2,1,2,1,2,1],
        [1,2,2,2,2,2,1],
        [1,2,1,2,1,2,1],
        [1,2,2,2,2,2,1],
        [1,1,1,1,1,1,1],
      ],
      playerStart: { r: 3, c: 3 },
      crates: [{ r: 1, c: 1 }, { r: 1, c: 5 }, { r: 5, c: 1 }, { r: 5, c: 5 }],
      targets: [{ r: 1, c: 3 }, { r: 3, c: 1 }, { r: 3, c: 5 }, { r: 5, c: 3 }],
      minMoves: 24,
    },
    {
      grid: [
        [1,1,1,1,1,1,1],
        [1,2,2,2,2,2,1],
        [1,2,2,1,2,2,1],
        [1,2,2,2,2,2,1],
        [1,2,2,1,2,2,1],
        [1,2,2,2,2,2,1],
        [1,1,1,1,1,1,1],
      ],
      playerStart: { r: 1, c: 1 },
      crates: [{ r: 1, c: 4 }, { r: 3, c: 2 }, { r: 3, c: 4 }, { r: 5, c: 2 }],
      targets: [{ r: 1, c: 5 }, { r: 3, c: 1 }, { r: 5, c: 5 }, { r: 5, c: 1 }],
      minMoves: 22,
    },
  ],
};

function getLevelForDifficulty(difficulty: string): SokobanLevel {
  const config: Record<string, { crates: number; min: number; max: number }> = {
    easy: { crates: 2, min: 8, max: 15 },
    medium: { crates: 3, min: 15, max: 25 },
    hard: { crates: 4, min: 20, max: 40 },
  };

  const params = config[difficulty] ?? config.easy;
  const generated = generateSokobanLevel(params.crates, params.min, params.max);
  if (generated) return generated;

  // Fallback to hand-crafted levels
  const fallbacks = FALLBACK_LEVELS[difficulty] ?? FALLBACK_LEVELS.easy;
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ──── Scene ────

interface MoveRecord {
  playerR: number;
  playerC: number;
  crates: { r: number; c: number }[];
}

export class SokobanScene extends Phaser.Scene {
  private level!: SokobanLevel;
  private playerPos = { r: 0, c: 0 };
  private crates: { r: number; c: number }[] = [];
  private moveCount = 0;
  private moveHistory: MoveRecord[] = [];
  private solved = false;
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';

  // Display objects
  private playerSprite!: Phaser.GameObjects.Sprite | Phaser.GameObjects.Ellipse;
  private crateSprites: Phaser.GameObjects.Rectangle[] = [];
  private targetMarkers: Phaser.GameObjects.Rectangle[] = [];
  private floorTiles: Phaser.GameObjects.Rectangle[] = [];
  private inputLocked = false;

  constructor() {
    super({ key: 'SokobanScene' });
  }

  init(data: { difficulty?: string; jobId?: string; catId?: string }): void {
    this.difficulty = data.difficulty ?? 'easy';
    this.jobId = data.jobId ?? '';
    this.catId = data.catId ?? '';
    const save = getGameState();
    const cat = save?.cats.find(c => c.id === this.catId);
    this.catBreed = cat?.breed ?? 'wildcat';
    this.moveCount = 0;
    this.moveHistory = [];
    this.crateSprites = [];
    this.targetMarkers = [];
    this.floorTiles = [];
    this.solved = false;
    this.inputLocked = false;
  }

  create(): void {
    // Tutorial on first play
    if (!localStorage.getItem('clowder_sokoban_tutorial')) {
      localStorage.setItem('clowder_sokoban_tutorial', '1');
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
      t.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:12px">Push Crates</div>
        <div style="color:#8b7355;font-family:Georgia,serif;font-size:14px;text-align:center;max-width:280px;line-height:1.6">
          Push crates onto the <strong style="color:#4a8a4a">green targets</strong>.<br><br>
          Use <strong>WASD</strong>, <strong>arrow keys</strong>, or <strong>tap</strong> to move.<br><br>
          You can only push — not pull. Don't get stuck!
        </div>
        <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:12px;margin-top:20px">Tap to start</div>
      `;
      t.addEventListener('click', () => t.remove());
      document.body.appendChild(t);
    }

    // Generate or pick a level
    this.level = getLevelForDifficulty(this.difficulty);
    this.playerPos = { ...this.level.playerStart };
    this.crates = this.level.crates.map(c => ({ ...c }));

    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Draw grid background
    this.add.rectangle(
      OFFSET_X + GRID_PX / 2, OFFSET_Y + GRID_PX / 2,
      GRID_PX, GRID_PX, BG_COLOR
    );

    // Draw floor tiles and walls
    for (let r = 0; r < SOKOBAN_GRID; r++) {
      for (let c = 0; c < SOKOBAN_GRID; c++) {
        const px = OFFSET_X + c * SOKOBAN_TILE + SOKOBAN_TILE / 2;
        const py = OFFSET_Y + r * SOKOBAN_TILE + SOKOBAN_TILE / 2;

        if (this.level.grid[r][c] === WALL) {
          // Wall: darker with a raised top effect
          const wallBase = this.add.rectangle(px, py, SOKOBAN_TILE, SOKOBAN_TILE, WALL_COLOR);
          wallBase.setStrokeStyle(1, 0x111111, 0.5);
          // Top highlight for depth
          this.add.rectangle(px, py - 3, SOKOBAN_TILE - 2, SOKOBAN_TILE - 6, WALL_TOP_COLOR)
            .setAlpha(0.6);
        } else {
          // Floor: checkerboard pattern
          const floorColor = (r + c) % 2 === 0 ? FLOOR_COLOR_A : FLOOR_COLOR_B;
          const tile = this.add.rectangle(px, py, SOKOBAN_TILE - 1, SOKOBAN_TILE - 1, floorColor);
          tile.setStrokeStyle(1, GRID_LINE_COLOR, 0.3);
          this.floorTiles.push(tile);
        }
      }
    }

    // Draw target markers (beneath crates and player)
    for (const target of this.level.targets) {
      const px = OFFSET_X + target.c * SOKOBAN_TILE + SOKOBAN_TILE / 2;
      const py = OFFSET_Y + target.r * SOKOBAN_TILE + SOKOBAN_TILE / 2;

      // Diamond shape target marker
      const marker = this.add.rectangle(px, py, SOKOBAN_TILE * 0.5, SOKOBAN_TILE * 0.5, TARGET_COLOR, 0.4);
      marker.setAngle(45);
      marker.setStrokeStyle(2, TARGET_COLOR, 0.7);
      this.targetMarkers.push(marker);
    }

    // Draw crates
    for (let i = 0; i < this.crates.length; i++) {
      const crate = this.crates[i];
      const px = OFFSET_X + crate.c * SOKOBAN_TILE + SOKOBAN_TILE / 2;
      const py = OFFSET_Y + crate.r * SOKOBAN_TILE + SOKOBAN_TILE / 2;

      const isOnTarget = this.level.targets.some(t => t.r === crate.r && t.c === crate.c);
      const color = isOnTarget ? CRATE_ON_TARGET : CRATE_COLOR;
      const rect = this.add.rectangle(px, py, SOKOBAN_TILE - 6, SOKOBAN_TILE - 6, color);
      rect.setStrokeStyle(2, 0x000000, 0.4);
      rect.setDepth(2);

      // Cross detail on crate
      const gfx = this.add.graphics();
      gfx.lineStyle(2, 0x000000, 0.15);
      gfx.lineBetween(px - 12, py - 12, px + 12, py + 12);
      gfx.lineBetween(px + 12, py - 12, px - 12, py + 12);
      gfx.setDepth(3);

      this.crateSprites.push(rect);
    }

    // Draw player cat
    this.createPlayerSprite();

    // Job name
    const job = getJob(this.jobId);
    if (job) {
      this.add.text(GAME_WIDTH / 2, 42, job.name, {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#8b7355',
      }).setOrigin(0.5);
    }

    // Move counter
    this.add.text(GAME_WIDTH / 2, 58, 'Moves: 0', {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#c4956a',
    }).setOrigin(0.5).setName('moveText');

    // Target moves display
    this.add.text(GAME_WIDTH / 2, 77, `Target: ${this.level.minMoves} moves`, {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#6b5b3e',
    }).setOrigin(0.5);

    // Buttons
    const btnY = OFFSET_Y + GRID_PX + 50;
    this.createButton(GAME_WIDTH / 2, btnY, 'Quit', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownScene');
    });

    // Keyboard input
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown', (event: KeyboardEvent) => {
        if (this.solved || this.inputLocked) return;
        switch (event.key) {
          case 'ArrowUp': case 'w': case 'W':
            this.tryMove('up'); break;
          case 'ArrowDown': case 's': case 'S':
            this.tryMove('down'); break;
          case 'ArrowLeft': case 'a': case 'A':
            this.tryMove('left'); break;
          case 'ArrowRight': case 'd': case 'D':
            this.tryMove('right'); break;
        }
      });
    }

    // Tap/click input for movement (on the grid only)
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.solved || this.inputLocked) return;

      const worldX = pointer.x / DPR;
      const worldY = pointer.y / DPR;

      // Only accept taps within the puzzle grid area
      if (worldX < OFFSET_X || worldX > OFFSET_X + GRID_PX ||
          worldY < OFFSET_Y || worldY > OFFSET_Y + GRID_PX) return;

      const playerPx = OFFSET_X + this.playerPos.c * SOKOBAN_TILE + SOKOBAN_TILE / 2;
      const playerPy = OFFSET_Y + this.playerPos.r * SOKOBAN_TILE + SOKOBAN_TILE / 2;

      const dx = worldX - playerPx;
      const dy = worldY - playerPy;

      // Larger dead zone to prevent accidental moves
      if (Math.abs(dx) < SOKOBAN_TILE * 0.5 && Math.abs(dy) < SOKOBAN_TILE * 0.5) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.tryMove(dx > 0 ? 'right' : 'left');
      } else {
        this.tryMove(dy > 0 ? 'down' : 'up');
      }
    });

    // Swipe gesture for mobile
    let swipeStart: { x: number; y: number } | null = null;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      swipeStart = { x: pointer.x / DPR, y: pointer.y / DPR };
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!swipeStart || this.solved || this.inputLocked) { swipeStart = null; return; }
      const endX = pointer.x / DPR;
      const endY = pointer.y / DPR;
      const dx = endX - swipeStart.x;
      const dy = endY - swipeStart.y;
      swipeStart = null;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 30) return; // too short — let tap handler deal with it
      if (Math.abs(dx) > Math.abs(dy)) {
        this.tryMove(dx > 0 ? 'right' : 'left');
      } else {
        this.tryMove(dy > 0 ? 'down' : 'up');
      }
    });

    // Virtual d-pad for mobile (below the grid)
    const dpadY = OFFSET_Y + GRID_PX + 100;
    const dpadX = GAME_WIDTH / 2;
    const dpadSize = 44;
    const dpadGap = 4;

    const makeArrow = (x: number, y: number, dir: string, label: string) => {
      const btn = this.add.rectangle(x, y, dpadSize, dpadSize, 0x2a2520, 0.8);
      btn.setStrokeStyle(1, 0x6b5b3e);
      btn.setInteractive({ useHandCursor: true });
      this.add.text(x, y, label, { fontSize: '20px', color: '#c4956a' }).setOrigin(0.5);
      btn.on('pointerdown', () => {
        if (!this.solved && !this.inputLocked) this.tryMove(dir);
      });
    };

    makeArrow(dpadX, dpadY - dpadSize - dpadGap, 'up', '\u25B2');
    makeArrow(dpadX, dpadY + dpadSize + dpadGap, 'down', '\u25BC');
    makeArrow(dpadX - dpadSize - dpadGap, dpadY, 'left', '\u25C0');
    makeArrow(dpadX + dpadSize + dpadGap, dpadY, 'right', '\u25B6');

    eventBus.emit('show-ui');
  }

  private createPlayerSprite(): void {
    const px = OFFSET_X + this.playerPos.c * SOKOBAN_TILE + SOKOBAN_TILE / 2;
    const py = OFFSET_Y + this.playerPos.r * SOKOBAN_TILE + SOKOBAN_TILE / 2;

    const idleKey = `${this.catBreed}_idle_south`;
    if (this.textures.exists(idleKey)) {
      this.playerSprite = this.add.sprite(px, py, idleKey);
      (this.playerSprite as Phaser.GameObjects.Sprite).setScale(0.85);
      (this.playerSprite as Phaser.GameObjects.Sprite).texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    } else {
      // Fallback: colored ellipse
      this.playerSprite = this.add.ellipse(px, py, SOKOBAN_TILE * 0.6, SOKOBAN_TILE * 0.5, HIGHLIGHT_COLOR);
      (this.playerSprite as Phaser.GameObjects.Ellipse).setStrokeStyle(2, 0x000000, 0.3);
    }
    this.playerSprite.setDepth(5);
  }

  private tryMove(direction: string): void {
    const dir = DIR_OFFSETS[direction];
    if (!dir) return;

    const newR = this.playerPos.r + dir.dr;
    const newC = this.playerPos.c + dir.dc;

    // Check bounds and walls
    if (!isFloorCell(this.level.grid, newR, newC)) return;

    // Check if there's a crate
    const crateIdx = this.crates.findIndex(c => c.r === newR && c.c === newC);
    if (crateIdx >= 0) {
      // Try to push the crate
      const pushR = newR + dir.dr;
      const pushC = newC + dir.dc;

      // Can't push into wall
      if (!isFloorCell(this.level.grid, pushR, pushC)) return;
      // Can't push into another crate
      if (this.crates.some(c => c.r === pushR && c.c === pushC)) return;

      // Save state for undo
      this.moveHistory.push({
        playerR: this.playerPos.r,
        playerC: this.playerPos.c,
        crates: this.crates.map(c => ({ ...c })),
      });

      // Move crate
      this.crates[crateIdx].r = pushR;
      this.crates[crateIdx].c = pushC;
    } else {
      // No crate — just walk
      this.moveHistory.push({
        playerR: this.playerPos.r,
        playerC: this.playerPos.c,
        crates: this.crates.map(c => ({ ...c })),
      });
    }

    // Move player
    this.playerPos.r = newR;
    this.playerPos.c = newC;
    this.moveCount++;
    this.updateMoveText();
    if (crateIdx >= 0) playSfx('crate_push', 0.3);

    // Animate
    this.animateMove(direction, crateIdx);

    // Check win
    if (isSolved(this.crates, this.level.targets)) {
      this.inputLocked = true;
      this.time.delayedCall(300, () => this.winPuzzle());
    }
  }

  private animateMove(direction: string, pushedCrateIdx: number): void {
    const px = OFFSET_X + this.playerPos.c * SOKOBAN_TILE + SOKOBAN_TILE / 2;
    const py = OFFSET_Y + this.playerPos.r * SOKOBAN_TILE + SOKOBAN_TILE / 2;

    // Update player sprite direction if it's a Sprite
    if (this.playerSprite instanceof Phaser.GameObjects.Sprite) {
      const dirMap: Record<string, string> = {
        up: 'north', down: 'south', left: 'west', right: 'east',
      };
      const idleKey = `${this.catBreed}_idle_${dirMap[direction] ?? 'south'}`;
      if (this.textures.exists(idleKey)) {
        this.playerSprite.setTexture(idleKey);
      }
    }

    // Smooth move animation
    this.tweens.add({
      targets: this.playerSprite,
      x: px,
      y: py,
      duration: 100,
      ease: 'Power1',
    });

    // Animate pushed crate
    if (pushedCrateIdx >= 0 && this.crateSprites[pushedCrateIdx]) {
      const crate = this.crates[pushedCrateIdx];
      const cpx = OFFSET_X + crate.c * SOKOBAN_TILE + SOKOBAN_TILE / 2;
      const cpy = OFFSET_Y + crate.r * SOKOBAN_TILE + SOKOBAN_TILE / 2;

      this.tweens.add({
        targets: this.crateSprites[pushedCrateIdx],
        x: cpx,
        y: cpy,
        duration: 100,
        ease: 'Power1',
      });
    }

    // Update crate colors (on-target vs off-target)
    this.updateCrateColors();
  }

  private updateCrateColors(): void {
    for (let i = 0; i < this.crates.length; i++) {
      const crate = this.crates[i];
      const isOnTarget = this.level.targets.some(t => t.r === crate.r && t.c === crate.c);
      this.crateSprites[i]?.setFillStyle(isOnTarget ? CRATE_ON_TARGET : CRATE_COLOR);
    }
  }

  private winPuzzle(): void {
    this.solved = true;

    const stars = this.calculateStars();

    // Flash all crates green
    for (const sprite of this.crateSprites) {
      this.tweens.add({
        targets: sprite,
        alpha: 0.6,
        yoyo: true,
        repeat: 2,
        duration: 200,
      });
    }

    // Emit puzzle-complete event after brief celebration
    this.time.delayedCall(800, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `sokoban_${this.difficulty}`,
        moves: this.moveCount,
        minMoves: this.level.minMoves,
        stars,
        jobId: this.jobId,
        catId: this.catId,
      });
    });
  }

  private calculateStars(): number {
    if (this.moveCount <= this.level.minMoves) return 3;
    if (this.moveCount <= this.level.minMoves * 1.5) return 2;
    return 1;
  }

  private updateMoveText(): void {
    const moveText = this.children.getByName('moveText') as Phaser.GameObjects.Text;
    if (moveText) moveText.setText(`Moves: ${this.moveCount}`);
  }

  private undo(): void {
    if (this.moveHistory.length === 0 || this.solved) return;
    const last = this.moveHistory.pop()!;
    this.playerPos.r = last.playerR;
    this.playerPos.c = last.playerC;
    this.crates = last.crates.map(c => ({ ...c }));
    this.moveCount = Math.max(0, this.moveCount - 1);
    this.updateMoveText();
    this.repositionAll();
  }

  private resetPuzzle(): void {
    if (this.solved) return;
    this.playerPos = { ...this.level.playerStart };
    this.crates = this.level.crates.map(c => ({ ...c }));
    this.moveCount = 0;
    this.moveHistory = [];
    this.updateMoveText();
    this.repositionAll();
  }

  private repositionAll(): void {
    // Player
    const ppx = OFFSET_X + this.playerPos.c * SOKOBAN_TILE + SOKOBAN_TILE / 2;
    const ppy = OFFSET_Y + this.playerPos.r * SOKOBAN_TILE + SOKOBAN_TILE / 2;
    this.playerSprite.setPosition(ppx, ppy);

    // Update player direction sprite to south on reset
    if (this.playerSprite instanceof Phaser.GameObjects.Sprite) {
      const idleKey = `${this.catBreed}_idle_south`;
      if (this.textures.exists(idleKey)) {
        this.playerSprite.setTexture(idleKey);
      }
    }

    // Crates
    for (let i = 0; i < this.crates.length; i++) {
      const crate = this.crates[i];
      const cpx = OFFSET_X + crate.c * SOKOBAN_TILE + SOKOBAN_TILE / 2;
      const cpy = OFFSET_Y + crate.r * SOKOBAN_TILE + SOKOBAN_TILE / 2;
      this.crateSprites[i]?.setPosition(cpx, cpy);
    }

    this.updateCrateColors();
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 90, 36, 0x2a2520, 0.9);
    bg.setStrokeStyle(1, 0x6b5b3e);
    bg.setInteractive({ useHandCursor: true });

    this.add.text(x, y, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#c4956a',
    }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x3a3530));
    bg.on('pointerout', () => bg.setFillStyle(0x2a2520));
    bg.on('pointerdown', onClick);
  }
}
