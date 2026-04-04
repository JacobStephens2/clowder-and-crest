import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import type { SaveData } from '../systems/SaveManager';
import { isCatStationed } from '../systems/Economy';

const BREEDS_WITH_SPRITES = new Set(['wildcat']);

// Isometric projection helpers
const ISO_TILE = 40;
const ISO_HALF = ISO_TILE / 2;
const GRID_COLS = 6;
const GRID_ROWS = 6;
const FLOOR_CX = GAME_WIDTH / 2;
const FLOOR_CY = 280;

function toIso(col: number, row: number): { x: number; y: number } {
  return {
    x: FLOOR_CX + (col - row) * ISO_HALF,
    y: FLOOR_CY + (col + row) * (ISO_HALF / 2),
  };
}

export class RoomScene extends Phaser.Scene {
  private roomId = 'sleeping';

  constructor() {
    super({ key: 'RoomScene' });
  }

  init(data: { roomId: string }): void {
    this.roomId = data.roomId ?? 'sleeping';
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    const save = getGameState();
    if (!save) return;

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'guildhall');

    // Back button
    const backBtn = this.add.text(20, 48, '\u2190 Back', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#8b7355',
    }).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => {
      eventBus.emit('navigate', 'GuildhallScene');
    });
    backBtn.on('pointerover', () => backBtn.setColor('#c4956a'));
    backBtn.on('pointerout', () => backBtn.setColor('#8b7355'));

    // Room title
    const roomNames: Record<string, string> = {
      sleeping: 'Sleeping Quarters',
      kitchen: 'Kitchen & Pantry',
      operations: 'Operations Hall',
    };
    this.add.text(GAME_WIDTH / 2, 52, roomNames[this.roomId] ?? this.roomId, {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      color: '#c4956a',
    }).setOrigin(0.5);

    // Draw the isometric room
    this.drawWalls();
    this.drawFloor();
    this.drawFurniture(save);
    this.drawCats(save);
    this.drawAmbience();
  }

  private drawWalls(): void {
    const gfx = this.add.graphics();
    const topLeft = toIso(0, 0);
    const topRight = toIso(GRID_COLS, 0);
    const bottomLeft = toIso(0, GRID_ROWS);
    const bottomRight = toIso(GRID_COLS, GRID_ROWS);

    const wallHeight = 80;

    // Back-left wall
    gfx.fillStyle(0x2a2622);
    gfx.fillPoints([
      new Phaser.Geom.Point(topLeft.x, topLeft.y),
      new Phaser.Geom.Point(topLeft.x, topLeft.y - wallHeight),
      new Phaser.Geom.Point(topRight.x, topRight.y - wallHeight),
      new Phaser.Geom.Point(topRight.x, topRight.y),
    ], true);

    // Back-right wall
    gfx.fillStyle(0x242220);
    gfx.fillPoints([
      new Phaser.Geom.Point(topRight.x, topRight.y),
      new Phaser.Geom.Point(topRight.x, topRight.y - wallHeight),
      new Phaser.Geom.Point(bottomRight.x, bottomRight.y - wallHeight),
      new Phaser.Geom.Point(bottomRight.x, bottomRight.y),
    ], true);

    // Wall edges
    gfx.lineStyle(1, 0x3a3530, 0.6);
    gfx.lineBetween(topLeft.x, topLeft.y - wallHeight, topRight.x, topRight.y - wallHeight);
    gfx.lineBetween(topRight.x, topRight.y - wallHeight, bottomRight.x, bottomRight.y - wallHeight);
    gfx.lineBetween(topLeft.x, topLeft.y, topLeft.x, topLeft.y - wallHeight);
    gfx.lineBetween(topRight.x, topRight.y, topRight.x, topRight.y - wallHeight);
    gfx.lineBetween(bottomRight.x, bottomRight.y, bottomRight.x, bottomRight.y - wallHeight);

    // Window on back-left wall
    const winCol = 2.5;
    const winL = toIso(winCol - 0.6, 0);
    const winR = toIso(winCol + 0.6, 0);
    const winTop = 50;
    const winBot = 25;
    gfx.fillStyle(0x1a2a3a, 0.6);
    gfx.fillPoints([
      new Phaser.Geom.Point(winL.x, winL.y - winTop),
      new Phaser.Geom.Point(winR.x, winR.y - winTop),
      new Phaser.Geom.Point(winR.x, winR.y - winBot),
      new Phaser.Geom.Point(winL.x, winL.y - winBot),
    ], true);
    // Window frame
    gfx.lineStyle(1, 0x4a4035, 0.8);
    gfx.strokePoints([
      new Phaser.Geom.Point(winL.x, winL.y - winTop),
      new Phaser.Geom.Point(winR.x, winR.y - winTop),
      new Phaser.Geom.Point(winR.x, winR.y - winBot),
      new Phaser.Geom.Point(winL.x, winL.y - winBot),
    ], true);
    // Moonlight through window
    gfx.fillStyle(0x8899aa, 0.04);
    const moonCenter = toIso(winCol, 0);
    gfx.fillCircle(moonCenter.x, moonCenter.y - 38, 18);

    // Torch on right wall
    const torchPos = toIso(GRID_COLS, 2);
    gfx.fillStyle(0x6b5b3e);
    gfx.fillRect(torchPos.x - 2, torchPos.y - 50, 4, 14);
    gfx.fillStyle(0xdda055, 0.7);
    gfx.fillCircle(torchPos.x, torchPos.y - 54, 4);
    // Torch glow
    const torchGlow = this.add.circle(torchPos.x, torchPos.y - 54, 25, 0xdda055, 0.06);
    this.tweens.add({
      targets: torchGlow,
      alpha: { from: 0.04, to: 0.09 },
      scaleX: { from: 0.9, to: 1.1 },
      scaleY: { from: 0.9, to: 1.1 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawFloor(): void {
    const gfx = this.add.graphics();

    // Draw floor tiles in isometric grid
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const { x, y } = toIso(col, row);
        const shade = (col + row) % 2 === 0 ? 0x2e2a25 : 0x322e28;

        gfx.fillStyle(shade);
        gfx.fillPoints([
          new Phaser.Geom.Point(x, y),
          new Phaser.Geom.Point(x + ISO_HALF, y + ISO_HALF / 2),
          new Phaser.Geom.Point(x, y + ISO_HALF),
          new Phaser.Geom.Point(x - ISO_HALF, y + ISO_HALF / 2),
        ], true);

        // Tile edges
        gfx.lineStyle(1, 0x3a3530, 0.15);
        gfx.strokePoints([
          new Phaser.Geom.Point(x, y),
          new Phaser.Geom.Point(x + ISO_HALF, y + ISO_HALF / 2),
          new Phaser.Geom.Point(x, y + ISO_HALF),
          new Phaser.Geom.Point(x - ISO_HALF, y + ISO_HALF / 2),
        ], true);
      }
    }
  }

  private drawFurniture(save: SaveData): void {
    const placed = save.furniture.filter((f) => f.room === this.roomId || f.room === 'any');

    // Also include furniture placed in 'sleeping' that was assigned to 'any' room
    const allPlaced = save.furniture.filter((f) => f.room === this.roomId);

    // Draw each furniture piece as an isometric block
    // Sort by row then col for correct draw order
    const sorted = [...allPlaced].sort((a, b) => (a.gridY + a.gridX) - (b.gridY + b.gridX));

    sorted.forEach((f) => {
      const col = f.gridX % GRID_COLS;
      const row = f.gridY % GRID_ROWS;
      this.drawIsoFurniture(f.furnitureId, col, row);
    });
  }

  private drawIsoFurniture(id: string, col: number, row: number): void {
    const gfx = this.add.graphics();
    const { x, y } = toIso(col, row);

    const colors: Record<string, { top: number; left: number; right: number }> = {
      straw_bed: { top: 0x8b7355, left: 0x6b5b3e, right: 0x5a4a30 },
      woolen_blanket: { top: 0x6a5a7a, left: 0x5a4a6a, right: 0x4a3a5a },
      cushioned_basket: { top: 0x7a6a5a, left: 0x6a5a4a, right: 0x5a4a3a },
      lantern: { top: 0xdda055, left: 0x8a7a4a, right: 0x7a6a3a },
      candle_stand: { top: 0xccaa66, left: 0x7a6a3a, right: 0x6a5a2a },
      scratching_post: { top: 0x8a6a3a, left: 0x7a5a30, right: 0x6a4a28 },
      bookshelf: { top: 0x5a4a3a, left: 0x4a3a2a, right: 0x3a2a1a },
      rug_wool: { top: 0x7a4a4a, left: 0x6a3a3a, right: 0x5a2a2a },
      saints_icon: { top: 0x7a7a8a, left: 0x6a6a7a, right: 0x5a5a6a },
      fish_bone_mobile: { top: 0x6a7a7a, left: 0x5a6a6a, right: 0x4a5a5a },
      potted_catnip: { top: 0x5a8a5a, left: 0x4a6a4a, right: 0x3a5a3a },
    };

    const c = colors[id] ?? { top: 0x5a5a5a, left: 0x4a4a4a, right: 0x3a3a3a };
    const h = id === 'bookshelf' || id === 'scratching_post' ? 24 : id === 'rug_wool' ? 4 : 14;

    // Top face (diamond)
    gfx.fillStyle(c.top);
    gfx.fillPoints([
      new Phaser.Geom.Point(x, y - h),
      new Phaser.Geom.Point(x + ISO_HALF, y + ISO_HALF / 2 - h),
      new Phaser.Geom.Point(x, y + ISO_HALF - h),
      new Phaser.Geom.Point(x - ISO_HALF, y + ISO_HALF / 2 - h),
    ], true);

    // Left face
    if (h > 4) {
      gfx.fillStyle(c.left);
      gfx.fillPoints([
        new Phaser.Geom.Point(x - ISO_HALF, y + ISO_HALF / 2 - h),
        new Phaser.Geom.Point(x, y + ISO_HALF - h),
        new Phaser.Geom.Point(x, y + ISO_HALF),
        new Phaser.Geom.Point(x - ISO_HALF, y + ISO_HALF / 2),
      ], true);

      // Right face
      gfx.fillStyle(c.right);
      gfx.fillPoints([
        new Phaser.Geom.Point(x, y + ISO_HALF - h),
        new Phaser.Geom.Point(x + ISO_HALF, y + ISO_HALF / 2 - h),
        new Phaser.Geom.Point(x + ISO_HALF, y + ISO_HALF / 2),
        new Phaser.Geom.Point(x, y + ISO_HALF),
      ], true);
    }

    // Lantern/candle glow effect
    if (id === 'lantern' || id === 'candle_stand') {
      const glow = this.add.circle(x, y - h - 4, 20, 0xdda055, 0.06);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.04, to: 0.1 },
        duration: 1500 + Math.random() * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Potted catnip leaves
    if (id === 'potted_catnip') {
      gfx.fillStyle(0x4a8a3a, 0.8);
      gfx.fillCircle(x - 3, y - h - 5, 4);
      gfx.fillCircle(x + 4, y - h - 4, 3);
      gfx.fillCircle(x, y - h - 7, 3);
    }
  }

  private openTiles: { col: number; row: number }[] = [];

  private buildOpenTiles(save: SaveData): void {
    const usedPositions = new Set(
      save.furniture.filter((f) => f.room === this.roomId).map((f) => `${f.gridX % GRID_COLS},${f.gridY % GRID_ROWS}`)
    );
    this.openTiles = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (!usedPositions.has(`${col},${row}`)) {
          this.openTiles.push({ col, row });
        }
      }
    }
  }

  private pickRandomTile(exclude?: { col: number; row: number }): { col: number; row: number } {
    const candidates = exclude
      ? this.openTiles.filter((t) => t.col !== exclude.col || t.row !== exclude.row)
      : this.openTiles;
    return candidates[Math.floor(Math.random() * candidates.length)] ?? { col: 2, row: 2 };
  }

  private getWalkDirection(fromCol: number, fromRow: number, toCol: number, toRow: number): string {
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    // In isometric: east = +col, south = +row
    if (Math.abs(dc) >= Math.abs(dr)) {
      return dc > 0 ? 'east' : 'west';
    }
    return dr > 0 ? 'south' : 'north';
  }

  private drawCats(save: SaveData): void {
    const cats = save.cats;
    if (cats.length === 0) return;

    this.buildOpenTiles(save);

    cats.forEach((cat, i) => {
      const startTile = this.pickRandomTile();
      const stationed = isCatStationed(save, cat.id);
      const hasSprite = BREEDS_WITH_SPRITES.has(cat.breed);

      if (stationed) {
        const { x, y } = toIso(startTile.col, startTile.row);
        this.drawStationedCat(cat, x, y, hasSprite);
      } else if (hasSprite) {
        this.spawnWanderingSprite(cat, startTile, i);
      } else {
        this.spawnWanderingFallback(cat, startTile, i);
      }
    });
  }

  private spawnWanderingSprite(cat: SaveData['cats'][number], startTile: { col: number; row: number }, index: number): void {
    const { x, y } = toIso(startTile.col, startTile.row);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.2);
    shadow.fillEllipse(0, 0, 24, 8);
    shadow.setPosition(x, y + 2);

    const sprite = this.add.sprite(x, y - 14, `${cat.breed}_idle_south`);
    sprite.setScale(1.2);
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    const nameTag = this.add.text(x, y + 10, cat.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '8px',
      color: '#c4956a',
    }).setOrigin(0.5);

    let currentTile = { ...startTile };

    const wanderToNext = () => {
      // Idle pause before next move
      const idleTime = 2000 + Math.random() * 3000;
      const dir = ['south', 'east', 'west', 'north'][Math.floor(Math.random() * 4)];
      sprite.setTexture(`${cat.breed}_idle_${dir}`);
      sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      sprite.stop();

      this.time.delayedCall(idleTime, () => {
        const nextTile = this.pickRandomTile(currentTile);
        const walkDir = this.getWalkDirection(currentTile.col, currentTile.row, nextTile.col, nextTile.row);
        const dest = toIso(nextTile.col, nextTile.row);
        const walkKey = `${cat.breed}_walk_${walkDir}`;

        if (this.anims.exists(walkKey)) {
          sprite.play(walkKey);
        }

        const duration = 800 + Math.random() * 600;
        this.tweens.add({
          targets: sprite,
          x: dest.x,
          y: dest.y - 14,
          duration,
          ease: 'Linear',
        });
        this.tweens.add({
          targets: shadow,
          x: dest.x,
          y: dest.y + 2,
          duration,
          ease: 'Linear',
        });
        this.tweens.add({
          targets: nameTag,
          x: dest.x,
          y: dest.y + 10,
          duration,
          ease: 'Linear',
          onComplete: () => {
            currentTile = { ...nextTile };
            wanderToNext();
          },
        });
      });
    };

    // Start with a random delay so cats don't all move at once
    this.time.delayedCall(index * 500 + Math.random() * 1000, wanderToNext);
  }

  private spawnWanderingFallback(cat: SaveData['cats'][number], startTile: { col: number; row: number }, index: number): void {
    const { x, y } = toIso(startTile.col, startTile.row);
    const color = parseInt((BREED_COLORS[cat.breed] ?? '#8b7355').replace('#', ''), 16);

    // Container-like approach using a graphics object at (0,0) offset by position
    const gfx = this.add.graphics();
    gfx.setPosition(x, y);
    this.drawFallbackCatGraphics(gfx, color);

    const nameTag = this.add.text(x, y + 10, cat.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '8px',
      color: '#c4956a',
    }).setOrigin(0.5);

    let currentTile = { ...startTile };

    const wanderToNext = () => {
      const idleTime = 2000 + Math.random() * 3000;

      // Idle bob
      this.tweens.add({
        targets: gfx,
        y: gfx.y - 1.5,
        duration: 800,
        yoyo: true,
        ease: 'Sine.easeInOut',
      });

      this.time.delayedCall(idleTime, () => {
        const nextTile = this.pickRandomTile(currentTile);
        const dest = toIso(nextTile.col, nextTile.row);
        const duration = 800 + Math.random() * 600;

        this.tweens.add({
          targets: gfx,
          x: dest.x,
          y: dest.y,
          duration,
          ease: 'Linear',
        });
        this.tweens.add({
          targets: nameTag,
          x: dest.x,
          y: dest.y + 10,
          duration,
          ease: 'Linear',
          onComplete: () => {
            currentTile = { ...nextTile };
            wanderToNext();
          },
        });
      });
    };

    this.time.delayedCall(index * 500 + Math.random() * 1000, wanderToNext);
  }

  private drawFallbackCatGraphics(gfx: Phaser.GameObjects.Graphics, color: number): void {
    // Shadow
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(0, 2, 20, 8);

    // Body
    gfx.fillStyle(color);
    gfx.fillEllipse(0, -6, 18, 12);

    // Head
    gfx.fillCircle(-4, -16, 7);

    // Ears
    gfx.fillTriangle(-10, -19, -7, -27, -4, -19);
    gfx.fillTriangle(1, -19, -2, -27, -5, -19);

    // Inner ears
    gfx.fillStyle(Phaser.Display.Color.IntegerToColor(color).brighten(30).color);
    gfx.fillTriangle(-9, -20, -7, -25, -5, -20);
    gfx.fillTriangle(0, -20, -2, -25, -4, -20);

    // Eyes
    gfx.fillStyle(0xddcc88);
    gfx.fillCircle(-6, -17, 2);
    gfx.fillCircle(-2, -17, 2);
    gfx.fillStyle(0x111111);
    gfx.fillCircle(-6, -17, 0.8);
    gfx.fillCircle(-2, -17, 0.8);

    // Tail
    gfx.lineStyle(2.5, color);
    gfx.beginPath();
    gfx.moveTo(8, -4);
    gfx.lineTo(14, -10);
    gfx.lineTo(18, -14);
    gfx.strokePath();
  }

  private drawStationedCat(cat: SaveData['cats'][number], x: number, y: number, hasSprite: boolean): void {
    if (hasSprite) {
      const sprite = this.add.sprite(x, y - 14, `${cat.breed}_idle_south`);
      sprite.setScale(1.2);
      sprite.setAlpha(0.3);
      sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    } else {
      const color = parseInt((BREED_COLORS[cat.breed] ?? '#8b7355').replace('#', ''), 16);
      const gfx = this.add.graphics();
      gfx.setPosition(x, y);
      gfx.setAlpha(0.3);
      this.drawFallbackCatGraphics(gfx, color);
    }

    this.add.text(x, y + 10, cat.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '8px',
      color: '#555',
    }).setOrigin(0.5);

    this.add.text(x, y + 19, '(away)', {
      fontFamily: 'Georgia, serif',
      fontSize: '7px',
      color: '#555',
    }).setOrigin(0.5);
  }

  private drawAmbience(): void {
    // Dust motes floating in the air
    for (let i = 0; i < 6; i++) {
      const mx = 80 + Math.random() * (GAME_WIDTH - 160);
      const my = 180 + Math.random() * 200;
      const mote = this.add.circle(mx, my, 1, 0xccbb88, 0.15);
      this.tweens.add({
        targets: mote,
        y: my - 30 - Math.random() * 20,
        x: mx + (Math.random() - 0.5) * 40,
        alpha: { from: 0.15, to: 0 },
        duration: 4000 + Math.random() * 3000,
        repeat: -1,
        delay: Math.random() * 3000,
      });
    }
  }
}
