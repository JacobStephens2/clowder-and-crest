import Phaser from 'phaser';
import { type PuzzleConfig, type PuzzleBlock } from '../systems/PuzzleGenerator';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, GRID_SIZE, TILE_SIZE, PUZZLE_OFFSET_X, PUZZLE_OFFSET_Y } from '../utils/constants';

const GRID_COLOR = 0x2a2520;
const GRID_LINE_COLOR = 0x3a3530;
const TARGET_COLOR = 0xc4956a;
const BLOCK_COLORS = [0x6b8ea6, 0x8b7355, 0x7a6b5a, 0x5a7a6b, 0x8a6b7a, 0x6b7a5a, 0x7a5a6b, 0x5a6b8a, 0x6a8a5a, 0x8a7a5a, 0x5a8a7a, 0x7a8a6a];
const EXIT_COLOR = 0x4a8a4a;

interface BlockSprite {
  block: PuzzleBlock;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  startX: number;
  startY: number;
}

export class PuzzleScene extends Phaser.Scene {
  private config!: PuzzleConfig;
  private blockSprites: BlockSprite[] = [];
  private moveCount = 0;
  private dragBlock: BlockSprite | null = null;
  private dragStartPointer = { x: 0, y: 0 };
  private dragStartBlock = { x: 0, y: 0 };
  private moveHistory: { blockId: string; fromX: number; fromY: number }[] = [];
  private solved = false;
  private jobId: string = '';
  private catId: string = '';

  constructor() {
    super({ key: 'PuzzleScene' });
  }

  init(data: { puzzle: PuzzleConfig; jobId?: string; catId?: string }): void {
    this.config = JSON.parse(JSON.stringify(data.puzzle)); // deep clone
    this.jobId = data.jobId ?? '';
    this.catId = data.catId ?? '';
    this.moveCount = 0;
    this.moveHistory = [];
    this.blockSprites = [];
    this.solved = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Draw grid background
    const gridPx = GRID_SIZE * TILE_SIZE;
    const offsetX = PUZZLE_OFFSET_X;
    const offsetY = PUZZLE_OFFSET_Y;

    const gridBg = this.add.rectangle(
      offsetX + gridPx / 2, offsetY + gridPx / 2,
      gridPx, gridPx, GRID_COLOR
    );
    gridBg.setStrokeStyle(2, GRID_LINE_COLOR);

    // Grid lines
    const gfx = this.add.graphics();
    gfx.lineStyle(1, GRID_LINE_COLOR, 0.4);
    for (let i = 1; i < GRID_SIZE; i++) {
      gfx.lineBetween(offsetX + i * TILE_SIZE, offsetY, offsetX + i * TILE_SIZE, offsetY + gridPx);
      gfx.lineBetween(offsetX, offsetY + i * TILE_SIZE, offsetX + gridPx, offsetY + i * TILE_SIZE);
    }

    // Exit marker
    if (this.config.exitSide === 'right') {
      const ey = offsetY + this.config.exitRow * TILE_SIZE + TILE_SIZE / 2;
      const ex = offsetX + gridPx;
      this.add.triangle(ex + 12, ey, 0, -10, 0, 10, 16, 0, EXIT_COLOR).setAlpha(0.8);
    }

    // Create block sprites
    this.config.blocks.forEach((block, i) => {
      const w = block.orientation === 'horizontal' ? block.length * TILE_SIZE - 4 : TILE_SIZE - 4;
      const h = block.orientation === 'vertical' ? block.length * TILE_SIZE - 4 : TILE_SIZE - 4;
      const px = offsetX + block.x * TILE_SIZE + (block.orientation === 'horizontal' ? block.length * TILE_SIZE / 2 : TILE_SIZE / 2);
      const py = offsetY + block.y * TILE_SIZE + (block.orientation === 'vertical' ? block.length * TILE_SIZE / 2 : TILE_SIZE / 2);

      const color = block.isTarget ? TARGET_COLOR : BLOCK_COLORS[i % BLOCK_COLORS.length];
      const rect = this.add.rectangle(px, py, w, h, color);
      rect.setStrokeStyle(1, 0x000000, 0.3);
      rect.setInteractive({ draggable: true });

      const labelText = block.isTarget ? 'CAT' : '';
      const label = this.add.text(px, py, labelText, {
        fontFamily: 'Georgia, serif',
        fontSize: '11px',
        color: '#fff',
      }).setOrigin(0.5);

      const sprite: BlockSprite = { block, rect, label, startX: block.x, startY: block.y };
      this.blockSprites.push(sprite);

      // Drag handlers
      rect.on('dragstart', (pointer: Phaser.Input.Pointer) => {
        if (this.solved) return;
        this.dragBlock = sprite;
        this.dragStartPointer = { x: pointer.x, y: pointer.y };
        this.dragStartBlock = { x: block.x, y: block.y };
        rect.setDepth(10);
      });

      rect.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        if (this.solved || !this.dragBlock) return;
        this.handleDrag(this.dragBlock, dragX, dragY);
      });

      rect.on('dragend', () => {
        if (this.solved || !this.dragBlock) return;
        this.snapBlock(this.dragBlock);
        this.dragBlock.rect.setDepth(0);
        this.dragBlock = null;
      });
    });

    // Move counter text
    this.add.text(GAME_WIDTH / 2, 40, 'Moves: 0', {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#c4956a',
    }).setOrigin(0.5).setName('moveText');

    // Min moves display
    this.add.text(GAME_WIDTH / 2, 62, `Target: ${this.config.minMoves} moves`, {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#6b5b3e',
    }).setOrigin(0.5);

    // Undo button
    this.createButton(60, offsetY + gridPx + 50, 'Undo', () => this.undo());
    // Reset button
    this.createButton(GAME_WIDTH - 60, offsetY + gridPx + 50, 'Reset', () => this.resetPuzzle());
    // Back button
    this.createButton(GAME_WIDTH / 2, offsetY + gridPx + 50, 'Quit', () => {
      eventBus.emit('puzzle-quit');
      eventBus.emit('navigate', 'GuildhallScene');
    });

    eventBus.emit('show-ui');
  }

  private handleDrag(sprite: BlockSprite, dragX: number, dragY: number): void {
    const block = sprite.block;
    const offsetX = PUZZLE_OFFSET_X;
    const offsetY = PUZZLE_OFFSET_Y;

    if (block.orientation === 'horizontal') {
      // Constrain to horizontal axis
      const minX = this.getMinPos(block, 'left');
      const maxX = this.getMaxPos(block, 'right');
      const minPx = offsetX + minX * TILE_SIZE + block.length * TILE_SIZE / 2;
      const maxPx = offsetX + maxX * TILE_SIZE + block.length * TILE_SIZE / 2;

      // Allow target block to go past grid edge for win
      const actualMax = block.isTarget && this.config.exitSide === 'right'
        ? offsetX + 6 * TILE_SIZE + block.length * TILE_SIZE / 2
        : maxPx;

      sprite.rect.x = Phaser.Math.Clamp(dragX, minPx, actualMax);
      sprite.rect.y = offsetY + block.y * TILE_SIZE + TILE_SIZE / 2;
    } else {
      const minY = this.getMinPos(block, 'up');
      const maxY = this.getMaxPos(block, 'down');
      const minPy = offsetY + minY * TILE_SIZE + block.length * TILE_SIZE / 2;
      const maxPy = offsetY + maxY * TILE_SIZE + block.length * TILE_SIZE / 2;

      sprite.rect.x = offsetX + block.x * TILE_SIZE + TILE_SIZE / 2;
      sprite.rect.y = Phaser.Math.Clamp(dragY, minPy, maxPy);
    }
    sprite.label.setPosition(sprite.rect.x, sprite.rect.y);
  }

  private getMinPos(block: PuzzleBlock, _dir: 'left' | 'up'): number {
    if (block.orientation === 'horizontal') {
      for (let x = block.x - 1; x >= 0; x--) {
        if (this.isOccupied(x, block.y, block.id)) return x + 1;
      }
      return 0;
    } else {
      for (let y = block.y - 1; y >= 0; y--) {
        if (this.isOccupied(block.x, y, block.id)) return y + 1;
      }
      return 0;
    }
  }

  private getMaxPos(block: PuzzleBlock, _dir: 'right' | 'down'): number {
    if (block.orientation === 'horizontal') {
      for (let x = block.x + block.length; x < GRID_SIZE; x++) {
        if (this.isOccupied(x, block.y, block.id)) return x - block.length;
      }
      return GRID_SIZE - block.length;
    } else {
      for (let y = block.y + block.length; y < GRID_SIZE; y++) {
        if (this.isOccupied(block.x, y, block.id)) return y - block.length;
      }
      return GRID_SIZE - block.length;
    }
  }

  private isOccupied(x: number, y: number, excludeId: string): boolean {
    for (const block of this.config.blocks) {
      if (block.id === excludeId) continue;
      for (let i = 0; i < block.length; i++) {
        const bx = block.orientation === 'horizontal' ? block.x + i : block.x;
        const by = block.orientation === 'vertical' ? block.y + i : block.y;
        if (bx === x && by === y) return true;
      }
    }
    return false;
  }

  private snapBlock(sprite: BlockSprite): void {
    const block = sprite.block;
    const offsetX = PUZZLE_OFFSET_X;
    const offsetY = PUZZLE_OFFSET_Y;

    let newGridPos: number;
    if (block.orientation === 'horizontal') {
      newGridPos = Math.round((sprite.rect.x - offsetX - block.length * TILE_SIZE / 2) / TILE_SIZE);
      newGridPos = Phaser.Math.Clamp(newGridPos, this.getMinPos(block, 'left'), this.getMaxPos(block, 'right'));

      // Check win: target exits grid
      if (block.isTarget && this.config.exitSide === 'right') {
        const rawGridPos = (sprite.rect.x - offsetX - block.length * TILE_SIZE / 2) / TILE_SIZE;
        if (rawGridPos > GRID_SIZE - block.length + 0.5) {
          this.winPuzzle(sprite);
          return;
        }
      }

      if (newGridPos !== block.x) {
        this.moveHistory.push({ blockId: block.id, fromX: block.x, fromY: block.y });
        block.x = newGridPos;
        this.moveCount++;
        this.updateMoveText();
      }

      sprite.rect.x = offsetX + block.x * TILE_SIZE + block.length * TILE_SIZE / 2;
      sprite.rect.y = offsetY + block.y * TILE_SIZE + TILE_SIZE / 2;
    } else {
      newGridPos = Math.round((sprite.rect.y - offsetY - block.length * TILE_SIZE / 2) / TILE_SIZE);
      newGridPos = Phaser.Math.Clamp(newGridPos, this.getMinPos(block, 'up'), this.getMaxPos(block, 'down'));

      if (newGridPos !== block.y) {
        this.moveHistory.push({ blockId: block.id, fromX: block.x, fromY: block.y });
        block.y = newGridPos;
        this.moveCount++;
        this.updateMoveText();
      }

      sprite.rect.x = offsetX + block.x * TILE_SIZE + TILE_SIZE / 2;
      sprite.rect.y = offsetY + block.y * TILE_SIZE + block.length * TILE_SIZE / 2;
    }
    sprite.label.setPosition(sprite.rect.x, sprite.rect.y);
  }

  private winPuzzle(sprite: BlockSprite): void {
    this.solved = true;
    this.moveCount++;
    this.updateMoveText();

    // Animate cat off screen
    this.tweens.add({
      targets: [sprite.rect, sprite.label],
      x: GAME_WIDTH + 50,
      duration: 400,
      ease: 'Power2',
    });

    const stars = this.calculateStars();

    // Show win message after animation
    this.time.delayedCall(600, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: this.config.id,
        moves: this.moveCount,
        minMoves: this.config.minMoves,
        stars,
        jobId: this.jobId,
        catId: this.catId,
      });
    });
  }

  private calculateStars(): number {
    if (this.moveCount <= this.config.minMoves) return 3;
    if (this.moveCount <= this.config.minMoves * 2) return 2;
    return 1;
  }

  private updateMoveText(): void {
    const moveText = this.children.getByName('moveText') as Phaser.GameObjects.Text;
    if (moveText) moveText.setText(`Moves: ${this.moveCount}`);
  }

  private undo(): void {
    if (this.moveHistory.length === 0 || this.solved) return;
    const last = this.moveHistory.pop()!;
    const block = this.config.blocks.find((b) => b.id === last.blockId)!;
    block.x = last.fromX;
    block.y = last.fromY;
    this.moveCount = Math.max(0, this.moveCount - 1);
    this.updateMoveText();
    this.repositionAllBlocks();
  }

  private resetPuzzle(): void {
    if (this.solved) return;
    // Restore all blocks to start positions
    for (const sprite of this.blockSprites) {
      sprite.block.x = sprite.startX;
      sprite.block.y = sprite.startY;
    }
    this.moveCount = 0;
    this.moveHistory = [];
    this.updateMoveText();
    this.repositionAllBlocks();
  }

  private repositionAllBlocks(): void {
    const offsetX = PUZZLE_OFFSET_X;
    const offsetY = PUZZLE_OFFSET_Y;
    for (const sprite of this.blockSprites) {
      const block = sprite.block;
      const px = offsetX + block.x * TILE_SIZE + (block.orientation === 'horizontal' ? block.length * TILE_SIZE / 2 : TILE_SIZE / 2);
      const py = offsetY + block.y * TILE_SIZE + (block.orientation === 'vertical' ? block.length * TILE_SIZE / 2 : TILE_SIZE / 2);
      sprite.rect.setPosition(px, py);
      sprite.label.setPosition(px, py);
    }
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
