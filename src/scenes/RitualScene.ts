import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { showMinigameTutorial } from '../ui/sceneHelpers';

const CANDLE_COLORS = [0xcc4444, 0x44aa44, 0x4488cc, 0xddaa33, 0xaa44cc, 0xcc8844];

export class RitualScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private difficulty = 'easy';
  private candleCount = 4;
  private sequence: number[] = [];
  private playerInput: number[] = [];
  private round = 0;
  private targetRounds = 6;
  private lives = 3;
  private phase: 'showing' | 'input' | 'done' = 'showing';
  private candles: { glow: Phaser.GameObjects.Arc; zone: Phaser.GameObjects.Zone; color: number }[] = [];
  private showIdx = 0;
  private finished = false;
  private tutorialShowing = false;
  private roundText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'RitualScene' }); }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    this.finished = false;
    this.sequence = [];
    this.playerInput = [];
    this.round = 0;
    this.showIdx = 0;
    this.candles = [];
    this.phase = 'showing';

    this.candleCount = this.difficulty === 'hard' ? 6 : this.difficulty === 'medium' ? 5 : 4;
    this.targetRounds = this.difficulty === 'hard' ? 8 : this.difficulty === 'medium' ? 7 : 6;
    this.lives = this.difficulty === 'hard' ? 2 : this.difficulty === 'medium' ? 2 : 3;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const charm = cat?.stats?.charm ?? 5;
    if (charm >= 7) this.lives++; // Grace from charm
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0908');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    if (showMinigameTutorial(this, 'clowder_ritual_tutorial', 'Sacred Ritual',
      `Watch the candles light up in sequence.<br><br>
      Then tap them back <strong>in the same order</strong>.<br><br>
      Each round adds one more step. Complete ${this.targetRounds} rounds to succeed!`,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Ritual'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.roundText = this.add.text(GAME_WIDTH / 2, 55, `Round: 0/${this.targetRounds}`, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
    }).setOrigin(0.5);

    // Progress bar
    this.add.rectangle(GAME_WIDTH / 2, 72, 200, 6, 0x2a2520).setStrokeStyle(1, 0x3a3530).setName('progressBg');
    this.add.rectangle(GAME_WIDTH / 2 - 100, 72, 0, 6, 0x4a8a4a).setOrigin(0, 0.5).setName('progressFill');

    this.livesText = this.add.text(20, 55, `Lives: ${this.lives}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cc6666',
    });

    this.add.text(GAME_WIDTH - 30, 55, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Altar background
    const altarY = 320;
    this.add.rectangle(GAME_WIDTH / 2, altarY + 60, 300, 40, 0x2a2520).setStrokeStyle(1, 0x3a3530);

    // Create candles in an arc
    const arcCx = GAME_WIDTH / 2;
    const arcCy = altarY;
    const arcR = 100;
    for (let i = 0; i < this.candleCount; i++) {
      const angle = Math.PI + (i / (this.candleCount - 1)) * Math.PI;
      const cx = arcCx + Math.cos(angle) * arcR;
      const cy = arcCy + Math.sin(angle) * arcR * 0.5;
      const color = CANDLE_COLORS[i % CANDLE_COLORS.length];

      // Candle body
      this.add.rectangle(cx, cy + 12, 10, 24, 0xd4c5a9).setStrokeStyle(1, 0x8b7355);

      // Flame/glow
      const glow = this.add.circle(cx, cy, 14, color, 0.15);
      const flame = this.add.circle(cx, cy, 6, color, 0.3);

      const zone = this.add.zone(cx, cy, 50, 60);
      zone.setInteractive({ useHandCursor: true });
      const idx = i;
      zone.on('pointerdown', () => this.onCandleTap(idx));

      this.candles.push({ glow, zone, color });

      // Idle flicker
      this.tweens.add({
        targets: flame, alpha: 0.15, duration: 1000 + Math.random() * 500,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // Status text
    this.add.text(GAME_WIDTH / 2, altarY + 120, 'Watch carefully...', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#6b5b3e',
    }).setOrigin(0.5).setName('statusText');

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');

    // Start first round after a delay
    this.time.delayedCall(this.tutorialShowing ? 100 : 1000, () => this.nextRound());
  }

  private nextRound(): void {
    if (this.finished || this.tutorialShowing) {
      this.time.delayedCall(500, () => this.nextRound());
      return;
    }
    this.round++;
    this.roundText.setText(`Round: ${this.round}/${this.targetRounds}`);
    const fill = this.children.getByName('progressFill') as Phaser.GameObjects.Rectangle;
    if (fill) fill.width = 200 * (this.round / this.targetRounds);
    this.playerInput = [];
    this.phase = 'showing';

    // Add one new step to the sequence
    this.sequence.push(Math.floor(Math.random() * this.candleCount));
    this.showIdx = 0;

    const statusText = this.children.getByName('statusText') as Phaser.GameObjects.Text;
    if (statusText) statusText.setText('Watch carefully...');

    // Play the sequence
    this.showNextInSequence();
  }

  private showNextInSequence(): void {
    if (this.showIdx >= this.sequence.length) {
      this.phase = 'input';
      const statusText = this.children.getByName('statusText') as Phaser.GameObjects.Text;
      if (statusText) statusText.setText('Your turn — tap the candles!');
      return;
    }

    const idx = this.sequence[this.showIdx];
    const candle = this.candles[idx];

    // Flash the candle — longer highlight for easier memorization
    candle.glow.setAlpha(0.9);
    candle.glow.setScale(1.3);
    playSfx('bell_chime', 0.35);
    this.time.delayedCall(700, () => {
      candle.glow.setAlpha(0.15);
      candle.glow.setScale(1);
      this.showIdx++;
      this.time.delayedCall(400, () => this.showNextInSequence());
    });
  }

  private onCandleTap(idx: number): void {
    if (this.phase !== 'input' || this.finished || this.tutorialShowing) return;

    const candle = this.candles[idx];
    candle.glow.setAlpha(0.6);
    this.time.delayedCall(200, () => candle.glow.setAlpha(0.15));

    this.playerInput.push(idx);
    const step = this.playerInput.length - 1;

    if (this.sequence[step] !== idx) {
      // Wrong!
      this.lives--;
      this.livesText.setText(`Lives: ${this.lives}`);
      playSfx('fail', 0.4);
      this.cameras.main.flash(100, 80, 30, 30);
      this.playerInput = [];
      this.phase = 'showing';

      if (this.lives <= 0) {
        this.endGame(false);
      } else {
        const statusText = this.children.getByName('statusText') as Phaser.GameObjects.Text;
        if (statusText) statusText.setText('Wrong! Watch again...');
        // Replay current sequence
        this.showIdx = 0;
        this.time.delayedCall(1000, () => this.showNextInSequence());
      }
      return;
    }

    playSfx('bell_chime', 0.3);

    // Correct — check if sequence complete
    if (this.playerInput.length === this.sequence.length) {
      playSfx('sparkle', 0.4);
      if (this.round >= this.targetRounds) {
        this.endGame(true);
      } else {
        this.time.delayedCall(800, () => this.nextRound());
      }
    }
  }

  private endGame(won: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (won) {
      playSfx('victory');
      const stars = this.lives >= 3 ? 3 : this.lives >= 2 ? 2 : 1;
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Ritual Complete!', {
        fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `ritual_${this.difficulty}`, moves: this.round, minMoves: this.targetRounds, stars,
          jobId: this.jobId, catId: this.catId,
        });
      });
    } else {
      playSfx('fail');
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'The ritual failed...', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
