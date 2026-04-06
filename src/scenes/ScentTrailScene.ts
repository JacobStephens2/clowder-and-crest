import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { createDpad, showMinigameTutorial } from '../ui/sceneHelpers';

const TILE = 38;
const GRID_TOP = 100;

export class ScentTrailScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private difficulty = 'easy';
  private gridSize = 7;
  private grid: number[][] = []; // -1=wall, 0-3=scent strength (hidden until revealed)
  private revealed: boolean[][] = [];
  private targetR = 1;
  private targetC = 5;
  private catPos = { r: 5, c: 1 };
  private movesLeft = 25;
  private finished = false;
  private tutorialShowing = false;
  private catSprite: Phaser.GameObjects.Sprite | null = null;
  private movesText!: Phaser.GameObjects.Text;
  private tileSprites: Phaser.GameObjects.Rectangle[][] = [];
  private scentTexts: Phaser.GameObjects.Text[][] = [];
  private gridLeft = 0;

  constructor() { super({ key: 'ScentTrailScene' }); }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    this.finished = false;
    this.tileSprites = [];
    this.scentTexts = [];
    this.gridSize = this.difficulty === 'hard' ? 9 : this.difficulty === 'medium' ? 8 : 7;
    this.movesLeft = this.difficulty === 'hard' ? 16 : this.difficulty === 'medium' ? 20 : 25;
    this.gridLeft = Math.floor((GAME_WIDTH - this.gridSize * TILE) / 2);

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const intelligence = cat?.stats?.intelligence ?? 5;
    this.movesLeft += Math.floor(intelligence / 3);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    if (showMinigameTutorial(this, 'clowder_scent_tutorial', 'Scent Trail',
      `Follow the scent to find the hidden target.<br><br>
      Numbers show how close you are (3 = very close, 0 = far).<br><br>
      You have limited moves — choose your path wisely!`,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Scent Trail'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.movesText = this.add.text(GAME_WIDTH / 2, 55, `Moves: ${this.movesLeft}`, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH - 30, 55, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    this.generateLevel();
    this.drawGrid();
    this.spawnCat();

    // Reveal starting tile and adjacent tiles
    this.revealTile(this.catPos.r, this.catPos.c);
    this.revealTile(this.catPos.r - 1, this.catPos.c);
    this.revealTile(this.catPos.r, this.catPos.c + 1);
    this.revealTile(this.catPos.r, this.catPos.c - 1);

    // General direction hint
    const dirHint = this.targetC > this.catPos.c ? 'east' : this.targetC < this.catPos.c ? 'west' : '';
    const vertHint = this.targetR < this.catPos.r ? 'north' : 'south';
    this.add.text(GAME_WIDTH / 2, 75, `The scent drifts ${vertHint}${dirHint ? '-' + dirHint : ''}...`, {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e', fontStyle: 'italic',
    }).setOrigin(0.5);

    // Controls
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown', (e: KeyboardEvent) => {
        if (this.finished || this.tutorialShowing) return;
        switch (e.key) {
          case 'ArrowUp': case 'w': case 'W': this.moveCat(0, -1); break;
          case 'ArrowDown': case 's': case 'S': this.moveCat(0, 1); break;
          case 'ArrowLeft': case 'a': case 'A': this.moveCat(-1, 0); break;
          case 'ArrowRight': case 'd': case 'D': this.moveCat(1, 0); break;
        }
      });
    }

    createDpad(this, {
      x: GAME_WIDTH / 2, y: GRID_TOP + this.gridSize * TILE + 50,
      size: 34,
      onDirection: (dx, dy) => { if (!this.finished && !this.tutorialShowing) this.moveCat(dx, dy); },
      holdRepeat: false,
    });

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  private generateLevel(): void {
    // Place target
    this.targetR = 1 + Math.floor(Math.random() * (this.gridSize - 2));
    this.targetC = Math.floor(this.gridSize / 2) + Math.floor(Math.random() * (this.gridSize / 2));
    // Place cat start
    this.catPos = { r: this.gridSize - 2, c: 1 + Math.floor(Math.random() * 2) };

    // Build scent grid based on Manhattan distance from target
    this.grid = [];
    this.revealed = [];
    const maxDist = this.gridSize * 2;
    const wallCount = this.difficulty === 'hard' ? 10 : this.difficulty === 'medium' ? 7 : 4;

    for (let r = 0; r < this.gridSize; r++) {
      const row: number[] = [];
      const revRow: boolean[] = [];
      for (let c = 0; c < this.gridSize; c++) {
        const dist = Math.abs(r - this.targetR) + Math.abs(c - this.targetC);
        // Map distance to scent: 0 (far) to 3 (close)
        const scent = Math.max(0, Math.min(3, 3 - Math.floor(dist * 3 / maxDist)));
        row.push(scent);
        revRow.push(false);
      }
      this.grid.push(row);
      this.revealed.push(revRow);
    }

    // Add walls
    for (let i = 0; i < wallCount; i++) {
      const wr = 1 + Math.floor(Math.random() * (this.gridSize - 2));
      const wc = 1 + Math.floor(Math.random() * (this.gridSize - 2));
      if (!(wr === this.targetR && wc === this.targetC) &&
          !(wr === this.catPos.r && wc === this.catPos.c)) {
        this.grid[wr][wc] = -1;
      }
    }

    // Target tile gets scent 3
    this.grid[this.targetR][this.targetC] = 3;
  }

  private drawGrid(): void {
    for (let r = 0; r < this.gridSize; r++) {
      const row: Phaser.GameObjects.Rectangle[] = [];
      const textRow: Phaser.GameObjects.Text[] = [];
      for (let c = 0; c < this.gridSize; c++) {
        const x = this.gridLeft + c * TILE + TILE / 2;
        const y = GRID_TOP + r * TILE + TILE / 2;

        if (this.grid[r][c] === -1) {
          // Wall
          this.add.rectangle(x, y, TILE - 1, TILE - 1, 0x3a3530).setStrokeStyle(1, 0x2a2520);
          row.push(null as any);
          textRow.push(null as any);
        } else {
          // Fog tile with subtle variation
          const fogShade = 0x1a1a2a + ((r * 3 + c * 7) % 8) * 0x010101;
          const tile = this.add.rectangle(x, y, TILE - 1, TILE - 1, fogShade);
          tile.setStrokeStyle(1, 0x2a2a3a, 0.3);
          // Fog particle hint
          if (Math.random() < 0.15) {
            const mist = this.add.ellipse(x + Math.random() * 10 - 5, y, 12, 4, 0x3a3a4a, 0.15);
            this.tweens.add({ targets: mist, alpha: 0.05, duration: 2000, yoyo: true, repeat: -1 });
          }
          row.push(tile);

          const scentText = this.add.text(x, y, '', {
            fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
          }).setOrigin(0.5).setAlpha(0);
          textRow.push(scentText);
        }
      }
      this.tileSprites.push(row);
      this.scentTexts.push(textRow);
    }
  }

  private revealTile(r: number, c: number): void {
    if (r < 0 || r >= this.gridSize || c < 0 || c >= this.gridSize) return;
    if (this.grid[r][c] === -1 || this.revealed[r][c]) return;

    this.revealed[r][c] = true;
    const tile = this.tileSprites[r][c];
    const text = this.scentTexts[r][c];
    if (!tile || !text) return;

    const scent = this.grid[r][c];
    const colors = [0x1a1a2a, 0x2a2a1a, 0x3a3a1a, 0x4a3a1a];
    tile.setFillStyle(colors[scent]);

    // Show pawprints based on scent strength
    const pawprints = '\u{1F43E}'.repeat(scent);
    text.setText(scent > 0 ? pawprints : '\u00B7');
    text.setAlpha(1);
    text.setFontSize(scent === 0 ? '10px' : scent === 1 ? '10px' : scent === 2 ? '12px' : '14px');
  }

  private spawnCat(): void {
    const x = this.gridLeft + this.catPos.c * TILE + TILE / 2;
    const y = GRID_TOP + this.catPos.r * TILE + TILE / 2;
    const state = getGameState();
    const breed = state?.cats.find(c => c.id === this.catId)?.breed ?? 'wildcat';
    const idleKey = `${breed}_idle_south`;
    if (this.textures.exists(idleKey)) {
      this.catSprite = this.add.sprite(x, y, idleKey);
      this.catSprite.setScale(0.65);
      this.catSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.catSprite.setDepth(5);
    }
  }

  private moveCat(dx: number, dy: number): void {
    if (this.finished) return;
    const nc = this.catPos.c + dx;
    const nr = this.catPos.r + dy;
    if (nc < 0 || nc >= this.gridSize || nr < 0 || nr >= this.gridSize) return;
    if (this.grid[nr][nc] === -1) return;

    this.catPos = { r: nr, c: nc };
    this.movesLeft--;
    this.movesText.setText(`Moves: ${this.movesLeft}`);
    playSfx('sniff', 0.25);

    const dest = { x: this.gridLeft + nc * TILE + TILE / 2, y: GRID_TOP + nr * TILE + TILE / 2 };
    if (this.catSprite) {
      this.tweens.add({ targets: this.catSprite, x: dest.x, y: dest.y, duration: 150, ease: 'Linear' });
    }

    this.revealTile(nr, nc);

    // Check win
    if (nr === this.targetR && nc === this.targetC) {
      this.finished = true;
      playSfx('victory');
      const stars = this.movesLeft > 10 ? 3 : this.movesLeft > 5 ? 2 : 1;
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, 'Target Found!', {
        fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
      }).setOrigin(0.5);
      // Reveal target
      this.add.text(dest.x, dest.y - 20, '\u{1F3AF}', { fontSize: '20px' }).setOrigin(0.5).setDepth(10);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `scent_${this.difficulty}`, moves: 25 - this.movesLeft, minMoves: 8, stars,
          jobId: this.jobId, catId: this.catId,
        });
      });
      return;
    }

    // Check loss
    if (this.movesLeft <= 0) {
      this.finished = true;
      playSfx('fail');
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, 'Out of moves!', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
