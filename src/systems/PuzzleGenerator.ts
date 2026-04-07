import puzzlesData from '../data/puzzles.json';

export interface PuzzleBlock {
  id: string;
  x: number;
  y: number;
  length: number;
  orientation: 'horizontal' | 'vertical';
  isTarget: boolean;
}

export interface PuzzleConfig {
  id: string;
  /** Themed name surfaced above the puzzle (e.g. "Gridlock", "First Slide").
      Optional — generated puzzles use a generic "Random Jam" label. The
      doc's "level-as-lesson" pillar: every puzzle should have an identity. */
  name?: string;
  /** One-line description of the insight the puzzle teaches. Hand-curated
      puzzles get authored concepts; procgen puzzles fall back to a generic. */
  concept?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  minMoves: number;
  exitSide: 'right' | 'left' | 'top' | 'bottom';
  exitRow: number;
  blocks: PuzzleBlock[];
}

// Validate every authored puzzle at module load. The BFS solver acts as
// the source of truth for minMoves: if the authored value drifts from the
// BFS optimum (e.g. someone edited the JSON without recomputing par), we
// log a warning and silently auto-correct so the player still sees the
// correct target. Unsolvable puzzles are excluded entirely.
const puzzles: PuzzleConfig[] = (() => {
  const raw = puzzlesData as PuzzleConfig[];
  const validated: PuzzleConfig[] = [];
  for (const p of raw) {
    const result = isSolvable(p);
    if (!result.solvable) {
      console.warn(`[PuzzleGenerator] Puzzle "${p.id}" (${p.name ?? 'unnamed'}) is UNSOLVABLE — excluding from library`);
      continue;
    }
    if (result.minMoves !== p.minMoves) {
      console.warn(`[PuzzleGenerator] Puzzle "${p.id}" (${p.name ?? 'unnamed'}) authored minMoves=${p.minMoves} but BFS optimum is ${result.minMoves} — auto-correcting`);
      validated.push({ ...p, minMoves: result.minMoves });
    } else {
      validated.push(p);
    }
  }
  return validated;
})();

export function getPuzzle(id: string): PuzzleConfig | undefined {
  return puzzles.find((p) => p.id === id);
}

export function getPuzzleByDifficulty(difficulty: string): PuzzleConfig | undefined {
  const matching = puzzles.filter((p) => p.difficulty === difficulty);
  if (matching.length === 0) return puzzles[0];
  return matching[Math.floor(Math.random() * matching.length)];
}

export function getAllPuzzles(): PuzzleConfig[] {
  return puzzles;
}

// ── Procedural puzzle generation ──

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function cellsOccupied(blocks: PuzzleBlock[]): Set<string> {
  const set = new Set<string>();
  for (const b of blocks) {
    for (let i = 0; i < b.length; i++) {
      const cx = b.orientation === 'horizontal' ? b.x + i : b.x;
      const cy = b.orientation === 'vertical' ? b.y + i : b.y;
      set.add(`${cx},${cy}`);
    }
  }
  return set;
}

function tryPlaceBlock(occupied: Set<string>, gridSize: number): PuzzleBlock | null {
  const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
  const length = Math.random() < 0.6 ? 2 : 3;

  for (let attempt = 0; attempt < 20; attempt++) {
    const x = orientation === 'horizontal' ? randomInt(0, gridSize - length) : randomInt(0, gridSize - 1);
    const y = orientation === 'vertical' ? randomInt(0, gridSize - length) : randomInt(0, gridSize - 1);

    let fits = true;
    for (let i = 0; i < length; i++) {
      const cx = orientation === 'horizontal' ? x + i : x;
      const cy = orientation === 'vertical' ? y + i : y;
      if (occupied.has(`${cx},${cy}`)) { fits = false; break; }
    }

    if (fits) {
      return { id: '', x, y, length, orientation, isTarget: false };
    }
  }
  return null;
}

const DIFFICULTY_PARAMS: Record<string, { minBlocks: number; maxBlocks: number; minMoves: number; maxMoves: number }> = {
  easy: { minBlocks: 5, maxBlocks: 7, minMoves: 5, maxMoves: 12 },
  medium: { minBlocks: 7, maxBlocks: 10, minMoves: 8, maxMoves: 18 },
  hard: { minBlocks: 9, maxBlocks: 12, minMoves: 12, maxMoves: 30 },
};

export function generatePuzzle(difficulty: 'easy' | 'medium' | 'hard'): PuzzleConfig | null {
  const params = DIFFICULTY_PARAMS[difficulty];
  const exitRow = randomInt(1, 4);

  for (let gen = 0; gen < 50; gen++) {
    const blocks: PuzzleBlock[] = [];

    // Place target block (always horizontal on the exit row)
    const targetX = randomInt(0, 2);
    blocks.push({
      id: 'cat',
      x: targetX,
      y: exitRow,
      length: 2,
      orientation: 'horizontal',
      isTarget: true,
    });

    // Place obstacle blocks
    const numBlocks = randomInt(params.minBlocks, params.maxBlocks);
    const occupied = cellsOccupied(blocks);

    for (let i = 0; i < numBlocks; i++) {
      const block = tryPlaceBlock(occupied, 6);
      if (block) {
        block.id = `b${i}`;
        blocks.push(block);
        // Update occupied
        for (let j = 0; j < block.length; j++) {
          const cx = block.orientation === 'horizontal' ? block.x + j : block.x;
          const cy = block.orientation === 'vertical' ? block.y + j : block.y;
          occupied.add(`${cx},${cy}`);
        }
      }
    }

    const config: PuzzleConfig = {
      id: `gen_${difficulty}_${Date.now()}_${gen}`,
      name: 'Random Jam',
      concept: 'A procedurally generated traffic snarl.',
      difficulty,
      minMoves: 0,
      exitSide: 'right',
      exitRow,
      blocks,
    };

    // Verify solvability via BFS
    const result = isSolvable(config);
    if (result.solvable && result.minMoves >= params.minMoves && result.minMoves <= params.maxMoves) {
      config.minMoves = result.minMoves;
      return config;
    }
  }

  // Fallback: return a hand-designed puzzle
  return getPuzzleByDifficulty(difficulty) ?? null;
}

// BFS solver to verify puzzle solvability
interface GridState {
  positions: Map<string, { x: number; y: number }>;
}

function serializeState(state: GridState): string {
  const entries = Array.from(state.positions.entries()).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([id, pos]) => `${id}:${pos.x},${pos.y}`).join('|');
}

function isOccupied(state: GridState, blocks: PuzzleBlock[], x: number, y: number, excludeId: string): boolean {
  for (const block of blocks) {
    if (block.id === excludeId) continue;
    const pos = state.positions.get(block.id)!;
    for (let i = 0; i < block.length; i++) {
      const bx = block.orientation === 'horizontal' ? pos.x + i : pos.x;
      const by = block.orientation === 'vertical' ? pos.y + i : pos.y;
      if (bx === x && by === y) return true;
    }
  }
  return false;
}

export function isSolvable(config: PuzzleConfig): { solvable: boolean; minMoves: number } {
  const initial: GridState = {
    positions: new Map(config.blocks.map((b) => [b.id, { x: b.x, y: b.y }])),
  };

  const target = config.blocks.find((b) => b.isTarget)!;
  const visited = new Set<string>();
  const queue: { state: GridState; moves: number }[] = [{ state: initial, moves: 0 }];
  visited.add(serializeState(initial));

  while (queue.length > 0) {
    const { state, moves } = queue.shift()!;

    // Check win condition
    const targetPos = state.positions.get(target.id)!;
    if (config.exitSide === 'right' && targetPos.x + target.length > 5) {
      return { solvable: true, minMoves: moves };
    }

    // Generate all possible moves
    for (const block of config.blocks) {
      const pos = state.positions.get(block.id)!;

      if (block.orientation === 'horizontal') {
        // Try moving left
        for (let newX = pos.x - 1; newX >= 0; newX--) {
          if (isOccupied(state, config.blocks, newX, pos.y, block.id)) break;
          const newState: GridState = {
            positions: new Map(state.positions),
          };
          newState.positions.set(block.id, { x: newX, y: pos.y });
          const key = serializeState(newState);
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: newState, moves: moves + 1 });
          }
        }
        // Try moving right
        for (let newX = pos.x + 1; newX + block.length <= 6; newX++) {
          if (isOccupied(state, config.blocks, newX + block.length - 1, pos.y, block.id)) break;
          const newState: GridState = {
            positions: new Map(state.positions),
          };
          newState.positions.set(block.id, { x: newX, y: pos.y });

          // Special: if this is the target and it exits the grid
          if (block.isTarget && config.exitSide === 'right' && newX + block.length > 5) {
            return { solvable: true, minMoves: moves + 1 };
          }

          const key = serializeState(newState);
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: newState, moves: moves + 1 });
          }
        }
      } else {
        // Vertical: try moving up
        for (let newY = pos.y - 1; newY >= 0; newY--) {
          if (isOccupied(state, config.blocks, pos.x, newY, block.id)) break;
          const newState: GridState = {
            positions: new Map(state.positions),
          };
          newState.positions.set(block.id, { x: pos.x, y: newY });
          const key = serializeState(newState);
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: newState, moves: moves + 1 });
          }
        }
        // Try moving down
        for (let newY = pos.y + 1; newY + block.length <= 6; newY++) {
          if (isOccupied(state, config.blocks, pos.x, newY + block.length - 1, block.id)) break;
          const newState: GridState = {
            positions: new Map(state.positions),
          };
          newState.positions.set(block.id, { x: pos.x, y: newY });
          const key = serializeState(newState);
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: newState, moves: moves + 1 });
          }
        }
      }
    }
  }

  return { solvable: false, minMoves: -1 };
}
