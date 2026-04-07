import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { showMinigameTutorial } from '../ui/sceneHelpers';

interface Ring {
  notches: number;
  gapPos: number; // which notch is the gap
  rotation: number; // current rotation offset
  linkedTo: number; // -1 = none, else index of linked ring (rotates opposite)
  radius: number;
  /** Original rotation at scene init — used to reset on a trap-notch trigger. */
  startRotation: number;
  /** True when the gap is currently aligned to the top (effective gap === 0).
      Tracked explicitly so the scene can fire visual/audio "set" feedback
      and so the player gets a clear progress signal. */
  isSet: boolean;
  /** Notch indices that are TRAP notches. Rotating the ring such that a
      trap notch reaches the top position resets the ring to its starting
      rotation. Empty on easy/medium; populated on hard. The doc's
      "harder locks require different strategies" pillar in concrete form. */
  trapNotches: number[];
}

export class HeistScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  difficulty = 'easy';
  rings: Ring[] = [];
  private timeLeft = 30;
  finished = false;
  private tutorialShowing = false;
  private timerText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private setText!: Phaser.GameObjects.Text;
  private moveCount = 0;
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
      const gapPos = Math.floor(Math.random() * n);
      let rot = Math.floor(Math.random() * n);
      // Avoid spawning a ring already in the set position — would confuse
      // the "you set a tumbler" feedback if it fires before any input.
      if ((gapPos + rot) % n === 0) rot = (rot + 1) % n;
      this.rings.push({
        notches: n,
        gapPos,
        rotation: rot,
        startRotation: rot,
        linkedTo: -1,
        radius: 50 + i * 28,
        isSet: false,
        trapNotches: [],
      });
    }

    // Add links on medium/hard
    if (this.difficulty === 'medium' || this.difficulty === 'hard') {
      this.rings[0].linkedTo = 1;
      if (this.difficulty === 'hard' && ringCount >= 4) {
        this.rings[2].linkedTo = 3;
      }
    }

    // Hard difficulty: add trap notches. The doc's "harder locks require
    // different strategies, not just more of the same" — trap notches
    // change the gameplay from spam-clicking to careful path planning.
    if (this.difficulty === 'hard') {
      for (let i = 0; i < this.rings.length; i++) {
        const ring = this.rings[i];
        // Skip linked rings (the linking is already a strategic complication)
        if (ring.linkedTo >= 0) continue;
        // Pick 1-2 trap notches that are NOT the gap and NOT the starting
        // position (so the player can read the situation before stepping
        // into a trap on their first move)
        const candidates: number[] = [];
        for (let n = 0; n < ring.notches; n++) {
          if (n === ring.gapPos) continue;
          // Skip notches at the current top (player's first step is safe)
          const effective = (n + ring.rotation) % ring.notches;
          if (effective === 0) continue;
          candidates.push(n);
        }
        // Shuffle and pick 1-2
        for (let j = candidates.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [candidates[j], candidates[k]] = [candidates[k], candidates[j]];
        }
        const trapCount = Math.random() < 0.5 ? 2 : 1;
        ring.trapNotches = candidates.slice(0, trapCount);
      }
    }

    // Initial set-state pass — usually all false because of the avoidance
    // above, but compute it for safety.
    for (const ring of this.rings) {
      ring.isSet = ((ring.gapPos + ring.rotation) % ring.notches) === 0;
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0908');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial bumped to v2 — set feedback, counter-clockwise rotation,
    // and trap notches are all new mechanics returning players should know.
    if (showMinigameTutorial(this, 'clowder_heist_tutorial_v2', 'Pick the Lock',
      `Rotate the rings to align all gaps at the top.<br><br>
      Tap the <strong>right side</strong> of a ring to rotate clockwise, or the <strong>left side</strong> for counter-clockwise.<br><br>
      A satisfying click means a tumbler is <strong style="color:#dda055">set</strong>.<br><br>
      <strong style="color:#cc6666">Red trap notches</strong> reset the ring if you cross them. Plan your path!`,
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

    this.movesText = this.add.text(20, 55, 'Moves: 0', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    });

    // Tumbler progress text — shows how many rings are currently set so
    // the player has a clear progress signal without having to count rings.
    this.setText = this.add.text(GAME_WIDTH / 2, 75, `Set: 0/${this.rings.length}`, {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#dda055',
    }).setOrigin(0.5);

    // Alignment indicator at top
    this.add.text(GAME_WIDTH / 2, 85, '\u25BC', {
      fontSize: '18px', color: '#dda055',
    }).setOrigin(0.5);

    // Lock graphics
    this.ringGfx = this.add.graphics();
    this.drawRings();

    // Touch input — detect which ring was tapped, and which side (left =
    // counter-clockwise, right = clockwise). Per the doc's "skill expression"
    // pillar: lets the player choose the shorter rotation path.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.finished || this.tutorialShowing) return;
      const wx = pointer.worldX;
      const wy = pointer.worldY;
      const cx = GAME_WIDTH / 2;
      const cy = 330;
      const dist = Math.sqrt((wx - cx) ** 2 + (wy - cy) ** 2);

      // Find which ring was tapped (outermost first)
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        if (Math.abs(dist - r.radius) < 20) {
          // Direction from tap position relative to ring center: tap on
          // the right side (wx > cx) → clockwise (+1), left → counter-
          // clockwise (-1).
          const dir = wx >= cx ? 1 : -1;
          this.rotateRing(i, dir);
          // Flash the tapped ring
          this.ringGfx.lineStyle(10, 0xdda055, 0.4);
          this.ringGfx.beginPath();
          this.ringGfx.arc(cx, cy, r.radius, 0, Math.PI * 2);
          this.ringGfx.strokePath();
          this.time.delayedCall(100, () => this.drawRings());
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

  rotateRing(idx: number, dir: number): void {
    const ring = this.rings[idx];
    const oldSet = ring.isSet;
    ring.rotation = (ring.rotation + dir + ring.notches) % ring.notches;
    this.moveCount++;
    this.movesText.setText(`Moves: ${this.moveCount}`);

    // Trap-notch check: if a trap notch landed at the top position after
    // rotation, this ring resets to its starting rotation. The doc's
    // "trap mechanics that punish naive extension" pillar.
    let trapTriggered = false;
    for (const trap of ring.trapNotches) {
      const effective = (trap + ring.rotation) % ring.notches;
      if (effective === 0) {
        trapTriggered = true;
        break;
      }
    }
    if (trapTriggered) {
      ring.rotation = ring.startRotation;
      ring.isSet = ((ring.gapPos + ring.rotation) % ring.notches) === 0;
      playSfx('fail', 0.4);
      haptic.error();
      this.cameras.main.flash(120, 80, 30, 30);
    } else {
      // Update set state and play context-appropriate audio. The doc's
      // "audio is primary" pillar: distinct sounds for set vs nudge.
      ring.isSet = ((ring.gapPos + ring.rotation) % ring.notches) === 0;
      if (!oldSet && ring.isSet) {
        // Just clicked into place — high-pitched satisfying sound
        playSfx('sparkle', 0.5);
        haptic.medium();
      } else if (oldSet && !ring.isSet) {
        // Slipped out of place — soft "uh" feedback
        playSfx('lock_click', 0.6);
        haptic.warning();
      } else {
        // Normal nudge — standard click
        playSfx('lock_click', 0.35);
        haptic.light();
      }
    }

    // Rotate linked ring in opposite direction
    if (ring.linkedTo >= 0 && ring.linkedTo < this.rings.length) {
      const linked = this.rings[ring.linkedTo];
      const linkedOldSet = linked.isSet;
      linked.rotation = (linked.rotation - dir + linked.notches) % linked.notches;
      linked.isSet = ((linked.gapPos + linked.rotation) % linked.notches) === 0;
      // Audio cue when the linked ring's set state flips
      if (!linkedOldSet && linked.isSet) {
        playSfx('sparkle', 0.4);
      }
    }

    this.updateSetText();
    this.drawRings();
    this.checkWin();
  }

  /** Helper for the playtest: returns the count of currently-set rings. */
  countSetRings(): number {
    return this.rings.filter((r) => r.isSet).length;
  }

  private updateSetText(): void {
    const setCount = this.countSetRings();
    this.setText.setText(`Set: ${setCount}/${this.rings.length}`);
  }

  private drawRings(): void {
    this.ringGfx.clear();
    const cx = GAME_WIDTH / 2;
    const cy = 330;

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const segmentAngle = (Math.PI * 2) / ring.notches;

      // Color depends on state: set rings get a gold tint to make progress
      // visible at a glance, linked rings get purple, otherwise tan.
      const isLinked = ring.linkedTo >= 0;
      const baseColor = ring.isSet ? 0xdda055 : (isLinked ? 0x8b6ea6 : 0x6b5b3e);
      const baseAlpha = ring.isSet ? 0.95 : 0.7;

      for (let n = 0; n < ring.notches; n++) {
        const startAngle = n * segmentAngle - Math.PI / 2 + 0.03;
        const endAngle = (n + 1) * segmentAngle - Math.PI / 2 - 0.03;
        const effective = (ring.gapPos + ring.rotation) % ring.notches;
        const isGap = effective === n;
        const isTrap = ring.trapNotches.includes(n);

        if (isGap) {
          // Gap indicator — bright when set, dim when not
          this.ringGfx.lineStyle(8, 0xdda055, ring.isSet ? 0.85 : 0.4);
        } else if (isTrap) {
          // Trap notch — red so the player can spot the danger
          this.ringGfx.lineStyle(8, 0xcc4444, 0.85);
        } else {
          this.ringGfx.lineStyle(8, baseColor, baseAlpha);
        }
        this.ringGfx.beginPath();
        this.ringGfx.arc(cx, cy, ring.radius, startAngle, endAngle, false);
        this.ringGfx.strokePath();
      }
    }

    // Center keyhole
    this.ringGfx.fillStyle(0x1a1a1a);
    this.ringGfx.fillCircle(cx, cy, 20);
    this.ringGfx.fillStyle(0x2a2a2a);
    this.ringGfx.fillRect(cx - 4, cy - 15, 8, 20);
    this.ringGfx.fillCircle(cx, cy - 15, 6);
  }

  checkWin(): void {
    // Win when every ring is set (gap at the top). The set state is now
    // the source of truth — set transitions are tracked when rotations
    // happen so this is just a final tally.
    if (this.countSetRings() === this.rings.length) {
      this.endGame(true);
    }
  }

  private endGame(won: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (won) {
      playSfx('lock_open', 0.6);
      haptic.success();
      this.time.delayedCall(500, () => playSfx('victory'));
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
      haptic.error();
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
