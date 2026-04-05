import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { showMinigameTutorial } from '../ui/sceneHelpers';

const LANTERN_RADIUS = 18;

interface Lantern {
  x: number;
  y: number;
  brightness: number; // 0 (dark) to 1 (lit)
  dimRate: number;
  glow: Phaser.GameObjects.Arc;
  flame: Phaser.GameObjects.Arc;
  zone: Phaser.GameObjects.Zone;
  isTrap: boolean;
}

export class PatrolScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private difficulty = 'easy';
  private lanterns: Lantern[] = [];
  private lives = 4;
  private timeLeft = 40;
  private finished = false;
  private tutorialShowing = false;
  private livesText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'PatrolScene' }); }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    this.lanterns = [];
    this.finished = false;
    this.lives = this.difficulty === 'hard' ? 2 : this.difficulty === 'medium' ? 3 : 4;
    this.timeLeft = this.difficulty === 'hard' ? 30 : this.difficulty === 'medium' ? 35 : 40;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const endurance = cat?.stats?.endurance ?? 5;
    // Endurance slows dim rate
    this.timeLeft += Math.floor(endurance / 3);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0a14');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    if (showMinigameTutorial(this, 'clowder_patrol_tutorial', 'Night Patrol',
      `Keep the lanterns lit!<br><br>
      Tap a lantern to relight it before it goes dark.<br><br>
      If a lantern goes out, an intruder slips through.<br><br>
      <strong style="color:#cc6666">Red-flickering</strong> lanterns are traps — don't tap them!`,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Patrol'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.timerText = this.add.text(GAME_WIDTH / 2, 55, `Time: ${this.timeLeft}s`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
    }).setOrigin(0.5);

    this.livesText = this.add.text(20, 55, `Lives: ${this.lives}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cc6666',
    });

    // Quit
    this.add.text(GAME_WIDTH - 30, 55, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Create lanterns in a ring
    const count = this.difficulty === 'hard' ? 9 : this.difficulty === 'medium' ? 7 : 5;
    const cx = GAME_WIDTH / 2;
    const cy = 350;
    const ringRadius = 130;
    const trapChance = this.difficulty === 'hard' ? 0.2 : this.difficulty === 'medium' ? 0.1 : 0;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const lx = cx + Math.cos(angle) * ringRadius;
      const ly = cy + Math.sin(angle) * ringRadius;
      const isTrap = Math.random() < trapChance;
      const baseDim = this.difficulty === 'hard' ? 0.025 : this.difficulty === 'medium' ? 0.018 : 0.012;
      const dimRate = baseDim + Math.random() * 0.01;

      const glow = this.add.circle(lx, ly, LANTERN_RADIUS + 10, 0xdda055, 0.3);
      const flame = this.add.circle(lx, ly, LANTERN_RADIUS, isTrap ? 0xcc4444 : 0xdda055, 1);

      // Post
      this.add.rectangle(lx, ly + LANTERN_RADIUS + 8, 4, 16, 0x6b5b3e);

      const zone = this.add.zone(lx, ly, LANTERN_RADIUS * 3, LANTERN_RADIUS * 3);
      zone.setInteractive({ useHandCursor: true });

      const lantern: Lantern = { x: lx, y: ly, brightness: 1, dimRate, glow, flame, zone, isTrap };
      this.lanterns.push(lantern);

      // Trap lanterns flicker red
      if (isTrap) {
        this.tweens.add({
          targets: flame, alpha: 0.3, duration: 400, yoyo: true, repeat: -1,
        });
      }

      zone.on('pointerdown', () => {
        if (this.finished || this.tutorialShowing) return;
        if (isTrap) {
          this.lives--;
          this.livesText.setText(`Lives: ${this.lives}`);
          playSfx('fail', 0.4);
          this.cameras.main.flash(100, 80, 30, 30);
          // Remove trap
          lantern.brightness = 0;
          flame.setAlpha(0);
          glow.setAlpha(0);
          zone.disableInteractive();
          if (this.lives <= 0) this.gameOver(false);
        } else {
          lantern.brightness = 1;
          playSfx('tap', 0.3);
          // Flash bright on relight
          flame.setScale(1.4);
          glow.setAlpha(0.6);
          this.time.delayedCall(150, () => { flame.setScale(1); glow.setAlpha(0.3); });
        }
      });
    }

    // Dim timer
    this.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        if (this.finished || this.tutorialShowing) return;
        for (const l of this.lanterns) {
          if (l.isTrap || l.brightness <= 0) continue;
          l.brightness = Math.max(0, l.brightness - l.dimRate);
          l.flame.setAlpha(l.brightness);
          l.glow.setAlpha(l.brightness * 0.3);
          // Flash warning when low
          if (l.brightness < 0.3 && l.brightness > 0) {
            l.flame.setScale(0.8 + Math.sin(Date.now() * 0.01) * 0.2);
          } else {
            l.flame.setScale(1);
          }
          // Lantern went dark — lose a life
          if (l.brightness <= 0) {
            this.lives--;
            this.livesText.setText(`Lives: ${this.lives}`);
            playSfx('hiss', 0.3);
            l.brightness = 0.5; // Partially relight to give another chance
            if (this.lives <= 0) this.gameOver(false);
          }
        }
      },
    });

    // Countdown
    this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        if (this.finished || this.tutorialShowing) return;
        this.timeLeft--;
        this.timerText.setText(`Time: ${this.timeLeft}s`);
        if (this.timeLeft <= 0) this.gameOver(true);
      },
    });

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  private gameOver(won: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (won) {
      playSfx('victory');
      const stars = this.lives >= 3 ? 3 : this.lives >= 2 ? 2 : 1;
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Patrol Complete!', {
        fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `patrol_${this.difficulty}`, moves: 0, minMoves: 0, stars,
          jobId: this.jobId, catId: this.catId,
        });
      });
    } else {
      playSfx('fail');
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Intruders got through!', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
