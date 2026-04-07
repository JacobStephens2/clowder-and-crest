import Phaser from 'phaser';
import { type PuzzleConfig, type PuzzleBlock } from '../systems/PuzzleGenerator';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, GRID_SIZE, TILE_SIZE, PUZZLE_OFFSET_X, PUZZLE_OFFSET_Y } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { haptic } from '../systems/NativeFeatures';

const GRID_COLOR = 0x2a2520;
const GRID_LINE_COLOR = 0x3a3530;
const TARGET_COLOR = 0xc4956a;
const BLOCK_COLORS = [0x6b8ea6, 0x8b7355, 0x7a6b5a, 0x5a7a6b, 0x8a6b7a, 0x6b7a5a, 0x7a5a6b, 0x5a6b8a, 0x6a8a5a, 0x8a7a5a, 0x5a8a7a, 0x7a8a6a];
const EXIT_COLOR = 0x4a8a4a;

interface BlockSprite {
  block: PuzzleBlock;
  /** The interactive Container holding rect + label + optional overlay.
      All child sprites are positioned at (0,0) local so they follow the
      container transform automatically. */
  container: Phaser.GameObjects.Container;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  /** Optional themed block art or cat sprite that overlays the rect */
  overlay?: Phaser.GameObjects.Sprite;
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
  private catBreed: string = 'wildcat';
  private puzzleSkin: string = '';

  constructor() {
    super({ key: 'PuzzleScene' });
  }

  init(data: { puzzle: PuzzleConfig; jobId?: string; catId?: string }): void {
    this.config = JSON.parse(JSON.stringify(data.puzzle)); // deep clone
    this.jobId = data.jobId ?? '';
    this.catId = data.catId ?? '';
    const save = getGameState();
    const cat = save?.cats.find((c) => c.id === this.catId);
    this.catBreed = cat?.breed ?? 'wildcat';
    const job = getJob(this.jobId);
    this.puzzleSkin = job?.puzzleSkin ?? '';
    this.moveCount = 0;
    this.moveHistory = [];
    this.blockSprites = [];
    this.solved = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial bumped to v2 for the themed names + axis arrows + PERFECT
    // celebration so returning players see the updated rules.
    if (!localStorage.getItem('clowder_puzzle_tutorial_v2')) {
      localStorage.setItem('clowder_puzzle_tutorial_v2', '1');
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
      t.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:12px">Slide Blocks</div>
        <div style="color:#8b7355;font-family:Georgia,serif;font-size:14px;text-align:center;max-width:290px;line-height:1.6">
          Slide blocks to clear a path for your <strong style="color:#c4956a">cat</strong> to reach the <strong style="color:#4a8a4a">exit</strong>.<br><br>
          The little <strong>arrows</strong> on each block show which way it can slide.<br><br>
          Hit <strong style="color:#dda055">Par</strong> moves to score a <strong style="color:#dda055">PERFECT</strong>!<br><br>
          Use <strong>Undo</strong> freely — there's no penalty for trying.
        </div>
        <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:12px;margin-top:20px">Tap to start</div>
      `;
      t.addEventListener('click', () => t.remove());
      document.body.appendChild(t);
    }

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

    // Create block sprites — each block is a Container holding the rect,
    // label, and optional themed/cat overlay. Children live at local (0,0)
    // so they inherit the container's transform automatically. This avoids
    // the manual multi-child position sync the old code needed after
    // repositionAllBlocks() or undo.
    const skinToBlock: Record<string, string[]> = {
      mill: ['block_flour_sack', 'block_crate'], granary: ['block_crate', 'block_barrel'],
      bakery: ['block_flour_sack', 'block_crate'], tavern: ['block_barrel', 'block_crate'],
      cathedral: ['block_pew', 'block_crate'], warehouse: ['block_crate', 'block_barrel'],
      ship: ['block_barrel', 'block_crate'], docks: ['block_barrel', 'block_crate'],
      castle: ['block_crate', 'block_barrel'], market: ['block_cart', 'block_crate'],
      garden: ['block_crate'], monastery: ['block_pew', 'block_crate'],
      tower: ['block_crate'], manor: ['block_cart', 'block_crate'],
      night: ['block_crate', 'block_barrel'],
    };
    this.config.blocks.forEach((block, i) => {
      const w = block.orientation === 'horizontal' ? block.length * TILE_SIZE - 4 : TILE_SIZE - 4;
      const h = block.orientation === 'vertical' ? block.length * TILE_SIZE - 4 : TILE_SIZE - 4;
      const px = offsetX + block.x * TILE_SIZE + (block.orientation === 'horizontal' ? block.length * TILE_SIZE / 2 : TILE_SIZE / 2);
      const py = offsetY + block.y * TILE_SIZE + (block.orientation === 'vertical' ? block.length * TILE_SIZE / 2 : TILE_SIZE / 2);

      // All children start at local (0, 0) — the container positions them
      const color = block.isTarget ? TARGET_COLOR : BLOCK_COLORS[i % BLOCK_COLORS.length];
      const rect = this.add.rectangle(0, 0, w, h, color);
      rect.setStrokeStyle(1, 0x000000, 0.3);

      let overlay: Phaser.GameObjects.Sprite | undefined;
      if (!block.isTarget) {
        const blockKeys = skinToBlock[this.puzzleSkin] ?? ['block_crate'];
        const blockKey = blockKeys[i % blockKeys.length];
        if (this.textures.exists(blockKey)) {
          const blockSprite = this.add.sprite(0, 0, blockKey);
          const scaleX = (w - 4) / blockSprite.width;
          const scaleY = (h - 4) / blockSprite.height;
          blockSprite.setScale(Math.min(scaleX, scaleY));
          overlay = blockSprite;
        }
      }

      const labelText = block.isTarget ? 'CAT' : '';
      const label = this.add.text(0, 0, labelText, {
        fontFamily: 'Georgia, serif',
        fontSize: '11px',
        color: '#fff',
      }).setOrigin(0.5);

      // Cat sprite on the target block — replaces the text label visually
      if (block.isTarget && this.catId) {
        const idleKey = `${this.catBreed}_idle_east`;
        if (this.textures.exists(idleKey)) {
          const catSprite = this.add.sprite(0, 0, idleKey);
          catSprite.setScale(0.8);
          label.setVisible(false);
          overlay = catSprite;
        }
      }

      // Axis indicators — small arrow chevrons at each end of the block
      // showing its movement axis. The doc's "board reads as a diagram of
      // its own solution" pillar: a player should be able to look at any
      // block and immediately see which way it can slide. Drawn as tiny
      // graphics that ride along inside the container.
      const axisGfx = this.add.graphics();
      const indicatorAlpha = block.isTarget ? 0 : 0.55; // hide on the cat block
      axisGfx.fillStyle(0xffffff, indicatorAlpha);
      if (block.orientation === 'horizontal') {
        // Left chevron pointing left, right chevron pointing right
        const cx = w / 2 - 5;
        const cy = 0;
        axisGfx.fillTriangle(-cx, cy - 4, -cx, cy + 4, -cx - 4, cy);
        axisGfx.fillTriangle(cx, cy - 4, cx, cy + 4, cx + 4, cy);
      } else {
        // Top chevron pointing up, bottom chevron pointing down
        const cy = h / 2 - 5;
        const cx = 0;
        axisGfx.fillTriangle(cx - 4, -cy, cx + 4, -cy, cx, -cy - 4);
        axisGfx.fillTriangle(cx - 4, cy, cx + 4, cy, cx, cy + 4);
      }

      // Assemble container with children (order = render order: rect below, overlay + axisGfx above, label on top)
      const children: Phaser.GameObjects.GameObject[] = [rect];
      if (overlay) children.push(overlay);
      children.push(axisGfx);
      children.push(label);
      const container = this.add.container(px, py, children);
      container.setSize(w, h);
      container.setInteractive({ draggable: true });

      const sprite: BlockSprite = { block, container, rect, label, overlay, startX: block.x, startY: block.y };
      this.blockSprites.push(sprite);

      container.on('dragstart', (pointer: Phaser.Input.Pointer) => {
        if (this.solved) return;
        this.dragBlock = sprite;
        this.dragStartPointer = { x: pointer.x, y: pointer.y };
        this.dragStartBlock = { x: block.x, y: block.y };
        container.setDepth(10);
      });

      container.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        if (this.solved || !this.dragBlock) return;
        this.handleDrag(this.dragBlock, dragX, dragY);
      });

      container.on('dragend', () => {
        if (this.solved || !this.dragBlock) return;
        this.snapBlock(this.dragBlock);
        this.dragBlock.container.setDepth(0);
        this.dragBlock = null;
      });
    });

    // Job name (small, top)
    const job = getJob(this.jobId);
    if (job) {
      this.add.text(GAME_WIDTH / 2, 32, `${job.name} (${this.config.difficulty})`, {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: '#6b5b3e',
      }).setOrigin(0.5);
    }

    // Puzzle name (the doc's "level-as-lesson" pillar made visible).
    // The themed name + one-line concept give each puzzle an identity so
    // players consciously recognize what each board is teaching, instead
    // of seeing "another set of blocks".
    if (this.config.name) {
      this.add.text(GAME_WIDTH / 2, 50, this.config.name, {
        fontFamily: 'Georgia, serif',
        fontSize: '17px',
        color: '#c4956a',
        fontStyle: 'italic',
      }).setOrigin(0.5);
    }
    if (this.config.concept) {
      this.add.text(GAME_WIDTH / 2, 67, this.config.concept, {
        fontFamily: 'Georgia, serif',
        fontSize: '11px',
        color: '#8b7355',
        align: 'center',
        wordWrap: { width: 320 },
      }).setOrigin(0.5);
    }

    // Move counter + par on a single line
    this.add.text(GAME_WIDTH / 2, 84, `Moves: 0  /  Par: ${this.config.minMoves}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#c4956a',
    }).setOrigin(0.5).setName('moveText');

    // Undo button
    this.createButton(60, offsetY + gridPx + 50, 'Undo', () => this.undo());
    // Reset button
    this.createButton(GAME_WIDTH - 60, offsetY + gridPx + 50, 'Reset', () => this.resetPuzzle());
    // Back button
    this.createButton(GAME_WIDTH / 2, offsetY + gridPx + 50, 'Quit', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    eventBus.emit('show-ui');
  }

  private handleDrag(sprite: BlockSprite, dragX: number, dragY: number): void {
    const block = sprite.block;
    const offsetX = PUZZLE_OFFSET_X;
    const offsetY = PUZZLE_OFFSET_Y;

    if (block.orientation === 'horizontal') {
      const minX = this.getMinPos(block, 'left');
      const maxX = this.getMaxPos(block, 'right');
      const minPx = offsetX + minX * TILE_SIZE + block.length * TILE_SIZE / 2;
      const maxPx = offsetX + maxX * TILE_SIZE + block.length * TILE_SIZE / 2;

      // Target block can go past the grid edge on a win — only when the path is clear
      const pathClearToEdge = block.isTarget && this.config.exitSide === 'right' && maxX >= GRID_SIZE - block.length;
      const actualMax = pathClearToEdge
        ? offsetX + 6 * TILE_SIZE + block.length * TILE_SIZE / 2
        : maxPx;

      sprite.container.x = Phaser.Math.Clamp(dragX, minPx, actualMax);
      sprite.container.y = offsetY + block.y * TILE_SIZE + TILE_SIZE / 2;
    } else {
      const minY = this.getMinPos(block, 'up');
      const maxY = this.getMaxPos(block, 'down');
      const minPy = offsetY + minY * TILE_SIZE + block.length * TILE_SIZE / 2;
      const maxPy = offsetY + maxY * TILE_SIZE + block.length * TILE_SIZE / 2;

      sprite.container.x = offsetX + block.x * TILE_SIZE + TILE_SIZE / 2;
      sprite.container.y = Phaser.Math.Clamp(dragY, minPy, maxPy);
    }
    // No need to sync label/overlay — they're children of the container
    // and follow its transform automatically.
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
      newGridPos = Math.round((sprite.container.x - offsetX - block.length * TILE_SIZE / 2) / TILE_SIZE);
      newGridPos = Phaser.Math.Clamp(newGridPos, this.getMinPos(block, 'left'), this.getMaxPos(block, 'right'));

      // Win check: target exits the grid (only when path was clear)
      if (block.isTarget && this.config.exitSide === 'right') {
        const maxPos = this.getMaxPos(block, 'right');
        if (maxPos >= GRID_SIZE - block.length) {
          const rawGridPos = (sprite.container.x - offsetX - block.length * TILE_SIZE / 2) / TILE_SIZE;
          if (rawGridPos > GRID_SIZE - block.length + 0.5) {
            this.winPuzzle(sprite);
            return;
          }
        }
      }

      if (newGridPos !== block.x) {
        this.moveHistory.push({ blockId: block.id, fromX: block.x, fromY: block.y });
        block.x = newGridPos;
        this.moveCount++;
        this.updateMoveText();
        haptic.light();
      }

      sprite.container.x = offsetX + block.x * TILE_SIZE + block.length * TILE_SIZE / 2;
      sprite.container.y = offsetY + block.y * TILE_SIZE + TILE_SIZE / 2;
    } else {
      newGridPos = Math.round((sprite.container.y - offsetY - block.length * TILE_SIZE / 2) / TILE_SIZE);
      newGridPos = Phaser.Math.Clamp(newGridPos, this.getMinPos(block, 'up'), this.getMaxPos(block, 'down'));

      if (newGridPos !== block.y) {
        this.moveHistory.push({ blockId: block.id, fromX: block.x, fromY: block.y });
        block.y = newGridPos;
        this.moveCount++;
        this.updateMoveText();
        haptic.light();
      }

      sprite.container.x = offsetX + block.x * TILE_SIZE + TILE_SIZE / 2;
      sprite.container.y = offsetY + block.y * TILE_SIZE + block.length * TILE_SIZE / 2;
    }
  }

  private winPuzzle(sprite: BlockSprite): void {
    this.solved = true;
    this.moveCount++;
    this.updateMoveText();

    // Animate cat off screen — one tween on the container carries the
    // rect, label, and overlay along automatically.
    this.tweens.add({
      targets: sprite.container,
      x: GAME_WIDTH + 50,
      duration: 400,
      ease: 'Power2',
    });

    const stars = this.calculateStars();

    // PERFECT! callout when the player ties or beats the BFS-optimal
    // par. The doc's "minimum-moves scoring unlocks a mastery layer"
    // pillar: par scoring is meaningless without a payoff for hitting it.
    if (this.moveCount <= this.config.minMoves) {
      haptic.success();
      const callout = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'PERFECT!', {
        fontFamily: 'Georgia, serif',
        fontSize: '36px',
        color: '#dda055',
        fontStyle: 'italic',
      }).setOrigin(0.5).setDepth(20).setAlpha(0).setScale(0.5);
      this.tweens.add({
        targets: callout,
        alpha: 1,
        scale: 1,
        duration: 250,
        ease: 'Back.easeOut',
        yoyo: true,
        hold: 600,
        onComplete: () => callout.destroy(),
      });
      // Gold camera flash for emphasis
      this.cameras.main.flash(180, 220, 170, 90);
    }

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
    if (moveText) moveText.setText(`Moves: ${this.moveCount}  /  Par: ${this.config.minMoves}`);
    // Color shifts as the player approaches/exceeds par — gentle visual
    // mastery feedback without being penalty-heavy.
    if (moveText) {
      if (this.moveCount <= this.config.minMoves) moveText.setColor('#dda055');
      else if (this.moveCount <= this.config.minMoves * 1.5) moveText.setColor('#c4956a');
      else moveText.setColor('#8b7355');
    }
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
      // One position set on the container propagates to all children.
      sprite.container.setPosition(px, py);
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
