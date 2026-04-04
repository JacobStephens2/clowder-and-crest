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

  private drawCats(save: SaveData): void {
    const cats = save.cats;
    if (cats.length === 0) return;

    // Place cats on the floor grid, avoiding furniture positions
    const usedPositions = new Set(
      save.furniture.filter((f) => f.room === this.roomId).map((f) => `${f.gridX},${f.gridY}`)
    );

    const catPositions: { col: number; row: number }[] = [];
    for (let row = 1; row < GRID_ROWS; row++) {
      for (let col = 1; col < GRID_COLS; col++) {
        if (!usedPositions.has(`${col % GRID_COLS},${Math.floor(col / GRID_COLS)}`)) {
          catPositions.push({ col, row });
        }
        if (catPositions.length >= cats.length) break;
      }
      if (catPositions.length >= cats.length) break;
    }

    cats.forEach((cat, i) => {
      const pos = catPositions[i] ?? { col: 1 + i, row: GRID_ROWS - 2 };
      const { x, y } = toIso(pos.col, pos.row);
      const stationed = isCatStationed(save, cat.id);
      const hasSprite = BREEDS_WITH_SPRITES.has(cat.breed);

      if (hasSprite) {
        this.drawSpritecat(cat, x, y, i, stationed);
      } else {
        this.drawFallbackCat(cat, x, y, i, stationed);
      }
    });
  }

  private drawSpritecat(cat: SaveData['cats'][number], x: number, y: number, index: number, stationed: boolean): void {
    // Pick a random idle direction
    const directions = ['south', 'east', 'west', 'north'];
    const dir = directions[index % directions.length];
    const idleKey = `${cat.breed}_idle_${dir}`;
    const walkAnimKey = `${cat.breed}_walk_${dir}`;

    // Shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.2);
    shadow.fillEllipse(x, y + 2, 24, 8);

    const sprite = this.add.sprite(x, y - 14, idleKey);
    sprite.setScale(1.2);

    if (stationed) {
      sprite.setAlpha(0.3);
      shadow.setAlpha(0.3);
    } else {
      // Randomly pick between idle bob and walk animation
      if (index % 3 === 0 && this.anims.exists(walkAnimKey)) {
        sprite.play(walkAnimKey);
      } else {
        // Gentle bob for idle
        this.tweens.add({
          targets: sprite,
          y: sprite.y - 1.5,
          duration: 1800 + index * 300,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    // Name tag
    this.add.text(x, y + 10, cat.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '8px',
      color: stationed ? '#555' : '#c4956a',
    }).setOrigin(0.5);

    if (stationed) {
      this.add.text(x, y + 19, '(away)', {
        fontFamily: 'Georgia, serif',
        fontSize: '7px',
        color: '#555',
      }).setOrigin(0.5);
    }
  }

  private drawFallbackCat(cat: SaveData['cats'][number], x: number, y: number, index: number, stationed: boolean): void {
    const color = parseInt((BREED_COLORS[cat.breed] ?? '#8b7355').replace('#', ''), 16);
    const gfx = this.add.graphics();

    if (stationed) {
      gfx.setAlpha(0.3);
    }

    // Shadow
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(x, y + 2, 20, 8);

    // Body
    gfx.fillStyle(color);
    gfx.fillEllipse(x, y - 6, 18, 12);

    // Head
    gfx.fillCircle(x - 4, y - 16, 7);

    // Ears
    gfx.fillTriangle(x - 10, y - 19, x - 7, y - 27, x - 4, y - 19);
    gfx.fillTriangle(x + 1, y - 19, x - 2, y - 27, x - 5, y - 19);

    // Inner ears
    gfx.fillStyle(Phaser.Display.Color.IntegerToColor(color).brighten(30).color);
    gfx.fillTriangle(x - 9, y - 20, x - 7, y - 25, x - 5, y - 20);
    gfx.fillTriangle(x, y - 20, x - 2, y - 25, x - 4, y - 20);

    // Eyes
    gfx.fillStyle(0xddcc88);
    gfx.fillCircle(x - 6, y - 17, 2);
    gfx.fillCircle(x - 2, y - 17, 2);
    gfx.fillStyle(0x111111);
    gfx.fillCircle(x - 6, y - 17, 0.8);
    gfx.fillCircle(x - 2, y - 17, 0.8);

    // Tail
    gfx.lineStyle(2.5, color);
    gfx.beginPath();
    gfx.moveTo(x + 8, y - 4);
    gfx.lineTo(x + 14, y - 10);
    gfx.lineTo(x + 18, y - 14);
    gfx.strokePath();

    // Name tag
    this.add.text(x, y + 10, cat.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '8px',
      color: stationed ? '#555' : '#c4956a',
    }).setOrigin(0.5);

    if (stationed) {
      this.add.text(x, y + 19, '(away)', {
        fontFamily: 'Georgia, serif',
        fontSize: '7px',
        color: '#555',
      }).setOrigin(0.5);
    }

    // Idle animation
    if (!stationed) {
      this.tweens.add({
        targets: gfx,
        y: { from: 0, to: -1.5 },
        duration: 1800 + index * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
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
