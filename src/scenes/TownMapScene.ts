import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, ALL_BREED_IDS } from '../utils/constants';
import { getGameState, getAcceptedJob } from '../main';
import { getCurrentPhase } from '../systems/DayTimer';

import { playSfx } from '../systems/SfxManager';
import { getAvailableRecruits } from '../systems/CatManager';

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
  { id: 'carpenter', name: 'Carpenter', col: 3, row: 7, w: 2, h: 1, doorCol: 4, doorRow: 8, color: 0x3a2e22, roofColor: 0x4a3e28 },
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
  private playerPos = { col: 4, row: 8 };
  private playerSprite: Phaser.GameObjects.Sprite | null = null;
  private playerIndicator: Phaser.GameObjects.Graphics | null = null;
  private isMoving = false;
  private catBreed = 'wildcat';
  private buildingLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private promptText: Phaser.GameObjects.Text | null = null;
  private activeDoor: BuildingDef | null = null;
  private strayCats: { breed: string; col: number; row: number; sprite: Phaser.GameObjects.Sprite; nameLabel: Phaser.GameObjects.Text }[] = [];

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

    // Spawn recruitable stray cats
    this.spawnStrayCats();

    // Spawn plague rats if active
    const save2 = getGameState();
    if (save2?.flags.ratPlagueStarted && !save2.flags.ratPlagueResolved) {
      this.spawnPlagueRats();
    }

    // Controls
    this.setupControls();

    // Virtual joystick for town movement
    this.input.addPointer(1);
    const joyX = GAME_WIDTH / 2;
    const joyY = GRID_TOP + GRID_H + 55;
    const joyRadius = 36;
    this.add.circle(joyX, joyY, joyRadius, 0x2a2520, 0.6).setStrokeStyle(1, 0x6b5b3e);
    const joyKnob = this.add.circle(joyX, joyY, 14, 0x6b5b3e, 0.8);

    let joyPointerId = -1;
    let joyMoveTimer: Phaser.Time.TimerEvent | null = null;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const wx = pointer.x / DPR;
      const wy = pointer.y / DPR;
      if (Math.sqrt((wx - joyX) ** 2 + (wy - joyY) ** 2) < joyRadius * 1.5) {
        joyPointerId = pointer.id;
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === joyPointerId) {
        joyPointerId = -1;
        joyKnob.setPosition(joyX, joyY);
        joyMoveTimer?.destroy();
        joyMoveTimer = null;
      }
    });

    // Poll joystick in a timer for grid-based movement
    this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (joyPointerId < 0) return;
        const pointers = [this.input.pointer1, this.input.pointer2, this.input.activePointer];
        for (const p of pointers) {
          if (p && p.id === joyPointerId && p.isDown) {
            const dx = p.x / DPR - joyX;
            const dy = p.y / DPR - joyY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const clampDist = Math.min(dist, joyRadius);
            if (dist > 8) {
              joyKnob.setPosition(joyX + (dx / dist) * clampDist, joyY + (dy / dist) * clampDist);
              // Trigger grid movement if not already moving
              if (!this.isMoving && !joyMoveTimer) {
                const mdx = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0;
                const mdy = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 1 : -1) : 0;
                this.movePlayer(mdx, mdy);
                joyMoveTimer = this.time.delayedCall(200, () => { joyMoveTimer = null; });
              }
            } else {
              joyKnob.setPosition(joyX, joyY);
            }
            break;
          }
        }
      },
    });

    // Prompt text for building interactions
    this.promptText = this.add.text(GAME_WIDTH / 2, GRID_TOP + GRID_H + 8, '', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#c4956a',
    }).setOrigin(0.5).setAlpha(0);

    // Accepted job banner
    const accepted = getAcceptedJob();
    if (accepted) {
      const jobBanner = this.add.text(GAME_WIDTH / 2, GRID_TOP + GRID_H + 22,
        `\u{1F4CB} Job: ${accepted.name} — go to a location to start`, {
        fontFamily: 'Georgia, serif', fontSize: '10px', color: '#dda055',
      }).setOrigin(0.5);
      // Pulse to draw attention
      this.tweens.add({ targets: jobBanner, alpha: 0.5, duration: 800, yoyo: true, repeat: -1 });
    }

    // Ambient mist
    for (let i = 0; i < 4; i++) {
      const mist = this.add.ellipse(
        GRID_LEFT + Math.random() * GRID_W,
        GRID_TOP + GRID_H * 0.6 + Math.random() * GRID_H * 0.4,
        40 + Math.random() * 30, 8, 0x1c1b19, 0.2
      );
      this.tweens.add({
        targets: mist,
        x: mist.x + 30 + Math.random() * 20,
        alpha: 0,
        duration: 6000 + Math.random() * 4000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Clean up timers and tweens when scene stops (prevents memory leaks)
    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

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
      gfx.fillRect(x + 2, y + 2, w - 4, 8);

      // Building-specific details
      this.drawBuildingDetails(gfx, b, x, y, w, h);

      // Door glow (torch light at entrance)
      const doorX = GRID_LEFT + b.doorCol * TILE + TILE / 2;
      const doorY = GRID_TOP + b.doorRow * TILE + TILE / 2;
      gfx.fillStyle(0xdda055, 0.12);
      gfx.fillCircle(doorX, doorY, 16);
      gfx.fillStyle(0xdda055, 0.25);
      gfx.fillCircle(doorX, doorY, 6);

      // Torch flicker animation
      const torch = this.add.circle(doorX, doorY - 2, 3, 0xdda055, 0.5);
      this.tweens.add({
        targets: torch, alpha: 0.2, scaleX: 0.7, scaleY: 0.7,
        duration: 400 + Math.random() * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });

      // Building name
      const labelY = y + h / 2 + 4;
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
        const dist = Math.abs(this.playerPos.col - b.doorCol) + Math.abs(this.playerPos.row - b.doorRow);
        if (dist <= 2) {
          this.enterBuilding(b);
        } else {
          this.walkToThenEnter(b);
        }
      });
    }
  }

  private drawBuildingDetails(gfx: Phaser.GameObjects.Graphics, b: BuildingDef, x: number, y: number, w: number, h: number): void {
    switch (b.id) {
      case 'cathedral': {
        // Steeple / cross
        const cx = x + w / 2;
        gfx.fillStyle(b.roofColor);
        gfx.fillTriangle(cx - 15, y + 10, cx, y - 6, cx + 15, y + 10);
        gfx.fillStyle(0x6b5b3e, 0.6);
        gfx.fillRect(cx - 1, y - 12, 3, 10);
        gfx.fillRect(cx - 4, y - 8, 9, 2);
        // Stained glass window
        gfx.fillStyle(0x4a5a6a, 0.25);
        gfx.fillCircle(cx, y + h / 2, 8);
        gfx.fillStyle(0x6b5b3e, 0.1);
        gfx.fillRect(cx - 1, y + h / 2 - 8, 2, 16);
        break;
      }
      case 'castle': {
        // Battlements
        const bw = 8;
        for (let bx = x + 4; bx < x + w - 4; bx += bw * 2) {
          gfx.fillStyle(b.roofColor);
          gfx.fillRect(bx, y - 4, bw, 8);
        }
        // Gate
        gfx.fillStyle(0x1a1818);
        gfx.fillRect(x + w / 2 - 8, y + h - 18, 16, 18);
        gfx.fillStyle(0x3a3530, 0.5);
        gfx.fillRect(x + w / 2 - 7, y + h - 17, 14, 1);
        gfx.fillRect(x + w / 2 - 7, y + h - 12, 14, 1);
        gfx.fillRect(x + w / 2 - 7, y + h - 7, 14, 1);
        break;
      }
      case 'tavern': {
        // Windows with warm glow
        gfx.fillStyle(0x8a6a3a, 0.2);
        gfx.fillRect(x + 8, y + 16, 12, 10);
        gfx.fillRect(x + w - 20, y + 16, 12, 10);
        // Glow
        gfx.fillStyle(0xdda055, 0.06);
        gfx.fillCircle(x + 14, y + 21, 14);
        gfx.fillCircle(x + w - 14, y + 21, 14);
        break;
      }
      case 'market': {
        // Awning stripes
        gfx.fillStyle(0x4a3a28, 0.5);
        for (let sx = x + 6; sx < x + w - 6; sx += 10) {
          gfx.fillRect(sx, y + 10, 4, h - 16);
        }
        // Crates
        gfx.fillStyle(0x4a3a28);
        gfx.fillRect(x + 6, y + h - 14, 10, 8);
        gfx.fillRect(x + w - 16, y + h - 14, 10, 8);
        break;
      }
      case 'jobs': {
        // Notice board posts
        gfx.fillStyle(0x5a4a3a);
        gfx.fillRect(x + 8, y + 4, 4, h - 8);
        gfx.fillRect(x + w - 12, y + 4, 4, h - 8);
        // Papers
        gfx.fillStyle(0x8b7355, 0.3);
        gfx.fillRect(x + 16, y + 8, 12, 8);
        gfx.fillRect(x + 32, y + 6, 10, 10);
        gfx.fillRect(x + w - 30, y + 8, 14, 8);
        break;
      }
      case 'docks': {
        // Water edge
        gfx.fillStyle(0x2a3a4a, 0.4);
        gfx.fillRect(x + 2, y + h - 10, w - 4, 8);
        // Rope coils
        gfx.lineStyle(1, 0x6b5b3e, 0.3);
        gfx.strokeCircle(x + 12, y + 20, 5);
        gfx.strokeCircle(x + w - 12, y + 20, 5);
        break;
      }
      case 'mill': {
        // Wheel/fan
        const mx = x + w / 2;
        const my = y + h / 2 - 4;
        gfx.lineStyle(2, 0x5a4a3a, 0.5);
        for (let a = 0; a < 4; a++) {
          const angle = (a * Math.PI) / 2 + Date.now() * 0.001;
          gfx.lineBetween(mx, my, mx + Math.cos(angle) * 14, my + Math.sin(angle) * 14);
        }
        gfx.fillStyle(0x5a4a3a, 0.5);
        gfx.fillCircle(mx, my, 3);
        break;
      }
      case 'carpenter': {
        // Saw and wood planks
        gfx.fillStyle(0x5a4a3a, 0.5);
        gfx.fillRect(x + 6, y + h / 2 - 2, w - 12, 4); // workbench
        // Wood planks
        gfx.fillStyle(0x6a5a3a, 0.4);
        gfx.fillRect(x + 8, y + 4, 14, 5);
        gfx.fillRect(x + w - 22, y + 4, 14, 5);
        break;
      }
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

        // Gentle wander — stay on walkable tiles
        let npcCol = tile.col;
        let npcRow = tile.row;
        this.time.addEvent({
          delay: 3000 + Math.random() * 4000,
          callback: () => {
            // Pick a random adjacent walkable tile
            const dirs = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];
            const shuffled = dirs.sort(() => Math.random() - 0.5);
            for (const d of shuffled) {
              const nc = npcCol + d.dc;
              const nr = npcRow + d.dr;
              if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && this.grid[nr][nc] === PATH) {
                npcCol = nc;
                npcRow = nr;
                const dest = toWorld(nc, nr);
                const walkDir = Math.abs(d.dc) > Math.abs(d.dr) ? (d.dc > 0 ? 'east' : 'west') : (d.dr > 0 ? 'south' : 'north');
                const walkKey = `${breed}_walk_${walkDir}`;
                if (!npc.active) return;
                if (this.anims.exists(walkKey)) npc.play(walkKey);
                this.tweens.add({
                  targets: npc, x: dest.x, y: dest.y, duration: 600, ease: 'Linear',
                  onComplete: () => {
                    if (!npc.active) return;
                    const idleDir = `${breed}_idle_${walkDir}`;
                    if (this.textures.exists(idleDir)) { npc.stop(); npc.setTexture(idleDir); }
                  },
                });
                break;
              }
            }
          },
          loop: true,
        });
      }
    }
  }

  private spawnStrayCats(): void {
    const save = getGameState();
    if (!save) return;
    this.strayCats = [];

    const recruits = getAvailableRecruits(save);
    if (recruits.length === 0) return;

    // Find walkable tiles away from player and buildings
    const pathTiles: { col: number; row: number }[] = [];
    for (let r = 2; r < ROWS - 2; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (this.grid[r][c] === PATH && !(r === this.playerPos.row && c === this.playerPos.col)) {
          pathTiles.push({ col: c, row: r });
        }
      }
    }

    // Place up to 2 stray cats
    const count = Math.min(2, recruits.length, pathTiles.length);
    for (let i = 0; i < count; i++) {
      const breed = recruits[i];
      const tileIdx = Math.floor(Math.random() * pathTiles.length);
      const tile = pathTiles[tileIdx];
      pathTiles.splice(tileIdx, 1);

      const { x, y } = toWorld(tile.col, tile.row);
      const idleKey = `${breed.id}_idle_south`;

      let sprite: Phaser.GameObjects.Sprite;
      if (this.textures.exists(idleKey)) {
        sprite = this.add.sprite(x, y, idleKey);
        sprite.setScale(0.75);
        sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      } else {
        // Fallback — won't have sprite but still trackable
        sprite = this.add.sprite(x, y, 'pixel');
      }

      // Breed name label above the stray
      const nameLabel = this.add.text(x, y - 22, `Stray ${breed.name}`, {
        fontFamily: 'Georgia, serif', fontSize: '8px', color: '#dda055',
      }).setOrigin(0.5);

      // Question mark indicator
      const qMark = this.add.text(x, y - 32, '?', {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#dda055',
      }).setOrigin(0.5);

      // Click to recruit (only when player is adjacent)
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => {
        const dist = Math.abs(this.playerPos.col - tile.col) + Math.abs(this.playerPos.row - tile.row);
        if (dist <= 1) {
          eventBus.emit('recruit-cat', breed.id);
          sprite.destroy();
          nameLabel.destroy();
          qMark.destroy();
          this.strayCats = this.strayCats.filter((s) => s.breed !== breed.id);
        } else {
          // Too far — walk toward the stray
          this.walkToThenInteractStray(tile.col, tile.row, breed.id);
        }
      });
      this.tweens.add({
        targets: qMark, y: y - 36, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });

      this.strayCats.push({ breed: breed.id, col: tile.col, row: tile.row, sprite, nameLabel });

      // Gentle idle animation
      this.time.addEvent({
        delay: 4000 + Math.random() * 3000,
        callback: () => {
          const dirs = ['south', 'north', 'east', 'west'];
          const dir = dirs[Math.floor(Math.random() * dirs.length)];
          if (!sprite.active) return;
          const key = `${breed.id}_idle_${dir}`;
          if (this.textures.exists(key)) sprite.setTexture(key);
        },
        loop: true,
      });
    }
  }

  private spawnPlagueRats(): void {
    // Scatter rat sprites around the town during the plague
    const pathTiles: { col: number; row: number }[] = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (this.grid[r][c] === PATH) pathTiles.push({ col: c, row: r });
      }
    }
    const count = Math.min(5, pathTiles.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * pathTiles.length);
      const tile = pathTiles.splice(idx, 1)[0];
      const { x, y } = toWorld(tile.col, tile.row);

      if (this.textures.exists('rat')) {
        const rat = this.add.sprite(x, y, 'rat');
        rat.setScale(0.6);
        rat.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        rat.setAlpha(0.7);
        // Skitter around
        this.time.addEvent({
          delay: 2000 + Math.random() * 3000,
          callback: () => {
            if (!rat.active) return;
            const nx = x + (Math.random() - 0.5) * TILE * 2;
            const ny = y + (Math.random() - 0.5) * TILE * 2;
            this.tweens.add({ targets: rat, x: Phaser.Math.Clamp(nx, GRID_LEFT + TILE, GRID_LEFT + GRID_W - TILE), y: Phaser.Math.Clamp(ny, GRID_TOP + TILE, GRID_TOP + GRID_H - TILE), duration: 400, ease: 'Linear' });
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

    // Close any open town overlay when the player moves
    eventBus.emit('close-town-overlay');

    // Walk animation
    const dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'east' : 'west')
      : (dy > 0 ? 'south' : 'north');
    const walkKey = `${this.catBreed}_walk_${dir}`;
    if (this.playerSprite && this.anims.exists(walkKey)) {
      this.playerSprite.play(walkKey);
    }

    // Move sprite — smooth easing
    if (this.playerSprite) {
      this.tweens.add({
        targets: this.playerSprite,
        x: dest.x, y: dest.y,
        duration: 160,
        ease: 'Sine.easeOut',
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
        duration: 160,
        ease: 'Sine.easeInOut',
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
    const prevDoor = this.activeDoor;
    this.activeDoor = null;
    for (const b of BUILDINGS) {
      const dist = Math.abs(this.playerPos.col - b.doorCol) + Math.abs(this.playerPos.row - b.doorRow);
      if (dist <= 1) {
        this.activeDoor = b;
        break;
      }
    }

    // Auto-enter the Job Board when stepping on its door tile
    if (this.activeDoor && this.activeDoor.id === 'jobs' &&
        this.playerPos.col === this.activeDoor.doorCol && this.playerPos.row === this.activeDoor.doorRow) {
      this.enterBuilding(this.activeDoor);
    }

    if (this.promptText) {
      if (this.activeDoor) {
        // Check if there's an accepted job to start here
        const hasJob = this.activeDoor.id !== 'jobs' && this.activeDoor.id !== 'carpenter';
        this.promptText.setText(hasJob ? `Start job at ${this.activeDoor.name}` : `Enter ${this.activeDoor.name}`);
        this.promptText.setAlpha(1);
      } else {
        this.promptText.setAlpha(0);
      }
    }

    // Highlight/unhighlight building labels
    if (prevDoor && prevDoor !== this.activeDoor) {
      const prevLabel = this.buildingLabels.get(prevDoor.id);
      if (prevLabel) prevLabel.setColor('#8b7355');
    }
    if (this.activeDoor) {
      const label = this.buildingLabels.get(this.activeDoor.id);
      if (label) label.setColor('#c4956a');
    }

    // Check for stray cat proximity — show prompt when nearby, tap to recruit
    for (const stray of this.strayCats) {
      const dist = Math.abs(this.playerPos.col - stray.col) + Math.abs(this.playerPos.row - stray.row);
      if (dist <= 2) {
        if (this.promptText) {
          this.promptText.setText(`Tap to talk to stray`);
          this.promptText.setAlpha(1);
        }
        return; // Don't show building prompt if near a stray
      }
    }
  }

  private walkToThenInteractStray(col: number, row: number, breedId: string): void {
    const dc = col - this.playerPos.col;
    const dr = row - this.playerPos.row;
    if (Math.abs(dc) + Math.abs(dr) <= 1) {
      // Close enough — trigger recruit
      eventBus.emit('recruit-cat', breedId);
      const stray = this.strayCats.find((s) => s.breed === breedId);
      if (stray) {
        stray.sprite.destroy();
        stray.nameLabel.destroy();
        this.strayCats = this.strayCats.filter((s) => s !== stray);
      }
      return;
    }
    if (Math.abs(dc) > Math.abs(dr)) {
      this.movePlayer(dc > 0 ? 1 : -1, 0);
    } else {
      this.movePlayer(0, dr > 0 ? 1 : -1);
    }
    this.time.delayedCall(220, () => this.walkToThenInteractStray(col, row, breedId));
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
    playSfx('tap', 0.3);
    if (b.id === 'carpenter') {
      eventBus.emit('show-furniture-shop');
    } else if (b.id === 'jobs') {
      eventBus.emit('show-town-overlay');
    } else {
      // Non-job-board buildings: start accepted job if one exists
      eventBus.emit('start-accepted-job');
    }
  }
}
