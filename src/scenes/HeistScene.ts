import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { showMinigameTutorial } from '../ui/sceneHelpers';

interface Ring {
  notches: number;
  gapPos: number; // which notch is the gap
  rotation: number; // current rotation offset
  linkedTo: number; // -1 = none, else index of linked ring (rotates opposite)
  radius: number;
}

export class HeistScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private difficulty = 'easy';
  private rings: Ring[] = [];
  private timeLeft = 30;
  private finished = false;
  private tutorialShowing = false;
  private timerText!: Phaser.GameObjects.Text;
  private ringGfx!: Phaser.GameObjects.Graphics;

  constructor() { super({ key: 'HeistScene' }); }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    this.finished = false;
    this.rings = [];

    const ringCount = this.difficulty === 'hard' ? 5 : this.difficulty === 'medium' ? 4 : 3;
    const notches = this.difficulty === 'hard' ? 16 : this.difficulty === 'medium' ? 16 : 12;
    this.timeLeft = this.difficulty === 'hard' ? 20 : this.difficulty === 'medium' ? 25 : 30;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const stealth = cat?.stats?.stealth ?? 5;
    this.timeLeft += Math.floor(stealth * 0.5);

    // Generate rings
    for (let i = 0; i < ringCount; i++) {
      const n = notches - (i % 2 === 0 ? 0 : 2); // slight variation
      this.rings.push({
        notches: n,
        gapPos: Math.floor(Math.random() * n),
        rotation: Math.floor(Math.random() * n), // randomize start
        linkedTo: -1,
        radius: 50 + i * 28,
      });
    }

    // Add links on medium/hard
    if (this.difficulty === 'medium' || this.difficulty === 'hard') {
      this.rings[0].linkedTo = 1;
      if (this.difficulty === 'hard' && ringCount >= 4) {
        this.rings[2].linkedTo = 3;
      }
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0908');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    if (showMinigameTutorial(this, 'clowder_heist_tutorial', 'Pick the Lock',
      `Rotate the rings to align all gaps at the top.<br><br>
      Tap a ring to rotate it one notch clockwise.<br><br>
      Some rings are <strong>linked</strong> — rotating one moves its neighbor the opposite way!`,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Heist'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.timerText = this.add.text(GAME_WIDTH / 2, 55, `Time: ${this.timeLeft}s`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH - 30, 55, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Alignment indicator at top
    this.add.text(GAME_WIDTH / 2, 85, '\u25BC', {
      fontSize: '18px', color: '#dda055',
    }).setOrigin(0.5);

    // Lock graphics
    this.ringGfx = this.add.graphics();
    this.drawRings();

    // Touch input — detect which ring was tapped
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.finished || this.tutorialShowing) return;
      const wx = pointer.x / DPR;
      const wy = pointer.y / DPR;
      const cx = GAME_WIDTH / 2;
      const cy = 330;
      const dist = Math.sqrt((wx - cx) ** 2 + (wy - cy) ** 2);

      // Find which ring was tapped (outermost first)
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        if (Math.abs(dist - r.radius) < 18) {
          this.rotateRing(i, 1);
          break;
        }
      }
    });

    // Timer
    this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        if (this.finished || this.tutorialShowing) return;
        this.timeLeft--;
        this.timerText.setText(`Time: ${this.timeLeft}s`);
        if (this.timeLeft <= 0) this.endGame(false);
      },
    });

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  private rotateRing(idx: number, dir: number): void {
    const ring = this.rings[idx];
    ring.rotation = (ring.rotation + dir + ring.notches) % ring.notches;
    playSfx('tap', 0.3);

    // Rotate linked ring in opposite direction
    if (ring.linkedTo >= 0 && ring.linkedTo < this.rings.length) {
      const linked = this.rings[ring.linkedTo];
      linked.rotation = (linked.rotation - dir + linked.notches) % linked.notches;
    }

    this.drawRings();
    this.checkWin();
  }

  private drawRings(): void {
    this.ringGfx.clear();
    const cx = GAME_WIDTH / 2;
    const cy = 330;

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const segmentAngle = (Math.PI * 2) / ring.notches;
      const gapAngle = ((ring.gapPos + ring.rotation) % ring.notches) * segmentAngle - Math.PI / 2;

      // Draw ring segments
      const isLinked = ring.linkedTo >= 0;
      const color = isLinked ? 0x8b6ea6 : 0x6b5b3e;

      for (let n = 0; n < ring.notches; n++) {
        const startAngle = n * segmentAngle - Math.PI / 2 + 0.03;
        const endAngle = (n + 1) * segmentAngle - Math.PI / 2 - 0.03;
        const isGap = ((ring.gapPos + ring.rotation) % ring.notches) === n;

        if (!isGap) {
          this.ringGfx.lineStyle(8, color, 0.7);
          this.ringGfx.beginPath();
          this.ringGfx.arc(cx, cy, ring.radius, startAngle, endAngle, false);
          this.ringGfx.strokePath();
        } else {
          // Draw gap indicator
          this.ringGfx.lineStyle(8, 0xdda055, 0.4);
          this.ringGfx.beginPath();
          this.ringGfx.arc(cx, cy, ring.radius, startAngle, endAngle, false);
          this.ringGfx.strokePath();
        }
      }

      // Ring label
      this.ringGfx.fillStyle(0x8b7355, 0.5);
    }

    // Center keyhole
    this.ringGfx.fillStyle(0x1a1a1a);
    this.ringGfx.fillCircle(cx, cy, 20);
    this.ringGfx.fillStyle(0x2a2a2a);
    this.ringGfx.fillRect(cx - 4, cy - 15, 8, 20);
    this.ringGfx.fillCircle(cx, cy - 15, 6);
  }

  private checkWin(): void {
    // All gaps must be at the top (position 0 after rotation)
    for (const ring of this.rings) {
      const effectiveGap = (ring.gapPos + ring.rotation) % ring.notches;
      if (effectiveGap !== 0) return;
    }

    this.endGame(true);
  }

  private endGame(won: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (won) {
      playSfx('victory');
      const stars = this.timeLeft > 15 ? 3 : this.timeLeft > 8 ? 2 : 1;
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, 'Lock Picked!', {
        fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `heist_${this.difficulty}`, moves: 30 - this.timeLeft, minMoves: 5, stars,
          jobId: this.jobId, catId: this.catId,
        });
      });
    } else {
      playSfx('fail');
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, 'Time\'s up!', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
