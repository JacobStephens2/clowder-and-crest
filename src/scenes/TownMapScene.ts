import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, ALL_BREED_IDS } from '../utils/constants';
import { getGameState } from '../main';
import { getCurrentPhase } from '../systems/DayTimer';
import { createDpad } from '../ui/sceneHelpers';

// ── Grid layout ──
const COLS = 8;
const ROWS = 10;
const TILE = 44;
const GRID_W = COLS * TILE;
const GRID_H = ROWS * TILE;
const GRID_LEFT = Math.floor((GAME_WIDTH - GRID_W) / 2);
const GRID_TOP = 50;

// Tile types
const PATH = 0;
const GRASS = 1;
const BUILDING = 2;

// Building definitions
interface BuildingDef {
  id: string;
  name: string;
  col: number;
  row: number;
  w: number;   // width in tiles
  h: number;   // height in tiles
  doorCol: number;
  doorRow: number;
  color: number;
  roofColor: number;
}

const BUILDINGS: BuildingDef[] = [
  { id: 'cathedral', name: 'Cathedral', col: 0, row: 0, w: 3, h: 2, doorCol: 1, doorRow: 2, color: 0x282622, roofColor: 0x3a3530 },
  { id: 'castle', name: 'Castle', col: 5, row: 0, w: 3, h: 2, doorCol: 6, doorRow: 2, color: 0x2e2a26, roofColor: 0x3a3632 },
  { id: 'tavern', name: 'Tavern', col: 0, row: 4, w: 2, h: 2, doorCol: 1, doorRow: 6, color: 0x2a2420, roofColor: 0x3a2a22 },
  { id: 'market', name: 'Market', col: 6, row: 4, w: 2, h: 2, doorCol: 6, doorRow: 6, color: 0x2a2620, roofColor: 0x3a2e28 },
  { id: 'jobs', name: 'Job Board', col: 3, row: 3, w: 2, h: 1, doorCol: 4, doorRow: 4, color: 0x3a3530, roofColor: 0x4a4038 },
  { id: 'docks', name: 'Docks', col: 0, row: 7, w: 2, h: 2, doorCol: 1, doorRow: 7, color: 0x2a3028, roofColor: 0x3a4030 },
  { id: 'mill', name: 'Mill', col: 6, row: 7, w: 2, h: 2, doorCol: 6, doorRow: 7, color: 0x2e2822, roofColor: 0x3e3828 },
];

function buildGrid(): number[][] {
  const grid: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) {
      // Edges are grass
      if (c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1) {
        row.push(GRASS);
      } else {
        row.push(PATH);
      }
    }
    grid.push(row);
  }
  // Place buildings as blocked tiles
  for (const b of BUILDINGS) {
    for (let r = b.row; r < b.row + b.h; r++) {
      for (let c = b.col; c < b.col + b.w; c++) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
          grid[r][c] = BUILDING;
        }
      }
    }
    // Ensure door tile is walkable
    if (b.doorRow >= 0 && b.doorRow < ROWS && b.doorCol >= 0 && b.doorCol < COLS) {
      grid[b.doorRow][b.doorCol] = PATH;
    }
  }
  // Ensure main streets are clear
  for (let c = 1; c < COLS - 1; c++) {
    grid[3][c] = PATH; // horizontal street
    grid[6][c] = PATH; // horizontal street
  }
  for (let r = 1; r < ROWS - 1; r++) {
    grid[r][3] = PATH; // vertical street left
    grid[r][4] = PATH; // vertical street right
  }
  return grid;
}

function toWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: GRID_LEFT + col * TILE + TILE / 2,
    y: GRID_TOP + row * TILE + TILE / 2,
  };
}

export class TownMapScene extends Phaser.Scene {
  private grid: number[][] = [];
  private playerPos = { col: 4, row: 9 };
  private playerSprite: Phaser.GameObjects.Sprite | null = null;
  private playerIndicator: Phaser.GameObjects.Graphics | null = null;
  private isMoving = false;
  private catBreed = 'wildcat';
  private buildingLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private promptText: Phaser.GameObjects.Text | null = null;
  private activeDoor: BuildingDef | null = null;

  constructor() {
    super({ key: 'TownMapScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    const save = getGameState();
    const playerCat = save?.cats.find((c) => c.isPlayer);
    this.catBreed = playerCat?.breed ?? 'wildcat';
    this.isMoving = false;
    this.activeDoor = null;
    this.buildingLabels = new Map();

    // Build grid
    this.grid = buildGrid();

    // Draw map
    this.drawMap();
    this.drawBuildings();

    // Spawn player
    this.spawnPlayer();

    // Spawn a few wandering NPC cats
    this.spawnNPCCats();

    // Controls
    this.setupControls();

    // D-pad
    createDpad(this, {
      x: GAME_WIDTH / 2,
      y: GRID_TOP + GRID_H + 55,
      size: 38,
      onDirection: (dx, dy) => {
        this.movePlayer(dx, dy);
      },
      holdRepeat: true,
      repeatInterval: 200,
    });

    // Prompt text for building interactions
    this.promptText = this.add.text(GAME_WIDTH / 2, GRID_TOP + GRID_H + 8, '', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#c4956a',
    }).setOrigin(0.5).setAlpha(0);

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  private drawMap(): void {
    const gfx = this.add.graphics();

    // Time of day tint
    const phase = getCurrentPhase();
    const isDusk = phase === 'Afternoon' || phase === 'Dusk';
    const isNight = phase === 'Night' || phase === 'Late Night';

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = GRID_LEFT + c * TILE;
        const y = GRID_TOP + r * TILE;
        const tile = this.grid[r][c];

        if (tile === PATH) {
          // Cobblestone path
          const shade = (c + r) % 2 === 0 ? 0x2e2a25 : 0x322e28;
          gfx.fillStyle(shade);
          gfx.fillRect(x, y, TILE, TILE);
          // Stone block lines
          gfx.lineStyle(1, 0x252220, 0.15);
          gfx.lineBetween(x, y + TILE / 2, x + TILE, y + TILE / 2);
          const offset = (r % 2) * (TILE / 2);
          gfx.lineBetween(x + offset, y, x + offset, y + TILE);
          gfx.lineBetween(x + offset + TILE / 2, y, x + offset + TILE / 2, y + TILE);
        } else if (tile === GRASS) {
          gfx.fillStyle(0x1e2a1e);
          gfx.fillRect(x, y, TILE, TILE);
          // Grass tufts
          gfx.fillStyle(0x2a3a2a, 0.4);
          const seed = c * 7 + r * 13;
          gfx.fillCircle(x + (seed % 30) + 8, y + ((seed * 3) % 30) + 8, 3);
        }
      }
    }

    // Night/dusk overlay
    if (isNight) {
      gfx.fillStyle(0x0a0a14, 0.4);
      gfx.fillRect(GRID_LEFT, GRID_TOP, GRID_W, GRID_H);
    } else if (isDusk) {
      gfx.fillStyle(0x1a0a0a, 0.15);
      gfx.fillRect(GRID_LEFT, GRID_TOP, GRID_W, GRID_H);
    }
  }

  private drawBuildings(): void {
    for (const b of BUILDINGS) {
      const x = GRID_LEFT + b.col * TILE;
      const y = GRID_TOP + b.row * TILE;
      const w = b.w * TILE;
      const h = b.h * TILE;

      const gfx = this.add.graphics();

      // Building body
      gfx.fillStyle(b.color);
      gfx.fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 3);

      // Roof accent
      gfx.fillStyle(b.roofColor);
      gfx.fillRect(x + 2, y + 2, w - 4, 6);

      // Door marker
      const doorX = GRID_LEFT + b.doorCol * TILE + TILE / 2;
      const doorY = GRID_TOP + b.doorRow * TILE + TILE / 2;
      gfx.fillStyle(0xdda055, 0.3);
      gfx.fillCircle(doorX, doorY, 4);

      // Building name
      const labelY = y + h / 2;
      const label = this.add.text(x + w / 2, labelY, b.name, {
        fontFamily: 'Georgia, serif',
        fontSize: b.id === 'jobs' ? '9px' : '10px',
        color: '#8b7355',
        align: 'center',
        wordWrap: { width: w - 8 },
      }).setOrigin(0.5);
      this.buildingLabels.set(b.id, label);

      // Make building interactive
      const hitZone = this.add.zone(x + w / 2, y + h / 2, w, h);
      hitZone.setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => {
        // Check if player is adjacent to the door
        const dist = Math.abs(this.playerPos.col - b.doorCol) + Math.abs(this.playerPos.row - b.doorRow);
        if (dist <= 1) {
          this.enterBuilding(b);
        } else {
          // Walk toward the door first
          this.walkToThenEnter(b);
        }
      });
    }
  }

  private spawnPlayer(): void {
    const { x, y } = toWorld(this.playerPos.col, this.playerPos.row);

    // Golden indicator
    this.playerIndicator = this.add.graphics();
    this.playerIndicator.fillStyle(0xdda055, 0.4);
    this.playerIndicator.fillTriangle(-6, 0, 0, -4, 6, 0);
    this.playerIndicator.fillTriangle(-6, 0, 0, 4, 6, 0);
    this.playerIndicator.setPosition(x, y - 20);

    // Cat sprite
    const idleKey = `${this.catBreed}_idle_south`;
    if (this.textures.exists(idleKey)) {
      this.playerSprite = this.add.sprite(x, y, idleKey);
      this.playerSprite.setScale(0.8);
      this.playerSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Bob animation on indicator
    this.tweens.add({
      targets: this.playerIndicator,
      y: y - 24,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private spawnNPCCats(): void {
    const save = getGameState();
    if (!save || save.cats.length < 2) return;

    const breeds = (ALL_BREED_IDS as readonly string[]).filter(
      (b) => save.cats.some((c) => c.breed === b && !c.isPlayer)
    );
    const pathTiles: { col: number; row: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] === PATH && !(r === this.playerPos.row && c === this.playerPos.col)) {
          pathTiles.push({ col: c, row: r });
        }
      }
    }

    const count = Math.min(2, breeds.length, pathTiles.length);
    for (let i = 0; i < count; i++) {
      const breed = breeds[i % breeds.length];
      const tile = pathTiles[Math.floor(Math.random() * pathTiles.length)];
      pathTiles.splice(pathTiles.indexOf(tile), 1);

      const { x, y } = toWorld(tile.col, tile.row);
      const dir = ['south', 'north', 'east', 'west'][Math.floor(Math.random() * 4)];
      const key = `${breed}_idle_${dir}`;
      if (this.textures.exists(key)) {
        const npc = this.add.sprite(x, y, key);
        npc.setScale(0.7);
        npc.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        npc.setAlpha(0.8);

        // Gentle wander
        this.time.addEvent({
          delay: 3000 + Math.random() * 4000,
          callback: () => {
            const dx = (Math.random() - 0.5) * TILE * 1.5;
            const dy = (Math.random() - 0.5) * TILE * 1.5;
            const nx = Phaser.Math.Clamp(npc.x + dx, GRID_LEFT + TILE, GRID_LEFT + GRID_W - TILE);
            const ny = Phaser.Math.Clamp(npc.y + dy, GRID_TOP + TILE, GRID_TOP + GRID_H - TILE);

            const walkDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
            const walkKey = `${breed}_walk_${walkDir}`;
            if (this.anims.exists(walkKey)) npc.play(walkKey);

            this.tweens.add({
              targets: npc, x: nx, y: ny, duration: 800, ease: 'Linear',
              onComplete: () => {
                const idleDir = `${breed}_idle_${walkDir}`;
                if (this.textures.exists(idleDir)) { npc.stop(); npc.setTexture(idleDir); }
              },
            });
          },
          loop: true,
        });
      }
    }
  }

  private setupControls(): void {
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown', (e: KeyboardEvent) => {
        switch (e.key) {
          case 'ArrowUp': case 'w': case 'W': this.movePlayer(0, -1); break;
          case 'ArrowDown': case 's': case 'S': this.movePlayer(0, 1); break;
          case 'ArrowLeft': case 'a': case 'A': this.movePlayer(-1, 0); break;
          case 'ArrowRight': case 'd': case 'D': this.movePlayer(1, 0); break;
          case 'Enter': case ' ':
            if (this.activeDoor) this.enterBuilding(this.activeDoor);
            break;
        }
      });
    }

    // Tap to move
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const wx = pointer.x / DPR;
      const wy = pointer.y / DPR;
      if (wx < GRID_LEFT || wx > GRID_LEFT + GRID_W || wy < GRID_TOP || wy > GRID_TOP + GRID_H) return;

      const col = Math.floor((wx - GRID_LEFT) / TILE);
      const row = Math.floor((wy - GRID_TOP) / TILE);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

      // Single-step toward the tapped position
      const dc = col - this.playerPos.col;
      const dr = row - this.playerPos.row;
      if (Math.abs(dc) > Math.abs(dr)) {
        this.movePlayer(dc > 0 ? 1 : -1, 0);
      } else if (dr !== 0) {
        this.movePlayer(0, dr > 0 ? 1 : -1);
      }
    });
  }

  private movePlayer(dx: number, dy: number): void {
    if (this.isMoving) return;
    const nc = this.playerPos.col + dx;
    const nr = this.playerPos.row + dy;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;
    if (this.grid[nr][nc] === BUILDING) return;

    this.isMoving = true;
    this.playerPos = { col: nc, row: nr };
    const dest = toWorld(nc, nr);

    // Walk animation
    const dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'east' : 'west')
      : (dy > 0 ? 'south' : 'north');
    const walkKey = `${this.catBreed}_walk_${dir}`;
    if (this.playerSprite && this.anims.exists(walkKey)) {
      this.playerSprite.play(walkKey);
    }

    // Move sprite
    if (this.playerSprite) {
      this.tweens.add({
        targets: this.playerSprite,
        x: dest.x, y: dest.y,
        duration: 180,
        ease: 'Linear',
        onComplete: () => {
          this.isMoving = false;
          const idleKey = `${this.catBreed}_idle_${dir}`;
          if (this.playerSprite && this.textures.exists(idleKey)) {
            (this.playerSprite as Phaser.GameObjects.Sprite).stop();
            (this.playerSprite as Phaser.GameObjects.Sprite).setTexture(idleKey);
          }
          this.checkDoorProximity();
        },
      });
    }

    // Move indicator
    if (this.playerIndicator) {
      this.tweens.killTweensOf(this.playerIndicator);
      this.tweens.add({
        targets: this.playerIndicator,
        x: dest.x, y: dest.y - 20,
        duration: 180,
        ease: 'Linear',
        onComplete: () => {
          this.tweens.add({
            targets: this.playerIndicator,
            y: dest.y - 24,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        },
      });
    }
  }

  private checkDoorProximity(): void {
    this.activeDoor = null;
    for (const b of BUILDINGS) {
      if (this.playerPos.col === b.doorCol && this.playerPos.row === b.doorRow) {
        this.activeDoor = b;
        break;
      }
    }

    if (this.promptText) {
      if (this.activeDoor) {
        this.promptText.setText(`Tap to enter ${this.activeDoor.name}`);
        this.promptText.setAlpha(1);
      } else {
        this.promptText.setAlpha(0);
      }
    }
  }

  private walkToThenEnter(b: BuildingDef): void {
    // Simple path: step toward the door one step at a time
    const dc = b.doorCol - this.playerPos.col;
    const dr = b.doorRow - this.playerPos.row;

    if (dc === 0 && dr === 0) {
      this.enterBuilding(b);
      return;
    }

    // Move one step toward door
    if (Math.abs(dc) > Math.abs(dr)) {
      this.movePlayer(dc > 0 ? 1 : -1, 0);
    } else {
      this.movePlayer(0, dr > 0 ? 1 : -1);
    }

    // Continue walking after this step
    this.time.delayedCall(220, () => {
      if (this.playerPos.col === b.doorCol && this.playerPos.row === b.doorRow) {
        this.enterBuilding(b);
      } else {
        this.walkToThenEnter(b);
      }
    });
  }

  private enterBuilding(b: BuildingDef): void {
    // Emit location-specific events that main.ts handles
    switch (b.id) {
      case 'jobs':
        eventBus.emit('show-town-overlay', { section: 'jobs' });
        break;
      case 'market':
        eventBus.emit('show-town-overlay', { section: 'recruit' });
        break;
      case 'tavern':
        eventBus.emit('show-town-overlay', { section: 'all' });
        break;
      case 'cathedral':
      case 'castle':
      case 'docks':
      case 'mill':
        eventBus.emit('show-town-overlay', { section: 'jobs' });
        break;
      default:
        eventBus.emit('show-town-overlay');
        break;
    }
  }
}
