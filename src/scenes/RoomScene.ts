import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS, BREED_NAMES } from '../utils/constants';
import { getGameState } from '../main';
import type { SaveData } from '../systems/SaveManager';
import { saveGame } from '../systems/SaveManager';
import { isCatStationed } from '../systems/Economy';
import { addBondPoints } from '../systems/BondSystem';

const BREEDS_WITH_SPRITES = new Set(['wildcat', 'russian_blue', 'tuxedo', 'maine_coon', 'siamese']);

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

function worldToGrid(wx: number, wy: number): { col: number; row: number } {
  return {
    col: Math.floor((wx - GRID_LEFT) / TILE_SIZE),
    row: Math.floor((wy - GRID_TOP) / TILE_SIZE),
  };
}

// Interactive furniture: cats can walk to these and perform an action
const INTERACTIVE_FURNITURE: Record<string, { action: string; duration: number; anim?: string; breedAnim?: string }> = {
  scratching_post: { action: 'scratching', duration: 2000, anim: 'scratch' },
  potted_catnip: { action: 'sniffing catnip', duration: 1500, anim: 'eat' },
  cushioned_basket: { action: 'curling up', duration: 3000, breedAnim: 'sleep' },
  straw_bed: { action: 'sleeping', duration: 4000, breedAnim: 'sleep' },
  woolen_blanket: { action: 'napping', duration: 3500, breedAnim: 'sleep' },
  bookshelf: { action: 'investigating', duration: 1500 },
};

export class RoomScene extends Phaser.Scene {
  private roomId = 'sleeping';
  private openTiles: { col: number; row: number }[] = [];
  private openTileSet = new Set<string>();
  private playerMoveTo: ((col: number, row: number, onArrive?: () => void) => void) | null = null;
  private playerSprite: Phaser.GameObjects.Sprite | null = null;
  private playerBreed = 'wildcat';

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

    // Hint for furniture movement
    if (save.furniture.some((f) => f.room === this.roomId)) {
      this.add.text(GAME_WIDTH / 2, 68, 'Drag furniture to rearrange. Drag off-grid to move rooms.', {
        fontFamily: 'Georgia, serif',
        fontSize: '8px',
        color: '#555',
      }).setOrigin(0.5);
    }

    this.drawRoom();
    this.drawFurniture(save);
    this.drawCats(save);
    this.drawAmbience();

    // Cats react when you enter — play a random sound after a moment
    this.time.delayedCall(800, () => {
      const sounds = ['wildcat_meow', 'wildcat_chirp'];
      const sound = sounds[Math.floor(Math.random() * sounds.length)];
      if (this.cache.audio.exists(sound)) {
        this.sound.play(sound, { volume: 0.25 });
      }
    });
  }

  private drawRoom(): void {
    // Background room art
    if (this.textures.exists('scene_room')) {
      const roomBg = this.add.sprite(GAME_WIDTH / 2, GRID_TOP + (GRID_ROWS * TILE_SIZE) / 2, 'scene_room');
      roomBg.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      roomBg.setScale(GRID_COLS * TILE_SIZE / roomBg.width);
      roomBg.setAlpha(0.25);
    }

    const gfx = this.add.graphics();
    const gridW = GRID_COLS * TILE_SIZE;
    const gridH = GRID_ROWS * TILE_SIZE;

    // Floor tiles (checkerboard)
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const shade = (col + row) % 2 === 0 ? 0x2e2a25 : 0x322e28;
        gfx.fillStyle(shade);
        gfx.fillRect(GRID_LEFT + col * TILE_SIZE, GRID_TOP + row * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        gfx.lineStyle(1, 0x3a3530, 0.12);
        gfx.strokeRect(GRID_LEFT + col * TILE_SIZE, GRID_TOP + row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Walls
    const wallThickness = 8;
    gfx.fillStyle(0x2a2622);
    gfx.fillRect(GRID_LEFT - wallThickness, GRID_TOP - wallThickness, gridW + wallThickness * 2, wallThickness);
    gfx.fillStyle(0x262420);
    gfx.fillRect(GRID_LEFT - wallThickness, GRID_TOP - wallThickness, wallThickness, gridH + wallThickness * 2);
    gfx.fillStyle(0x242220);
    gfx.fillRect(GRID_LEFT + gridW, GRID_TOP - wallThickness, wallThickness, gridH + wallThickness * 2);
    gfx.fillStyle(0x282622);
    gfx.fillRect(GRID_LEFT - wallThickness, GRID_TOP + gridH, gridW + wallThickness * 2, wallThickness);

    gfx.lineStyle(1, 0x3a3530, 0.6);
    gfx.strokeRect(GRID_LEFT - wallThickness, GRID_TOP - wallThickness, gridW + wallThickness * 2, gridH + wallThickness * 2);
    gfx.strokeRect(GRID_LEFT, GRID_TOP, gridW, gridH);

    // Window
    const winX = GRID_LEFT + gridW * 0.4;
    const winW = 40;
    gfx.fillStyle(0x1a2a3a, 0.6);
    gfx.fillRect(winX, GRID_TOP - wallThickness, winW, wallThickness);
    gfx.lineStyle(1, 0x4a4035, 0.8);
    gfx.strokeRect(winX, GRID_TOP - wallThickness, winW, wallThickness);
    gfx.fillStyle(0x8899aa, 0.03);
    gfx.fillRect(winX - 5, GRID_TOP, winW + 10, 60);

    // Torch
    const torchY = GRID_TOP + gridH * 0.3;
    const torchX = GRID_LEFT + gridW + wallThickness / 2;
    gfx.fillStyle(0x6b5b3e);
    gfx.fillRect(torchX - 2, torchY - 5, 4, 10);
    gfx.fillStyle(0xdda055, 0.7);
    gfx.fillCircle(torchX, torchY - 7, 3);
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
      straw_bed: 0x8b7355, woolen_blanket: 0x6a5a7a, cushioned_basket: 0x7a6a5a,
      lantern: 0xdda055, candle_stand: 0xccaa66, scratching_post: 0x8a6a3a,
      bookshelf: 0x5a4a3a, rug_wool: 0x7a4a4a, saints_icon: 0x7a7a8a,
      fish_bone_mobile: 0x6a7a7a, potted_catnip: 0x5a8a5a,
    };

    allPlaced.forEach((f) => {
      const col = f.gridX % GRID_COLS;
      const row = f.gridY % GRID_ROWS;
      const { x, y } = toWorld(col, row);
      const color = colors[f.furnitureId] ?? 0x5a5a5a;
      const size = TILE_SIZE - 8;
      const spriteKey = `furniture_${f.furnitureId}`;

      if (this.textures.exists(spriteKey)) {
        const sprite = this.add.sprite(x, y, spriteKey);
        sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      } else {
        // Fallback: colored rectangle with label
        const gfx = this.add.graphics();
        gfx.fillStyle(color);
        gfx.fillRoundedRect(x - size / 2, y - size / 2, size, size, 4);
        gfx.lineStyle(1, 0x3a3530, 0.5);
        gfx.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 4);

        const label = f.furnitureId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        this.add.text(x, y, label, {
          fontFamily: 'Georgia, serif', fontSize: '6px', color: '#ddd',
          align: 'center', wordWrap: { width: size - 4 },
        }).setOrigin(0.5);
      }

      // Combined drag + interaction hitbox
      const dragHit = this.add.rectangle(x, y, size, size, 0x000000, 0)
        .setInteractive({ draggable: true, useHandCursor: true });

      let dragStartPos = { x: 0, y: 0 };
      let didDrag = false;

      dragHit.on('dragstart', (pointer: Phaser.Input.Pointer) => {
        dragStartPos = { x: pointer.x, y: pointer.y };
        didDrag = false;
      });

      dragHit.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        const dist = Math.hypot(pointer.x - dragStartPos.x, pointer.y - dragStartPos.y);
        if (dist > 8) didDrag = true;
        if (didDrag) {
          dragHit.setPosition(dragX, dragY);
          const spriteObj = this.children.getByName(`furn_sprite_${f.furnitureId}_${col}_${row}`) as Phaser.GameObjects.Sprite | null;
          if (spriteObj) spriteObj.setPosition(dragX, dragY);
        }
      });

      dragHit.on('dragend', () => {
        if (!didDrag) {
          // Short click — trigger interaction instead
          const interaction = INTERACTIVE_FURNITURE[f.furnitureId];
          if (interaction && this.playerMoveTo) {
            const fCol = col;
            const fRow = row;
            const neighbors = [
              { col: fCol - 1, row: fRow }, { col: fCol + 1, row: fRow },
              { col: fCol, row: fRow - 1 }, { col: fCol, row: fRow + 1 },
            ].filter((t) => this.openTileSet.has(`${t.col},${t.row}`));
            const target = this.openTileSet.has(`${fCol},${fRow}`)
              ? { col: fCol, row: fRow }
              : neighbors[0];
            if (target) {
              this.playerMoveTo(target.col, target.row, () => {
                // Pick breed-specific anim (sleep) or wildcat-only anim (scratch/sit/eat)
                const animKey = interaction.breedAnim
                  ? `${this.playerBreed}_${interaction.breedAnim}`
                  : interaction.anim ? `${this.playerBreed}_${interaction.anim}` : null;
                if (animKey && this.playerSprite && this.anims.exists(animKey)) {
                  this.playerSprite.play(animKey);
                  // For looping anims (sleep), stop after duration; for one-shot, wait for complete
                  if (interaction.breedAnim === 'sleep') {
                    this.time.delayedCall(interaction.duration, () => {
                      this.playerSprite?.setTexture(`${this.playerBreed}_idle_south`);
                      this.playerSprite?.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
                      this.playerSprite?.stop();
                    });
                  } else {
                    this.playerSprite.once('animationcomplete', () => {
                      this.playerSprite?.setTexture(`${this.playerBreed}_idle_south`);
                      this.playerSprite?.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
                    });
                  }
                }
                const actionText = document.createElement('div');
                actionText.className = 'toast';
                actionText.textContent = `*${interaction.action}*`;
                document.getElementById('overlay-layer')?.appendChild(actionText);
                setTimeout(() => actionText.remove(), interaction.duration);
              });
            }
          }
          return;
        }

        // Actual drag — rearrange or move to another room
        const grid = worldToGrid(dragHit.x, dragHit.y);
        if (grid.col >= 0 && grid.col < GRID_COLS && grid.row >= 0 && grid.row < GRID_ROWS) {
          f.gridX = grid.col;
          f.gridY = grid.row;
          const save = getGameState();
          if (save) saveGame(save);
          this.scene.restart({ roomId: this.roomId });
        } else {
          const save = getGameState();
          if (!save) { this.scene.restart({ roomId: this.roomId }); return; }
          const otherRooms = save.rooms.filter((r) => r.unlocked && r.id !== this.roomId);
          if (otherRooms.length === 0) { this.scene.restart({ roomId: this.roomId }); return; }

          const picker = document.createElement('div');
          picker.className = 'assign-overlay';
          const fLabel = f.furnitureId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          picker.innerHTML = `
            <button class="panel-close" id="move-furn-close">&times;</button>
            <h2>Move ${fLabel}</h2>
            <div style="color:#8b7355;margin-bottom:12px">Move to another room?</div>
            ${otherRooms.map((r) => {
              const rLabel = r.id === 'sleeping' ? 'Sleeping Quarters' : r.id === 'kitchen' ? 'Kitchen' : 'Operations';
              return `<button class="menu-btn move-furn-btn" data-room="${r.id}">${rLabel}</button>`;
            }).join('')}
            <button class="menu-btn" id="move-furn-cancel" style="margin-top:12px">Cancel</button>
          `;
          document.getElementById('overlay-layer')?.appendChild(picker);
          document.getElementById('move-furn-close')!.addEventListener('click', () => {
            picker.remove();
            this.scene.restart({ roomId: this.roomId });
          });
          document.getElementById('move-furn-cancel')!.addEventListener('click', () => {
            picker.remove();
            this.scene.restart({ roomId: this.roomId });
          });
          picker.querySelectorAll('.move-furn-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              const newRoom = btn.getAttribute('data-room')!;
              f.room = newRoom;
              f.gridX = save.furniture.filter((ff) => ff.room === newRoom).length % 5;
              f.gridY = Math.floor(save.furniture.filter((ff) => ff.room === newRoom).length / 5);
              saveGame(save);
              picker.remove();
              this.scene.restart({ roomId: this.roomId });
            });
          });
        }
      });

      // Name the sprite for drag tracking
      if (this.textures.exists(spriteKey)) {
        const spriteObj = this.children.list.find(
          (c) => c instanceof Phaser.GameObjects.Sprite && (c as Phaser.GameObjects.Sprite).texture.key === spriteKey
        ) as Phaser.GameObjects.Sprite | undefined;
        if (spriteObj) spriteObj.setName(`furn_sprite_${f.furnitureId}_${col}_${row}`);
      }

      if (f.furnitureId === 'lantern' || f.furnitureId === 'candle_stand') {
        const glow = this.add.circle(x, y, 24, 0xdda055, 0.05);
        this.tweens.add({
          targets: glow, alpha: { from: 0.03, to: 0.09 },
          duration: 1500 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
    });
  }

  // ── Cat system ──

  // Furniture cats can walk on (sit on beds, rugs, etc.)
  private static readonly WALKABLE_FURNITURE = new Set([
    'straw_bed', 'woolen_blanket', 'cushioned_basket', 'rug_wool',
  ]);

  private buildOpenTiles(save: SaveData): void {
    const blockedPositions = new Set(
      save.furniture
        .filter((f) => f.room === this.roomId && !RoomScene.WALKABLE_FURNITURE.has(f.furnitureId))
        .map((f) => `${f.gridX % GRID_COLS},${f.gridY % GRID_ROWS}`)
    );
    this.openTiles = [];
    this.openTileSet = new Set();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (!blockedPositions.has(`${col},${row}`)) {
          this.openTiles.push({ col, row });
          this.openTileSet.add(`${col},${row}`);
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
    // Filter: only cats assigned to this room (or auto-distributed) + always include player cat
    // Exclude stationed cats entirely — they're away at their jobs
    const anyAssigned = save.cats.some((c) => c.assignedRoom);
    let roomCats: typeof save.cats;
    if (anyAssigned) {
      roomCats = save.cats.filter((c) =>
        c.assignedRoom === this.roomId || (!c.assignedRoom && this.roomId === 'sleeping') || c.id === 'player_wildcat'
      );
    } else {
      // Auto-distribute across unlocked rooms, but always include player
      const unlockedRoomIds = save.rooms.filter((r) => r.unlocked).map((r) => r.id);
      const roomIndex = unlockedRoomIds.indexOf(this.roomId);
      roomCats = save.cats.filter((c, idx) =>
        c.id === 'player_wildcat' || (roomIndex >= 0 && idx % unlockedRoomIds.length === roomIndex)
      );
    }
    // Remove stationed cats — they are away
    const cats = roomCats.filter((c) => !isCatStationed(save, c.id));
    if (cats.length === 0) return;

    this.buildOpenTiles(save);

    cats.forEach((cat, i) => {
      const startTile = this.pickRandomTile();
      const isPlayer = cat.id === 'player_wildcat';

      if (isPlayer) {
        this.spawnPlayerCat(cat, startTile);
      } else {
        this.spawnWanderingCat(cat, startTile, i);
      }
    });
  }

  private spawnPlayerCat(cat: SaveData['cats'][number], startTile: { col: number; row: number }): void {
    const { x, y } = toWorld(startTile.col, startTile.row);
    const hasSprite = BREEDS_WITH_SPRITES.has(cat.breed);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.2);
    shadow.fillEllipse(0, 0, 24, 8);
    shadow.setPosition(x, y + 12);

    // Player indicator — small golden diamond above the cat
    const indicator = this.add.graphics();
    indicator.fillStyle(0xdda055);
    indicator.fillPoints([
      new Phaser.Geom.Point(0, -4),
      new Phaser.Geom.Point(4, 0),
      new Phaser.Geom.Point(0, 4),
      new Phaser.Geom.Point(-4, 0),
    ], true);
    indicator.setPosition(x, y - 30);

    // Gentle pulse on the indicator
    this.tweens.add({
      targets: indicator,
      scaleX: { from: 1, to: 1.3 },
      scaleY: { from: 1, to: 1.3 },
      alpha: { from: 1, to: 0.6 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    let sprite: Phaser.GameObjects.Sprite | null = null;
    let fallbackGfx: Phaser.GameObjects.Graphics | null = null;

    if (hasSprite) {
      sprite = this.add.sprite(x, y - 4, `${cat.breed}_idle_south`);
      sprite.setScale(1.2);
      sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.playerSprite = sprite;
      this.playerBreed = cat.breed;
    } else {
      const color = parseInt((BREED_COLORS[cat.breed] ?? '#8b7355').replace('#', ''), 16);
      fallbackGfx = this.add.graphics();
      fallbackGfx.setPosition(x, y);
      this.drawFallbackCatGraphics(fallbackGfx, color);
    }

    const nameTag = this.add.text(x, y + 18, `${cat.name} (you)`, {
      fontFamily: 'Georgia, serif',
      fontSize: '8px',
      color: '#dda055',
    }).setOrigin(0.5);

    let currentTile = { ...startTile };
    let isMoving = false;
    const keysHeld = new Set<string>();

    let arriveCallback: (() => void) | null = null;

    const moveToTile = (targetCol: number, targetRow: number, onArrive?: () => void) => {
      if (isMoving) return;
      if (targetCol < 0 || targetCol >= GRID_COLS || targetRow < 0 || targetRow >= GRID_ROWS) return;
      if (!this.openTileSet.has(`${targetCol},${targetRow}`)) return;
      if (targetCol === currentTile.col && targetRow === currentTile.row) {
        onArrive?.();
        return;
      }

      isMoving = true;
      if (onArrive) arriveCallback = onArrive;
      const walkDir = this.getWalkDirection(currentTile.col, currentTile.row, targetCol, targetRow);
      const dest = toWorld(targetCol, targetRow);
      const distance = Math.abs(targetCol - currentTile.col) + Math.abs(targetRow - currentTile.row);
      const duration = distance * 250;

      if (sprite) {
        const walkKey = `${cat.breed}_walk_${walkDir}`;
        if (this.anims.exists(walkKey) && sprite.anims.currentAnim?.key !== walkKey) {
          sprite.play(walkKey);
        }
        this.tweens.add({ targets: sprite, x: dest.x, y: dest.y - 4, duration, ease: 'Linear' });
      }
      if (fallbackGfx) {
        this.tweens.add({ targets: fallbackGfx, x: dest.x, y: dest.y, duration, ease: 'Linear' });
      }
      this.tweens.add({ targets: shadow, x: dest.x, y: dest.y + 12, duration, ease: 'Linear' });
      this.tweens.add({ targets: indicator, x: dest.x, y: dest.y - 30, duration, ease: 'Linear' });
      this.tweens.add({
        targets: nameTag, x: dest.x, y: dest.y + 18, duration, ease: 'Linear',
        onComplete: () => {
          currentTile = { col: targetCol, row: targetRow };
          isMoving = false;
          // Only go idle if no direction keys are held (prevents flicker during continuous movement)
          if (sprite && keysHeld.size === 0) {
            sprite.setTexture(`${cat.breed}_idle_${walkDir}`);
            sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
            sprite.stop();
          }
          if (arriveCallback) {
            arriveCallback();
            arriveCallback = null;
          }
        },
      });
    };

    // Random meow/chirp sounds for wildcat
    if (cat.breed === 'wildcat') {
      this.time.addEvent({
        delay: 8000 + Math.random() * 15000,
        callback: () => {
          if (!isMoving && Math.random() < 0.3) {
            const sound = Math.random() < 0.5 ? 'wildcat_meow' : 'wildcat_chirp';
            if (this.cache.audio.exists(sound)) {
              this.sound.play(sound, { volume: 0.4 });
            }
          }
        },
        loop: true,
      });
    }

    // Expose movement for furniture interactions
    this.playerMoveTo = moveToTile;

    // Tap floor to move player cat
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const grid = worldToGrid(pointer.worldX, pointer.worldY);
      moveToTile(grid.col, grid.row);
    });

    // WASD / Arrow key movement (supports diagonal + continuous hold)
    let moveRepeat: ReturnType<typeof setInterval> | null = null;

    const processMovement = () => {
      let dc = 0;
      let dr = 0;
      if (keysHeld.has('right')) dc += 1;
      if (keysHeld.has('left')) dc -= 1;
      if (keysHeld.has('down')) dr += 1;
      if (keysHeld.has('up')) dr -= 1;
      if (dc !== 0 || dr !== 0) {
        moveToTile(currentTile.col + dc, currentTile.row + dr);
      }
    };

    const startRepeat = () => {
      if (moveRepeat) return;
      processMovement();
      moveRepeat = setInterval(() => {
        if (keysHeld.size === 0) {
          clearInterval(moveRepeat!);
          moveRepeat = null;
          return;
        }
        processMovement();
      }, 280);
    };

    const stopRepeat = () => {
      if (keysHeld.size === 0 && moveRepeat) {
        clearInterval(moveRepeat);
        moveRepeat = null;
      }
      // Go idle when all keys released and not moving
      if (keysHeld.size === 0 && !isMoving && sprite) {
        sprite.stop();
        const currentAnim = sprite.anims.currentAnim?.key ?? '';
        const dir = currentAnim.split('_').pop() ?? 'south';
        sprite.setTexture(`${cat.breed}_idle_${dir}`);
        sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    };

    const keyToDir = (key: string): string | null => {
      if (key === 'ArrowRight' || key === 'd' || key === 'D') return 'right';
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') return 'left';
      if (key === 'ArrowDown' || key === 's' || key === 'S') return 'down';
      if (key === 'ArrowUp' || key === 'w' || key === 'W') return 'up';
      return null;
    };

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const dir = keyToDir(event.key);
      if (dir) {
        keysHeld.add(dir);
        startRepeat();
      }
    });

    this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      const dir = keyToDir(event.key);
      if (dir) {
        keysHeld.delete(dir);
        stopRepeat();
      }
    });
  }

  private spawnWanderingCat(cat: SaveData['cats'][number], startTile: { col: number; row: number }, index: number): void {
    const { x, y } = toWorld(startTile.col, startTile.row);
    const hasSprite = BREEDS_WITH_SPRITES.has(cat.breed);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.2);
    shadow.fillEllipse(0, 0, 24, 8);
    shadow.setPosition(x, y + 12);

    let sprite: Phaser.GameObjects.Sprite | null = null;
    let fallbackGfx: Phaser.GameObjects.Graphics | null = null;

    if (hasSprite) {
      sprite = this.add.sprite(x, y - 4, `${cat.breed}_idle_south`);
      sprite.setScale(1.2);
      sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    } else {
      const color = parseInt((BREED_COLORS[cat.breed] ?? '#8b7355').replace('#', ''), 16);
      fallbackGfx = this.add.graphics();
      fallbackGfx.setPosition(x, y);
      this.drawFallbackCatGraphics(fallbackGfx, color);
    }

    const nameTag = this.add.text(x, y + 18, cat.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '8px',
      color: '#c4956a',
    }).setOrigin(0.5);

    let currentTile = { ...startTile };

    // Clickable hitbox — click to interact with this cat
    const hitBox = this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hitBox.on('pointerdown', () => {
      if (!this.playerMoveTo) return;
      // Find adjacent open tile to this cat
      const neighbors = [
        { col: currentTile.col - 1, row: currentTile.row },
        { col: currentTile.col + 1, row: currentTile.row },
        { col: currentTile.col, row: currentTile.row - 1 },
        { col: currentTile.col, row: currentTile.row + 1 },
      ].filter((t) => this.openTileSet.has(`${t.col},${t.row}`));
      const target = neighbors[0];
      if (!target) return;

      this.playerMoveTo(target.col, target.row, () => {
        // Play purr sound
        if (this.cache.audio.exists('sfx_purr')) {
          this.sound.play('sfx_purr', { volume: 0.4 });
        }
        // Show heart above both cats
        const catWorld = toWorld(currentTile.col, currentTile.row);
        const heart = this.add.text(catWorld.x, catWorld.y - 30, '\u2764', {
          fontSize: '16px',
        }).setOrigin(0.5);
        this.tweens.add({
          targets: heart, y: heart.y - 20, alpha: 0, duration: 1200,
          onComplete: () => heart.destroy(),
        });
        // Bond points + toast
        const save = getGameState();
        if (save) {
          const playerCat = save.cats.find((c) => c.id === 'player_wildcat');
          if (playerCat) {
            addBondPoints(save, playerCat.breed, cat.breed, 1);
            saveGame(save);
          }
        }
        const actionText = document.createElement('div');
        actionText.className = 'toast';
        actionText.textContent = `${cat.name} and your wildcat share a moment.`;
        document.getElementById('overlay-layer')?.appendChild(actionText);
        setTimeout(() => actionText.remove(), 2500);
      });
    });

    const wanderToNext = () => {
      const idleTime = 2000 + Math.random() * 3000;

      if (sprite) {
        const dir = ['south', 'east', 'west', 'north'][Math.floor(Math.random() * 4)];
        sprite.setTexture(`${cat.breed}_idle_${dir}`);
        sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        sprite.stop();
      }

      this.time.delayedCall(idleTime, () => {
        const nextTile = this.pickRandomTile(currentTile);
        const walkDir = this.getWalkDirection(currentTile.col, currentTile.row, nextTile.col, nextTile.row);
        const dest = toWorld(nextTile.col, nextTile.row);
        const duration = 800 + Math.random() * 600;

        if (sprite) {
          const walkKey = `${cat.breed}_walk_${walkDir}`;
          if (this.anims.exists(walkKey)) {
            sprite.play(walkKey);
          }
          this.tweens.add({ targets: sprite, x: dest.x, y: dest.y - 4, duration, ease: 'Linear' });
        }
        if (fallbackGfx) {
          this.tweens.add({ targets: fallbackGfx, x: dest.x, y: dest.y, duration, ease: 'Linear' });
        }
        this.tweens.add({ targets: shadow, x: dest.x, y: dest.y + 12, duration, ease: 'Linear' });
        this.tweens.add({ targets: hitBox, x: dest.x, y: dest.y, duration, ease: 'Linear' });
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

    gfx.fillTriangle(-6, -13, -3, -20, 0, -13);
    gfx.fillTriangle(6, -13, 3, -20, 0, -13);

    gfx.fillStyle(0xddcc88);
    gfx.fillCircle(-3, -11, 1.5);
    gfx.fillCircle(3, -11, 1.5);
    gfx.fillStyle(0x111111);
    gfx.fillCircle(-3, -11, 0.7);
    gfx.fillCircle(3, -11, 0.7);
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
