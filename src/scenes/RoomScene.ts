import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import type { SaveData } from '../systems/SaveManager';
import { isCatStationed } from '../systems/Economy';

const BREEDS_WITH_SPRITES = new Set(['wildcat']);

// Top-down grid
const GRID_COLS = 7;
const GRID_ROWS = 7;
const TILE_SIZE = 48;
const GRID_LEFT = (GAME_WIDTH - GRID_COLS * TILE_SIZE) / 2;
const GRID_TOP = 80;

function toWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
    y: GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2,
  };
}

export class RoomScene extends Phaser.Scene {
  private roomId = 'sleeping';
  private openTiles: { col: number; row: number }[] = [];

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
    backBtn.on('pointerdown', () => eventBus.emit('navigate', 'GuildhallScene'));
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

    this.drawRoom(save);
    this.drawFurniture(save);
    this.drawCats(save);
    this.drawAmbience();
  }

  private drawRoom(save: SaveData): void {
    const gfx = this.add.graphics();
    const gridW = GRID_COLS * TILE_SIZE;
    const gridH = GRID_ROWS * TILE_SIZE;

    // Floor tiles (checkerboard)
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const shade = (col + row) % 2 === 0 ? 0x2e2a25 : 0x322e28;
        gfx.fillStyle(shade);
        gfx.fillRect(GRID_LEFT + col * TILE_SIZE, GRID_TOP + row * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        // Tile edges
        gfx.lineStyle(1, 0x3a3530, 0.12);
        gfx.strokeRect(GRID_LEFT + col * TILE_SIZE, GRID_TOP + row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Walls (thick borders on top and left)
    const wallThickness = 8;
    // Top wall
    gfx.fillStyle(0x2a2622);
    gfx.fillRect(GRID_LEFT - wallThickness, GRID_TOP - wallThickness, gridW + wallThickness * 2, wallThickness);
    // Left wall
    gfx.fillStyle(0x262420);
    gfx.fillRect(GRID_LEFT - wallThickness, GRID_TOP - wallThickness, wallThickness, gridH + wallThickness * 2);
    // Right wall
    gfx.fillStyle(0x242220);
    gfx.fillRect(GRID_LEFT + gridW, GRID_TOP - wallThickness, wallThickness, gridH + wallThickness * 2);
    // Bottom wall
    gfx.fillStyle(0x282622);
    gfx.fillRect(GRID_LEFT - wallThickness, GRID_TOP + gridH, gridW + wallThickness * 2, wallThickness);

    // Wall border lines
    gfx.lineStyle(1, 0x3a3530, 0.6);
    gfx.strokeRect(GRID_LEFT - wallThickness, GRID_TOP - wallThickness, gridW + wallThickness * 2, gridH + wallThickness * 2);
    gfx.strokeRect(GRID_LEFT, GRID_TOP, gridW, gridH);

    // Window on top wall
    const winX = GRID_LEFT + gridW * 0.4;
    const winW = 40;
    gfx.fillStyle(0x1a2a3a, 0.6);
    gfx.fillRect(winX, GRID_TOP - wallThickness, winW, wallThickness);
    gfx.lineStyle(1, 0x4a4035, 0.8);
    gfx.strokeRect(winX, GRID_TOP - wallThickness, winW, wallThickness);
    // Moonlight patch on floor
    gfx.fillStyle(0x8899aa, 0.03);
    gfx.fillRect(winX - 5, GRID_TOP, winW + 10, 60);

    // Torch on right wall
    const torchY = GRID_TOP + gridH * 0.3;
    const torchX = GRID_LEFT + gridW + wallThickness / 2;
    gfx.fillStyle(0x6b5b3e);
    gfx.fillRect(torchX - 2, torchY - 5, 4, 10);
    gfx.fillStyle(0xdda055, 0.7);
    gfx.fillCircle(torchX, torchY - 7, 3);
    // Glow
    const torchGlow = this.add.circle(torchX, torchY - 7, 30, 0xdda055, 0.05);
    this.tweens.add({
      targets: torchGlow,
      alpha: { from: 0.03, to: 0.08 },
      scaleX: { from: 0.9, to: 1.1 },
      scaleY: { from: 0.9, to: 1.1 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawFurniture(save: SaveData): void {
    const allPlaced = save.furniture.filter((f) => f.room === this.roomId);

    const colors: Record<string, number> = {
      straw_bed: 0x8b7355,
      woolen_blanket: 0x6a5a7a,
      cushioned_basket: 0x7a6a5a,
      lantern: 0xdda055,
      candle_stand: 0xccaa66,
      scratching_post: 0x8a6a3a,
      bookshelf: 0x5a4a3a,
      rug_wool: 0x7a4a4a,
      saints_icon: 0x7a7a8a,
      fish_bone_mobile: 0x6a7a7a,
      potted_catnip: 0x5a8a5a,
    };

    allPlaced.forEach((f) => {
      const col = f.gridX % GRID_COLS;
      const row = f.gridY % GRID_ROWS;
      const { x, y } = toWorld(col, row);
      const color = colors[f.furnitureId] ?? 0x5a5a5a;

      const gfx = this.add.graphics();
      const size = TILE_SIZE - 8;

      // Furniture as a rounded rectangle from above
      gfx.fillStyle(color);
      gfx.fillRoundedRect(x - size / 2, y - size / 2, size, size, 4);
      gfx.lineStyle(1, 0x3a3530, 0.5);
      gfx.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 4);

      // Label
      const label = f.furnitureId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      this.add.text(x, y, label, {
        fontFamily: 'Georgia, serif',
        fontSize: '6px',
        color: '#ddd',
        align: 'center',
        wordWrap: { width: size - 4 },
      }).setOrigin(0.5);

      // Glow effects for light sources
      if (f.furnitureId === 'lantern' || f.furnitureId === 'candle_stand') {
        const glow = this.add.circle(x, y, 24, 0xdda055, 0.05);
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.03, to: 0.09 },
          duration: 1500 + Math.random() * 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // Catnip leaves
      if (f.furnitureId === 'potted_catnip') {
        gfx.fillStyle(0x4a8a3a, 0.8);
        gfx.fillCircle(x - 4, y - 8, 4);
        gfx.fillCircle(x + 5, y - 6, 3);
        gfx.fillCircle(x, y - 10, 3);
      }
    });
  }

  // ── Cat wandering system ──

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
        const { x, y } = toWorld(startTile.col, startTile.row);
        this.drawStationedCat(cat, x, y, hasSprite);
      } else if (hasSprite) {
        this.spawnWanderingSprite(cat, startTile, i);
      } else {
        this.spawnWanderingFallback(cat, startTile, i);
      }
    });
  }

  private spawnWanderingSprite(cat: SaveData['cats'][number], startTile: { col: number; row: number }, index: number): void {
    const { x, y } = toWorld(startTile.col, startTile.row);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.2);
    shadow.fillEllipse(0, 0, 24, 8);
    shadow.setPosition(x, y + 12);

    const sprite = this.add.sprite(x, y - 4, `${cat.breed}_idle_south`);
    sprite.setScale(1.2);
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    const nameTag = this.add.text(x, y + 18, cat.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '8px',
      color: '#c4956a',
    }).setOrigin(0.5);

    let currentTile = { ...startTile };

    const wanderToNext = () => {
      const idleTime = 2000 + Math.random() * 3000;
      const dir = ['south', 'east', 'west', 'north'][Math.floor(Math.random() * 4)];
      sprite.setTexture(`${cat.breed}_idle_${dir}`);
      sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      sprite.stop();

      this.time.delayedCall(idleTime, () => {
        const nextTile = this.pickRandomTile(currentTile);
        const walkDir = this.getWalkDirection(currentTile.col, currentTile.row, nextTile.col, nextTile.row);
        const dest = toWorld(nextTile.col, nextTile.row);
        const walkKey = `${cat.breed}_walk_${walkDir}`;

        if (this.anims.exists(walkKey)) {
          sprite.play(walkKey);
        }

        const duration = 800 + Math.random() * 600;
        this.tweens.add({ targets: sprite, x: dest.x, y: dest.y - 4, duration, ease: 'Linear' });
        this.tweens.add({ targets: shadow, x: dest.x, y: dest.y + 12, duration, ease: 'Linear' });
        this.tweens.add({
          targets: nameTag, x: dest.x, y: dest.y + 18, duration, ease: 'Linear',
          onComplete: () => { currentTile = { ...nextTile }; wanderToNext(); },
        });
      });
    };

    this.time.delayedCall(index * 500 + Math.random() * 1000, wanderToNext);
  }

  private spawnWanderingFallback(cat: SaveData['cats'][number], startTile: { col: number; row: number }, index: number): void {
    const { x, y } = toWorld(startTile.col, startTile.row);
    const color = parseInt((BREED_COLORS[cat.breed] ?? '#8b7355').replace('#', ''), 16);

    const gfx = this.add.graphics();
    gfx.setPosition(x, y);
    this.drawFallbackCatGraphics(gfx, color);

    const nameTag = this.add.text(x, y + 18, cat.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '8px',
      color: '#c4956a',
    }).setOrigin(0.5);

    let currentTile = { ...startTile };

    const wanderToNext = () => {
      const idleTime = 2000 + Math.random() * 3000;

      this.tweens.add({
        targets: gfx, y: gfx.y - 1.5, duration: 800, yoyo: true, ease: 'Sine.easeInOut',
      });

      this.time.delayedCall(idleTime, () => {
        const nextTile = this.pickRandomTile(currentTile);
        const dest = toWorld(nextTile.col, nextTile.row);
        const duration = 800 + Math.random() * 600;

        this.tweens.add({ targets: gfx, x: dest.x, y: dest.y, duration, ease: 'Linear' });
        this.tweens.add({
          targets: nameTag, x: dest.x, y: dest.y + 18, duration, ease: 'Linear',
          onComplete: () => { currentTile = { ...nextTile }; wanderToNext(); },
        });
      });
    };

    this.time.delayedCall(index * 500 + Math.random() * 1000, wanderToNext);
  }

  private drawFallbackCatGraphics(gfx: Phaser.GameObjects.Graphics, color: number): void {
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(0, 12, 20, 8);

    gfx.fillStyle(color);
    gfx.fillEllipse(0, 0, 18, 14);
    gfx.fillCircle(0, -10, 7);

    // Ears
    gfx.fillTriangle(-6, -13, -3, -20, 0, -13);
    gfx.fillTriangle(6, -13, 3, -20, 0, -13);

    // Eyes
    gfx.fillStyle(0xddcc88);
    gfx.fillCircle(-3, -11, 1.5);
    gfx.fillCircle(3, -11, 1.5);
    gfx.fillStyle(0x111111);
    gfx.fillCircle(-3, -11, 0.7);
    gfx.fillCircle(3, -11, 0.7);
  }

  private drawStationedCat(cat: SaveData['cats'][number], x: number, y: number, hasSprite: boolean): void {
    if (hasSprite) {
      const sprite = this.add.sprite(x, y - 4, `${cat.breed}_idle_south`);
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

    this.add.text(x, y + 18, cat.name, {
      fontFamily: 'Georgia, serif', fontSize: '8px', color: '#555',
    }).setOrigin(0.5);

    this.add.text(x, y + 27, '(away)', {
      fontFamily: 'Georgia, serif', fontSize: '7px', color: '#555',
    }).setOrigin(0.5);
  }

  private drawAmbience(): void {
    for (let i = 0; i < 6; i++) {
      const mx = GRID_LEFT + 20 + Math.random() * (GRID_COLS * TILE_SIZE - 40);
      const my = GRID_TOP + 20 + Math.random() * (GRID_ROWS * TILE_SIZE - 40);
      const mote = this.add.circle(mx, my, 1, 0xccbb88, 0.15);
      this.tweens.add({
        targets: mote,
        y: my - 20 - Math.random() * 15,
        x: mx + (Math.random() - 0.5) * 30,
        alpha: { from: 0.15, to: 0 },
        duration: 4000 + Math.random() * 3000,
        repeat: -1,
        delay: Math.random() * 3000,
      });
    }
  }
}
