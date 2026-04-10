import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { isPracticeRun } from '../systems/PracticeMode';
import { createDpad, showMinigameTutorial, attachStandardCleanup } from '../ui/sceneHelpers';

const TILE = 38;
const GRID_TOP = 100;
const WALL = -1;

export class ScentTrailScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private difficulty = 'easy';
  gridSize = 7;
  /** Per-cell Manhattan distance from target. -1 = wall. Hidden until
      a tile is revealed (either by walking onto it or via a remote
      probe). The grid stores the exact distance, not a 0-3 bucket —
      the doc's #2 pillar: numeric feedback enables geometric inference. */
  grid: number[][] = [];
  revealed: boolean[][] = [];
  targetR = 1;
  targetC = 5;
  catPos = { r: 5, c: 1 };
  movesLeft = 25;
  /** Mastermind-style remote probes. Limited supply per round. Each
      probe reveals the Manhattan distance of any chosen tile without
      moving the cat. Forces the player to spend probes wisely rather
      than spiral outward. */
  probesLeft = 4;
  finished = false;
  private tutorialShowing = false;
  private catSprite: Phaser.GameObjects.Sprite | null = null;
  private movesText!: Phaser.GameObjects.Text;
  private probesText!: Phaser.GameObjects.Text;
  private tileSprites: Phaser.GameObjects.Rectangle[][] = [];
  private scentTexts: Phaser.GameObjects.Text[][] = [];
  private gridLeft = 0;
  /** Outline highlights for the constraint ring overlay. Cleared and
      redrawn every time the player taps a revealed tile to inspect it. */
  private constraintRingGfx: Phaser.GameObjects.Rectangle[] = [];

  constructor() { super({ key: 'ScentTrailScene' }); }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    this.finished = false;
    this.tileSprites = [];
    this.scentTexts = [];
    this.constraintRingGfx = [];
    this.gridSize = this.difficulty === 'hard' ? 9 : this.difficulty === 'medium' ? 8 : 7;
    this.movesLeft = this.difficulty === 'hard' ? 16 : this.difficulty === 'medium' ? 20 : 25;
    this.probesLeft = this.difficulty === 'hard' ? 5 : this.difficulty === 'medium' ? 4 : 3;
    this.gridLeft = Math.floor((GAME_WIDTH - this.gridSize * TILE) / 2);

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const intelligence = cat?.stats?.intelligence ?? 5;
    this.movesLeft += Math.floor(intelligence / 3);
    // Intelligence 7+ also grants an extra remote probe — high-int cats
    // think more analytically.
    if (intelligence >= 7) this.probesLeft++;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial bumped to v2 — numeric distances, remote probes, and the
    // constraint ring overlay are all new mechanics.
    if (showMinigameTutorial(this, 'clowder_scent_tutorial_v2', 'Scent Trail',
      `Find the hidden target by deduction.<br><br>
      Numbers on revealed tiles show the <strong>exact distance</strong> to the target.<br><br>
      Tap an unrevealed tile to spend a <strong style="color:#88dd88">remote probe</strong> — sense it without moving.<br><br>
      Tap a revealed tile to see its <strong style="color:#c4956a">constraint ring</strong> — every cell at that distance.`,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Scent Trail'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
    }).setOrigin(0.5);

    this.movesText = this.add.text(20, 55, `Moves: ${this.movesLeft}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#c4956a',
    });
    this.probesText = this.add.text(GAME_WIDTH / 2, 55, `Probes: ${this.probesLeft}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#88dd88',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH - 20, 55, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      if (!isPracticeRun()) eventBus.emit('navigate', 'TownMapScene');
    });

    this.generateLevel();
    this.drawGrid();
    this.spawnCat();

    // Reveal starting tile and adjacent tiles
    this.revealTile(this.catPos.r, this.catPos.c);
    this.revealTile(this.catPos.r - 1, this.catPos.c);
    this.revealTile(this.catPos.r, this.catPos.c + 1);
    this.revealTile(this.catPos.r, this.catPos.c - 1);

    // No auto-direction hint — the doc's player-agency principle: don't
    // pre-solve the puzzle for the player. They infer direction from the
    // numeric distances and constraint rings, not from a flavor line.

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

    attachStandardCleanup(this);

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  private generateLevel(): void {
    // Place target
    this.targetR = 1 + Math.floor(Math.random() * (this.gridSize - 2));
    this.targetC = Math.floor(this.gridSize / 2) + Math.floor(Math.random() * (this.gridSize / 2));
    // Place cat start
    this.catPos = { r: this.gridSize - 2, c: 1 + Math.floor(Math.random() * 2) };

    // Build the grid: each cell stores its EXACT Manhattan distance from
    // the target (not a 0-3 bucket). Numeric distances let the player
    // construct precise geometric constraints — the doc's #2 pillar.
    this.grid = [];
    this.revealed = [];
    const wallCount = this.difficulty === 'hard' ? 10 : this.difficulty === 'medium' ? 7 : 4;

    for (let r = 0; r < this.gridSize; r++) {
      const row: number[] = [];
      const revRow: boolean[] = [];
      for (let c = 0; c < this.gridSize; c++) {
        const dist = Math.abs(r - this.targetR) + Math.abs(c - this.targetC);
        row.push(dist);
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
        this.grid[wr][wc] = WALL;
      }
    }

    // Target tile is distance 0 from itself
    this.grid[this.targetR][this.targetC] = 0;
  }

  private drawGrid(): void {
    for (let r = 0; r < this.gridSize; r++) {
      const row: Phaser.GameObjects.Rectangle[] = [];
      const textRow: Phaser.GameObjects.Text[] = [];
      for (let c = 0; c < this.gridSize; c++) {
        const x = this.gridLeft + c * TILE + TILE / 2;
        const y = GRID_TOP + r * TILE + TILE / 2;

        if (this.grid[r][c] === WALL) {
          // Wall
          this.add.rectangle(x, y, TILE - 1, TILE - 1, 0x3a3530).setStrokeStyle(1, 0x2a2520);
          row.push(null as any);
          textRow.push(null as any);
        } else {
          // Fog tile with subtle variation
          const fogShade = 0x1a1a2a + ((r * 3 + c * 7) % 8) * 0x010101;
          const tile = this.add.rectangle(x, y, TILE - 1, TILE - 1, fogShade);
          tile.setStrokeStyle(1, 0x2a2a3a, 0.3);
          // Tap to inspect (revealed) or remote-probe (unrevealed) — the
          // organizational-tools and Mastermind-probe pillars combined into
          // one unified click affordance.
          tile.setInteractive({ useHandCursor: true });
          const tr = r;
          const tc = c;
          tile.on('pointerdown', () => this.onTileTap(tr, tc));
          // Fog particle hint
          if (Math.random() < 0.15) {
            const mist = this.add.ellipse(x + Math.random() * 10 - 5, y, 12, 4, 0x3a3a4a, 0.15);
            this.tweens.add({ targets: mist, alpha: 0.05, duration: 2000, yoyo: true, repeat: -1 });
          }
          row.push(tile);

          const scentText = this.add.text(x, y, '', {
            fontFamily: 'Georgia, serif', fontSize: '15px', color: '#c4956a',
          }).setOrigin(0.5).setAlpha(0);
          textRow.push(scentText);
        }
      }
      this.tileSprites.push(row);
      this.scentTexts.push(textRow);
    }
  }

  /** Reveal a tile, displaying its exact Manhattan distance to the target.
      The bg color shifts on a continuous gradient from cold (far) to hot
      (close) so the player still has visual proximity feedback alongside
      the precise number. */
  revealTile(r: number, c: number): void {
    if (r < 0 || r >= this.gridSize || c < 0 || c >= this.gridSize) return;
    if (this.grid[r][c] === WALL || this.revealed[r][c]) return;

    this.revealed[r][c] = true;
    const tile = this.tileSprites[r][c];
    const text = this.scentTexts[r][c];
    if (!tile || !text) return;

    const dist = this.grid[r][c];
    // Continuous color gradient — closer = warmer. Map dist to a hue
    // bucket without quantizing the player's information.
    const maxDist = (this.gridSize - 1) * 2;
    const t = Math.max(0, Math.min(1, 1 - dist / maxDist));
    // Lerp from cold (dark blue 0x1a1a2a) to hot (warm orange 0x4a3a1a)
    const r1 = 0x1a + Math.floor((0x4a - 0x1a) * t);
    const g1 = 0x1a + Math.floor((0x3a - 0x1a) * t);
    const b1 = 0x2a + Math.floor((0x1a - 0x2a) * t);
    tile.setFillStyle((r1 << 16) | (g1 << 8) | b1);

    // Show the EXACT Manhattan distance — the doc's #2 pillar. A "5" is
    // a precise constraint: the target is exactly 5 cells away in any
    // taxicab direction.
    text.setText(String(dist));
    text.setAlpha(1);
    text.setColor(dist === 0 ? '#dda055' : '#c4956a');
  }

  /** Handle a tap on a non-wall tile. If revealed → show constraint ring.
      If unrevealed → spend a remote probe (if any). */
  onTileTap(r: number, c: number): void {
    if (this.finished || this.tutorialShowing) return;
    if (this.grid[r][c] === WALL) return;

    if (this.revealed[r][c]) {
      // Inspect — show the constraint ring for this tile's distance
      this.showConstraintRing(r, c, this.grid[r][c]);
      return;
    }

    // Unrevealed — try to spend a remote probe
    if (this.probesLeft <= 0) {
      this.flashOutOfProbes();
      return;
    }
    this.probesLeft--;
    this.probesText.setText(`Probes: ${this.probesLeft}`);
    playSfx('sniff', 0.35);
    this.revealTile(r, c);

    // Show the constraint ring immediately so the probe feels informative
    this.showConstraintRing(r, c, this.grid[r][c]);
  }

  /** Highlight every cell at exactly `distance` Manhattan steps from
      (centerR, centerC). The doc's organizational-tools pillar: lets the
      player visualize one constraint without solving the puzzle. */
  showConstraintRing(centerR: number, centerC: number, distance: number): void {
    // Clear any previous ring
    for (const o of this.constraintRingGfx) {
      try { o.destroy(); } catch {}
    }
    this.constraintRingGfx = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.grid[r][c] === WALL) continue;
        if (Math.abs(r - centerR) + Math.abs(c - centerC) !== distance) continue;
        const x = this.gridLeft + c * TILE + TILE / 2;
        const y = GRID_TOP + r * TILE + TILE / 2;
        const outline = this.add.rectangle(x, y, TILE - 4, TILE - 4)
          .setStrokeStyle(2, 0xc4956a, 0.85);
        outline.setDepth(8);
        this.constraintRingGfx.push(outline);
      }
    }
    // Fade out after a moment
    if (this.constraintRingGfx.length > 0) {
      this.tweens.add({
        targets: this.constraintRingGfx,
        alpha: 0,
        duration: 2200,
        delay: 600,
        onComplete: () => {
          for (const o of this.constraintRingGfx) {
            try { o.destroy(); } catch {}
          }
          this.constraintRingGfx = [];
        },
      });
    }
  }

  private flashOutOfProbes(): void {
    const t = this.add.text(GAME_WIDTH / 2, 80, 'Out of probes', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cc6666',
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, alpha: 0, duration: 800, onComplete: () => t.destroy() });
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

  moveCat(dx: number, dy: number): void {
    if (this.finished) return;
    const nc = this.catPos.c + dx;
    const nr = this.catPos.r + dy;
    if (nc < 0 || nc >= this.gridSize || nr < 0 || nr >= this.gridSize) return;
    if (this.grid[nr][nc] === WALL) return;

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
      haptic.success();
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
      haptic.error();
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, 'Out of moves!', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        if (!isPracticeRun()) eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
