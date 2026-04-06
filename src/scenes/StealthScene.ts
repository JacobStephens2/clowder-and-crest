import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { createDpad, showMinigameTutorial } from '../ui/sceneHelpers';

// ── Layout ──
const GRID_COLS = 9;
const GRID_ROWS = 9;
const TILE = 40;
const GRID_W = GRID_COLS * TILE;
const GRID_H = GRID_ROWS * TILE;
const GRID_LEFT = Math.floor((GAME_WIDTH - GRID_W) / 2);
const GRID_TOP = 90;

// Tile types
const FLOOR = 0;
const WALL = 1;
const GRASS = 2; // hides the cat from guards

// Guard vision range
const VISION_RANGE = 3;

interface Guard {
  r: number;
  c: number;
  dir: number; // 0=north, 1=east, 2=south, 3=west
  gfx: Phaser.GameObjects.Graphics;
  sprite?: Phaser.GameObjects.Sprite;
  visionGfx: Phaser.GameObjects.Graphics;
  patrolPath: { r: number; c: number }[];
  patrolIdx: number;
}

export class StealthScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';
  private grid: number[][] = [];
  private catPos = { r: 7, c: 1 };
  private targetPos = { r: 1, c: 7 };
  private catSprite: Phaser.GameObjects.Sprite | null = null;
  private guards: Guard[] = [];
  private isMoving = false;
  private caught = false;
  private succeeded = false;
  private moveCount = 0;
  private inGrass = false;
  private tutorialShowing = false;

  constructor() {
    super({ key: 'StealthScene' });
  }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.catBreed = data?.catBreed ?? 'wildcat';
    this.difficulty = data?.difficulty ?? 'easy';
    this.caught = false;
    this.succeeded = false;
    this.moveCount = 0;
    this.isMoving = false;
    this.guards = [];
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    this.input.addPointer(1);

    if (showMinigameTutorial(this, 'clowder_stealth_tutorial', 'Stealth',
      `Sneak past the guards to reach the target.<br><br>
      Stay in the <strong style="color:#3a5a3a">tall grass</strong> to hide.<br><br>
      Guards can see <strong>${VISION_RANGE} tiles</strong> ahead. Don't enter their vision!`,
      () => { this.tutorialShowing = false; }
    )) {
      this.tutorialShowing = true;
    }

    // Job name
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Stealth'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 52, 'Reach the target without being seen', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // Generate level
    this.generateLevel();
    this.drawGrid();
    this.spawnGuards();
    this.spawnCat();
    this.drawTarget();

    // Controls
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown', (e: KeyboardEvent) => {
        if (this.caught || this.succeeded || this.tutorialShowing) return;
        switch (e.key) {
          case 'ArrowUp': case 'w': case 'W': this.moveCat(0, -1); break;
          case 'ArrowDown': case 's': case 'S': this.moveCat(0, 1); break;
          case 'ArrowLeft': case 'a': case 'A': this.moveCat(-1, 0); break;
          case 'ArrowRight': case 'd': case 'D': this.moveCat(1, 0); break;
        }
      });
    }

    createDpad(this, {
      x: GAME_WIDTH / 2,
      y: GRID_TOP + GRID_H + 50,
      size: 36,
      onDirection: (dx, dy) => {
        if (!this.caught && !this.succeeded && !this.tutorialShowing) this.moveCat(dx, dy);
      },
      holdRepeat: true,
      repeatInterval: 250,
    });

    // Quit
    this.add.text(GAME_WIDTH - 30, GRID_TOP + GRID_H + 50, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Guard patrol timer
    const patrolSpeed = this.difficulty === 'hard' ? 800 : this.difficulty === 'medium' ? 1000 : 1200;
    this.time.addEvent({
      delay: patrolSpeed,
      callback: () => this.moveGuards(),
      loop: true,
    });

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.input.keyboard?.removeAllListeners();
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  private generateLevel(): void {
    // Start with all floor
    this.grid = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(FLOOR));

    // Add walls
    const wallCount = this.difficulty === 'hard' ? 8 : this.difficulty === 'medium' ? 10 : 12;
    for (let i = 0; i < wallCount; i++) {
      const r = 1 + Math.floor(Math.random() * (GRID_ROWS - 2));
      const c = 1 + Math.floor(Math.random() * (GRID_COLS - 2));
      if (!(r === this.catPos.r && c === this.catPos.c) && !(r === this.targetPos.r && c === this.targetPos.c)) {
        this.grid[r][c] = WALL;
      }
    }

    // Add grass patches (hiding spots)
    const grassCount = this.difficulty === 'hard' ? 6 : this.difficulty === 'medium' ? 8 : 10;
    for (let i = 0; i < grassCount; i++) {
      const r = 1 + Math.floor(Math.random() * (GRID_ROWS - 2));
      const c = 1 + Math.floor(Math.random() * (GRID_COLS - 2));
      if (this.grid[r][c] === FLOOR) {
        this.grid[r][c] = GRASS;
      }
    }

    // Ensure start and target are floor
    this.grid[this.catPos.r][this.catPos.c] = FLOOR;
    this.grid[this.targetPos.r][this.targetPos.c] = FLOOR;
  }

  private drawGrid(): void {
    const gfx = this.add.graphics();
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const x = GRID_LEFT + c * TILE;
        const y = GRID_TOP + r * TILE;
        const tile = this.grid[r][c];

        if (tile === WALL) {
          gfx.fillStyle(0x3a3530);
          gfx.fillRect(x, y, TILE, TILE);
          gfx.lineStyle(1, 0x2a2520);
          gfx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        } else if (tile === GRASS) {
          gfx.fillStyle(0x1e2a1e);
          gfx.fillRect(x, y, TILE, TILE);
          // Grass tufts
          gfx.fillStyle(0x2a4a2a, 0.6);
          for (let t = 0; t < 4; t++) {
            gfx.fillCircle(x + 8 + Math.random() * 24, y + 8 + Math.random() * 24, 3);
          }
        } else {
          const shade = (c + r) % 2 === 0 ? 0x222018 : 0x26241c;
          gfx.fillStyle(shade);
          gfx.fillRect(x, y, TILE, TILE);
        }
      }
    }
  }

  private spawnGuards(): void {
    const count = this.difficulty === 'hard' ? 4 : this.difficulty === 'medium' ? 3 : 2;

    for (let i = 0; i < count; i++) {
      // Place guard on floor, away from cat and target
      let gr: number, gc: number;
      do {
        gr = 1 + Math.floor(Math.random() * (GRID_ROWS - 2));
        gc = 1 + Math.floor(Math.random() * (GRID_COLS - 2));
      } while (
        this.grid[gr][gc] !== FLOOR ||
        (Math.abs(gr - this.catPos.r) + Math.abs(gc - this.catPos.c) < 3) ||
        (Math.abs(gr - this.targetPos.r) + Math.abs(gc - this.targetPos.c) < 2)
      );

      // Random patrol path (2-4 waypoints)
      const path: { r: number; c: number }[] = [{ r: gr, c: gc }];
      for (let p = 0; p < 2; p++) {
        const pr = Phaser.Math.Clamp(gr + Math.floor(Math.random() * 5) - 2, 1, GRID_ROWS - 2);
        const pc = Phaser.Math.Clamp(gc + Math.floor(Math.random() * 5) - 2, 1, GRID_COLS - 2);
        if (this.grid[pr][pc] === FLOOR || this.grid[pr][pc] === GRASS) {
          path.push({ r: pr, c: pc });
        }
      }

      const gfx = this.add.graphics();
      const visionGfx = this.add.graphics();

      // Guard sprite if available
      let guardSprite: Phaser.GameObjects.Sprite | undefined;
      const { x: gx, y: gy } = this.toWorld(gc, gr);
      if (this.textures.exists('guard')) {
        guardSprite = this.add.sprite(gx, gy, 'guard');
        guardSprite.setScale(0.9);
        guardSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }

      const guard: Guard = {
        r: gr, c: gc, dir: Math.floor(Math.random() * 4),
        gfx, sprite: guardSprite, visionGfx, patrolPath: path, patrolIdx: 0,
      };
      this.guards.push(guard);
      this.drawGuard(guard);
    }
  }

  private drawGuard(guard: Guard): void {
    const x = GRID_LEFT + guard.c * TILE + TILE / 2;
    const y = GRID_TOP + guard.r * TILE + TILE / 2;

    // Position guard sprite or draw fallback
    if (guard.sprite) {
      guard.sprite.setPosition(x, y);
    } else {
      guard.gfx.clear();
      guard.gfx.fillStyle(0xcc6666);
      guard.gfx.fillCircle(x, y, 8);
    }
    const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
    const d = dirs[guard.dir];

    // Vision cone
    guard.visionGfx.clear();
    guard.visionGfx.fillStyle(0xcc4444, 0.12);
    for (let i = 1; i <= VISION_RANGE; i++) {
      const vr = guard.r + d.dy * i;
      const vc = guard.c + d.dx * i;
      if (vr < 0 || vr >= GRID_ROWS || vc < 0 || vc >= GRID_COLS) break;
      if (this.grid[vr][vc] === WALL) break;
      const vx = GRID_LEFT + vc * TILE;
      const vy = GRID_TOP + vr * TILE;
      guard.visionGfx.fillRect(vx, vy, TILE, TILE);
    }
  }

  private spawnCat(): void {
    const { x, y } = this.toWorld(this.catPos.c, this.catPos.r);
    const idleKey = `${this.catBreed}_idle_south`;
    if (this.textures.exists(idleKey)) {
      this.catSprite = this.add.sprite(x, y, idleKey);
      this.catSprite.setScale(0.7);
      this.catSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  private drawTarget(): void {
    const { x, y } = this.toWorld(this.targetPos.c, this.targetPos.r);
    const target = this.add.circle(x, y, 8, 0xdda055, 0.6);
    this.tweens.add({ targets: target, scaleX: 1.3, scaleY: 1.3, duration: 600, yoyo: true, repeat: -1 });
    this.add.text(x, y - 16, '\u{1F3AF}', { fontSize: '14px' }).setOrigin(0.5);
  }

  private toWorld(c: number, r: number): { x: number; y: number } {
    return { x: GRID_LEFT + c * TILE + TILE / 2, y: GRID_TOP + r * TILE + TILE / 2 };
  }

  private moveCat(dx: number, dy: number): void {
    if (this.isMoving || this.caught || this.succeeded) return;
    const nc = this.catPos.c + dx;
    const nr = this.catPos.r + dy;
    if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) return;
    if (this.grid[nr][nc] === WALL) return;

    this.isMoving = true;
    this.catPos = { r: nr, c: nc };
    this.moveCount++;
    const wasInGrass = this.inGrass;
    this.inGrass = this.grid[nr][nc] === GRASS;
    // Sound feedback
    if (this.inGrass && !wasInGrass) playSfx('purr', 0.2);
    playSfx('tap', 0.15);

    const dest = this.toWorld(nc, nr);
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');

    if (this.catSprite) {
      const walkKey = `${this.catBreed}_walk_${dir}`;
      if (this.anims.exists(walkKey) && this.catSprite.anims.currentAnim?.key !== walkKey) {
        this.catSprite.play(walkKey);
      }
      // Dim when in grass (hidden)
      this.catSprite.setAlpha(this.inGrass ? 0.5 : 1);

      this.tweens.add({
        targets: this.catSprite, x: dest.x, y: dest.y, duration: 180, ease: 'Linear',
        onComplete: () => {
          this.isMoving = false;
          if (this.catSprite) {
            const idleKey = `${this.catBreed}_idle_${dir}`;
            if (this.textures.exists(idleKey)) { this.catSprite.stop(); this.catSprite.setTexture(idleKey); }
          }
          this.checkDetection();
          this.checkWin();
        },
      });
    } else {
      this.isMoving = false;
      this.checkDetection();
      this.checkWin();
    }
  }

  private moveGuards(): void {
    if (this.caught || this.succeeded || this.tutorialShowing) return;

    for (const guard of this.guards) {
      // Move toward next patrol waypoint
      const target = guard.patrolPath[guard.patrolIdx];
      const dr = target.r - guard.r;
      const dc = target.c - guard.c;

      if (dr === 0 && dc === 0) {
        guard.patrolIdx = (guard.patrolIdx + 1) % guard.patrolPath.length;
        // Turn to face next waypoint
        const next = guard.patrolPath[guard.patrolIdx];
        const ndr = next.r - guard.r;
        const ndc = next.c - guard.c;
        if (Math.abs(ndr) >= Math.abs(ndc)) {
          guard.dir = ndr > 0 ? 2 : 0;
        } else {
          guard.dir = ndc > 0 ? 1 : 3;
        }
      } else {
        // Step one tile toward target
        let mr = 0, mc = 0;
        if (Math.abs(dr) >= Math.abs(dc)) {
          mr = dr > 0 ? 1 : -1;
          guard.dir = mr > 0 ? 2 : 0;
        } else {
          mc = dc > 0 ? 1 : -1;
          guard.dir = mc > 0 ? 1 : 3;
        }
        const nr = guard.r + mr;
        const nc = guard.c + mc;
        if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS && this.grid[nr][nc] !== WALL) {
          guard.r = nr;
          guard.c = nc;
        }
      }

      this.drawGuard(guard);
    }

    this.checkDetection();
  }

  private checkDetection(): void {
    if (this.caught || this.inGrass) return; // Hidden in grass — safe

    const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

    for (const guard of this.guards) {
      const d = dirs[guard.dir];
      for (let i = 1; i <= VISION_RANGE; i++) {
        const vr = guard.r + d.dy * i;
        const vc = guard.c + d.dx * i;
        if (vr < 0 || vr >= GRID_ROWS || vc < 0 || vc >= GRID_COLS) break;
        if (this.grid[vr][vc] === WALL) break;
        if (vr === this.catPos.r && vc === this.catPos.c) {
          this.onCaught();
          return;
        }
      }
      // Also caught if standing on guard
      if (guard.r === this.catPos.r && guard.c === this.catPos.c) {
        this.onCaught();
        return;
      }
    }
  }

  private onCaught(): void {
    this.caught = true;
    playSfx('hiss');
    this.cameras.main.flash(200, 139, 69, 19);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Spotted!', {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#cc6666',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });
  }

  private checkWin(): void {
    if (this.catPos.r === this.targetPos.r && this.catPos.c === this.targetPos.c) {
      this.succeeded = true;
      playSfx('victory');

      const stars = this.moveCount <= 15 ? 3 : this.moveCount <= 25 ? 2 : 1;

      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Target Reached!', {
        fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
      }).setOrigin(0.5);

      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `stealth_${this.difficulty}`,
          moves: this.moveCount,
          minMoves: 12,
          stars,
          jobId: this.jobId,
          catId: this.catId,
        });
      });
    }
  }
}
